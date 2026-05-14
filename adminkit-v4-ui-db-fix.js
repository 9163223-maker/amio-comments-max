'use strict';

// V4 DB helper without client-side duplicate banner creation.
// This module only exposes DB meta and saves current admin menu id.
// It must not create or delete banner DOM nodes in the mini-app.

const RUNTIME = 'CC6.7.8-V4-DB-HELPER-NO-BANNER-DOM';
const MARKER = '__ADMINKIT_V4_DB_HELPER_NO_BANNER_DOM_678__';

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
function cut(v, n = 120) {
  const s = clean(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function isBadTitle(v) {
  const s = clean(v);
  return !s || /^загрузка/i.test(s) || /^-?\d{8,}$/.test(s) || /^[a-f0-9]{16,}$/i.test(s);
}
function pickTitle(row = {}) {
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  const candidates = [row.title, raw.title, raw.originalText, raw.text, raw.caption, raw.body?.text, row.post_id, row.postId];
  for (const item of candidates) {
    const s = cut(item, 120);
    if (!isBadTitle(s) && !/админкит|главное меню|выберите|статус:/i.test(s)) return s;
  }
  return row.post_id || row.postId ? `Пост ${row.post_id || row.postId}` : 'Пост';
}

async function getPostMeta(commentKey = '') {
  const key = clean(commentKey);
  if (!key) return null;
  try {
    const state = require('./db-v3-state');
    const db = require('./cc5-db-core');
    await state.ensure();
    const { rows } = await db.query(`
      select
        p.channel_id,
        p.post_id,
        p.comment_key,
        p.title,
        p.raw,
        c.title as channel_title,
        coalesce(s.comments_enabled, true) as comments_enabled,
        coalesce(s.comments_photo, true) as comments_photo,
        coalesce(s.comments_reactions, true) as comments_reactions,
        coalesce(s.comments_banner, true) as comments_banner,
        coalesce(nullif(s.comments_banner_text,''), 'Начало обсуждения') as comments_banner_text,
        coalesce(nullif(s.comments_banner_button,''), '') as comments_banner_button,
        coalesce(nullif(s.comments_banner_link,''), '') as comments_banner_link
      from ak_posts p
      left join ak_channels c on c.channel_id = p.channel_id
      left join ak_post_settings s on s.comment_key = p.comment_key
      where p.comment_key = $1
      order by p.updated_at desc
      limit 1
    `, [key]);
    const row = rows[0];
    if (!row) return null;
    return {
      commentKey: row.comment_key,
      channelId: row.channel_id,
      channelTitle: clean(row.channel_title) || 'Подключённый канал',
      postId: row.post_id,
      postTitle: pickTitle(row),
      commentsEnabled: row.comments_enabled !== false,
      commentsPhoto: row.comments_photo !== false,
      commentsReactions: row.comments_reactions !== false,
      banner: {
        enabled: row.comments_banner !== false,
        text: clean(row.comments_banner_text) || 'Начало обсуждения',
        button: clean(row.comments_banner_button),
        link: clean(row.comments_banner_link)
      }
    };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitV4DbHelperNoBannerRoutes) return app;
  app.__adminkitV4DbHelperNoBannerRoutes = true;
  app.get('/api/adminkit/post-meta', async (req, res) => {
    noCache(res);
    const commentKey = clean(req.query?.commentKey || req.query?.key || '');
    const meta = await getPostMeta(commentKey);
    if (!meta || meta.error) return res.json({ ok: !meta?.error, runtimeVersion: RUNTIME, commentKey, meta: meta || null, error: meta?.error || '' });
    return res.json({ ok: true, runtimeVersion: RUNTIME, commentKey, meta });
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
    if (!api || typeof api.sendMessage !== 'function' || api.sendMessage.__adminkitV4MenuSaverNoBanner) return false;
    const originalSend = api.sendMessage.bind(api);
    api.sendMessage = async function adminkitV4MenuSaverNoBanner(args = {}) {
      const result = await originalSend(args);
      if (looksLikeAdminMenu(args)) await saveMenuIds(args, result);
      return result;
    };
    api.sendMessage.__adminkitV4MenuSaverNoBanner = true;
    return true;
  } catch { return false; }
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  try {
    const Module = require('module');
    if (!Module.__adminkitV4DbHelperNoBannerExpressWrap) {
      Module.__adminkitV4DbHelperNoBannerExpressWrap = true;
      const oldLoad = Module._load;
      Module._load = function adminkitV4DbHelperNoBannerLoad(request, parent, isMain) {
        const loaded = oldLoad.apply(this, arguments);
        if (String(request) !== 'express' || !loaded || loaded.__adminkitV4DbHelperNoBannerWrapped) return loaded;
        function wrappedExpress(...args) { const app = loaded(...args); return installRoutes(app); }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitV4DbHelperNoBannerWrapped = true;
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
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already, status, endpoints: ['/api/adminkit/post-meta'], policy: 'no_client_banner_dom_creation_no_cleanup_after_render' };
}

module.exports = { RUNTIME, MARKER, install, selfTest, getPostMeta };
