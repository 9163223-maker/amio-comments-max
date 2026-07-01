'use strict';

const https = require('https');
const startupLog = require('./startupLogService');

const DEFAULT_PATH = 'runtime/northflank-startup-log.json';
const DEFAULT_API_BASE_URL = 'https://api.northflank.com';
const REQUIRED_ENV = ['NORTHFLANK_API_TOKEN', 'NORTHFLANK_PROJECT_ID', 'NORTHFLANK_SERVICE_ID'];

function clean(v) { return String(v || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function limitFromEnv(value = process.env.NORTHFLANK_LOG_TAIL_LIMIT) {
  const n = Number(value || 150);
  return Number.isFinite(n) ? Math.max(100, Math.min(300, Math.floor(n))) : 150;
}
function configured(env = process.env) {
  const missing = REQUIRED_ENV.filter((k) => !clean(env[k]));
  return { ok: missing.length === 0, missing };
}
function sanitizeLine(line = '') {
  return clean(line)
    .replace(/Authorization\s*:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|key|secret|signature|auth|password)=)[^\s&]+/gi, '$1[redacted]')
    .replace(/\b(?:ghp|github_pat|nf)_[A-Za-z0-9_=-]+/gi, '[redacted]')
    .replace(/[A-Za-z0-9_=-]{48,}/g, '[redacted]')
    .slice(0, 700);
}
function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map(sanitizeObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => (/token|secret|password|authorization|api[-_]?key/i.test(k) ? [k, '[redacted]'] : [k, sanitizeObject(v)])));
  }
  return typeof value === 'string' ? sanitizeLine(value) : value;
}
function requestJson({ url, token }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: `${u.pathname}${u.search}`, method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'User-Agent': 'adminkit-northflank-runtime-observability-pr266' } }, (res) => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', (c) => { raw += c; }); res.on('end', () => {
        let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        const e = new Error(`northflank_http_${res.statusCode}`); e.status = res.statusCode; e.data = sanitizeObject(data); reject(e);
      });
    });
    req.on('error', reject); req.setTimeout(8000, () => req.destroy(new Error('northflank_timeout'))); req.end();
  });
}
function candidatePaths(projectId, serviceId, tailLimit) {
  const p = encodeURIComponent(projectId); const s = encodeURIComponent(serviceId);
  return [
    `/v1/projects/${p}/services/${s}`,
    `/v1/projects/${p}/services/${s}/deployment`,
    `/v1/projects/${p}/services/${s}/deployments`,
    `/v1/projects/${p}/services/${s}/logs?limit=${tailLimit}`,
    `/v1/projects/${p}/services/${s}/logs/tail?limit=${tailLimit}`
  ];
}
async function fetchNorthflank({ env = process.env, client = requestJson } = {}) {
  const base = clean(env.NORTHFLANK_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const tailLimit = limitFromEnv(env.NORTHFLANK_LOG_TAIL_LIMIT);
  const out = {};
  const errors = [];
  for (const apiPath of candidatePaths(env.NORTHFLANK_PROJECT_ID, env.NORTHFLANK_SERVICE_ID, tailLimit)) {
    try {
      const data = await client({ url: `${base}${apiPath}`, token: env.NORTHFLANK_API_TOKEN, apiPath, tailLimit });
      if (/logs/.test(apiPath)) out.logs = data; else if (/deployments?$/.test(apiPath)) out.deployment = data; else out.service = data;
    } catch (error) {
      errors.push(sanitizeLine(`${apiPath}: ${error && error.message}`));
    }
  }
  return { ...out, errors };
}
function collectLines(input = {}, tailLimit = limitFromEnv()) {
  const src = input.logs || input;
  const candidates = [src.lines, src.logs, src.items, src.entries, input.lastLines].find(Array.isArray) || [];
  return candidates.map((x) => sanitizeLine(typeof x === 'string' ? x : (x.message || x.log || x.line || JSON.stringify(x)))).filter(Boolean).slice(-tailLimit);
}
function findSha(text) { const m = clean(text).match(/\b[0-9a-f]{40}\b/i); return m ? m[0] : ''; }
function statusFrom(obj = {}) { return sanitizeLine(obj.status || obj.state || obj.phase || obj.condition || obj.serviceStatus || obj.deploymentStatus || ''); }
function buildPayload(input = {}, { env = process.env, generatedAt = nowIso() } = {}) {
  const cfg = configured(env);
  if (!cfg.ok) return { ok: false, ready: false, runtime: 'PR266-NORTHFLANK-RUNTIME-OBSERVABILITY', configured: false, missing: cfg.missing, reason: `missing ${cfg.missing.join(',')}`, generatedAt, serviceStatus: '', deploymentStatus: '', startupSeen: false, startupLogShaSeen: false, staleRuntimeSuspected: true, crashLoopSuspected: false, lastLines: [], errors: [] };
  const tailLimit = limitFromEnv(env.NORTHFLANK_LOG_TAIL_LIMIT);
  const service = sanitizeObject(input.service || input.status || {});
  const deployment = sanitizeObject(input.deployment || input.deployments || {});
  const lastLines = collectLines(input, tailLimit);
  const allText = sanitizeLine(`${JSON.stringify(service)} ${JSON.stringify(deployment)} ${lastLines.join('\n')}`);
  const expectedSha = sanitizeLine(input.expectedSha || env.EXPECTED_SHA || env.GITHUB_SHA || '');
  const detectedSha = sanitizeLine(input.detectedSha || findSha(allText));
  const startupSeen = /startup|server listening|clean-entrypoint|bootstrap|started/i.test(allText);
  const startupLogShaSeen = Boolean(expectedSha && allText.includes(expectedSha));
  const staleRuntimeSuspected = Boolean(expectedSha && detectedSha && detectedSha !== expectedSha) || Boolean(expectedSha && !startupLogShaSeen && lastLines.length > 0);
  const crashLoopSuspected = /crashloop|crash loop|back-?off|oomkilled|exited|restart/i.test(allText);
  return { ok: true, ready: !staleRuntimeSuspected && !crashLoopSuspected, runtime: 'PR266-NORTHFLANK-RUNTIME-OBSERVABILITY', configured: true, generatedAt, serviceStatus: statusFrom(service), deploymentStatus: statusFrom(deployment), currentDeploymentId: sanitizeLine(input.currentDeploymentId || deployment.id || deployment.deploymentId || service.currentDeploymentId || ''), buildId: sanitizeLine(input.buildId || deployment.buildId || service.buildId || ''), expectedSha, detectedSha, startupSeen, startupLogShaSeen, staleRuntimeSuspected, crashLoopSuspected, lastLines, errors: (input.errors || []).map(sanitizeLine) };
}
function payload(input = {}) {
  const cfg = configured(input.env || process.env);
  if (!cfg.ok || input.service || input.deployment || input.logs || input.lastLines) return buildPayload(input, { env: input.env || process.env });
  return fetchNorthflank(input).then((fetched) => buildPayload({ ...fetched, expectedSha: input.expectedSha }, { env: input.env || process.env }));
}
async function exportLog(input = {}) {
  let p;
  try { p = await payload(input); } catch (error) { p = { ok: false, ready: false, configured: configured().ok, generatedAt: nowIso(), reason: 'northflank_export_failed', errors: [sanitizeLine(error && error.message)], lastLines: [] }; }
  return startupLog.exportRuntimeJson({ path: DEFAULT_PATH, payload: p, message: 'northflank startup log' });
}
module.exports = { DEFAULT_PATH, payload, buildPayload, exportLog, sanitizeLine, sanitizeObject, configured, fetchNorthflank, collectLines };
