'use strict';

const RUNTIME = 'CC7.5.34-CORE-1.49.2-SAFE-DIAGNOSTICS';
const SOURCE = 'adminkit-cc7-5-34-core-1-49-2-safe-diagnostics';
const MARKER = '__ADMINKIT_CC7_5_34_CORE_1_49_2_SAFE_DIAGNOSTICS_LOADER__';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
  process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
}

function installSafeDiagnostics() {
  try {
    const layer = require('./safe-diagnostics-route-layer');
    if (layer && typeof layer.install === 'function') return layer.install();
    return { ok: false, error: 'safe_diagnostics_layer_install_missing' };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

if (!global[MARKER]) {
  global[MARKER] = true;
  const diagnostics = installSafeDiagnostics();
  process.env.ADMINKIT_SAFE_DIAGNOSTICS_LAYER_OK = diagnostics.ok !== false ? '1' : '0';
  process.env.ADMINKIT_SAFE_DIAGNOSTICS_LAYER_RUNTIME = diagnostics.runtimeVersion || '';
  require('./adminkit-one-loader-cc7534');
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

module.exports = { RUNTIME, SOURCE, MARKER, CANONICAL_PUBLIC_BASE_URL };
