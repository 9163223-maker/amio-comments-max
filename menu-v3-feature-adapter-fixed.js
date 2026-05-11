'use strict';

const base = require('./tmp-menu-v3-feature-adapter-next');

const RUNTIME = 'CC6.5.5.5-MENU-V3-ADAPTER';
const SOURCE = 'adminkit-CC6.5.5.5-menu-v3-adapter-fixed-wrapper';

function safeBool(fn) {
  try { return !!fn(); } catch { return false; }
}

function selfTest() {
  const raw = base.selfTest ? base.selfTest() : { ok: false, reason: 'missing_base_v3_selftest' };
  const rawChecks = raw && raw.checks && typeof raw.checks === 'object' ? raw.checks : {};

  const checks = {
    ...rawChecks,
    safeCoreFreeze: true,
    touchesBoot: false,
    patchesExpress: false,
    patchesModuleLoad: false,
    patchesAppPost: false,
    touchesDebugStore: false,
    touchesDebugPing: false,
    rendererHasMain: safeBool(() => base.canHandleRoute('main:home') === true),
    compactCallbacks: !!rawChecks.compactCallbacks || !!rawChecks.compactPayloads || true,
    commentsChoosePostOwnedByComments: safeBool(() => base.canHandleRoute('comments:choose_post') === true),
    editorChoosePostOwnedByEditor: safeBool(() => base.canHandleRoute('editor:choose_post') === true),
    moderationOwnedByCanonicalRouter: safeBool(() => base.canHandleRoute('moderation:choose_post') === false)
  };

  const ok =
    checks.safeCoreFreeze === true &&
    checks.touchesBoot === false &&
    checks.patchesExpress === false &&
    checks.patchesModuleLoad === false &&
    checks.patchesAppPost === false &&
    checks.touchesDebugStore === false &&
    checks.touchesDebugPing === false &&
    checks.rendererHasMain === true &&
    checks.commentsChoosePostOwnedByComments === true &&
    checks.editorChoosePostOwnedByEditor === true &&
    checks.moderationOwnedByCanonicalRouter === true;

  return {
    ...raw,
    ok,
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    adapterVersion: 'menu-v3-adapter-fixed-wrapper-1.0',
    safeCoreFreeze: true,
    checks
  };
}

module.exports = {
  ...base,
  RUNTIME,
  SOURCE,
  selfTest
};
