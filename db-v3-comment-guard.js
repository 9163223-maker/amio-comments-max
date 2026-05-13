'use strict';

const state = require('./db-v3-state');

const RUNTIME = 'DB-V3-COMMENT-GUARD-1.0';
const MARKER = '__DB_V3_COMMENT_GUARD__';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const lower = (v) => clean(v).toLowerCase();

function pathText(path) {
  if (Array.isArray(path)) return path.map(pathText).join(' ');
  if (path instanceof RegExp) return String(path);
  return String(path || '');
}
function isCommentMutation(path) {
  const s = pathText(path).toLowerCase();
  return s.includes('/api/comments') || s.includes('comments');
}
function isModeratedWrite(req) {
  const p = String(req.path || req.originalUrl || req.url || '').toLowerCase();
  if (p.includes('upload') || p.includes('attachment')) return false;
  const b = req.body || {};
  return !!clean(b.text || b.comment || b.message || b.body?.text || '');
}
function commentKeyFrom(req) {
  const b = req.body || {};
  const q = req.query || {};
  const p = req.params || {};
  return clean(b.commentKey || b.comment_key || q.commentKey || q.comment_key || p.commentKey || p.comment_key || p.key || q.key || b.key || '');
}
function commentTextFrom(req) {
  const b = req.body || {};
  return clean(b.text || b.comment || b.message || b.body?.text || '');
}
function countLinks(text) {
  return (String(text || '').match(/(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg|wa\.me|chat\.whatsapp\.com)/giu) || []).length;
}
function publicBlock(res, code, message, data = {}) {
  return res.status(403).json({ ok: false, error: code, message, publicMessage: message, runtimeVersion: RUNTIME, data });
}
async function check(req, res, next) {
  const key = commentKeyFrom(req);
  if (!key) return next();
  let policy;
  try { policy = await state.commentPolicy(key); }
  catch (error) { console.warn('[db-v3-comment-guard] policy read failed:', error?.message || error); return next(); }
  if (policy && policy.commentsEnabled === false) {
    return publicBlock(res, 'comments_disabled', 'Комментарии к этому посту выключены.', { commentKey: key, source: 'Postgres ak_post_settings' });
  }
  if (!isModeratedWrite(req)) return next();
  if (!policy || policy.moderationEnabled === false) return next();
  const text = commentTextFrom(req);
  const l = lower(text);
  const words = Array.isArray(policy.customBlocklist) ? policy.customBlocklist.map(lower).filter(Boolean) : [];
  const matchedWords = words.filter((w) => w && l.includes(w));
  const reasons = [];
  if (matchedWords.length) reasons.push('stopwords_match');
  if (policy.blockLinks && countLinks(text) > 0) reasons.push('links_blocked');
  if (policy.blockInvites !== false && /(t\.me\/|telegram\.me\/|discord\.gg|chat\.whatsapp\.com|joinchat|invite)/iu.test(text)) reasons.push('invite_link');
  if (!reasons.length) return next();
  return publicBlock(res, 'moderation_blocked', 'Комментарий не опубликован: сработала модерация.', { commentKey: key, reasons, matchedWords, source: 'Postgres ak_moderation_rules' });
}
function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const Module = require('module');
  const oldLoad = Module._load;
  Module._load = function dbV3CommentGuardLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__dbV3CommentGuardWrapped) return loaded;
    function wrappedExpress(...args) {
      const app = loaded(...args);
      if (!app || app.__dbV3CommentGuardAppWrapped) return app;
      app.__dbV3CommentGuardAppWrapped = true;
      try {
        app.get('/debug/db-comment-guard', (req, res) => res.json(selfTest(false)));
      } catch {}
      ['post', 'put', 'patch'].forEach((method) => {
        const old = app[method]?.bind(app);
        if (!old) return;
        app[method] = function dbV3CommentGuardRoute(path, ...handlers) {
          if (!isCommentMutation(path)) return old(path, ...handlers);
          return old(path, check, ...handlers);
        };
      });
      return app;
    }
    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__dbV3CommentGuardWrapped = true;
    return wrappedExpress;
  };
  return selfTest(false);
}
function selfTest(already = false) {
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already, source: 'Postgres', checks: ['comments_enabled', 'custom_stopwords', 'links', 'invites'], storeUsed: false };
}
module.exports = { RUNTIME, MARKER, install, selfTest };
