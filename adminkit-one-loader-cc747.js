'use strict';

// CC7.4.8 compact loader.
// Keeps CC7.4.7 stable post identity/admin addons and adds Archive Lite menu + PRO placeholder.

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.4.8-ARCHIVE-LITE-MENU';
const SOURCE = 'adminkit-cc7-4-8-archive-lite-menu';
const MARKER = '__ADMINKIT_CC7_4_8_ARCHIVE_LITE_MENU__';

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
    console.warn('[cc7.4.8] layer failed:', pathName, item.error);
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
    if (postPatcher.__adminkitCc748Patched || postPatcher.__adminkitCc747Patched) {
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
    postPatcher.patchStoredPost = async function adminkitCc748PatchStoredPost(args = {}) {
      if (args && args.commentKey) markDirty(args.commentKey, 'cc748_before_patchStoredPost');
      return originalPatchStoredPost.call(this, args);
    };
    postPatcher.__adminkitCc748Patched = true;
    adminFlowPatch = {
      ok: true,
      runtimeVersion: RUNTIME,
      patched: ['postPatcher.patchStoredPost'],
      policy: 'saved_buttons_and_gifts_force_repatch_and_persist_customKeyboard_in_post_snapshot'
    };
    return adminFlowPatch;
  } catch (error) {
    adminFlowPatch = { ok: false, error: error?.message || String(error) };
    console.warn('[cc7.4.8] admin flow patch failed:', adminFlowPatch.error);
    return adminFlowPatch;
  }
}

function appOnepassInfo() {
  try {
    const file = path.resolve(__dirname, 'public', 'app-onepass.js');
    const stat = fs.statSync(file);
    return { exists: true, bytes: stat.size, servedByStatic: true };
  } catch (error) {
    return { exists: false, bytes: 0, error: error?.message || String(error) };
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitCc748Routes) return app;
  app.__adminkitCc748Routes = true;

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
      policy: 'archive_lite_menu_plus_admin_saved_buttons_and_gifts_force_repatch',
      appOnepass: appOnepassInfo(),
      adminFlowPatch,
      postPatcherRuntime,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
      buildInfo: readBuildInfo(),
      loadedLayers,
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest(),
      generatedAt: Date.now()
    });
  });

  app.get(['/debug/ping', '/debug/version', '/debug/build-info'], (req, res) => {
    noCache(res);
    res.json({
      ok: true,
      service: 'amio-comments-max',
      runtimeVersion: RUNTIME,
      buildVersion: RUNTIME,
      displayVersion: 'CC7.4.8',
      sourceMarker: SOURCE,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
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
  if (Module.__adminkitCc748ExpressWrap) return;
  Module.__adminkitCc748ExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc748Load(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc748Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCc748Wrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[cc7.4.8] express wrap failed:', error?.message || error);
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
    commentsOpenStateRoute: 'routes/commentOpenState.js',
    useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
    policy: 'archive_lite_menu_no_ui_redesign_no_external_comments_button'
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
  loadLayer('./adminkit-archive-lite-layer');

  require('./index');
}

boot();

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };
