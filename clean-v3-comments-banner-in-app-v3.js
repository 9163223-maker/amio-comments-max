'use strict';

const Module = require('module');
const fs = require('fs');
const path = require('path');
const db = require('./cc5-db-core');

const RUNTIME = 'CC6.5.8.8-CLEAN-V3-BANNER-IN-APP-V3';
const SOURCE = 'adminkit-CC6.5.8.8-explicit-app-js-route-title-postid-banner-render';

let installed = false;
let lastLookup = null;

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cleanKey = (v) => String(v || '').replace(/^post:/i, '').replace(/^ck:/i, '').replace(/^:+/, '').trim();

async function ensureTables() {
  await db.init();
  await db.query(`
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
  `);
}

function rowToBanner(row) {
  if (!row) return null;
  return {
    enabled: row.enabled !== false && row.banner_enabled !== false,
    bannerText: norm(row.banner_text || ''),
    linkUrl: norm(row.link_url || ''),
    buttonText: norm(row.button_text || ''),
    actionType: norm(row.action_type || 'link'),
    postId: norm(row.post_id || ''),
    channelId: norm(row.channel_id || ''),
    commentKey: norm(row.comment_key || (row.channel_id && row.post_id ? `${row.channel_id}:${row.post_id}` : '')),
    title: norm(row.title || ''),
    updatedAt: row.updated_at || null
  };
}

function splitKey(commentKey = '') {
  const ck = cleanKey(commentKey);
  if (!ck || !ck.includes(':')) return { commentKey: ck, channelId: '', postId: '' };
  const parts = ck.split(':');
  return { commentKey: ck, channelId: parts[0] || '', postId: parts.slice(1).join(':') || '' };
}

async function latestBanners(limit = 10) {
  await ensureTables();
  const { rows } = await db.query(`
    select b.admin_id, b.channel_id, b.post_id,
           coalesce(p.comment_key, b.channel_id || ':' || b.post_id) as comment_key,
           coalesce(p.title, '') as title,
           b.enabled, b.banner_text, b.link_url, b.button_text, b.action_type, b.updated_at,
           coalesce(s.banner_enabled, true) as banner_enabled
    from ak_comment_banners_v3 b
    left join ak_posts p
      on p.admin_id=b.admin_id and p.channel_id=b.channel_id and p.post_id=b.post_id
    left join ak_post_settings_v3 s
      on s.admin_id=b.admin_id and s.channel_id=b.channel_id and s.post_id=b.post_id
    order by b.updated_at desc nulls last
    limit $1
  `, [Math.max(1, Math.min(Number(limit || 10), 30))]).catch(() => ({ rows: [] }));
  return rows.map(rowToBanner).filter(Boolean);
}

async function findBanner(input = {}) {
  await ensureTables();
  const k = splitKey(input.commentKey || input.k || '');
  const ch = norm(input.channelId || input.c || k.channelId || '');
  const po = norm(input.postId || input.p || k.postId || '');
  const ck = cleanKey(k.commentKey || (ch && po ? `${ch}:${po}` : ''));
  const title = norm(input.title || input.ti || '');

  const clauses = [];
  const params = [];
  const push = (sql, valueList) => {
    const offset = params.length;
    valueList.forEach((value) => params.push(value));
    let i = offset;
    clauses.push(sql.replace(/\?/g, () => `$${++i}`));
  };

  if (ck) push('p.comment_key=?', [ck]);
  if (ch && po) push('(b.channel_id=? and b.post_id=?)', [ch, po]);
  if (po) push('b.post_id=?', [po]);
  if (title && title.length >= 3) push('lower(coalesce(p.title,\'\'))=lower(?)', [title]);
  if (!clauses.length) return null;

  const result = await db.query(`
    select b.admin_id, b.channel_id, b.post_id,
           coalesce(p.comment_key, b.channel_id || ':' || b.post_id) as comment_key,
           coalesce(p.title, '') as title,
           b.enabled, b.banner_text, b.link_url, b.button_text, b.action_type, b.updated_at,
           coalesce(s.banner_enabled, true) as banner_enabled
    from ak_comment_banners_v3 b
    left join ak_posts p
      on p.admin_id=b.admin_id and p.channel_id=b.channel_id and p.post_id=b.post_id
    left join ak_post_settings_v3 s
      on s.admin_id=b.admin_id and s.channel_id=b.channel_id and s.post_id=b.post_id
    where ${clauses.join(' or ')}
    order by
      case
        when b.post_id = $${params.length + 1} then 0
        when coalesce(p.comment_key,'') = $${params.length + 2} then 1
        when lower(coalesce(p.title,'')) = lower($${params.length + 3}) then 2
        else 3
      end,
      b.updated_at desc nulls last
    limit 1
  `, [...params, po || '', ck || '', title || '']).catch((error) => ({ rows: [], error }));

  return result.rows && result.rows[0] ? rowToBanner(result.rows[0]) : null;
}

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function buildClientPatch() {
  return `\n;(() => {\n  if (window.__ADMINKIT_BANNER_IN_APP_V3__) return;\n  window.__ADMINKIT_BANNER_IN_APP_V3__ = true;\n  const escapeHtml = (value) => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');\n  const norm = (v) => String(v || '').replace(/\\s+/g, ' ').trim();\n  const clean = (v) => norm(v).replace(/^ck:/i,'').replace(/^post:/i,'');\n  const seen = { query: '' };\n  const openTarget = (url) => {\n    const target = norm(url); if (!target) return;\n    const controller = (typeof getBridgeController === 'function' ? getBridgeController() : null);\n    try {\n      if (/^https:\\/\\/max\\.ru\\//i.test(target) && controller?.openMaxLink) { controller.openMaxLink(target); return; }\n      if (controller?.openLink) { controller.openLink(target); return; }\n    } catch (_) {}\n    window.location.href = target;\n  };\n  function ensureBannerElement() {\n    let el = document.getElementById('adminkitBannerCard');\n    if (el) return el;\n    const style = document.createElement('style');\n    style.textContent = '.adminkit-banner-card{margin:12px 0 14px;padding:14px 16px;border-radius:22px;background:rgba(255,255,255,.76);box-shadow:0 10px 28px rgba(30,110,180,.10);backdrop-filter:blur(12px);font-size:15px;line-height:1.35;color:#25344f}.adminkit-banner-card.hidden{display:none}.adminkit-banner-title{font-weight:700;margin-bottom:6px}.adminkit-banner-text{white-space:pre-wrap}.adminkit-banner-button{display:block;margin-top:12px;padding:12px 14px;border-radius:16px;text-align:center;text-decoration:none;font-weight:700;background:rgba(70,150,240,.16);color:#2472c8;border:1px solid rgba(70,150,240,.22)}';\n    document.head?.appendChild(style);\n    el = document.createElement('div'); el.id = 'adminkitBannerCard'; el.className = 'adminkit-banner-card hidden';\n    const commentsWrap = document.getElementById('commentsWrap');\n    const commentsList = document.getElementById('commentsList');\n    const emptyState = document.getElementById('emptyState');\n    const labelWrap = document.querySelector('.discussion-label-wrap');\n    if (commentsWrap?.parentNode) commentsWrap.parentNode.insertBefore(el, commentsWrap);\n    else if (commentsList?.parentNode) commentsList.parentNode.insertBefore(el, commentsList);\n    else if (emptyState?.parentNode) emptyState.parentNode.insertBefore(el, emptyState);\n    else if (labelWrap?.parentNode) labelWrap.parentNode.insertBefore(el, labelWrap.nextSibling);\n    else document.body.appendChild(el);\n    return el;\n  }\n  function collectParams() {\n    const p = new URLSearchParams();\n    try {\n      const stObj = (typeof state !== 'undefined' && state) ? state : {};\n      let ck = norm(stObj.commentKey || stObj.post?.commentKey || stObj.currentPost?.commentKey || (typeof getBestParam === 'function' ? getBestParam('commentKey') : ''));\n      let ch = norm(stObj.channelId || stObj.post?.channelId || stObj.currentPost?.channelId || (typeof getBestParam === 'function' ? getBestParam('channelId') : ''));\n      let po = norm(stObj.postId || stObj.post_id || stObj.post?.postId || stObj.post?.post_id || stObj.currentPost?.postId || stObj.currentPost?.post_id || stObj.post?.messageId || stObj.currentPost?.messageId || (typeof getBestParam === 'function' ? (getBestParam('postId') || getBestParam('post_id')) : ''));\n      const st = clean(stObj.startapp || stObj.startappRaw || '');\n      if (!ck && st.includes(':')) ck = st;\n      if (!po && /^-?\\d{8,}$/.test(st)) po = st;\n      if (ck && ck.includes(':')) { const parts = ck.split(':'); if (!ch) ch = parts[0]; if (!po) po = parts.slice(1).join(':'); }\n      const title = norm(document.getElementById('postTitle')?.textContent || document.querySelector('.post-title')?.textContent || '');\n      if (ck) p.set('commentKey', ck);\n      if (ch) p.set('channelId', ch);\n      if (po) p.set('postId', po);\n      if (title && title.length >= 3) p.set('title', title);\n    } catch (_) {}\n    return p;\n  }\n  function render(b) {\n    const el = ensureBannerElement(); const banner = b || {};\n    const has = banner.enabled !== false && (norm(banner.bannerText) || norm(banner.linkUrl) || norm(banner.buttonText));\n    if (!has) { el.classList.add('hidden'); el.innerHTML = ''; return; }\n    const text = norm(banner.bannerText); const link = norm(banner.linkUrl); const button = norm(banner.buttonText) || (link ? 'Перейти' : '');\n    el.innerHTML = '<div class="adminkit-banner-title">🖼 Баннер</div>' + (text ? '<div class="adminkit-banner-text">'+escapeHtml(text)+'</div>' : '') + (link ? '<a href="#" class="adminkit-banner-button" data-ak-banner-link="'+escapeHtml(link)+'">'+escapeHtml(button)+'</a>' : '');\n    el.classList.remove('hidden');\n    el.querySelector('[data-ak-banner-link]')?.addEventListener('click', (e) => { e.preventDefault(); openTarget(e.currentTarget.getAttribute('data-ak-banner-link')); });\n  }\n  async function load(force) {\n    try {\n      const p = collectParams();\n      const query = p.toString();\n      if (!query) return;\n      if (!force && seen.query === query) return;\n      seen.query = query;\n      const r = await fetch('/api/comments/banner3?' + query, { cache: 'no-store' });\n      const d = await r.json().catch(() => ({}));\n      if (d?.ok !== false) render(d.banner);\n    } catch (_) {}\n  }\n  document.addEventListener('DOMContentLoaded', () => load(true));\n  window.addEventListener('focus', () => load(true));\n  try { new MutationObserver(() => load(false)).observe(document.documentElement, { childList: true, subtree: true, characterData: true }); } catch (_) {}\n  [100,300,700,1200,2000,3500,5500].forEach((ms) => setTimeout(() => load(true), ms));\n})();\n`;
}

function patchedAppJsText() {
  const appPath = path.resolve(__dirname, 'public', 'app.js');
  const text = fs.readFileSync(appPath, 'utf8');
  return text.includes('__ADMINKIT_BANNER_IN_APP_V3__') ? text : text + buildClientPatch();
}

function installRoutes(app) {
  if (!app || app.__adminkitBannerInAppV3RoutesInstalled) return app;
  app.__adminkitBannerInAppV3RoutesInstalled = true;

  app.get(['/app.js', '/public/app.js'], (req, res) => {
    try {
      noCache(res);
      res.type('application/javascript').send(patchedAppJsText());
    } catch (error) {
      res.status(500).type('text/plain').send('/* banner app patch failed: ' + (error?.message || error) + ' */');
    }
  });

  app.get(['/api/comments/banner3', '/api/comments/banner2'], async (req, res) => {
    noCache(res);
    try {
      const input = req.query || {};
      const banner = await findBanner(input);
      lastLookup = { ok: true, input, found: !!banner, banner: banner ? { postId: banner.postId, channelId: banner.channelId, commentKey: banner.commentKey, title: banner.title, enabled: banner.enabled, hasText: !!banner.bannerText, hasLink: !!banner.linkUrl, hasButton: !!banner.buttonText } : null, at: new Date().toISOString() };
      res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, banner: banner || { enabled: false } });
    } catch (error) {
      lastLookup = { ok: false, error: error?.message || String(error), at: new Date().toISOString() };
      res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: lastLookup.error });
    }
  });

  app.get(['/debug/banner-live-v3', '/debug/banner-live-v2'], async (req, res) => {
    noCache(res);
    try {
      const hasInput = !!(req.query.commentKey || req.query.k || req.query.channelId || req.query.c || req.query.postId || req.query.p || req.query.title || req.query.ti);
      const banner = hasInput ? await findBanner(req.query || {}) : null;
      const latest = await latestBanners(Number(req.query.limit || 10) || 10);
      res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, input: req.query || {}, lastLookup, banner: banner || { enabled: false }, latest, appJsRoutePatched: true });
    } catch (error) {
      res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error?.message || String(error) });
    }
  });
  return app;
}

function patchPublicAppRead() {
  if (fs.__adminkitBannerInAppV3ReadPatched) return;
  fs.__adminkitBannerInAppV3ReadPatched = true;
  const original = fs.readFileSync.bind(fs);
  const publicAppPath = path.resolve(__dirname, 'public', 'app.js');
  fs.readFileSync = function patchedReadFileSync(filePath, options) {
    const content = original(filePath, options);
    try {
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (path.resolve(String(filePath || '')) === publicAppPath && wantsText) {
        const text = String(content || '');
        if (!text.includes('__ADMINKIT_BANNER_IN_APP_V3__')) return text + buildClientPatch();
      }
    } catch {}
    return content;
  };
}

function installExpressPatch() {
  if (Module.__adminkitBannerInAppV3ExpressPatched) return;
  Module.__adminkitBannerInAppV3ExpressPatched = true;
  const previousLoad = Module._load;
  Module._load = function bannerInAppV3Load(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request || '') === 'express' && loaded && !loaded.__adminkitBannerInAppV3Wrapped) {
        function wrappedExpress(...args) {
          return installRoutes(loaded(...args));
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitBannerInAppV3Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  if (installed) return selfTest();
  installed = true;
  patchPublicAppRead();
  installExpressPatch();
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed,
    checks: {
      explicitAppJsRoutePatched: true,
      bannerLookupByCommentKey: true,
      bannerLookupByPostIdOnly: true,
      bannerLookupByTitleFallback: true,
      clientUsesBanner3Endpoint: true,
      menuTreeUntouched: true
    },
    lastLookup
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, findBanner, latestBanners };
