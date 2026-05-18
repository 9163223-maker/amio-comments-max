'use strict';

const Module = require('module');
const debugExport = require('./src/core/debugExportAdapter');

const RUNTIME = 'ADMINKIT-DEBUG-EXPORT-ROUTE-LAYER-1.50.0';
const MARKER = '__ADMINKIT_DEBUG_EXPORT_ROUTE_LAYER_1_50_0__';

function installRoutes(app) {
  if (!app || app.__adminkitDebugExportRoutes1500) return app;
  app.__adminkitDebugExportRoutes1500 = true;

  app.get('/debug/debug-export-selftest', (req, res) => {
    debugExport.applyNoCache(res);
    return res.json({ ok: true, runtimeVersion: RUNTIME, generatedAt: new Date().toISOString(), adapter: debugExport.selfTest() });
  });

  app.get('/debug/store-live', (req, res) => {
    debugExport.applyNoCache(res);
    return res.json(debugExport.buildStoreLive());
  });

  app.get('/debug/export-lite', async (req, res) => {
    debugExport.applyNoCache(res);
    const auth = debugExport.authState(req);
    if (!auth.ok) return res.status(403).json({ ok: false, runtimeVersion: RUNTIME, error: 'debug_export_forbidden', auth, generatedAt: new Date().toISOString() });
    const dryRun = String(req.query?.dryRun ?? req.query?.dryrun ?? '1') !== '0';
    const result = await debugExport.exportToGithub({ dryRun: true });
    return res.json({ ...result, runtimeVersion: RUNTIME, mode: 'export-lite-preview', dryRun: true, auth, generatedAt: new Date().toISOString(), lite: debugExport.buildSnapshot({ lite: true }) });
  });

  app.get('/debug/export', async (req, res) => {
    debugExport.applyNoCache(res);
    const auth = debugExport.authState(req);
    if (!auth.ok) return res.status(403).json({ ok: false, runtimeVersion: RUNTIME, error: 'debug_export_forbidden', auth, generatedAt: new Date().toISOString() });
    const dryRun = String(req.query?.dryRun ?? req.query?.dryrun ?? '0') === '1';
    const result = await debugExport.exportToGithub({ dryRun });
    return res.status(result.ok ? 200 : 500).json({ ...result, runtimeVersion: RUNTIME, auth, generatedAt: new Date().toISOString() });
  });

  return app;
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const previousLoad = Module._load;
  Module._load = function adminkitDebugExportRouteLayerLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__adminkitDebugExportWrapped) return loaded;
    function wrappedExpress(...args) {
      return installRoutes(loaded(...args));
    }
    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__adminkitDebugExportWrapped = true;
    return wrappedExpress;
  };
  return selfTest(false);
}

function selfTest(already = false) {
  const adapter = debugExport.selfTest ? debugExport.selfTest() : {};
  return {
    ok: adapter.ok !== false,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    already,
    endpoints: ['/debug/store-live', '/debug/export', '/debug/export-lite', '/debug/debug-export-selftest'],
    noCacheHeadersReady: adapter.noCacheHeadersReady === true,
    githubExportReady: adapter.githubExportReady === true,
    tokenRedactionReady: adapter.tokenRedactionReady === true,
    authGuardReady: adapter.authGuardReady === true,
    adapter
  };
}

module.exports = { RUNTIME, MARKER, install, installRoutes, selfTest };