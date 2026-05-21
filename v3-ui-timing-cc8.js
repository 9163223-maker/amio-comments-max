'use strict';

const DEFAULT_LIMIT = 50;
const SLOW_MS = 900;

function limit() {
  const n = Number(process.env.ADMINKIT_UI_TIMING_LIMIT || DEFAULT_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 200) : DEFAULT_LIMIT;
}

function nowMs() { return Date.now(); }
function runtime() { return process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || 'unknown'; }
function clean(v) { return String(v || '').trim(); }

function state() {
  if (!global.__ADMINKIT_UI_TIMING_CC8__) global.__ADMINKIT_UI_TIMING_CC8__ = { seq: 0, events: [] };
  return global.__ADMINKIT_UI_TIMING_CC8__;
}

function mask(v) {
  const s = clean(v);
  if (!s) return '';
  if (s.length <= 6) return '***' + s.slice(-2);
  return s.slice(0, 3) + '…' + s.slice(-4);
}

function log(name, data = {}) {
  try {
    const st = state();
    const durationMs = Number(data.durationMs || 0);
    const entry = {
      seq: ++st.seq,
      at: new Date().toISOString(),
      runtimeVersion: runtime(),
      name: clean(name || 'timing'),
      durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      slow: Number.isFinite(durationMs) ? durationMs >= SLOW_MS : false,
      ...(data || {})
    };
    st.events.push(entry);
    const cap = limit();
    if (st.events.length > cap) st.events.splice(0, st.events.length - cap);
    return entry;
  } catch { return null; }
}

async function measure(name, data, fn) {
  const startedAt = nowMs();
  try {
    const result = await fn();
    log(name, { ...(data || {}), ok: true, durationMs: nowMs() - startedAt });
    return result;
  } catch (error) {
    log(name, { ...(data || {}), ok: false, error: String(error?.message || error), status: error?.status, durationMs: nowMs() - startedAt });
    throw error;
  }
}

function list() { return state().events.slice().reverse(); }
function clear() { const st = state(); st.seq = 0; st.events = []; return true; }

function summary() {
  const events = state().events.slice();
  const byName = {};
  for (const e of events) {
    const key = e.name || 'timing';
    if (!byName[key]) byName[key] = { name: key, count: 0, slowCount: 0, totalMs: 0, maxMs: 0, lastMs: 0, actions: {} };
    const row = byName[key];
    const ms = Number(e.durationMs || 0);
    row.count += 1;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
    row.lastMs = ms;
    if (e.slow) row.slowCount += 1;
    if (e.action) row.actions[e.action] = (row.actions[e.action] || 0) + 1;
  }
  return Object.values(byName).map((row) => ({
    ...row,
    avgMs: row.count ? Math.round(row.totalMs / row.count) : 0
  })).sort((a, b) => b.maxMs - a.maxMs);
}

function info() {
  return {
    ok: true,
    runtimeVersion: runtime(),
    mode: 'ui-timing-ring-buffer',
    limit: limit(),
    total: state().events.length,
    slowThresholdMs: SLOW_MS,
    summary: summary(),
    events: list(),
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}

module.exports = { log, measure, list, clear, info, mask, limit, SLOW_MS };
