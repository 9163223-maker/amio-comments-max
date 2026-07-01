'use strict';

const startupLog = require('./services/startupLogService');
const runtimeContract = require('./services/runtimeContractService');
const liveVersionSnapshotService = require('./services/liveVersionSnapshotService');
const processEvents = require('./services/processEventsService');
const northflankStartupLog = require('./services/northflankStartupLogService');
const channelTargetMatrix = require('./services/channelTargetMatrixService');
const fullSectionMatrix = require('./services/fullSectionMatrixService');
const userJourneyMatrix = require('./services/userJourneyMatrixService');
const productSemanticMatrix = require('./services/productSemanticMatrixService');
const tenantChannelBinding = require('./services/tenantChannelBindingService');
const maximalFlowMatrix = require('./services/maximalFlowMatrixService');
const runtimeExport = require('./services/runtimeExportService');

const startedAt = new Date().toISOString();
let scheduled = false;
let startupInProgress = true;

function clean(value) { return String(value || '').trim(); }
function safeContract() {
  try { return runtimeContract.buildContract(); }
  catch (error) {
    return {
      runtime: runtimeContract.RUNTIME || 'RUNTIME-CONTRACT-PR196',
      sourceMarker: runtimeContract.SOURCE || 'adminkit-runtime-contract-pr196',
      safe: true,
      contractLiveOk: false,
      mismatches: ['runtime_contract_build_failed'],
      error: clean(error && error.message || error).slice(0, 160)
    };
  }
}
function runtimeInfo() {
  let buildInfo = {};
  try { buildInfo = require('./buildInfo').getBuildInfo(); } catch {}
  const liveVersionSnapshot = liveVersionSnapshotService.buildLiveVersionSnapshot();
  return {
    startedAt,
    runtimeVersion: clean(buildInfo.runtimeVersion || process.env.RUNTIME_VERSION || process.env.BUILD_VERSION),
    buildVersion: clean(buildInfo.buildVersion || process.env.BUILD_VERSION || process.env.RUNTIME_VERSION),
    displayVersion: clean(buildInfo.displayVersion || process.env.BUILD_VERSION || process.env.RUNTIME_VERSION),
    sourceMarker: clean(buildInfo.sourceMarker || process.env.BUILD_SOURCE_MARKER),
    entrypoint: clean(buildInfo.activeEntrypoint || 'clean-entrypoint-1.53.10-pr89.js'),
    gitCommit: clean(buildInfo.gitCommit || process.env.GIT_COMMIT || process.env.COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION),
    pr188PushMultiChatHandoff: buildInfo.pr188PushMultiChatHandoff === true,
    pr191PushAdminInviteTitleCommands: buildInfo.pr191PushAdminInviteTitleCommands === true || process.env.ADMINKIT_PR191_PUSH_ADMIN_INVITE_TITLE_COMMANDS === '1',
    pr178PushPairingBinding: buildInfo.pr178PushPairingBinding === true || process.env.ADMINKIT_PR178_PUSH_PAIRING_BINDING === '1',
    pushPairingRuntimeVersion: clean(buildInfo.pushPairingRuntimeVersion || 'CC8.3.54-PR188-PUSH-MULTI-CHAT-HANDOFF'),
    pushRuntimeSourceMarker: clean(buildInfo.pushRuntimeSourceMarker || buildInfo.sourceMarker || process.env.BUILD_SOURCE_MARKER),
    pushPairingBaseSourceMarker: clean(buildInfo.pushPairingBaseSourceMarker || 'adminkit-pr188-push-multi-chat-handoff'),
    pushPairingSourceMarker: clean(buildInfo.pushPairingSourceMarker || buildInfo.sourceMarker || process.env.BUILD_SOURCE_MARKER),
    pr165RuntimeWired: buildInfo.pr165RuntimeWired === true || process.env.PR165_RUNTIME_WIRED === '1',
    postgresConfigured: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_CONNECTION_STRING || process.env.PGHOST),
    canonicalPublicBaseUrl: clean(process.env.ADMINKIT_PUBLIC_BASE_URL || 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run'),
    runtimeContract: safeContract(),
    liveVersionSnapshot,
    finalRuntimeReadinessGate: finalRuntimeReadinessGate(liveVersionSnapshot)
  };
}
function recordStartupNow(extra = {}) {
  const payload = { ...runtimeInfo(), ...extra };
  if (!payload.finalRuntimeReadinessGate) {
    payload.finalRuntimeReadinessGate = finalRuntimeReadinessGate(payload.liveVersionSnapshot);
  }
  return startupLog.recordStartup(payload);
}
function finalRuntimeReadinessGate(snapshot = {}) {
  try {
    const gate = require('./pr205-final-runtime-readiness-gate');
    const current = gate && typeof gate.info === 'function' ? gate.info() : {};
    if (current && current.finalRuntimeReadinessGate) return current.finalRuntimeReadinessGate;
    if (gate && typeof gate.buildGate === 'function') return gate.buildGate(snapshot);
  } catch {}
  if (startupLog && typeof startupLog.buildFinalRuntimeReadinessGateFromSnapshot === 'function') {
    return startupLog.buildFinalRuntimeReadinessGateFromSnapshot(snapshot);
  }
  return null;
}
function markRuntimeReadinessInstallComplete() { startupInProgress = false; return { ok: true, startupInProgress }; }
function markPr199InstallComplete() { return markRuntimeReadinessInstallComplete(); }
function isFinalDisabledProductionProbeStartup(info = {}) {
  const snapshot = info && info.liveVersionSnapshot || {};
  const summary = snapshot.liveVersionSummary || {};
  const probe = snapshot.buttonsWizardPhysicalRouteProbe || {};
  const diagnostics = Array.isArray(probe.diagnostics) ? probe.diagnostics : [];
  const gate = info && info.finalRuntimeReadinessGate || finalRuntimeReadinessGate(snapshot);
  const missing = gate && Array.isArray(gate.missing) ? gate.missing : [];
  const expectedMissing = ['buttonsWizardPhysicalRouteProbeOk', 'urlLinkPreviewProbeOk', 'buttonsWizardPhysicalInplaceReady', 'buttonsSaveRealCallbackOk', 'buttonsSaveIdempotentOk', 'buttonsCurrentReadsCanonicalDbOk', 'buttonsGlobalNavFirstTapOk', 'buttonsNoStaleForCurrentPreviewOk'];
  const onlyExpectedMissing = missing.length > 0 && missing.every((item) => expectedMissing.includes(item));
  return snapshot.ok === true
    && summary.pr199Ready === true
    && summary.pr202Ready === true
    && summary.plusSignWizardTextSupported === true
    && probe.pending === true
    && probe.ok !== true
    && diagnostics.includes('startup_production_probe_disabled')
    && gate
    && gate.ok !== true
    && gate.readyForManualMaxTest !== true
    && onlyExpectedMissing;
}
function shouldDeferStartupLog(info) {
  if (isFinalDisabledProductionProbeStartup(info)) return false;
  const summary = info && info.liveVersionSnapshot && info.liveVersionSnapshot.liveVersionSummary || {};
  const gate = info && info.finalRuntimeReadinessGate || finalRuntimeReadinessGate(info && info.liveVersionSnapshot);
  return summary.buttonsWizardPhysicalInplaceReady !== true || !gate || gate.ok !== true || gate.readyForManualMaxTest !== true;
}
function writeScheduledStartupLog(attempt = 0) {
  const info = runtimeInfo();
  if (shouldDeferStartupLog(info) && attempt < 60) {
    const retry = setTimeout(() => writeScheduledStartupLog(attempt + 1), 500);
    if (retry && typeof retry.unref === 'function') retry.unref();
    return;
  }
  if (shouldDeferStartupLog(info)) {
    startupLog.recordStartup({ ...info, startupLogRefreshReason: 'deferred-startup-timeout-before-final-runtime-readiness' }).catch((error) => {
      console.warn('[startup-log] unhandled failure', error && error.message || error);
    });
    return;
  }
  startupLog.recordStartup(info).catch((error) => {
    console.warn('[startup-log] unhandled failure', error && error.message || error);
  });
}
function scheduleStartupLog() {
  if (scheduled) return { ok: true, already: true };
  scheduled = true;
  const timer = setTimeout(() => writeScheduledStartupLog(), 1500);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return { ok: true, scheduled: true };
}
processEvents.install();
const expectedDiagnosticFiles = [fullSectionMatrix.DEFAULT_PATH, channelTargetMatrix.DEFAULT_PATH, userJourneyMatrix.DEFAULT_PATH, productSemanticMatrix.DEFAULT_PATH, tenantChannelBinding.DEFAULT_PATH, maximalFlowMatrix.DEFAULT_PATH, processEvents.DEFAULT_PATH, northflankStartupLog.DEFAULT_PATH];
northflankStartupLog.exportLog().catch((error) => { console.warn('[northflank-startup-log] export skipped', error && error.message || error); });
channelTargetMatrix.exportMatrix().catch((error) => { console.warn('[channel-target-matrix] export skipped', error && error.message || error); });
fullSectionMatrix.exportMatrix().catch((error) => { console.warn('[full-section-matrix] export skipped', error && error.message || error); });
userJourneyMatrix.exportMatrix().catch((error) => { console.warn('[user-journey-matrix] export skipped', error && error.message || error); });
productSemanticMatrix.exportMatrix().catch((error) => { console.warn('[product-semantic-matrix] export skipped', error && error.message || error); });
tenantChannelBinding.exportMatrix().catch((error) => { console.warn('[tenant-channel-binding-matrix] export skipped', error && error.message || error); });
maximalFlowMatrix.exportMatrix().catch((error) => { console.warn('[maximal-flow-matrix] export skipped', error && error.message || error); });
const diagnosticStatusTimer = setTimeout(() => {
  runtimeExport.exportStatus({ expectedFiles: expectedDiagnosticFiles }).catch((error) => { console.warn('[diagnostic-export-status] export skipped', error && error.message || error); });
}, 2500);
if (diagnosticStatusTimer && typeof diagnosticStatusTimer.unref === 'function') diagnosticStatusTimer.unref();
scheduleStartupLog();
module.exports = { ok: true, marker: 'adminkit-pr180-startup-log-bootstrap', scheduleStartupLog, recordStartupNow, markRuntimeReadinessInstallComplete, markPr199InstallComplete, shouldDeferStartupLog, isFinalDisabledProductionProbeStartup, finalRuntimeReadinessGate, info: startupLog.info, runtimeInfo };