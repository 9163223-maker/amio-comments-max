'use strict';

const https = require('https');
const crypto = require('crypto');

const DEFAULT_REPO = '9163223-maker/amio-comments-max';
const DEFAULT_BRANCH = 'runtime-status';
const DEFAULT_PATH = 'runtime/startup-log.json';
const DEFAULT_LIMIT = 50;
const DEFAULT_MAIN_BRANCH = 'main';
const USER_AGENT = 'adminkit-startup-log-pr181';

const state = {
  enabled: false,
  lastOk: false,
  lastError: '',
  lastAttemptAt: '',
  lastSyncedAt: '',
  branch: DEFAULT_BRANCH,
  path: DEFAULT_PATH,
  limit: DEFAULT_LIMIT,
  latest: null,
  githubMainHeadSha: '',
  githubMainHeadCheckedAt: ''
};

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function short(value, max = 160) { return clean(value).slice(0, max); }
function b64(value) { return Buffer.from(String(value || ''), 'utf8').toString('base64'); }
function fromB64(value) { return Buffer.from(String(value || ''), 'base64').toString('utf8'); }
function bootId() { return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`; }

function sanitizeBool(value) { return value === true; }
function sanitizeEntry(input = {}) {
  const safe = {
    startedAt: short(input.startedAt || nowIso(), 64),
    bootId: short(input.bootId || bootId(), 80),
    runtimeVersion: short(input.runtimeVersion, 120),
    buildVersion: short(input.buildVersion || input.runtimeVersion, 120),
    displayVersion: short(input.displayVersion || input.runtimeVersion, 120),
    sourceMarker: short(input.sourceMarker, 160),
    entrypoint: short(input.entrypoint || 'clean-entrypoint-1.53.10-pr89.js', 120),
    gitCommit: short(input.gitCommit || process.env.GIT_COMMIT || process.env.COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION, 80),
    githubMainBranch: short(input.githubMainBranch || DEFAULT_MAIN_BRANCH, 80),
    githubMainHeadSha: short(input.githubMainHeadSha, 80),
    githubMainHeadCheckedAt: short(input.githubMainHeadCheckedAt, 64),
    commitSource: short(input.commitSource, 80),
    nodeEnv: short(process.env.NODE_ENV || '', 40),
    pr178PushPairingBinding: sanitizeBool(input.pr178PushPairingBinding),
    pushPairingRuntimeVersion: short(input.pushPairingRuntimeVersion, 120),
    pushPairingSourceMarker: short(input.pushPairingSourceMarker, 160),
    pr165RuntimeWired: sanitizeBool(input.pr165RuntimeWired),
    postgresConfigured: sanitizeBool(input.postgresConfigured),
    canonicalPublicBaseUrl: short(input.canonicalPublicBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL, 200),
    safe: true
  };
  if (!safe.commitSource) safe.commitSource = safe.gitCommit ? 'runtime-env' : (safe.githubMainHeadSha ? 'github-main-head' : 'unknown');
  return safe;
}

function safeError(error) {
  const code = short(error && (error.code || error.status || error.message), 120) || 'startup_log_failed';
  return code.replace(/ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+\S+/gi, '[redacted]');
}

function requestJson({ method = 'GET', path, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request({
      hostname: 'api.github.com',
      method,
      path,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        const error = new Error(data && data.message || `github_status_${res.statusCode}`);
        error.status = res.statusCode;
        error.data = data;
        reject(error);
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('github_timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function getBranchHead({ repo, branch, token }) {
  const checkedAt = nowIso();
  try {
    const ref = await requestJson({ path: `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token });
    const sha = ref && ref.object && ref.object.sha;
    return { ok: Boolean(sha), branch, sha: short(sha, 80), checkedAt };
  } catch (error) {
    return { ok: false, branch, sha: '', checkedAt, error: safeError(error) };
  }
}

async function ensureBranch({ repo, branch, token }) {
  try {
    await requestJson({ path: `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token });
    return { ok: true, existed: true };
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const repoInfo = await requestJson({ path: `/repos/${repo}`, token });
  const baseBranch = clean(repoInfo.default_branch || DEFAULT_MAIN_BRANCH);
  const baseRef = await requestJson({ path: `/repos/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, token });
  const sha = baseRef && baseRef.object && baseRef.object.sha;
  if (!sha) throw new Error('startup_log_base_ref_missing');
  await requestJson({ method: 'POST', path: `/repos/${repo}/git/refs`, token, body: { ref: `refs/heads/${branch}`, sha } });
  return { ok: true, existed: false, baseBranch, sha };
}

async function readLog({ repo, branch, path, token }) {
  try {
    const file = await requestJson({ path: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, token });
    const parsed = JSON.parse(fromB64(file.content || ''));
    return { sha: file.sha, log: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch (error) {
    if (error.status === 404) return { sha: '', log: {} };
    throw error;
  }
}

async function writeLog({ repo, branch, path, token, sha, log }) {
  const body = {
    message: `startup log ${log.latest && log.latest.runtimeVersion || 'runtime'}`,
    content: b64(`${JSON.stringify(log, null, 2)}\n`),
    branch,
    ...(sha ? { sha } : {})
  };
  return requestJson({ method: 'PUT', path: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, token, body });
}

async function recordStartup(input = {}) {
  state.lastAttemptAt = nowIso();
  const token = clean(process.env.GITHUB_DEBUG_TOKEN);
  state.enabled = Boolean(token);
  if (!token) {
    state.lastOk = false;
    state.lastError = 'GITHUB_DEBUG_TOKEN not configured';
    console.log('[startup-log] skipped: GITHUB_DEBUG_TOKEN not configured');
    return { ok: false, skipped: true, error: state.lastError };
  }
  const repo = DEFAULT_REPO;
  const branch = DEFAULT_BRANCH;
  const path = DEFAULT_PATH;
  const limit = DEFAULT_LIMIT;
  state.branch = branch;
  state.path = path;
  state.limit = limit;
  try {
    const mainHead = await getBranchHead({ repo, branch: DEFAULT_MAIN_BRANCH, token });
    const entry = sanitizeEntry({
      ...input,
      githubMainBranch: DEFAULT_MAIN_BRANCH,
      githubMainHeadSha: mainHead.sha,
      githubMainHeadCheckedAt: mainHead.checkedAt,
      commitSource: clean(input.gitCommit || process.env.GIT_COMMIT || process.env.COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION) ? 'runtime-env' : (mainHead.sha ? 'github-main-head' : 'unknown')
    });
    state.githubMainHeadSha = mainHead.sha;
    state.githubMainHeadCheckedAt = mainHead.checkedAt;
    await ensureBranch({ repo, branch, token });
    const current = await readLog({ repo, branch, path, token });
    const oldItems = Array.isArray(current.log.items) ? current.log.items : [];
    const items = [entry, ...oldItems].slice(0, limit);
    const log = { ok: true, updatedAt: nowIso(), limit, latest: entry, items };
    await writeLog({ repo, branch, path, token, sha: current.sha, log });
    state.lastOk = true;
    state.lastError = '';
    state.lastSyncedAt = log.updatedAt;
    state.latest = entry;
    console.log('[startup-log] synced', JSON.stringify({ branch, path, runtimeVersion: entry.runtimeVersion, gitCommit: entry.gitCommit, githubMainHeadSha: entry.githubMainHeadSha }));
    return { ok: true, branch, path, latest: entry };
  } catch (error) {
    state.lastOk = false;
    state.lastError = safeError(error);
    console.warn('[startup-log] failed', state.lastError);
    return { ok: false, error: state.lastError };
  }
}

function info() {
  return {
    enabled: state.enabled,
    lastOk: state.lastOk,
    lastError: state.lastError,
    lastAttemptAt: state.lastAttemptAt,
    lastSyncedAt: state.lastSyncedAt,
    branch: state.branch,
    path: state.path,
    limit: state.limit,
    githubMainHeadSha: state.githubMainHeadSha,
    githubMainHeadCheckedAt: state.githubMainHeadCheckedAt,
    latest: state.latest
  };
}

module.exports = { recordStartup, info, sanitizeEntry, getBranchHead, DEFAULT_REPO, DEFAULT_BRANCH, DEFAULT_PATH, DEFAULT_LIMIT, DEFAULT_MAIN_BRANCH };
