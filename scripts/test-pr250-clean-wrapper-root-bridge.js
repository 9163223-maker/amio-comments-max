'use strict';

const assert = require('assert');
const basePath = require.resolve('../clean-bot-channel-fast-pr84');
const maxPath = require.resolve('../services/maxApi');
const delegated = [];
const rendered = [];

require.cache[maxPath] = {
  id: maxPath,
  filename: maxPath,
  loaded: true,
  exports: {
    editMessage: async ({ messageId, text, attachments }) => {
      rendered.push({ method: 'editMessage', messageId, text, attachments });
      return { ok: true, message: { id: messageId, body: { mid: messageId } } };
    },
    sendMessage: async ({ text, attachments }) => {
      rendered.push({ method: 'sendMessage', text, attachments });
      return { ok: true, message: { id: `sent-${rendered.length}`, body: { mid: `sent-${rendered.length}` } } };
    },
    answerCallback: async () => ({ ok: true })
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

async function invoke(bot, payload, label) {
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
    [{ action: 'gift_admin_open_menu' }, 'gifts-open-menu']
  ];
  const statsRoots = [
    [{ route: 'stats:home', action: 'stats:home' }, 'stats-canonical-route'],
    [{ action: 'admin_section_stats' }, 'stats-legacy-root']
  ];
  const buttonsRoots = [
    [{ route: 'buttons:home', action: 'buttons:home' }, 'buttons-canonical-route'],
    [{ action: 'admin_section_buttons' }, 'buttons-legacy-root']
  ];

  uiTrace.clear();
  for (const [payload, label] of giftRoots) {
    const body = await invoke(bot, payload, label);
    assert.strictEqual(body.handledBy, 'legacy-root-section-contract', `${label} delegates to wrapped root contract`);
  }

  for (const [payload, label] of statsRoots) {
    const body = await invoke(bot, payload, label);
    assert.notStrictEqual(body.handledBy, 'legacy-root-section-contract', `${label} stays on stats clean path`);
    assert.strictEqual(body.flow, 'stats', `${label} is handled by stats clean flow`);
  }

  for (const [payload, label] of buttonsRoots) {
    const body = await invoke(bot, payload, label);
    assert.notStrictEqual(body.handledBy, 'legacy-root-section-contract', `${label} stays on buttons clean path`);
    assert.strictEqual(body.flow, 'buttons', `${label} is handled by buttons clean flow`);
  }

  assert.deepStrictEqual(delegated, giftRoots.map(([payload]) => payload), 'only Gifts root callbacks are delegated by the bridge');
  const resolved = uiTrace.list().filter((event) => event.type === 'root_resolved');
  assert.ok(resolved.every((event) => event.route === 'gifts:home'), 'bridge trace is emitted only for delegated Gifts roots');
  assert.ok(rendered.length >= statsRoots.length + buttonsRoots.length, 'stats/buttons roots render through local clean handlers');
  assert.strictEqual(target._private.resolveRootSectionPayload({ route: 'gifts:home', action: 'gifts:home' }).resolver, 'payload.route');
  assert.strictEqual(target._private.shouldBridgeRootSectionToWrapped({ ok: true, route: 'stats:home' }, 'stats:home', { action: 'stats:home' }), false);
  assert.strictEqual(target._private.shouldBridgeRootSectionToWrapped({ ok: true, route: 'gifts:home' }, 'gift_admin_open_menu', { action: 'gift_admin_open_menu' }), true);

  console.log('PR250 clean-wrapper root bridge assertions passed');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
