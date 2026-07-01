'use strict';
const assert = require('assert');
const startupLog = require('../services/startupLogService');
const runtimeExport = require('../services/runtimeExportService');
const channel = require('../services/channelTargetMatrixService');
const full = require('../services/fullSectionMatrixService');
const userJourney = require('../services/userJourneyMatrixService');
const productSemantic = require('../services/productSemanticMatrixService');
const processEvents = require('../services/processEventsService');
const northflank = require('../services/northflankStartupLogService');

(async () => {
  runtimeExport.resetForTest();
  assert.strictEqual(runtimeExport.DEFAULT_BRANCH, 'runtime-status');
  assert.strictEqual(runtimeExport.resolveRuntimeBranch('main'), 'runtime-status', 'env branch main falls back safely');
  assert.throws(() => runtimeExport.branchFromEnv('main'), /refuses_main_branch/);
  assert.throws(() => runtimeExport.assertRuntimeBranch('main'), /refuses_main_branch/);
  await assert.rejects(() => startupLog.exportRuntimeJson({ branch: 'main', path: 'runtime/process-events.json', payload: {} }), /refuses_main_branch/);
  assert.throws(() => runtimeExport.sanitizePath('runtime/nested/file.json'), /invalid_path/);
  assert.throws(() => runtimeExport.sanitizePath('runtime/../x.json'), /invalid_path/);
  assert.doesNotThrow(() => runtimeExport.sanitizePath('runtime/full-section-matrix.json'));

  const expected = [full.DEFAULT_PATH, channel.DEFAULT_PATH, userJourney.DEFAULT_PATH, productSemantic.DEFAULT_PATH, processEvents.DEFAULT_PATH, northflank.DEFAULT_PATH];
  const processPayload = await processEvents.buildPayload();
  const payloads = [full.buildMatrix(), channel.buildMatrix(), userJourney.buildMatrix(), productSemantic.buildMatrix(), processPayload, northflank.payload()];
  assert(payloads.every((p) => p), 'all expected payloads build');
  assert(payloads.filter((_, i) => i !== 3 && i !== 5).every((p) => p.ok === true), 'technical runtime payloads build ok except Northflank missing-config block');
  assert.strictEqual(payloads[5].ok, false, 'Northflank missing config is a diagnostic block');
  assert.strictEqual(payloads[5].configured, false, 'missing Northflank config produces configured:false payload');

  const old = process.env.GITHUB_DEBUG_TOKEN;
  delete process.env.GITHUB_DEBUG_TOKEN;
  const started = Date.now();
  const results = await Promise.all(expected.map((path, i) => startupLog.exportRuntimeJson({ branch: 'runtime-status', path, payload: payloads[i], message: `pr261 ${path}` })));
  if (old !== undefined) process.env.GITHUB_DEBUG_TOKEN = old;
  assert(results.every((r) => r.skipped && r.branch === 'runtime-status'), 'missing token skips without startup throw');
  assert(results.every((r) => typeof r.durationMs === 'number' && r.durationMs >= 0), 'export results include duration');
  assert(Date.now() >= started, 'queue completed');

  const status = runtimeExport.buildStatusPayload(expected);
  assert.deepStrictEqual(status.expectedFiles, expected);
  assert.strictEqual(status.summary.expectedCount, expected.length);
  assert(Array.isArray(status.exports) && status.exports.length === expected.length, 'status includes exports');
  assert.strictEqual(status.summary.skippedCount, expected.length, 'status represents skipped expected files');
  assert.strictEqual(status.missingFiles.length, expected.length, 'skipped files are visible as missing');
  console.log('PR261 reliable runtime diagnostics PASS');
})().catch((error) => { console.error(error); process.exit(1); });
