'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

function load(modulePath) {
  const mod = require(modulePath);
  assert.ok(mod, `${modulePath} should load`);
  return mod;
}

function runSmoke(script, label) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.strictEqual(result.status, 0, `${label} must pass`);
}

const conditionGate = load('../services/giftConditionGate');
assert.strictEqual(typeof conditionGate.evaluateGiftConditions, 'function', 'giftConditionGate.evaluateGiftConditions must be a function');

const pendingLookup = load('../services/giftPendingClaimLookup');
assert.strictEqual(typeof pendingLookup.processPendingGiftClaimInput, 'function', 'giftPendingClaimLookup.processPendingGiftClaimInput must be a function');

const giftService = load('../services/giftService');
assert.strictEqual(typeof giftService.claimGift, 'function', 'giftService.claimGift must be a function');

const bridge = load('../bridge-pr56');
assert.strictEqual(typeof bridge.createCleanBot, 'function', 'bridge-pr56.createCleanBot must be a function');

const postPatcher = load('../services/postPatcher');
assert.strictEqual(typeof postPatcher.patchStoredPost, 'function', 'postPatcher.patchStoredPost must be a function');
assert.strictEqual(typeof postPatcher.getPatchCoalescingSnapshot, 'function', 'postPatcher.getPatchCoalescingSnapshot must be a function');
assert.strictEqual(postPatcher.PATCH_COALESCE_RUNTIME, 'CC8.1.10-PATCH-REPATCH-COALESCING', 'post patch coalescing runtime must be stable');
assert.strictEqual(postPatcher.PATCH_COMPUTE_BREAKDOWN_RUNTIME, 'CC8.1.15-PATCH-COMPUTE-BREAKDOWN', 'post patch breakdown runtime must be stable');

runSmoke('timing-menu-audit-test.js', 'timing/menu audit smoke test');
runSmoke('comment-skeleton-consumer-pr67-test.js', 'comment skeleton consumer PR67 smoke test');
runSmoke('patch-coalescing-pr68-test.js', 'patch coalescing PR68 smoke test');
runSmoke('core-fast-text-send-pr70-test.js', 'core fast text send PR70 smoke test');
runSmoke('wire-pr73-active-entrypoint-test.js', 'wire PR73 active entrypoint smoke test');
runSmoke('patch-compute-breakdown-pr75-test.js', 'patch compute breakdown PR75 test');
runSmoke('comment-runtime-media-contract-test.js', 'comment runtime media contract smoke test');
runSmoke('media-lifecycle-clean-test.js', 'media lifecycle clean contract smoke test');
runSmoke('test-canonical-client-menu.js', 'PR105 canonical client menu smoke test');
runSmoke('test-push-product-perfect-pr187.js', 'PR187 push product-perfect regression test');
runSmoke('test-push-multi-chat-handoff-pr188.js', 'PR188 push multi-chat handoff smoke test');
runSmoke('test-native-slash-private-context-pr236.js', 'PR236 native slash private context regression test');
runSmoke('test-native-slash-single-active-pr237.js', 'PR237 native slash single-active UX contract test');
runSmoke('test-pr237-runtime-contract-diagnostics.js', 'PR237 runtime contract diagnostics test');
runSmoke('test-postgres-store-connect-timeout-pr232.js', 'PR232 postgres connect timeout smoke test');
runSmoke('test-post-merge-live-readiness-pr234.js', 'PR234 post-merge live readiness checker smoke test');
runSmoke('test-pr241-gifts-stats-tenant-contract.js', 'PR241 gifts/stats tenant contract test');

console.log('smoke ok');
