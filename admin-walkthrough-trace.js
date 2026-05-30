'use strict';

const DEFAULT_LIMIT = 120;

function clean(value) {
  return String(value || '').trim();
}

function runtime() {
  return process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || 'unknown';
}

function limit() {
  const n = Number(process.env.ADMINKIT_WALKTHROUGH_TRACE_LIMIT || DEFAULT_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 300) : DEFAULT_LIMIT;
}

function state() {
  if (!global.__ADMINKIT_WALKTHROUGH_TRACE__) {
    global.__ADMINKIT_WALKTHROUGH_TRACE__ = { seq: 0, events: [] };
  }
  return global.__ADMINKIT_WALKTHROUGH_TRACE__;
}

function mask(value) {
  const s = clean(value);
  if (!s) return '';
  if (s.length <= 6) return '***' + s.slice(-2);
  return s.slice(0, 3) + '…' + s.slice(-4);
}

function safeText(value, max = 180) {
  const raw = clean(value).replace(/\s+/g, ' ');
  return raw.length > max ? raw.slice(0, max) + '…' : raw;
}

function safePayload(payload = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const out = {};
  Object.entries(src).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const k = String(key || '').trim();
    if (!k) return;
    if (/token|secret|authorization|password/i.test(k)) return;
    if (/userId|chatId|messageId|channelId|postId|commentKey|callbackId/i.test(k)) {
      out[k] = mask(value);
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      out[k] = value;
      return;
    }
    if (Array.isArray(value)) {
      out[k] = value.slice(0, 12).map((item) => (typeof item === 'object' ? safePayload(item) : safeText(item, 80)));
      return;
    }
    if (typeof value === 'object') {
      out[k] = safePayload(value);
      return;
    }
    out[k] = safeText(value, 180);
  });
  return out;
}

function log(type, payload = {}) {
  try {
    const st = state();
    const entry = {
      seq: ++st.seq,
      at: new Date().toISOString(),
      runtimeVersion: runtime(),
      type: clean(type) || 'event',
      ...safePayload(payload)
    };
    st.events.push(entry);
    const cap = limit();
    if (st.events.length > cap) st.events.splice(0, st.events.length - cap);
    return entry;
  } catch {
    return null;
  }
}

function list() {
  return state().events.slice().reverse();
}

function clear() {
  const st = state();
  st.seq = 0;
  st.events = [];
  return true;
}

function summary() {
  const result = {};
  state().events.forEach((event) => {
    const key = clean(event.type) || 'event';
    if (!result[key]) result[key] = { type: key, count: 0, lastSeq: 0, lastAt: '' };
    result[key].count += 1;
    result[key].lastSeq = event.seq;
    result[key].lastAt = event.at;
  });
  return Object.values(result).sort((a, b) => b.lastSeq - a.lastSeq);
}

function info() {
  return {
    ok: true,
    runtimeVersion: runtime(),
    mode: 'admin-walkthrough-trace',
    limit: limit(),
    total: state().events.length,
    summary: summary(),
    events: list(),
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}

module.exports = { log, list, clear, info, summary, mask, safePayload, limit };
