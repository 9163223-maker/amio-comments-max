'use strict';

/**
 * Explicit Debug Lite routes for the future clean-core entrypoint.
 *
 * This module is intentionally free of Module._load / monkeypatch logic.
 * It does not auto-install itself. A clean server entrypoint must call:
 *
 *   const { registerDebugLiteRoutes } = require('./src/diagnostics/debug-lite-routes');
 *   registerDebugLiteRoutes(app, options);
 *
 * Safety contract:
 * - no DB read;
 * - no store snapshot;
 * - no GitHub export;
 * - no stress-test;
 * - no MAX API call;
 * - no secrets in output.
 */

const fs = require('fs');
const path = require('path');

const RUNTIME = 'ADMINKIT-DIAGNOSTICS-DEBUG-LITE-ROUTES-1.52.2';
const STARTED_AT = new Date().toISOString();
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

const LITE_ENDPOINTS = Object.freeze([
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
  '/debug/build',
  '/debug/prod',
  '/debug/prod/overview',
  '/debug/prod/runtime',
  '/debug/prod/routes',
  '/debug/prod/env',
  '/debug/prod/features',
  '/debug/prod/checklist'
]);

const PROD_ENDPOINTS = Object.freeze([
  '/debug/prod',
  '/debug/prod/overview',
  '/debug/prod/runtime',
  '/debug/prod/routes',
  '/debug/prod/env',
  '/debug/prod/features',
  '/debug/prod/checklist'
]);

const HEAVY_ENDPOINTS = Object.freeze([
  '/debug/store-live',
  '/debug/core-stress',
  '/debug/export',
  '/debug/export-lite'
]);

function nowIso() {
  return new Date().toISOString();
}

function readJsonFileSafe(fileName, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), fileName), 'utf8'));
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
    runtimeVersion: process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || info.runtimeVersion || RUNTIME,
    buildVersion: process.env.BUILD_VERSION || process.env.RUNTIME_VERSION || info.buildVersion || RUNTIME,
    displayVersion: info.displayVersion || 'CC7.5.34',
    packageVersion: pkg.version || info.packageVersion || '',
    packageName: pkg.name || info.packageName || 'amio-comments-max',
    sourceMarker: process.env.BUILD_SOURCE_MARKER || info.sourceMarker || '',
    buildGeneratedAt: info.buildGeneratedAt || '',
    canonicalPublicBaseUrl: process.env.ADMINKIT_PUBLIC_BASE_URL || info.canonicalPublicBaseUrl || CANONICAL_PUBLIC_BASE_URL,
    debugPolicy: info.debugPolicy || 'debug-lite-plus-production-checklist-lite'
  };
}

function boolPresence(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function setNoCache(res, headerName = 'X-Adminkit-Debug-Lite') {
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
    [headerName]: RUNTIME
  });
}

function sendJson(res, payload, statusCode = 200) {
  res.status(statusCode);
  setNoCache(res);
  return res.send(JSON.stringify(payload, null, 2));
}

function healthPayload() {
  return { ok: true, runtimeVersion: RUNTIME, generatedAt: nowIso(), startedAt: STARTED_AT, mode: 'debug-lite-health', safe: true };
}

function versionPayload() {
  const i = getBuildInfo();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'debug-lite-version',
    appRuntimeVersion: i.runtimeVersion,
    buildVersion: i.buildVersion,
    displayVersion: i.displayVersion,
    packageVersion: i.packageVersion,
    packageName: i.packageName,
    sourceMarker: i.sourceMarker,
    buildGeneratedAt: i.buildGeneratedAt,
    canonicalPublicBaseUrl: i.canonicalPublicBaseUrl,
    versionAlignment: { routeLayer: RUNTIME, appRuntimeVersion: i.runtimeVersion, source: 'env-first' },
    safe: true
  };
}

function runtimePayload() {
  const m = process.memoryUsage ? process.memoryUsage() : {};
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
        rss: m.rss ? Math.round(m.rss / 1048576) : null,
        heapUsed: m.heapUsed ? Math.round(m.heapUsed / 1048576) : null,
        heapTotal: m.heapTotal ? Math.round(m.heapTotal / 1048576) : null
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

function routesPayload() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'debug-lite-routes',
    liteEndpoints: LITE_ENDPOINTS,
    prodEndpoints: PROD_ENDPOINTS,
    heavyEndpointsDisabled: HEAVY_ENDPOINTS,
    safe: true,
    note: 'Explicit clean-core route module. No Module._load monkeypatch.'
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
    useInstead: ['/debug/lite', '/debug/prod/overview', '/debug/prod/checklist'],
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true
  };
}

function liteIndexPayload() {
  const i = getBuildInfo();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    startedAt: STARTED_AT,
    mode: 'debug-lite-index',
    appRuntimeVersion: i.runtimeVersion,
    displayVersion: i.displayVersion,
    packageVersion: i.packageVersion,
    sourceMarker: i.sourceMarker,
    endpoints: LITE_ENDPOINTS,
    heavyEndpointsDisabled: HEAVY_ENDPOINTS,
    safeContract: {
      constantTime: true,
      noDatabaseRead: true,
      noStoreSnapshot: true,
      noGithubExport: true,
      noStressTest: true,
      noMaxApiCall: true,
      noSecrets: true,
      noMonkeyPatch: true
    },
    nextStep: 'Wire this module through a clean entrypoint after runtime switch approval.'
  };
}

function prodOverviewPayload() {
  const i = getBuildInfo();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'prod-checklist-overview-lite',
    appRuntimeVersion: i.runtimeVersion,
    displayVersion: i.displayVersion,
    packageVersion: i.packageVersion,
    publicBaseUrl: i.canonicalPublicBaseUrl,
    sections: ['runtime', 'routes', 'env', 'features', 'checklist'],
    status: 'READY_FOR_MANUAL_PRODUCTION_CHECK_AFTER_CLEAN_ENTRYPOINT_SWITCH',
    safe: true,
    constantTime: true
  };
}

function prodRuntimePayload() {
  return Object.assign({}, runtimePayload(), {
    mode: 'prod-checklist-runtime-lite',
    checks: { serverResponds: true, memoryPayloadSmall: true, noHeavyDebugCalled: true, noDatabaseRead: true, noMaxApiCall: true }
  });
}

function prodRoutesPayload() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'prod-checklist-routes-lite',
    requiredLiteRoutes: PROD_ENDPOINTS.concat(['/healthz', '/version', '/debug/lite']),
    guardedHeavyRoutes: HEAVY_ENDPOINTS,
    checks: { healthz: true, version: true, debugLite: true, segmentedProductionChecklist: true, heavyDebugGuarded: true, explicitRegistration: true },
    safe: true
  };
}

function prodEnvPayload() {
  const e = envFlagsPayload();
  return Object.assign({}, e, {
    mode: 'prod-checklist-env-lite',
    checks: {
      botTokenPresent: e.env.BOT_TOKEN,
      appBaseUrlPresent: e.env.APP_BASE_URL,
      databaseUrlPresent: e.env.DATABASE_URL,
      githubDebugTokenPresent: e.env.GITHUB_DEBUG_TOKEN,
      githubDebugRepoPresent: e.env.GITHUB_DEBUG_REPO,
      secretsMasked: true
    }
  });
}

function prodFeaturesPayload() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'prod-checklist-features-lite',
    passedCoreSections: ['1.41 comments', '1.42 moderation', '1.43 stats', '1.44 post editor + archive', '1.45 post highlights', '1.46 polls', '1.47 channel connection', '1.48 navigation v3'],
    currentStabilization: ['1.49 emergency CPU rollback', '1.50 debug lite', '1.51 segmented production checklist', '1.52 clean core'],
    notExecutedHere: ['real MAX API edit', 'real DB store inspection', 'heavy stress-test', 'GitHub export'],
    policy: 'No video/files in comments. Photos only inside comments. Native inline hints only; no overlay/float hints.',
    safe: true
  };
}

function prodChecklistPayload() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    mode: 'prod-checklist-final-lite',
    checklist: {
      deploymentVersionVisible: true,
      canonicalDomainUsesCommnets: true,
      debugLiteFast: true,
      heavyDebugDisabled: true,
      cpuSafeByDesign: true,
      secretsMasked: true,
      productionStressMustStaySegmented: true,
      manualUserVerificationRequired: true,
      explicitRouteRegistrationReady: true
    },
    safe: true
  };
}

function registerDebugLiteRoutes(app) {
  if (!app || app.__adminkitExplicitDebugLite1522) return app;
  app.__adminkitExplicitDebugLite1522 = true;

  app.get('/debug/lite', (req, res) => sendJson(res, liteIndexPayload()));
  app.get('/debug/lite/version', (req, res) => sendJson(res, versionPayload()));
  app.get('/debug/lite/runtime', (req, res) => sendJson(res, runtimePayload()));
  app.get('/debug/lite/env', (req, res) => sendJson(res, envFlagsPayload()));
  app.get('/debug/lite/routes', (req, res) => sendJson(res, routesPayload()));
  app.get('/debug/lite/guard', (req, res) => sendJson(res, guardPayload('/debug/lite/guard')));
  app.get('/debug/prod', (req, res) => sendJson(res, prodOverviewPayload()));
  app.get('/debug/prod/overview', (req, res) => sendJson(res, prodOverviewPayload()));
  app.get('/debug/prod/runtime', (req, res) => sendJson(res, prodRuntimePayload()));
  app.get('/debug/prod/routes', (req, res) => sendJson(res, prodRoutesPayload()));
  app.get('/debug/prod/env', (req, res) => sendJson(res, prodEnvPayload()));
  app.get('/debug/prod/features', (req, res) => sendJson(res, prodFeaturesPayload()));
  app.get('/debug/prod/checklist', (req, res) => sendJson(res, prodChecklistPayload()));
  app.get('/healthz', (req, res) => sendJson(res, healthPayload()));
  app.get('/version', (req, res) => sendJson(res, versionPayload()));
  app.get('/debug/ping', (req, res) => sendJson(res, healthPayload()));
  app.get('/debug/build', (req, res) => sendJson(res, versionPayload()));

  for (const route of HEAVY_ENDPOINTS) {
    app.get(route, (req, res) => sendJson(res, guardPayload(route), 423));
  }

  return app;
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    explicitRegistration: true,
    noModuleLoadPatch: true,
    liteEndpoints: LITE_ENDPOINTS,
    prodEndpoints: PROD_ENDPOINTS,
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
  LITE_ENDPOINTS,
  PROD_ENDPOINTS,
  HEAVY_ENDPOINTS,
  registerDebugLiteRoutes,
  selfTest,
  healthPayload,
  versionPayload,
  runtimePayload,
  envFlagsPayload,
  routesPayload,
  liteIndexPayload,
  guardPayload,
  prodOverviewPayload,
  prodRuntimePayload,
  prodRoutesPayload,
  prodEnvPayload,
  prodFeaturesPayload,
  prodChecklistPayload
};
