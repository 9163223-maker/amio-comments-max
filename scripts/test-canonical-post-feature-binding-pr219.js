'use strict';
const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';
function clear(paths) { paths.forEach((p) => { delete require.cache[p]; }); }
function textOf(screen) { return String(screen && screen.text || ''); }
async function harness({ messageId = 'msg-pr219', otherTenant = false, dbPostId = 'post-pr219', withButton = true } = {}) {
  const paths = ['../store','../services/postPatcher','../services/clientAccessService','../cc5-db-core','../services/maxApi','../buttons-flow-cc8-clean','../post-feature-binding'].map(require.resolve); clear(paths);
  const userId = 'admin-pr219'; const channelId = 'channel-pr219'; const postId = dbPostId; const commentKey = `${channelId}:${postId}`;
  const state = {}; const patchCalls = [];
  const posts = { [commentKey]: { tenantKey: `tenant_${userId}`, ownerUserId: userId, channelId, postId, messageId, commentKey, title: 'Тест стикеры 2', customKeyboard: withButton ? { enabled: true, rows: [{ buttons: [{ text: 'Кнопка', type: 'link', url: 'https://old.example' }] }] } : { enabled: false, rows: [] } } };
  const store = { store: { setupState: state, posts, growth: { byChannel: {} }, channels: {} }, getSetupState: (u) => state[u] || null, setSetupState: (u,p) => (state[u] = { ...(state[u] || {}), ...(p || {}) }), savePost: (k,p) => (posts[k] = { ...(posts[k] || {}), ...(p || {}) }), getPost: (k) => posts[k] || null, saveStore() {}, saveChannel() {} };
  require.cache[require.resolve('../store')] = { loaded: true, exports: store };
  require.cache[require.resolve('../services/postPatcher')] = { loaded: true, exports: { patchStoredPost: async (opts) => { patchCalls.push(opts); return { ok: true }; } } };
  require.cache[require.resolve('../services/clientAccessService')] = { loaded: true, exports: { getClientChannels: () => [{ channelId, title: 'АдминКит клуб' }] } };
  require.cache[require.resolve('../cc5-db-core')] = { loaded: true, exports: { getPosts: async (admin, channel) => admin === userId && channel === channelId ? [{ channelId, postId, messageId, commentKey, title: 'Тест стикеры 2' }] : [] } };
  require.cache[require.resolve('../services/maxApi')] = { loaded: true, exports: { getChat: async () => ({ title: 'АдминКит клуб' }) } };
  const buttons = require('../buttons-flow-cc8-clean'); const binding = require('../post-feature-binding');
  const menu = { button: (text, action, extra = {}) => ({ text, payload: { action, ...extra } }), keyboard: (rows) => rows };
  const ctx = { userId: otherTenant ? 'admin-pr219-other' : userId, config: {} };
  return { buttons, binding, menu, ctx, state, store, posts, patchCalls, userId, channelId, postId, commentKey };
}
(async () => {
  const h = await harness();
  const selected = await h.buttons.screenForPayload(h.menu, { action: 'button_admin_select_post', channelId: h.channelId, postId: h.postId, commentKey: h.commentKey }, h.ctx);
  assert(/Найдены текущие кнопки: 1/.test(textOf(selected)), 'select imports visible customKeyboard');
  assert(/Пост выбран: «Тест стикеры 2»/.test(textOf(selected)) && /Текущие кнопки \(1\):/.test(textOf(selected)) && /1\. Кнопка/.test(textOf(selected)), 'select immediately renders existing button state');
  const current = await h.buttons.screenForPayload(h.menu, { action: 'button_admin_show_current' }, h.ctx);
  assert(/1\. Кнопка/.test(textOf(current)), 'current shows existing button from canonical post');
  const addScreen = await h.buttons.screenForPayload(h.menu, { action: 'button_admin_start_add', cardId: h.state[h.userId].buttonsCurrentCard.cardId }, h.ctx);
  assert(/У этого поста уже есть 1 кнопка/.test(textOf(addScreen)) && /Новая кнопка будет добавлена к существующим/.test(textOf(addScreen)) && /Введите текст новой кнопки/.test(textOf(addScreen)) && /1\. Кнопка/.test(textOf(addScreen)), 'add screen summarizes existing buttons before text entry');
  await h.buttons.handleTextInput(h.menu, { ...h.ctx, text: 'Кнопка2' });
  const preview = await h.buttons.handleTextInput(h.menu, { ...h.ctx, text: 'https://sports.ru' });
  const flowId = preview.attachments[0][0].payload.flowId;
  const saved = await h.buttons.screenForPayload(h.menu, { action: 'button_admin_save', flowId }, h.ctx);
  assert(/Кнопка сохранена/.test(textOf(saved)), 'save succeeds');
  assert(/1\. Кнопка/.test(textOf(saved)) && /2\. Кнопка2/.test(textOf(saved)), 'save preserves existing and appends new button');
  assert.strictEqual(h.patchCalls.length, 1, 'patch called once');
  assert.strictEqual(h.store.getPost(h.commentKey).messageId, 'msg-pr219', 'canonical message id retained for patcher');
  const repeat = await h.buttons.screenForPayload(h.menu, { action: 'button_admin_save', flowId }, h.ctx);
  assert(/уже сохранена|предпросмотр закрыт/i.test(textOf(repeat)), 'repeated save is idempotent/stale-safe');

  const missing = await harness({ messageId: '' });
  await missing.buttons.screenForPayload(missing.menu, { action: 'button_admin_select_post', channelId: missing.channelId, postId: missing.postId, commentKey: missing.commentKey }, missing.ctx);
  await missing.buttons.screenForPayload(missing.menu, { action: 'button_admin_start_add', cardId: missing.state[missing.userId].buttonsCurrentCard.cardId }, missing.ctx);
  await missing.buttons.handleTextInput(missing.menu, { ...missing.ctx, text: 'Кнопка2' });
  const mp = await missing.buttons.handleTextInput(missing.menu, { ...missing.ctx, text: 'https://sports.ru' });
  const ms = await missing.buttons.screenForPayload(missing.menu, { action: 'button_admin_save', flowId: mp.attachments[0][0].payload.flowId }, missing.ctx);
  assert(/message_id_missing/.test(textOf(ms)), 'non-message postId without explicit messageId is not blindly used for patching');
  assert.strictEqual(missing.patchCalls.length, 0, 'non-message postId does not call patcher without explicit messageId');

  const empty = await harness({ withButton: false, dbPostId: 'post-empty-pr220' });
  const emptySelected = await empty.buttons.screenForPayload(empty.menu, { action: 'button_admin_select_post', channelId: empty.channelId, postId: empty.postId, commentKey: empty.commentKey }, empty.ctx);
  assert(/Кнопок пока нет|пока нет кнопок/.test(textOf(emptySelected)), 'empty post shows clear empty state');
  assert(!/1\. Кнопка/.test(textOf(emptySelected)), 'empty post does not show stale button from another post');

  const iso = await harness({ otherTenant: true });
  const denied = await iso.buttons.screenForPayload(iso.menu, { action: 'button_admin_show_current', channelId: iso.channelId, postId: iso.postId, commentKey: iso.commentKey }, iso.ctx);
  assert(!/Кнопка/.test(textOf(denied)), 'other tenant cannot read selected post buttons');
  assert.deepStrictEqual(iso.binding.giftsParityContract().requiredBinding.includes('commentKey'), true, 'gifts parity contract uses canonical post identity');
  console.log('test-canonical-post-feature-binding-pr219 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
