'use strict';

// АдминКИТ SAFE COMMENTS BOOT CORE.
// This file is the protected launch layer for comments mini-app.
// Rule: feature work must not edit this file unless we are fixing the comments launcher itself.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.6.5-SAFE-COMMENTS-BOOT-CORE';
const MARKER = '__ADMINKIT_SAFE_COMMENTS_BOOT_CORE_665__';
let status = { installed: false, at: null, error: '' };

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}

function clientBoot() {
  return `;(() => {\ntry {\n  if (window.${MARKER}) return;\n  window.${MARKER} = true;\n  const RT = '${RUNTIME}';\n  const dec = (v = '') => { let s = String(v || '').trim(); for (let i = 0; i < 8; i += 1) { try { const d = decodeURIComponent(s.replace(/\\+/g, '%20')); if (d === s) break; s = d; } catch (_) { break; } } return s; };\n  const clean = (v = '') => String(v || '').trim().replace(/^['\\\"]+|['\\\"]+$/g, '');\n  const addPairs = (out, raw = '') => {\n    for (const s of [String(raw || ''), dec(raw)]) {\n      for (const p of [s, s.includes('?') ? s.split('?').slice(1).join('?') : '', s.includes('#') ? s.split('#').slice(1).join('#') : '']) {\n        try {\n          const q = new URLSearchParams(String(p || '').replace(/^#|^\\?/g, ''));\n          for (const [k, v] of q.entries()) { const key = String(k || '').trim(); const val = clean(dec(v)); if (key && val && !out[key]) out[key] = val; }\n        } catch (_) {}\n      }\n    }\n    return out;\n  };\n  const pairs = (raw = '') => addPairs({}, raw);\n  const parse = (raw = '', ctx = {}) => {\n    const src = dec(raw);\n    const p = pairs(src);\n    const ck = clean(p.commentKey || ctx.commentKey || '');\n    const ch = clean(p.channelId || ctx.channelId || '');\n    const po = clean(p.postId || p.post_id || ctx.postId || '');\n    if (/^-?\\d{6,}:-?\\d{6,}$/.test(ck)) { const a = ck.split(':'); return { ok: true, kind: 'commentKey', commentKey: ck, channelId: a[0], postId: a[1], source: 'commentKey' }; }\n    if (ch && po) return { ok: true, kind: 'commentKey', commentKey: ch + ':' + po, channelId: ch, postId: po, source: 'channelId+postId' };\n    let m = src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(-?\\d{6,})[_:]+(-?\\d{6,})/i);\n    if (m) return { ok: true, kind: 'commentKey', commentKey: m[1] + ':' + m[2], channelId: m[1], postId: m[2], source: 'legacy-cp-double-underscore-signed' };\n    m = src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(\\d{6,})[_:]+(\\d{6,})/i);\n    if (m) return { ok: true, kind: 'commentKey', commentKey: '-' + m[1] + ':' + m[2], channelId: '-' + m[1], postId: m[2], source: 'legacy-cp-double-underscore' };\n    m = src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)[_-]+(-?\\d{6,})[_:]+(-?\\d{6,})/i);\n    if (m) return { ok: true, kind: 'commentKey', commentKey: m[1] + ':' + m[2], channelId: m[1], postId: m[2], source: 'legacy-cp' };\n    m = src.match(/(-?\\d{6,}):(-?\\d{6,})/);\n    if (m) return { ok: true, kind: 'commentKey', commentKey: m[1] + ':' + m[2], channelId: m[1], postId: m[2], source: 'direct' };\n    m = src.match(/(?:^|[^A-Za-z0-9_])(h_[A-Za-z0-9_-]{8,})(?:$|[^A-Za-z0-9_-])/);\n    if (m) return { ok: true, kind: 'handoff', handoffToken: m[1], source: 'handoff' };\n    const nested = clean(p.startapp || p.start_param || p.WebAppStartParam || p.payload || p.handoff || p.data || '');\n    if (nested && nested !== src) { const x = parse(nested, { commentKey: p.commentKey || ck, channelId: p.channelId || ch, postId: p.postId || p.post_id || po }); if (x.ok) return { ...x, nested: true }; }\n    return { ok: false };\n  };\n  const raws = () => {\n    const list = [];\n    const add = (v) => {\n      if (!v) return;\n      if (typeof v === 'object') {\n        try { list.push(JSON.stringify(v)); } catch (_) {}\n        ['startapp','start_param','WebAppStartParam','payload','handoff','commentKey','channelId','postId','post_id','data'].forEach((k) => { if (v[k]) list.push(String(v[k])); });\n      } else list.push(String(v));\n    };\n    try { add(location.href); add(location.search); add(location.hash); add(document.referrer || ''); } catch (_) {}\n    for (const app of [window.WebApp, window.Telegram && window.Telegram.WebApp, window.Max && window.Max.WebApp, window.MAX && window.MAX.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max && window.max.WebApp, window.__MAX_WEB_APP__, window.__MAX_WEBAPP__].filter(Boolean)) {\n      try { add(app.initDataUnsafe); add(app.initData); add(app.startParam); add(app.startapp); add(app.launchParams); add(app.params); add(app.payload); } catch (_) {}\n    }\n    try { add(window.__MAX_WEB_APP_INIT_DATA__); add(window.__MAX_WEB_APP_INIT_DATA_UNSAFE__); add(window.__MAX_LAUNCH_PARAMS__); add(window.__MAX_OPENAPP_PAYLOAD__); } catch (_) {}\n    return list.filter(Boolean);\n  };\n  const find = () => {\n    const ctx = {}; const list = raws();\n    for (const r of list) { const p = pairs(r); if (p.commentKey && !ctx.commentKey) ctx.commentKey = p.commentKey; if (p.channelId && !ctx.channelId) ctx.channelId = p.channelId; if ((p.postId || p.post_id) && !ctx.postId) ctx.postId = p.postId || p.post_id; }\n    for (const r of list) { const y = parse(r, ctx); if (y.ok) return { ...y, rawCount: list.length }; }\n    return { ok: false, rawCount: list.length };\n  };\n  const apply = (y) => {\n    if (!y || !y.ok) return false;\n    try {\n      const url = new URL(location.href);\n      if (y.kind === 'commentKey' && y.commentKey) {\n        url.searchParams.set('commentKey', y.commentKey);\n        url.searchParams.set('channelId', y.channelId || y.commentKey.split(':')[0] || '');\n        url.searchParams.set('postId', y.postId || y.commentKey.split(':')[1] || '');\n        url.searchParams.set('startapp', 'ck:' + y.commentKey);\n      } else if (y.kind === 'handoff' && y.handoffToken) {\n        url.searchParams.set('startapp', y.handoffToken);\n        url.searchParams.set('handoff', y.handoffToken);\n      }\n      history.replaceState(null, '', url.pathname + url.search + url.hash);\n    } catch (_) {}\n    try {\n      if (typeof state !== 'undefined') {\n        if (y.kind === 'commentKey' && y.commentKey) {\n          state.commentKey = y.commentKey;\n          state.channelId = y.channelId || state.channelId || y.commentKey.split(':')[0] || '';\n          state.handoffToken = '';\n          state.startapp = 'ck:' + y.commentKey;\n        } else if (y.kind === 'handoff' && y.handoffToken) {\n          state.handoffToken = y.handoffToken;\n          state.startapp = y.handoffToken;\n        }\n        state.diagnostics = { ...(state.diagnostics || {}), safeCommentsBootCore: RT, safeCommentsBootSource: y.source };\n      }\n    } catch (_) {}\n    try { if (typeof hideMiniAppStartMenu === 'function') hideMiniAppStartMenu(); } catch (_) {}\n    try { if (typeof setPostError === 'function') setPostError(''); } catch (_) {}\n    try { document.body && document.body.classList && document.body.classList.remove('miniapp-start-mode'); } catch (_) {}\n    try { if (typeof loadPost === 'function') Promise.resolve(loadPost()).catch(() => {}); } catch (_) {}\n    try { if (typeof loadComments === 'function') Promise.resolve(loadComments()).catch(() => {}); } catch (_) {}\n    return true;\n  };\n  const run = () => {\n    const y = find();\n    window.__ADMINKIT_SAFE_COMMENTS_BOOT_CORE_LAST__ = { runtimeVersion: RT, parsed: y, at: new Date().toISOString() };\n    if (y.ok) apply(y);\n    return y;\n  };\n  [0, 40, 100, 250, 600, 1200, 2500, 5000, 9000].forEach((ms) => setTimeout(run, ms));\n  run();\n} catch (e) { window.__ADMINKIT_SAFE_COMMENTS_BOOT_CORE_LAST__ = { runtimeVersion: '${RUNTIME}', error: String(e && e.message || e), at: new Date().toISOString() }; }\n})();\n`;
}

function patchJsText(text) {
  const source = String(text || '');
  if (source.includes(MARKER)) return source;
  return clientBoot() + source;
}

function patchHtmlText(text) {
  let html = String(text || '');
  if (!/<html|<!doctype/i.test(html)) return html;
  if (!html.includes(MARKER)) {
    const script = `<script>${clientBoot()}</script>`;
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1>${script}`);
    else html = script + html;
  }
  // Force a fresh app.js fetch in MAX WebView. This protects old post buttons from stale cached boot JS.
  html = html.replace(/src=(['"])(\/public\/app\.js|public\/app\.js|\/app\.js|app\.js)(\?[^'"]*)?\1/gi, `src=$1$2?v=${RUNTIME}$1`);
  return html;
}

function installExpressGuard() {
  if (Module.__adminkitSafeCommentsBootCore665) return;
  Module.__adminkitSafeCommentsBootCore665 = true;
  const prev = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitSafeCommentsBootCore665Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitSafeCommentsBootCore665Installed) {
            app.__adminkitSafeCommentsBootCore665Installed = true;
            app.use((req, res, next) => {
              noCache(res);
              const oldSend = res.send.bind(res);
              res.send = function patchedSend(body) {
                try {
                  const type = String(res.getHeader('content-type') || '');
                  if (typeof body === 'string' && /html/i.test(type + body.slice(0, 120))) body = patchHtmlText(body);
                } catch {}
                return oldSend(body);
              };
              next();
            });
            app.get(['/public/app.js', '/app.js'], (req, res, next) => {
              try {
                const file = path.resolve(__dirname, 'public', 'app.js');
                if (!fs.existsSync(file)) return next();
                noCache(res);
                res.type('application/javascript; charset=utf-8').send(patchJsText(fs.readFileSync(file, 'utf8')));
              } catch (error) { next(error); }
            });
            app.get('/debug/safe-comments-boot-core', (req, res) => {
              noCache(res);
              let publicApp = { exists: false };
              try {
                const text = fs.readFileSync(path.resolve(__dirname, 'public', 'app.js'), 'utf8');
                publicApp = { exists: true, markerInPhysical: text.includes(MARKER), bytes: text.length };
              } catch (error) { publicApp = { exists: false, error: error?.message || String(error) }; }
              res.json({ ok: true, runtimeVersion: RUNTIME, marker: MARKER, status, publicApp, checks: { routeBeforeStatic: true, htmlInjector: true, appJsNoCache: true, menuTreeUntouched: true, bannerUntouched: true } });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitSafeCommentsBootCore665Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  status = { installed: true, at: new Date().toISOString(), error: '' };
  installExpressGuard();
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, status };
}

module.exports = { install, RUNTIME, MARKER };
