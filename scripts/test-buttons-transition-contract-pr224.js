'use strict';
const assert = require('assert');
const store = require('../store');
const buttons = require('../buttons-flow-cc8-clean');
const adminActionLog = require('../admin-action-log-live');
const postPatcher = require('../services/postPatcher');
const menu = { button: (text, action, extra = {}) => ({ text, payload: { action, ...extra } }), keyboard: (rows) => ({ rows }) };
const flat = (s) => (s?.attachments?.rows || []).flat();
const labels = (s) => flat(s).map((b) => b.text);
const btn = (s, action) => flat(s).find((b) => b.payload?.action === action);
const txt = (s) => String(s?.text || '');
function reset() { store.replaceStoreInPlace({ posts: {}, comments: {}, likes: {}, reactions: {}, setup: {}, growth: { byChannel: {} }, channels: {} }); adminActionLog.clear(); }
function post(userId, key, extra = {}) { const [channelId, postId] = key.split(':'); store.saveChannel(channelId, { channelId, title: 'АдминКит клуб', ownerUserId: userId, tenantKey: `tenant_${userId}` }); store.savePost(key, { commentKey: key, channelId, postId, messageId: postId, title: postId === '2' ? 'Тест стикеры 2' : `Пост ${postId}`, originalText: postId === '2' ? 'Тест стикеры 2' : `Пост ${postId}`, ownerUserId: userId, tenantKey: `tenant_${userId}`, ...extra }); }
function seedCanonical(userId, key, count) { post(userId, key); const [channelId] = key.split(':'); const set = Array.from({ length: count }, (_, i) => ({ id: `btn_${i + 1}`, text: i ? `Кнопка${i + 1}` : 'Кнопка22', url: i ? `https://example.com/${i + 1}` : 'http://olga.style' })); const bucket = store.store.growth.byChannel[channelId] || (store.store.growth.byChannel[channelId] = { channelId, buttonSets: {} }); bucket.buttonSets[key] = set.map((x) => ({ ...x, ownerUserId: userId, tenantKey: `tenant_${userId}`, commentKey: key, channelId, postId: key.split(':')[1] })); }
async function route(userId, action, extra = {}, ctxExtra = {}) { return buttons.screenForPayload(menu, { action, ...extra }, { userId, config: {}, ...ctxExtra }); }
async function input(userId, text, ctxExtra = {}) { return buttons.handleTextInput(menu, { userId, text, config: {}, ...ctxExtra }); }
function assertNoMisleading(s) { assert(!/Кнопка для изменения не найдена|Кнопка для удаления не найдена/.test(txt(s)), txt(s)); }
async function select(userId, key) { const [channelId, postId] = key.split(':'); return route(userId, 'button_admin_select_post', { commentKey: key, channelId, postId }); }
async function executable(userId, screen, action, expected) { const actionBtn = btn(screen, action); assert(actionBtn, `${action} must be rendered`); const next = await route(userId, action, actionBtn.payload); assertNoMisleading(next); assert(new RegExp(expected).test(txt(next)), `${action} transition failed\n${txt(next)}`); return next; }
function last(action) { return adminActionLog.list().filter((e) => e.action === action).at(-1); }
function assertCommit(e, count, operationRe) { assert(e, 'trace event missing'); assert(e.commit.ok, JSON.stringify(e.commit)); assert(e.commit.writeOk); assert(e.commit.readBackOk); assert(e.commit.keyMatchOk); assert(e.commit.contentMatchOk); assert.strictEqual(e.commit.buttonCountAfter, count); if (operationRe) assert(operationRe.test(e.commit.operation), e.commit.operation); }
async function addViaUi(userId, key, textValue = 'Кнопка22', urlValue = 'http://olga.style', ctxExtra = {}) { if (!store.getPost(key)) post(userId, key); const selected = await select(userId, key); const startButton = btn(selected, 'button_admin_start_add'); assert(startButton, `add button missing\n${txt(selected)}`); const add = await route(userId, 'button_admin_start_add', startButton.payload); assert(/Шаг 1\/3/.test(txt(add))); await input(userId, textValue); const preview = await input(userId, urlValue); const saveButton = btn(preview, 'button_admin_save'); assert(saveButton, `save button missing\n${txt(preview)}`); const saved = await route(userId, 'button_admin_save', saveButton.payload, ctxExtra); return saved; }
(async () => {
  const originalPatch = postPatcher.patchStoredPost;
  const patchCalls = [];
  postPatcher.patchStoredPost = async (options = {}) => { patchCalls.push({ ...options, customKeyboard: store.getPost(options.commentKey)?.customKeyboard || null }); return { ok: true, skipped: true, reason: 'test_patch_stub' }; };
  try {
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

    reset(); patchCalls.length = 0; post('add', 'ch-a:2'); const saved = await addViaUi('add', 'ch-a:2', 'Кнопка22', 'http://olga.style');
    assert(/Кнопка22 → http:\/\/olga\.style/.test(txt(saved)), 'BTN-056 selected post shows read-back saved button');
    assertCommit(last('button_admin_save'), 1, /add/); assert(patchCalls.at(-1).customKeyboard.rows[0].buttons[0].text === 'Кнопка22', 'BTN-056 patch uses read-back keyboard');
    await executable('add', saved, 'button_admin_edit', 'Кнопка: Кнопка22');

    reset(); patchCalls.length = 0; const savedUrlBase = await addViaUi('edit-url', 'ch-a:2'); const editUrl = await route('edit-url', 'button_admin_edit', btn(savedUrlBase, 'button_admin_edit').payload); await route('edit-url', 'button_admin_edit_url', btn(editUrl, 'button_admin_edit_url').payload); const urlChanged = await input('edit-url', 'https://example.com/new');
    assert(/Кнопка22 → https:\/\/example\.com\/new/.test(txt(urlChanged)), 'BTN-057 selected post shows read-back URL'); assertCommit(last('button_admin_edit_url'), 1, /edit_url/); await executable('edit-url', urlChanged, 'button_admin_edit', 'https://example.com/new');

    reset(); patchCalls.length = 0; const savedTextBase = await addViaUi('edit-text', 'ch-a:2'); const editText = await route('edit-text', 'button_admin_edit', btn(savedTextBase, 'button_admin_edit').payload); await route('edit-text', 'button_admin_edit_text', btn(editText, 'button_admin_edit_text').payload); const textChanged = await input('edit-text', 'Новый текст');
    assert(/Новый текст → http:\/\/olga\.style/.test(txt(textChanged)), 'BTN-058 selected post shows read-back text'); assertCommit(last('button_admin_edit_text'), 1, /edit_text/); await executable('edit-text', textChanged, 'button_admin_delete_confirm', 'Подтвердите удаление');

    reset(); patchCalls.length = 0; const delBase = await addViaUi('delete', 'ch-a:2'); const confirm = await route('delete', 'button_admin_delete_confirm', btn(delBase, 'button_admin_delete_confirm').payload); const deleted = await route('delete', 'button_admin_delete', btn(confirm, 'button_admin_delete').payload);
    assert(/Текущие кнопки: пока нет кнопок/.test(txt(deleted)), 'BTN-059 selected post shows empty read-back'); assert(!labels(deleted).includes('✏️ Изменить кнопку') && !labels(deleted).includes('🗑 Удалить кнопку')); assertCommit(last('button_admin_delete'), 0, /delete/); assert.strictEqual(patchCalls.at(-1).customKeyboard.rows.length, 0, 'BTN-059 patch uses empty read-back');

    reset(); patchCalls.length = 0; post('fail', 'ch-a:2'); await select('fail', 'ch-a:2'); const addFail = await route('fail', 'button_admin_start_add'); await input('fail', 'Fail button'); const previewFail = await input('fail', 'https://fail.example'); const failed = await route('fail', 'button_admin_save', btn(previewFail, 'button_admin_save').payload, { forceButtonCommitFailure: true });
    assert(/Кнопка не сохранена\. Повторите действие\./.test(txt(failed)), 'BTN-060 error screen'); assert(!/Кнопка сохранена/.test(txt(failed)), 'BTN-060 no success'); assert.strictEqual(patchCalls.length, 0, 'BTN-060 no patch before commit'); assert(last('button_admin_save').contractViolation, 'BTN-060 contract violation traced');

    reset(); patchCalls.length = 0; const traced = await addViaUi('trace', 'ch-a:2', 'Trace button', 'https://trace.example', { botToken: 'SECRET_TOKEN', authorization: 'Bearer SECRET', cookie: 'secret_cookie' }); const editTrace = await route('trace', 'button_admin_edit', btn(traced, 'button_admin_edit').payload); await route('trace', 'button_admin_edit_url', btn(editTrace, 'button_admin_edit_url').payload); await input('trace', 'https://trace.example/2'); const delTraceConfirm = await route('trace', 'button_admin_delete_confirm', btn(await route('trace', 'button_admin_show_current'), 'button_admin_delete_confirm').payload); await route('trace', 'button_admin_delete', btn(delTraceConfirm, 'button_admin_delete').payload);
    assert(last('button_admin_select_post').resolved.ok, 'BTN-061 select trace resolved'); assertCommit(last('button_admin_save'), 1, /add/); assert(last('button_admin_edit').resolved.buttonCount >= 1, 'BTN-061 edit trace sees buttons'); assertCommit(last('button_admin_delete'), 0, /delete/); const serialized = JSON.stringify(adminActionLog.list()).toLowerCase(); assert(!serialized.includes('secret_token') && !serialized.includes('bearer secret') && !serialized.includes('secret_cookie'), 'BTN-061 trace redacts secrets');

    for (let i = 51; i <= 61; i += 1) console.log(`BTN-${String(i).padStart(3, '0')} pass`);
  } finally { postPatcher.patchStoredPost = originalPatch; }
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
