#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');

function arg(name, def = '') { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] || def : (process.env[name.toUpperCase()] || def); }
function clean(v) { return String(v || '').trim(); }
function minutes(v) { const n = Number(v || 0); return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 0; }
function ageMs(ts) { const t = Date.parse(ts || ''); return Number.isFinite(t) ? Date.now() - t : Infinity; }
function stale(ts, maxMin = 15) { return ageMs(ts) > maxMin * 60 * 1000; }
function reason(checks) {
  if (!checks.northflankConfigured) return 'northflank_observability_missing';
  if (!checks.diagnosticFresh || !checks.diagnosticComplete) return 'runtime_export_failed';
  if (!checks.northflankStartupSeen) return 'deploy_not_promoted';
  if (!checks.startupShaMatches || !checks.startupFresh) return 'container_crashed_before_bootstrap';
  return 'ok';
}
function readLocal(dir, name) { return JSON.parse(fs.readFileSync(`${dir}/${name}`, 'utf8')); }
function githubGet({ repo, branch, path, token }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'api.github.com', path: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'adminkit-post-merge-runtime-pickup-pr266', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', (c) => { raw += c; }); res.on('end', () => { if (res.statusCode >= 200 && res.statusCode < 300) { const data = JSON.parse(raw); return resolve(JSON.parse(Buffer.from(data.content || '', 'base64').toString('utf8'))); } reject(new Error(`github_http_${res.statusCode}`)); });
    });
    req.on('error', reject); req.end();
  });
}
async function main(opts = {}) {
  const expectedSha = clean(opts.expected_sha || opts.expectedSha || arg('expected_sha'));
  const runtimeBranch = clean(opts.runtime_branch || arg('runtime_branch', 'runtime-status')) || 'runtime-status';
  const waitMinutes = minutes(opts.wait_minutes ?? arg('wait_minutes', '5'));
  if (!expectedSha) throw new Error('expected_sha required');
  if (runtimeBranch.toLowerCase() === 'main' || runtimeBranch.includes('..')) throw new Error('unsafe runtime_branch');
  if (waitMinutes && !opts.skipWait) execFileSync('sleep', [String(waitMinutes * 60)], { stdio: 'inherit' });
  const files = opts.files || {
    startup: await githubGet({ repo: process.env.GITHUB_REPOSITORY || '9163223-maker/amio-comments-max', branch: runtimeBranch, path: 'runtime/startup-log.json', token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN }),
    diagnostic: await githubGet({ repo: process.env.GITHUB_REPOSITORY || '9163223-maker/amio-comments-max', branch: runtimeBranch, path: 'runtime/diagnostic-export-status.json', token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN }),
    northflank: await githubGet({ repo: process.env.GITHUB_REPOSITORY || '9163223-maker/amio-comments-max', branch: runtimeBranch, path: 'runtime/northflank-startup-log.json', token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN })
  };
  const startupLatest = files.startup.latest || files.startup;
  const startupUpdatedAt = startupLatest.updatedAt || files.startup.updatedAt || startupLatest.startedAt;
  const diagAt = files.diagnostic.generatedAt || files.diagnostic.updatedAt;
  const expected = ['runtime/startup-log.json', 'runtime/diagnostic-export-status.json', 'runtime/northflank-startup-log.json', 'runtime/full-section-matrix.json', 'runtime/channel-target-matrix.json', 'runtime/user-journey-matrix.json', 'runtime/process-events.json'];
  const missing = Array.isArray(files.diagnostic.missingFiles) ? files.diagnostic.missingFiles : [];
  const checks = {
    startupShaMatches: startupLatest.githubMainHeadSha === expectedSha,
    startupFresh: !stale(startupUpdatedAt),
    diagnosticFresh: !stale(diagAt),
    diagnosticComplete: files.diagnostic.ok === true && expected.every((f) => !missing.includes(f)),
    northflankConfigured: files.northflank.configured === true,
    northflankStartupSeen: files.northflank.startupSeen === true && (files.northflank.startupLogShaSeen === true || files.northflank.detectedSha === expectedSha || files.northflank.expectedSha === expectedSha)
  };
  const out = { ok: Object.values(checks).every(Boolean), generatedAt: new Date().toISOString(), expected_sha: expectedSha, runtime_branch: runtimeBranch, startup_log_sha: startupLatest.githubMainHeadSha || '', runtime_status_updatedAt: startupUpdatedAt || '', diagnostic_updatedAt: diagAt || '', northflank_configured: files.northflank.configured === true, northflank_startup_seen: files.northflank.startupSeen === true, checks, likely_reason: reason(checks) };
  fs.writeFileSync(opts.output || 'runtime-post-merge-check.json', `${JSON.stringify(out, null, 2)}\n`);
  if (!out.ok && !opts.noExit) process.exit(1);
  return out;
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { main, reason, stale };
