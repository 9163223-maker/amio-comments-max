'use strict';

const Module = require('module');

const RUNTIME = 'CC6.5.6.5-REGISTER-POST-DEBUG';
const SOURCE = 'adminkit-CC6.5.6.5-manual-ak-posts-registration';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function clean(value) {
  return String(value || '').trim();
}

function adminOk(req, res) {
  const expected = clean(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || process.env.MODERATION_ADMIN_TOKEN || '');
  if (!expected) return true;
  const bearer = clean(req.get && req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const token = clean(req.query?.token || req.query?.adminToken || req.get?.('x-admin-token') || bearer || '');
  if (token === expected) return true;
  noCache(res);
  res.status(403).json({ ok: false, runtimeVersion: RUNTIME, error: 'admin_forbidden' });
  return false;
}

function parseCommentKey(value = '') {
  const raw = clean(value);
  if (!raw) return { channelId: '', postId: '', commentKey: '' };
  const decoded = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
  const match = decoded.match(/(-?\d+)\s*[:_]\s*(-?\d{3,})/);
  if (match) {
    return { channelId: match[1], postId: match[2], commentKey: `${match[1]}:${match[2]}` };
  }
  return { channelId: '', postId: decoded, commentKey: '' };
}

async function registerPostFromQuery(req) {
  const db = require('./cc5-db-core');
  const store = require('./store');
  const adminId = clean(req.query?.adminId || req.query?.admin || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  const parsed = parseCommentKey(req.query?.commentKey || req.query?.k || '');
  const channelId = clean(req.query?.channelId || req.query?.channel || parsed.channelId || '');
  const postId = clean(req.query?.postId || req.query?.post || parsed.postId || '');
  const title = clean(req.query?.title || req.query?.text || postId || 'Пост');
  const messageId = clean(req.query?.messageId || req.query?.mid || '');
  const commentKey = clean(req.query?.commentKey || req.query?.k || (channelId && postId ? `${channelId}:${postId}` : parsed.commentKey));
  const channelTitle = clean(req.query?.channelTitle || req.query?.chatTitle || 'АдминКит клуб');

  if (!adminId || !channelId || !postId) {
    return {
      ok: false,
      runtimeVersion: RUNTIME,
      error: 'required_params_missing',
      required: ['adminId optional', 'channelId', 'postId'],
      received: { adminId, channelId, postId, commentKey, title }
    };
  }

  await db.init();
  const result = await db.upsertPost(adminId, channelId, postId, title, {
    source: 'manual_debug_register',
    commentKey,
    channelTitle,
    title,
    registeredAt: new Date().toISOString(),
    runtimeVersion: RUNTIME
  }, messageId);

  try {
    store.savePost(commentKey || `${channelId}:${postId}`, {
      channelId,
      postId,
      messageId,
      originalText: title,
      title,
      channelTitle,
      commentKey: commentKey || `${channelId}:${postId}`,
      source: 'manual_debug_register',
      runtimeVersion: RUNTIME
    });
  } catch {}

  const posts = await db.getPosts(adminId, channelId, 20);
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    registered: result,
    postsFoundForChannel: posts.length,
    posts: posts.slice(0, 10)
  };
}

function install() {
  if (Module._load.__adminkitRegisterPostDebug) return selfTest();
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitRegisterPostDebugWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitRegisterPostDebug) {
          app.__adminkitRegisterPostDebug = true;
          app.get('/debug/register-post', async (req, res) => {
            if (!adminOk(req, res)) return;
            noCache(res);
            try {
              const result = await registerPostFromQuery(req);
              res.status(result.ok ? 200 : 400).json(result);
            } catch (error) {
              res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error || 'register_failed') });
            }
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitRegisterPostDebugWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitRegisterPostDebug = true;
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    endpoint: '/debug/register-post?token=admin&channelId=...&postId=...&title=...',
    purpose: 'manual bridge into ak_posts when a fresh channel post was not delivered to bot webhook'
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, registerPostFromQuery };
