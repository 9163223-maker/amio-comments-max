'use strict';

const RUNTIME = 'CC7.5.39-CORE-1.51.2-PRODUCTION-GATE-ENDPOINTS';
const SOURCE = 'adminkit-cc7-5-39-core-1-51-2-production-gate-endpoints';
const MARKER = '__ADMINKIT_CC7_5_39_CORE_1_51_2_PRODUCTION_GATE_ENDPOINTS_LOADER__';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
  process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
}

function safeInstallProductionGateLayer() {
  try {
    const layer = require('./production-gate-route-layer');
    return layer && typeof layer.install === 'function' ? layer.install() : { ok: false, error: 'production_gate_layer_install_missing' };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

if (!global[MARKER]) {
  global[MARKER] = true;
  const gateLayer = safeInstallProductionGateLayer();
  process.env.ADMINKIT_PRODUCTION_GATE_LAYER_OK = gateLayer.ok !== false ? '1' : '0';
  process.env.ADMINKIT_PRODUCTION_GATE_LAYER_RUNTIME = gateLayer.runtimeVersion || '';
  require('./adminkit-one-loader-cc7538');
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

module.exports = { RUNTIME, SOURCE, MARKER, CANONICAL_PUBLIC_BASE_URL };
