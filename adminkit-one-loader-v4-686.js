'use strict';

const RUNTIME = 'CC6.8.6-HARD-V3-COMMENTS-ONEPASS-ROOT';
const SOURCE = 'adminkit-v4-686-comments-onepass-root';
const MARKER = '__ADMINKIT_V4_686_COMMENTS_ONEPASS_ROOT__';

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
    console.warn('[adminkit-v4-686-loader] layer failed:', pathName, item.error);
  }
  preLayers.push(item);
  return item;
}

// DB meta and state helpers first.
load('./adminkit-v4-post-meta-title-resolver');
load('./adminkit-v4-ui-db-fix');

// One-pass client renderer. Do not load the old 684/685 client repaint layer here:
// it repaints after first paint and causes visible stages. This layer is the only comments-open UI layer.
load('./adminkit-comments-onepass-root-686');

const old = require('./adminkit-one-loader-v4');

// Legacy nested loaders mutate env while loading. Root debug must always report the real active build.
setRuntimeEnv();

function layerSummary() {
  return {
    runtimeVersion: RUNTIME,
    marker: MARKER,
    preLayers,
    oldLayerSummary: old && typeof old.layerSummary === 'function' ? old.layerSummary() : null,
    hasPostMetaNumericStartappFallback: preLayers.some(x => x.path === './adminkit-v4-post-meta-title-resolver' && x.ok),
    hasV4DbHelperMetaResolve: preLayers.some(x => x.path === './adminkit-v4-ui-db-fix' && x.ok),
    hasCommentsOnepassRoot: preLayers.some(x => x.path === './adminkit-comments-onepass-root-686' && x.ok),
    removed684RepaintLayer: true,
    removedDbFirstHideLayer: true,
    buildInfoSynced: true,
    policy: 'onepass_db_meta_before_first_client_paint_no_duplicate_chips_no_loading_title'
  };
}

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };
