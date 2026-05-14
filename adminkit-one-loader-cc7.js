'use strict';

// CC7.2.8 clean runtime bridge.
// No UI overlay, no floating hints, no client recovery layer.
// Keeps the existing one-pass app.js and focuses the next work on canonical post snapshot rendering.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.2.8-CLEAN-NO-RECOVERY-LAYERS';
const SOURCE = 'adminkit-cc7-2-8-clean-no-recovery-layers';
const MARKER = '__ADMINKIT_CC7_2_8_CLEAN_NO_RECOVERY_LAYERS__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

const loadedLayers = [];
let installedAt = '';

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
    console.warn('[cc7.2.8-clean] layer failed:', pathName, item.error);
  }
  loadedLayers.push(item);
  return item;
}

function readOnepassAppJs() {
  const file = path.resolve(__dirname, 'public', 'app-onepass.js');
  const source = fs.readFileSync(file, 'utf8');
  return source + '\n\n;window.__ADMINKIT_SERVED_APPJS__=' + JSON.stringify({ runtimeVersion: RUNTIME, sourceMarker: SOURCE }) + ';\n';
}

function installRoutes(app) {
  if (!app || app.__adminkitCc728OnepassRoutes) return app;
  app.__adminkitCc728OnepassRoutes = true;

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
    res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      sourceMarker: SOURCE,
      marker: MARKER,
      installedAt,
      policy: 'clean_no_recovery_layers_serve_onepass_app_js_only',
      appOnepass,
      loadedLayers,
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest()
    });
  });

  app.get(['/debug/ping', '/debug/version'], (req, res) => {
    noCache(res);
    res.json({
      ok: true,
      service: 'amio-comments-max',
      runtimeVersion: RUNTIME,
      buildVersion: RUNTIME,
      displayVersion: 'CC7.2.8',
      sourceMarker: SOURCE,
      generatedAt: Date.now(),
      installedAt
    });
  });

  return app;
}

function patchExpressStatic(expressModule) {
  if (!expressModule || expressModule.__adminkitCc728StaticWrapped) return expressModule;
  const originalStatic = expressModule.static;
  if (typeof originalStatic !== 'function') return expressModule;
  expressModule.static = function adminkitCc728Static(...args) {
    const middleware = originalStatic.apply(this, args);
    return function adminkitCc728StaticMiddleware(req, res, next) {
      if (isAppJsRequest(req)) return next();
      return middleware(req, res, next);
    };
  };
  expressModule.__adminkitCc728StaticWrapped = true;
  return expressModule;
}

function installExpressWrap() {
  if (Module.__adminkitCc728OnepassExpressWrap) return;
  Module.__adminkitCc728OnepassExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc728OnepassLoad(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc728OnepassWrapped) {
        patchExpressStatic(loaded);
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        patchExpressStatic(wrappedExpress);
        wrappedExpress.__adminkitCc728OnepassWrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[cc7.2.8-clean] express wrap skipped:', error?.message || error);
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
    uiRedesign: false,
    servedAppJs: 'public/app-onepass.js',
    commentsOpenStateRoute: 'routes/commentOpenState.js',
    policy: 'clean_no_recovery_layers_no_overlay_no_float_hints'
  };
}

function boot() {
  if (global[MARKER]) return;
  global[MARKER] = true;
  installedAt = new Date().toISOString();
  installExpressWrap();

  // Backend-only layers kept temporarily. No old comments repaint/observer layers are loaded here.
  loadLayer('./db-v3-store-comment-guard');
  loadLayer('./db-v3-comment-guard');
  loadLayer('./hard-v3-menu-webhook-router');
  loadLayer('./clean-v3-menu-debug');

  require('./index');
}

boot();

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };
