'use strict';

const assert = require('assert');
const basePath = require.resolve('../clean-bot-channel-fast-pr84');
const delegated = [];
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

(async () => {
  const bot = target.createCleanBot({
    handleWebhook: async (req, out) => {
      return out.status(200).json({ ok: true, handledBy: 'legacy-root-section-contract', payload: req.body.callback.payload });
    }
  });

  const roots = [
    [{ route: 'gifts:home', action: 'gifts:home' }, 'gifts-object-route'],
    [{ route: 'buttons:home', action: 'buttons:home' }, 'buttons-adjacent-root'],
    [{ route: 'stats:home', action: 'stats:home' }, 'stats-adjacent-root'],
    [{ r: 'main:home', action: 'ignored_action' }, 'main-r-root'],
    [{ action: 'admin_section_gifts' }, 'gifts-legacy-root']
  ];

  uiTrace.clear();
  for (const [payload, label] of roots) {
    const out = res();
    await bot.handleWebhook({ body: callbackUpdate(payload, label) }, out, { botToken: 'test-token' });
    assert.strictEqual(out.statusCode, 200, `${label} returns HTTP 200`);
    assert.strictEqual(out.body.handledBy, 'legacy-root-section-contract', `${label} delegates to wrapped root contract`);
  }

  assert.deepStrictEqual(delegated, roots.map(([payload]) => payload), 'all root callbacks are delegated before clean flow interception');
  const resolved = uiTrace.list().filter((event) => event.type === 'root_resolved');
  for (const route of ['gifts:home', 'buttons:home', 'stats:home', 'main:home']) {
    assert.ok(resolved.some((event) => event.route === route), `${route} emits root_resolved production-path trace before delegation`);
  }
  assert.strictEqual(target._private.resolveRootSectionPayload({ route: 'gifts:home', action: 'gifts:home' }).resolver, 'payload.route');

  console.log('PR250 clean-wrapper root bridge assertions passed');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
