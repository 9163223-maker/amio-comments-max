'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

const storePath = require.resolve('../store');
const patcherPath = require.resolve('../services/postPatcher');
const accessPath = require.resolve('../services/clientAccessService');
const dbPath = require.resolve('../cc5-db-core');
const maxPath = require.resolve('../services/maxApi');
const buttonsPath = require.resolve('../buttons-flow-cc8-clean');
[storePath, patcherPath, accessPath, dbPath, maxPath, buttonsPath, require.resolve('../tenant-scope')].forEach((p) => { delete require.cache[p]; });

const USER_ID = 'pr212-user';
const CHANNEL_ID = 'pr212-channel';
const COMMENT_KEY = 'pr212-comment';
const POST_ID = 'pr212-post';
const state = {};
const patches = [];
const posts = {
  [COMMENT_KEY]: {
    tenantKey: `tenant_${USER_ID}`,
    ownerUserId: USER_ID,
    channelId: CHANNEL_ID,
    channelTitle: 'PR212 Channel',
    postId: POST_ID,
    messageId: 'pr212-message',
    commentKey: COMMENT_KEY,
    originalText: 'PR212 post'
  }
};
const store = {
  store: { setupState: state, posts, growth: { byChannel: {} }, channels: {} },
  getSetupState(userId) { return state[userId] || null; },
  setSetupState(userId, patch) { state[userId] = { ...(state[userId] || {}), ...(patch || {}) }; patches.push({ userId, patch }); return state[userId]; },
  savePost(key, patch) { posts[key] = { ...(posts[key] || {}), ...(patch || {}) }; return posts[key]; },
  getPost(key) { return posts[key] || null; },
  saveStore() {},
  saveChannel() {}
};
require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: store };
require.cache[patcherPath] = { id: patcherPath, filename: patcherPath, loaded: true, exports: { patchStoredPost: async () => ({ ok: true }) } };
require.cache[accessPath] = { id: accessPath, filename: accessPath, loaded: true, exports: { getClientChannels: () => [{ channelId: CHANNEL_ID, title: 'PR212 Channel' }] } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getPosts: async () => [] } };
require.cache[maxPath] = { id: maxPath, filename: maxPath, loaded: true, exports: { getChat: async () => ({ title: 'PR212 Channel' }) } };

const buttons = require('../buttons-flow-cc8-clean');
const menu = {
  button: (text, action, extra = {}) => ({ text, payload: { action, ...extra } }),
  keyboard: (rows) => rows
};
function textOf(screen) { return String(screen && screen.text || ''); }

(async () => {
  const selected = await buttons.screenForPayload(menu, { action: 'button_admin_select_post', commentKey: COMMENT_KEY, channelId: CHANNEL_ID, postId: POST_ID }, { userId: USER_ID, config: {} });
  assert(/Пост для кнопок выбран/.test(textOf(selected)), 'post selection is visible');
  const cardId = state[USER_ID].buttonsCurrentCard.cardId;

  const step1 = await buttons.screenForPayload(menu, { action: 'button_admin_start_add', cardId }, { userId: USER_ID, config: {} });
  assert(/Шаг 1\/3/.test(textOf(step1)), 'start add opens step 1');
  const step2 = await buttons.handleTextInput(menu, { userId: USER_ID, text: 'Кнопка', config: {} });
  assert(/Шаг 2\/3/.test(textOf(step2)), 'button text opens step 2');
  const step3 = await buttons.handleTextInput(menu, { userId: USER_ID, text: 'Http://olga.style', config: {} });
  assert(/Предпросмотр кнопки/.test(textOf(step3)), 'URL opens preview');
  assert(/Сохранить кнопку/.test(JSON.stringify(step3.attachments)), 'preview has save callback button');

  const saved = await buttons.screenForPayload(menu, { action: 'button_admin_save' }, { userId: USER_ID, config: {} });
  const savedText = textOf(saved);
  assert(/Кнопка сохранена/.test(savedText), 'save shows visible confirmation');
  assert(/Канал: PR212 Channel/.test(savedText), 'save keeps selected channel visible');
  assert(/Пост: PR212 post/.test(savedText), 'save keeps selected post visible');
  assert(/1\. Кнопка → http:\/\/olga\.style/.test(savedText), 'save screen shows saved button');
  assert(/Добавить ещё кнопку/.test(JSON.stringify(saved.attachments)), 'save screen offers add another');
  assert(/Текущие кнопки/.test(JSON.stringify(saved.attachments)), 'save screen offers current buttons');
  assert(/Выбрать другой пост/.test(JSON.stringify(saved.attachments)), 'save screen offers another post picker');
  assert(/Главное меню/.test(JSON.stringify(saved.attachments)), 'save screen offers main menu');

  const bucket = store.store.growth.byChannel[CHANNEL_ID].buttonSets[COMMENT_KEY];
  assert(Array.isArray(bucket) && bucket.length === 1, 'store has one button set for exact target.commentKey');
  assert.strictEqual(bucket[0].tenantKey, `tenant_${USER_ID}`);
  assert.strictEqual(bucket[0].channelId, CHANNEL_ID);
  assert.strictEqual(bucket[0].commentKey, COMMENT_KEY);
  assert.deepStrictEqual(bucket[0].postIds, [POST_ID]);

  const current = await buttons.screenForPayload(menu, { action: 'button_admin_show_current' }, { userId: USER_ID, config: {} });
  assert(/Текущие кнопки/.test(textOf(current)), 'current buttons opens');
  assert(/1\. Кнопка → http:\/\/olga\.style/.test(textOf(current)), 'current buttons shows saved button');

  const routeSteps = (state[USER_ID].buttonSaveRouteTrace || []).map((entry) => entry.step);
  assert.deepStrictEqual(routeSteps.slice(-3), ['screenForPayload', 'confirmSave', 'saveDraft'], 'button_admin_save routes through screenForPayload -> confirmSave -> saveDraft');
  assert.strictEqual(state[USER_ID].buttonTargetPost.commentKey, COMMENT_KEY, 'selected target remains stored after save');
  assert.notStrictEqual(state[USER_ID].buttonsActiveScreenId, 'buttons_clean_channel_picker', 'old picker is not the active saved UI');

  console.log('test-buttons-preview-save-current-target-pr212 ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
