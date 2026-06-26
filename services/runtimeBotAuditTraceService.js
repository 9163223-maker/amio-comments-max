'use strict';

const https = require('https');
const botAudit = require('../admin-bot-audit-trace');
const startupLogService = require('./startupLogService');

const DEFAULT_REPO = startupLogService.DEFAULT_REPO || '9163223-maker/amio-comments-max';
const DEFAULT_BRANCH = startupLogService.DEFAULT_BRANCH || 'runtime-status';
const DEFAULT_PATH = 'runtime/bot-audit-trace.json';
const DEFAULT_LIMIT = 80;
const USER_AGENT = 'adminkit-bot-audit-trace-pr243';

const state = { enabled: false, lastOk: false, lastError: '', lastAttemptAt: '', lastSyncedAt: '', path: DEFAULT_PATH, branch: DEFAULT_BRANCH, timer: null, inFlight: false, pending: false, pendingInput: {}, debounceMs: null, exporter: null };

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function short(value, max = 160) { return clean(value).slice(0, max); }
function b64(value) { return Buffer.from(String(value || ''), 'utf8').toString('base64'); }
function fromB64(value) { return Buffer.from(String(value || ''), 'base64').toString('utf8'); }
function safeError(error) { return short(error && (error.code || error.status || error.message) || 'bot_audit_trace_export_failed', 120).replace(/ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+\S+/gi, '[redacted]'); }
function limit() {
  const n = Number(process.env.ADMINKIT_BOT_AUDIT_RUNTIME_TRACE_LIMIT || DEFAULT_LIMIT);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.floor(n), 50), 80) : DEFAULT_LIMIT;
}
function debounceMs() {
  if (Number.isFinite(state.debounceMs) && state.debounceMs >= 0) return state.debounceMs;
  const n = Number(process.env.ADMINKIT_BOT_AUDIT_EXPORT_DEBOUNCE_MS || 1500);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1000), 3000) : 1500;
}
function buildTracePayload(input = {}) {
  const audit = input.audit || botAudit.info();
  const max = Number(input.limit || limit());
  const events = (Array.isArray(audit.events) ? audit.events : []).slice(0, max).map((event) => botAudit.safePayload(event));
  const summary = Array.isArray(audit.summary) ? audit.summary.slice(0, 120).map((item) => botAudit.safePayload(item)) : [];
  return {
    ok: true,
    updatedAt: nowIso(),
    runtimeVersion: short(process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || audit.runtimeVersion || 'unknown', 120),
    summary,
    events,
    safe: true
  };
}
function requestJson({ method = 'GET', path, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request({ hostname: 'api.github.com', method, path, headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, (res) => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { raw += chunk; }); res.on('end', () => { let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; } if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data); const error = new Error(data && data.message || `github_status_${res.statusCode}`); error.status = res.statusCode; reject(error); });
    });
    req.on('error', reject); req.setTimeout(8000, () => req.destroy(new Error('github_timeout'))); if (payload) req.write(payload); req.end();
  });
}
async function ensureBranch({ repo, branch, token }) { return startupLogService.ensureBranch ? startupLogService.ensureBranch({ repo, branch, token }) : { ok: true }; }
async function readFile({ repo, branch, path, token }) { try { const file = await requestJson({ path: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, token }); return { sha: file.sha, log: JSON.parse(fromB64(file.content || '')) }; } catch (error) { if (error.status === 404) return { sha: '', log: {} }; throw error; } }
async function writeFile({ repo, branch, path, token, sha, log }) { return requestJson({ method: 'PUT', path: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, token, body: { message: `bot audit trace ${log.runtimeVersion || 'runtime'}`, content: b64(`${JSON.stringify(log, null, 2)}\n`), branch, ...(sha ? { sha } : {}) } }); }
async function exportLatestTrace(input = {}) {
  state.lastAttemptAt = nowIso();
  const token = clean(process.env.GITHUB_DEBUG_TOKEN);
  state.enabled = Boolean(token);
  if (!token) { state.lastOk = false; state.lastError = 'GITHUB_DEBUG_TOKEN not configured'; return { ok: false, skipped: true, error: state.lastError }; }
  const repo = DEFAULT_REPO; const branch = DEFAULT_BRANCH; const path = DEFAULT_PATH;
  try { await ensureBranch({ repo, branch, token }); const current = await readFile({ repo, branch, path, token }); const log = buildTracePayload(input); await writeFile({ repo, branch, path, token, sha: current.sha, log }); state.lastOk = true; state.lastError = ''; state.lastSyncedAt = log.updatedAt; return { ok: true, branch, path, latest: log }; } catch (error) { state.lastOk = false; state.lastError = safeError(error); return { ok: false, error: state.lastError }; }
}

async function runScheduledExport() {
  if (state.inFlight) return { ok: true, skipped: true, reason: 'export_in_flight' };
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const input = state.pendingInput || {};
  state.pendingInput = {};
  state.pending = false;
  state.inFlight = true;
  try {
    const exporter = state.exporter || exportLatestTrace;
    const result = await exporter(input);
    if (result && result.ok === false && result.error) state.lastError = safeError(result.error);
    return result;
  } catch (error) {
    state.lastOk = false;
    state.lastError = safeError(error);
    return { ok: false, error: state.lastError };
  } finally {
    state.inFlight = false;
    if (state.pending) scheduleExport(state.pendingInput);
  }
}

function scheduleExport(input = {}) {
  try {
    state.pendingInput = { ...(state.pendingInput || {}), ...(input || {}) };
    state.pending = true;
    if (state.inFlight) return { ok: true, scheduled: true, inFlight: true, debounceMs: debounceMs() };
    if (state.timer) clearTimeout(state.timer);
    const delay = debounceMs();
    state.timer = setTimeout(() => { runScheduledExport().catch(() => {}); }, delay);
    if (state.timer && typeof state.timer.unref === 'function') state.timer.unref();
    return { ok: true, scheduled: true, debounceMs: delay };
  } catch (error) {
    state.lastOk = false;
    state.lastError = safeError(error);
    return { ok: false, error: state.lastError };
  }
}

function _setExportLatestTraceForTests(fn) { state.exporter = typeof fn === 'function' ? fn : null; }
function _setDebounceMsForTests(ms) { state.debounceMs = Number.isFinite(Number(ms)) ? Math.max(0, Math.floor(Number(ms))) : null; }
function _resetSchedulerForTests() {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.inFlight = false;
  state.pending = false;
  state.pendingInput = {};
  state.exporter = null;
  state.debounceMs = null;
  state.lastOk = false;
  state.lastError = '';
}

function info() { const { timer, exporter, pendingInput, ...safeState } = state; return { ...safeState, scheduled: Boolean(timer), defaultPath: DEFAULT_PATH, safe: true }; }
module.exports = { buildTracePayload, exportLatestTrace, scheduleExport, info, DEFAULT_PATH, DEFAULT_BRANCH, DEFAULT_LIMIT, _setExportLatestTraceForTests, _setDebounceMsForTests, _resetSchedulerForTests };
