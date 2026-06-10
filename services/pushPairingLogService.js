'use strict';

const crypto = require('crypto');
const https = require('https');

const DEFAULT_REPO = '9163223-maker/amio-comments-max';
const DEFAULT_BRANCH = 'runtime-status';
const DEFAULT_PATH = 'runtime/push-pairing-log.json';
const DEFAULT_LIMIT = 100;
const USER_AGENT = 'adminkit-push-pairing-log-pr188';
const ALLOWED_ROUTES = new Set(['/push', '/push/join', '/api/push/pair', '/api/push/device/status', '/api/push/link-chat', '/api/push/pending']);
const ALLOWED_TOKEN_SOURCES = new Set(['query', 'cookie', 'body', 'manifest-start-url', 'handoff', 'pending_handoff', 'missing']);
const ALLOWED_OPENED_AS = new Set(['safari', 'standalone-pwa', 'unknown']);
const ALLOWED_RESULTS = new Set(['link_opened', 'pwa_opened', 'handoff_created', 'handoff_found', 'handoff_missing', 'handoff_expired', 'handoff_consumed', 'pair_started', 'pair_success', 'pair_failed', 'status_success', 'binding_created', 'binding_updated', 'binding_missing', 'pending_found', 'pending_missing']);

const state = {
  enabled: Boolean(String(process.env.GITHUB_DEBUG_TOKEN || '').trim()),
  lastOk: null,
  lastError: '',
  lastAttemptAt: '',
  lastSyncedAt: '',
  branch: DEFAULT_BRANCH,
  path: DEFAULT_PATH,
  limit: DEFAULT_LIMIT
};
let writeQueue = Promise.resolve();

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function short(value, limit = 120) { return clean(value).slice(0, limit); }
function hash(value) { return clean(value) ? crypto.createHash('sha256').update(clean(value)).digest('hex').slice(0, 20) : ''; }
function safeError(error) {
  const raw = clean(error && (error.code || error.message || error)) || 'push_pairing_log_failed';
  return raw.replace(/https?:\/\/\S+/gi, '[url]').replace(/[A-Za-z0-9._~-]{24,}/g, '[redacted]').slice(0, 160);
}
function allowed(value, values, fallback) { return values.has(clean(value)) ? clean(value) : fallback; }

function sanitizeEvent(input = {}) {
  const event = {
    timestamp: short(input.timestamp || nowIso(), 40),
    event: short(input.event, 80),
    flowId: short(input.flowId || hash(input.pairingToken || input.token), 20),
    handoffIdHash: short(input.handoffIdHash || hash(input.handoffId), 20),
    userId: short(input.userId || input.maxUserId, 80).replace(/[^A-Za-z0-9_.:@-]/g, ''),
    maxUserIdHash: short(input.maxUserIdHash || hash(input.maxUserId || input.userId), 20),
    chatId: short(input.chatId, 80).replace(/[^A-Za-z0-9_.:@-]/g, ''),
    chatIdHash: short(input.chatIdHash || hash(input.chatId), 20),
    chatTitle: short(input.chatTitle, 120).replace(/[\u0000-\u001f\u007f]/g, ' '),
    deviceIdHash: short(input.deviceIdHash || hash(input.deviceId), 20),
    endpointHash: short(input.endpointHash, 24).replace(/[^a-fA-F0-9]/g, ''),
    tokenFound: input.tokenFound === true || input.hasPairingToken === true || Boolean(clean(input.pairingToken || input.token)),
    subscriptionCreated: input.subscriptionCreated === true,
    linkedToChat: input.linkedToChat === true,
    handoffPending: input.handoffPending === true,
    consumed: input.consumed === true,
    hasPairingToken: input.hasPairingToken === true || Boolean(clean(input.pairingToken || input.token)),
    hasHandoff: input.hasHandoff === true || Boolean(clean(input.handoffId)),
    source: allowed(input.source || input.tokenSource, ALLOWED_TOKEN_SOURCES, 'missing'),
    tokenSource: allowed(input.tokenSource || input.source, ALLOWED_TOKEN_SOURCES, 'missing'),
    hasPairingCookie: input.hasPairingCookie === true,
    hasHandoffCookie: input.hasHandoffCookie === true,
    openedAs: allowed(input.openedAs, ALLOWED_OPENED_AS, 'unknown'),
    route: allowed(input.route, ALLOWED_ROUTES, '/push'),
    result: allowed(input.result, ALLOWED_RESULTS, 'pair_failed'),
    pendingCount: Math.max(0, Math.min(Number.parseInt(input.pendingCount, 10) || 0, 10000)),
    selectedPendingChatId: short(input.selectedPendingChatId, 80).replace(/[^A-Za-z0-9_.:@-]/g, ''),
    selectedPendingChatTitle: short(input.selectedPendingChatTitle, 120).replace(/[\u0000-\u001f\u007f]/g, ' '),
    chatsCount: Math.max(0, Math.min(Number.parseInt(input.chatsCount, 10) || 0, 10000)),
    rawBindingsCount: Math.max(0, Math.min(Number.parseInt(input.rawBindingsCount, 10) || 0, 10000)),
    uniqueChatsCount: Math.max(0, Math.min(Number.parseInt(input.uniqueChatsCount, 10) || 0, 10000)),
    missingTitleCount: Math.max(0, Math.min(Number.parseInt(input.missingTitleCount, 10) || 0, 10000)),
    error: /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(short(input.errorCode || input.error, 80)) ? short(input.errorCode || input.error, 80) : (clean(input.errorCode || input.error) ? 'sanitized_error' : '')
  };
  return Object.fromEntries(Object.entries(event).filter(([, value]) => value !== ''));
}

function requestJson({ method = 'GET', path, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: 'api.github.com', method, path,
      headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT, 'X-GitHub-Api-Version': '2022-11-28',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {})
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = {};
        try { parsed = text ? JSON.parse(text) : {}; } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed);
        const error = new Error(`github_http_${res.statusCode}`);
        error.status = res.statusCode;
        reject(error);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function contentPath(repo, filePath, branch) {
  return `/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`;
}
async function readLog({ repo, branch, path, token }) {
  try {
    const file = await requestJson({ path: contentPath(repo, path, branch), token });
    const parsed = JSON.parse(Buffer.from(clean(file.content), 'base64').toString('utf8'));
    return { sha: clean(file.sha), log: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch (error) {
    if (error.status === 404) return { sha: '', log: {} };
    throw error;
  }
}
async function writeEvent(event, token) {
  const current = await readLog({ repo: DEFAULT_REPO, branch: DEFAULT_BRANCH, path: DEFAULT_PATH, token });
  const oldItems = Array.isArray(current.log.items) ? current.log.items.map(sanitizeEvent) : [];
  const items = [event, ...oldItems].slice(0, DEFAULT_LIMIT);
  const log = { ok: true, updatedAt: nowIso(), limit: DEFAULT_LIMIT, latest: event, items };
  await requestJson({
    method: 'PUT', path: `/repos/${DEFAULT_REPO}/contents/${encodeURIComponent(DEFAULT_PATH).replace(/%2F/g, '/')}`,
    token,
    body: {
      message: `push pairing log ${event.event || event.result}`,
      content: Buffer.from(`${JSON.stringify(log, null, 2)}\n`).toString('base64'),
      branch: DEFAULT_BRANCH,
      ...(current.sha ? { sha: current.sha } : {})
    }
  });
  state.lastOk = true;
  state.lastError = '';
  state.lastSyncedAt = log.updatedAt;
  return { ok: true, event };
}

function record(input = {}) {
  const event = sanitizeEvent(input);
  state.lastAttemptAt = nowIso();
  const token = clean(process.env.GITHUB_DEBUG_TOKEN);
  state.enabled = Boolean(token);
  if (!token) {
    state.lastOk = false;
    state.lastError = 'GITHUB_DEBUG_TOKEN not configured';
    return Promise.resolve({ ok: false, skipped: true, error: state.lastError, event });
  }
  writeQueue = writeQueue.catch(() => undefined).then(() => writeEvent(event, token)).catch((error) => {
    state.lastOk = false;
    state.lastError = safeError(error);
    console.warn('[push-pairing-log] failed', state.lastError);
    return { ok: false, error: state.lastError, event };
  });
  return writeQueue;
}
function info() { return { ...state }; }

module.exports = { record, info, sanitizeEvent, hash, DEFAULT_REPO, DEFAULT_BRANCH, DEFAULT_PATH, DEFAULT_LIMIT };
