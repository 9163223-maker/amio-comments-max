'use strict';
const assert = require('assert');

async function main() {
  const startupLog = require('../services/startupLogService');
  const liveSnapshot = require('../services/liveVersionSnapshotService');
  const bootstrap = require('../pr180-startup-log-bootstrap');
  const postStart = require('../pr202-post-start-bootstrap');
  const wizard = require('../pr199-buttons-wizard-inplace-save-bootstrap');
  const guard = require('../pr199-buttons-main-menu-route-guard');
  const finalGate = require('../pr205-final-runtime-readiness-gate');

  assert.strictEqual(postStart.info().scheduled, false);
  const early = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(postStart.info().scheduled, false);
  assert.strictEqual(early.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: early }), true);

  wizard.install();
  guard.install();
  const pr199Only = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(postStart.info().scheduled, false);
  assert.strictEqual(pr199Only.liveVersionSummary.pr199Ready, true);
  assert.strictEqual(pr199Only.liveVersionSummary.pr202Ready, false);
  assert.strictEqual(pr199Only.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: pr199Only }), true);

  const state = await finalGate.installAndRecord({ skipRecord: true });
  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.finalRuntimeReadinessGate.ok, true);
  assert.strictEqual(state.finalRuntimeReadinessGate.readyForManualMaxTest, true);
  assert.deepStrictEqual(state.finalRuntimeReadinessGate.missing, []);

  const final = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(final.liveVersionSummary.pr199Ready, true);
  assert.strictEqual(final.liveVersionSummary.pr202Ready, true);
  assert.strictEqual(final.liveVersionSummary.buttonsWizardPhysicalInplaceReady, true);
  assert.strictEqual(final.liveVersionSummary.plusSignWizardTextSupported, true);
  assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: final }), false);

  const entry = startupLog.sanitizeEntry({
    runtimeVersion: 'final-runtime-test',
    liveVersionSnapshot: final,
    finalRuntimeReadinessGate: state.finalRuntimeReadinessGate
  });
  assert.strictEqual(entry.liveVersionSummary.buttonsWizardPhysicalInplaceReady, true);
  assert.strictEqual(entry.finalRuntimeReadinessGate.ok, true);
  assert.strictEqual(entry.finalRuntimeReadinessGate.readyForManualMaxTest, true);
  assert.deepStrictEqual(entry.finalRuntimeReadinessGate.missing, []);
  assert.strictEqual(entry.finalRuntimeReadinessGate.required.pr199Ready, true);
  assert.strictEqual(entry.finalRuntimeReadinessGate.required.pr202Ready, true);
  assert.strictEqual(entry.finalRuntimeReadinessGate.required.buttonsWizardPhysicalInplaceReady, true);

  const derivedEntry = startupLog.sanitizeEntry({
    runtimeVersion: 'final-runtime-derived-test',
    liveVersionSnapshot: final
  });
  assert.strictEqual(derivedEntry.liveVersionSummary.buttonsWizardPhysicalRouteProbeOk, true);
  assert.strictEqual(derivedEntry.liveVersionSummary.buttonsWizardPhysicalInplaceReady, true);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.ok, true);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.readyForManualMaxTest, true);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.githubMainHeadVerifiedByStartupLog, true);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.required.buttonsWizardPhysicalRouteProbeOk, true);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.required.buttonsWizardPhysicalInplaceReady, true);
  assert.deepStrictEqual(derivedEntry.finalRuntimeReadinessGate.missing, []);

  const runtimeInfo = bootstrap.runtimeInfo();
  assert.strictEqual(runtimeInfo.liveVersionSnapshot.liveVersionSummary.buttonsWizardPhysicalRouteProbeOk, true);
  assert.strictEqual(runtimeInfo.liveVersionSnapshot.liveVersionSummary.buttonsWizardPhysicalInplaceReady, true);
  assert.strictEqual(runtimeInfo.finalRuntimeReadinessGate.ok, true);
  assert.strictEqual(runtimeInfo.finalRuntimeReadinessGate.readyForManualMaxTest, true);
  assert.strictEqual(bootstrap.shouldDeferStartupLog(runtimeInfo), false);

  console.log('PR205 final runtime readiness gate regression assertions passed');
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
