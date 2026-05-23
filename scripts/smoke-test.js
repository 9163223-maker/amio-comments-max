'use strict';

const assert = require('assert');

function load(path) {
  const mod = require(path);
  assert.ok(mod, `${path} should load`);
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

console.log('smoke ok');
