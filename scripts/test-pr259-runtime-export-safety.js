'use strict';
const assert = require('assert');
const runtimeExport = require('../services/runtimeExportService');
const northflank = require('../services/northflankStartupLogService');
const processEvents = require('../services/processEventsService');
const startupLog = require('../services/startupLogService');

(async () => {
  assert.throws(() => runtimeExport.assertRuntimeBranch('main'), /refuses_main_branch/);
  assert.throws(() => runtimeExport.branchFromEnv('main'), /refuses_main_branch/);
  assert.strictEqual(runtimeExport.assertRuntimeBranch('runtime-status'), 'runtime-status');
  assert.throws(() => runtimeExport.sanitizePath('package.json'), /invalid_path/);
  assert.strictEqual(runtimeExport.sanitizePath('runtime/channel-target-matrix.json'), 'runtime/channel-target-matrix.json');
  await assert.rejects(() => startupLog.ensureBranch({ repo: 'owner/repo', branch: 'main', token: 'x' }), /refuses_main_branch/);

  const oldBranch = process.env.GITHUB_DEBUG_BRANCH;
  const oldToken = process.env.GITHUB_DEBUG_TOKEN;
  process.env.GITHUB_DEBUG_BRANCH = 'main';
  process.env.GITHUB_DEBUG_TOKEN = '';
  assert.throws(() => runtimeExport.branchFromEnv(), /refuses_main_branch/);
  if (oldBranch === undefined) delete process.env.GITHUB_DEBUG_BRANCH; else process.env.GITHUB_DEBUG_BRANCH = oldBranch;
  if (oldToken === undefined) delete process.env.GITHUB_DEBUG_TOKEN; else process.env.GITHUB_DEBUG_TOKEN = oldToken;

  const nf = northflank.payload();
  assert.strictEqual(nf.configured, false);
  assert(nf.reason.includes('missing'));
  processEvents.record('test_event', { code: 0 });
  assert(processEvents.info().events.some((event) => event.event === 'test_event'));
  console.log('PR259 runtime export safety PASS');
})().catch((error) => { console.error(error); process.exit(1); });
