'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'ADMINKIT-SAFE-DIAGNOSTICS-ROUTE-LAYER-1.49.2';
const MARKER = '__ADMINKIT_SAFE_DIAGNOSTICS_ROUTE_LAYER_1_49_2__';
const STARTED_AT = new Date().toISOString();
const SAFE_ENDPOINTS = ['/healthz', '/version', '/debug/safe', '/debug/ping', '/debug/build'];

function nowIso() {
  return new Date().toISOString();
}

function readJsonFileSafe(fileName, fallback = {}) {
  try {
    const fullPath = path.join(__dirname, fileName);
    const raw = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getPackageInfo() {
  const pkg = readJsonFileSafe('package.json', {});
  return {
    name: pkg.name || 'amio-comments-max',
    version: pkg.version || process.env.npm_package_version || ''
  };
}

function getBuildInfo() {
  const info = readJsonFileSafe('build-info.json', {});
  const pkg = getPackageInfo();
  return {
    runtimeVersion: info.runtimeVersion || process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || RUNTIME,
    buildVersion: info.buildVersion || process.env.BUILD_VERSION || process.env.RUNTIME_VERSION || RUNTIME,
    displayVersion: info.displayVersion || '',
    packageVersion: info.packageVersion || pkg.version || '',
    packageName: info.packageName || pkg.name || 'amio-comments-max',
    sourceMarker: info.sourceMarker || process.env.BUILD_SOURCE_MARKER || '',
    buildGeneratedAt: info.buildGeneratedAt || '',
    canonicalPublicBaseUrl: info.canonicalPublicBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL || '',
    debugPolicy: info.debugPolicy || 'safe-diagnostics-only'
  };
}

function sendJson(res, payload, statusCode = 200) {
  const body = JSON.stringify(payload, null, 2);
  res.status(statusCode);
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'X-Adminkit-Safe-Diagnostics': RUNTIME
  });
  return res.send(body);
}

function healthPayload() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    startedAt: STARTED_AT,
    mode: 'safe-diagnostics-healthz',
    safe: true
  };
}

function versionPayload() {
  const info = getBuildInfo();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'safe-diagnostics-version',
    appRuntimeVersion: info.runtimeVersion,
    buildVersion: info.buildVersion,
    displayVersion: info.displayVersion,
    packageVersion: info.packageVersion,
    packageName: info.packageName,
    sourceMarker: info.sourceMarker,
    buildGeneratedAt: info.buildGeneratedAt,
    canonicalPublicBaseUrl: info.canonicalPublicBaseUrl,
    safe: true
  };
}

function safePayload() {
  const info = getBuildInfo();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    startedAt: STARTED_AT,
    mode: 'safe-diagnostics-constant-time',
    appRuntimeVersion: info.runtimeVersion,
    displayVersion: info.displayVersion,
    packageVersion: info.packageVersion,
    sourceMarker: info.sourceMarker,
    endpoints: SAFE_ENDPOINTS,
    disabledHeavyDebug: ['/debug/store-live', '/debug/core-stress', '/debug/export', '/debug/export-lite'],
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true,
    note: 'SAFE-DIAGNOSTICS: constant-time endpoint for liveness/version checks on 0.1 vCPU. Does not touch store, DB, MAX API or GitHub export.'
  };
}

function installRoutes(app) {
  if (!app || app.__adminkitSafeDiagnostics1492) return app;
  app.__adminkitSafeDiagnostics1492 = true;

  app.get('/healthz', (req, res) => sendJson(res, healthPayload()));
  app.get('/version', (req, res) => sendJson(res, versionPayload()));
  app.get('/debug/safe', (req, res) => sendJson(res, safePayload()));

  // Override historically risky lightweight-looking debug endpoints with constant-time responses.
  // Registered before the main app routes, so these handlers win and cannot fall through to heavy debug code.
  app.get('/debug/ping', (req, res) => sendJson(res, healthPayload()));
  app.get('/debug/build', (req, res) => sendJson(res, versionPayload()));

  return app;
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;

  const previousLoad = Module._load;
  Module._load = function adminkitSafeDiagnosticsLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__adminkitSafeDiagnosticsWrapped1492) return loaded;

    function wrappedExpress(...args) {
      const app = loaded(...args);
      return installRoutes(app);
    }

    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__adminkitSafeDiagnosticsWrapped1492 = true;
    return wrappedExpress;
  };

  return selfTest(false);
}

function selfTest(already = false) {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    already,
    safeEndpoints: SAFE_ENDPOINTS,
    constantTime: true,
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true
  };
}

module.exports = {
  RUNTIME,
  MARKER,
  SAFE_ENDPOINTS,
  install,
  installRoutes,
  selfTest,
  healthPayload,
  versionPayload,
  safePayload
};
