'use strict';

// V4 wrapper: ставим фиксы до старого loader/index.
const RUNTIME = 'CC6.7.6-HARD-V3-DB-GUARD-ROOT';
const SOURCE = 'adminkit-v4-one-current-menu-and-comment-banner';
const MARKER = '__ADMINKIT_V4_ONE_CURRENT_MENU_AND_BANNER__';
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
    console.warn('[adminkit-v4-loader] layer failed:', pathName, item.error);
  }
  preLayers.push(item);
  return item;
}

load('./adminkit-one-current-menu-editor');
load('./adminkit-comment-banner-ui');

const old = require('./adminkit-one-loader-v3');

function layerSummary() {
  return {
    runtimeVersion: RUNTIME,
    marker: MARKER,
    preLayers,
    oldLayerSummary: old && typeof old.layerSummary === 'function' ? old.layerSummary() : null,
    hasOneCurrentMenuEditor: preLayers.some(x => x.path === './adminkit-one-current-menu-editor' && x.ok),
    hasCommentBannerUi: preLayers.some(x => x.path === './adminkit-comment-banner-ui' && x.ok)
  };
}

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };
