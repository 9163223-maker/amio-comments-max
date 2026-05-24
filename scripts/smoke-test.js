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

runSmoke('timing-menu-audit-test.js', 'timing/menu audit smoke test');
runSmoke('comment-skeleton-consumer-pr67-test.js', 'comment skeleton consumer PR67 smoke test');

console.log('smoke ok');
