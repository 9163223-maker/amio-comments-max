#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

const REQUIRED_RUNTIME_FILES = [
  'runtime/startup-log.json',
  'runtime/diagnostic-export-status.json',
  'runtime/northflank-startup-log.json',
  'runtime/full-section-matrix.json',
  'runtime/channel-target-matrix.json',
  'runtime/user-journey-matrix.json',
  'runtime/product-semantic-matrix.json',
  'runtime/tenant-channel-binding-matrix.json',
  'runtime/maximal-flow-matrix.json',
  'runtime/live-tenant-self-diagnostic-matrix.json',
  'runtime/process-events.json'
];

function arg(name, def = '') { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] || def : (process.env[name.toUpperCase()] || def); }
function clean(v) { return String(v || '').trim(); }
function minutes(v) { const n = Number(v || 0); return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 0; }
function ageMs(ts) { const t = Date.parse(ts || ''); return Number.isFinite(t) ? Date.now() - t : Infinity; }
function stale(ts, maxMin = 15) { return ageMs(ts) > maxMin * 60 * 1000; }
function reason(checks) {
  if (!checks.northflankConfigured) return 'northflank_observability_missing';
  if (!checks.diagnosticFresh || !checks.diagnosticComplete || !checks.requiredFilesDeclared) return 'runtime_export_failed';
  if (!checks.northflankStartupSeen) return 'deploy_not_promoted';
  if (!checks.startupShaMatches || !checks.startupFresh) return 'container_crashed_before_bootstrap';
  return 'ok';
}
function runJson(command, args, options = {}) { return JSON.parse(execFileSync(command, args, { encoding: 'utf8', ...options })); }
function githubGet({ repo, branch, path }) {
  const apiPath = `repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const data = runJson('gh', ['api', apiPath]);
  return JSON.parse(Buffer.from(data.content || '', 'base64').toString('utf8'));
}
function diagnosticStatus(files = {}) {
  const diagnostic = files.diagnostic || {};
  const missing = Array.isArray(diagnostic.missingFiles) ? diagnostic.missingFiles : [];
  const expectedFiles = Array.isArray(diagnostic.expectedFiles) ? diagnostic.expectedFiles : [];
  const undeclaredRequiredFiles = REQUIRED_RUNTIME_FILES.filter((file) => !expectedFiles.includes(file));
  const missingRequiredFiles = REQUIRED_RUNTIME_FILES.filter((file) => missing.includes(file));
  return {
    expectedFiles,
    missing,
    undeclaredRequiredFiles,
    missingRequiredFiles,
    requiredFilesDeclared: undeclaredRequiredFiles.length === 0,
    complete: diagnostic.ok === true && undeclaredRequiredFiles.length === 0 && missingRequiredFiles.length === 0
  };
}
async function main(opts = {}) {
  const expectedSha = clean(opts.expected_sha || opts.expectedSha || arg('expected_sha'));
  const runtimeBranch = clean(opts.runtime_branch || arg('runtime_branch', 'runtime-status')) || 'runtime-status';
  const waitMinutes = minutes(opts.wait_minutes ?? arg('wait_minutes', '5'));
  if (!expectedSha) throw new Error('expected_sha required');
  if (runtimeBranch.toLowerCase() === 'main' || runtimeBranch.includes('..')) throw new Error('unsafe runtime_branch');
  if (waitMinutes && !opts.skipWait) execFileSync('sleep', [String(waitMinutes * 60)], { stdio: 'inherit' });
  const files = opts.files || {
    startup: githubGet({ repo: process.env.GITHUB_REPOSITORY || '9163223-maker/amio-comments-max', branch: runtimeBranch, path: 'runtime/startup-log.json' }),
    diagnostic: githubGet({ repo: process.env.GITHUB_REPOSITORY || '9163223-maker/amio-comments-max', branch: runtimeBranch, path: 'runtime/diagnostic-export-status.json' }),
    northflank: githubGet({ repo: process.env.GITHUB_REPOSITORY || '9163223-maker/amio-comments-max', branch: runtimeBranch, path: 'runtime/northflank-startup-log.json' })
  };
  const startupLatest = files.startup.latest || files.startup;
  const startupUpdatedAt = startupLatest.updatedAt || files.startup.updatedAt || startupLatest.startedAt;
  const diagAt = files.diagnostic.generatedAt || files.diagnostic.updatedAt;
  const diag = diagnosticStatus(files);
  const checks = {
    startupShaMatches: startupLatest.githubMainHeadSha === expectedSha,
    startupFresh: !stale(startupUpdatedAt),
    diagnosticFresh: !stale(diagAt),
    requiredFilesDeclared: diag.requiredFilesDeclared,
    diagnosticComplete: diag.complete,
    northflankConfigured: files.northflank.configured === true,
    northflankStartupSeen: files.northflank.startupSeen === true && (files.northflank.startupLogShaSeen === true || files.northflank.detectedSha === expectedSha || files.northflank.expectedSha === expectedSha)
  };
  const out = {
    ok: Object.values(checks).every(Boolean),
    generatedAt: new Date().toISOString(),
    expected_sha: expectedSha,
    runtime_branch: runtimeBranch,
    startup_log_sha: startupLatest.githubMainHeadSha || '',
    runtime_status_updatedAt: startupUpdatedAt || '',
    diagnostic_updatedAt: diagAt || '',
    diagnostic_expected_files_count: diag.expectedFiles.length,
    diagnostic_undeclared_required_files: diag.undeclaredRequiredFiles,
    diagnostic_missing_required_files: diag.missingRequiredFiles,
    northflank_configured: files.northflank.configured === true,
    northflank_startup_seen: files.northflank.startupSeen === true,
    checks,
    likely_reason: reason(checks)
  };
  fs.writeFileSync(opts.output || 'runtime-post-merge-check.json', `${JSON.stringify(out, null, 2)}\n`);
  if (!out.ok && !opts.noExit) process.exit(1);
  return out;
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { main, reason, stale, diagnosticStatus, REQUIRED_RUNTIME_FILES };
