'use strict';

const RUNTIME = 'CC6.7.7-HARD-V3-DB-GUARD-ROOT';
const SOURCE = 'adminkit-v4-677-ui-db-fix';
const MARKER = '__ADMINKIT_V4_677_UI_DB_FIX__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

const preLayers = [];
function load(pathName) {
  const item = { path: pathName, ok: false, at: new Date().toISOString(), error: '' };
  try {
    const mod = require(pathName);
    const result = mod && typeof mod.install === 'function' ? mod.install() : null;
    item.ok = result?.ok !== false;
    item.runtimeVersion = result?.runtimeVersion || mod?.RUNTIME || '';
    item.marker = result?.marker || mod?.MARKER || '';
    item.result = result;
  } catch (error) {
    item.error = error?.message || String(error);
    console.warn('[adminkit-v4-677-loader] layer failed:', pathName, item.error);
  }
  preLayers.push(item);
  return item;
}

load('./adminkit-v4-ui-db-fix');
const old = require('./adminkit-one-loader-v4');

function layerSummary() {
  return {
    runtimeVersion: RUNTIME,
    marker: MARKER,
    preLayers,
    oldLayerSummary: old && typeof old.layerSummary === 'function' ? old.layerSummary() : null,
    hasV4UiDbFix: preLayers.some(x => x.path === './adminkit-v4-ui-db-fix' && x.ok)
  };
}

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };
