'use strict';

const assert = require('assert');
const startupLog = require('../services/startupLogService');
const liveVersionSnapshot = require('../services/liveVersionSnapshotService');
const pr180 = require('../pr180-startup-log-bootstrap');
const pr199Wizard = require('../pr199-buttons-wizard-inplace-save-bootstrap');
const pr199Guard = require('../pr199-buttons-main-menu-route-guard');

assert.strictEqual(typeof liveVersionSnapshot.buildLiveVersionSnapshot, 'function');
assert.strictEqual(typeof liveVersionSnapshot.buildLiveVersionSummary, 'function');

const runtimeInfo = pr180.runtimeInfo();
assert(runtimeInfo.liveVersionSnapshot, 'runtimeInfo includes liveVersionSnapshot');
assert.strictEqual(runtimeInfo.liveVersionSnapshot.runtimeContractEndpoint, '/internal/runtime/contract');
assert(runtimeInfo.liveVersionSnapshot.runtimeContract, 'runtimeInfo snapshot includes runtimeContract summary');
assert.strictEqual(typeof runtimeInfo.liveVersionSnapshot.runtimeContract.contractLiveOk, 'boolean');

const unsafeToken = 'ghp_pr200_secret_token_must_not_leak';
process.env.GITHUB_DEBUG_TOKEN = unsafeToken;
const sanitizedUnsafe = startupLog.sanitizeEntry({
  runtimeVersion: 'x'.repeat(180),
  sourceMarker: 'source',
  entrypoint: 'clean-entrypoint-1.53.10-pr89.js',
  gitCommit: 'abc123',
  runtimeContract: { contractLiveOk: true, startupPath: { ok: true, activeEntrypoint: 'active', entrypointExpected: 'expected' } },
  liveVersionSnapshot: {
    ok: false,
    runtimeVersion: 'x'.repeat(180),
    sourceMarker: 'source',
    entrypoint: 'entry',
    activeEntrypoint: 'active',
    gitCommit: 'abc123',
    secretToken: unsafeToken,
    authorization: `Bearer ${unsafeToken}`,
    runtimeContract: { contractLiveOk: true, startupPath: { ok: true, activeEntrypoint: 'active', entrypointExpected: 'expected' } },
    pr199ButtonsWizard: { ok: true, installOrder: liveVersionSnapshot.PR199_INSTALL_ORDER, buttonsDuplicateSaveGuarded: true, buttonsPendingPreviewConsumedBeforeSave: true, buttonsSaveGuardClearedOnExit: true, callbackFlatMessageIdSupported: true },
    pr199ButtonsMainMenuRouteGuard: { ok: true, mainMenuUsesPublicRoute: true, chatIdWizardSendGuard: true, chatIdWizardEditForwardsBotToken: true, chatIdWizardEditFallsBackToSend: true },
    error: { code: 'boom', message: `failed token=${unsafeToken} Authorization=Bearer ${unsafeToken}` }
  }
});
delete process.env.GITHUB_DEBUG_TOKEN;
const serializedUnsafe = JSON.stringify(sanitizedUnsafe);
assert(!serializedUnsafe.includes(unsafeToken), 'startup-log sanitizer must not persist secret-like values');
assert.strictEqual(sanitizedUnsafe.liveVersionSnapshot.runtimeVersion.length, 120, 'snapshot strings are truncated consistently');
assert.strictEqual(sanitizedUnsafe.liveVersionSnapshot.pr199ButtonsWizard.buttonsDuplicateSaveGuarded, true);
assert.strictEqual(sanitizedUnsafe.liveVersionSnapshot.pr199ButtonsMainMenuRouteGuard.chatIdWizardEditForwardsBotToken, true);

const wizardState = pr199Wizard.install();
const guardState = pr199Guard.install();
assert.strictEqual(wizardState.ok, true, 'PR199 wizard module installs in regression test');
assert.strictEqual(guardState.ok, true, 'PR199 main-menu guard module installs in regression test');
const snapshot = liveVersionSnapshot.buildLiveVersionSnapshot({ githubMainHeadSha: 'mainsha', commitSource: 'github-main-head' });
assert.strictEqual(snapshot.ok, true);
assert.strictEqual(snapshot.pr199ButtonsWizard.ok, true);
assert.strictEqual(snapshot.pr199ButtonsMainMenuRouteGuard.ok, true);
assert.strictEqual(snapshot.pr199ButtonsWizard.installOrder, liveVersionSnapshot.PR199_INSTALL_ORDER);
assert.strictEqual(snapshot.pr199ButtonsWizard.buttonsDuplicateSaveGuarded, true);
assert.strictEqual(snapshot.pr199ButtonsWizard.buttonsPendingPreviewConsumedBeforeSave, true);
assert.strictEqual(snapshot.pr199ButtonsWizard.buttonsSaveGuardClearedOnExit, true);
assert.strictEqual(snapshot.pr199ButtonsWizard.callbackFlatMessageIdSupported, true);
assert.strictEqual(snapshot.pr199ButtonsMainMenuRouteGuard.chatIdWizardSendGuard, true);
assert.strictEqual(snapshot.pr199ButtonsMainMenuRouteGuard.chatIdWizardEditForwardsBotToken, true);
assert.strictEqual(snapshot.pr199ButtonsMainMenuRouteGuard.chatIdWizardEditFallsBackToSend, true);
assert.strictEqual(snapshot.pr199ButtonsMainMenuRouteGuard.mainMenuUsesPublicRoute, true);
assert.strictEqual(liveVersionSnapshot.pr199Ready(snapshot), true);

const latest = startupLog.sanitizeEntry({
  ...runtimeInfo,
  githubMainHeadSha: 'mainsha',
  commitSource: 'github-main-head',
  liveVersionSnapshot: snapshot
});
const runtimeStartupLog = { ok: true, latest, items: [latest] };
assert.strictEqual(runtimeStartupLog.latest.liveVersionSummary.pr199Ready, true, 'latest entry can gate PR199 readiness');
assert.strictEqual(runtimeStartupLog.latest.liveVersionSummary.contractLiveOk, true, 'latest entry exposes runtime contract live-ok');
assert.strictEqual(runtimeStartupLog.latest.liveVersionSnapshot.runtimeContract.startupPath.ok, true, 'latest entry exposes startup path ok');
assert.strictEqual(runtimeStartupLog.latest.liveVersionSnapshot.runtimeContract.startupPath.entrypointExpected, 'clean-entrypoint-1.53.10-pr89.js');
assert(runtimeStartupLog.latest.liveVersionSnapshot.activeEntrypoint, 'latest entry exposes active entrypoint');
assert(runtimeStartupLog.latest.liveVersionSnapshot.githubMainHeadSha || runtimeStartupLog.latest.liveVersionSnapshot.gitCommit, 'latest entry exposes deployed or inferred SHA');
assert(!JSON.stringify(runtimeStartupLog).includes('GITHUB_DEBUG_TOKEN'));

console.log('PR200 startup-log live version snapshot assertions passed');
