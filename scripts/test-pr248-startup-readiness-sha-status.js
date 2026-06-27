'use strict';

const assert = require('assert');
const startupLog = require('../services/startupLogService');

const trueSummary = {
  runtimeContractLiveOk: true,
  pr199Ready: true,
  pr202Ready: true,
  buttonsWizardPhysicalRouteProbeOk: true,
  buttonsWizardPhysicalInplaceReady: true,
  plusSignWizardTextSupported: true,
  buttonsSaveRealCallbackOk: true,
  buttonsSaveIdempotentOk: true,
  buttonsCurrentReadsCanonicalDbOk: true,
  buttonsGlobalNavFirstTapOk: true,
  buttonsNoStaleForCurrentPreviewOk: true,
  statsCallbackContractWired: true,
  statsCallbackContractLiveOk: true,
  statsCallbackContractOk: true,
  statsMainMenuRoutesToCurrentStatsRoot: true,
  statsLegacyRootNotReturned: true
};

function gate(gitCommit, githubMainHeadSha = 'abc123') {
  return startupLog.buildFinalRuntimeReadinessGateFromSnapshot({
    ok: true,
    gitCommit,
    githubMainHeadSha,
    liveVersionSummary: { ...trueSummary, gitCommit }
  });
}

const unavailable = gate('', 'abc123');
assert.strictEqual(unavailable.actualApplicationShaStatus, 'unavailable_missing_runtime_git_commit');
assert.strictEqual(unavailable.actualApplicationMainShaVerified, false);
assert.strictEqual(unavailable.ok, true);
assert.strictEqual(unavailable.readyForManualMaxTest, true);
assert(!unavailable.missing.includes('actualApplicationMainShaVerified'));

const match = gate('abc123', 'abc123');
assert.strictEqual(match.actualApplicationShaStatus, 'verified_match');
assert.strictEqual(match.actualApplicationMainShaVerified, true);
assert.strictEqual(match.ok, true);

const mismatch = gate('def456', 'abc123');
assert.strictEqual(mismatch.actualApplicationShaStatus, 'verified_mismatch');
assert.strictEqual(mismatch.actualApplicationMainShaVerified, false);
assert.strictEqual(mismatch.ok, false);
assert.strictEqual(mismatch.readyForManualMaxTest, false);
assert(mismatch.missing.includes('actualApplicationMainShaVerified'));

const entry = startupLog.sanitizeEntry({ liveVersionSnapshot: { ok: true, liveVersionSummary: trueSummary, gitCommit: '' }, githubMainHeadSha: 'abc123' });
assert.strictEqual(entry.finalRuntimeReadinessGate.actualApplicationShaStatus, 'unavailable_missing_runtime_git_commit');
assert.strictEqual(entry.finalRuntimeReadinessGate.ok, true);

console.log('PR248 startup readiness SHA status assertions passed');
