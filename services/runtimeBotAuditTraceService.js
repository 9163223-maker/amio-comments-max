'use strict';

const https = require('https');
const botAudit = require('../admin-bot-audit-trace');
const startupLogService = require('./startupLogService');

const DEFAULT_REPO = startupLogService.DEFAULT_REPO || '9163223-maker/amio-comments-max';
const DEFAULT_BRANCH = startupLogService.DEFAULT_BRANCH || 'runtime-status';
const DEFAULT_PATH = 'runtime/bot-audit-trace.json';
const DEFAULT_LIMIT = 80;
const USER_AGENT = 'adminkit-bot-audit-trace-pr243';

const state = { enabled: false, lastOk: false, lastError: '', lastAttemptAt: '', lastSyncedAt: '', path: DEFAULT_PATH, branch: DEFAULT_BRANCH };

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
function info() { return { ...state, defaultPath: DEFAULT_PATH, safe: true }; }
module.exports = { buildTracePayload, exportLatestTrace, info, DEFAULT_PATH, DEFAULT_LIMIT };
