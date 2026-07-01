'use strict';
const assert = require('assert');
const push = require('../services/pushDispatchLogService');

(async () => {
  const oldBranch = process.env.GITHUB_DEBUG_BRANCH;
  const oldToken = process.env.GITHUB_DEBUG_TOKEN;
  push.resetForTest();
  process.env.GITHUB_DEBUG_BRANCH = 'main';
  process.env.GITHUB_DEBUG_TOKEN = '';
  const warns = [];
  const oldWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  assert.strictEqual(push.resolveSafeRuntimeBranch(), 'runtime-status');
  assert.strictEqual(push.resolveSafeRuntimeBranch(), 'runtime-status');
  await push.record({ event: 'dispatch_skipped', messageText: 'x' });
  console.warn = oldWarn;
  const info = push.info();
  assert.notStrictEqual(info.runtimeBranch, 'main');
  assert(info.refusedMainBranchCount >= 2);
  assert.strictEqual(warns.length, 1, 'main-branch warning emitted once');
  if (oldBranch === undefined) delete process.env.GITHUB_DEBUG_BRANCH; else process.env.GITHUB_DEBUG_BRANCH = oldBranch;
  if (oldToken === undefined) delete process.env.GITHUB_DEBUG_TOKEN; else process.env.GITHUB_DEBUG_TOKEN = oldToken;
  console.log('PR266 runtime export branch safety PASS');
})().catch((error) => { console.error(error); process.exit(1); });
