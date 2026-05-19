'use strict';

const fs = require('fs');

const RUNTIME = 'CC7.5.34-CORE-1.52.8-CLEAN-RUNTIME-NATIVE-MENU-NO-LOGO-ATTACHMENT';
const SOURCE = 'adminkit-cc7-5-34-core-1-52-8-clean-runtime-native-menu-no-logo-attachment';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const ACTIVE_PRODUCTION_RUNTIME = './index';
const SAFE_ROLLBACK_RUNTIME = './clean-entrypoint-1.52.7';

function applyRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT = '1';
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

function installNativeMenuLogoGuard() {
  if (global.__ADMINKIT_NATIVE_MENU_LOGO_GUARD_1528__) {
    return { ok: true, already: true, runtimeVersion: RUNTIME };
  }
  global.__ADMINKIT_NATIVE_MENU_LOGO_GUARD_1528__ = true;
  const originalExistsSync = fs.existsSync;
  fs.existsSync = function patchedExistsSync(targetPath) {
    const normalized = String(targetPath || '').replace(/\\/g, '/');
    if (process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT === '1' && /\/public\/adminkit_chat_logo\.png$/i.test(normalized)) {
      return false;
    }
    return originalExistsSync.apply(this, arguments);
  };
  return { ok: true, runtimeVersion: RUNTIME, disabledPathSuffix: '/public/adminkit_chat_logo.png' };
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
    safeRollbackRuntime: 'clean-entrypoint-1.52.7.js',
    nativeMenuOnly: true,
    menuLogoAttachmentDisabled: true,
    reason: 'MAX renders the uploaded menu logo as a large cropped image above the inline keyboard; the main menu must be native inline only.',
    startMenuExpected: 'text + inline keyboard only, no image attachment above menu',
    noDatabaseReadInEntrypoint: true,
    noStoreSnapshotInEntrypoint: true,
    noGithubExportInEntrypoint: true,
    noStressTestInEntrypoint: true,
    rollback: 'Set package.json start back to node clean-entrypoint-1.52.7.js'
  };
}

function start() {
  applyRuntimeEnv();
  const debugLite = installSafeDebugLiteLayer();
  const logoGuard = installNativeMenuLogoGuard();
  process.env.ADMINKIT_DEBUG_LITE_LAYER_OK = debugLite && debugLite.ok !== false ? '1' : '0';
  process.env.ADMINKIT_DEBUG_LITE_LAYER_RUNTIME = debugLite && debugLite.runtimeVersion ? debugLite.runtimeVersion : '';
  process.env.ADMINKIT_MENU_LOGO_GUARD_OK = logoGuard && logoGuard.ok !== false ? '1' : '0';
  return require(ACTIVE_PRODUCTION_RUNTIME);
}

if (require.main === module) {
  start();
}

module.exports = { RUNTIME, SOURCE, CANONICAL_PUBLIC_BASE_URL, ACTIVE_PRODUCTION_RUNTIME, SAFE_ROLLBACK_RUNTIME, applyRuntimeEnv, installSafeDebugLiteLayer, installNativeMenuLogoGuard, getCleanEntrypointInfo, start };
