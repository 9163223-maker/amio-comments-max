'use strict';

const assert = require('assert');
const basePath = require.resolve('../clean-bot-channel-fast-pr84');
const maxPath = require.resolve('../services/maxApi');
const delegated = [];
const maxCalls = [];

require.cache[maxPath] = {
  id: maxPath,
  filename: maxPath,
  loaded: true,
  exports: {
    answerCallback: async ({ callbackId }) => ({ ok: true, callbackId }),
    editMessage: async (payload) => { maxCalls.push({ method: 'editMessage', ...payload }); return { ok: true, message: { body: { mid: payload.messageId } } }; },
    sendMessage: async (payload) => { maxCalls.push({ method: 'sendMessage', ...payload }); return { ok: true, message: { body: { mid: `sent-${maxCalls.length}` } } }; },
    deleteMessage: async () => ({ ok: true })
  }
};

require.cache[basePath] = {
  id: basePath,
  filename: basePath,
  loaded: true,
  exports: {
    createCleanBot: (legacy) => ({
      handleWebhook: async (req, out, config) => {
        delegated.push(req.body.callback.payload);
        return legacy.handleWebhook(req, out, config);
      }
    })
  }
};

const target = require('../clean-bot-channel-first-post-picker-pr90');
const uiTrace = require('../v3-ui-trace-1539');

function callbackUpdate(payload, suffix = 'root') {
  return {
    update_type: 'message_callback',
    callback: { callback_id: `cb-${suffix}`, payload, user: { user_id: `user-${suffix}` } },
    message: {
      id: `msg-${suffix}`,
      sender: { user_id: `user-${suffix}` },
      recipient: { chat_id: `chat-${suffix}`, chat_type: 'private' },
      body: { mid: `msg-${suffix}`, text: 'menu' }
    }
  };
}

function res() {
  return {
    statusCode: 0,
    body: null,
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.headersSent = true; return payload; }
  };
}

async function dispatch(bot, payload, label) {
  const out = res();
  await bot.handleWebhook({ body: callbackUpdate(payload, label) }, out, { botToken: 'test-token' });
  assert.strictEqual(out.statusCode, 200, `${label} returns HTTP 200`);
  return out.body;
}

(async () => {
  const bot = target.createCleanBot({
    handleWebhook: async (req, out) => {
      return out.status(200).json({ ok: true, handledBy: 'legacy-root-section-contract', payload: req.body.callback.payload });
    }
  });

  const giftRoots = [
    [{ route: 'gifts:home' }, 'gifts-object-route'],
    [{ action: 'gifts:home' }, 'gifts-canonical-action'],
    [{ action: 'admin_section_gifts' }, 'gifts-legacy-root'],
    [{ action: 'gift_admin_open_menu' }, 'gifts-open-menu'],
    [{ r: 'gifts:home', action: 'ignored_action' }, 'gifts-r-root']
  ];

  uiTrace.clear();
  for (const [payload, label] of giftRoots) {
    const body = await dispatch(bot, payload, label);
    assert.strictEqual(body.handledBy, 'legacy-root-section-contract', `${label} delegates to wrapped root contract`);
  }

  const localRoots = [
    [{ route: 'buttons:home', action: 'buttons:home' }, 'buttons-canonical-root', 'buttons'],
    [{ action: 'admin_section_buttons' }, 'buttons-legacy-root', 'buttons'],
    [{ route: 'stats:home', action: 'stats:home' }, 'stats-canonical-root', 'stats'],
    [{ action: 'admin_section_stats' }, 'stats-legacy-root', 'stats']
  ];

  for (const [payload, label, flow] of localRoots) {
    const beforeDelegated = delegated.length;
    const body = await dispatch(bot, payload, label);
    assert.strictEqual(delegated.length, beforeDelegated, `${label} is not delegated to wrapped root contract`);
    assert.strictEqual(body.handledBy, target.RUNTIME, `${label} stays on clean-wrapper handler`);
    assert.strictEqual(body.flow, flow, `${label} is owned by the ${flow} clean flow`);
  }

  assert.deepStrictEqual(delegated, giftRoots.map(([payload]) => payload), 'only Gifts root callbacks are bridged before clean flow interception');
  const resolved = uiTrace.list().filter((event) => event.type === 'root_resolved');
  assert.ok(resolved.length >= giftRoots.length, 'Gifts bridge emits root_resolved traces before delegation');
  assert.ok(resolved.every((event) => event.route === 'gifts:home'), 'bridge traces are limited to Gifts roots in this regression');
  assert.ok(maxCalls.some((call) => call.method === 'editMessage'), 'local clean roots render through mocked MAX editMessage');
  assert.strictEqual(target._private.resolveRootSectionPayload({ route: 'gifts:home', action: 'gifts:home' }).resolver, 'payload.route');
  assert.strictEqual(target._private.shouldBridgeRootSectionToWrapped(target._private.resolveRootSectionPayload({ action: 'admin_section_stats' }), 'admin_section_stats', { action: 'admin_section_stats' }), false);

  console.log('PR250 clean-wrapper root bridge assertions passed');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
