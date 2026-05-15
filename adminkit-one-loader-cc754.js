'use strict';

// CC7.5.4 final comment-open-state-first loader.
// Goal: keep proven comments backend and make the mini-app load the open-state-first client
// without changing comments UI, routes, postMetaService or maxApi.

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.5.4-COMMENT-OPEN-STATE-FIRST-FINAL';
const SOURCE = 'adminkit-cc7-5-4-comment-open-state-first-final';
const MARKER = '__ADMINKIT_CC7_5_4_COMMENT_OPEN_STATE_FIRST_FINAL__';
const APP_RUNTIME = 'CC7.5.4-APPJS-OPENSTATE-FIRST-FINAL';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (process.env.ADMINKIT_USE_OPEN_APP_BUTTON === undefined) process.env.ADMINKIT_USE_OPEN_APP_BUTTON = '1';

let installedAt = '';
const loadedLayers = [];
let adminFlowPatch = { ok: false, reason: 'not_installed' };
let appJsOverride = { ok: false, reason: 'not_installed' };

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
    console.warn('[cc7.5.4] layer failed:', pathName, item.error);
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
    if (postPatcher.__adminkitCc754Patched || postPatcher.__adminkitCc753Patched || postPatcher.__adminkitCc752Patched || postPatcher.__adminkitCc747Patched) {
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
    postPatcher.patchStoredPost = async function adminkitCc754PatchStoredPost(args = {}) {
      if (args && args.commentKey) markDirty(args.commentKey, 'cc754_before_patchStoredPost');
      return originalPatchStoredPost.call(this, args);
    };
    postPatcher.__adminkitCc754Patched = true;
    adminFlowPatch = {
      ok: true,
      runtimeVersion: RUNTIME,
      patched: ['postPatcher.patchStoredPost'],
      policy: 'preserve_747_admin_saved_buttons_and_gifts_force_repatch_without_touching_comments_core'
    };
    return adminFlowPatch;
  } catch (error) {
    adminFlowPatch = { ok: false, error: error?.message || String(error) };
    console.warn('[cc7.5.4] admin flow patch failed:', adminFlowPatch.error);
    return adminFlowPatch;
  }
}

function readOpenStateFirstClient() {
  const file = path.resolve(__dirname, 'public', 'app-onepass.js');
  let text = fs.readFileSync(file, 'utf8');
  text = text
    .replaceAll('CC7.5.3-APPJS-OPENSTATE-FIRST', APP_RUNTIME)
    .replaceAll('__ADMINKIT_CC7_5_3_APPJS_OPENSTATE_FIRST__', '__ADMINKIT_CC7_5_4_APPJS_OPENSTATE_FIRST_FINAL__')
    .replaceAll('__ADMINKIT_CC7_5_3_STATE__', '__ADMINKIT_CC7_5_4_STATE__')
    .replaceAll('__ADMINKIT_CC7_5_3_INITIAL__', '__ADMINKIT_CC7_5_4_INITIAL__');
  return text;
}

function appOnepassInfo() {
  try {
    const file = path.resolve(__dirname, 'public', 'app-onepass.js');
    const stat = fs.statSync(file);
    const text = fs.readFileSync(file, 'utf8').slice(0, 420);
    return {
      exists: true,
      bytes: stat.size,
      sourceFile: 'public/app-onepass.js',
      markerFound: text.includes('CC7.5.3-APPJS-OPENSTATE-FIRST'),
      servedAsPublicAppJs: Boolean(appJsOverride && appJsOverride.ok),
      servedRuntime: APP_RUNTIME
    };
  } catch (error) {
    return { exists: false, bytes: 0, error: error?.message || String(error) };
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitCc754Routes) return app;
  app.__adminkitCc754Routes = true;

  // Critical fix: mini-app.html already references /public/app.js.
  // Register this route before express.static('/public') in index.js and serve the proven
  // open-state-first client there. This avoids editing UI markup and keeps comments core intact.
  app.get('/public/app.js', (req, res) => {
    noCache(res);
    try {
      const body = readOpenStateFirstClient();
      res.type('application/javascript; charset=utf-8').send(body);
    } catch (error) {
      res.status(500).type('application/javascript; charset=utf-8').send(`console.error(${JSON.stringify(error?.message || String(error))});`);
    }
  });
  appJsOverride = {
    ok: true,
    runtimeVersion: APP_RUNTIME,
    path: '/public/app.js',
    sourceFile: 'public/app-onepass.js',
    policy: 'serve_openstate_first_client_before_static_public_app_js'
  };

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
      policy: 'comment_open_state_first_final_no_archive_lite_no_clean_menu_core',
      appOnepass: appOnepassInfo(),
      appJsOverride,
      adminFlowPatch,
      postPatcherRuntime,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
      buildInfo: readBuildInfo(),
      loadedLayers,
      audit: {
        base: 'CC7.5.3 loader plus explicit /public/app.js open-state-first override',
        commentsCore: 'kept untouched: routes/commentOpenState.js + services/postMetaService.js + services/maxApi.js native open_app payload path',
        clientFix: '/public/app.js is served from public/app-onepass.js, so comment-open-state is checked before landing',
        removedLayers: ['adminkit-archive-lite-layer', 'adminkit-clean-menu-core'],
        noExternalAppLinkForComments: true,
        noOverlay: true,
        noFloatingHints: true,
        noUiRedesign: true
      },
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
      displayVersion: 'CC7.5.4',
      sourceMarker: SOURCE,
      useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
      appOnepass: appOnepassInfo(),
      appJsOverride,
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
  if (Module.__adminkitCc754ExpressWrap) return;
  Module.__adminkitCc754ExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc754Load(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc754Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCc754Wrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[cc7.5.4] express wrap failed:', error?.message || error);
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
    appJsOverride,
    adminFlowPatch,
    uiRedesign: false,
    commentsOpenStateRoute: 'routes/commentOpenState.js',
    useOpenAppButton: process.env.ADMINKIT_USE_OPEN_APP_BUTTON,
    policy: 'comment_open_state_first_final_no_ui_redesign'
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

module.exports = { RUNTIME, SOURCE, MARKER, APP_RUNTIME, layerSummary };
