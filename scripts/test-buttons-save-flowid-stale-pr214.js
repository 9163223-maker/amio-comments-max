'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

function clearModules(paths) { paths.forEach((p) => { delete require.cache[p]; }); }
function textOf(screen) { return String(screen && screen.text || ''); }

async function makeHarness(name = 'ok') {
  const paths = {
    store: require.resolve('../store'),
    patcher: require.resolve('../services/postPatcher'),
    access: require.resolve('../services/clientAccessService'),
    db: require.resolve('../cc5-db-core'),
    max: require.resolve('../services/maxApi'),
    buttons: require.resolve('../buttons-flow-cc8-clean'),
    tenant: require.resolve('../tenant-scope')
  };
  clearModules(Object.values(paths));
  const userId = `pr214-flowid-${name}`;
  const channelId = `pr214-flowid-channel-${name}`;
  const commentKey = `pr214-flowid-comment-${name}`;
  const postId = `pr214-flowid-post-${name}`;
  const state = {};
  const patchCalls = [];
  const posts = { [commentKey]: { tenantKey: `tenant_${userId}`, ownerUserId: userId, channelId, channelTitle: 'PR214 FlowId Channel', postId, messageId: `message-${name}`, commentKey, originalText: 'PR214 flowId post' } };
  const store = {
    store: { setupState: state, posts, growth: { byChannel: {} }, channels: {} },
    getSetupState(user) { return state[user] || null; },
    setSetupState(user, patch) { state[user] = { ...(state[user] || {}), ...(patch || {}) }; return state[user]; },
    savePost(key, patch) { posts[key] = { ...(posts[key] || {}), ...(patch || {}) }; return posts[key]; },
    getPost(key) { return posts[key] || null; },
    saveStore() {},
    saveChannel() {}
  };
  require.cache[paths.store] = { id: paths.store, filename: paths.store, loaded: true, exports: store };
  require.cache[paths.patcher] = { id: paths.patcher, filename: paths.patcher, loaded: true, exports: { patchStoredPost: async (opts = {}) => { patchCalls.push(opts); return { ok: true, customRowsCount: 1 }; } } };
  require.cache[paths.access] = { id: paths.access, filename: paths.access, loaded: true, exports: { getClientChannels: () => [{ channelId, title: 'PR214 FlowId Channel' }] } };
  require.cache[paths.db] = { id: paths.db, filename: paths.db, loaded: true, exports: { getPosts: async () => [] } };
  require.cache[paths.max] = { id: paths.max, filename: paths.max, loaded: true, exports: { getChat: async () => ({ title: 'PR214 FlowId Channel' }) } };
  const buttons = require('../buttons-flow-cc8-clean');
  const menu = { button: (text, action, extra = {}) => ({ text, payload: { action, ...extra } }), keyboard: (rows) => rows };
  const ctx = { userId, config: {} };
  await buttons.screenForPayload(menu, { action: 'button_admin_select_post', commentKey, channelId, postId }, ctx);
  await buttons.screenForPayload(menu, { action: 'button_admin_start_add', cardId: state[userId].buttonsCurrentCard.cardId }, ctx);
  await buttons.handleTextInput(menu, { ...ctx, text: 'Кнопка' });
  const preview = await buttons.handleTextInput(menu, { ...ctx, text: 'http://sports.ru' });
  const flowId = preview.attachments[0][0].payload.flowId;
  assert(flowId, 'active flow preview contains flowId');
  return { buttons, menu, ctx, state, userId, channelId, commentKey, patchCalls, flowId, store };
}

(async () => {
  const current = await makeHarness('current');
  const saved = await current.buttons.screenForPayload(current.menu, { action: 'button_admin_save', flowId: current.flowId }, current.ctx);
  assert(/Кнопка сохранена/.test(textOf(saved)), 'correct current preview save succeeds');
  assert.strictEqual(current.patchCalls.length, 1, 'correct current preview calls postPatcher once');
  assert.strictEqual(current.store.store.growth.byChannel[current.channelId].buttonSets[current.commentKey].length, 1, 'correct current preview saves button');

  const omitted = await makeHarness('omitted');
  const oldPreview = await omitted.buttons.screenForPayload(omitted.menu, { action: 'button_admin_save' }, omitted.ctx);
  assert(/предпросмотр устарел/.test(textOf(oldPreview)), 'omitted flowId save is rejected as stale');
  assert.strictEqual(omitted.patchCalls.length, 0, 'omitted flowId does not call postPatcher');
  assert(!omitted.store.store.growth.byChannel[omitted.channelId], 'omitted flowId saves no new button');

  const mismatched = await makeHarness('mismatched');
  const wrongPreview = await mismatched.buttons.screenForPayload(mismatched.menu, { action: 'button_admin_save', flowId: `${mismatched.flowId}-old` }, mismatched.ctx);
  assert(/предпросмотр устарел/.test(textOf(wrongPreview)), 'mismatched flowId save is rejected as stale');
  assert.strictEqual(mismatched.patchCalls.length, 0, 'mismatched flowId does not call postPatcher');
  assert.strictEqual(mismatched.state[mismatched.userId].buttonTargetPost.commentKey, mismatched.commentKey, 'mismatched flowId preserves selected target');

  console.log('test-buttons-save-flowid-stale-pr214 ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
