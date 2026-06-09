'use strict';

const startupLog = require('./services/startupLogService');

const startedAt = new Date().toISOString();
let scheduled = false;

function clean(value) { return String(value || '').trim(); }

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
    pr178PushPairingBinding: buildInfo.pr178PushPairingBinding === true || process.env.ADMINKIT_PR178_PUSH_PAIRING_BINDING === '1',
    pushPairingRuntimeVersion: clean(buildInfo.pushPairingRuntimeVersion || 'CC8.3.52-PR178-PUSH-PAIRING-BINDING'),
    pushPairingSourceMarker: clean(buildInfo.pushPairingSourceMarker || 'adminkit-pr178-push-pairing-binding'),
    pr165RuntimeWired: buildInfo.pr165RuntimeWired === true || process.env.PR165_RUNTIME_WIRED === '1',
    postgresConfigured: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_CONNECTION_STRING || process.env.PGHOST),
    canonicalPublicBaseUrl: clean(process.env.ADMINKIT_PUBLIC_BASE_URL || 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run')
  };
}

function scheduleStartupLog() {
  if (scheduled) return { ok: true, already: true };
  scheduled = true;
  setTimeout(() => {
    startupLog.recordStartup(runtimeInfo()).catch((error) => {
      console.warn('[startup-log] unhandled failure', error && error.message || error);
    });
  }, 1500);
  return { ok: true, scheduled: true };
}

scheduleStartupLog();

module.exports = { ok: true, marker: 'adminkit-pr180-startup-log-bootstrap', scheduleStartupLog, info: startupLog.info };
