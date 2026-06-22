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
  assert.strictEqual(state.finalRuntimeReadinessGate.ok, false);
  assert.strictEqual(state.finalRuntimeReadinessGate.readyForManualMaxTest, false);
  assert(state.finalRuntimeReadinessGate.missing.includes('buttonsWizardPhysicalRouteProbeOk'));
  assert(state.finalRuntimeReadinessGate.missing.includes('urlLinkPreviewProbeOk'));
  assert(state.finalRuntimeReadinessGate.missing.includes('buttonsWizardPhysicalInplaceReady'));

  const final = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(final.liveVersionSummary.pr199Ready, true);
  assert.strictEqual(final.liveVersionSummary.pr202Ready, true);
  assert.strictEqual(final.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(final.liveVersionSummary.plusSignWizardTextSupported, true);
  assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: final, finalRuntimeReadinessGate: state.finalRuntimeReadinessGate }), true);
  assert(state.finalRuntimeReadinessGate.missing.includes('statsCallbackContractLiveOk'));
  assert(state.finalRuntimeReadinessGate.missing.includes('statsCallbackContractOk'));
  assert(state.finalRuntimeReadinessGate.missing.includes('statsMainMenuRoutesToCurrentStatsRoot'));
  assert(state.finalRuntimeReadinessGate.missing.includes('statsLegacyRootNotReturned'));

  const entry = startupLog.sanitizeEntry({
    runtimeVersion: 'final-runtime-test',
    liveVersionSnapshot: final,
    finalRuntimeReadinessGate: state.finalRuntimeReadinessGate
  });
  assert.strictEqual(entry.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(entry.finalRuntimeReadinessGate.ok, false);
  assert.strictEqual(entry.finalRuntimeReadinessGate.readyForManualMaxTest, false);
  assert(entry.finalRuntimeReadinessGate.missing.includes('buttonsWizardPhysicalRouteProbeOk'));
  assert(entry.finalRuntimeReadinessGate.missing.includes('statsCallbackContractLiveOk'));
  assert.strictEqual(entry.finalRuntimeReadinessGate.required.statsCallbackContractWired, true);
  assert.strictEqual(entry.finalRuntimeReadinessGate.required.statsCallbackContractLiveOk, false);
  assert.strictEqual(entry.finalRuntimeReadinessGate.required.pr199Ready, true);
  assert.strictEqual(entry.finalRuntimeReadinessGate.required.pr202Ready, true);
  assert.strictEqual(entry.finalRuntimeReadinessGate.required.buttonsWizardPhysicalInplaceReady, false);

  const derivedEntry = startupLog.sanitizeEntry({
    runtimeVersion: 'final-runtime-derived-test',
    liveVersionSnapshot: final
  });
  assert.strictEqual(derivedEntry.liveVersionSummary.buttonsWizardPhysicalRouteProbeOk, false);
  assert.strictEqual(derivedEntry.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.ok, false);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.readyForManualMaxTest, false);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.githubMainHeadVerifiedByStartupLog, true);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.required.buttonsWizardPhysicalRouteProbeOk, false);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.required.buttonsWizardPhysicalInplaceReady, false);
  assert(derivedEntry.finalRuntimeReadinessGate.missing.includes('buttonsWizardPhysicalRouteProbeOk'));
  assert(derivedEntry.finalRuntimeReadinessGate.missing.includes('statsCallbackContractLiveOk'));
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.required.statsCallbackContractWired, true);
  assert.strictEqual(derivedEntry.finalRuntimeReadinessGate.required.statsCallbackContractLiveOk, false);

  const runtimeInfo = bootstrap.runtimeInfo();
  assert.strictEqual(runtimeInfo.liveVersionSnapshot.liveVersionSummary.buttonsWizardPhysicalRouteProbeOk, false);
  assert.strictEqual(runtimeInfo.liveVersionSnapshot.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(runtimeInfo.finalRuntimeReadinessGate.ok, false);
  assert.strictEqual(runtimeInfo.finalRuntimeReadinessGate.readyForManualMaxTest, false);
  assert(runtimeInfo.finalRuntimeReadinessGate.missing.includes('statsCallbackContractLiveOk'));
  assert.strictEqual(bootstrap.shouldDeferStartupLog(runtimeInfo), true);

  console.log('PR205 final runtime readiness gate regression assertions passed');
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
