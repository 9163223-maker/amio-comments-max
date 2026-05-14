'use strict';

// V4 DB helper without client-side duplicate banner creation.
// This module only exposes DB meta and saves current admin menu id.
// It must not create or delete banner DOM nodes in the mini-app.

const RUNTIME = 'CC6.7.9-V4-DB-HELPER-META-RESOLVE';
const MARKER = '__ADMINKIT_V4_DB_HELPER_META_RESOLVE_679__';

let status = { installed: false, routeInstalled: false, menuPatched: false, error: '', at: '' };

function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}
function cut(v, n = 260) {
  const s = clean(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function isBadTitle(v) {
  const s = clean(v);
  return !s || /^загрузка/i.test(s) || /^-?\d{8,}$/.test(s) || /^[a-f0-9]{16,}$/i.test(s);
}
function pickTitle(row = {}) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const candidates = [
    raw.originalText,
    raw.text,
    raw.caption,
    raw.body && raw.body.text,
    row.title,
    raw.title,
    raw.postText,
    row.post_id,
    row.postId
  ];
  for (const item of candidates) {
    const s = cut(item, 260);
    if (!isBadTitle(s) && !/админкит|главное меню|выберите|статус:/i.test(s)) return s;
  }
  return row.post_id || row.postId ? `Пост ${row.post_id || row.postId}` : 'Пост';
}
function paramsFromReq(req) {
  const q = req.query || {};
  return {
    commentKey: clean(q.commentKey || q.key || ''),
    handoff: clean(q.handoff || q.startapp || q.start_param || q.WebAppStartParam || ''),
    channelId: clean(q.channelId || q.channel || ''),
    postId: clean(q.postId || q.post_id || q.messageId || '')
  };
}

async function getPostMeta(input = '') {
  const params = typeof input === 'object' && input ? input : { commentKey: clean(input) };
  const commentKey = clean(params.commentKey);
  const handoff = clean(params.handoff);
  const channelId = clean(params.channelId);
  const postId = clean(params.postId);
  if (!commentKey && !handoff && !(channelId && postId) && !postId) return null;
  try {
    const state = require('./db-v3-state');
    const db = require('./cc5-db-core');
    await state.ensure();
    const { rows } = await db.query(`
      select
        p.channel_id,
        p.post_id,
        p.message_id,
        p.comment_key,
        p.title,
        p.raw,
        c.title as channel_title,
        coalesce(s.comments_enabled, true) as comments_enabled,
        coalesce(s.comments_photo, true) as comments_photo,
        coalesce(s.comments_reactions, true) as comments_reactions,
        coalesce(s.comments_banner, true) as comments_banner,
        coalesce(nullif(s.comments_banner_text,''), '') as comments_banner_text,
        coalesce(nullif(s.comments_banner_button,''), '') as comments_banner_button,
        coalesce(nullif(s.comments_banner_link,''), '') as comments_banner_link
      from ak_posts p
      left join ak_channels c on c.channel_id = p.channel_id
      left join lateral (
        select * from ak_post_settings s0
        where s0.comment_key = p.comment_key
        order by s0.updated_at desc
        limit 1
      ) s on true
      where
        ($1 <> '' and p.comment_key = $1)
        or ($2 <> '' and (
          p.raw->>'handoffToken' = $2
          or p.raw->>'handoff' = $2
          or p.raw->>'startapp' = $2
          or p.raw->>'start_param' = $2
        ))
        or ($3 <> '' and $4 <> '' and p.channel_id = $3 and p.post_id = $4)
        or ($4 <> '' and (p.post_id = $4 or p.message_id = $4))
      order by
        case
          when $1 <> '' and p.comment_key = $1 then 1
          when $2 <> '' and (p.raw->>'handoffToken' = $2 or p.raw->>'handoff' = $2) then 2
          when $3 <> '' and $4 <> '' and p.channel_id = $3 and p.post_id = $4 then 3
          when $4 <> '' and (p.post_id = $4 or p.message_id = $4) then 4
          else 9
        end,
        p.updated_at desc
      limit 1
    `, [commentKey, handoff, channelId, postId]);
    const row = rows[0];
    if (!row) return null;
    const customButtonText = clean(row.comments_banner_button || row.comments_banner_text || '');
    return {
      commentKey: row.comment_key,
      channelId: row.channel_id,
      channelTitle: clean(row.channel_title) || 'Подключённый канал',
      postId: row.post_id,
      messageId: row.message_id,
      postTitle: pickTitle(row),
      commentsEnabled: row.comments_enabled !== false,
      commentsPhoto: row.comments_photo !== false,
      commentsReactions: row.comments_reactions !== false,
      banner: {
        enabled: row.comments_banner !== false,
        // UI rule: first chip is always static "Начало обсуждения".
        // This text is only a compatibility source for the dynamic second chip.
        text: customButtonText,
        button: customButtonText,
        link: clean(row.comments_banner_link)
      },
      resolvedBy: commentKey ? 'commentKey' : (handoff ? 'handoff' : (channelId && postId ? 'channelId+postId' : 'postId'))
    };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitV4DbHelperMetaResolveRoutes) return app;
  app.__adminkitV4DbHelperMetaResolveRoutes = true;
  app.get('/api/adminkit/post-meta', async (req, res) => {
    noCache(res);
    const params = paramsFromReq(req);
    const meta = await getPostMeta(params);
    if (!meta || meta.error) return res.json({ ok: !meta?.error, runtimeVersion: RUNTIME, params, meta: meta || null, error: meta?.error || '' });
    return res.json({ ok: true, runtimeVersion: RUNTIME, params, meta });
  });
  return app;
}

function looksLikeAdminMenu(args = {}) {
  const text = clean(args.text);
  const attachments = Array.isArray(args.attachments) ? args.attachments : [];
  const hasKeyboard = attachments.some(a => a?.type === 'inline_keyboard');
  return hasKeyboard && /АдминКИТ|Главное|Каналы|Комментарии|Подарки|Кнопки|Модерация|Выбрать пост|Баннер|Ввод|Сохранено/i.test(text);
}
function getResultMessageId(result) {
  return clean(result?.message_id || result?.messageId || result?.id || result?.message?.id || result?.message?.message_id || '');
}
async function saveMenuIds(args = {}, result = {}) {
  const id = getResultMessageId(result);
  if (!id) return;
  try {
    const state = require('./db-v3-state');
    const owners = [...new Set([args.userId, args.chatId, 'global'].map(clean).filter(Boolean))];
    for (const owner of owners) await state.setMenu(owner, id);
  } catch {}
}
function installMenuSaver() {
  try {
    const api = require('./services/maxApi');
    if (!api || typeof api.sendMessage !== 'function' || api.sendMessage.__adminkitV4MenuSaverMetaResolve) return false;
    const originalSend = api.sendMessage.bind(api);
    api.sendMessage = async function adminkitV4MenuSaverMetaResolve(args = {}) {
      const result = await originalSend(args);
      if (looksLikeAdminMenu(args)) await saveMenuIds(args, result);
      return result;
    };
    api.sendMessage.__adminkitV4MenuSaverMetaResolve = true;
    return true;
  } catch { return false; }
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  try {
    const Module = require('module');
    if (!Module.__adminkitV4DbHelperMetaResolveExpressWrap) {
      Module.__adminkitV4DbHelperMetaResolveExpressWrap = true;
      const oldLoad = Module._load;
      Module._load = function adminkitV4DbHelperMetaResolveLoad(request, parent, isMain) {
        const loaded = oldLoad.apply(this, arguments);
        if (String(request) !== 'express' || !loaded || loaded.__adminkitV4DbHelperMetaResolveWrapped) return loaded;
        function wrappedExpress(...args) { const app = loaded(...args); return installRoutes(app); }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitV4DbHelperMetaResolveWrapped = true;
        return wrappedExpress;
      };
    }
    const menuPatched = installMenuSaver();
    status = { installed: true, routeInstalled: true, menuPatched, error: '', at: new Date().toISOString() };
  } catch (error) {
    status = { installed: false, routeInstalled: false, menuPatched: false, error: error?.message || String(error), at: new Date().toISOString() };
  }
  return selfTest(false);
}
function selfTest(already = false) {
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already, status, endpoints: ['/api/adminkit/post-meta'], policy: 'server_meta_resolves_by_commentKey_handoff_channelPost_or_postId_no_client_banner_dom' };
}

module.exports = { RUNTIME, MARKER, install, selfTest, getPostMeta };
