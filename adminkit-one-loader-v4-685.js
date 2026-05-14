'use strict';

const RUNTIME = 'CC6.8.5-HARD-V3-COMMENTS-OPEN-ROOT';
const SOURCE = 'adminkit-v4-685-comments-open-core-build-info-sync';
const MARKER = '__ADMINKIT_V4_685_COMMENTS_OPEN_ROOT__';

function setRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
}

setRuntimeEnv();

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
    console.warn('[adminkit-v4-685-loader] layer failed:', pathName, item.error);
  }
  preLayers.push(item);
  return item;
}

// Route first: /api/adminkit/post-meta must return DB meta for numeric startapp/title.
load('./adminkit-v4-post-meta-title-resolver');
// DB helper and menu state saver.
load('./adminkit-v4-ui-db-fix');
// Client core: open screen immediately, no duplicate discussion chips, no permanent "Загрузка...".
load('./adminkit-comments-open-core-684');

const old = require('./adminkit-one-loader-v4');

// Older nested loaders set process.env back to their own runtime while loading.
// The public debug/ping route reads build-info first and env second, so keep the root runtime
// restored after all legacy layers are installed.
setRuntimeEnv();

function layerSummary() {
  return {
    runtimeVersion: RUNTIME,
    marker: MARKER,
    preLayers,
    oldLayerSummary: old && typeof old.layerSummary === 'function' ? old.layerSummary() : null,
    hasPostMetaNumericStartappFallback: preLayers.some(x => x.path === './adminkit-v4-post-meta-title-resolver' && x.ok),
    hasV4DbHelperMetaResolve: preLayers.some(x => x.path === './adminkit-v4-ui-db-fix' && x.ok),
    hasCommentsOpenCoreNoFlicker: preLayers.some(x => x.path === './adminkit-comments-open-core-684' && x.ok),
    removedDbFirstHideLayer: true,
    buildInfoSynced: true,
    hasCommentsSourceUiCore: false
  };
}

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };
