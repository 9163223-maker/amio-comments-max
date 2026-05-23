'use strict';

const assert = require('assert');

function load(path) {
  const mod = require(path);
  assert.ok(mod, `${path} should load`);
  return mod;
}

function fakeMenu() {
  return {
    button(text, action, extra = {}) {
      return { text, action, ...extra };
    },
    keyboard(rows) {
      return { type: 'inline_keyboard', rows };
    }
  };
}

async function testBridgeNullWebhook() {
  const bridge = load('../bridge-pr56');
  let delegated = false;
  const bot = bridge.createCleanBot({
    handleWebhook: async (req, res) => {
      delegated = true;
      return res.status(200).json({ ok: true, delegated: true });
    }
  });
  const res = {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
  await bot.handleWebhook({ body: { update_type: 'message_removed', message: null } }, res, { botToken: 'test-token' });
  assert.strictEqual(delegated, true, 'bridge must delegate non-message webhook updates instead of crashing');
  assert.strictEqual(res.statusCode, 200, 'delegated null-message webhook should still return 200');
}

function testGiftConditionInputScreensReplaceKeyboard() {
  const giftsUx = load('../gifts-flow-cc811-ux');
  const menu = fakeMenu();
  const screen = giftsUx.screenForPayload(menu, { action: 'gift_admin_condition_add', condition: 'promoCode' }, { userId: 'audit-user' });
  return Promise.resolve(screen).then((resolved) => {
    assert.ok(resolved, 'promo input screen should be returned');
    assert.strictEqual(resolved.id, 'gifts_condition_promo_input_pr59');
    assert.ok(resolved.attachments, 'input screen must explicitly replace old keyboard attachments');
    const flat = JSON.stringify(resolved.attachments);
    assert.ok(flat.includes('К условиям'), 'input screen should keep only scoped back action');
    assert.ok(flat.includes('Отменить'), 'input screen should keep cancel action');
    assert.ok(!flat.includes('Промокод / кодовое слово') || flat.indexOf('Промокод / кодовое слово') === flat.lastIndexOf('Промокод / кодовое слово'), 'input screen should not keep the full old conditions menu active');
  });
}

function testConditionGateFailClosed() {
  const gate = load('../services/giftConditionGate');
  assert.strictEqual(typeof gate.evaluateGiftConditions, 'function');
  assert.strictEqual(typeof gate.rawTs, 'function');
  assert.strictEqual(typeof gate.validDateParts, 'function');
  assert.strictEqual(gate.validDateParts(2026, 1, 31, 10, 0), false, '31 Feb must be invalid');
  const raw = gate.rawTs('31.02.2026 10:00 до 01.03.2026 10:00', 'Europe/Moscow');
  assert.strictEqual(Boolean(raw.start), false, 'impossible raw time window must not parse as valid');
}

function testCriticalModulesLoad() {
  const modules = [
    '../clean-entrypoint-pr41',
    '../clean-bot-flow-guard-1546',
    '../clean-bot-posts-open-async-1547',
    '../gifts-flow-cc8-fast',
    '../gifts-flow-cc811-ux',
    '../services/giftConditionGate',
    '../services/giftPendingClaimLookup',
    '../bridge-pr56'
  ];
  modules.forEach(load);
}

(async () => {
  testCriticalModulesLoad();
  await testBridgeNullWebhook();
  await testGiftConditionInputScreensReplaceKeyboard();
  testConditionGateFailClosed();
  console.log('timing/menu audit smoke ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
