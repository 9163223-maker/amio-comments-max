'use strict';

const RUNTIME = 'CC6.5.6.2-COMMENTS-LAUNCH-ROLLBACK';
const SOURCE = 'adminkit-CC6.5.6.2-rollback-external-link-confirmation';

function install() {
  // Rollback: do not rewrite comments button to direct https /app link.
  // In MAX this becomes an external-link confirmation dialog, which is wrong UX.
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    disabled: true,
    reason: 'direct_https_app_link_caused_MAX_external_link_confirmation',
    expectedNextFix: 'use native MAX miniapp/deeplink mode, not ordinary external link'
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
