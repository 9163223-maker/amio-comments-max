'use strict';

const RUNTIME = 'CC6.5.9.2-SAFE-LAUNCH-CORE-STUB';
const SOURCE = 'adminkit-safe-launch-core-stub-prevents-boot-break';

function install() {
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed: true,
    checks: {
      bootSafe: true,
      safeLaunchCoreActive: false,
      note: 'stub_only_replace_with_full_safe_launch_core'
    }
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
