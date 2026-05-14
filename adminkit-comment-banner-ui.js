'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.7.6-COMMENT-BANNER-UI';
const MARKER = '__ADMINKIT_COMMENT_BANNER_UI_676__';

let status = { installed: false, appPatched: false, routeInstalled: false, error: '', at: '' };

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

async function getBannerSettings(commentKey = '') {
  const key = clean(commentKey);
  if (!key) return null;
  try {
    const state = require('./db-v3-state');
    const db = require('./cc5-db-core');
    await state.ensure();
    const { rows } = await db.query(`
      select
        coalesce(s.comments_banner, true) as "enabled",
        coalesce(nullif(s.comments_banner_text,''), 'Начало обсуждения') as "text",
        coalesce(nullif(s.comments_banner_button,''), '') as "button",
        coalesce(nullif(s.comments_banner_link,''), '') as "link"
      from ak_posts p
      left join ak_post_settings s on s.comment_key = p.comment_key
      where p.comment_key = $1
      order by p.updated_at desc
      limit 1
    `, [key]);
    return rows[0] || null;
  } catch (error) {
    return { enabled: true, text: 'Начало обсуждения', button: '', link: '', error: error?.message || String(error) };
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitCommentBannerRoutes) return app;
  app.__adminkitCommentBannerRoutes = true;
  app.get('/api/adminkit/comment-banner', async (req, res) => {
    noCache(res);
    const commentKey = clean(req.query?.commentKey || req.query?.key || '');
    const banner = await getBannerSettings(commentKey);
    res.json({ ok: true, runtimeVersion: RUNTIME, commentKey, banner: banner || { enabled: true, text: 'Начало обсуждения', button: '', link: '' } });
  });
  return app;
}

function clientPatch() {
  return `\n;(() => {\n  if (window.${MARKER}) return;\n  window.${MARKER} = true;\n  const RT = '${RUNTIME}';\n  const esc = (v) => String(v || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');\n  const clean = (v) => String(v || '').replace(/\\s+/g, ' ').trim();\n  function findCommentKey() {\n    try { if (window.state && state.commentKey) return clean(state.commentKey); } catch (_) {}\n    try { return clean(new URL(location.href).searchParams.get('commentKey')); } catch (_) { return ''; }\n  }\n  function ensureStyle() {\n    if (document.getElementById('adminkit-banner-ui-style')) return;\n    const s = document.createElement('style');\n    s.id = 'adminkit-banner-ui-style';\n    s.textContent = '.adminkit-banner-ui{margin:12px auto 10px;max-width:86%;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap}.adminkit-banner-chip{border:0;border-radius:999px;padding:8px 14px;background:rgba(255,255,255,.72);box-shadow:0 8px 22px rgba(31,93,155,.08);font:600 15px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#536b89;text-decoration:none}.adminkit-banner-chip.primary{color:#2f7dd3}.adminkit-banner-ui.hidden{display:none!important}';\n    document.head.appendChild(s);\n  }\n  function mountBanner(banner) {\n    ensureStyle();\n    const enabled = banner?.enabled !== false;\n    const text = clean(banner?.text) || 'Начало обсуждения';\n    const button = clean(banner?.button);\n    const link = clean(banner?.link);\n    let node = document.getElementById('adminkitBannerUi');\n    if (!node) {\n      node = document.createElement('div');\n      node.id = 'adminkitBannerUi';\n      node.className = 'adminkit-banner-ui';\n      const anchor = document.querySelector('.discussion-label-wrap') || document.getElementById('discussionLabel') || document.getElementById('commentsList') || document.getElementById('commentsWrap') || document.body.firstElementChild;\n      if (anchor?.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling); else document.body.prepend(node);\n    }\n    node.classList.toggle('hidden', !enabled);\n    if (!enabled) { node.innerHTML = ''; return; }\n    const linkButton = button ? (link ? '<a class="adminkit-banner-chip primary" href="'+esc(link)+'">'+esc(button)+'</a>' : '<span class="adminkit-banner-chip primary">'+esc(button)+'</span>') : '';\n    node.innerHTML = '<span class="adminkit-banner-chip">'+esc(text)+'</span><span class="adminkit-banner-chip primary">🐋 АдминКИТ</span>'+linkButton;\n  }\n  async function loadBanner() {\n    const key = findCommentKey();\n    if (!key) { mountBanner({ enabled: true, text: 'Начало обсуждения' }); return; }\n    try {\n      const r = await fetch('/api/adminkit/comment-banner?commentKey=' + encodeURIComponent(key) + '&t=' + Date.now(), { cache: 'no-store' });\n      const j = await r.json().catch(() => ({}));\n      mountBanner(j.banner || { enabled: true, text: 'Начало обсуждения' });\n    } catch (_) { mountBanner({ enabled: true, text: 'Начало обсуждения' }); }\n  }\n  [0, 250, 800, 1600].forEach((ms) => setTimeout(loadBanner, ms));\n  window.addEventListener?.('focus', () => setTimeout(loadBanner, 150));\n})();\n`;
}

function patchAppJs() {
  const file = path.resolve(__dirname, 'public', 'app.js');
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(MARKER)) return false;
  fs.writeFileSync(file, text + clientPatch(), 'utf8');
  return true;
}

function install() {
  try {
    const Module = require('module');
    if (!Module.__adminkitCommentBannerExpressWrap) {
      Module.__adminkitCommentBannerExpressWrap = true;
      const oldLoad = Module._load;
      Module._load = function adminkitCommentBannerLoad(request, parent, isMain) {
        const loaded = oldLoad.apply(this, arguments);
        if (String(request) !== 'express' || !loaded || loaded.__adminkitCommentBannerWrapped) return loaded;
        function wrappedExpress(...args) { const app = loaded(...args); return installRoutes(app); }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCommentBannerWrapped = true;
        return wrappedExpress;
      };
    }
    const appPatched = patchAppJs();
    status = { installed: true, appPatched, routeInstalled: true, error: '', at: new Date().toISOString() };
  } catch (error) {
    status = { installed: false, appPatched: false, routeInstalled: false, error: error?.message || String(error), at: new Date().toISOString() };
  }
  return selfTest();
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, status, endpoint: '/api/adminkit/comment-banner' }; }

module.exports = { RUNTIME, MARKER, install, selfTest };
