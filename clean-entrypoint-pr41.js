'use strict';

const RUNTIME = 'CC8.1.16-FAST-PATCH-CORE-PR76';
const SOURCE = 'adminkit-cc8-1-16-fast-patch-core-pr76';
const BASE = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
let persistentStoreState = null;
let fastPatchState = null;

function applyEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  process.env.ADMINKIT_PUBLIC_BASE_URL = BASE;
  process.env.ADMINKIT_CLEAN_MENU_CORE = '1';
  process.env.ADMINKIT_CLEAN_ENTRYPOINT = 'pr76-fast-patch-core';
  process.env.ADMINKIT_UI_TRACE = '1';
  if (process.env.ADMINKIT_UI_TRACE_LIMIT === undefined) process.env.ADMINKIT_UI_TRACE_LIMIT = '20';
}

function installFastPatchCore() {
  const fastPatch = require('./services/postPatcherFast76');
  fastPatchState = fastPatch.install();
  return fastPatchState;
}

async function installPersistentStore() {
  const bootstrap = require('./persistent-store-bootstrap');
  persistentStoreState = await bootstrap.install({ runtimeVersion: RUNTIME });
  return persistentStoreState;
}

function installExpressRoutes() {
  const expressPath = require.resolve('express');
  const express = require('express');
  const routes = require('./v3-menu-routes-1539');
  const performanceRoutes = require('./performance-debug-routes-pr73');
  if (express && express.__adminkitClean1539Wrapped) return { ok: true, already: true, runtimeVersion: RUNTIME };
  function wrappedExpress() {
    const app = express.apply(this, arguments);
    routes.install(app);
    performanceRoutes.install(app);
    return app;
  }
  Object.setPrototypeOf(wrappedExpress, express);
  Object.assign(wrappedExpress, express);
  wrappedExpress.__adminkitClean1539Wrapped = true;
  require.cache[expressPath].exports = wrappedExpress;
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    mode: 'express-wrapper-1539-pr76-fast-patch-core',
    performanceTrace: true,
    noModuleLoadPatch: true,
    fastPatchCore: true
  };
}

function installCleanBot() {
  const botPath = require.resolve('./bot');
  const legacy = require('./bot');
  const adapter = require('./clean-bot-posts-open-async-1547');
  const giftCodeBridge = require('./bridge-pr56');
  const clean = giftCodeBridge.createCleanBot(adapter.createCleanBot(legacy));
  require.cache[botPath].exports = clean;
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    mode: 'bot-wrapper-1547-pr76-fast-patch-core',
    functionalSectionsDelegateToLegacy: true,
    oneActiveInputFlow: true,
    postsOpenAsyncDelivery: true,
    fastPatchCore: true,
    noLiveGetMessageDefault: true,
    asyncDbSync: true,
    giftsCleanFlow: true,
    giftsTenantScoped: true,
    giftsConditionsBuilder: true,
    giftsSavePatch: true,
    giftConditionsGatekeeper: true,
    giftClaimCodeInput: true,
    buttonsCleanFlow: true,
    buttonsTenantScoped: true,
    uiTraceAlwaysOn: true,
    noMaxApiPatch: true
  };
}

function info() {
  const bootstrap = require('./persistent-store-bootstrap');
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    canonicalPublicBaseUrl: BASE,
    cleanBase: true,
    entrypoint: 'clean-entrypoint-pr41.js',
    fastPatchCore: 'services/postPatcherFast76.js',
    fastPatchState,
    menuCore: 'v3-menu-core-1539.js',
    giftsBottomFlow: 'gifts-flow-cc812-bottom.js',
    giftConditionGate: 'services/giftConditionGate.js',
    giftPendingClaimLookup: 'services/giftPendingClaimLookup.js',
    giftCodeBridge: 'bridge-pr56.js',
    buttonsCleanFlow: 'buttons-flow-cc8-clean.js',
    tenantScope: 'tenant-scope.js',
    botAdapter: 'clean-bot-posts-open-async-1547.js',
    performanceTrace: 'performance-debug-routes-pr73.js',
    persistentStore: bootstrap.info(),
    postsOpenAsyncDelivery: true,
    noLiveGetMessageDefault: true,
    asyncDbSync: true,
    giftsCleanFlow: true,
    giftsTenantScoped: true,
    giftsConditionsBuilder: true,
    giftsSavePatch: true,
    giftConditionsGatekeeper: true,
    giftClaimCodeInput: true,
    buttonsCleanFlow: true,
    buttonsTenantScoped: true,
    uiTraceAlwaysOn: true,
    uiTraceLimit: 20,
    performanceTraceEnabled: true,
    noModuleLoadPatch: true,
    noMaxApiPatch: true
  };
}

async function start() {
  applyEnv();
  const fastPatch = installFastPatchCore();
  const persistentStore = await installPersistentStore();
  const expressRoutes = installExpressRoutes();
  const cleanBot = installCleanBot();
  process.env.ADMINKIT_CLEAN_1539_EXPRESS_ROUTES_OK = expressRoutes.ok ? '1' : '0';
  process.env.ADMINKIT_CLEAN_1539_BOT_OK = cleanBot.ok ? '1' : '0';
  console.log('adminkit pr76 fast patch core start', JSON.stringify({ runtimeVersion: RUNTIME, fastPatch, persistentStore, expressRoutes, cleanBot }));
  return require('./index');
}

if (require.main === module) start().catch((e) => {
  console.error('adminkit pr76 fast patch core boot failed', e && e.stack || e);
});

module.exports = {
  RUNTIME,
  SOURCE,
  BASE,
  applyEnv,
  installFastPatchCore,
  installPersistentStore,
  installExpressRoutes,
  installCleanBot,
  info,
  start
};
