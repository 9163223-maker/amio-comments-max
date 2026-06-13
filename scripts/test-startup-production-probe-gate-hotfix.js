'use strict';
const assert = require('assert');

(async () => {
  delete process.env.ADMINKIT_RUN_STARTUP_PRODUCTION_PROBE;
  const probeService = require('../services/buttonsWizardPhysicalRouteProbeService');
  const productionProbe = require('../services/buttonsWizardPhysicalRouteProductionProbe');
  const liveSnapshot = require('../services/liveVersionSnapshotService');
  const finalGate = require('../pr205-final-runtime-readiness-gate');

  const originalRun = productionProbe.runProductionRouteProbe;
  let calls = 0;
  productionProbe.runProductionRouteProbe = async () => { calls += 1; throw new Error('startup probe should be disabled by default'); };
  const skipped = await probeService.runStartupProbe();
  assert.strictEqual(calls, 0, 'default startup path must not call invasive production probe');
  assert.strictEqual(skipped.ok, false);
  assert.strictEqual(skipped.pending, true);
  assert.deepStrictEqual(skipped.diagnostics, ['startup_production_probe_disabled']);

  const snapshot = liveSnapshot.buildLiveVersionSnapshot();
  assert.strictEqual(snapshot.buttonsWizardPhysicalRouteProbe.pending, true);
  assert.strictEqual(snapshot.buttonsWizardPhysicalRouteProbe.ok, false);
  assert(snapshot.buttonsWizardPhysicalRouteProbe.diagnostics.includes('startup_production_probe_disabled'));
  const gate = finalGate.buildGate(snapshot);
  assert.strictEqual(gate.ok, false);
  assert.strictEqual(gate.readyForManualMaxTest, false);
  assert.strictEqual(gate.required.buttonsWizardPhysicalRouteProbeOk, false);

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
