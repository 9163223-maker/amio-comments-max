'use strict';

const http = require('http');
const checklist = require('./src/core/productionChecklistAdapter');
const debugExport = require('./src/core/debugExportAdapter');

const RUNTIME = 'ADMINKIT-PRODUCTION-GATE-HTTP-LAYER-1.51.3';
const MARKER = '__ADMINKIT_PRODUCTION_GATE_HTTP_LAYER_1_51_3__';

function compactItem(item = {}) {
  return { id: item.id || '', title: item.title || '', status: item.status || (item.ok ? 'ok' : 'blocker'), ok: item.ok !== false };
}
function payloadFor(pathname = '') {
  if (pathname === '/debug/production-features') {
    const rows = checklist.featureMatrix();
    return { ok: rows.every((x) => x.ok === true), runtimeVersion: RUNTIME, generatedAt: new Date().toISOString(), mode: 'production-features-http-compact', total: rows.length, failed: rows.filter((x) => x.ok !== true).map(compactItem), features: rows.map((x) => ({ id: x.id, title: x.title, ok: x.ok, status: x.status, locked: x.locked, hiddenInMain: x.hiddenInMain })) };
  }
  if (pathname === '/debug/production-security') {
    const rows = checklist.securityChecklist();
    return { ok: rows.every((x) => x.status !== 'blocker'), runtimeVersion: RUNTIME, generatedAt: new Date().toISOString(), mode: 'production-security-http-compact', total: rows.length, blockers: rows.filter((x) => x.status === 'blocker').map(compactItem), checks: rows.map(compactItem) };
  }
  if (pathname === '/debug/production-env') {
    const rows = checklist.envChecklist();
    return { ok: rows.every((x) => x.status !== 'blocker'), runtimeVersion: RUNTIME, generatedAt: new Date().toISOString(), mode: 'production-env-http-compact', total: rows.length, blockers: rows.filter((x) => x.status === 'blocker').map(compactItem), warnings: rows.filter((x) => x.status === 'warning').map(compactItem), checks: rows.map(compactItem), secretsHidden: true };
  }
  if (pathname === '/debug/production-gate-selftest') {
    return { ok: true, runtimeVersion: RUNTIME, generatedAt: new Date().toISOString(), compactOnly: true, httpLayer: true, endpoints: ['/debug/production-gate', '/debug/production-features', '/debug/production-security', '/debug/production-env'], noCacheHeadersReady: debugExport.selfTest().noCacheHeadersReady === true };
  }
  const gate = checklist.releaseGate();
  return { ok: gate.blockers.length === 0, runtimeVersion: RUNTIME, checklistRuntimeVersion: checklist.RUNTIME, generatedAt: new Date().toISOString(), mode: 'production-gate-http-compact', blockersCount: gate.blockers.length, warningsCount: gate.warnings.length, blockers: gate.blockers.map(compactItem), warnings: gate.warnings.map(compactItem), readyForManualMaxCheck: gate.readyForManualMaxCheck === true, readyForProduction: gate.readyForProduction === true, productionEnableRequiresManualConfirm: gate.productionEnableRequiresManualConfirm === true, canaryFirst: gate.canaryFirst === true, rollbackRequired: gate.rollbackRequired === true, featureCount: gate.featureCount || 0, httpLayer: true, note: 'Короткий HTTP-layer endpoint. Не использует общий /debug/core-stress и не зависит от Express route registration.' };
}
function isProductionGateUrl(url = '') {
  const pathname = String(url || '').split('?')[0];
  return ['/debug/production-gate', '/debug/production-features', '/debug/production-security', '/debug/production-env', '/debug/production-gate-selftest'].includes(pathname);
}
function sendJson(res, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.statusCode = payload.ok === false && payload.blockersCount === undefined ? 500 : 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Adminkit-Production-Gate-Layer', RUNTIME);
  res.end(body);
}
function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const originalCreateServer = http.createServer;
  http.createServer = function adminkitProductionGateCreateServer(...args) {
    const originalListener = typeof args[0] === 'function' ? args[0] : null;
    if (originalListener) {
      args[0] = function adminkitProductionGateRequestListener(req, res) {
        if (isProductionGateUrl(req.url)) {
          try { return sendJson(res, payloadFor(String(req.url || '').split('?')[0])); }
          catch (error) { return sendJson(res, { ok: false, runtimeVersion: RUNTIME, generatedAt: new Date().toISOString(), error: error?.message || String(error), httpLayer: true }); }
        }
        return originalListener(req, res);
      };
    }
    return originalCreateServer.apply(this, args);
  };
  return selfTest(false);
}
function selfTest(already = false) {
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already, httpCreateServerWrapped: true, compactOnly: true, endpoints: ['/debug/production-gate', '/debug/production-features', '/debug/production-security', '/debug/production-env', '/debug/production-gate-selftest'] };
}

module.exports = { RUNTIME, MARKER, install, selfTest, payloadFor, isProductionGateUrl };
