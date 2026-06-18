'use strict';
const assert = require('assert');
const store = require('../store');
const buttons = require('../buttons-flow-cc8-clean');
const menu = { button: (text, action, extra = {}) => ({ type: 'callback', text, payload: { action, ...extra } }), keyboard: (rows) => ({ type: 'inline_keyboard', rows }) };
function reset() { store.store.posts = {}; store.store.channels = {}; store.store.setup = {}; store.store.setupState = {}; store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} }; store.saveStore(); }
function seed(user = 'btn-pr225') { reset(); store.setSetupState(user, { tenantKey: `tenant_${user}`, ownerUserId: user, canReadLegacyUnscoped: true }); store.saveChannel('ch-b', { channelId: 'ch-b', title: 'Buttons channel', ownerUserId: user, tenantKey: `tenant_${user}` }); store.savePost('ck-b', { commentKey: 'ck-b', channelId: 'ch-b', postId: 'post-b', originalText: 'Buttons post', ownerUserId: user, tenantKey: `tenant_${user}`, legacyButtons: [{ text: 'Legacy fresh', url: 'https://legacy.example' }] }); return user; }
function canonical(user) { return buttons.resolveSelectedButtonsContextReadOnly({ userId: user }, { commentKey: 'ck-b', channelId: 'ch-b', postId: 'post-b' }); }
(async () => {
  let user = seed('btn-065');
  await buttons.screenForPayload(menu, { action: 'button_admin_recent_posts' }, { userId: user });
  assert.strictEqual((await canonical(user)).buttons.length, 0, 'BTN-065 pre-trace/read-only route must not import legacy');
  user = seed('btn-066');
  const selected = await buttons.screenForPayload(menu, { action: 'button_admin_select_post', commentKey: 'ck-b', channelId: 'ch-b', postId: 'post-b' }, { userId: user });
  assert.ok(/Legacy fresh/.test(selected.text), 'BTN-066 selected handler imports legacy into rendered screen');
  const after = await canonical(user); assert.strictEqual(after.buttons.length, 1, 'BTN-066 canonical populated by handler');
  const edit = await buttons.screenForPayload(menu, { action: 'button_admin_edit', commentKey: 'ck-b', channelId: 'ch-b', postId: 'post-b' }, { userId: user });
  assert.ok(/Legacy fresh/.test(edit.text), 'BTN-066 edit from rendered/canonical payload works');
  user = seed('btn-067');
  const pre = await buttons.resolveSelectedButtonsContextReadOnly({ userId: user }, { commentKey: 'ck-b', channelId: 'ch-b', postId: 'post-b' });
  assert.strictEqual(pre.imported, false, 'BTN-067 read-only context never claims imported');
  assert.strictEqual((await canonical(user)).buttons.length, 0, 'BTN-067 pre-resolve cannot be the only importer');
  const actual = await buttons.screenForPayload(menu, { action: 'button_admin_show_current', commentKey: 'ck-b', channelId: 'ch-b', postId: 'post-b' }, { userId: user });
  assert.ok(/Legacy fresh/.test(actual.text), 'BTN-067 actual handler produces import and next screen');
  console.log('BTN-065 BTN-066 BTN-067 passed');
})();
