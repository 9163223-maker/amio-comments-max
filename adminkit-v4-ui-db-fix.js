'use strict';

// V4 UI + DB fix:
// 1) one visible comments banner row, no duplicated chips;
// 2) post title in discussion is resolved from Postgres by commentKey;
// 3) admin menu messages are saved to DB after send/edit so the next menu can replace the current one.

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.7.7-V4-UI-DB-FIX';
const MARKER = '__ADMINKIT_V4_UI_DB_FIX_677__';

let status = { installed: false, routeInstalled: false, appPatched: false, menuPatched: false, error: '', at: '' };

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
  if (!app || app.__adminkitV4UiDbFixRoutes) return app;
  app.__adminkitV4UiDbFixRoutes = true;
  app.get('/api/adminkit/post-meta', async (req, res) => {
    noCache(res);
    const commentKey = clean(req.query?.commentKey || req.query?.key || '');
    const meta = await getPostMeta(commentKey);
    if (!meta || meta.error) return res.json({ ok: !meta?.error, runtimeVersion: RUNTIME, commentKey, meta: meta || null, error: meta?.error || '' });
    return res.json({ ok: true, runtimeVersion: RUNTIME, commentKey, meta });
  });
  return app;
}

function clientPatch() {
  return `\n;(() => {\n  if (window.${MARKER}) return;\n  window.${MARKER} = true;\n  const RT = '${RUNTIME}';\n  const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim();\n  const esc = (v) => String(v || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');\n  const badTitle = (v) => !clean(v) || /^загрузка/i.test(clean(v)) || /^-?\\d{8,}$/.test(clean(v));\n  function stateObj() { try { return typeof state !== 'undefined' ? state : null; } catch (_) { return null; } }\n  function findCommentKey() {\n    const st = stateObj();\n    if (st && st.commentKey) return clean(st.commentKey);\n    try { const u = new URL(location.href); return clean(u.searchParams.get('commentKey') || u.searchParams.get('key') || ''); } catch (_) { return ''; }\n  }\n  function ensureStyle() {\n    if (document.getElementById('adminkit-v4-ui-db-fix-style')) return;\n    const s = document.createElement('style');\n    s.id = 'adminkit-v4-ui-db-fix-style';\n    s.textContent = '.adminkit-banner-ui{margin:12px auto 10px;max-width:90%;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}.adminkit-banner-chip{border:0;border-radius:999px;padding:8px 14px;background:rgba(255,255,255,.74);box-shadow:0 8px 22px rgba(31,93,155,.08);font:600 15px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#536b89;text-decoration:none}.adminkit-banner-chip.primary{color:#2f7dd3}.adminkit-banner-ui.hidden{display:none!important}';\n    document.head.appendChild(s);\n  }\n  function removeDuplicateBannerNodes() {\n    const nodes = [...document.querySelectorAll('#adminkitBannerUi')];\n    nodes.slice(1).forEach(n => n.remove());\n  }\n  function bannerAnchor() {\n    return document.querySelector('.discussion-label-wrap') || document.getElementById('adminkitBannerUi');\n  }\n  function mountOneBanner(banner) {\n    ensureStyle();\n    removeDuplicateBannerNodes();\n    const enabled = banner?.enabled !== false;\n    const text = clean(banner?.text) || 'Начало обсуждения';\n    const button = clean(banner?.button);\n    const link = clean(banner?.link);\n    let node = bannerAnchor();\n    if (!node) {\n      node = document.createElement('div');\n      const target = document.getElementById('commentsList') || document.getElementById('commentsWrap') || document.body.firstElementChild;\n      if (target?.parentNode) target.parentNode.insertBefore(node, target); else document.body.prepend(node);\n    }\n    node.id = 'adminkitBannerUi';\n    node.className = 'discussion-label-wrap adminkit-banner-ui';\n    node.classList.toggle('hidden', !enabled);\n    if (!enabled) { node.innerHTML = ''; return; }\n    const action = button ? (link ? '<a class="adminkit-banner-chip primary" href="'+esc(link)+'">'+esc(button)+'</a>' : '<span class="adminkit-banner-chip primary">'+esc(button)+'</span>') : '';\n    node.innerHTML = '<span id="discussionLabel" class="adminkit-banner-chip">'+esc(text)+'</span><a id="adminkitDiscussionLink" class="adminkit-banner-chip primary" href="https://max.ru/id781310320690_bot?start=menu">🐋 АдминКИТ</a>'+action;\n  }\n  function applyMeta(meta) {\n    if (!meta) return;\n    const st = stateObj();\n    if (st) {\n      if (meta.postTitle) st.resolvedPostTitle = meta.postTitle;\n      if (meta.channelTitle) st.resolvedChannelTitle = meta.channelTitle;\n    }\n    const title = document.getElementById('postTitle');\n    if (title && meta.postTitle && badTitle(title.textContent)) title.textContent = meta.postTitle;\n    const postCard = document.getElementById('postCard');\n    if (postCard && meta.postTitle) postCard.setAttribute('data-adminkit-post-title', meta.postTitle);\n    mountOneBanner(meta.banner || { enabled: true, text: 'Начало обсуждения' });\n  }\n  async function refreshMeta() {\n    const key = findCommentKey();\n    if (!key) { mountOneBanner({ enabled: true, text: 'Начало обсуждения' }); return; }\n    try {\n      const r = await fetch('/api/adminkit/post-meta?commentKey=' + encodeURIComponent(key) + '&t=' + Date.now(), { cache: 'no-store' });\n      const j = await r.json().catch(() => ({}));\n      applyMeta(j.meta);\n    } catch (_) { mountOneBanner({ enabled: true, text: 'Начало обсуждения' }); }\n  }\n  const observer = new MutationObserver(() => { removeDuplicateBannerNodes(); const t = document.getElementById('postTitle'); if (t && badTitle(t.textContent)) refreshMeta(); });\n  try { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (_) {}\n  [0,150,500,1000,1800,3200].forEach(ms => setTimeout(refreshMeta, ms));\n  window.addEventListener?.('focus', () => setTimeout(refreshMeta, 120));\n})();\n`;
}

function patchAppJs() {
  const file = path.resolve(__dirname, 'public', 'app.js');
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(MARKER)) return false;
  fs.writeFileSync(file, text + clientPatch(), 'utf8');
  return true;
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
    if (!api || typeof api.sendMessage !== 'function' || api.sendMessage.__adminkitV4MenuSaver) return false;
    const originalSend = api.sendMessage.bind(api);
    api.sendMessage = async function adminkitV4MenuSaver(args = {}) {
      const result = await originalSend(args);
      if (looksLikeAdminMenu(args)) await saveMenuIds(args, result);
      return result;
    };
    api.sendMessage.__adminkitV4MenuSaver = true;
    return true;
  } catch { return false; }
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  try {
    const Module = require('module');
    if (!Module.__adminkitV4UiDbFixExpressWrap) {
      Module.__adminkitV4UiDbFixExpressWrap = true;
      const oldLoad = Module._load;
      Module._load = function adminkitV4UiDbFixLoad(request, parent, isMain) {
        const loaded = oldLoad.apply(this, arguments);
        if (String(request) !== 'express' || !loaded || loaded.__adminkitV4UiDbFixWrapped) return loaded;
        function wrappedExpress(...args) { const app = loaded(...args); return installRoutes(app); }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitV4UiDbFixWrapped = true;
        return wrappedExpress;
      };
    }
    const menuPatched = installMenuSaver();
    const appPatched = patchAppJs();
    status = { installed: true, routeInstalled: true, appPatched, menuPatched, error: '', at: new Date().toISOString() };
  } catch (error) {
    status = { installed: false, routeInstalled: false, appPatched: false, menuPatched: false, error: error?.message || String(error), at: new Date().toISOString() };
  }
  return selfTest(false);
}
function selfTest(already = false) {
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already, status, endpoints: ['/api/adminkit/post-meta'] };
}

module.exports = { RUNTIME, MARKER, install, selfTest, getPostMeta };
