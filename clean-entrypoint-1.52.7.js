'use strict';

const RUNTIME = 'CC7.5.34-CORE-1.52.7-CLEAN-ENTRYPOINT-PRODUCTION-RUNTIME';
const SOURCE = 'adminkit-cc7-5-34-core-1-52-7-clean-entrypoint-production-runtime';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const ACTIVE_PRODUCTION_RUNTIME = './index';
const SAFE_ROLLBACK_RUNTIME = './clean-entrypoint-1.52.5';

function applyRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

function installSafeDebugLiteLayer() {
  try {
    const layer = require('./debug-lite-route-layer');
    if (layer && typeof layer.install === 'function') return layer.install();
    return { ok: false, error: 'debug_lite_layer_install_missing' };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function getCleanEntrypointInfo() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    canonicalPublicBaseUrl: CANONICAL_PUBLIC_BASE_URL,
    activeRuntimeEntrypoint: true,
    packageJsonSwitched: true,
    activeProductionRuntime: 'index.js',
    safeRollbackRuntime: 'clean-entrypoint-1.52.5.js',
    intent: 'Run the current production app from the clean entrypoint instead of delegating to the legacy loader chain.',
    startMenuExpected: 'bot.js buildAdminMenuText/buildAdminSectionsKeyboard',
    legacyMenuExpected: false,
    debugLiteInstalledBeforeExpressLoad: true,
    noDatabaseReadInEntrypoint: true,
    noStoreSnapshotInEntrypoint: true,
    noGithubExportInEntrypoint: true,
    noStressTestInEntrypoint: true,
    rollback: 'Set package.json start back to node clean-entrypoint-1.52.5.js'
  };
}

function start() {
  applyRuntimeEnv();
  const debugLite = installSafeDebugLiteLayer();
  process.env.ADMINKIT_DEBUG_LITE_LAYER_OK = debugLite && debugLite.ok !== false ? '1' : '0';
  process.env.ADMINKIT_DEBUG_LITE_LAYER_RUNTIME = debugLite && debugLite.runtimeVersion ? debugLite.runtimeVersion : '';
  return require(ACTIVE_PRODUCTION_RUNTIME);
}

if (require.main === module) {
  start();
}

module.exports = { RUNTIME, SOURCE, CANONICAL_PUBLIC_BASE_URL, ACTIVE_PRODUCTION_RUNTIME, SAFE_ROLLBACK_RUNTIME, applyRuntimeEnv, installSafeDebugLiteLayer, getCleanEntrypointInfo, start };
