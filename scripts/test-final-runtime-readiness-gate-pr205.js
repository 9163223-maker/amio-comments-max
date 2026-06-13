'use strict';
const assert = require('assert');

async function main() {
  const liveSnapshot = require('../services/liveVersionSnapshotService');
  const bootstrap = require('../pr180-startup-log-bootstrap');
  const wizard = require('../pr199-buttons-wizard-inplace-save-bootstrap');
  const guard = require('../pr199-buttons-main-menu-route-guard');
  const finalGate = require('../pr205-final-runtime-readiness-gate');

  const early = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(early.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: early }), true);

  wizard.install();
  guard.install();
  const pr199Only = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(pr199Only.liveVersionSummary.pr199Ready, true);
  assert.strictEqual(pr199Only.liveVersionSummary.pr202Ready, false);
  assert.strictEqual(pr199Only.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: pr199Only }), true);

  const state = await finalGate.installAndRecord({ skipRecord: true });
  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.finalRuntimeReadinessGate.ok, true);
  assert.strictEqual(state.finalRuntimeReadinessGate.readyForManualMaxTest, true);

  const final = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(final.liveVersionSummary.pr199Ready, true);
  assert.strictEqual(final.liveVersionSummary.pr202Ready, true);
  assert.strictEqual(final.liveVersionSummary.buttonsWizardPhysicalInplaceReady, true);
  assert.strictEqual(final.liveVersionSummary.plusSignWizardTextSupported, true);
  assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: final }), false);

  console.log('PR205 final runtime readiness gate regression assertions passed');
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
