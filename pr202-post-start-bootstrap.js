'use strict';

const RUNTIME = 'PR202-POST-START-BUTTONS-REAL-SHOW-PATH-INPLACE';
let scheduled = false;
let state = { ok: false, runtime: RUNTIME, installed: false, scheduled: false };

function installNow(reason = 'timer') {
  try {
    const patch = require('./pr202-buttons-real-show-path-inplace');
    state = { ...patch.install(), runtime: RUNTIME, scheduled: true, reason };
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

if (process.env.ADMINKIT_PR202_DISABLE_AUTO_INSTALL !== '1') {
  schedule(Number(process.env.ADMINKIT_PR202_INSTALL_DELAY_MS || 2500));
}

module.exports = { RUNTIME, schedule, installNow, info: () => state };
