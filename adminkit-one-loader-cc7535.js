'use strict';

const RUNTIME = 'CC7.5.35-CORE-1.50.0-DEBUG-GITHUB-EXPORT';
const SOURCE = 'adminkit-cc7-5-35-core-1-50-0-debug-github-export';
const MARKER = '__ADMINKIT_CC7_5_35_CORE_1_50_0_DEBUG_GITHUB_EXPORT_LOADER__';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
  process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
}

function safeInstallDebugExportLayer() {
  try {
    const layer = require('./debug-export-route-layer');
    return layer && typeof layer.install === 'function' ? layer.install() : { ok: false, error: 'debug_export_layer_install_missing' };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

if (!global[MARKER]) {
  global[MARKER] = true;
  const debugLayer = safeInstallDebugExportLayer();
  process.env.ADMINKIT_DEBUG_EXPORT_LAYER_OK = debugLayer.ok !== false ? '1' : '0';
  process.env.ADMINKIT_DEBUG_EXPORT_LAYER_RUNTIME = debugLayer.runtimeVersion || '';
  require('./adminkit-one-loader-cc7534');
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

module.exports = { RUNTIME, SOURCE, MARKER, CANONICAL_PUBLIC_BASE_URL };
