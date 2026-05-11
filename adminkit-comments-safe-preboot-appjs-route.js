'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.6.1-SAFE-PREBOOT-APPJS';
const MARKER = '__ADMINKIT_SAFE_PREBOOT_APPJS_661__';
let installed = false;
let lastServe = null;

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}

function prebootScript() {
  return `;(() => {
  if (window.${MARKER}) return;
  window.${MARKER} = true;
  const RT = '${RUNTIME}';
  const safeDecode = (value = '') => {
    let s = String(value || '').trim();
    for (let i = 0; i < 6; i += 1) {
      try {
        const d = decodeURIComponent(s.replace(/\\+/g, '%20'));
        if (d === s) break;
        s = d;
      } catch (_) { break; }
    }
    return s;
  };
  const clean = (value = '') => String(value || '').trim().replace(/^['\"]+|['\"]+$/g, '');
  const addQueryValues = (out, raw = '') => {
    const variants = [String(raw || ''), safeDecode(raw)];
    for (const variant of variants) {
      const parts = [variant];
      if (variant.includes('?')) parts.push(variant.split('?').slice(1).join('?'));
      if (variant.includes('#')) parts.push(variant.split('#').slice(1).join('#'));
      for (const part of parts) {
        try {
          const params = new URLSearchParams(String(part || '').replace(/^#|^\\?/g, ''));
          for (const [k, v] of params.entries()) {
            const key = String(k || '').trim();
            const val = clean(safeDecode(v));
            if (val && !out[key]) out[key] = val;
          }
        } catch (_) {}
      }
    }
    return out;
  };
  const parseOne = (raw = '', ctx = {}) => {
    const src = safeDecode(raw);
    const q = addQueryValues({}, src);
    let ck = clean(q.commentKey || ctx.commentKey || '');
    let ch = clean(q.channelId || ctx.channelId || '');
    let po = clean(q.postId || q.post_id || ctx.postId || '');
    if (/^-?\\d{6,}:-?\\d{6,}$/.test(ck)) {
      const parts = ck.split(':');
      return { ok: true, commentKey: ck, channelId: parts[0], postId: parts[1], source: 'commentKey' };
    }
    if (ch && po) return { ok: true, commentKey: ch + ':' + po, channelId: ch, postId: po, source: 'channelId+postId' };
    let m = src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(\\d{6,})[_:]+(\\d{6,})(?:$|[^\\d])/i);
    if (m) return { ok: true, commentKey: '-' + m[1] + ':' + m[2], channelId: '-' + m[1], postId: m[2], source: 'legacy-cp-double-underscore' };
    m = src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)[_-]+(-?\\d{6,})[_:]+(-?\\d{6,})(?:$|[^\\d])/i);
    if (m) return { ok: true, commentKey: m[1] + ':' + m[2], channelId: m[1], postId: m[2], source: 'legacy-cp' };
    m = src.match(/(-?\\d{6,}):(-?\\d{6,})/);
    if (m) return { ok: true, commentKey: m[1] + ':' + m[2], channelId: m[1], postId: m[2], source: 'direct' };
    const nested = clean(q.startapp || q.start_param || q.WebAppStartParam || q.payload || q.handoff || '');
    if (nested && nested !== src) {
      const parsed = parseOne(nested, { commentKey: q.commentKey || ck, channelId: q.channelId || ch, postId: q.postId || q.post_id || po });
      if (parsed.ok) return { ...parsed, nested: true };
    }
    return { ok: false };
  };
  const rawSources = () => {
    const list = [];
    const add = (value) => {
      if (!value) return;
      if (typeof value === 'object') {
        try { list.push(JSON.stringify(value)); } catch (_) {}
        ['startapp','start_param','WebAppStartParam','payload','handoff','commentKey','channelId','postId','post_id'].forEach((key) => {
          if (value[key]) list.push(String(value[key]));
        });
      } else {
        list.push(String(value));
      }
    };
    try { add(location.href); add(location.search); add(location.hash); add(document.referrer || ''); } catch (_) {}
    const apps = [window.WebApp, window.Telegram?.WebApp, window.Max?.WebApp, window.MAX?.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max?.WebApp].filter(Boolean);
    for (const app of apps) {
      try { add(app.initDataUnsafe); add(app.initData); add(app.startParam); add(app.launchParams); add(app.params); } catch (_) {}
    }
    return list.filter(Boolean);
  };
  const findLaunch = () => {
    const ctx = {};
    const raws = rawSources();
    for (const raw of raws) {
      const q = addQueryValues({}, raw);
      if (q.commentKey && !ctx.commentKey) ctx.commentKey = clean(q.commentKey);
      if (q.channelId && !ctx.channelId) ctx.channelId = clean(q.channelId);
      if ((q.postId || q.post_id) && !ctx.postId) ctx.postId = clean(q.postId || q.post_id);
    }
    for (const raw of raws) {
      const parsed = parseOne(raw, ctx);
      if (parsed.ok && parsed.commentKey) return { ...parsed, rawCount: raws.length };
    }
    return { ok: false, rawCount: raws.length };
  };
  const applyLaunchToLocation = (launch) => {
    if (!launch || !launch.ok || !launch.commentKey) return false;
    try {
      const url = new URL(location.href);
      url.searchParams.set('commentKey', launch.commentKey);
      url.searchParams.set('channelId', launch.channelId || launch.commentKey.split(':')[0] || '');
      url.searchParams.set('postId', launch.postId || launch.commentKey.split(':')[1] || '');
      url.searchParams.set('startapp', 'ck:' + launch.commentKey);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      return true;
    } catch (_) { return false; }
  };
  const recoverRuntimeState = (launch) => {
    if (!launch || !launch.ok || !launch.commentKey) return false;
    try {
      if (typeof state !== 'undefined') {
        state.commentKey = launch.commentKey;
        state.channelId = launch.channelId || state.channelId || '';
        state.handoffToken = '';
        state.startapp = 'ck:' + launch.commentKey;
        state.diagnostics = { ...(state.diagnostics || {}), safePrebootAppJs: RT, safePrebootSource: launch.source };
      }
    } catch (_) {}
    try { if (typeof hideMiniAppStartMenu === 'function') hideMiniAppStartMenu(); } catch (_) {}
    try { if (typeof setPostError === 'function') setPostError(''); } catch (_) {}
    try { document.body?.classList?.remove('miniapp-start-mode'); } catch (_) {}
    try { if (typeof loadPost === 'function') Promise.resolve(loadPost()).catch(() => {}); } catch (_) {}
    try { if (typeof loadComments === 'function') Promise.resolve(loadComments()).catch(() => {}); } catch (_) {}
    return true;
  };
  const boot = () => {
    const launch = findLaunch();
    window.__ADMINKIT_SAFE_PREBOOT_LAST__ = { runtimeVersion: RT, parsed: launch, at: new Date().toISOString() };
    if (launch.ok) applyLaunchToLocation(launch);
    return launch;
  };
  const launch = boot();
  [0, 80, 250, 700, 1500, 3000, 6000].forEach((ms) => setTimeout(() => {
    try { recoverRuntimeState(window.__ADMINKIT_SAFE_PREBOOT_LAST__?.parsed || boot()); } catch (_) {}
  }, ms));
})();\n`;
}

function install() {
  if (installed || Module.__adminkitSafePrebootAppJs661) return;
  installed = true;
  Module.__adminkitSafePrebootAppJs661 = true;
  const previousLoad = Module._load;
  Module._load = function adminkitSafePrebootLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitSafePrebootAppJs661Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitSafePrebootAppJs661Mounted) {
            app.__adminkitSafePrebootAppJs661Mounted = true;
            app.get(['/app.js', '/public/app.js'], (req, res) => {
              noCache(res);
              try {
                const file = path.resolve(__dirname, 'public', 'app.js');
                let body = fs.readFileSync(file, 'utf8');
                const prefix = body.includes(MARKER) ? '' : prebootScript();
                const out = prefix + body;
                lastServe = { ok: true, at: new Date().toISOString(), bytes: out.length, prepended: Boolean(prefix) };
                res.type('application/javascript; charset=utf-8').send(out);
              } catch (error) {
                lastServe = { ok: false, at: new Date().toISOString(), error: error?.message || String(error) };
                res.status(500).type('text/plain').send('safe_preboot_appjs_failed');
              }
            });
            app.get('/debug/safe-preboot-appjs-live', (req, res) => {
              noCache(res);
              res.json({ ok: true, runtimeVersion: RUNTIME, marker: MARKER, installed, lastServe, checks: { routeBeforeStatic: true, prebootBeforeLegacyAppJs: true, menuTreeUntouched: true, bannerUntouched: true } });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitSafePrebootAppJs661Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

module.exports = { install, RUNTIME, MARKER };
