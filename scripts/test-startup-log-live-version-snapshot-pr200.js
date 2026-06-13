'use strict';
const assert = require('assert');

const startupLog = require('../services/startupLogService');
const liveSnapshot = require('../services/liveVersionSnapshotService');
const bootstrap = require('../pr180-startup-log-bootstrap');
const wizard = require('../pr199-buttons-wizard-inplace-save-bootstrap');
const guard = require('../pr199-buttons-main-menu-route-guard');
const realShow = require('../pr202-buttons-real-show-path-inplace');
const postStart = require('../pr202-post-start-bootstrap');
const debugRoutes = require('../admin-walkthrough-trace-routes');
const buttonsWizardProbe = require('../services/buttonsWizardPhysicalRouteProbeService');

(async () => {
const early = liveSnapshot.buildLiveVersionSnapshot();
assert.strictEqual(early.liveVersionSummary.pr199Ready, false);
assert.strictEqual(early.liveVersionSummary.pr202Ready, false);
assert.strictEqual(early.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: early }), true);

wizard.install();
guard.install();
bootstrap.markPr199InstallComplete();
realShow.install();
postStart.installNow('test-pr202-runtime-gates');
const pending = liveSnapshot.buildLiveVersionSnapshot();
assert.strictEqual(pending.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false, 'post-start sync path cannot mark physical route ready');
assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: pending }), true);
const probe = await buttonsWizardProbe.runProbe();
assert.strictEqual(probe.ok, true, 'real production route probe succeeds before readiness is green');
assert.strictEqual(probe.source, 'adminkit-buttons-wizard-production-webhook-route-probe');

const final = liveSnapshot.buildLiveVersionSnapshot();
const debugPayload = debugRoutes.liveVersionPayload();
assert.strictEqual(debugPayload.liveVersionSummary.pr199Ready, final.liveVersionSummary.pr199Ready);
assert.strictEqual(debugPayload.liveVersionSummary.pr202Ready, final.liveVersionSummary.pr202Ready);
assert.strictEqual(debugPayload.liveVersionSummary.buttonsWizardPhysicalInplaceReady, final.liveVersionSummary.buttonsWizardPhysicalInplaceReady);
assert.strictEqual(debugPayload.runtimeVersion, final.runtimeVersion);
assert.strictEqual(debugPayload.buildVersion, final.buildVersion);
assert.strictEqual(debugPayload.sourceMarker, final.sourceMarker);
assert.strictEqual(debugPayload.gitCommit, final.gitCommit);
assert.strictEqual(debugPayload.activeEntrypoint, final.activeEntrypoint);
assert.strictEqual(debugPayload.debugVersionSource, final.debugVersionSource);
assert.strictEqual(debugPayload.runtimeContract.contractLiveOk, final.runtimeContract.contractLiveOk);
assert.strictEqual(debugPayload.pr199ButtonsWizard.buttonsDuplicateSaveGuarded, final.pr199ButtonsWizard.buttonsDuplicateSaveGuarded);
assert.strictEqual(debugPayload.pr199ButtonsMainMenuRouteGuard.chatIdWizardEditForwardsBotToken, final.pr199ButtonsMainMenuRouteGuard.chatIdWizardEditForwardsBotToken);
assert.strictEqual(final.pr199ButtonsWizard.ok, true);
assert.strictEqual(final.pr199ButtonsMainMenuRouteGuard.ok, true);
assert.strictEqual(final.pr199ButtonsMainMenuRouteGuard.chatIdWizardEditForwardsBotToken, true);
assert.strictEqual(final.pr199ButtonsMainMenuRouteGuard.chatIdWizardEditFallsBackToSend, true);
assert.strictEqual(final.pr199ButtonsWizard.buttonsDuplicateSaveGuarded, true);
assert.strictEqual(final.pr199ButtonsWizard.buttonsPendingPreviewConsumedBeforeSave, true);
assert.strictEqual(final.pr199ButtonsWizard.installOrder, 'after-persistent-store-bootstrap');
assert.strictEqual(final.liveVersionSummary.pr199Ready, true);
assert.strictEqual(final.pr202ButtonsRealShowPath.ok, true);
assert.strictEqual(final.pr202ButtonsRealShowPath.installed, true);
assert.strictEqual(final.pr202ButtonsRealShowPath.buttonsWizardRealShowPathInplace, true);
assert.strictEqual(final.pr202ButtonsRealShowPath.buttonsWizardTraceCoversShowPath, true);
assert.strictEqual(final.pr202ButtonsRealShowPath.plusSignWizardTextSupported, true);
assert.strictEqual(final.pr202ButtonsRealShowPath.patchesMaxSendMessageAfterPr199, true);
assert.strictEqual(final.liveVersionSummary.pr202Ready, true);
assert.strictEqual(final.liveVersionSummary.buttonsWizardPhysicalInplaceReady, true);
assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: final }), false);

const log = { latest: null, items: [] };
function publish(input) {
  const entry = startupLog.sanitizeEntry(input);
  log.items = [entry, ...log.items].slice(0, 50);
  log.latest = entry;
}
publish({ runtimeVersion: 'early', liveVersionSnapshot: early });
assert.strictEqual(log.latest.liveVersionSummary.pr199Ready, false);
assert.strictEqual(log.latest.liveVersionSummary.pr202Ready, false);
publish({ runtimeVersion: 'final', liveVersionSnapshot: final });
assert.strictEqual(log.latest.runtimeVersion, 'final');
assert.strictEqual(log.latest.liveVersionSnapshot.runtimeVersion, final.runtimeVersion);
assert.strictEqual(log.latest.liveVersionSnapshot.buildVersion, final.buildVersion);
assert.strictEqual(log.latest.liveVersionSnapshot.sourceMarker, final.sourceMarker);
assert.strictEqual(log.latest.liveVersionSnapshot.gitCommit, final.gitCommit);
assert.strictEqual(log.latest.liveVersionSnapshot.activeEntrypoint, final.activeEntrypoint);
assert.strictEqual(log.latest.liveVersionSnapshot.debugVersionSource, final.debugVersionSource);
assert.strictEqual(log.latest.liveVersionSnapshot.runtimeContract.contractLiveOk, final.runtimeContract.contractLiveOk);
assert.strictEqual(log.latest.liveVersionSummary.pr199Ready, true);
assert.strictEqual(log.latest.liveVersionSummary.pr202Ready, true);
assert.strictEqual(log.latest.liveVersionSummary.buttonsWizardPhysicalInplaceReady, true);
assert.strictEqual(log.latest.liveVersionSnapshot.pr202ButtonsRealShowPath.plusSignWizardTextSupported, true);
console.log('PR200/PR204 startup-log live version snapshot regression assertions passed');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
