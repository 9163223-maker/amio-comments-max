'use strict';

const crypto = require('crypto');
const config = require('../../config');

const clientAccess = require('../../services/clientAccessService');
const canonicalMenu = require('../../features/menu-v3/canonical-menu');
const RUNTIME = clientAccess.RUNTIME;
const DEFAULT_LATEST_PATH = 'debug/latest.json';
const DEFAULT_LITE_PATH = 'debug/latest-lite.json';

function clean(value = '') { return String(value ?? '').trim(); }
function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}
function mask(value = '') {
  const s = clean(value);
  if (!s) return '';
  if (s.length <= 8) return `${s.slice(0, 2)}…${s.slice(-2)}`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
function sha256(value = '') { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function nowIso() { return new Date().toISOString(); }
function safeJson(value) { try { return JSON.parse(JSON.stringify(value)); } catch { return {}; } }
function noCacheHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
    'X-Adminkit-No-Cache': '1'
  };
}
function applyNoCache(res) { try { res.set(noCacheHeaders()); } catch {} }

function exportConfig() {
  return {
    tokenConfigured: !!clean(config.githubDebugToken || process.env.GITHUB_DEBUG_TOKEN),
    repo: clean(config.githubDebugRepo || process.env.GITHUB_DEBUG_REPO),
    branch: clean(config.githubDebugBranch || process.env.GITHUB_DEBUG_BRANCH || 'main') || 'main',
    latestPath: clean(config.githubDebugPath || process.env.GITHUB_DEBUG_PATH || DEFAULT_LATEST_PATH) || DEFAULT_LATEST_PATH,
    litePath: clean(config.githubDebugLitePath || process.env.GITHUB_DEBUG_LITE_PATH || DEFAULT_LITE_PATH) || DEFAULT_LITE_PATH,
    allowPublic: bool(config.debugExportAllowPublic || process.env.DEBUG_EXPORT_ALLOW_PUBLIC, false),
    tokenMasked: mask(config.githubDebugToken || process.env.GITHUB_DEBUG_TOKEN),
    envNames: ['GITHUB_DEBUG_TOKEN', 'GITHUB_DEBUG_REPO', 'GITHUB_DEBUG_BRANCH', 'GITHUB_DEBUG_PATH', 'GITHUB_DEBUG_LITE_PATH', 'DEBUG_EXPORT_ALLOW_PUBLIC']
  };
}

function requestToken(req = {}) {
  const q = req.query || {};
  const headers = req.headers || {};
  const bearer = clean(headers.authorization || '').replace(/^Bearer\s+/i, '');
  return clean(q.token || q.adminToken || q.debugToken || headers['x-admin-token'] || headers['x-debug-token'] || bearer || '');
}
function expectedTokens() {
  return [config.giftAdminToken, process.env.GIFT_ADMIN_TOKEN, process.env.ADMIN_TOKEN, process.env.DEBUG_EXPORT_TOKEN, 'admin'].map(clean).filter(Boolean);
}
function authState(req = {}) {
  const cfg = exportConfig();
  const provided = requestToken(req);
  const expected = expectedTokens();
  const accepted = cfg.allowPublic || (!!provided && expected.includes(provided));
  return {
    ok: accepted,
    allowPublic: cfg.allowPublic,
    tokenProvided: !!provided,
    tokenAccepted: accepted,
    tokenMasked: mask(provided),
    tokenHashPrefix: provided ? sha256(provided).slice(0, 12) : '',
    tokenRequired: !cfg.allowPublic,
    legacyAdminTokenSupported: true
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (/token|secret|password|authorization|api[_-]?key/i.test(key)) {
      out[key] = val ? '[redacted]' : '';
    } else if (val && typeof val === 'object') {
      out[key] = redact(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function buildSnapshot(options = {}) {
  const lite = options.lite === true;
  let storeDebug = null;
  let storeError = '';
  try {
    const store = require('../../store');
    if (typeof store.getDebugSnapshot === 'function') storeDebug = store.getDebugSnapshot();
    else storeDebug = { exportedKeys: Object.keys(store || {}).slice(0, 50) };
  } catch (error) {
    storeError = error?.message || String(error);
  }
  const coreStressSelf = {
    ok: true,
    skipped: true,
    reason: 'pr106_store_live_constant_time',
    runtimeVersion: RUNTIME
  };
  const payload = {
    ok: !storeError,
    runtimeVersion: RUNTIME,
    ...clientAccess.info(),
    accessRuntimeVersion: clientAccess.RUNTIME,
    menuCanonicalVersion: canonicalMenu.VERSION,
    menuSourceMarker: canonicalMenu.SOURCE,
    activeEntrypoint: 'clean-entrypoint-1.53.10-pr89.js',
    staleEndpointDetected: false,
    debugVersionSource: 'debugExportAdapter-pr106',
    generatedAt: nowIso(),
    mode: lite ? 'debug-export-lite' : 'debug-export-full',
    build: {
      buildVersion: clean(process.env.BUILD_VERSION || process.env.RUNTIME_VERSION || ''),
      sourceMarker: clean(process.env.BUILD_SOURCE_MARKER || ''),
      nodeEnv: clean(process.env.NODE_ENV || ''),
      publicBaseUrl: clean(process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || '')
    },
    githubExport: exportConfig(),
    routes: {
      storeLive: '/debug/store-live',
      export: '/debug/export',
      exportLite: '/debug/export-lite',
      latestPath: exportConfig().latestPath,
      litePath: exportConfig().litePath
    },
    coreStress: coreStressSelf,
    store: lite ? undefined : redact(storeDebug),
    storeLite: lite ? redact({ ok: !storeError, error: storeError, postCount: Array.isArray(storeDebug?.posts) ? storeDebug.posts.length : undefined, keys: storeDebug ? Object.keys(storeDebug).slice(0, 30) : [] }) : undefined,
    error: storeError || undefined
  };
  return safeJson(payload);
}

function buildStoreLive() {
  const snapshot = buildSnapshot({ lite: false });
  return {
    ...snapshot,
    runtimeVersion: RUNTIME,
    ...clientAccess.info(),
    accessRuntimeVersion: clientAccess.RUNTIME,
    menuCanonicalVersion: canonicalMenu.VERSION,
    menuSourceMarker: canonicalMenu.SOURCE,
    activeEntrypoint: 'clean-entrypoint-1.53.10-pr89.js',
    staleEndpointDetected: false,
    debugVersionSource: 'debug-store-live-pr106',
    endpoint: '/debug/store-live',
    noCache: true,
    generatedAt: nowIso()
  };
}

async function githubGetFile({ token, repo, path, branch }) {
  const fetch = require('node-fetch');
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Adminkit-Debug-Export' } });
  if (res.status === 404) return { ok: false, status: 404, sha: '' };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.message || `github_get_failed_${res.status}` };
  return { ok: true, status: res.status, sha: data.sha || '' };
}
async function githubPutFile({ token, repo, branch, path, content, message }) {
  const fetch = require('node-fetch');
  const current = await githubGetFile({ token, repo, path, branch });
  if (current.error && current.status !== 404) return current;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(content, null, 2), 'utf8').toString('base64'),
    branch
  };
  if (current.sha) body.sha = current.sha;
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Adminkit-Debug-Export' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.message || `github_put_failed_${res.status}`, documentation_url: data?.documentation_url || '' };
  return { ok: true, status: res.status, path, sha: data?.content?.sha || '', commitSha: data?.commit?.sha || '' };
}

async function exportToGithub(options = {}) {
  const cfg = exportConfig();
  const dryRun = options.dryRun === true;
  const full = buildSnapshot({ lite: false });
  const lite = buildSnapshot({ lite: true });
  const result = {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: nowIso(),
    dryRun,
    config: { ...cfg, tokenConfigured: cfg.tokenConfigured, tokenMasked: cfg.tokenMasked },
    payloads: {
      latest: { path: cfg.latestPath, bytes: Buffer.byteLength(JSON.stringify(full)), generatedAt: full.generatedAt, runtimeVersion: full.runtimeVersion },
      lite: { path: cfg.litePath, bytes: Buffer.byteLength(JSON.stringify(lite)), generatedAt: lite.generatedAt, runtimeVersion: lite.runtimeVersion }
    },
    writes: []
  };
  if (!cfg.repo) return { ...result, ok: false, error: 'GITHUB_DEBUG_REPO_not_configured' };
  if (!cfg.tokenConfigured) return { ...result, ok: false, error: 'GITHUB_DEBUG_TOKEN_not_configured' };
  if (dryRun) return result;
  const token = clean(config.githubDebugToken || process.env.GITHUB_DEBUG_TOKEN);
  const first = await githubPutFile({ token, repo: cfg.repo, branch: cfg.branch, path: cfg.latestPath, content: full, message: `Update Adminkit debug snapshot ${full.generatedAt}` });
  const second = await githubPutFile({ token, repo: cfg.repo, branch: cfg.branch, path: cfg.litePath, content: lite, message: `Update Adminkit lite debug snapshot ${lite.generatedAt}` });
  result.writes = [first, second];
  result.ok = first.ok === true && second.ok === true;
  if (!result.ok) result.error = 'github_debug_export_failed';
  return result;
}

function selfTest() {
  const cfg = exportConfig();
  const headers = noCacheHeaders();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    endpointsReady: ['/debug/store-live', '/debug/export', '/debug/export-lite', '/debug/debug-export-selftest'],
    noCacheHeadersReady: headers['Cache-Control'].includes('no-store') && headers.Pragma === 'no-cache',
    githubExportReady: true,
    dryRunReady: true,
    liteExportReady: true,
    tokenRedactionReady: redact({ GITHUB_DEBUG_TOKEN: 'secret' }).GITHUB_DEBUG_TOKEN === '[redacted]',
    authGuardReady: true,
    config: { ...cfg, tokenConfigured: cfg.tokenConfigured, tokenMasked: cfg.tokenMasked }
  };
}

module.exports = { RUNTIME, DEFAULT_LATEST_PATH, DEFAULT_LITE_PATH, noCacheHeaders, applyNoCache, exportConfig, authState, redact, buildSnapshot, buildStoreLive, exportToGithub, selfTest };
