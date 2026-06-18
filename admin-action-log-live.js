'use strict';
const crypto = require('crypto');
const { getBuildInfo } = require('./buildInfo');
const LIMIT = 300;
const events = [];
let seq = 0;
function hash(value = '') { const s = String(value || ''); return s ? crypto.createHash('sha256').update(s).digest('hex').slice(0, 16) : ''; }
function clean(value = '') { return String(value || '').replace(/[\r\n\t]+/g, ' ').slice(0, 240); }
function payloadPreview(payload = {}) { const out = {}; Object.keys(payload || {}).filter((k) => !/token|authorization|secret|cookie/i.test(k)).sort().slice(0, 12).forEach((k) => { out[k] = clean(payload[k]); }); return out; }
function add(event = {}) { const info = getBuildInfo(); const item = { id: ++seq, traceId: event.traceId || `admin-action-${Date.now().toString(36)}-${seq}`, generatedAt: new Date().toISOString(), runtimeVersion: info.runtimeVersion, sourceMarker: info.sourceMarker, userIdHash: hash(event.userId), action: clean(event.action), canonicalKey: sanitizeCanonicalKey(event.canonicalKey), callbackPayloadKeys: Object.keys(event.payload || {}).filter((k) => !/token|authorization|secret|cookie/i.test(k)).sort(), callbackPayloadPreview: payloadPreview(event.payload), resolved: sanitizeResolved(event.resolved), commit: sanitizeCommit(event.commit), patch: sanitizePatch(event.patch), contractViolation: clean(event.contractViolation), screenId: clean(event.screenId), note: clean(event.note), outbound: event.outbound || null };
  events.push(item); while (events.length > LIMIT) events.shift(); return item; }
function sanitizeResolved(r = {}) { return { ok: !!r.ok, channelIdHash: hash(r.channelId), channelTitle: clean(r.channelTitle), postId: clean(r.postId), commentKeyHash: hash(r.commentKey), postTitle: clean(r.postTitle), buttonCount: Number(r.buttonCount ?? (Array.isArray(r.buttons) ? r.buttons.length : 0)) || 0, buttonSource: clean(r.buttonSource), imported: !!r.imported, diagnostics: Array.isArray(r.diagnostics) ? r.diagnostics.slice(-8) : [] }; }
function sanitizeCanonicalKey(k = {}) { return k ? { tenantKeyHash: hash(k.tenantKey), ownerUserIdHash: hash(k.ownerUserId || k.userId), userIdHash: hash(k.userId), channelIdHash: hash(k.channelId), postId: clean(k.postId), commentKeyHash: hash(k.commentKey) } : null; }
function sanitizeCommit(c = {}) { return { attempted: !!c.attempted, ok: !!c.ok, operation: clean(c.operation), buttonCountBefore: Number(c.buttonCountBefore || 0), buttonCountExpected: Number(c.buttonCountExpected || 0), buttonCountAfter: Number(c.buttonCountAfter || 0), writeOk: !!c.writeOk, readBackOk: !!c.readBackOk, keyMatchOk: !!c.keyMatchOk, contentMatchOk: !!c.contentMatchOk, contractViolation: clean(c.contractViolation) }; }
function sanitizePatch(p = {}) { return { attempted: !!p.attempted, ok: !!p.ok, error: clean(p.error || p.reason || p.error?.message || '') }; }
function list() { return events.slice(-LIMIT); }
function clear() { events.length = 0; seq = 0; }
function install(app) { app.get('/debug/admin-action-log-live', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.set('Pragma', 'no-cache'); res.set('Expires', '0'); res.json({ ok: true, limit: LIMIT, total: events.length, events: list(), ...getBuildInfo() }); }); }
module.exports = { add, list, clear, install, hash };
