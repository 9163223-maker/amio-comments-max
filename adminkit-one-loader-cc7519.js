'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.5.19-LEAD-MAGNETS-NAMING-CORE';
const SOURCE = 'adminkit-cc7-5-19-lead-magnets-naming-core';
const MARKER = '__ADMINKIT_CC7_5_19_LEAD_MAGNETS_NAMING_LOADER__';
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (process.env.ADMINKIT_USE_OPEN_APP_BUTTON === undefined) process.env.ADMINKIT_USE_OPEN_APP_BUTTON = '1';

let installedAt = '';
const loadedLayers = [];
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function readBuildInfo() { try { return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'build-info.json'), 'utf8')); } catch { return null; } }
function fileInfo(relPath, marker) {
  try { const file = path.resolve(__dirname, relPath); const stat = fs.statSync(file); const text = fs.readFileSync(file, 'utf8').slice(0, 3000); return { exists: true, bytes: stat.size, markerFound: marker ? text.includes(marker) : true }; }
  catch (error) { return { exists: false, bytes: 0, markerFound: false, error: error?.message || String(error) }; }
}
function loadLayer(pathName) {
  const item = { path: pathName, ok: false, at: new Date().toISOString(), error: '' };
  try { const mod = require(pathName); const result = mod && typeof mod.install === 'function' ? mod.install() : null; item.ok = result?.ok !== false; item.runtimeVersion = result?.runtimeVersion || mod?.RUNTIME || ''; item.marker = result?.marker || mod?.MARKER || ''; item.result = result || null; }
  catch (error) { item.error = error?.message || String(error); console.warn('[cc7.5.19] layer failed:', pathName, item.error); }
  loadedLayers.push(item);
  return item;
}
function installRoutes(app) {
  if (!app || app.__adminkitCc7519Routes) return app;
  app.__adminkitCc7519Routes = true;
  registerCommentOpenStateRoutes(app);
  app.get('/debug/cc7', (req, res) => {
    noCache(res);
    res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installedAt,
      policy: 'lead_magnets_naming_only_over_7518_keep_routes_and_db',
      publicApp: fileInfo('public/app.js', 'CC7.5.6-PUBLIC-APP-COMMENT-UI-SEND-GUARD'),
      appOnepass: fileInfo('public/app-onepass.js', 'CC7.5.6-COMMENT-UI-SEND-GUARD'),
      appJsOverride: { ok: false, removed: true },
      adminFlow: (() => { try { return require('./adminkit-admin-flows-7519').selfTest(); } catch (e) { return { ok: false, error: e?.message || String(e) }; } })(),
      postPatcher: (() => { try { return require('./db-v3-post-patcher').selfTest(); } catch (e) { return { ok: false, error: e?.message || String(e) }; } })(),
      buildInfo: readBuildInfo(), loadedLayers,
      audit: { commentsCore: 'unchanged from accepted CC7.5.6', buttonsCore: 'unchanged from accepted CC7.5.16', leadMagnetsCore: 'presentation rename over CC7.5.18 only', internalRoutes: 'gifts:* kept for compatibility', dbFields: 'gift_* and gifts_* kept for compatibility', noExternalAppButton: true, noOverlay: true, optimizationNote: 'small controlled naming layer now; later merge admin flow wrappers into one clean core' },
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest(), generatedAt: Date.now() });
  });
  app.get(['/debug/ping', '/debug/version', '/debug/build-info'], (req, res) => { noCache(res); res.json({ ok: true, runtimeVersion: RUNTIME, displayVersion: 'CC7.5.19', sourceMarker: SOURCE, buildInfo: readBuildInfo(), loadedLayers, generatedAt: Date.now() }); });
  return app;
}
function installExpressWrap() {
  if (Module.__adminkitCc7519ExpressWrap) return;
  Module.__adminkitCc7519ExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc7519Load(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    if (String(request) === 'express' && loaded && !loaded.__adminkitCc7519Wrapped) {
      function wrappedExpress(...args) { return installRoutes(loaded(...args)); }
      Object.setPrototypeOf(wrappedExpress, loaded);
      Object.assign(wrappedExpress, loaded);
      wrappedExpress.__adminkitCc7519Wrapped = true;
      return wrappedExpress;
    }
    return loaded;
  };
}
function boot() {
  if (global[MARKER]) return;
  global[MARKER] = true;
  installedAt = new Date().toISOString();
  installExpressWrap();
  loadLayer('./db-v3-store-comment-guard');
  loadLayer('./db-v3-comment-guard');
  loadLayer('./hard-v3-menu-webhook-router');
  loadLayer('./clean-v3-menu-debug');
  require('./index');
}
boot();
module.exports = { RUNTIME, SOURCE, MARKER };
