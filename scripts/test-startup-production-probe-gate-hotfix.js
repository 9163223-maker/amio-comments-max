'use strict';
const assert = require('assert');

(async () => {
  delete process.env.ADMINKIT_RUN_STARTUP_PRODUCTION_PROBE;
  const probeService = require('../services/buttonsWizardPhysicalRouteProbeService');
  const productionProbe = require('../services/buttonsWizardPhysicalRouteProductionProbe');
  const liveSnapshot = require('../services/liveVersionSnapshotService');
  const startupLog = require('../services/startupLogService');
  const bootstrap = require('../pr180-startup-log-bootstrap');
  const wizard = require('../pr199-buttons-wizard-inplace-save-bootstrap');
  const guard = require('../pr199-buttons-main-menu-route-guard');
  const realShow = require('../pr202-buttons-real-show-path-inplace');
  const finalGate = require('../pr205-final-runtime-readiness-gate');

  const originalRun = productionProbe.runProductionRouteProbe;
  let calls = 0;
  productionProbe.runProductionRouteProbe = async () => { calls += 1; throw new Error('startup probe should be disabled by default'); };
  const skipped = await probeService.runStartupProbe();
  assert.strictEqual(calls, 0, 'default startup path must not call invasive production probe');
  assert.strictEqual(skipped.ok, false);
  assert.strictEqual(skipped.pending, true);
  assert.deepStrictEqual(skipped.diagnostics, ['startup_production_probe_disabled']);

  wizard.install();
  guard.install();
  realShow.install();
  const snapshot = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(snapshot.buttonsWizardPhysicalRouteProbe.pending, true);
  assert.strictEqual(snapshot.buttonsWizardPhysicalRouteProbe.ok, false);
  assert(snapshot.buttonsWizardPhysicalRouteProbe.diagnostics.includes('startup_production_probe_disabled'));
  const gate = finalGate.buildGate(snapshot);
  assert.strictEqual(gate.ok, false);
  assert.strictEqual(gate.readyForManualMaxTest, false);
  assert.strictEqual(gate.required.buttonsWizardPhysicalRouteProbeOk, false);
  assert(gate.missing.includes('buttonsWizardPhysicalRouteProbeOk'));
  assert(gate.missing.includes('urlLinkPreviewProbeOk'));
  assert(gate.missing.includes('buttonsWizardPhysicalInplaceReady'));
  const runtimeInfo = { liveVersionSnapshot: snapshot, finalRuntimeReadinessGate: gate };
  assert.strictEqual(bootstrap.shouldDeferStartupLog(runtimeInfo), false, 'final disabled-probe startup must be recorded, not deferred');
  const entry = startupLog.sanitizeEntry({ runtimeVersion: 'hotfix-disabled-probe', githubMainHeadSha: 'merge-pr-210-sha', ...runtimeInfo });
  assert.strictEqual(entry.githubMainHeadSha, 'merge-pr-210-sha');
  assert.strictEqual(entry.liveVersionSnapshot.buttonsWizardPhysicalRouteProbe.pending, true);
  assert.strictEqual(entry.liveVersionSnapshot.buttonsWizardPhysicalRouteProbe.ok, false);
  assert(entry.liveVersionSnapshot.buttonsWizardPhysicalRouteProbe.diagnostics.includes('startup_production_probe_disabled'));
  assert.strictEqual(entry.liveVersionSummary.buttonsWizardPhysicalRouteProbeOk, false);
  assert.strictEqual(entry.liveVersionSummary.buttonsWizardPhysicalInplaceReady, false);
  assert.strictEqual(entry.finalRuntimeReadinessGate.ok, false);
  assert.strictEqual(entry.finalRuntimeReadinessGate.readyForManualMaxTest, false);

  process.env.ADMINKIT_RUN_STARTUP_PRODUCTION_PROBE = '1';
  productionProbe.runProductionRouteProbe = async () => { calls += 1; return { ok: true, source: 'explicit-test-probe', urlLinkPreviewProbeOk: true, diagnostics: [] }; };
  const explicit = await probeService.runStartupProbe();
  assert.strictEqual(calls, 1, 'explicit flag enables production probe');
  assert.strictEqual(explicit.ok, true);
  assert.strictEqual(explicit.source, 'explicit-test-probe');

  productionProbe.runProductionRouteProbe = originalRun;
  delete process.env.ADMINKIT_RUN_STARTUP_PRODUCTION_PROBE;
  console.log('startup production probe gate hotfix assertions passed');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
