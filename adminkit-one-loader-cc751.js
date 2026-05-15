'use strict';

// CC7.5.1 rollback-safe loader.
// Based on the last known usable CC7.4.9 direct loader path, not on CC7.5.0 clean-menu-core.
// Goal: restore comments/open_app stability first, keep Archive Lite available, and do not boot adminkit-clean-menu-core.

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.5.1-ROLLBACK-SAFE-COMMENTS-FIRST';
const SOURCE = 'adminkit-cc7-5-1-rollback-safe-comments-first';
const MARKER = '__ADMINKIT_CC7_5_1_ROLLBACK_SAFE_COMMENTS_FIRST_LOADER__';

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
    console.warn('[cc7.5.1] layer failed:', pathName, item.error);
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
    if (postPatcher.__adminkitCc751Patched || postPatcher.__adminkitCc749Patched || postPatcher.__adminkitCc748Patched || postPatcher.__adminkitCc747Patched) {
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
      store.savePost(key, { patchedAttachments: [], lastPatchedFingerprint: '', lastPatchForceReason: reason, lastPatchForceAt: Date.now() });
      return { ok: true, commentKey: key, reason };
    }
    postPatcher.patchStoredPost = async function adminkitCc751PatchStoredPost(args = {}) {
      if (args && args.commentKey) markDirty(args.commentKey, 'cc751_before_patchStoredPost');
      return originalPatchStoredPost.call(this, args);
    };
    postPatcher.__adminkitCc751Patched = true;
    adminFlowPatch = { ok: true, runtimeVersion: RUNTIME, patched: ['postPatcher.patchStoredPost'], policy: 'rollback_safe_preserve_747_admin_addons_force_repatch_without_touching_comments_core' };
    return adminFlowPatch;
  } catch (error) {
    adminFlowPatch = { ok: false, error: error?.message || String(error) };
    console.warn('[cc7.5.1] admin flow patch failed:', adminFlowPatch.error);
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
  if (!app || app.__adminkitCc751Routes) return app;
  app.__adminkitCc751Routes = true;
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
      policy: 'rollback_safe_comments_first_no_clean_menu_core_boot',
      appOnepass: appOnepassInfo(),
      adminFlowPatch,
      postPatcherRuntime,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
      buildInfo: readBuildInfo(),
      loadedLayers,
      audit: {
        commentsCore: 'kept untouched: routes/commentOpenState.js + services/postMetaService.js + public/app-onepass.js + services/maxApi.js open_app path',
        bootPolicy: 'CC7.5.0 adminkit-clean-menu-core is NOT loaded',
        archivePolicy: 'uses previous Archive Lite layer only; user-facing list should hide technical records in next core cleanup',
        noExternalAppLinkForComments: true,
        noOverlay: true,
        noFloatingHints: true
      },
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest(),
      generatedAt: Date.now()
    });
  });
  app.get(['/debug/ping', '/debug/version', '/debug/build-info'], (req, res) => {
    noCache(res);
    res.json({ ok: true, service: 'amio-comments-max', runtimeVersion: RUNTIME, buildVersion: RUNTIME, displayVersion: 'CC7.5.1', sourceMarker: SOURCE, useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON, adminFlowPatch, buildInfo: readBuildInfo(), generatedAt: Date.now(), installedAt, commentOpenStateRoute: require('./routes/commentOpenState').selfTest() });
  });
  return app;
}

function installExpressWrap() {
  if (Module.__adminkitCc751ExpressWrap) return;
  Module.__adminkitCc751ExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc751Load(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc751Wrapped) {
        function wrappedExpress(...args) { return installRoutes(loaded(...args)); }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCc751Wrapped = true;
        return wrappedExpress;
      }
    } catch (error) { console.warn('[cc7.5.1] express wrap failed:', error?.message || error); }
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
  loadLayer('./adminkit-archive-lite-layer');
  require('./index');
}

boot();
module.exports = { RUNTIME, SOURCE, MARKER, loadedLayers };
