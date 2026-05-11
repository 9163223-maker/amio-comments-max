'use strict';

const RUNTIME = 'CC6.5.6.1-V3-NATIVE-HINTS-SAFE-MODE';
const SOURCE = 'adminkit-CC6.5.6.1-safe-mode-no-dom-app-patch';

function patchPublicAppRead() {
  // Safe mode: do not mutate public/app.js. The previous DOM cleanup could hide or break
  // the mini-app shell in MAX. Native callback toasts are handled by v3-silent-menu-callbacks.
  return false;
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    patchesPublicAppRead: false,
    safeMode: true,
    reason: 'client_dom_cleanup_disabled_to_restore_comments_miniapp',
    policy: {
      nativeHintsOnlyInline: true,
      disablesOverlayHints: false,
      disablesLegacyGrowthCta: false,
      photoOnlyAttachmentPolicy: false,
      nativeMaxCallbackToastsHandledBy: 'v3-silent-menu-callbacks',
      commentsLaunchHandledBy: 'v3-comments-launch-fix',
      doesNotPatchWebhook: true,
      doesNotPatchMainRouter: true,
      doesNotPatchPublicAppJs: true
    }
  };
}

function install() {
  patchPublicAppRead();
  return selfTest();
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
