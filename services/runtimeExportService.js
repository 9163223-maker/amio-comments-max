'use strict';

const https = require('https');

const DEFAULT_REPO = '9163223-maker/amio-comments-max';
const DEFAULT_BRANCH = 'runtime-status';
const MAIN_BRANCH = 'main';
const USER_AGENT = 'adminkit-runtime-export-safety-pr259';

function clean(value) { return String(value || '').trim(); }
function short(value, max = 160) { return clean(value).slice(0, max); }
function b64(value) { return Buffer.from(String(value || ''), 'utf8').toString('base64'); }
function fromB64(value) { return Buffer.from(String(value || ''), 'base64').toString('utf8'); }
function branchFromEnv(value = process.env.GITHUB_DEBUG_BRANCH || process.env.RUNTIME_STATUS_BRANCH || DEFAULT_BRANCH) {
  const branch = clean(value || DEFAULT_BRANCH) || DEFAULT_BRANCH;
  if (branch.toLowerCase() === MAIN_BRANCH) throw new Error('runtime_export_refuses_main_branch');
  return branch;
}
function assertRuntimeBranch(branch) {
  const b = clean(branch || DEFAULT_BRANCH) || DEFAULT_BRANCH;
  if (b.toLowerCase() === MAIN_BRANCH) throw new Error('runtime_export_refuses_main_branch');
  return b;
}
function sanitizePath(path = '') {
  const p = clean(path);
  if (!/^runtime\/[A-Za-z0-9._/-]+\.json$/.test(p) || p.includes('..')) throw new Error('runtime_export_invalid_path');
  return p;
}
function safeError(error) { return short(error && (error.code || error.status || error.message) || error || 'runtime_export_failed', 160).replace(/ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+\S+/gi, '[redacted]'); }
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
  const baseRef = await requestJson({ apiPath: `/repos/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, token });
  const sha = baseRef && baseRef.object && baseRef.object.sha;
  if (!sha) throw new Error('runtime_export_base_ref_missing');
  await requestJson({ method: 'POST', apiPath: `/repos/${repo}/git/refs`, token, body: { ref: `refs/heads/${branch}`, sha } });
  return { ok: true, existed: false, branch, baseBranch };
}
async function readJson({ repo = DEFAULT_REPO, branch = DEFAULT_BRANCH, path, token }) {
  branch = assertRuntimeBranch(branch); path = sanitizePath(path);
  try { const file = await requestJson({ apiPath: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, token }); return { sha: clean(file.sha), data: JSON.parse(fromB64(file.content || '')) }; }
  catch (error) { if (error.status === 404) return { sha: '', data: null }; throw error; }
}
async function exportJson({ repo = DEFAULT_REPO, branch = branchFromEnv(), path, token = process.env.GITHUB_DEBUG_TOKEN, payload, message = 'runtime diagnostic export' }) {
  branch = assertRuntimeBranch(branch); path = sanitizePath(path);
  if (!clean(token)) return { ok: false, skipped: true, configured: false, branch, path, error: 'GITHUB_DEBUG_TOKEN not configured' };
  await ensureBranch({ repo, branch, token });
  const current = await readJson({ repo, branch, path, token });
  await requestJson({ method: 'PUT', apiPath: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, token, body: { message: short(message, 120), content: b64(`${JSON.stringify(payload, null, 2)}\n`), branch, ...(current.sha ? { sha: current.sha } : {}) } });
  return { ok: true, branch, path };
}
module.exports = { DEFAULT_REPO, DEFAULT_BRANCH, MAIN_BRANCH, branchFromEnv, assertRuntimeBranch, sanitizePath, exportJson, safeError, ensureBranch };
