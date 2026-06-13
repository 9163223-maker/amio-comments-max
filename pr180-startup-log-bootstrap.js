'use strict';

const startupLog = require('./services/startupLogService');
const runtimeContract = require('./services/runtimeContractService');
const liveVersionSnapshotService = require('./services/liveVersionSnapshotService');

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
    liveVersionSnapshot: liveVersionSnapshotService.buildLiveVersionSnapshot()
  };
}

function recordStartupNow(extra = {}) {
  return startupLog.recordStartup({ ...runtimeInfo(), ...extra });
}
function markPr199InstallComplete() { startupInProgress = false; return { ok: true, startupInProgress }; }
function shouldDeferStartupLog(info) {
  return startupInProgress && info && info.liveVersionSnapshot && info.liveVersionSnapshot.liveVersionSummary && info.liveVersionSnapshot.liveVersionSummary.pr199Ready === false;
}
function writeScheduledStartupLog(attempt = 0) {
  const info = runtimeInfo();
  if (shouldDeferStartupLog(info) && attempt < 6) {
    setTimeout(() => writeScheduledStartupLog(attempt + 1), 500);
    return;
  }
  startupLog.recordStartup(info).catch((error) => {
    console.warn('[startup-log] unhandled failure', error && error.message || error);
  });
}

function scheduleStartupLog() {
  if (scheduled) return { ok: true, already: true };
  scheduled = true;
  setTimeout(() => writeScheduledStartupLog(), 1500);
  return { ok: true, scheduled: true };
}

scheduleStartupLog();

module.exports = { ok: true, marker: 'adminkit-pr180-startup-log-bootstrap', scheduleStartupLog, recordStartupNow, markPr199InstallComplete, shouldDeferStartupLog, info: startupLog.info, runtimeInfo };
