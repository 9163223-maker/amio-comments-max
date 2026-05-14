'use strict';

// V4 DB helper: direct Postgres resolver for comments mini-app.
// Source of truth is DB only. No store/history as decision source.

const RUNTIME = 'CC6.8.0-V4-DB-DIRECT-POST-META';
const MARKER = '__ADMINKIT_V4_DB_DIRECT_POST_META_680__';

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
function cut(v, n = 320) {
  const s = clean(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function safeDecode(v) {
  let s = String(v || '');
  for (let i = 0; i < 5; i += 1) {
    try {
      const d = decodeURIComponent(s.replace(/\+/g, '%20'));
      if (d === s) break;
      s = d;
    } catch { break; }
  }
  return s;
}
function uniq(list) {
  return [...new Set((list || []).map(clean).filter(Boolean))];
}
function isBadTitle(v) {
  const s = clean(v);
  return !s || /^загрузка/i.test(s) || /^loading/i.test(s) || /^-?\d{8,}$/.test(s) || /^[a-f0-9]{16,}$/i.test(s);
}
function pickTitle(row = {}) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const candidates = [
    raw.originalText,
    raw.original_text,
    raw.text,
    raw.caption,
    raw.body && raw.body.text,
    raw.message && raw.message.text,
    raw.postText,
    raw.post_text,
    row.title,
    raw.title
  ];
  for (const item of candidates) {
    const s = cut(item, 320);
    if (!isBadTitle(s) && !/админкит|главное меню|выберите|статус:/i.test(s)) return s;
  }
  const postId = clean(row.post_id || row.postId || row.message_id || row.messageId);
  return postId ? `Пост ${postId}` : 'Пост';
}
function paramsFromReq(req) {
  const q = req.query || {};
  return normalizeParams({
    commentKey: q.commentKey || q.key || '',
    handoff: q.handoff || q.startapp || q.start_param || q.WebAppStartParam || '',
    channelId: q.channelId || q.channel || '',
    postId: q.postId || q.post_id || q.messageId || '',
    raw: [req.url, req.originalUrl, q.raw].filter(Boolean).join(' ')
  });
}
function normalizeParams(input = {}) {
  const rawParts = [];
  const addRaw = (v) => { if (clean(v)) rawParts.push(clean(v), safeDecode(v)); };
  addRaw(input.commentKey);
  addRaw(input.handoff);
  addRaw(input.channelId);
  addRaw(input.postId);
  addRaw(input.raw);

  let commentKey = clean(input.commentKey);
  let handoff = clean(input.handoff);
  let channelId = clean(input.channelId);
  let postId = clean(input.postId);

  for (const raw of rawParts) {
    const s = safeDecode(raw);
    if (!commentKey) {
      const ck = s.match(/-?\d{6,}:-?\d{3,}/);
      if (ck) commentKey = ck[0];
    }
    if (!handoff) {
      const h = s.match(/h_[A-Za-z0-9_-]{6,}/);
      if (h) handoff = h[0];
    }
    if (!postId) {
      const tagged = s.match(/(?:post|postId|post_id|messageId)[:=](-?\d{3,})/i);
      if (tagged) postId = tagged[1];
    }
    if (!postId) {
      const numeric = s.match(/-?\d{8,}/);
      if (numeric) postId = numeric[0];
    }
  }

  if (commentKey && commentKey.includes(':')) {
    const [ch, post] = commentKey.split(':');
    if (!channelId && ch) channelId = clean(ch);
    if (!postId && post) postId = clean(post);
  }

  const keys = uniq([commentKey, handoff, clean(input.startapp), ...rawParts]);
  const likeKeys = keys
    .filter(v => v.length >= 4 && v.length <= 300)
    .map(v => `%${v.replace(/[%_]/g, '\\$&')}%`);

  return { commentKey, handoff, channelId, postId, keys, likeKeys };
}

async function getPostMeta(input = '') {
  const params = typeof input === 'object' && input ? normalizeParams(input) : normalizeParams({ commentKey: clean(input) });
  const { channelId, postId, keys, likeKeys } = params;
  if (!keys.length && !postId && !channelId) return null;

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
           or (s0.channel_id = p.channel_id and s0.post_id = p.post_id)
        order by s0.updated_at desc
        limit 1
      ) s on true
      where
        (coalesce(array_length($1::text[], 1), 0) > 0 and p.comment_key = any($1::text[]))
        or ($2 <> '' and $3 <> '' and p.channel_id = $2 and (p.post_id = $3 or p.message_id = $3))
        or ($3 <> '' and (p.post_id = $3 or p.message_id = $3))
        or (coalesce(array_length($4::text[], 1), 0) > 0 and p.raw::text ilike any($4::text[]))
      order by
        case
          when coalesce(array_length($1::text[], 1), 0) > 0 and p.comment_key = any($1::text[]) then 1
          when $2 <> '' and $3 <> '' and p.channel_id = $2 and (p.post_id = $3 or p.message_id = $3) then 2
          when $3 <> '' and (p.post_id = $3 or p.message_id = $3) then 3
          when coalesce(array_length($4::text[], 1), 0) > 0 and p.raw::text ilike any($4::text[]) then 4
          else 9
        end,
        p.updated_at desc
      limit 1
    `, [keys, channelId, postId, likeKeys]);

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
        text: customButtonText,
        button: customButtonText,
        link: clean(row.comments_banner_link)
      },
      resolvedBy: row.comment_key && keys.includes(row.comment_key) ? 'commentKey' : (postId ? 'postId' : 'rawText'),
      source: 'Postgres ak_posts + ak_post_settings'
    };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitV4DbDirectPostMetaRoutes) return app;
  app.__adminkitV4DbDirectPostMetaRoutes = true;

  app.get('/api/adminkit/post-meta', async (req, res) => {
    noCache(res);
    const params = paramsFromReq(req);
    const meta = await getPostMeta(params);
    if (!meta || meta.error) {
      return res.json({ ok: !meta?.error, runtimeVersion: RUNTIME, params, meta: meta || null, error: meta?.error || '' });
    }
    return res.json({ ok: true, runtimeVersion: RUNTIME, params, meta });
  });

  app.get('/debug/post-meta', async (req, res) => {
    noCache(res);
    const params = paramsFromReq(req);
    const meta = await getPostMeta(params);
    return res.json({ ok: Boolean(meta && !meta.error), runtimeVersion: RUNTIME, params, meta: meta || null, error: meta?.error || '' });
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
    if (!api || typeof api.sendMessage !== 'function' || api.sendMessage.__adminkitV4MenuSaverDirectPostMeta) return false;
    const originalSend = api.sendMessage.bind(api);
    api.sendMessage = async function adminkitV4MenuSaverDirectPostMeta(args = {}) {
      const result = await originalSend(args);
      if (looksLikeAdminMenu(args)) await saveMenuIds(args, result);
      return result;
    };
    api.sendMessage.__adminkitV4MenuSaverDirectPostMeta = true;
    return true;
  } catch { return false; }
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  try {
    const Module = require('module');
    if (!Module.__adminkitV4DbDirectPostMetaExpressWrap) {
      Module.__adminkitV4DbDirectPostMetaExpressWrap = true;
      const oldLoad = Module._load;
      Module._load = function adminkitV4DbDirectPostMetaLoad(request, parent, isMain) {
        const loaded = oldLoad.apply(this, arguments);
        if (String(request) !== 'express' || !loaded || loaded.__adminkitV4DbDirectPostMetaWrapped) return loaded;
        function wrappedExpress(...args) { const app = loaded(...args); return installRoutes(app); }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitV4DbDirectPostMetaWrapped = true;
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
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    already,
    status,
    endpoints: ['/api/adminkit/post-meta', '/debug/post-meta'],
    policy: 'direct_postgres_post_meta_no_store_no_history'
  };
}

module.exports = { RUNTIME, MARKER, install, selfTest, getPostMeta };
