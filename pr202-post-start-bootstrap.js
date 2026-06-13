'use strict';

const RUNTIME = 'PR202-POST-START-BUTTONS-REAL-SHOW-PATH-INPLACE';
let scheduled = false;
let state = { ok: false, runtime: RUNTIME, installed: false, scheduled: false };

function refreshStartupLog(reason = 'post-pr202-install') {
  try {
    const bootstrap = require('./pr180-startup-log-bootstrap');
    if (bootstrap && typeof bootstrap.recordStartupNow === 'function') {
      state = { ...state, startupLogRefreshRequested: true, startupLogRefreshReason: reason };
      bootstrap.recordStartupNow({ startupLogRefreshReason: reason }).catch(() => undefined);
      return true;
    }
  } catch {}
  return false;
}

function installNow(reason = 'timer') {
  try {
    const patch = require('./pr202-buttons-real-show-path-inplace');
    try { require('./services/buttonsWizardPhysicalRouteProbeService').runProbeSync(); } catch {}
    state = { ...patch.install(), runtime: RUNTIME, scheduled: true, reason };
    refreshStartupLog('post-pr202-install');
  } catch (error) {
    state = { ok: false, runtime: RUNTIME, installed: false, scheduled: true, reason, error: String(error && error.message || error).slice(0, 180) };
  }
  try { console.log('[pr202-post-start]', JSON.stringify(state)); } catch {}
  return state;
}

function schedule(delayMs = 2500) {
  if (scheduled) return state;
  scheduled = true;
  state = { ok: true, runtime: RUNTIME, installed: false, scheduled: true, delayMs };
  const timer = setTimeout(() => installNow('post-start-delay'), Number(delayMs || 2500));
  if (timer && typeof timer.unref === 'function') timer.unref();
  return state;
}

if (process.env.ADMINKIT_PR202_ENABLE_AUTO_INSTALL === '1') {
  schedule(Number(process.env.ADMINKIT_PR202_INSTALL_DELAY_MS || 2500));
}

module.exports = { RUNTIME, schedule, installNow, refreshStartupLog, info: () => state };
