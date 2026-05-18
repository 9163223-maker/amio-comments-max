'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'ADMINKIT-DEBUG-LITE-ROUTE-LAYER-1.50.0';
const MARKER = '__ADMINKIT_DEBUG_LITE_ROUTE_LAYER_1_50_0__';
const STARTED_AT = new Date().toISOString();
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

const LITE_ENDPOINTS = [
  '/healthz',
  '/version',
  '/debug/safe',
  '/debug/lite',
  '/debug/lite/version',
  '/debug/lite/runtime',
  '/debug/lite/env',
  '/debug/lite/routes',
  '/debug/lite/guard',
  '/debug/ping',
  '/debug/build'
];

const HEAVY_ENDPOINTS = [
  '/debug/store-live',
  '/debug/core-stress',
  '/debug/export',
  '/debug/export-lite'
];

function nowIso() {
  return new Date().toISOString();
}

function readJsonFileSafe(fileName, fallback = {}) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, fileName), 'utf8');
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
    canonicalPublicBaseUrl: info.canonicalPublicBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL || CANONICAL_PUBLIC_BASE_URL,
    debugPolicy: info.debugPolicy || 'debug-lite-only',
    safeDiagnostics: info.safeDiagnostics || {}
  };
}

function boolPresence(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function envFlagsPayload() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'debug-lite-env-presence-only',
    secretsAreMasked: true,
    valuesAreNotReturned: true,
    env: {
      NODE_ENV: process.env.NODE_ENV || '',
      PORT: process.env.PORT ? 'set' : 'not_set',
      BOT_TOKEN: boolPresence('BOT_TOKEN'),
      BOT_USERNAME: boolPresence('BOT_USERNAME'),
      WEBHOOK_PATH: boolPresence('WEBHOOK_PATH'),
      APP_BASE_URL: boolPresence('APP_BASE_URL'),
      DATABASE_URL: boolPresence('DATABASE_URL'),
      PGHOST: boolPresence('PGHOST'),
      GITHUB_DEBUG_TOKEN: boolPresence('GITHUB_DEBUG_TOKEN'),
      GITHUB_DEBUG_REPO: boolPresence('GITHUB_DEBUG_REPO'),
      GIFT_ADMIN_TOKEN: boolPresence('GIFT_ADMIN_TOKEN')
    },
    safe: true,
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true
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
    'X-Adminkit-Debug-Lite': RUNTIME
  });
  return res.send(body);
}

function healthPayload() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    startedAt: STARTED_AT,
    mode: 'debug-lite-health',
    safe: true
  };
}

function versionPayload() {
  const info = getBuildInfo();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'debug-lite-version',
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

function runtimePayload() {
  const memory = process.memoryUsage ? process.memoryUsage() : {};
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    startedAt: STARTED_AT,
    mode: 'debug-lite-runtime',
    process: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      uptimeSeconds: Math.round(process.uptime ? process.uptime() : 0),
      memoryMb: {
        rss: memory.rss ? Math.round(memory.rss / 1024 / 1024) : null,
        heapUsed: memory.heapUsed ? Math.round(memory.heapUsed / 1024 / 1024) : null,
        heapTotal: memory.heapTotal ? Math.round(memory.heapTotal / 1024 / 1024) : null
      }
    },
    safe: true,
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true
  };
}

function routesPayload() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'debug-lite-routes',
    liteEndpoints: LITE_ENDPOINTS,
    heavyEndpointsDisabled: HEAVY_ENDPOINTS,
    safe: true,
    note: 'Use only lite endpoints on 0.1 vCPU. Heavy debug and stress-test endpoints are guarded and return a short disabled response.'
  };
}

function guardPayload(pathName) {
  return {
    ok: false,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'debug-lite-heavy-endpoint-guard',
    endpoint: pathName,
    disabled: true,
    reason: 'disabled_to_protect_0_1_vcpu_container',
    useInstead: ['/debug/lite', '/debug/lite/version', '/debug/lite/runtime', '/debug/lite/env', '/debug/lite/routes'],
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true
  };
}

function liteIndexPayload() {
  const info = getBuildInfo();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    startedAt: STARTED_AT,
    mode: 'debug-lite-index',
    appRuntimeVersion: info.runtimeVersion,
    displayVersion: info.displayVersion,
    packageVersion: info.packageVersion,
    sourceMarker: info.sourceMarker,
    endpoints: LITE_ENDPOINTS,
    heavyEndpointsDisabled: HEAVY_ENDPOINTS,
    safeContract: {
      constantTime: true,
      noDatabaseRead: true,
      noStoreSnapshot: true,
      noGithubExport: true,
      noStressTest: true,
      noMaxApiCall: true,
      noSecrets: true
    },
    nextStep: 'If these lite endpoints stay fast and CPU remains stable, production checklist can be rebuilt as segmented lite checks.'
  };
}

function installRoutes(app) {
  if (!app || app.__adminkitDebugLite1500) return app;
  app.__adminkitDebugLite1500 = true;

  app.get('/debug/lite', (req, res) => sendJson(res, liteIndexPayload()));
  app.get('/debug/lite/version', (req, res) => sendJson(res, versionPayload()));
  app.get('/debug/lite/runtime', (req, res) => sendJson(res, runtimePayload()));
  app.get('/debug/lite/env', (req, res) => sendJson(res, envFlagsPayload()));
  app.get('/debug/lite/routes', (req, res) => sendJson(res, routesPayload()));
  app.get('/debug/lite/guard', (req, res) => sendJson(res, guardPayload('/debug/lite/guard')));

  // Keep the lightweight names safe too. Registered before legacy routes.
  app.get('/healthz', (req, res) => sendJson(res, healthPayload()));
  app.get('/version', (req, res) => sendJson(res, versionPayload()));
  app.get('/debug/ping', (req, res) => sendJson(res, healthPayload()));
  app.get('/debug/build', (req, res) => sendJson(res, versionPayload()));

  // Hard guard old heavy routes so accidental clicks cannot hang the small container.
  for (const route of HEAVY_ENDPOINTS) {
    app.get(route, (req, res) => sendJson(res, guardPayload(route), 423));
  }

  return app;
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;

  const previousLoad = Module._load;
  Module._load = function adminkitDebugLiteLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__adminkitDebugLiteWrapped1500) return loaded;

    function wrappedExpress(...args) {
      const app = loaded(...args);
      return installRoutes(app);
    }

    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__adminkitDebugLiteWrapped1500 = true;
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
    liteEndpoints: LITE_ENDPOINTS,
    heavyEndpointsDisabled: HEAVY_ENDPOINTS,
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
  LITE_ENDPOINTS,
  HEAVY_ENDPOINTS,
  install,
  installRoutes,
  selfTest,
  healthPayload,
  versionPayload,
  runtimePayload,
  envFlagsPayload,
  routesPayload,
  liteIndexPayload,
  guardPayload
};
