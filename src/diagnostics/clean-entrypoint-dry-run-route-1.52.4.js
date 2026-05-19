'use strict';

const Module = require('module');
const path = require('path');

const RUNTIME = 'ADMINKIT-CLEAN-ENTRYPOINT-DRY-RUN-ROUTE-1.52.6';
const MARKER = '__ADMINKIT_CLEAN_ENTRYPOINT_DRY_RUN_ROUTE_1_52_6__';
const ROUTES = ['/debug/dry-run/clean-entrypoint', '/debug/lite/clean-entrypoint-dry-run'];
const DRY_RUN_MODULE = './src/diagnostics/clean-entrypoint-active-dry-run-1.52.6.js';
const STARTED_AT = new Date().toISOString();

function nowIso() { return new Date().toISOString(); }

function sendJson(res, payload, statusCode = 200) {
  res.status(statusCode);
  res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0', 'Surrogate-Control': 'no-store', 'X-Adminkit-Dry-Run-Route': RUNTIME });
  return res.send(JSON.stringify(payload, null, 2));
}

function loadDryRunModule() {
  try {
    const mod = require(path.join(process.cwd(), DRY_RUN_MODULE));
    if (!mod || typeof mod.runDryRun !== 'function') return { ok: false, error: 'dry_run_module_missing_runDryRun' };
    return { ok: true, mod };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function dryRunRoutePayload() {
  const loaded = loadDryRunModule();
  if (!loaded.ok) {
    return { ok: false, runtimeVersion: RUNTIME, generatedAt: nowIso(), startedAt: STARTED_AT, mode: 'clean-entrypoint-active-dry-run-route-error', error: loaded.error, safe: true, constantTime: true, noDatabaseRead: true, noStoreSnapshot: true, noGithubExport: true, noStressTest: true, noMaxApiCall: true };
  }
  const dryRun = loaded.mod.runDryRun();
  return { ok: dryRun.ok === true, runtimeVersion: RUNTIME, generatedAt: nowIso(), startedAt: STARTED_AT, mode: 'clean-entrypoint-active-dry-run-route', routeLayer: RUNTIME, dryRunRuntime: dryRun.runtimeVersion, activeRuntime: dryRun.activeRuntime, expectedProductionRuntime: dryRun.expectedProductionRuntime, packageStart: dryRun.packageStart, packageMain: dryRun.packageMain, packageVersion: dryRun.packageVersion, checks: dryRun.checks, failed: dryRun.failed, imports: dryRun.imports, routes: ROUTES, nextStep: dryRun.nextStep, safe: true, constantTime: true, noDatabaseRead: true, noStoreSnapshot: true, noGithubExport: true, noStressTest: true, noMaxApiCall: true };
}

function registerRoutes(app) {
  if (!app || app.__adminkitCleanEntrypointDryRunRoute1526) return app;
  app.__adminkitCleanEntrypointDryRunRoute1526 = true;
  for (const route of ROUTES) app.get(route, (req, res) => sendJson(res, dryRunRoutePayload()));
  return app;
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const previousLoad = Module._load;
  Module._load = function adminkitDryRunRouteLoader(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__adminkitCleanEntrypointDryRunWrapped1526) return loaded;
    function wrappedExpress(...args) { return registerRoutes(loaded(...args)); }
    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__adminkitCleanEntrypointDryRunWrapped1526 = true;
    return wrappedExpress;
  };
  return selfTest(false);
}

function selfTest(already = false) {
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already, routes: ROUTES, dryRunModule: DRY_RUN_MODULE, safe: true, constantTime: true, noDatabaseRead: true, noStoreSnapshot: true, noGithubExport: true, noStressTest: true, noMaxApiCall: true };
}

module.exports = { RUNTIME, MARKER, ROUTES, install, registerRoutes, selfTest, dryRunRoutePayload };
