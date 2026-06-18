'use strict';
const assert = require('assert');
const store = require('../store');
const buttons = require('../buttons-flow-cc8-clean');
const menu = { button: (text, action, extra = {}) => ({ text, payload: { action, ...extra } }), keyboard: (rows) => ({ rows }) };
const flat = (s) => (s?.attachments?.rows || []).flat();
const labels = (s) => flat(s).map((b) => b.text);
const btn = (s, action) => flat(s).find((b) => b.payload?.action === action);
const txt = (s) => String(s?.text || '');
function reset() { store.replaceStoreInPlace({ posts: {}, comments: {}, likes: {}, reactions: {}, setup: {}, growth: { byChannel: {} }, channels: {} }); }
function post(userId, key, extra = {}) { const [channelId, postId] = key.split(':'); store.saveChannel(channelId, { channelId, title: 'АдминКит клуб', ownerUserId: userId, tenantKey: `tenant_${userId}` }); store.savePost(key, { commentKey: key, channelId, postId, messageId: postId, title: postId === '2' ? 'Тест стикеры 2' : `Пост ${postId}`, originalText: postId === '2' ? 'Тест стикеры 2' : `Пост ${postId}`, ownerUserId: userId, tenantKey: `tenant_${userId}`, ...extra }); }
function seedCanonical(userId, key, count) { post(userId, key); const [channelId] = key.split(':'); const set = Array.from({ length: count }, (_, i) => ({ id: `btn_${i + 1}`, text: i ? `Кнопка${i + 1}` : 'Кнопка22', url: i ? `https://example.com/${i + 1}` : 'http://olga.style' })); buttons.reconcileButtonsFeatureState({ userId, target: { commentKey: key, channelId, postId: key.split(':')[1] } }); const bucket = store.store.growth.byChannel[channelId] || (store.store.growth.byChannel[channelId] = { channelId, buttonSets: {} }); bucket.buttonSets[key] = set.map((x) => ({ ...x, ownerUserId: userId, tenantKey: `tenant_${userId}`, commentKey: key, channelId })); }
async function route(userId, action, extra = {}) { return buttons.screenForPayload(menu, { action, ...extra }, { userId, config: {} }); }
function assertNoMisleading(s) { assert(!/Кнопка для изменения не найдена|Кнопка для удаления не найдена/.test(txt(s)), txt(s)); }
async function select(userId, key) { const [channelId, postId] = key.split(':'); return route(userId, 'button_admin_select_post', { commentKey: key, channelId, postId }); }
async function executable(userId, screen, action, expected) { const actionBtn = btn(screen, action); assert(actionBtn, `${action} must be rendered`); const next = await route(userId, action, actionBtn.payload); assertNoMisleading(next); assert(new RegExp(expected).test(txt(next)), `${action} transition failed\n${txt(next)}`); return next; }
(async () => {
  reset(); post('legacy', 'ch-a:2', { importedButtons: [{ id: 'legacy_1', text: 'Старая кнопка', url: 'https://legacy.example' }] });
  const legacyScreen = await select('legacy', 'ch-a:2');
  assert(txt(legacyScreen).includes('Старая кнопка → https://legacy.example'), 'BTN-051 selected screen imports legacy source');
  assert.strictEqual(buttons.reconcileButtonsFeatureState({ userId: 'legacy', target: { commentKey: 'ch-a:2', channelId: 'ch-a', postId: '2' } }).source, 'canonical_button_set', 'BTN-051 imported into canonical');
  const legacyEdit = await executable('legacy', legacyScreen, 'button_admin_edit', 'Кнопка: Старая кнопка');
  assert(!txt(legacyEdit).includes('Кнопка для изменения не найдена'), 'BTN-051 no misleading not found');

  reset(); seedCanonical('one', 'ch-a:2', 1); const one = await select('one', 'ch-a:2');
  await executable('one', one, 'button_admin_edit', 'Кнопка: Кнопка22');
  await executable('one', one, 'button_admin_delete_confirm', 'Подтвердите удаление');

  reset(); seedCanonical('multi', 'ch-a:3', 2); const multi = await select('multi', 'ch-a:3');
  await executable('multi', multi, 'button_admin_edit', 'Какую кнопку изменить');
  await executable('multi', multi, 'button_admin_delete_confirm', 'Какую кнопку удалить');

  reset(); post('empty', 'ch-a:2'); const empty = await select('empty', 'ch-a:2');
  assert(!labels(empty).includes('✏️ Изменить кнопку') && !labels(empty).includes('🗑 Удалить кнопку'), 'BTN-054/055 empty selected screen hides edit/delete');
  const staleEdit = await route('empty', 'button_admin_edit', { cardId: 'stale' });
  assert(/Пост выбран, но сохранённые кнопки для него не найдены/.test(txt(staleEdit)), 'BTN-054 recovery screen');
  assert(labels(staleEdit).includes('➕ Добавить кнопку') && labels(staleEdit).includes('📌 Выбрать другой пост'), 'BTN-054 recovery actions');
  assertNoMisleading(staleEdit);
  const staleDelete = await route('empty', 'button_admin_delete_confirm', { cardId: 'stale' });
  assert(/Пост выбран, но сохранённые кнопки для него не найдены/.test(txt(staleDelete)), 'BTN-054 delete recovery screen');
  assertNoMisleading(staleDelete);
  console.log('BTN-051 pass'); console.log('BTN-052 pass'); console.log('BTN-053 pass'); console.log('BTN-054 pass'); console.log('BTN-055 pass');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
