'use strict';

// CC7.4.6 admin flow force-repatch bridge.
// Keeps Start/comments split and link preservation, and makes saved CTA/gift changes reach the channel post.
// No UI redesign, no overlay, no floating hints, no client recovery redirect.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.4.6-ADMIN-FLOW-FORCE-REPATCH';
const SOURCE = 'adminkit-cc7-4-6-admin-flow-force-repatch';
const MARKER = '__ADMINKIT_CC7_4_6_ADMIN_FLOW_FORCE_REPATCH__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (process.env.ADMINKIT_USE_OPEN_APP_BUTTON === undefined) {
  process.env.ADMINKIT_USE_OPEN_APP_BUTTON = '1';
}

const loadedLayers = [];
let installedAt = '';
let adminFlowPatch = { ok: false, skipped: true, reason: 'not_installed' };

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

function isAppJsRequest(req) {
  const u = String(req?.originalUrl || req?.url || '');
  const p = String(req?.path || '');
  return /(^|\/)app\.js(?:\?|$)/.test(u) || /(^|\/)app\.js$/.test(p);
}

function loadLayer(pathName) {
  const item = { path: pathName, ok: false, at: new Date().toISOString(), error: '' };
  try {
    const mod = require(pathName);
    const result = mod && typeof mod.install === 'function' ? mod.install() : null;
    item.ok = result?.ok !== false;
    item.runtimeVersion = result?.runtimeVersion || mod?.RUNTIME || '';
    item.marker = result?.marker || mod?.MARKER || '';
    item.result = result || null;
  } catch (error) {
    item.ok = false;
    item.error = error?.message || String(error);
    console.warn('[cc7.4.6-admin-flow] layer failed:', pathName, item.error);
  }
  loadedLayers.push(item);
  return item;
}

function readOnepassAppJs() {
  const file = path.resolve(__dirname, 'public', 'app-onepass.js');
  const source = fs.readFileSync(file, 'utf8');
  const cssPatch = `
;(() => {
  try {
    if (!document.getElementById('adminkit-cc746-comment-css')) {
      const style = document.createElement('style');
      style.id = 'adminkit-cc746-comment-css';
      style.textContent = '.comment-avatar{width:34px;height:34px;flex:0 0 34px;border-radius:999px;background:rgba(239,246,255,.96);color:var(--accent-dark,#2f78d7);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;line-height:1;overflow:hidden}.comment-row.own .comment-avatar{display:none!important}.comment-row.own .comment-bubble{margin-left:auto}.comment-row.own{justify-content:flex-end}.comment-row.other .comment-avatar:empty{display:none}.comment-author:empty{display:none}';
      document.head.appendChild(style);
    }
  } catch (_) {}
})();`;
  return source + '\n\n' + cssPatch + '\n\n;window.__ADMINKIT_SERVED_APPJS__=' + JSON.stringify({ runtimeVersion: RUNTIME, sourceMarker: SOURCE }) + ';\n';
}

function installAdminFlowPatch() {
  try {
    const store = require('./store');
    const postPatcher = require('./services/postPatcher');
    if (!postPatcher || typeof postPatcher.patchStoredPost !== 'function') {
      adminFlowPatch = { ok: false, reason: 'postPatcher_missing' };
      return adminFlowPatch;
    }
    if (postPatcher.__adminkitCc746Patched) {
      adminFlowPatch = { ok: true, already: true, runtimeVersion: RUNTIME };
      return adminFlowPatch;
    }
    const originalPatchStoredPost = postPatcher.patchStoredPost;
    function normalizeCommentKey(value) {
      return store.normalizeKey ? store.normalizeKey(value || '') : String(value || '').trim();
    }
    function markDirty(commentKey, reason) {
      const key = normalizeCommentKey(commentKey);
      if (!key || !store.getPost(key)) return { ok: false, reason: 'post_not_found_or_missing_key' };
      store.savePost(key, {
        patchedAttachments: [],
        lastPatchedFingerprint: '',
        lastPatchForceReason: reason,
        lastPatchForceAt: Date.now()
      });
      return { ok: true, commentKey: key, reason };
    }
    postPatcher.patchStoredPost = async function adminkitCc746PatchStoredPost(args = {}) {
      if (args && args.commentKey) markDirty(args.commentKey, 'cc746_before_patchStoredPost');
      return originalPatchStoredPost.call(this, args);
    };
    postPatcher.__adminkitCc746Patched = true;
    adminFlowPatch = {
      ok: true,
      runtimeVersion: RUNTIME,
      patched: ['postPatcher.patchStoredPost'],
      policy: 'saved_buttons_and_gifts_force_channel_post_repatch'
    };
    return adminFlowPatch;
  } catch (error) {
    adminFlowPatch = { ok: false, error: error?.message || String(error) };
    console.warn('[cc7.4.6-admin-flow] install skipped:', adminFlowPatch.error);
    return adminFlowPatch;
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitCc746OnepassRoutes) return app;
  app.__adminkitCc746OnepassRoutes = true;

  registerCommentOpenStateRoutes(app);

  app.get(['/public/app.js', '/app.js', '/public/app-onepass.js'], (req, res, next) => {
    try {
      noCache(res);
      res.type('application/javascript; charset=utf-8').send(readOnepassAppJs());
    } catch (error) { next(error); }
  });

  app.get('/debug/cc7', (req, res) => {
    noCache(res);
    let appOnepass = { exists: false, bytes: 0, error: '' };
    try {
      const file = path.resolve(__dirname, 'public', 'app-onepass.js');
      const stat = fs.statSync(file);
      appOnepass = { exists: true, bytes: stat.size, error: '' };
    } catch (error) {
      appOnepass = { exists: false, bytes: 0, error: error?.message || String(error) };
    }
    let buildInfo = null;
    try {
      buildInfo = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'build-info.json'), 'utf8'));
    } catch (_) {}
    res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      sourceMarker: SOURCE,
      marker: MARKER,
      installedAt,
      policy: 'admin_saved_buttons_and_gifts_force_repatch_plus_preserve_links_and_start_landing',
      appOnepass,
      adminFlowPatch,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
      buildInfo,
      loadedLayers,
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest()
    });
  });

  app.get(['/debug/ping', '/debug/version', '/debug/build-info'], (req, res) => {
    noCache(res);
    let buildInfo = null;
    try {
      buildInfo = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'build-info.json'), 'utf8'));
    } catch (_) {}
    res.json({
      ok: true,
      service: 'amio-comments-max',
      runtimeVersion: RUNTIME,
      buildVersion: RUNTIME,
      displayVersion: 'CC7.4.6',
      sourceMarker: SOURCE,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
      adminFlowPatch,
      buildInfo,
      generatedAt: Date.now(),
      installedAt,
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest()
    });
  });

  return app;
}

function patchExpressStatic(expressModule) {
  if (!expressModule || expressModule.__adminkitCc746StaticWrapped) return expressModule;
  const originalStatic = expressModule.static;
  if (typeof originalStatic !== 'function') return expressModule;
  expressModule.static = function adminkitCc746Static(...args) {
    const middleware = originalStatic.apply(this, args);
    return function adminkitCc746StaticMiddleware(req, res, next) {
      if (isAppJsRequest(req)) return next();
      return middleware(req, res, next);
    };
  };
  expressModule.__adminkitCc746StaticWrapped = true;
  return expressModule;
}

function installExpressWrap() {
  if (Module.__adminkitCc746OnepassExpressWrap) return;
  Module.__adminkitCc746OnepassExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc746OnepassLoad(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc746OnepassWrapped) {
        patchExpressStatic(loaded);
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        patchExpressStatic(wrappedExpress);
        wrappedExpress.__adminkitCc746OnepassWrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[cc7.4.6-admin-flow] express wrap skipped:', error?.message || error);
    }
    return loaded;
  };
}

function layerSummary() {
  const failed = loadedLayers.filter((x) => !x.ok);
  return {
    runtimeVersion: RUNTIME,
    marker: MARKER,
    total: loadedLayers.length,
    failed: failed.length,
    failedLayers: failed.map((x) => ({ path: x.path, error: x.error })),
    loadedLayers,
    adminFlowPatch,
    uiRedesign: false,
    servedAppJs: 'public/app-onepass.js',
    commentsOpenStateRoute: 'routes/commentOpenState.js',
    useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
    policy: 'admin_flow_force_repatch_no_ui_redesign'
  };
}

function boot() {
  if (global[MARKER]) return;
  global[MARKER] = true;
  installedAt = new Date().toISOString();
  installExpressWrap();
  installAdminFlowPatch();

  loadLayer('./db-v3-store-comment-guard');
  loadLayer('./db-v3-comment-guard');
  loadLayer('./hard-v3-menu-webhook-router');
  loadLayer('./clean-v3-menu-debug');

  require('./index');
}

boot();

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };