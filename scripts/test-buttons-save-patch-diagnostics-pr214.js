'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

async function scenario(result, expectedText) {
  const paths = ['../store','../services/postPatcher','../services/clientAccessService','../cc5-db-core','../services/maxApi','../buttons-flow-cc8-clean','../tenant-scope'].map(require.resolve);
  paths.forEach((p) => { delete require.cache[p]; });
  const USER_ID = `pr214-${String(result.reason || result.error?.message || 'ok').replace(/\W/g, '-')}`;
  const CHANNEL_ID = 'pr214-channel';
  const COMMENT_KEY = `pr214-comment-${USER_ID}`;
  const POST_ID = 'pr214-post';
  const state = {};
  const posts = { [COMMENT_KEY]: { tenantKey: `tenant_${USER_ID}`, ownerUserId: USER_ID, channelId: CHANNEL_ID, channelTitle: 'PR214 Channel', postId: POST_ID, messageId: 'pr214-message', commentKey: COMMENT_KEY, originalText: 'PR214 post' } };
  const store = { store: { setupState: state, posts, growth: { byChannel: {} }, channels: {} }, getSetupState: (u) => state[u] || null, setSetupState(u, patch) { state[u] = { ...(state[u] || {}), ...(patch || {}) }; return state[u]; }, savePost(k, patch) { posts[k] = { ...(posts[k] || {}), ...(patch || {}) }; return posts[k]; }, getPost: (k) => posts[k] || null, saveStore() {}, saveChannel() {} };
  require.cache[paths[0]] = { exports: store };
  require.cache[paths[1]] = { exports: { patchStoredPost: async () => result } };
  require.cache[paths[2]] = { exports: { getClientChannels: () => [{ channelId: CHANNEL_ID, title: 'PR214 Channel' }] } };
  require.cache[paths[3]] = { exports: { getPosts: async () => [] } };
  require.cache[paths[4]] = { exports: { getChat: async () => ({ title: 'PR214 Channel' }) } };
  const buttons = require('../buttons-flow-cc8-clean');
  const menu = { button: (text, action, extra = {}) => ({ text, payload: { action, ...extra } }), keyboard: (rows) => rows };
  const ctx = { userId: USER_ID, config: {} };
  await buttons.screenForPayload(menu, { action: 'button_admin_select_post', commentKey: COMMENT_KEY, channelId: CHANNEL_ID, postId: POST_ID }, ctx);
  await buttons.screenForPayload(menu, { action: 'button_admin_start_add', cardId: state[USER_ID].buttonsCurrentCard.cardId }, ctx);
  await buttons.handleTextInput(menu, { ...ctx, text: 'Кнопка' });
  const preview = await buttons.handleTextInput(menu, { ...ctx, text: 'http://sports.ru' });
  const flowId = preview.attachments[0][0].payload.flowId;
  const saved = await buttons.screenForPayload(menu, { action: 'button_admin_save', flowId }, ctx);
  assert(new RegExp(expectedText).test(String(saved.text)), `expected UI diagnostic ${expectedText}, got ${saved.text}`);
  assert.strictEqual(store.store.growth.byChannel[CHANNEL_ID].buttonSets[COMMENT_KEY].length, 1, 'button remains saved');
  if (!result.ok) assert(state[USER_ID].lastButtonPatchError, 'state stores lastPatchError');
}

(async () => {
  await scenario({ ok: false, reason: 'message_id_missing' }, 'Кнопка сохранена, но пост не обновился: message_id_missing');
  await scenario({ ok: false, error: { status: 500, message: 'MAX editMessage failed' } }, 'Кнопка сохранена, но пост не обновился: MAX editMessage failed \\(status 500\\)');
  console.log('test-buttons-save-patch-diagnostics-pr214 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
