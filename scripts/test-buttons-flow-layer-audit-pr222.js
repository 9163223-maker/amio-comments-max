'use strict';

const assert = require('assert');
const store = require('../store');
const flow = require('../buttons-flow-cc8-clean');
const gifts = require('../gifts-flow-cc812-bottom');

const menu = {
  button(text, action, extra = {}) { return { type: 'callback', text, payload: { action, ...extra } }; },
  keyboard(rows) { return { type: 'inline_keyboard', rows }; }
};
function rows(screen) { return screen.attachments?.rows || screen.attachments?.payload?.buttons || []; }
function flat(screen) { return rows(screen).flat(); }
function labels(screen) { return flat(screen).map((b) => b.text); }
function actionButton(screen, action) { return flat(screen).find((b) => b.payload?.action === action); }
function hasButtonsRoot(screen) { return labels(screen).some((label) => /В начало кнопок|В раздел «Кнопки»/.test(label)); }
async function route(userId, action, extra = {}) { return flow.screenForPayload(menu, { action, ...extra }, { userId, config: {} }); }
async function text(userId, value) { return flow.handleTextInput(menu, { userId, text: value, config: {} }); }
function reset() { store.replaceStoreInPlace({ posts: {}, comments: {}, likes: {}, reactions: {}, setup: {}, growth: { byChannel: {} }, channels: {} }); }
async function seed(userId, buttons = ['Кнопка22']) {
  store.saveChannel('-100222', { channelId: '-100222', title: 'АдминКит клуб', channelTitle: 'АдминКит клуб' });
  store.savePost(`-100222:${userId}`, { commentKey: `-100222:${userId}`, channelId: '-100222', postId: userId, messageId: userId, title: 'Тест стикеры 2', originalText: 'Тест стикеры 2', ownerUserId: userId, tenantKey: `tenant_${userId}` });
  let screen = await route(userId, 'button_admin_select_post', { commentKey: `-100222:${userId}`, channelId: '-100222', postId: userId });
  for (const label of buttons) {
    await route(userId, 'button_admin_start_add', actionButton(screen, 'button_admin_start_add').payload);
    await text(userId, label);
    const preview = await text(userId, `http://example.com/${label}`);
    screen = await route(userId, 'button_admin_save', actionButton(preview, 'button_admin_save').payload);
  }
  return route(userId, 'button_admin_show_current');
}

(async () => {
  reset();
  const one = await seed('one', ['Кнопка22']);
  assert(one.text.includes('Кнопка22 → http://example.com/Кнопка22'));
  assert(labels(one).includes('➕ Добавить ещё кнопку'));
  assert(labels(one).includes('✏️ Изменить кнопку'));
  assert(labels(one).includes('🗑 Удалить кнопку'));
  assert(hasButtonsRoot(one), 'selected screen has section-root nav');

  const stalePayload = { cardId: 'stale-card-id', buttonId: 'stale-button-id' };
  const edit = await route('one', 'button_admin_edit', stalePayload);
  assert(edit.text.includes('Кнопка: Кнопка22'), 'stale card/button with one button resolves canonical current button');
  assert(!edit.text.includes('Кнопка для изменения не найдена.'));
  assert(hasButtonsRoot(edit), 'edit actions has section-root nav');

  const deleteConfirm = await route('one', 'button_admin_delete_confirm', stalePayload);
  assert(deleteConfirm.text.includes('Подтвердите удаление.'), 'stale delete opens confirmation for one canonical button');
  assert(!deleteConfirm.text.includes('Кнопка для удаления не найдена.'));
  assert(hasButtonsRoot(deleteConfirm), 'delete confirm has section-root nav');

  await route('one', 'button_admin_edit_text', actionButton(edit, 'button_admin_edit_text').payload);
  const editedText = await text('one', 'Кнопка23');
  assert(editedText.text.includes('Кнопка23 → http://example.com/Кнопка22'));
  assert(!editedText.text.includes('Текущие кнопки: пока нет кнопок'));
  await route('one', 'button_admin_edit_url', actionButton(await route('one', 'button_admin_edit'), 'button_admin_edit_url').payload);
  const editedUrl = await text('one', 'https://olga.style');
  assert(editedUrl.text.includes('Кнопка23 → https://olga.style'));

  const legacy = await route('one', 'button_admin_show_current');
  assert(legacy.text.includes('Кнопка23 → https://olga.style'), 'legacy show_current uses same canonical loader');

  reset();
  const multi = await seed('multi', ['Первая', 'Вторая']);
  const multiEdit = await route('multi', 'button_admin_edit', { buttonId: 'missing' });
  assert.strictEqual(multiEdit.id, 'buttons_clean_edit_pick');
  assert(multiEdit.text.includes('Какую кнопку изменить?'));
  const multiDelete = await route('multi', 'button_admin_delete_confirm', { buttonId: 'missing' });
  assert.strictEqual(multiDelete.id, 'buttons_clean_delete_pick');
  assert(multiDelete.text.includes('Какую кнопку удалить?'));

  const pickForDelete = await route('multi', 'button_admin_delete_confirm', actionButton(multi, 'button_admin_delete_confirm').payload);
  const deleteOne = await route('multi', 'button_admin_delete_confirm', flat(pickForDelete).find((b) => b.payload?.buttonId).payload);
  const afterDelete = await route('multi', 'button_admin_delete', actionButton(deleteOne, 'button_admin_delete').payload);
  assert(afterDelete.text.includes('Текущие кнопки (1):'));

  reset();
  const tenantA = await seed('tenant-a', ['A']);
  const tenantB = await seed('tenant-b', []);
  assert(tenantA.text.includes('A →'));
  assert(!tenantB.text.includes('A →'), 'tenant isolation remains');

  assert.strictEqual(gifts.GIFTS_FLOW_AUDIT_PR222.fullyCanonical, true, 'gifts audit records PR225 canonical migration complete');
  console.log('PR222 buttons flow-layer audit and gifts audit tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
