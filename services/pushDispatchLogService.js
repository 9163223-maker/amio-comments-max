'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const buildInfo = require('../buildInfo');
const runtimeExport = require('./runtimeExportService');

const DEFAULT_PATH = 'runtime/push-dispatch-log.json';
const LOCAL_PATH = path.join(__dirname, '..', DEFAULT_PATH);
const LIMIT = 100;
const state = { enabled: false, localPath: DEFAULT_PATH, githubPath: DEFAULT_PATH, lastAttemptAt: '', lastSyncedAt: '', lastOk: false, lastError: '', refusedMainBranchCount: 0, lastRefusedAt: '', warnedMainBranch: false, runtimeBranch: '' };
let queue = Promise.resolve();

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function short(value, limit) { return clean(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').slice(0, limit); }
function safeCount(value) { const n = Number(value || 0); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100000) : 0; }
function hash(value) { return clean(value) ? crypto.createHash('sha256').update(clean(value)).digest('hex').slice(0, 16) : ''; }
function redact(value, limit = 160) {
  return short(value, limit * 3)
    .replace(/https?:\/\/clck\.ru\/\S+/gi, '[link-redacted]')
    .replace(/https?:\/\/[^\s]*\/push\/join\S*/gi, '[push-link-redacted]')
    .replace(/\b(endpoint|auth|p256dh|token|handoff)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/[A-Za-z0-9_=-]{48,}/g, '[long-value-redacted]')
    .slice(0, limit);
}
function safeEvent(input = {}) {
  const allowedEvents = new Set(['message_received', 'dispatch_started', 'dispatch_completed', 'dispatch_skipped', 'restore_user_chats_to_new_device']);
  const allowedTypes = new Set(['text', 'photo', 'file', 'other']);
  const event = allowedEvents.has(clean(input.event)) ? clean(input.event) : 'dispatch_skipped';
  return {
    timestamp: short(input.timestamp || nowIso(), 40),
    event,
    chatIdHash: short(input.chatIdHash || hash(input.chatId), 20),
    chatIdLast4: clean(input.chatId).replace(/[^A-Za-z0-9_-]/g, '').slice(-4),
    chatTitle: redact(input.chatTitle, 120),
    senderNamePreview: redact(input.senderNamePreview || input.senderName, 80),
    messagePreview: redact(input.messagePreview || input.messageText, 160),
    messageType: allowedTypes.has(clean(input.messageType)) ? clean(input.messageType) : 'other',
    candidateEndpoints: safeCount(input.candidateEndpoints),
    selectedEndpoints: safeCount(input.selectedEndpoints),
    selectedEndpointsCount: safeCount(input.selectedEndpointsCount || input.selectedEndpoints),
    activeBindingsCount: safeCount(input.activeBindingsCount),
    currentDeviceIncluded: typeof input.currentDeviceIncluded === 'boolean' ? input.currentDeviceIncluded : 'unknown',
    successCount: safeCount(input.successCount),
    failureCount: safeCount(input.failureCount),
    staleEndpointsRemoved: safeCount(input.staleEndpointsRemoved || input.removedExpiredCount),
    staleEndpointsMarked: safeCount(input.staleEndpointsMarked),
    removedExpiredCount: safeCount(input.removedExpiredCount || input.staleEndpointsRemoved),
    skippedReason: short(input.skippedReason, 80).replace(/[^A-Za-z0-9_.:-]/g, ''),
    notificationTitlePreview: redact(input.notificationTitlePreview, 120),
    notificationBodyPreview: redact(input.notificationBodyPreview, 160),
    runtimeVersion: short(input.runtimeVersion || buildInfo.runtimeVersion || buildInfo.displayVersion || process.env.RUNTIME_VERSION, 100),
    buildVersion: short(input.buildVersion || buildInfo.buildVersion || process.env.BUILD_VERSION, 100),
    route: ['group_message', 'direct_test', 'unknown'].includes(clean(input.route)) ? clean(input.route) : 'unknown'
  };
}
function readLocal() { try { return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); } catch { return {}; } }
function writeLocal(event) {
  const old = readLocal();
  const items = [event, ...(Array.isArray(old.items) ? old.items.map(safeEvent) : [])].slice(0, LIMIT);
  const payload = { ok: true, updatedAt: nowIso(), limit: LIMIT, latest: event, items };
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  const tmp = `${LOCAL_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, LOCAL_PATH);
  return payload;
}
function requestJson({ method = 'GET', apiPath, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = https.request({ hostname: 'api.github.com', method, path: apiPath, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'adminkit-push-dispatch-log', 'X-GitHub-Api-Version': '2022-11-28', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}) } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => { let parsed = {}; try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {} if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed); const e = new Error(`github_http_${res.statusCode}`); e.status = res.statusCode; reject(e); });
    });
    req.on('error', reject); if (payload) req.write(payload); req.end();
  });
}
function resolveSafeRuntimeBranch() {
  const raw = clean(process.env.GITHUB_DEBUG_BRANCH || process.env.RUNTIME_STATUS_BRANCH || 'runtime-status');
  const branch = runtimeExport.resolveRuntimeBranch(raw);
  state.runtimeBranch = branch;
  if (raw.toLowerCase() === runtimeExport.MAIN_BRANCH) {
    state.refusedMainBranchCount += 1;
    state.lastRefusedAt = nowIso();
    state.lastError = 'runtime_export_refuses_main_branch_safe_fallback_runtime-status';
    if (!state.warnedMainBranch) {
      state.warnedMainBranch = true;
      console.warn('[push-dispatch-log] GITHUB_DEBUG_BRANCH=main refused; using runtime-status for runtime diagnostics');
    }
  }
  return branch;
}
async function syncGithub(payload, token) {
  const repo = clean(process.env.GITHUB_DEBUG_REPO || '9163223-maker/amio-comments-max');
  const branch = resolveSafeRuntimeBranch();
  await runtimeExport.exportJson({ repo, branch, path: DEFAULT_PATH, token, payload, message: `push dispatch log ${payload.latest.event}` });
}
function record(input = {}) {
  const event = safeEvent(input);
  state.lastAttemptAt = nowIso();
  let payload;
  try {
    payload = writeLocal(event);
    state.lastOk = true; state.lastError = ''; state.lastSyncedAt = payload.updatedAt;
  } catch (error) {
    state.lastOk = false; state.lastError = short(error && error.message, 120);
    return Promise.resolve({ ok: false, error: state.lastError, event });
  }
  const token = clean(process.env.GITHUB_DEBUG_TOKEN);
  state.enabled = Boolean(token);
  if (token) {
    queue = queue.catch(() => undefined).then(() => syncGithub(payload, token)).catch((error) => {
      state.lastError = short(error && error.message, 120);
      console.warn('[push-dispatch-log] github sync failed', state.lastError);
    });
  }
  return Promise.resolve({ ok: true, event });
}
function summary(limit = 10) { const log = readLocal(); const n = Math.max(1, Math.min(Number(limit) || 10, LIMIT)); return { path: DEFAULT_PATH, count: Array.isArray(log.items) ? log.items.length : 0, latest: Array.isArray(log.items) ? log.items.slice(0, n) : [], persistence: { ...state } }; }
function info() { return { ...state }; }
function resetForTest() { queue = Promise.resolve(); Object.assign(state, { enabled: false, localPath: DEFAULT_PATH, githubPath: DEFAULT_PATH, lastAttemptAt: '', lastSyncedAt: '', lastOk: false, lastError: '', refusedMainBranchCount: 0, lastRefusedAt: '', warnedMainBranch: false, runtimeBranch: '' }); }
module.exports = { record, summary, info, safeEvent, DEFAULT_PATH, LIMIT, resolveSafeRuntimeBranch, resetForTest };
