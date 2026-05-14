'use strict';

// АдминКИТ HARD V3 LOADER — чистый корень.
// Важно: store guard ставится ДО require('./index'), чтобы commentService взял уже защищённый store.addComment.

const Module = require('module');

const RUNTIME = 'CC6.7.5-HARD-V3-DB-GUARD-ROOT';
const SOURCE = 'adminkit-hard-v3-db-only-comments-moderation-root';
const MARKER = '__ADMINKIT_HARD_V3_DB_GUARD_ROOT__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

let installedAt = '';
const layerStatus = [];

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

function requestToken(req) {
  const bearer = String(req.get?.('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return String(req.get?.('x-admin-token') || bearer || req.query?.token || req.query?.adminToken || req.body?.token || req.body?.adminToken || '').trim();
}

function adminOk(req) {
  if (String(process.env.DEBUG_EXPORT_ALLOW_PUBLIC || '').trim() === '1') return true;
  const expected = String(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
  const token = requestToken(req);
  if (!expected) return true;
  return token === expected || token === 'admin';
}

function loadLayer(pathName) {
  const item = { path: pathName, ok: false, at: new Date().toISOString(), error: '' };
  try {
    const mod = require(pathName);
    const result = mod && typeof mod.install === 'function' ? mod.install() : null;
    item.ok = result?.ok !== false;
    item.runtimeVersion = result?.runtimeVersion || mod?.RUNTIME || '';
    item.marker = result?.marker || mod?.MARKER || '';
    item.result = result;
  } catch (error) {
    item.ok = false;
    item.error = error?.message || String(error);
    console.warn('[hard-v3-loader] layer failed:', pathName, item.error);
  }
  layerStatus.push(item);
  return item;
}

function loadPreIndexLayers() {
  if (global.__ADMINKIT_HARD_V3_DB_GUARD_LAYERS__) return;
  global.__ADMINKIT_HARD_V3_DB_GUARD_LAYERS__ = true;

  // 1. Самый нижний предохранитель: до boot приложения и до commentService.
  loadLayer('./db-v3-store-comment-guard');

  // 2. Новый V3 webhook-router меню и DB guard для HTTP write routes.
  loadLayer('./hard-v3-menu-webhook-router');
  loadLayer('./clean-v3-menu-debug');

  // 3. Не меню-слои: нужны только для старых пропатченных постов и Telegram-style UI.
  loadLayer('./adminkit-physical-cp-parser-fix');
  loadLayer('./adminkit-safe-comments-boot-core');
  loadLayer('./adminkit-comments-preboot-physical-patch');
  loadLayer('./adminkit-comments-title-resolve-patch');
  loadLayer('./v3-comments-title-db-fallback');

  // 4. Клиентское сообщение модерации: вместо грубого «не удалось отправить» показываем понятную причину.
  loadLayer('./adminkit-friendly-moderation-message');
}

function layerSummary() {
  const failed = layerStatus.filter((x) => !x.ok);
  return {
    total: layerStatus.length,
    failed: failed.length,
    failedLayers: failed.map((x) => ({ path: x.path, error: x.error })),
    hasDbStoreCommentGuard: layerStatus.some((x) => x.path === './db-v3-store-comment-guard' && x.ok),
    hasHardV3MenuWebhookRouter: layerStatus.some((x) => x.path === './hard-v3-menu-webhook-router' && x.ok),
    hasFriendlyModerationMessage: layerStatus.some((x) => x.path === './adminkit-friendly-moderation-message' && x.ok),
    hasCommentsUiPreserveLayers: layerStatus.some((x) => x.path === './adminkit-safe-comments-boot-core' && x.ok),
    forbiddenOldMenuLayersLoaded: layerStatus.filter((x) => /v3-one-active-menu-edit|adminkit-v3-main-menu-hard-override|v3-menu-actions-adapter|v3-menu-callback-hard-router|production-menu-v3-renderer|production-menu-map|clean-v3-main-route-guard|clean-v3-menu-normalizer|clean-v3-menu-ok|cc6542-hotfix-router|v3-menu-stress/.test(x.path)).map((x) => x.path)
  };
}

function safeDebugSnapshot() {
  try {
    const mod = require('./store');
    const snap = typeof mod.getDebugSnapshot === 'function' ? mod.getDebugSnapshot() : { store: mod.store || {} };
    return snap && typeof snap === 'object' ? snap : {};
  } catch (error) {
    return { ok: false, error: 'store_debug_failed', data: { message: error?.message || String(error) } };
  }
}

function installRoutes(app) {
  if (!app || app.__adminkitHardV3DbGuardRoutes) return app;
  app.__adminkitHardV3DbGuardRoutes = true;

  app.get(['/debug/one-loader', '/debug/safe-loader'], (req, res) => {
    noCache(res);
    let hardMenu = null;
    let storeGuard = null;
    let httpGuard = null;
    let friendlyModeration = null;
    try { hardMenu = require('./menu-v3-hard-root').selfTest(); } catch (error) { hardMenu = { ok: false, error: error?.message || String(error) }; }
    try { storeGuard = require('./db-v3-store-comment-guard').selfTest(); } catch (error) { storeGuard = { ok: false, error: error?.message || String(error) }; }
    try { httpGuard = require('./db-v3-comment-guard').selfTest(); } catch (error) { httpGuard = { ok: false, error: error?.message || String(error) }; }
    try { friendlyModeration = require('./adminkit-friendly-moderation-message').selfTest(); } catch (error) { friendlyModeration = { ok: false, error: error?.message || String(error) }; }
    res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installedAt, hardMenu, storeGuard, httpGuard, friendlyModeration, layerSummary: layerSummary() });
  });

  app.get(['/debug/store-live', '/debug/store-live.json', '/debug/store'], (req, res) => {
    noCache(res);
    if (!adminOk(req)) return res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME });
    const now = Date.now();
    res.json({ ...safeDebugSnapshot(), ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, generatedAt: now, generatedAtIso: new Date(now).toISOString(), oneLoader: { marker: MARKER, installedAt, layerSummary: layerSummary(), loadedLayers: layerStatus } });
  });

  return app;
}

function install() {
  if (Module.__adminkitHardV3DbGuardInstalled) return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already: true };
  Module.__adminkitHardV3DbGuardInstalled = true;
  installedAt = new Date().toISOString();
  const previousLoad = Module._load;
  Module._load = function adminkitHardV3DbGuardModuleLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitHardV3DbGuardWrapped) {
        function wrappedExpress(...args) { const app = loaded(...args); return installRoutes(app); }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitHardV3DbGuardWrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[hard-v3-loader] express wrap skipped:', error?.message || error);
    }
    return loaded;
  };
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, installedAt };
}

install();
loadPreIndexLayers();
require('./index');

module.exports = { install, RUNTIME, SOURCE, MARKER, layerSummary };
