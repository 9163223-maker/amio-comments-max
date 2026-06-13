'use strict';
const assert = require('assert');

const startupLog = require('../services/startupLogService');
const liveSnapshot = require('../services/liveVersionSnapshotService');
const bootstrap = require('../pr180-startup-log-bootstrap');
const wizard = require('../pr199-buttons-wizard-inplace-save-bootstrap');
const guard = require('../pr199-buttons-main-menu-route-guard');
const debugRoutes = require('../admin-walkthrough-trace-routes');

const early = liveSnapshot.buildLiveVersionSnapshot();
assert.strictEqual(early.liveVersionSummary.pr199Ready, false);
assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: early }), true);

wizard.install();
guard.install();
bootstrap.markPr199InstallComplete();

const final = liveSnapshot.buildLiveVersionSnapshot();
const debugPayload = debugRoutes.liveVersionPayload();
assert.strictEqual(debugPayload.liveVersionSummary.pr199Ready, final.liveVersionSummary.pr199Ready);
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
assert.strictEqual(bootstrap.shouldDeferStartupLog({ liveVersionSnapshot: final }), false);

const log = { latest: null, items: [] };
function publish(input) {
  const entry = startupLog.sanitizeEntry(input);
  log.items = [entry, ...log.items].slice(0, 50);
  log.latest = entry;
}
publish({ runtimeVersion: 'early', liveVersionSnapshot: early });
assert.strictEqual(log.latest.liveVersionSummary.pr199Ready, false);
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
console.log('PR200 startup-log live version snapshot regression assertions passed');
