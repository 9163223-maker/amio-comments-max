'use strict';

// CC7.5.6 comment UI send guard.
// public/app.js remains the real entrypoint. No /public/app.js server override here.
// Comments open-state core is intentionally untouched from the accepted CC7.5.5 base.

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.5.6-COMMENT-UI-SEND-GUARD';
const SOURCE = 'adminkit-cc7-5-6-comment-ui-send-guard';
const MARKER = '__ADMINKIT_CC7_5_6_COMMENT_UI_SEND_GUARD_LOADER__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (process.env.ADMINKIT_USE_OPEN_APP_BUTTON === undefined) process.env.ADMINKIT_USE_OPEN_APP_BUTTON = '1';

let installedAt = '';
const loadedLayers = [];
let adminFlowPatch = { ok: false, reason: 'not_installed' };

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

function readBuildInfo() {
  try { return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'build-info.json'), 'utf8')); }
  catch { return null; }
}

function fileInfo(relPath, marker) {
  try {
    const file = path.resolve(__dirname, relPath);
    const stat = fs.statSync(file);
    const text = fs.readFileSync(file, 'utf8').slice(0, 1600);
    return { exists: true, bytes: stat.size, markerFound: marker ? text.includes(marker) : true };
  } catch (error) {
    return { exists: false, bytes: 0, markerFound: false, error: error?.message || String(error) };
  }
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
    console.warn('[cc7.5.6] layer failed:', pathName, item.error);
  }
  loadedLayers.push(item);
  return item;
}

function installAdminFlowPatch() {
  try {
    const store = require('./store');
    const postPatcher = require('./services/postPatcher');
    if (!postPatcher || typeof postPatcher.patchStoredPost !== 'function') {
      adminFlowPatch = { ok: false, reason: 'postPatcher_missing' };
      return adminFlowPatch;
    }
    if (postPatcher.__adminkitCc756Patched || postPatcher.__adminkitCc755Patched || postPatcher.__adminkitCc754Patched || postPatcher.__adminkitCc747Patched) {
      adminFlowPatch = { ok: true, already: true, runtimeVersion: RUNTIME };
      return adminFlowPatch;
    }
    const originalPatchStoredPost = postPatcher.patchStoredPost;
    function normalizeCommentKey(value) {
      return store.normalizeKey ? store.normalizeKey(value || '') : String(value || '').trim();
    }
    postPatcher.patchStoredPost = async function adminkitCc756PatchStoredPost(args = {}) {
      const key = normalizeCommentKey(args && args.commentKey);
      if (key && store.getPost(key)) {
        store.savePost(key, {
          patchedAttachments: [],
          lastPatchedFingerprint: '',
          lastPatchForceReason: 'cc756_before_patchStoredPost',
          lastPatchForceAt: Date.now()
        });
      }
      return originalPatchStoredPost.call(this, args || {});
    };
    postPatcher.__adminkitCc756Patched = true;
    adminFlowPatch = { ok: true, runtimeVersion: RUNTIME, patched: ['postPatcher.patchStoredPost'] };
    return adminFlowPatch;
  } catch (error) {
    adminFlowPatch = { ok: false, error: error?.message || String(error) };
    return adminFlowPatch;
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitCc756Routes) return app;
  app.__adminkitCc756Routes = true;
  registerCommentOpenStateRoutes(app);
  app.get('/debug/cc7', (req, res) => {
    noCache(res);
    let postPatcherRuntime = '';
    try { postPatcherRuntime = require('./services/postPatcher').DB_SYNC_RUNTIME || ''; } catch {}
    res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      sourceMarker: SOURCE,
      marker: MARKER,
      installedAt,
      policy: 'comment_ui_polish_and_send_guard_no_core_openstate_changes',
      publicApp: fileInfo('public/app.js', 'CC7.5.6-PUBLIC-APP-COMMENT-UI-SEND-GUARD'),
      appOnepass: fileInfo('public/app-onepass.js', 'CC7.5.6-COMMENT-UI-SEND-GUARD'),
      appJsOverride: { ok: false, removed: true },
      adminFlowPatch,
      postPatcherRuntime,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
      buildInfo: readBuildInfo(),
      loadedLayers,
      audit: {
        clientPath: 'mini-app.html -> /public/app.js -> /public/app-onepass.js?v=756',
        serverOverridePublicAppJs: false,
        commentsCore: 'kept: routes/commentOpenState.js + services/postMetaService.js + services/maxApi.js native open_app path',
        changedIn756: ['own comment avatar/initial hidden in app-onepass.js', 'client send in-flight lock', 'server duplicate comment guard in services/commentService.js'],
        noChanges: ['no overlay', 'no floating hints', 'no external code.run /app comments button', 'no landing-first fallback for comments']
      },
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest(),
      generatedAt: Date.now()
    });
  });
  app.get(['/debug/ping', '/debug/version', '/debug/build-info'], (req, res) => {
    noCache(res);
    res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      displayVersion: 'CC7.5.6',
      sourceMarker: SOURCE,
      publicApp: fileInfo('public/app.js', 'CC7.5.6-PUBLIC-APP-COMMENT-UI-SEND-GUARD'),
      appOnepass: fileInfo('public/app-onepass.js', 'CC7.5.6-COMMENT-UI-SEND-GUARD'),
      adminFlowPatch,
      buildInfo: readBuildInfo(),
      generatedAt: Date.now(),
      installedAt,
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest()
    });
  });
  return app;
}

function installExpressWrap() {
  if (Module.__adminkitCc756ExpressWrap) return;
  Module.__adminkitCc756ExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc756Load(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc756Wrapped) {
        function wrappedExpress(...args) {
          return installRoutes(loaded(...args));
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCc756Wrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[cc7.5.6] express wrap failed:', error?.message || error);
    }
    return loaded;
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
module.exports = { RUNTIME, SOURCE, MARKER };
