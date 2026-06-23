#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { analyzeStartupLog } = require('./check-post-merge-live-readiness-pr234');

function baseLog() {
  return {
    ok: true,
    latest: {
      startedAt: '2026-06-23T10:10:00.000Z',
      bootId: 'boot-1',
      githubMainHeadSha: 'abc123',
      runtimeVersion: 'CC8.3.68-PR229-STATS-SCOPE-BUTTONS-CLEANUP',
      sourceMarker: 'adminkit-pr229-stats-scope-buttons-cleanup',
      entrypoint: 'clean-entrypoint-1.53.10-pr89.js',
      runtimeContract: { contractLiveOk: true, startupPath: { ok: true }, dataProviders: { ok: true } },
      liveVersionSummary: { staleEndpointDetected: false, callbackContractLastErrors: ['route failed'] },
      finalRuntimeReadinessGate: { ok: false, readyForManualMaxTest: false, missing: ['statsCallbackContractLiveOk'] }
    },
    items: []
  };
}

const progress = analyzeStartupLog(baseLog(), {
  expectedSha: 'abc123',
  minStartedAt: '2026-06-23T10:00:00.000Z',
  expectedRuntime: 'CC8.3.68-PR229-STATS-SCOPE-BUTTONS-CLEANUP',
  requireFinalGate: '0'
});
assert.strictEqual(progress.ok, true, 'PR234-001: deploy health can pass while final gate reports progress');
assert.deepStrictEqual(progress.finalGate.missing, ['statsCallbackContractLiveOk'], 'PR234-002: final gate missing must be surfaced');
assert.deepStrictEqual(progress.callbackContract.lastErrors, ['route failed'], 'PR234-003: callback errors must be surfaced');

const strict = analyzeStartupLog(baseLog(), { expectedSha: 'abc123', minStartedAt: '2026-06-23T10:00:00.000Z', expectedRuntime: 'CC8.3.68-PR229-STATS-SCOPE-BUTTONS-CLEANUP', requireFinalGate: '1' });
assert.strictEqual(strict.ok, false, 'PR234-004: strict final gate mode must fail when product readiness is red');
assert.ok(strict.missing.includes('finalGateOk'), 'PR234-005: strict mode must list finalGateOk');

const stale = analyzeStartupLog(baseLog(), { expectedSha: 'def456', minStartedAt: '2026-06-23T10:00:00.000Z', expectedRuntime: 'CC8.3.68-PR229-STATS-SCOPE-BUTTONS-CLEANUP', requireFinalGate: '0' });
assert.strictEqual(stale.ok, false, 'PR234-006: wrong deployed SHA must fail');
assert.ok(stale.missing.includes('deployedShaMatches'), 'PR234-007: stale deploy must list deployedShaMatches');

console.log('PR234 post-merge live readiness checker assertions passed');
