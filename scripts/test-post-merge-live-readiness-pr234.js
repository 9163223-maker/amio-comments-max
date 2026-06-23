#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { analyzeStartupLog, packageMetadata } = require('./check-post-merge-live-readiness-pr234');

const metadata = packageMetadata();

function baseLog(overrides = {}) {
  return {
    ok: true,
    latest: {
      startedAt: '2026-06-23T10:10:00.000Z',
      bootId: 'boot-1',
      githubMainHeadSha: 'abc123',
      runtimeVersion: overrides.runtimeVersion || metadata.runtimeVersion,
      sourceMarker: overrides.sourceMarker || metadata.sourceMarker,
      entrypoint: overrides.entrypoint || metadata.entrypoint,
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
  requireFinalGate: '0'
});
assert.strictEqual(progress.ok, true, 'PR234-001: deploy health can pass while final gate reports progress');
assert.strictEqual(progress.expectedSourceMarker, metadata.sourceMarker, 'PR234-002: source marker expectation must come from package metadata by default');
assert.strictEqual(progress.expectedEntrypoint, metadata.entrypoint, 'PR234-003: entrypoint expectation must come from package metadata by default');
assert.deepStrictEqual(progress.finalGate.missing, ['statsCallbackContractLiveOk'], 'PR234-004: final gate missing must be surfaced');
assert.deepStrictEqual(progress.callbackContract.lastErrors, ['route failed'], 'PR234-005: callback errors must be surfaced');

const future = analyzeStartupLog(baseLog({ sourceMarker: 'adminkit-future-source', entrypoint: 'future-entrypoint.js' }), {
  expectedSha: 'abc123',
  minStartedAt: '2026-06-23T10:00:00.000Z',
  expectedSourceMarker: 'adminkit-future-source',
  expectedEntrypoint: 'future-entrypoint.js',
  requireFinalGate: '0'
});
assert.strictEqual(future.ok, true, 'PR234-006: valid future sourceMarker/entrypoint overrides must not fail the checker');
assert.strictEqual(future.checks.sourceMarkerOk, true, 'PR234-007: future source marker override must pass');
assert.strictEqual(future.checks.entrypointOk, true, 'PR234-008: future entrypoint override must pass');

const strict = analyzeStartupLog(baseLog(), { expectedSha: 'abc123', minStartedAt: '2026-06-23T10:00:00.000Z', requireFinalGate: '1' });
assert.strictEqual(strict.ok, false, 'PR234-009: strict final gate mode must fail when product readiness is red');
assert.ok(strict.missing.includes('finalGateOk'), 'PR234-010: strict mode must list finalGateOk');

const stale = analyzeStartupLog(baseLog(), { expectedSha: 'def456', minStartedAt: '2026-06-23T10:00:00.000Z', requireFinalGate: '0' });
assert.strictEqual(stale.ok, false, 'PR234-011: wrong deployed SHA must fail');
assert.ok(stale.missing.includes('deployedShaMatches'), 'PR234-012: stale deploy must list deployedShaMatches');

console.log('PR234 post-merge live readiness checker assertions passed');
