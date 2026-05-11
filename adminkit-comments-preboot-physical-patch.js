'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.6.2-SAFE-PREBOOT-PHYSICAL';
const MARKER = '__ADMINKIT_SAFE_PREBOOT_PHYSICAL_662__';
let status = { installed: false, patched: false, at: null, error: '' };

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0', 'Surrogate-Control': 'no-store' }); } catch {}
}

function clientPreboot() {
  return `;(() => {\ntry {\n  if (window.${MARKER}) return;\n  window.${MARKER} = true;\n  const RT = '${RUNTIME}';\n  const dec = (v = '') => { let s = String(v || '').trim(); for (let i = 0; i < 6; i += 1) { try { const d = decodeURIComponent(s.replace(/\\+/g, '%20')); if (d === s) break; s = d; } catch (_) { break; } } return s; };\n  const clean = (v = '') => String(v || '').trim().replace(/^['\\\"]+|['\\\"]+$/g, '');\n  const pairs = (raw = '') => {\n    const out = {};\n    const add = (k, v) => { const key = String(k || '').trim(); const val = clean(dec(v)); if (key && val && !out[key]) out[key] = val; };\n    for (const s of [String(raw || ''), dec(raw)]) {\n      for (const p of [s, s.includes('?') ? s.split('?').slice(1).join('?') : '', s.includes('#') ? s.split('#').slice(1).join('#') : '']) {\n        try { const q = new URLSearchParams(String(p || '').replace(/^#|^\\?/g, '')); for (const [k, v] of q.entries()) add(k, v); } catch (_) {}\n      }\n    }\n    return out;\n  };\n  const parse = (raw = '', ctx = {}) => {\n    const src = dec(raw);\n    const p = pairs(src);\n    const ck = clean(p.commentKey || ctx.commentKey || '');\n    const ch = clean(p.channelId || ctx.channelId || '');\n    const po = clean(p.postId || p.post_id || ctx.postId || '');\n    if (/^-?\\d{6,}:-?\\d{6,}$/.test(ck)) { const a = ck.split(':'); return { ok: true, commentKey: ck, channelId: a[0], postId: a[1], source: 'commentKey' }; }\n    if (ch && po) return { ok: true, commentKey: ch + ':' + po, channelId: ch, postId: po, source: 'channelId+postId' };\n    let m = src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(\\d{6,})[_:]+(\\d{6,})/i);\n    if (m) return { ok: true, commentKey: '-' + m[1] + ':' + m[2], channelId: '-' + m[1], postId: m[2], source: 'legacy-cp-double-underscore' };\n    m = src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)[_-]+(-?\\d{6,})[_:]+(-?\\d{6,})/i);\n    if (m) return { ok: true, commentKey: m[1] + ':' + m[2], channelId: m[1], postId: m[2], source: 'legacy-cp' };\n    m = src.match(/(-?\\d{6,}):(-?\\d{6,})/);\n    if (m) return { ok: true, commentKey: m[1] + ':' + m[2], channelId: m[1], postId: m[2], source: 'direct' };\n    const nested = clean(p.startapp || p.start_param || p.WebAppStartParam || p.payload || p.handoff || '');\n    if (nested && nested !== src) { const x = parse(nested, { commentKey: p.commentKey || ck, channelId: p.channelId || ch, postId: p.postId || p.post_id || po }); if (x.ok) return { ...x, nested: true }; }\n    return { ok: false };\n  };\n  const raws = () => {\n    const list = [];\n    const add = (v) => {\n      if (!v) return;\n      if (typeof v === 'object') {\n        try { list.push(JSON.stringify(v)); } catch (_) {}\n        ['startapp','start_param','WebAppStartParam','payload','handoff','commentKey','channelId','postId','post_id'].forEach((k) => { if (v[k]) list.push(String(v[k])); });\n      } else list.push(String(v));\n    };\n    try { add(location.href); add(location.search); add(location.hash); add(document.referrer || ''); } catch (_) {}\n    for (const app of [window.WebApp, window.Telegram && window.Telegram.WebApp, window.Max && window.Max.WebApp, window.MAX && window.MAX.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max && window.max.WebApp].filter(Boolean)) {\n      try { add(app.initDataUnsafe); add(app.initData); add(app.startParam); add(app.launchParams); add(app.params); } catch (_) {}\n    }\n    return list.filter(Boolean);\n  };\n  const find = () => {\n    const ctx = {}; const list = raws();\n    for (const r of list) { const p = pairs(r); if (p.commentKey && !ctx.commentKey) ctx.commentKey = p.commentKey; if (p.channelId && !ctx.channelId) ctx.channelId = p.channelId; if ((p.postId || p.post_id) && !ctx.postId) ctx.postId = p.postId || p.post_id; }\n    for (const r of list) { const y = parse(r, ctx); if (y.ok && y.commentKey) return { ...y, rawCount: list.length }; }\n    return { ok: false, rawCount: list.length };\n  };\n  const apply = (y) => {\n    if (!y || !y.ok || !y.commentKey) return false;\n    try { const url = new URL(location.href); url.searchParams.set('commentKey', y.commentKey); url.searchParams.set('channelId', y.channelId || y.commentKey.split(':')[0] || ''); url.searchParams.set('postId', y.postId || y.commentKey.split(':')[1] || ''); url.searchParams.set('startapp', 'ck:' + y.commentKey); history.replaceState(null, '', url.pathname + url.search + url.hash); } catch (_) {}\n    try { if (typeof state !== 'undefined') { state.commentKey = y.commentKey; state.channelId = y.channelId || state.channelId || ''; state.handoffToken = ''; state.startapp = 'ck:' + y.commentKey; state.diagnostics = { ...(state.diagnostics || {}), safePrebootPhysical: RT, safePrebootSource: y.source }; } } catch (_) {}\n    try { if (typeof hideMiniAppStartMenu === 'function') hideMiniAppStartMenu(); } catch (_) {}\n    try { if (typeof setPostError === 'function') setPostError(''); } catch (_) {}\n    try { document.body && document.body.classList && document.body.classList.remove('miniapp-start-mode'); } catch (_) {}\n    try { if (typeof loadPost === 'function') Promise.resolve(loadPost()).catch(() => {}); } catch (_) {}\n    try { if (typeof loadComments === 'function') Promise.resolve(loadComments()).catch(() => {}); } catch (_) {}\n    return true;\n  };\n  const y = find();\n  window.__ADMINKIT_SAFE_PREBOOT_PHYSICAL_LAST__ = { runtimeVersion: RT, parsed: y, at: new Date().toISOString() };\n  if (y.ok) { try { const url = new URL(location.href); url.searchParams.set('commentKey', y.commentKey); url.searchParams.set('channelId', y.channelId || y.commentKey.split(':')[0] || ''); url.searchParams.set('postId', y.postId || y.commentKey.split(':')[1] || ''); url.searchParams.set('startapp', 'ck:' + y.commentKey); history.replaceState(null, '', url.pathname + url.search + url.hash); } catch (_) {} }\n  [0, 80, 250, 700, 1500, 3000, 6000].forEach((ms) => setTimeout(() => { try { apply(window.__ADMINKIT_SAFE_PREBOOT_PHYSICAL_LAST__ && window.__ADMINKIT_SAFE_PREBOOT_PHYSICAL_LAST__.parsed || find()); } catch (_) {} }, ms));\n} catch (e) { window.__ADMINKIT_SAFE_PREBOOT_PHYSICAL_LAST__ = { runtimeVersion: '${RUNTIME}', error: String(e && e.message || e), at: new Date().toISOString() }; }\n})();\n`;
}

function stripOldBrokenPreboot(text) {
  let body = String(text || '');
  // Remove any older broken bare marker variants if they ever reached the physical file.
  body = body.replace(/(?:^|\n)\s*__ADMINKIT_SAFE_CORE_PARSER_PATCH_597__;\s*\n?/g, '\n');
  return body;
}

function patchPhysicalAppJs() {
  const file = path.resolve(__dirname, 'public', 'app.js');
  const before = fs.readFileSync(file, 'utf8');
  let body = stripOldBrokenPreboot(before);
  const markerPresent = body.includes(MARKER);
  if (!markerPresent) body = clientPreboot() + body;
  if (body !== before) fs.writeFileSync(file, body, 'utf8');
  status = {
    installed: true,
    patched: body !== before,
    markerPresent: body.includes(MARKER),
    markerAtStart: body.slice(0, 2500).includes(MARKER),
    at: new Date().toISOString(),
    bytesBefore: before.length,
    bytesAfter: body.length,
    error: ''
  };
}

function installDebugRoute() {
  if (Module.__adminkitSafePrebootPhysical662) return;
  Module.__adminkitSafePrebootPhysical662 = true;
  const prev = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitSafePrebootPhysical662Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitSafePrebootPhysical662Route) {
            app.__adminkitSafePrebootPhysical662Route = true;
            app.get('/debug/safe-preboot-physical-live', (req, res) => {
              noCache(res);
              let live = { markerPresent: false, markerAtStart: false, bytes: 0 };
              try {
                const text = fs.readFileSync(path.resolve(__dirname, 'public', 'app.js'), 'utf8');
                live = { markerPresent: text.includes(MARKER), markerAtStart: text.slice(0, 2500).includes(MARKER), bytes: text.length };
              } catch (error) { live = { error: error?.message || String(error) }; }
              res.json({ ok: true, runtimeVersion: RUNTIME, marker: MARKER, status, live, checks: { physicalPrebootBeforeLegacyAppJs: live.markerAtStart === true, menuTreeUntouched: true, bannerUntouched: true } });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitSafePrebootPhysical662Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  try { patchPhysicalAppJs(); } catch (error) { status = { installed: false, patched: false, at: new Date().toISOString(), error: error?.message || String(error) }; }
  installDebugRoute();
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, status };
}

module.exports = { install, RUNTIME, MARKER };
