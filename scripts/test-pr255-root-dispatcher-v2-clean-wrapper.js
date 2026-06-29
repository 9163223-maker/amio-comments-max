'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';

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
function res() { return { statusCode: 0, body: null, headersSent: false, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; this.headersSent = true; return payload; } }; }
async function dispatch(bot, payload, label) { const out = res(); await bot.handleWebhook({ body: callbackUpdate(payload, label) }, out, { botToken: 'test-token' }); assert.strictEqual(out.statusCode, 200, `${label} returns HTTP 200`); return out.body; }

(async () => {
  const bot = target.createCleanBot({
    handleWebhook: async (req, out) => out.status(200).json({ ok: true, handledBy: 'RootSectionDispatcherV2', payload: req.body.callback.payload })
  });

  const roots = [
    [{ route: 'main:home' }, 'main-route'],
    [{ route: 'channels:home' }, 'channels-route'],
    [{ route: 'comments:home' }, 'comments-route'],
    [{ route: 'gifts:home' }, 'gifts-route'],
    [{ route: 'buttons:home' }, 'buttons-route'],
    [{ route: 'stats:home' }, 'stats-route'],
    [{ route: 'push:home' }, 'push-route'],
    [{ route: 'ad_links:home' }, 'ad-links-route'],
    [{ route: 'polls:home' }, 'polls-route'],
    [{ route: 'highlights:home' }, 'highlights-route'],
    [{ route: 'editor:home' }, 'editor-route'],
    [{ route: 'archive:home' }, 'archive-route'],
    [{ route: 'account:home' }, 'account-route'],
    [{ route: 'settings:home' }, 'settings-route'],
    [{ action: 'admin_section_gifts' }, 'gifts-legacy'],
    [{ action: 'gift_admin_open_menu' }, 'gifts-open-menu'],
    [{ action: 'admin_section_buttons' }, 'buttons-legacy'],
    [{ action: 'admin_section_stats' }, 'stats-legacy'],
    [{ action: 'admin_section_archive' }, 'archive-legacy'],
    [{ action: 'admin_section_posts' }, 'posts-legacy']
  ];

  uiTrace.clear();
  for (const [payload, label] of roots) {
    const body = await dispatch(bot, payload, label);
    assert.strictEqual(body.handledBy, 'RootSectionDispatcherV2', `${label} delegates to wrapped dispatcher contract`);
  }

  assert.deepStrictEqual(delegated, roots.map(([payload]) => payload), 'clean wrapper delegates all root callbacks to the wrapped RootSectionDispatcher v2 path');
  const traces = uiTrace.list().filter((event) => event.type === 'root_resolved');
  assert.ok(traces.length >= roots.length, 'clean wrapper emits root_resolved traces before delegation');
  assert.ok(traces.every((event) => event.source === 'RootSectionDispatcherV2.clean-wrapper'), 'clean wrapper trace source identifies RootSectionDispatcher v2, not a Gifts bridge');
  assert.strictEqual(target._private.shouldBridgeRootSectionToWrapped(target._private.resolveRootSectionPayload({ action: 'admin_section_stats' }), 'admin_section_stats', { action: 'admin_section_stats' }), true);

  console.log('PR255 RootSectionDispatcher v2 clean-wrapper assertions passed');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
