'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.5.0-CLEAN-MENU-CORE';
const SOURCE = 'adminkit-cc7-5-0-clean-menu-core';
const MARKER = '__ADMINKIT_CC7_5_0_CLEAN_MENU_CORE_LOADER__';

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
    console.warn('[cc7.5.0] layer failed:', pathName, item.error);
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
    if (postPatcher.__adminkitCc750Patched || postPatcher.__adminkitCc749Patched || postPatcher.__adminkitCc748Patched || postPatcher.__adminkitCc747Patched) {
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
    postPatcher.patchStoredPost = async function adminkitCc750PatchStoredPost(args = {}) {
      if (args && args.commentKey) markDirty(args.commentKey, 'cc750_before_patchStoredPost');
      return originalPatchStoredPost.call(this, args);
    };
    postPatcher.__adminkitCc750Patched = true;
    adminFlowPatch = { ok: true, runtimeVersion: RUNTIME, patched: ['postPatcher.patchStoredPost'], policy: 'preserve_747_admin_addons_force_repatch_without_touching_comments_core' };
    return adminFlowPatch;
  } catch (error) {
    adminFlowPatch = { ok: false, error: error?.message || String(error) };
    console.warn('[cc7.5.0] admin flow patch failed:', adminFlowPatch.error);
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
  if (!app || app.__adminkitCc750Routes) return app;
  app.__adminkitCc750Routes = true;
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
      policy: 'clean_menu_core_with_filtered_archive_keep_comments_core_untouched',
      appOnepass: appOnepassInfo(),
      adminFlowPatch,
      postPatcherRuntime,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
      buildInfo: readBuildInfo(),
      loadedLayers,
      audit: {
        commentsCore: 'kept: routes/commentOpenState.js + services/postMetaService.js',
        archiveCore: 'adminkit-clean-menu-core.js filtered archive, no archive-lite layer',
        removedFromBoot: ['adminkit-archive-lite-layer'],
        remainingLegacyLayers: ['./db-v3-store-comment-guard','./db-v3-comment-guard','./hard-v3-menu-webhook-router','./clean-v3-menu-debug'],
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
    res.json({ ok: true, service: 'amio-comments-max', runtimeVersion: RUNTIME, buildVersion: RUNTIME, displayVersion: 'CC7.5.0', sourceMarker: SOURCE, useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON, adminFlowPatch, buildInfo: readBuildInfo(), generatedAt: Date.now(), installedAt, commentOpenStateRoute: require('./routes/commentOpenState').selfTest() });
  });
  return app;
}

function installExpressWrap() {
  if (Module.__adminkitCc750ExpressWrap) return;
  Module.__adminkitCc750ExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc750Load(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc750Wrapped) {
        function wrappedExpress(...args) { return installRoutes(loaded(...args)); }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCc750Wrapped = true;
        return wrappedExpress;
      }
    } catch (error) { console.warn('[cc7.5.0] express wrap failed:', error?.message || error); }
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
  loadLayer('./adminkit-clean-menu-core');
  require('./index');
}

boot();
module.exports = { RUNTIME, SOURCE, MARKER, loadedLayers };
