#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

function clean(value) { return String(value || '').trim(); }
function bool(value) { return value === true; }
function asList(value) { return Array.isArray(value) ? value : []; }
function parseIso(value) { const ts = Date.parse(clean(value)); return Number.isFinite(ts) ? ts : 0; }
function decodeBase64(value) { return Buffer.from(String(value || ''), 'base64').toString('utf8'); }

function packageMetadata() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return {
      runtimeVersion: clean(pkg.displayVersion || pkg.buildVersion || pkg.version),
      sourceMarker: clean(pkg.sourceMarker),
      entrypoint: clean(pkg.main)
    };
  } catch {
    return { runtimeVersion: '', sourceMarker: '', entrypoint: '' };
  }
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'adminkit-post-merge-live-readiness-pr234',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`github_request_failed_${res.statusCode}: ${body.slice(0, 500)}`));
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(new Error(`github_json_parse_failed: ${error.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(Number(process.env.POST_MERGE_READINESS_HTTP_TIMEOUT_MS || 15000), () => req.destroy(new Error('github_request_timeout')));
    req.end();
  });
}

async function loadStartupLog() {
  const file = clean(process.env.STARTUP_LOG_FILE || process.env.POST_MERGE_STARTUP_LOG_FILE);
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const repo = clean(process.env.GITHUB_REPOSITORY || '9163223-maker/amio-comments-max');
  const token = clean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const ref = clean(process.env.RUNTIME_STATUS_BRANCH || 'runtime-status');
  const url = `https://api.github.com/repos/${repo}/contents/runtime/startup-log.json?ref=${encodeURIComponent(ref)}`;
  const payload = await requestJson(url, token);
  return JSON.parse(decodeBase64(payload.content || ''));
}

function analyzeStartupLog(log, options = {}) {
  const metadata = packageMetadata();
  const expectedSha = clean(options.expectedSha || process.env.EXPECTED_SHA || process.env.GITHUB_SHA);
  const minStartedAt = clean(options.minStartedAt || process.env.MERGED_AT || process.env.GITHUB_HEAD_COMMIT_TIMESTAMP);
  const expectedRuntime = clean(options.expectedRuntime || process.env.EXPECTED_RUNTIME_VERSION || metadata.runtimeVersion);
  const expectedSourceMarker = clean(options.expectedSourceMarker || process.env.EXPECTED_SOURCE_MARKER || metadata.sourceMarker);
  const expectedEntrypoint = clean(options.expectedEntrypoint || process.env.EXPECTED_ENTRYPOINT || metadata.entrypoint);
  const finalGateRequired = ['1', 'true', 'yes', 'on'].includes(clean(options.requireFinalGate === undefined ? process.env.REQUIRE_FINAL_GATE : options.requireFinalGate).toLowerCase());
  const latest = log && log.latest || {};
  const summary = latest.liveVersionSummary || {};
  const gate = latest.finalRuntimeReadinessGate || {};
  const runtimeContract = latest.runtimeContract || {};
  const startupPath = runtimeContract.startupPath || {};
  const dataProviders = runtimeContract.dataProviders || {};
  const items = asList(log && log.items);
  const startedAt = parseIso(latest.startedAt);
  const minStartedTs = parseIso(minStartedAt);
  const recentWindowMs = Number(options.bootLoopWindowMs || process.env.BOOT_LOOP_WINDOW_MS || 15 * 60 * 1000);
  const recentBootIds = new Set(items
    .filter((item) => !expectedSha || clean(item.githubMainHeadSha) === expectedSha)
    .filter((item) => startedAt && Math.abs(startedAt - parseIso(item.startedAt)) <= recentWindowMs)
    .map((item) => clean(item.bootId || item.startedAt))
    .filter(Boolean));
  const bootLoopDetected = recentBootIds.size >= Number(options.bootLoopBootLimit || process.env.BOOT_LOOP_BOOT_LIMIT || 4);
  const checks = {
    startupLogOk: bool(log && log.ok),
    latestPresent: Boolean(latest && Object.keys(latest).length),
    deployedShaMatches: expectedSha ? clean(latest.githubMainHeadSha) === expectedSha : true,
    startupFreshForMerge: minStartedTs ? startedAt >= minStartedTs : true,
    runtimeVersionOk: expectedRuntime ? clean(latest.runtimeVersion) === expectedRuntime : Boolean(clean(latest.runtimeVersion)),
    sourceMarkerOk: expectedSourceMarker ? clean(latest.sourceMarker) === expectedSourceMarker : Boolean(clean(latest.sourceMarker)),
    entrypointOk: expectedEntrypoint ? clean(latest.entrypoint) === expectedEntrypoint : Boolean(clean(latest.entrypoint)),
    runtimeContractOk: bool(runtimeContract.contractLiveOk),
    startupPathOk: bool(startupPath.ok),
    dataProvidersOk: bool(dataProviders.ok),
    staleEndpointOk: summary.staleEndpointDetected === false,
    bootLoopDetected,
    finalGateOk: bool(gate.ok),
    readyForManualMaxTest: bool(gate.readyForManualMaxTest)
  };
  const required = ['startupLogOk', 'latestPresent', 'deployedShaMatches', 'startupFreshForMerge', 'runtimeVersionOk', 'sourceMarkerOk', 'entrypointOk', 'runtimeContractOk', 'startupPathOk', 'dataProvidersOk', 'staleEndpointOk'];
  const missing = required.filter((key) => checks[key] !== true);
  if (checks.bootLoopDetected) missing.push('bootLoopDetected');
  if (finalGateRequired && !checks.finalGateOk) missing.push('finalGateOk');
  if (finalGateRequired && !checks.readyForManualMaxTest) missing.push('readyForManualMaxTest');
  return {
    ok: missing.length === 0,
    mode: 'post-merge-live-readiness-pr234',
    generatedAt: new Date().toISOString(),
    expectedSha,
    expectedRuntime,
    expectedSourceMarker,
    expectedEntrypoint,
    deployedSha: clean(latest.githubMainHeadSha),
    latestStartedAt: clean(latest.startedAt),
    runtimeVersion: clean(latest.runtimeVersion),
    sourceMarker: clean(latest.sourceMarker),
    entrypoint: clean(latest.entrypoint),
    checks,
    missing,
    finalGate: { ok: bool(gate.ok), readyForManualMaxTest: bool(gate.readyForManualMaxTest), missing: asList(gate.missing).slice(0, 30).map(clean).filter(Boolean) },
    callbackContract: {
      statsCallbackContractLiveOk: bool(summary.statsCallbackContractLiveOk),
      statsCallbackContractOk: bool(summary.statsCallbackContractOk),
      statsMainMenuRoutesToCurrentStatsRoot: bool(summary.statsMainMenuRoutesToCurrentStatsRoot),
      statsLegacyRootNotReturned: bool(summary.statsLegacyRootNotReturned),
      lastErrors: asList(summary.callbackContractLastErrors).slice(0, 20).map(clean).filter(Boolean)
    }
  };
}

async function main() {
  const result = analyzeStartupLog(await loadStartupLog());
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
module.exports = { analyzeStartupLog, packageMetadata };
