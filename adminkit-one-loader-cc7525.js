'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.5.25-LEAD-WORDING-PRELOAD-PATCH';
const SOURCE = 'adminkit-cc7-5-25-lead-wording-preload-patch';
const MARKER = '__ADMINKIT_CC7_5_25_LEAD_WORDING_PRELOAD_PATCH_LOADER__';
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (process.env.ADMINKIT_USE_OPEN_APP_BUTTON === undefined) process.env.ADMINKIT_USE_OPEN_APP_BUTTON = '1';

let installedAt = '';
const loadedLayers = [];
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function readBuildInfo() { try { return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'build-info.json'), 'utf8')); } catch { return null; } }
function fileInfo(relPath, marker) { try { const file = path.resolve(__dirname, relPath); const stat = fs.statSync(file); const text = fs.readFileSync(file, 'utf8').slice(0, 5000); return { exists: true, bytes: stat.size, markerFound: marker ? text.includes(marker) : true }; } catch (error) { return { exists: false, bytes: 0, markerFound: false, error: error?.message || String(error) }; } }
function loadLayer(pathName) { const item = { path: pathName, ok: false, at: new Date().toISOString(), error: '' }; try { const mod = require(pathName); const result = mod && typeof mod.install === 'function' ? mod.install() : null; item.ok = result?.ok !== false; item.runtimeVersion = result?.runtimeVersion || mod?.RUNTIME || ''; item.marker = result?.marker || mod?.MARKER || ''; item.result = result || null; } catch (error) { item.error = error?.message || String(error); console.warn('[cc7.5.25] layer failed:', pathName, item.error); } loadedLayers.push(item); return item; }
function safe(name, fn) { try { return fn(); } catch (e) { return { ok: false, error: e?.message || String(e), name }; } }
function adminFlowInfo() { return safe('adminFlow', () => require('./adminkit-admin-flows-7525').selfTest()); }
function postPatcherInfo() { return safe('postPatcher', () => require('./db-v3-post-patcher').selfTest()); }
function commentRouteInfo() { return safe('commentOpenStateRoute', () => require('./routes/commentOpenState').selfTest()); }
function coreRuntimeInfo() { return safe('adminkitCore', () => require('./adminkit-core-runtime').selfTest()); }
async function coreRenderPreview(planCode = 'free') { try { const core = require('./adminkit-core-runtime'); const screen = await core.renderMain({ planCode }); return { ok: true, runtimeVersion: core.RUNTIME, planCode, screen, buttonTexts: (((screen.attachments || [])[0] || {}).payload || {}).buttons?.flat?.().map((b) => b.text) || [] }; } catch (e) { return { ok: false, error: e?.message || String(e) }; } }
function layerSummary() { return loadedLayers.map((x) => ({ path: x.path, ok: !!x.ok, runtimeVersion: x.runtimeVersion || '', error: x.error || '' })); }
function compactDebug() {
  const buildInfo = readBuildInfo() || {};
  const hardRootFile = fileInfo('menu-v3-hard-root.js', 'adminkit-admin-flows-7525');
  const publicApp = fileInfo('public/app.js', 'CC7.5.6-PUBLIC-APP-COMMENT-UI-SEND-GUARD');
  const appOnepass = fileInfo('public/app-onepass.js', 'CC7.5.6-COMMENT-UI-SEND-GUARD');
  const adminFlow = adminFlowInfo();
  const postPatcher = postPatcherInfo();
  const commentRoute = commentRouteInfo();
  const core = coreRuntimeInfo();
  const checks = {
    runtime: RUNTIME,
    packageVersion: buildInfo.packageVersion || 'unknown',
    hardRoot7525: !!hardRootFile.markerFound,
    adminFlow7525: adminFlow.runtimeVersion === RUNTIME,
    menuPatchReady: !!adminFlow.mainMenuLeadLabelPatch && !!adminFlow.leadStepTitleStaysProfessional,
    publicAppStable: !!publicApp.markerFound && !!appOnepass.markerFound,
    appJsOverrideRemoved: true,
    postPatcherOk: postPatcher.ok !== false,
    commentOpenStateOk: commentRoute.ok !== false,
    coreReady: core.ok === true && core.isCoreRuntime === true
  };
  const problems = [];
  if (!checks.hardRoot7525) problems.push('menu-v3-hard-root не указывает на 7525');
  if (!checks.adminFlow7525) problems.push('adminFlow не 7525');
  if (!checks.menuPatchReady) problems.push('патч названий лид-магнитов не активен');
  if (!checks.publicAppStable) problems.push('public app markers не совпали');
  if (!checks.postPatcherOk) problems.push('post patcher selfTest не ok');
  if (!checks.commentOpenStateOk) problems.push('comment open state route не ok');
  if (!checks.coreReady) problems.push('adminkit core scaffold не готов');
  return {
    ok: problems.length === 0,
    runtimeVersion: RUNTIME,
    displayVersion: 'CC7.5.25',
    sourceMarker: SOURCE,
    generatedAt: new Date().toISOString(),
    checks,
    problems,
    expectedUi: {
      mainMenuButton: '🎁 Подарки / Лид-магниты',
      leadFlowTitle: '🎁 Лид-магниты — шаг ...',
      managerButtons: ['Добавить новый лид-магнит', 'Изменить лид-магнит 1', 'Удалить лид-магнит 1']
    },
    core: {
      runtimeVersion: core.runtimeVersion || '',
      activeInProduction: core.activeInProduction === true,
      sections: core.sections || [],
      constraints: core.constraints || {}
    },
    note: 'Короткий debug. Полный legacy: /debug/cc7-full или /debug/cc7?full=1. Core: /debug/core, preview: /debug/core-render'
  };
}
function coreDebug() {
  const core = coreRuntimeInfo();
  const problems = [];
  if (core.ok !== true) problems.push(core.error || 'core selfTest failed');
  if (core.activeInProduction === true) problems.push('core неожиданно включён в production');
  return {
    ok: problems.length === 0,
    debugType: 'adminkit-core-short',
    generatedAt: new Date().toISOString(),
    productionRuntime: RUNTIME,
    productionStillLegacyLayered: true,
    core,
    problems,
    nextMigrationStep: 'проверить /debug/core-render, затем подключить core webhook preview без fallback в legacy'
  };
}
function fullDebug() {
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installedAt,
    policy: 'lead_wording_preload_patch_old_gift_labels_no_longer_visible',
    publicApp: fileInfo('public/app.js', 'CC7.5.6-PUBLIC-APP-COMMENT-UI-SEND-GUARD'),
    appOnepass: fileInfo('public/app-onepass.js', 'CC7.5.6-COMMENT-UI-SEND-GUARD'),
    appJsOverride: { ok: false, removed: true },
    hardRootFile: fileInfo('menu-v3-hard-root.js', 'adminkit-admin-flows-7525'),
    adminFlow: adminFlowInfo(),
    core: coreRuntimeInfo(),
    postPatcher: postPatcherInfo(),
    buildInfo: readBuildInfo(), loadedLayers,
    audit: {
      commentsCore: 'unchanged from accepted CC7.5.6',
      buttonsCore: 'unchanged from accepted CC7.5.16+',
      leadMagnetsCore: 'CC7.5.25 patches visible wording before legacy/base modules are imported',
      adminkitCore: 'ADMINKIT-CORE-1.1 exists but is not production runtime yet',
      expected: ['main menu shows Подарки / Лид-магниты', 'step titles show Лид-магниты', 'manager buttons show лид-магнит, not подарок', 'Start reset remains from 7.5.24', 'step 4 -> 5 cleanup remains from 7.5.23'],
      stillLayered: true,
      optimizationNote: 'after acceptance merge admin-flow wrappers 7510-7525 into one clean core module'
    },
    commentOpenStateRoute: commentRouteInfo(), generatedAt: Date.now() };
}
function installRoutes(app) {
  if (!app || app.__adminkitCc7525Routes) return app;
  app.__adminkitCc7525Routes = true;
  registerCommentOpenStateRoutes(app);
  app.get('/debug/cc7', (req, res) => { noCache(res); res.json(String(req.query?.full || '') === '1' ? fullDebug() : compactDebug()); });
  app.get('/debug/cc7-full', (req, res) => { noCache(res); res.json(fullDebug()); });
  app.get('/debug/core', (req, res) => { noCache(res); res.json(coreDebug()); });
  app.get('/debug/core-full', (req, res) => { noCache(res); res.json({ ...coreDebug(), full: true, legacyLayers: layerSummary(), buildInfo: readBuildInfo() }); });
  app.get('/debug/core-render', async (req, res) => { noCache(res); res.json(await coreRenderPreview(String(req.query?.plan || 'free'))); });
  app.get(['/debug/ping', '/debug/version', '/debug/build-info'], (req, res) => { noCache(res); res.json({ ok: true, runtimeVersion: RUNTIME, displayVersion: 'CC7.5.25', sourceMarker: SOURCE, buildInfo: readBuildInfo(), layers: layerSummary(), core: coreRuntimeInfo(), generatedAt: new Date().toISOString() }); });
  return app;
}
function installExpressWrap() { if (Module.__adminkitCc7525ExpressWrap) return; Module.__adminkitCc7525ExpressWrap = true; const prev = Module._load; Module._load = function adminkitCc7525Load(request, parent, isMain) { const loaded = prev.apply(this, arguments); if (String(request) === 'express' && loaded && !loaded.__adminkitCc7525Wrapped) { function wrappedExpress(...args) { return installRoutes(loaded(...args)); } Object.setPrototypeOf(wrappedExpress, loaded); Object.assign(wrappedExpress, loaded); wrappedExpress.__adminkitCc7525Wrapped = true; return wrappedExpress; } return loaded; }; }
function boot() { if (global[MARKER]) return; global[MARKER] = true; installedAt = new Date().toISOString(); installExpressWrap(); loadLayer('./db-v3-store-comment-guard'); loadLayer('./db-v3-comment-guard'); loadLayer('./hard-v3-menu-webhook-router'); loadLayer('./clean-v3-menu-debug'); require('./index'); }
boot();
module.exports = { RUNTIME, SOURCE, MARKER };