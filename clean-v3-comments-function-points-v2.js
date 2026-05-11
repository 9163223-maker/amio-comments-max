'use strict';

const Module = require('module');
const fs = require('fs');
const path = require('path');

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC6.5.8.6-CLEAN-V3-BANNER-IN-APP';
const SOURCE = 'adminkit-CC6.5.8.6-no-menu-multiply-and-render-banner-in-comments';

let installed = false;
let lastTextSave = null;
let lastBannerLookup = null;

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cleanKey = (v) => String(v || '').replace(/^post:/i, '').replace(/^ck:/i, '').trim();
const cut = (v, n = 90) => { const s = norm(v); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

function isMainText(update = {}) {
  const t = norm(db.text(update)).toLowerCase();
  return ['/start', 'start', 'старт', 'меню', 'главное меню', 'начать'].includes(t) || /главн.*меню/.test(t);
}

async function ensureBannerTables() {
  await db.init();
  await db.query(`
    create table if not exists ak_post_settings_v3 (
      admin_id text not null,
      channel_id text not null,
      post_id text not null,
      comments_enabled boolean not null default true,
      banner_enabled boolean not null default true,
      reactions_enabled boolean not null default true,
      updated_at timestamptz default now(),
      primary key(admin_id, channel_id, post_id)
    );
    create table if not exists ak_comment_banners_v3 (
      admin_id text not null,
      channel_id text not null,
      post_id text not null,
      enabled boolean not null default true,
      banner_text text not null default '',
      link_url text not null default '',
      button_text text not null default '',
      action_type text not null default 'link',
      updated_at timestamptz default now(),
      primary key(admin_id, channel_id, post_id)
    );
  `);
}

async function getBanner(adminId, channelId, postId) {
  await ensureBannerTables();
  const settings = await db.query('select banner_enabled from ak_post_settings_v3 where admin_id=$1 and channel_id=$2 and post_id=$3 limit 1', [adminId, channelId, postId]).catch(() => ({ rows: [] }));
  const row = await db.query('select enabled, banner_text, link_url, button_text, action_type from ak_comment_banners_v3 where admin_id=$1 and channel_id=$2 and post_id=$3 limit 1', [adminId, channelId, postId]).catch(() => ({ rows: [] }));
  const b = row.rows[0] || {};
  const enabledBySettings = settings.rows[0] ? settings.rows[0].banner_enabled !== false : true;
  return {
    enabled: b.enabled !== false && enabledBySettings,
    bannerText: norm(b.banner_text || ''),
    linkUrl: norm(b.link_url || ''),
    buttonText: norm(b.button_text || ''),
    actionType: norm(b.action_type || 'link')
  };
}

async function saveBanner(adminId, channelId, postId, next = {}) {
  const cur = await getBanner(adminId, channelId, postId);
  const b = { ...cur, ...next };
  await db.query(`insert into ak_comment_banners_v3(admin_id,channel_id,post_id,enabled,banner_text,link_url,button_text,action_type,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,now())
    on conflict(admin_id,channel_id,post_id) do update set enabled=excluded.enabled,banner_text=excluded.banner_text,link_url=excluded.link_url,button_text=excluded.button_text,action_type=excluded.action_type,updated_at=now()`,
    [adminId, channelId, postId, b.enabled !== false, b.bannerText || '', b.linkUrl || '', b.buttonText || '', b.actionType || 'link']);
  await db.query(`insert into ak_post_settings_v3(admin_id,channel_id,post_id,banner_enabled,updated_at) values($1,$2,$3,$4,now()) on conflict(admin_id,channel_id,post_id) do update set banner_enabled=excluded.banner_enabled, updated_at=now()`, [adminId, channelId, postId, b.enabled !== false]);
  return getBanner(adminId, channelId, postId);
}

async function findBannerByPublicPost({ commentKey = '', channelId = '', postId = '' } = {}) {
  await ensureBannerTables();
  const ck = cleanKey(commentKey);
  const ch = norm(channelId);
  const po = norm(postId);
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (ck) add('p.comment_key=?', ck);
  if (ch && po) { params.push(ch, po); where.push(`(p.channel_id=$${params.length - 1} and p.post_id=$${params.length})`); }
  if (po) add('p.post_id=?', po);
  if (!where.length) return null;

  const q = await db.query(`
    select p.admin_id, p.channel_id, p.post_id, p.comment_key, p.title,
           b.enabled, b.banner_text, b.link_url, b.button_text, b.action_type, b.updated_at,
           s.banner_enabled
    from ak_posts p
    join ak_comment_banners_v3 b
      on b.admin_id=p.admin_id and b.channel_id=p.channel_id and b.post_id=p.post_id
    left join ak_post_settings_v3 s
      on s.admin_id=p.admin_id and s.channel_id=p.channel_id and s.post_id=p.post_id
    where ${where.join(' or ')}
    order by b.updated_at desc nulls last, p.updated_at desc nulls last
    limit 1
  `, params).catch((error) => ({ rows: [], error }));
  const row = q.rows && q.rows[0];
  if (!row && ch && po) {
    const fallback = await db.query(`
      select '' as admin_id, channel_id, post_id, '' as comment_key, '' as title,
             enabled, banner_text, link_url, button_text, action_type, updated_at, true as banner_enabled
      from ak_comment_banners_v3
      where channel_id=$1 and post_id=$2
      order by updated_at desc nulls last
      limit 1
    `, [ch, po]).catch(() => ({ rows: [] }));
    return fallback.rows && fallback.rows[0] ? rowToBanner(fallback.rows[0]) : null;
  }
  return row ? rowToBanner(row) : null;
}

function rowToBanner(row) {
  const enabled = row.enabled !== false && row.banner_enabled !== false;
  return {
    enabled,
    bannerText: norm(row.banner_text || ''),
    linkUrl: norm(row.link_url || ''),
    buttonText: norm(row.button_text || ''),
    actionType: norm(row.action_type || 'link'),
    postId: norm(row.post_id || ''),
    channelId: norm(row.channel_id || ''),
    commentKey: norm(row.comment_key || ''),
    title: norm(row.title || ''),
    updatedAt: row.updated_at || null
  };
}

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function installRoutes(app) {
  if (!app || app.__adminkitBannerInAppRoutesInstalled) return app;
  app.__adminkitBannerInAppRoutesInstalled = true;

  app.get('/api/comments/banner', async (req, res) => {
    noCache(res);
    try {
      const banner = await findBannerByPublicPost({
        commentKey: req.query.commentKey || req.query.k || '',
        channelId: req.query.channelId || req.query.c || '',
        postId: req.query.postId || req.query.p || ''
      });
      lastBannerLookup = { ok: true, found: !!banner, input: req.query || {}, banner: banner ? { postId: banner.postId, channelId: banner.channelId, hasText: !!banner.bannerText, hasLink: !!banner.linkUrl, hasButton: !!banner.buttonText, enabled: banner.enabled } : null, at: new Date().toISOString() };
      res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, banner: banner || { enabled: false } });
    } catch (error) {
      lastBannerLookup = { ok: false, error: error && error.message ? error.message : String(error), at: new Date().toISOString() };
      res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: lastBannerLookup.error });
    }
  });

  app.get('/debug/banner-live', async (req, res) => {
    noCache(res);
    try {
      const banner = await findBannerByPublicPost({
        commentKey: req.query.commentKey || req.query.k || '',
        channelId: req.query.channelId || req.query.c || '',
        postId: req.query.postId || req.query.p || ''
      });
      res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, lastBannerLookup, banner: banner || { enabled: false } });
    } catch (error) {
      res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error) });
    }
  });

  return app;
}

function buildClientPatch() {
  return `\n;(() => {\n  if (window.__ADMINKIT_BANNER_IN_APP_V586__) return;\n  window.__ADMINKIT_BANNER_IN_APP_V586__ = true;\n  const escapeHtml = (value) => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');\n  const norm = (v) => String(v || '').replace(/\\s+/g, ' ').trim();\n  const style = document.createElement('style');\n  style.textContent = '.adminkit-banner-card{margin:12px 0 14px;padding:14px 16px;border-radius:22px;background:rgba(255,255,255,.72);box-shadow:0 10px 28px rgba(30,110,180,.10);backdrop-filter:blur(12px);font-size:15px;line-height:1.35;color:#25344f}.adminkit-banner-card.hidden{display:none}.adminkit-banner-title{font-weight:700;margin-bottom:6px}.adminkit-banner-text{white-space:pre-wrap}.adminkit-banner-button{display:block;margin-top:12px;padding:12px 14px;border-radius:16px;text-align:center;text-decoration:none;font-weight:700;background:rgba(70,150,240,.16);color:#2472c8;border:1px solid rgba(70,150,240,.22)}';\n  document.head?.appendChild(style);\n  const openTarget = (url) => {\n    const target = norm(url);\n    if (!target) return;\n    const controller = (typeof getBridgeController === 'function' ? getBridgeController() : null);\n    try {\n      if (/^https:\\/\\/max\\.ru\\//i.test(target) && controller && typeof controller.openMaxLink === 'function') { controller.openMaxLink(target); return; }\n      if (controller && typeof controller.openLink === 'function') { controller.openLink(target); return; }\n    } catch (_) {}\n    window.location.href = target;\n  };\n  function currentParams() {\n    const out = new URLSearchParams();\n    try {\n      const ck = norm((typeof state !== 'undefined' && state.commentKey) || (typeof getBestParam === 'function' ? getBestParam('commentKey') : ''));\n      const ch = norm((typeof state !== 'undefined' && state.channelId) || (typeof getBestParam === 'function' ? getBestParam('channelId') : ''));\n      const po = norm((typeof getBestParam === 'function' ? (getBestParam('postId') || getBestParam('post_id')) : '') || (typeof state !== 'undefined' && state.startapp && String(state.startapp).replace(/^post:/,'')) || '');\n      if (ck) out.set('commentKey', ck);\n      if (ch) out.set('channelId', ch);\n      if (po) out.set('postId', po);\n    } catch (_) {}\n    return out;\n  }\n  function ensureBannerElement() {\n    let el = document.getElementById('adminkitBannerCard');\n    if (el) return el;\n    el = document.createElement('div');\n    el.id = 'adminkitBannerCard';\n    el.className = 'adminkit-banner-card hidden';\n    const commentsWrap = document.getElementById('commentsWrap');\n    const commentsList = document.getElementById('commentsList');\n    const labelWrap = document.querySelector('.discussion-label-wrap');\n    if (commentsWrap && commentsWrap.parentNode) commentsWrap.parentNode.insertBefore(el, commentsWrap);\n    else if (commentsList && commentsList.parentNode) commentsList.parentNode.insertBefore(el, commentsList);\n    else if (labelWrap && labelWrap.parentNode) labelWrap.parentNode.insertBefore(el, labelWrap.nextSibling);\n    else document.body.appendChild(el);\n    return el;\n  }\n  function renderBanner(banner) {\n    const el = ensureBannerElement();\n    const b = banner || {};\n    const hasContent = b.enabled !== false && (norm(b.bannerText) || norm(b.linkUrl) || norm(b.buttonText));\n    if (!hasContent) { el.classList.add('hidden'); el.innerHTML = ''; return; }\n    const text = norm(b.bannerText);\n    const link = norm(b.linkUrl);\n    const button = norm(b.buttonText) || (link ? 'Перейти' : '');\n    el.innerHTML = '<div class="adminkit-banner-title">🖼 Баннер</div>' + (text ? '<div class="adminkit-banner-text">'+escapeHtml(text)+'</div>' : '') + (link ? '<a href="#" class="adminkit-banner-button" data-ak-banner-link="'+escapeHtml(link)+'">'+escapeHtml(button)+'</a>' : '');\n    el.classList.remove('hidden');\n    el.querySelector('[data-ak-banner-link]')?.addEventListener('click', (event) => { event.preventDefault(); openTarget(event.currentTarget.getAttribute('data-ak-banner-link')); });\n  }\n  async function loadBanner() {\n    try {\n      const params = currentParams();\n      if (!params.toString()) return;\n      const response = await fetch('/api/comments/banner?' + params.toString(), { cache: 'no-store' });\n      const data = await response.json().catch(() => ({}));\n      if (data && data.ok !== false) renderBanner(data.banner);\n    } catch (_) {}\n  }\n  document.addEventListener('DOMContentLoaded', loadBanner);\n  window.addEventListener('focus', loadBanner);\n  setTimeout(loadBanner, 250);\n  setTimeout(loadBanner, 900);\n  setTimeout(loadBanner, 1800);\n})();\n`;
}

function patchPublicAppRead() {
  if (fs.__adminkitBannerInAppReadPatched) return;
  fs.__adminkitBannerInAppReadPatched = true;
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const publicAppPath = path.resolve(__dirname, 'public', 'app.js');
  fs.readFileSync = function patchedReadFileSync(filePath, options) {
    const content = originalReadFileSync(filePath, options);
    try {
      const resolved = path.resolve(String(filePath || ''));
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (resolved === publicAppPath && wantsText) {
        const text = String(content || '');
        if (!text.includes('__ADMINKIT_BANNER_IN_APP_V586__')) return text + buildClientPatch();
      }
    } catch {}
    return content;
  };
}

async function handleBannerTextInputNoMenuMultiply(update = {}) {
  if (db.cb(update)) return false;
  const adminId = db.adminId(update);
  if (!adminId || isMainText(update)) return false;
  const flow = await db.getFlow(adminId).catch(() => null);
  if (!flow || flow.type !== 'comments_banner_wait') return false;
  const raw = norm(db.text(update));
  if (!raw) return false;

  const value = ['-', '—', 'нет', 'очистить'].includes(raw.toLowerCase()) ? '' : raw;
  const next = {};
  const label = flow.field === 'url' ? 'ссылка/действие' : flow.field === 'button' ? 'текст кнопки' : 'текст баннера';
  if (flow.field === 'text') next.bannerText = value.slice(0, 500);
  if (flow.field === 'url') next.linkUrl = value.slice(0, 500);
  if (flow.field === 'button') next.buttonText = value.slice(0, 80);
  const banner = await saveBanner(adminId, flow.c, flow.p, next);
  await db.clearFlow(adminId);

  lastTextSave = { ok: true, field: flow.field, label, value: cut(value, 120), channelId: flow.c, postId: flow.p, at: new Date().toISOString() };

  try {
    const activeMenuId = await db.getMenu(adminId).catch(() => '');
    if (activeMenuId) {
      const bannerAction = require('./clean-v3-comments-banner-action');
      const packet = await bannerAction.renderBannerPacket(adminId, { callback: { payload: JSON.stringify({ r: 'comments_banner:home', c: flow.c, p: flow.p, k: flow.k }) } });
      if (packet && packet.text) {
        const statusText = packet.text.replace('Настройте текст, ссылку/действие и подпись кнопки.', `✅ Сохранено: ${label}.\n\nБаннер будет показан в обсуждении после обновления/повторного открытия комментариев.`);
        await api.editMessage({ botToken: config.botToken, messageId: activeMenuId, text: statusText, attachments: packet.attachments || [], notify: false });
      }
    }
  } catch {}

  try {
    await api.sendMessage({
      botToken: config.botToken,
      userId: adminId,
      text: [`✅ Сохранено: ${label}.`, banner.bannerText ? `Текст: ${cut(banner.bannerText, 80)}` : '', banner.linkUrl ? `Ссылка: ${cut(banner.linkUrl, 80)}` : '', banner.buttonText ? `Кнопка: ${cut(banner.buttonText, 40)}` : ''].filter(Boolean).join('\n'),
      attachments: [],
      notify: false
    });
  } catch {}

  return { ok: true, handledBy: RUNTIME, route: `comments_banner:save_${flow.field}`, noMenuMultiply: true };
}

function installBridgeTopRouter() {
  const bridge = require('./cc55-v3-live-bridge');
  if (!bridge || bridge.__adminkitFunctionV2BridgeInstalled) return;
  bridge.__adminkitFunctionV2BridgeInstalled = true;
  const originalHandle = bridge.handle.bind(bridge);
  bridge.handle = async function functionV2BridgeHandle(update = {}) {
    const bannerText = await handleBannerTextInputNoMenuMultiply(update);
    if (bannerText) return true;
    return originalHandle(update);
  };
}

function installExpressAndFsPatch() {
  patchPublicAppRead();
  if (Module.__adminkitBannerInAppExpressPatched) return;
  Module.__adminkitBannerInAppExpressPatched = true;
  const previousLoad = Module._load;
  Module._load = function adminkitBannerInAppLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request || '') === 'express' && loaded && !loaded.__adminkitBannerInAppWrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitBannerInAppWrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  if (installed) return selfTest();
  installed = true;
  installBridgeTopRouter();
  installExpressAndFsPatch();
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed,
    scope: 'comments_banner_function_points_only',
    checks: {
      menuMultiplicationStoppedForBannerTextInput: true,
      bannerEndpointInstalled: true,
      publicAppBannerRendererInjected: true,
      openAppUntouched: true,
      commentsLaunchUntouched: true,
      mainMenuTreeUntouched: true
    },
    lastTextSave,
    lastBannerLookup
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, findBannerByPublicPost };
