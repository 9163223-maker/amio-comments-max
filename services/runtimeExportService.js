'use strict';

const https = require('https');

const DEFAULT_REPO = '9163223-maker/amio-comments-max';
const DEFAULT_BRANCH = 'runtime-status';
const MAIN_BRANCH = 'main';
const USER_AGENT = 'adminkit-runtime-export-safety-pr261';
const MAX_ATTEMPTS = 4;
const SAFE_BRANCH_RE = /^(?!.*\.\.)(?!.*\/$)(?!\/)[A-Za-z0-9._/-]{1,120}$/;

const status = { bootId: process.env.ADMINKIT_BOOT_ID || '', exports: [] };
let queue = Promise.resolve();

function clean(value) { return String(value || '').trim(); }
function short(value, max = 160) { return clean(value).slice(0, max); }
function b64(value) { return Buffer.from(String(value || ''), 'utf8').toString('base64'); }
function fromB64(value) { return Buffer.from(String(value || ''), 'base64').toString('utf8'); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeError(error) { return short(error && (error.code || error.status || error.message) || error || 'runtime_export_failed', 160).replace(/ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+\S+/gi, '[redacted]'); }
function isConflict(error) { return error && (error.status === 409 || error.status === 422 || /sha|conflict|update/i.test(error.message || '')); }
function resolveRuntimeBranch(value = process.env.GITHUB_DEBUG_BRANCH || process.env.RUNTIME_STATUS_BRANCH || DEFAULT_BRANCH) {
  const branch = clean(value || DEFAULT_BRANCH) || DEFAULT_BRANCH;
  if (branch.toLowerCase() === MAIN_BRANCH) return DEFAULT_BRANCH;
  if (!SAFE_BRANCH_RE.test(branch)) return DEFAULT_BRANCH;
  return branch;
}
function branchFromEnv(value = process.env.GITHUB_DEBUG_BRANCH || process.env.RUNTIME_STATUS_BRANCH || DEFAULT_BRANCH) { return assertRuntimeBranch(clean(value || DEFAULT_BRANCH) || DEFAULT_BRANCH); }
function assertRuntimeBranch(branch) {
  const b = clean(branch || DEFAULT_BRANCH) || DEFAULT_BRANCH;
  if (b.toLowerCase() === MAIN_BRANCH) throw new Error('runtime_export_refuses_main_branch');
  if (!SAFE_BRANCH_RE.test(b)) throw new Error('runtime_export_invalid_branch');
  return b;
}
function sanitizePath(path = '') {
  const p = clean(path);
  if (!/^runtime\/[A-Za-z0-9._-]+\.json$/.test(p) || p.includes('..')) throw new Error('runtime_export_invalid_path');
  return p;
}
function requestJson({ method = 'GET', apiPath, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request({ hostname: 'api.github.com', method, path: apiPath, headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, (res) => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { raw += chunk; }); res.on('end', () => { let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; } if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data); const e = new Error(data.message || `github_status_${res.statusCode}`); e.status = res.statusCode; reject(e); });
    });
    req.on('error', reject); req.setTimeout(8000, () => req.destroy(new Error('github_timeout'))); if (payload) req.write(payload); req.end();
  });
}
async function ensureBranch({ repo = DEFAULT_REPO, branch = DEFAULT_BRANCH, token }) {
  branch = assertRuntimeBranch(branch);
  try { await requestJson({ apiPath: `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token }); return { ok: true, existed: true, branch }; }
  catch (error) { if (error.status !== 404) throw error; }
  const repoInfo = await requestJson({ apiPath: `/repos/${repo}`, token });
  const baseBranch = clean(repoInfo.default_branch || MAIN_BRANCH);
  if (baseBranch.toLowerCase() === branch.toLowerCase()) throw new Error('runtime_export_base_ref_unsafe');
  const baseRef = await requestJson({ apiPath: `/repos/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, token });
  const sha = baseRef && baseRef.object && baseRef.object.sha;
  if (!sha) throw new Error('runtime_export_base_ref_missing');
  await requestJson({ method: 'POST', apiPath: `/repos/${repo}/git/refs`, token, body: { ref: `refs/heads/${branch}`, sha } });
  return { ok: true, existed: false, branch, baseBranch };
}
async function readJson({ repo = DEFAULT_REPO, branch = DEFAULT_BRANCH, path, token }) {
  branch = assertRuntimeBranch(branch); path = sanitizePath(path);
  try { const file = await requestJson({ apiPath: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, token }); return { sha: clean(file.sha), data: file.content ? JSON.parse(fromB64(file.content || '')) : null }; }
  catch (error) { if (error.status === 404) return { sha: '', data: null }; throw error; }
}
async function resolvePayload(payload) { return typeof payload === 'function' ? await payload() : payload; }
async function exportJsonOnce({ repo, branch, path, token, payload, message }) {
  await ensureBranch({ repo, branch, token });
  const current = await readJson({ repo, branch, path, token });
  const resolved = await resolvePayload(payload);
  await requestJson({ method: 'PUT', apiPath: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, token, body: { message: short(message, 120), content: b64(`${JSON.stringify(resolved, null, 2)}\n`), branch, ...(current.sha ? { sha: current.sha } : {}) } });
}
async function exportJsonInner({ repo = DEFAULT_REPO, branch = resolveRuntimeBranch(), path, token = process.env.GITHUB_DEBUG_TOKEN, payload, message = 'runtime diagnostic export' }) {
  const started = Date.now(); let attempts = 0; let result;
  try {
    branch = assertRuntimeBranch(branch); path = sanitizePath(path);
    if (!clean(token)) result = { ok: false, skipped: true, configured: false, branch, path, error: 'GITHUB_DEBUG_TOKEN not configured' };
    else {
      for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts += 1) {
        try { await exportJsonOnce({ repo, branch, path, token, payload, message }); result = { ok: true, skipped: false, configured: true, branch, path }; break; }
        catch (error) { if (attempts >= MAX_ATTEMPTS || !isConflict(error)) throw error; await sleep(80 * attempts); }
      }
    }
  } catch (error) { result = { ok: false, skipped: false, configured: Boolean(clean(token)), branch: clean(branch || DEFAULT_BRANCH), path: clean(path), error: safeError(error) }; }
  result.attempts = attempts || 0; result.durationMs = Date.now() - started;
  status.exports.push(result);
  return result;
}
function exportJson(input) {
  const task = queue.then(() => exportJsonInner(input));
  queue = task.catch(() => {});
  return task;
}
function buildStatusPayload(expectedFiles = []) {
  const files = expectedFiles.map(sanitizePath);
  const latest = new Map(status.exports.map((item) => [item.path, item]));
  const exports = Array.from(latest.values());
  const missingFiles = files.filter((path) => !(latest.get(path) && latest.get(path).ok));
  const okCount = exports.filter((e) => e.ok).length;
  const skippedCount = exports.filter((e) => e.skipped).length;
  const failedCount = exports.filter((e) => !e.ok && !e.skipped).length;
  return { ok: missingFiles.length === 0 && failedCount === 0, generatedAt: new Date().toISOString(), bootId: status.bootId, expectedFiles: files, exports, missingFiles, summary: { expectedCount: files.length, okCount, skippedCount, failedCount, missingCount: missingFiles.length } };
}
async function exportStatus({ expectedFiles, path = 'runtime/diagnostic-export-status.json' } = {}) { return exportJson({ path, payload: () => buildStatusPayload(expectedFiles || []), message: 'diagnostic export status' }); }
function resetForTest() { status.exports = []; queue = Promise.resolve(); }
module.exports = { DEFAULT_REPO, DEFAULT_BRANCH, MAIN_BRANCH, branchFromEnv, resolveRuntimeBranch, assertRuntimeBranch, sanitizePath, exportJson, safeError, ensureBranch, readJson, buildStatusPayload, exportStatus, resetForTest, resolvePayload };
