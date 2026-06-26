'use strict';

const liveIdentity = require('./services/liveIdentityService');

const DEFAULT_LIMIT = 800;
const RUNTIME_EXPORT_TYPES = new Set([
  'callback_received_pre_dedupe',
  'duplicate_callback_skipped',
  'gifts_root_callback_received',
  'gifts_root_callback_resolved',
  'gifts_root_callback_delivery_target_missing',
  'gifts_root_callback_private_fallback_sent',
  'root_section_callback_received',
  'root_section_callback_resolved',
  'root_section_callback_failed',
  'v3_route_callback_received',
  'v3_route_callback_resolved',
  'v3_route_callback_failed',
  'unsupported_callback'
]);

function clean(value) { return String(value || '').trim(); }
function runtime() { return process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || 'unknown'; }
function limit() {
  const n = Number(process.env.ADMINKIT_BOT_AUDIT_TRACE_LIMIT || DEFAULT_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 2000) : DEFAULT_LIMIT;
}
function state() {
  if (!global.__ADMINKIT_BOT_AUDIT_TRACE__) global.__ADMINKIT_BOT_AUDIT_TRACE__ = { seq: 0, events: [] };
  return global.__ADMINKIT_BOT_AUDIT_TRACE__;
}
function mask(value) {
  const s = clean(value);
  if (!s) return '';
  if (s.length <= 6) return '***' + s.slice(-2);
  return s.slice(0, 3) + '…' + s.slice(-4);
}
function safeText(value, max = 240) {
  const raw = clean(value).replace(/\s+/g, ' ');
  return raw.length > max ? raw.slice(0, max) + '…' : raw;
}
function isSensitiveKey(key = '') { return /token|secret|authorization|password|cookie|session/i.test(String(key || '')); }
function safePayload(payload = {}, depth = 0) {
  if (payload === null || payload === undefined) return payload;
  if (depth > 4) return '[depth-limit]';
  if (typeof payload === 'number' || typeof payload === 'boolean') return payload;
  if (typeof payload === 'string') return safeText(payload, 240);
  if (Array.isArray(payload)) return payload.slice(0, 20).map((item) => safePayload(item, depth + 1));
  if (typeof payload !== 'object') return safeText(payload, 120);
  const out = {};
  Object.entries(payload).forEach(([key, value]) => {
    const k = clean(key);
    if (!k || value === undefined) return;
    if (isSensitiveKey(k)) return;
    if (/userId|user_id|chatId|chat_id|messageId|message_id|channelId|channel_id|postId|post_id|commentKey|callbackId|callback_id|mid|id$/i.test(k) && typeof value !== 'boolean') {
      out[k] = mask(value);
      return;
    }
    out[k] = safePayload(value, depth + 1);
  });
  return out;
}
function maybeExportRuntimeTrace(type) {
  if (!RUNTIME_EXPORT_TYPES.has(clean(type))) return;
  try {
    const svc = require('./services/runtimeBotAuditTraceService');
    if (svc && svc.scheduleExport) svc.scheduleExport({ reason: 'bot_audit_event', eventType: clean(type) });
  } catch {}
}
function log(type, payload = {}) {
  try {
    const st = state();
    const eventType = clean(type) || 'event';
    const entry = { seq: ++st.seq, at: new Date().toISOString(), runtimeVersion: runtime(), type: eventType, ...safePayload(payload), liveIdentity: liveIdentity.fingerprint() };
    st.events.push(entry);
    const cap = limit();
    if (st.events.length > cap) st.events.splice(0, st.events.length - cap);
    maybeExportRuntimeTrace(eventType);
    return entry;
  } catch { return null; }
}
function list() { return state().events.slice().reverse(); }
function clear() { const st = state(); st.seq = 0; st.events = []; return true; }
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
function info() { return { ok: true, runtimeVersion: runtime(), mode: 'admin-bot-audit-trace', limit: limit(), total: state().events.length, summary: summary(), events: list(), safe: true, noDatabaseRead: true, noMaxApiCall: true }; }

module.exports = { log, list, clear, info, summary, mask, safePayload, safeText, limit };
