'use strict';

const assert = require('assert');
const store = require('../store');
const flow = require('../buttons-flow-cc8-clean');

const menu = {
  button(text, action, extra = {}) { return { type: 'callback', text, payload: { action, ...extra } }; },
  keyboard(rows) { return { type: 'inline_keyboard', rows }; }
};
function flat(screen) { return (screen.attachments?.rows || []).flat(); }
function labels(screen) { return flat(screen).map((b) => b.text); }
function actionButton(screen, action) { return flat(screen).find((b) => b.payload?.action === action); }
async function route(userId, action, extra = {}) { return flow.screenForPayload(menu, { action, ...extra }, { userId, config: {} }); }
async function text(userId, value) { return flow.handleTextInput(menu, { userId, text: value, config: {} }); }
function reset() { store.replaceStoreInPlace({ posts: {}, comments: {}, likes: {}, reactions: {}, setup: {}, growth: { byChannel: {} }, channels: {} }); }
function seed(userId = 'pr221-admin', withButton = true) {
  store.saveChannel('-100221', { channelId: '-100221', title: 'Реальный канал PR221', channelTitle: 'Реальный канал PR221' });
  store.savePost('-100221:42', { commentKey: '-100221:42', channelId: '-100221', postId: '42', messageId: '42', title: 'Тест стикеры 2', originalText: 'Тест стикеры 2', ownerUserId: userId, tenantKey: `tenant_${userId}`, customKeyboard: null });
  return route(userId, 'button_admin_select_post', { commentKey: '-100221:42', channelId: '-100221', postId: '42' }).then(async (screen) => {
    if (withButton) {
      await route(userId, 'button_admin_start_add', { cardId: actionButton(screen, 'button_admin_start_add').payload.cardId });
      await text(userId, 'Кнопка22');
      await text(userId, 'http://olga.style');
      await route(userId, 'button_admin_save', { flowId: store.getSetupState(userId).buttonFlow.flowId, commentKey: '-100221:42', channelId: '-100221', postId: '42' });
      screen = await route(userId, 'button_admin_show_current');
    }
    return screen;
  });
}

(async () => {
  reset();
  const one = await seed('pr221-one', true);
  assert(!labels(one).includes('📋 Текущие кнопки'), 'selected post must not render Current buttons action');
  assert(one.text.includes('Кнопка22 → http://olga.style'), 'selected state shows existing button');
  assert(one.text.includes('Канал: Реальный канал PR221'), 'channel title comes from registry, not post title');
  assert(!one.text.includes('Канал: Тест стикеры 2'), 'channel title must not be post title');
  assert(labels(one).includes('➕ Добавить ещё кнопку'), 'one button shows add another');
  assert(labels(one).includes('✏️ Изменить кнопку'), 'one button shows edit');
  assert(labels(one).includes('🗑 Удалить кнопку'), 'one button shows delete');

  const old = await route('pr221-one', 'button_admin_show_current');
  assert.strictEqual(old.id, 'buttons_clean_selected_post', 'old show_current redirects to selected-post state');
  assert(old.text.includes('Кнопка22 → http://olga.style'), 'old show_current uses canonical selected state with button');

  const edit = await route('pr221-one', 'button_admin_edit', actionButton(old, 'button_admin_edit').payload);
  assert(actionButton(edit, 'button_admin_edit_text') && actionButton(edit, 'button_admin_edit_url'), 'edit opens edit actions');
  await route('pr221-one', 'button_admin_edit_text', actionButton(edit, 'button_admin_edit_text').payload);
  const editedText = await text('pr221-one', 'Кнопка23');
  assert(editedText.text.includes('Кнопка23 → http://olga.style'), 'edit text updates canonical state');
  const edit2 = await route('pr221-one', 'button_admin_edit', actionButton(editedText, 'button_admin_edit').payload);
  await route('pr221-one', 'button_admin_edit_url', actionButton(edit2, 'button_admin_edit_url').payload);
  const editedUrl = await text('pr221-one', 'https://example.com/new');
  assert(editedUrl.text.includes('Кнопка23 → https://example.com/new'), 'edit URL updates canonical state');

  const delConfirm = await route('pr221-one', 'button_admin_delete_confirm', actionButton(editedUrl, 'button_admin_delete_confirm').payload);
  assert(delConfirm.text.includes('Подтвердите удаление'), 'delete requires confirmation');
  const deleted = await route('pr221-one', 'button_admin_delete', actionButton(delConfirm, 'button_admin_delete').payload);
  assert(deleted.text.includes('Текущие кнопки: пока нет кнопок'), 'delete updates selected state to empty');

  reset();
  const empty = await seed('pr221-empty', false);
  assert(empty.text.includes('Текущие кнопки: пока нет кнопок'), 'no-button selected state says no buttons');
  assert.deepStrictEqual(labels(empty), ['➕ Добавить кнопку', '📌 Выбрать другой пост', '🏠 Главное меню'], 'no-button selected actions are add/choose/main only');

  const addScreen = await route('pr221-empty', 'button_admin_start_add', actionButton(empty, 'button_admin_start_add').payload);
  assert(addScreen.text.includes('У этого поста пока нет кнопок'), 'add flow preserves empty summary');

  reset();
  const tenantA = await seed('pr221-tenant-a', true);
  const tenantB = await seed('pr221-tenant-b', false);
  assert(tenantA.text.includes('Кнопка22'), 'tenant A sees own button');
  assert(!tenantB.text.includes('Кнопка22'), 'tenant isolation prevents tenant B seeing tenant A button');

  console.log('PR221 buttons product-perfect actions tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
