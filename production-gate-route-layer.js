'use strict';

const Module = require('module');
const checklist = require('./src/core/productionChecklistAdapter');
const debugExport = require('./src/core/debugExportAdapter');

const RUNTIME = 'ADMINKIT-PRODUCTION-GATE-ROUTE-LAYER-1.51.2';
const MARKER = '__ADMINKIT_PRODUCTION_GATE_ROUTE_LAYER_1_51_2__';

function compactItem(item = {}) {
  return {
    id: item.id || '',
    title: item.title || '',
    status: item.status || (item.ok ? 'ok' : 'blocker'),
    ok: item.ok !== false
  };
}

function compactGate() {
  const gate = checklist.releaseGate();
  return {
    ok: gate.blockers.length === 0,
    runtimeVersion: RUNTIME,
    checklistRuntimeVersion: checklist.RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'production-gate-compact',
    blockersCount: gate.blockers.length,
    warningsCount: gate.warnings.length,
    blockers: gate.blockers.map(compactItem),
    warnings: gate.warnings.map(compactItem),
    readyForManualMaxCheck: gate.readyForManualMaxCheck === true,
    readyForProduction: gate.readyForProduction === true,
    productionEnableRequiresManualConfirm: gate.productionEnableRequiresManualConfirm === true,
    canaryFirst: gate.canaryFirst === true,
    rollbackRequired: gate.rollbackRequired === true,
    featureCount: gate.featureCount || 0,
    note: 'Короткий endpoint без полного /debug/core-stress. Если blockersCount=0 — можно переходить к ручной проверке в MAX.'
  };
}

function compactFeatures() {
  const rows = checklist.featureMatrix();
  return {
    ok: rows.every((item) => item.ok === true),
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'production-features-compact',
    total: rows.length,
    failed: rows.filter((item) => item.ok !== true).map(compactItem),
    features: rows.map((item) => ({ id: item.id, title: item.title, ok: item.ok, status: item.status, locked: item.locked, hiddenInMain: item.hiddenInMain }))
  };
}

function compactSecurity() {
  const rows = checklist.securityChecklist();
  return {
    ok: rows.every((item) => item.status !== 'blocker'),
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'production-security-compact',
    total: rows.length,
    blockers: rows.filter((item) => item.status === 'blocker').map(compactItem),
    checks: rows.map(compactItem)
  };
}

function compactEnv() {
  const rows = checklist.envChecklist();
  return {
    ok: rows.every((item) => item.status !== 'blocker'),
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'production-env-compact',
    total: rows.length,
    blockers: rows.filter((item) => item.status === 'blocker').map(compactItem),
    warnings: rows.filter((item) => item.status === 'warning').map(compactItem),
    checks: rows.map(compactItem),
    secretsHidden: true
  };
}

function installRoutes(app) {
  if (!app || app.__adminkitProductionGateRoutes1512) return app;
  app.__adminkitProductionGateRoutes1512 = true;

  app.get('/debug/production-gate', (req, res) => {
    debugExport.applyNoCache(res);
    return res.json(compactGate());
  });

  app.get('/debug/production-features', (req, res) => {
    debugExport.applyNoCache(res);
    return res.json(compactFeatures());
  });

  app.get('/debug/production-security', (req, res) => {
    debugExport.applyNoCache(res);
    return res.json(compactSecurity());
  });

  app.get('/debug/production-env', (req, res) => {
    debugExport.applyNoCache(res);
    return res.json(compactEnv());
  });

  app.get('/debug/production-gate-selftest', (req, res) => {
    debugExport.applyNoCache(res);
    return res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      generatedAt: new Date().toISOString(),
      endpoints: ['/debug/production-gate', '/debug/production-features', '/debug/production-security', '/debug/production-env'],
      noCacheHeadersReady: debugExport.selfTest().noCacheHeadersReady === true,
      compactOnly: true
    });
  });

  return app;
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const previousLoad = Module._load;
  Module._load = function adminkitProductionGateRouteLayerLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__adminkitProductionGateWrapped) return loaded;
    function wrappedExpress(...args) {
      return installRoutes(loaded(...args));
    }
    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__adminkitProductionGateWrapped = true;
    return wrappedExpress;
  };
  return selfTest(false);
}

function selfTest(already = false) {
  const gate = compactGate();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    already,
    endpoints: ['/debug/production-gate', '/debug/production-features', '/debug/production-security', '/debug/production-env', '/debug/production-gate-selftest'],
    compactGateReady: true,
    gateOk: gate.ok,
    blockersCount: gate.blockersCount,
    warningsCount: gate.warningsCount
  };
}

module.exports = { RUNTIME, MARKER, install, installRoutes, compactGate, compactFeatures, compactSecurity, compactEnv, selfTest };
