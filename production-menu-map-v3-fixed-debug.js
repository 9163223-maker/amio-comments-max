'use strict';

const Module = require('module');
const menuMap = require('./production-menu-map-v3-fixed');

const RUNTIME = 'CC6.5.6.0-ADMIN-KIT-STATUS';
const SOURCE = 'adminkit-CC6.5.6.0-unified-admin-kit-status-v3-native-hints';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function safeRequire(path) {
  try {
    return require(path);
  } catch (error) {
    return { __requireError: error && error.message ? error.message : String(error || 'require_failed') };
  }
}

function safeCall(fn, fallback = null) {
  try {
    return typeof fn === 'function' ? fn() : fallback;
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error || 'call_failed') };
  }
}

function compactValidation() {
  const validation = menuMap.validateMenuMapV3();
  return {
    ok: validation.ok,
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    version: validation.version,
    testMode: validation.testMode,
    totalSections: validation.totalSections,
    totalRoutes: validation.totalRoutes,
    visibleRoutes: validation.visibleRoutes,
    mainMenuRoutes: validation.mainMenuRoutes,
    errors: validation.errors.length,
    warnings: validation.warnings.length,
    errorList: validation.errors,
    warningList: validation.warnings,
    countsByOwner: validation.countsByOwner,
    countsByTariff: validation.countsByTariff,
    countsByStatus: validation.countsByStatus,
    rules: validation.rules,
    debugJson: '/debug/production-menu-map-v3',
    debugOwner: '/debug/production-menu-owner-v3?owner=comments',
    adminKitStatus: '/debug/admin-kit-status'
  };
}

function adminKitStatus() {
  const packageInfo = safeRequire('./package.json');
  const bridge = safeRequire('./cc55-v3-live-bridge');
  const adapter = safeRequire('./menu-v3-feature-adapter-fixed');
  const canonical = safeRequire('./cc52-moderation-router');
  const hintsCleanup = safeRequire('./v3-native-hints-cleanup');

  const mapValidation = compactValidation();
  const bridgeSelfTest = safeCall(bridge.selfTest, { ok: false, reason: 'bridge_selfTest_missing' });
  const adapterSelfTest = safeCall(adapter.selfTest, { ok: false, reason: 'adapter_selfTest_missing' });
  const canonicalSelfTest = safeCall(canonical.selfTest, { ok: false, reason: 'canonical_selfTest_missing' });
  const hintsCleanupSelfTest = safeCall(hintsCleanup.selfTest, { ok: false, reason: 'hints_cleanup_selfTest_missing' });

  const bridgeChecks = bridgeSelfTest && bridgeSelfTest.checks ? bridgeSelfTest.checks : {};
  const adapterChecks = adapterSelfTest && adapterSelfTest.checks ? adapterSelfTest.checks : {};
  const hintsPolicy = hintsCleanupSelfTest && hintsCleanupSelfTest.policy ? hintsCleanupSelfTest.policy : {};

  const statusChecks = {
    server: true,
    safeCoreFrozen: true,
    bootUntouchedByThisStatus: true,
    packageUntouchedByThisStatus: true,
    dockerUntouchedByThisStatus: true,
    debugPingUntouchedByThisStatus: true,
    debugStoreUntouchedByThisStatus: true,
    v3MapOk: !!mapValidation.ok,
    v3BridgeLoaded: !bridge.__requireError,
    v3BridgeOk: !!bridgeSelfTest.ok,
    v3AdapterLoaded: !adapter.__requireError,
    v3AdapterOk: !!adapterSelfTest.ok,
    canonicalModerationOk: !!canonicalSelfTest.ok,
    v3NativeHintsCleanupLoaded: !hintsCleanup.__requireError,
    v3NativeHintsCleanupOk: !!hintsCleanupSelfTest.ok,
    nativeHintsOnlyInline: !!hintsPolicy.nativeHintsOnlyInline,
    noOverlayHints: !!hintsPolicy.disablesOverlayHints,
    noLegacyGrowthCta: !!hintsPolicy.disablesLegacyGrowthCta,
    photoOnlyAttachmentPolicy: !!hintsPolicy.photoOnlyAttachmentPolicy,
    productionSingleMainMenu: !!(adapterChecks.productionSingleMainMenu || bridgeChecks.productionSingleMainMenu),
    compactCallbacks: !!(adapterChecks.compactCallbacks || bridgeChecks.compactCallbackPayloads || bridgeChecks.compactCallbacks),
    mainMenuOwnedByV3: !!(bridgeChecks.mainMenuOwnedByV3 || adapterChecks.rendererHasMain),
    botStartedMenuOwnedByV3: !!bridgeChecks.botStartedMenuOwnedByV3,
    realStartTextOwnedByV3Bridge: !!bridgeChecks.realStartTextOwnedByV3Bridge,
    commentsChoosePostOwnedByV3: !!bridgeChecks.commentsChoosePostOwnedByV3,
    editorChoosePostOwnedByV3: !!bridgeChecks.editorChoosePostOwnedByV3,
    moderationOwnedByCanonicalRouter: !!bridgeChecks.moderationOwnedByCanonicalRouter,
    noLegacyMainMenu: !!adapterChecks.noLegacyMainMenu,
    noLegacyOverlayClaim: !!(adapterChecks.noLegacyMainMenu && adapterChecks.productionSingleMainMenu)
  };

  const blockingKeys = [
    'server',
    'safeCoreFrozen',
    'bootUntouchedByThisStatus',
    'packageUntouchedByThisStatus',
    'dockerUntouchedByThisStatus',
    'debugPingUntouchedByThisStatus',
    'debugStoreUntouchedByThisStatus',
    'v3MapOk',
    'v3BridgeLoaded',
    'v3BridgeOk',
    'v3AdapterLoaded',
    'v3AdapterOk',
    'canonicalModerationOk',
    'v3NativeHintsCleanupLoaded',
    'v3NativeHintsCleanupOk',
    'nativeHintsOnlyInline',
    'noOverlayHints',
    'noLegacyGrowthCta',
    'photoOnlyAttachmentPolicy',
    'productionSingleMainMenu',
    'compactCallbacks',
    'mainMenuOwnedByV3',
    'botStartedMenuOwnedByV3',
    'realStartTextOwnedByV3Bridge',
    'commentsChoosePostOwnedByV3',
    'editorChoosePostOwnedByV3',
    'moderationOwnedByCanonicalRouter',
    'noLegacyMainMenu'
  ];

  const failed = blockingKeys.filter((key) => !statusChecks[key]);

  return {
    ok: failed.length === 0,
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    endpoint: '/debug/admin-kit-status',
    status: failed.length === 0 ? 'READY_TO_TEST_FUNCTIONS' : 'CHECK_BEFORE_FUNCTION_TESTS',
    failed,
    safeCoreFreeze: true,
    currentPackage: {
      name: packageInfo.name,
      version: packageInfo.version,
      main: packageInfo.main,
      start: packageInfo.scripts && packageInfo.scripts.start
    },
    expected: {
      singleMainMenu: 'V3_COMPACT',
      noLegacyMainMenuOverlay: true,
      nativeHintsOnlyInline: true,
      overlayHintsForbidden: true,
      oldGrowthCtaForbidden: true,
      photoOnlyAttachmentMenu: true,
      noBootChangesForMenu: true,
      noDebugStorePingChangesForMenu: true
    },
    checks: statusChecks,
    versions: {
      bridgeRuntime: bridge.RUNTIME || null,
      bridgeSource: bridge.SOURCE || null,
      adapterRuntime: adapter.RUNTIME || null,
      adapterSource: adapter.SOURCE || null,
      hintsCleanupRuntime: hintsCleanup.RUNTIME || hintsCleanupSelfTest.runtimeVersion || null,
      hintsCleanupSource: hintsCleanup.SOURCE || hintsCleanupSelfTest.sourceMarker || null,
      canonicalRuntime: canonicalSelfTest.runtime || canonicalSelfTest.runtimeVersion || null
    },
    map: mapValidation,
    bridgeSelfTest,
    adapterSelfTest,
    hintsCleanupSelfTest,
    canonicalSelfTest
  };
}

function install() {
  if (Module._load.__productionMenuMapV3FixedDebug) return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, alreadyInstalled: true };
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__productionMenuMapV3FixedDebugWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__productionMenuMapV3FixedDebug) {
          app.__productionMenuMapV3FixedDebug = true;
          app.use((req, res, next) => {
            const path = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (path === '/debug/admin-kit-status') {
              noCache(res);
              return res.json(adminKitStatus());
            }
            if (path === '/debug/production-menu-map-v3-summary') {
              noCache(res);
              return res.json(compactValidation());
            }
            if (path === '/debug/production-menu-map-v3') {
              noCache(res);
              return res.json({ ok: true, runtime: RUNTIME, sourceMarker: SOURCE, ...menuMap.getMenuMapV3() });
            }
            if (path === '/debug/production-menu-owner-v3') {
              noCache(res);
              const owner = String(req.query?.owner || '').trim();
              return res.json({ ok: true, runtime: RUNTIME, sourceMarker: SOURCE, owner, routes: menuMap.getOwnerRoutes(owner) });
            }
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__productionMenuMapV3FixedDebugWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__productionMenuMapV3FixedDebug = true;
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, compactValidation, adminKitStatus };
