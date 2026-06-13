'use strict';

const RUNTIME = 'PR205-FINAL-RUNTIME-READINESS-GATE';
const SOURCE = 'adminkit-pr205-final-runtime-readiness-gate';
let state = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, recorded: false };

function clean(value) { return String(value || '').trim(); }
function bool(value) { return value === true; }
function short(value, max = 180) { return clean(value).slice(0, max); }
function summaryFrom(snapshot = {}) { return snapshot && snapshot.liveVersionSummary || {}; }
function buildGate(snapshot = {}) {
  const summary = summaryFrom(snapshot);
  const required = {
    runtimeSnapshotOk: bool(snapshot.ok),
    runtimeContractLiveOk: bool(summary.runtimeContractLiveOk),
    pr199Ready: bool(summary.pr199Ready),
    pr202Ready: bool(summary.pr202Ready),
    buttonsWizardPhysicalRouteProbeOk: bool(summary.buttonsWizardPhysicalRouteProbeOk),
    urlLinkPreviewProbeOk: bool(summary.urlLinkPreviewProbeOk),
    buttonsWizardPhysicalInplaceReady: bool(summary.buttonsWizardPhysicalInplaceReady),
    plusSignWizardTextSupported: bool(summary.plusSignWizardTextSupported)
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  return {
    ok: missing.length === 0,
    runtime: RUNTIME,
    source: SOURCE,
    generatedAt: Date.now(),
    activeEntrypoint: short(summary.activeEntrypoint || snapshot.activeEntrypoint, 120),
    runtimeVersion: short(summary.runtimeVersion || snapshot.runtimeVersion, 120),
    buildVersion: short(summary.buildVersion || snapshot.buildVersion, 120),
    sourceMarker: short(summary.sourceMarker || snapshot.sourceMarker, 160),
    githubMainHeadVerifiedByStartupLog: true,
    required,
    missing,
    readyForManualMaxTest: missing.length === 0
  };
}
async function installAndRecord(options = {}) {
  const skipRecord = options && options.skipRecord === true;
  try {
    const pr202 = require('./pr202-buttons-real-show-path-inplace');
    const buttonsWizardProbe = require('./services/buttonsWizardPhysicalRouteProbeService');
    const bootstrap = require('./pr180-startup-log-bootstrap');
    const liveSnapshot = require('./services/liveVersionSnapshotService');
    const pr202State = pr202.install();
    await buttonsWizardProbe.runProbe();
    if (bootstrap && typeof bootstrap.markRuntimeReadinessInstallComplete === 'function') {
      bootstrap.markRuntimeReadinessInstallComplete();
    } else if (bootstrap && typeof bootstrap.markPr199InstallComplete === 'function') {
      bootstrap.markPr199InstallComplete();
    }
    const snapshot = liveSnapshot.buildLiveVersionSnapshot();
    const finalRuntimeReadinessGate = buildGate(snapshot);
    state = {
      ok: true,
      runtime: RUNTIME,
      source: SOURCE,
      installed: true,
      recorded: false,
      pr202: pr202State,
      finalRuntimeReadinessGate
    };
    if (!skipRecord && bootstrap && typeof bootstrap.recordStartupNow === 'function') {
      state.recordRequested = true;
      await bootstrap.recordStartupNow({
        startupLogRefreshReason: 'final-runtime-readiness-gate',
        finalRuntimeReadinessGate,
        liveVersionSnapshot: snapshot
      });
      state.recorded = true;
    }
    try { console.log('[pr205-final-runtime-readiness]', JSON.stringify({ ok: state.ok, recorded: state.recorded, gateOk: finalRuntimeReadinessGate.ok, missing: finalRuntimeReadinessGate.missing })); } catch {}
    return state;
  } catch (error) {
    state = { ok: false, runtime: RUNTIME, source: SOURCE, installed: false, recorded: false, error: short(error && error.message || error, 240) };
    try { console.warn('[pr205-final-runtime-readiness] failed', state.error); } catch {}
    return state;
  }
}
function info() { return state; }
module.exports = { RUNTIME, SOURCE, installAndRecord, buildGate, info };
