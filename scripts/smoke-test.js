'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

function load(modulePath) {
  const mod = require(modulePath);
  assert.ok(mod, `${modulePath} should load`);
  return mod;
}

const conditionGate = load('../services/giftConditionGate');
assert.strictEqual(typeof conditionGate.evaluateGiftConditions, 'function', 'giftConditionGate.evaluateGiftConditions must be a function');

const pendingLookup = load('../services/giftPendingClaimLookup');
assert.strictEqual(typeof pendingLookup.processPendingGiftClaimInput, 'function', 'giftPendingClaimLookup.processPendingGiftClaimInput must be a function');

const giftService = load('../services/giftService');
assert.strictEqual(typeof giftService.claimGift, 'function', 'giftService.claimGift must be a function');

const bridge = load('../bridge-pr56');
assert.strictEqual(typeof bridge.createCleanBot, 'function', 'bridge-pr56.createCleanBot must be a function');

const audit = spawnSync(process.execPath, [path.join(__dirname, 'timing-menu-audit-test.js')], { encoding: 'utf8' });
if (audit.stdout) process.stdout.write(audit.stdout);
if (audit.stderr) process.stderr.write(audit.stderr);
assert.strictEqual(audit.status, 0, 'timing/menu audit smoke test must pass');

console.log('smoke ok');
