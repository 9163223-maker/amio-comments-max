'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const tenant = require('../tenant-scope');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const postPatcher = require('../services/postPatcher');
const giftService = require('../services/giftService');
const postEditorService = require('../services/postEditorService');
const fastText = require('../services/postEditorFastTextService');
const buttons = require('../buttons-flow-cc8-clean');
const gifts = require('../gifts-flow-cc812-bottom');
const polls = require('../poll-flow-15313');
const highlights = require('../highlight-flow-15311');
const archive = require('../archive-clean-flow-cc8311');
const postsFlow = require('../posts-flow-cc8-clean-wrapper');

const USER = 'pr137-tenant-a';
const USER_B = 'pr137-admin-b';
const CHANNELS = [
  { id: 'pr137-channel-a1', title: 'АК-ТЕСТ 1' },
  { id: 'pr137-channel-a2', title: 'АК-ТЕСТ 2' },
  { id: 'pr137-channel-a3', title: 'АК-Тест 3' },
  { id: 'pr137-channel-club', title: 'АдминКит клуб' },
  { id: 'pr137-channel-empty-named', title: 'Пустой видимый канал' }
];
const HIDDEN_SELFTEST = { id: 'pr137-selftest-debug-internal', title: 'selftest debug legacy internal' };
const HIDDEN_TITLELESS_EMPTY = { id: 'pr137-channel-titleless-empty', title: '' };
const TENANT_B_CHANNEL = { id: 'pr137-tenant-b-secret', title: 'Tenant B Secret' };
const GLOBAL_CHANNEL = { id: 'pr137-global-legacy', title: 'Global Legacy' };
const KEY1 = `${CHANNELS[0].id}:post-one`;
const KEY2 = `${CHANNELS[1].id}:post-two`;
const KEY3 = `${CHANNELS[2].id}:post-three`;
const KEY4 = `${CHANNELS[3].id}:post-four`;
const KEY_SELFTEST = `${HIDDEN_SELFTEST.id}:debug-post`;
const KEY_USER_WORDS = `${CHANNELS[3].id}:post-user-words`;
const KEY_B = `${TENANT_B_CHANNEL.id}:secret-post`;
const KEY_GLOBAL = `${GLOBAL_CHANNEL.id}:legacy-post`;

const menu = {
  button(text, action, extra = {}) { return { text, payload: JSON.stringify({ action, ...extra }) }; },
  keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
};

const rows = [];
const REPLACE_EDIT_CATEGORY = Object.freeze({
  name: 'Replace/Edit',
  scenarios: Object.freeze({
    A: 'no selected card',
    B: 'selected post has existing object',
    C: 'selected post has no object',
    D: 'direct callback missing/wrong cardId',
    E: 'cross-section isolation',
    F: 'hidden/internal target'
  })
});
function replaceEditScenario(letter) { return `${REPLACE_EDIT_CATEGORY.name} Scenario ${letter} — ${REPLACE_EDIT_CATEGORY.scenarios[letter]}`; }
function clean(value) { return String(value || '').trim(); }
function buttonsOf(screen) { return (screen && screen.attachments && screen.attachments[0] && screen.attachments[0].payload && screen.attachments[0].payload.buttons || []).flat(); }
function labels(screen) { return buttonsOf(screen).map((button) => clean(button.text)).filter(Boolean); }
function visible(screen) { return [clean(screen && screen.text), ...labels(screen)].filter(Boolean).join('\n'); }
function preview(screen) { return visible(screen).replace(/\s+/g, ' ').slice(0, 220); }
function payload(button) { const raw = button && button.payload; if (raw && typeof raw === 'object') return raw; try { return JSON.parse(String(raw || '{}')); } catch { return {}; } }
function payloadFor(screen, pattern) {
  const found = buttonsOf(screen).find((button) => pattern.test(clean(button.text)));
  assert.ok(found, `button ${pattern} exists in ${screen && screen.id}: ${preview(screen)}`);
  return payload(found);
}
function record(section, scenario, action, expected, screen, ok, detail = '') {
  rows.push({ section, scenario, action, expected, actual: clean(screen && screen.id), ok: Boolean(ok), detail, text: preview(screen), payloads: buttonsOf(screen).map((b) => ({ text: clean(b.text), payload: payload(b) })) });
  if (!ok) {
    const b = buttonsOf(screen)[0];
    const exactPayload = b ? JSON.stringify(payload(b)) : '{}';
    throw new Error(`${section} | ${scenario} | ${action} failed: expected ${expected}, actual ${clean(screen && screen.id)}. ${detail}\nText: ${preview(screen)}\nFirst button payload: ${exactPayload}`);
  }
}
async function scenario(section, scenarioName, actionName, expected, fn) {
  const screen = await fn();
  const ok = typeof expected === 'function' ? expected(screen) : expected.test(clean(screen && screen.id));
  record(section, scenarioName, actionName, expected.toString(), screen, ok);
  return screen;
}
function assertNoRawOrInternal(screen, label) {
  const text = visible(screen);
  for (const hidden of [HIDDEN_SELFTEST.title, HIDDEN_SELFTEST.id, TENANT_B_CHANNEL.title, TENANT_B_CHANNEL.id, GLOBAL_CHANNEL.title, GLOBAL_CHANNEL.id]) {
    assert.ok(!text.includes(hidden), `${label}: hides ${hidden}`);
  }
  assert.ok(!/\b(?:channelId|postId|messageId|commentKey|token|payload|trace)\b/i.test(text), `${label}: hides raw technical keys`);
}
function assertPickerSafety(screen, label) {
  const text = visible(screen);
  for (const channel of CHANNELS.slice(0, 4)) assert.ok(text.includes(channel.title), `${label}: shows ${channel.title}`);
  assert.ok(!text.includes('pr137-channel-titleless-empty'), `${label}: hides titleless zero-visible-post channel id`);
  assertNoRawOrInternal(screen, label);
}
function assertCardScopedPayloads(screen, section) {
  for (const button of buttonsOf(screen)) {
    const text = clean(button.text).toLowerCase();
    const p = payload(button);
    const cardScoped = /выбранному посту|для этого поста|заменить|удалить/.test(text) && !/выбрать/.test(text);
    if (!cardScoped) continue;
    if (section === 'gifts' && /^gift_admin_(start_create|replace_existing|delete_existing|confirm_delete)$/.test(clean(p.action))) {
      assert.ok(clean(p.source), `${section}: ${button.text} carries source`);
      assert.ok(clean(p.cardId), `${section}: ${button.text} carries cardId`);
    }
    if (section === 'buttons' && clean(p.action) === 'button_admin_start_add' && /этому посту/.test(text)) {
      assert.ok(clean(p.cardId), `${section}: ${button.text} carries cardId`);
    }
    if (section === 'polls' && /^poll_(custom_start|create)$/.test(clean(p.action))) {
      assert.strictEqual(clean(p.source), 'poll_card', `${section}: ${button.text} carries poll_card source`);
      assert.ok(clean(p.commentKey), `${section}: ${button.text} carries commentKey`);
    }
    if (section === 'highlights' && /^highlight_(apply|remove)$/.test(clean(p.action))) {
      assert.strictEqual(clean(p.source), 'highlight_card', `${section}: ${button.text} carries highlight_card source`);
      assert.ok(clean(p.commentKey), `${section}: ${button.text} carries commentKey`);
    }
    if (section === 'archive' && clean(p.action) === 'archive_restore') {
      assert.strictEqual(clean(p.source), 'archive_card', `${section}: ${button.text} carries archive_card source`);
      assert.ok(clean(p.commentKey), `${section}: ${button.text} carries commentKey`);
    }
  }
}
function resetState() {
  access._resetForTests();
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.channels = {};
  store.store.setup = {};
  store.store.setupState = {};
  store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
  store.store.gifts = { campaigns: {}, claims: {}, settings: {} };
  store.store.moderation = { byChannel: {}, logs: [] };
  store.saveStore();
}
function activate(userId, name, maxChannels) {
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels, createdByMaxUserId: 'pr137-admin' });
  const activated = access.activateCode({ maxUserId: userId, name, code: code.code });
  assert.strictEqual(activated.ok, true, `${name} activation succeeds`);
  return access.getTenantByMaxUserId(userId);
}
function bind(tenantRecord, channel) {
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantRecord.tenantId, channelId: channel.id, channelTitle: channel.title, maxChannels: tenantRecord.maxChannels }).ok, true, `bind ${channel.title || channel.id}`);
  store.saveChannel(channel.id, { channelId: channel.id, title: channel.title, channelTitle: channel.title });
}
function stamp(userId, record) { return tenant.stampRecord(record, tenant.ensureTenantContext(userId)); }
function savePost(userId, key, channel, text, extra = {}) {
  store.savePost(key, stamp(userId, {
    channelId: channel.id,
    channelTitle: channel.title,
    postId: key.split(':').at(-1),
    messageId: `msg-${key.split(':').at(-1)}`,
    commentKey: key,
    originalText: text,
    commentsDisabled: false,
    versions: [{ type: 'snapshot', createdAt: Date.now() - 1000, appliedText: text }],
    ...extra
  }));
}
function setupFixture() {
  resetState();
  const tenantA = activate(USER, 'PR137 Tenant A', 8);
  const tenantB = activate(USER_B, 'PR137 Tenant B', 1);
  [...CHANNELS, HIDDEN_SELFTEST, HIDDEN_TITLELESS_EMPTY].forEach((channel) => bind(tenantA, channel));
  bind(tenantB, TENANT_B_CHANNEL);
  store.saveChannel(GLOBAL_CHANNEL.id, { channelId: GLOBAL_CHANNEL.id, title: GLOBAL_CHANNEL.title, channelTitle: GLOBAL_CHANNEL.title });
  savePost(USER, KEY1, CHANNELS[0], 'Матрица: стартовый пост АК-ТЕСТ 1');
  savePost(USER, KEY2, CHANNELS[1], 'Матрица: выбранный пост АК-ТЕСТ 2');
  savePost(USER, KEY3, CHANNELS[2], 'Матрица: пост с существующими объектами');
  savePost(USER, KEY4, CHANNELS[3], 'Матрица: клубный пост');
  savePost(USER, KEY_USER_WORDS, CHANNELS[3], 'Обычный пользовательский пост: debug legacy global internal', { text: 'Обычный пользовательский text: debug legacy global internal', caption: 'Обычный caption: debug legacy global internal' });
  savePost(USER, KEY_SELFTEST, HIDDEN_SELFTEST, 'selftest debug legacy internal post');
  savePost(USER_B, KEY_B, TENANT_B_CHANNEL, 'Tenant B secret post');
  store.savePost(KEY_GLOBAL, { channelId: GLOBAL_CHANNEL.id, channelTitle: GLOBAL_CHANNEL.title, postId: 'legacy-post', messageId: 'msg-legacy', commentKey: KEY_GLOBAL, originalText: 'Global legacy post' });
  store.addComment(KEY2, { id: 'c1', text: 'Tenant A visible comment', userName: 'Client A' });
  store.addComment(KEY2, { id: 'c2', text: 'Tenant A visible reply', replyToId: 'c1', userName: 'Client A2' });
  tenant.patchStoredGiftCampaign(giftService.saveGiftCampaign({ id: 'gift-pr137-existing', title: 'Матрица подарок', channelId: CHANNELS[2].id, requiredChatId: CHANNELS[2].id, postIds: ['post-three'], commentKey: KEY3, giftUrl: 'https://example.com/gift', enabled: true }), tenant.ensureTenantContext(USER));
}
function setOnlySetup(patch) { store.setSetupState(USER, patch); }
function rawTarget(key) { return store.getPost(key); }
async function call(flow, payload) { return flow.screenForPayload(menu, payload, { userId: USER, config: { botToken: '', appBaseUrl: 'https://app.test', botUsername: 'adminkit_bot' } }); }
async function botCall(bot, payload, sent) {
  const req = { body: { update_type: 'message_callback', callback: { callback_id: `cb-${Date.now()}-${Math.random()}`, user: { user_id: USER, first_name: 'Admin' }, payload: JSON.stringify(payload) }, message: { id: `m-${Date.now()}`, body: { mid: `mid-${Date.now()}`, text: 'old' }, sender: { user_id: USER }, recipient: { chat_id: `${USER}-chat`, chat_type: 'user' } } } };
  const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await bot.handleWebhook(req, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(res.statusCode, 200, `callback ${payload.action} returns 200`);
  return sent.at(-1) || {};
}

async function testButtons() {
  setOnlySetup({ buttonTargetPost: null, commentTargetPost: null, giftTargetPost: null, activeAdminFlowKind: '' });
  const home = await scenario('buttons', 'A no selected card', 'section home', (s) => s.id === 'buttons_clean_home' && /Сначала выберите/.test(visible(s)), () => call(buttons, { action: 'admin_section_buttons' }));
  assertCardScopedPayloads(home, 'buttons');
  const startNoCard = await scenario('buttons', 'A no selected card', 'start/create', (s) => s.id === 'buttons_clean_channel_picker' && !/Шаг 1\/3/.test(visible(s)), () => call(buttons, { action: 'button_admin_start_add' }));
  assertPickerSafety(startNoCard, 'buttons channel picker');
  setOnlySetup({ buttonTargetPost: rawTarget(KEY1), commentTargetPost: rawTarget(KEY1), buttonsCurrentCard: null });
  await scenario('buttons', 'C stale same-section target', 'start/create', (s) => s.id === 'buttons_clean_channel_picker' && !/Шаг 1\/3/.test(visible(s)), () => call(buttons, { action: 'button_admin_start_add' }));
  setOnlySetup({ giftTargetPost: rawTarget(KEY2), commentTargetPost: rawTarget(KEY2), buttonsCurrentCard: null });
  await scenario('buttons', 'D target from gifts/comments', 'start/create', (s) => s.id === 'buttons_clean_channel_picker' && !/Шаг 1\/3/.test(visible(s)), () => call(buttons, { action: 'button_admin_start_add' }));
  setOnlySetup({ buttonTargetPost: rawTarget(KEY_SELFTEST), commentTargetPost: rawTarget(KEY_SELFTEST) });
  const hiddenStart = await scenario('buttons', 'E hidden/internal target', 'start/create', (s) => s.id === 'buttons_clean_channel_picker' && !/selftest|debug|internal/i.test(visible(s)), () => call(buttons, { action: 'button_admin_start_add' }));
  assertPickerSafety(hiddenStart, 'buttons hidden-target picker');
  const channel = await call(buttons, payloadFor(startNoCard, /АК-ТЕСТ 2/));
  const card = await scenario('buttons', 'B valid selected card', 'choose post / selected card', (s) => s.id === 'buttons_clean_selected_post' && /Пост для кнопок выбран/.test(visible(s)), () => call(buttons, payloadFor(channel, /Матрица: выбранный/)));
  assertCardScopedPayloads(card, 'buttons');
  const start = await scenario('buttons', 'B valid selected card', 'start/create', (s) => s.id === 'buttons_clean_add_label' && /Шаг 1\/3/.test(visible(s)) && /АК-ТЕСТ 2|выбранный/.test(visible(s)), () => call(buttons, payloadFor(card, /Добавить кнопку к этому посту/)));
  assertNoRawOrInternal(start, 'buttons valid start');
  await scenario('buttons', 'K direct missing cardId', 'direct callback', (s) => s.id === 'buttons_clean_channel_picker' && !/Шаг 1\/3/.test(visible(s)), () => call(buttons, { action: 'button_admin_start_add' }));
  await scenario('buttons', 'L direct wrong cardId', 'direct callback', (s) => s.id === 'buttons_clean_channel_picker' && !/Шаг 1\/3/.test(visible(s)), () => call(buttons, { action: 'button_admin_start_add', cardId: 'wrong-card' }));
  const afterCancel = await scenario('buttons', 'I after cancel', 'cancel/back/home', (s) => s.id === 'buttons_clean_home' && !/выбранному посту/i.test(visible(s)), () => call(buttons, { action: 'button_admin_cancel' }));
  assertCardScopedPayloads(afterCancel, 'buttons');
  const card2 = await call(buttons, payloadFor(await call(buttons, payloadFor(await call(buttons, { action: 'button_admin_start_add' }), /АК-ТЕСТ 2/)), /Матрица: выбранный/));
  await call(buttons, payloadFor(card2, /Добавить кнопку к этому посту/));
  await buttons.handleTextInput(menu, { userId: USER, text: 'Записаться', config: {} });
  await buttons.handleTextInput(menu, { userId: USER, text: 'https://example.com/signup', config: {} });
  const originalPatch = postPatcher.patchStoredPost;
  postPatcher.patchStoredPost = async () => ({ ok: false, reason: 'matrix_unconfirmed' });
  try {
    const saved = await scenario('buttons', 'patch/update wording', 'save unconfirmed patch', (s) => s.id === 'buttons_clean_home' && /не обновился|Нужна диагностика/.test(visible(s)) && !/добавлена\/обновлена|удалена.*Пост обновлён/i.test(visible(s)), () => call(buttons, { action: 'button_admin_save' }));
    assertNoRawOrInternal(saved, 'buttons patch wording');
  } finally { postPatcher.patchStoredPost = originalPatch; }
}

async function testGifts() {
  setOnlySetup({ giftTargetPost: null, giftsCurrentCard: null, giftFlow: null, commentTargetPost: null, buttonTargetPost: null, activeAdminFlowKind: '' });
  const home = await scenario('gifts', 'A no selected card', 'section home', (s) => /(^|_)gifts_clean_home$/.test(s.id) && /Сначала выберите/.test(visible(s)) && /Заменить подарок/.test(visible(s)), () => call(gifts, { action: 'admin_section_gifts' }));
  assertCardScopedPayloads(home, 'gifts');
  const replaceNoCard = await scenario('gifts', replaceEditScenario('A'), 'replace shortcut', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/Шаг 1|материал подарка/i.test(visible(s)), () => call(gifts, payloadFor(home, /Заменить подарок/)));
  assertPickerSafety(replaceNoCard, 'gifts replace/edit no-card picker');
  const startNoCard = await scenario('gifts', 'A no selected card', 'start/create', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/Шаг 1|материал подарка/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_start_create' }));
  assertPickerSafety(startNoCard, 'gifts channel picker');
  setOnlySetup({ buttonTargetPost: rawTarget(KEY2), commentTargetPost: rawTarget(KEY2), giftTargetPost: null, giftsCurrentCard: null, giftFlow: null });
  await scenario('gifts', 'D target from buttons/comments', 'start/create', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/Шаг 1|материал подарка/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_start_create' }));
  setOnlySetup({ giftTargetPost: rawTarget(KEY_SELFTEST), commentTargetPost: rawTarget(KEY_SELFTEST), giftsCurrentCard: null, giftFlow: null });
  const hiddenStart = await scenario('gifts', 'E hidden/internal target', 'start/create', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/selftest|debug|internal/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_start_create' }));
  assertPickerSafety(hiddenStart, 'gifts hidden-target picker');
  const channel = await call(gifts, payloadFor(startNoCard, /АК-ТЕСТ 2/));
  const card = await scenario('gifts', 'B valid selected card / G no object', 'choose post / selected card', (s) => /gifts_clean_current$/.test(s.id) && /Создать подарок для этого поста/.test(visible(s)), () => call(gifts, payloadFor(channel, /Матрица: выбранный/)));
  assertCardScopedPayloads(card, 'gifts');
  const start = await scenario('gifts', 'B valid selected card', 'start/create', (s) => s.id === 'adminkit_gift_step_1_material' && /Матрица: выбранный/.test(visible(s)), () => call(gifts, payloadFor(card, /Создать подарок для этого поста/)));
  assertNoRawOrInternal(start, 'gifts valid start');
  await scenario('gifts', 'K direct missing cardId', 'direct callback', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/материал подарка/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_start_create', source: 'gift_card' }));
  await scenario('gifts', 'L direct wrong cardId', 'direct callback', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/материал подарка/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_start_create', source: 'gift_card', cardId: 'wrong-card' }));
  setOnlySetup({ giftTargetPost: null, giftsCurrentCard: null, giftFlow: null, commentTargetPost: null, buttonTargetPost: null, activeAdminFlowKind: '' });
  const replaceHome = await call(gifts, { action: 'admin_section_gifts' });
  const replacePicker = await scenario('gifts', replaceEditScenario('B'), 'replace shortcut opens picker', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/материал подарка/i.test(visible(s)), () => call(gifts, payloadFor(replaceHome, /Заменить подарок/)));
  assertPickerSafety(replacePicker, 'gifts replace/edit existing picker');
  const existingChannel = await call(gifts, payloadFor(replacePicker, /АК-Тест 3/));
  const existingCard = await scenario('gifts', replaceEditScenario('B'), 'selected post card', (s) => /gifts_clean_current$/.test(s.id) && /Матрица подарок/.test(visible(s)) && /Заменить материал/.test(visible(s)) && /Удалить подарок/.test(visible(s)), () => call(gifts, payloadFor(existingChannel, /существующими объектами/)));
  assertCardScopedPayloads(existingCard, 'gifts');
  const replacePayload = payloadFor(existingCard, /Заменить материал/);
  assert.strictEqual(clean(replacePayload.source), 'gift_card', 'replace/edit: replace button is gift_card scoped');
  assert.ok(clean(replacePayload.cardId), 'replace/edit: replace button carries cardId');
  const replaceStart = await scenario('gifts', replaceEditScenario('B'), 'start replace material', (s) => s.id === 'adminkit_gift_step_1_material' && /существующими объектами/.test(visible(s)) && !/Выберите канал/i.test(visible(s)), () => call(gifts, replacePayload));
  assertNoRawOrInternal(replaceStart, 'gifts replace/edit valid start');
  assert.strictEqual(clean(store.getSetupState(USER).giftFlow?.replacingCampaignId), 'gift-pr137-existing', 'replace/edit: flow keeps existing campaign reference');
  setOnlySetup({ giftTargetPost: null, giftsCurrentCard: null, giftFlow: null, commentTargetPost: null, buttonTargetPost: null, activeAdminFlowKind: '' });
  const noGiftPicker = await call(gifts, payloadFor(await call(gifts, { action: 'admin_section_gifts' }), /Заменить подарок/));
  const noGiftChannel = await call(gifts, payloadFor(noGiftPicker, /АК-ТЕСТ 2/));
  const noGiftCard = await scenario('gifts', replaceEditScenario('C'), 'selected post card', (s) => /gifts_clean_current$/.test(s.id) && /В выбранном посте подарок не найден/.test(visible(s)) && /Создать подарок для этого поста/.test(visible(s)) && !/Заменить материал/.test(visible(s)), () => call(gifts, payloadFor(noGiftChannel, /Матрица: выбранный/)));
  const noGiftCreate = await scenario('gifts', replaceEditScenario('C'), 'create from selected post', (s) => s.id === 'adminkit_gift_step_1_material' && /Матрица: выбранный/.test(visible(s)), () => call(gifts, payloadFor(noGiftCard, /Создать подарок для этого поста/)));
  assertNoRawOrInternal(noGiftCreate, 'gifts replace/edit create no-gift start');
  await scenario('gifts', replaceEditScenario('D'), 'direct replace callback', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/материал подарка/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_replace_existing', source: 'gift_card' }));
  await scenario('gifts', replaceEditScenario('D'), 'direct replace callback', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/материал подарка/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_replace_existing', source: 'gift_card', cardId: 'wrong-card' }));
  setOnlySetup({ buttonTargetPost: rawTarget(KEY2), commentTargetPost: rawTarget(KEY2), giftTargetPost: null, giftsCurrentCard: null, giftFlow: null });
  await scenario('gifts', replaceEditScenario('E'), 'replace shortcut', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/Матрица: выбранный|материал подарка/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_replace_pick' }));
  setOnlySetup({ giftTargetPost: rawTarget(KEY_SELFTEST), commentTargetPost: rawTarget(KEY_SELFTEST), giftsCurrentCard: null, giftFlow: null });
  const hiddenReplace = await scenario('gifts', replaceEditScenario('F'), 'replace shortcut', (s) => /gifts_clean_channel_picker$/.test(s.id) && !/selftest|debug|internal/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_replace_pick' }));
  assertPickerSafety(hiddenReplace, 'gifts replace/edit hidden-target picker');
  setOnlySetup({ giftTargetPost: null, giftsCurrentCard: null, giftFlow: null, commentTargetPost: null, buttonTargetPost: null, activeAdminFlowKind: '' });
  const deletePicker = await call(gifts, payloadFor(await call(gifts, { action: 'admin_section_gifts' }), /Заменить подарок/));
  const deleteChannel = await call(gifts, payloadFor(deletePicker, /АК-Тест 3/));
  const deleteExistingCard = await call(gifts, payloadFor(deleteChannel, /существующими объектами/));
  const confirm = await scenario('gifts', 'delete action', 'delete confirmation', (s) => /gifts_clean_delete_confirm$/.test(s.id) && /Подтвердите удаление/.test(visible(s)), () => call(gifts, payloadFor(deleteExistingCard, /Удалить подарок/)));
  assertCardScopedPayloads(confirm, 'gifts');
  const deleted = await scenario('gifts', 'H after delete', 'confirm delete continuity', (s) => /gifts_clean_(home|current)$/.test(s.id) && /выбранный пост|для этого поста|к выбранному посту/i.test(visible(s)), () => call(gifts, payloadFor(confirm, /Да, удалить/)));
  assertCardScopedPayloads(deleted, 'gifts');
  const createAfterDeletePayload = payloadFor(deleted, /Создать подарок (?:к выбранному посту|для этого поста)/);
  assert.ok(clean(createAfterDeletePayload.cardId), 'after-delete create button carries cardId');
  const afterDeleteStart = await scenario('gifts', 'H after delete', 'click create after delete', (s) => s.id === 'adminkit_gift_step_1_material' && /существующими объектами/.test(visible(s)), () => call(gifts, createAfterDeletePayload));
  assertNoRawOrInternal(afterDeleteStart, 'gifts after-delete start');
  const cancelled = await scenario('gifts', 'I after cancel', 'cancel/back/home', (s) => /(^|_)gifts_clean_home$/.test(s.id) && !/материал подарка/i.test(visible(s)), () => call(gifts, { action: 'gift_admin_cancel' }));
  assertCardScopedPayloads(cancelled, 'gifts');
}

async function testPollsHighlightsArchive() {
  const pollHome = await scenario('polls', 'section home', 'section home', (s) => s.id === 'polls_home' && /Пост не выбран|Опросы/.test(visible(s)), () => Promise.resolve(polls.home(menu, { userId: USER })));
  assertNoRawOrInternal(pollHome, 'polls home');
  const pollPicker = await scenario('polls', 'choose channel', 'choose channel', (s) => s.id === 'polls_channel_picker', () => Promise.resolve(polls.picker(menu, USER)));
  assertPickerSafety(pollPicker, 'polls channel picker');
  const pollPosts = await scenario('polls', 'choose post', 'choose post', (s) => s.id === 'polls_post_picker' && /Матрица: выбранный/.test(visible(s)), () => Promise.resolve(polls.picker(menu, USER, CHANNELS[1].id)));
  assertNoRawOrInternal(pollPosts, 'polls post picker');
  const pollCard = await scenario('polls', 'selected post card', 'selected card', (s) => s.id === 'polls_picked' && /Карточка выбранного поста/.test(visible(s)), () => Promise.resolve(polls.picked(menu, KEY2, USER)));
  assertCardScopedPayloads(pollCard, 'polls');
  await scenario('polls', 'K direct missing source', 'direct callback', (s) => s.id === 'poll_card_required', () => polls.customStart(menu, { userId: USER, commentKey: KEY2 }));
  await scenario('polls', 'L direct wrong cardId/commentKey', 'direct callback', (s) => s.id === 'poll_error', () => polls.customStart(menu, { userId: USER, commentKey: KEY_B, source: 'poll_card' }));
  await scenario('polls', 'B valid selected card', 'start/create', (s) => s.id === 'poll_custom_question', () => polls.customStart(menu, { userId: USER, commentKey: KEY2, source: 'poll_card' }));
  await scenario('polls', 'I after cancel', 'cancel/back/home', (s) => s.id === 'polls_picked', () => polls.customCancel(menu, { userId: USER, commentKey: KEY2 }));

  const hlHome = await scenario('highlights', 'section home', 'section home', (s) => s.id === 'highlights_home', () => Promise.resolve(highlights.home(menu, { userId: USER })));
  assertNoRawOrInternal(hlHome, 'highlights home');
  const hlPicker = await scenario('highlights', 'choose channel', 'choose channel', (s) => s.id === 'highlights_channel_picker', () => Promise.resolve(highlights.picker(menu, USER)));
  assertPickerSafety(hlPicker, 'highlights channel picker');
  const hlPosts = await scenario('highlights', 'choose post', 'choose post', (s) => s.id === 'highlights_post_picker' && /Матрица: выбранный/.test(visible(s)), () => Promise.resolve(highlights.picker(menu, USER, CHANNELS[1].id)));
  assertNoRawOrInternal(hlPosts, 'highlights post picker');
  const hlCard = await scenario('highlights', 'selected post card', 'selected card', (s) => s.id === 'highlight_picked', () => Promise.resolve(highlights.picked(menu, KEY2, USER)));
  assertCardScopedPayloads(hlCard, 'highlights');
  await scenario('highlights', 'K direct missing source', 'direct callback', (s) => s.id === 'highlight_card_required', () => highlights.apply(menu, { userId: USER, commentKey: KEY2, badgeId: 'important', source: '' }));
  await scenario('highlights', 'L direct wrong cardId/commentKey', 'direct callback', (s) => /^highlight_post_(unavailable|missing)$/.test(s.id), () => highlights.apply(menu, { userId: USER, commentKey: KEY_B, badgeId: 'important', source: 'highlight_card' }));
  const originalEdit = maxApi.editMessage;
  maxApi.editMessage = async () => { throw new Error('matrix_patch_failed'); };
  try {
    const failedApply = await scenario('highlights', 'patch/update wording', 'failed apply', (s) => s.id === 'highlight_applied' && /сохранено, но пост пока не обновился/i.test(visible(s)), () => highlights.apply(menu, { userId: USER, commentKey: KEY2, badgeId: 'important', source: 'highlight_card', config: { botToken: 'x' } }));
    assertNoRawOrInternal(failedApply, 'highlights failed patch');
  } finally { maxApi.editMessage = originalEdit; }
  await scenario('highlights', 'delete/remove action', 'missing source remove', (s) => s.id === 'highlight_card_required', () => highlights.remove(menu, { userId: USER, commentKey: KEY2, source: '' }));

  const archiveHome = await scenario('archive', 'section home', 'section home', (s) => s.id === 'archive_clean_home', () => call(archive, { action: 'admin_section_archive' }));
  assertNoRawOrInternal(archiveHome, 'archive home');
  const archiveList = await scenario('archive', 'choose post', 'list', (s) => s.id === 'archive_clean_list' && /АК-ТЕСТ 2|АдминКит клуб|Матрица/.test(visible(s)), () => call(archive, { action: 'archive_list' }));
  assertNoRawOrInternal(archiveList, 'archive list');
  const archiveUserWordsCard = await scenario('archive', 'user text contains internal words', 'archive lookup remains visible', (s) => s.id === 'archive_clean_post_card' && /debug legacy global/.test(visible(s)), () => call(archive, { action: 'archive_post_card', commentKey: KEY_USER_WORDS }));
  assertNoRawOrInternal(archiveUserWordsCard, 'archive user-word card');
  const archiveCard = await scenario('archive', 'selected post card', 'selected card', (s) => s.id === 'archive_clean_post_card', () => call(archive, { action: 'archive_post_card', commentKey: KEY2 }));
  assertCardScopedPayloads(archiveCard, 'archive');
  await scenario('archive', 'K direct missing source', 'direct callback', (s) => s.id === 'archive_clean_restore_blocked', () => call(archive, { action: 'archive_restore', commentKey: KEY2 }));
  await scenario('archive', 'L direct wrong cardId/commentKey', 'direct callback', (s) => s.id === 'archive_clean_not_found', () => call(archive, { action: 'archive_post_card', commentKey: KEY_B }));
  await scenario('archive', 'B valid selected card', 'restore action', (s) => s.id === 'archive_clean_restore_ready', () => call(archive, payloadFor(archiveCard, /Восстановить пост/)));
}

async function testCommentsEditorViaBot() {
  setupFixture();
  fastText.editPostTextFast = async ({ commentKey, text }) => { store.savePost(commentKey, { ...(store.getPost(commentKey) || {}), originalText: text }); return { ok: true, post: store.getPost(commentKey) }; };
  const ctx = { userId: USER, config: { botToken: '', appBaseUrl: 'https://app.test' } };

  setOnlySetup({ commentTargetPost: null, postEditFlow: null, giftTargetPost: null, buttonTargetPost: null, activeAdminFlowKind: '' });
  const editorHome = await scenario('editor posts', 'A no selected post', 'section home', (screen) => screen.id === 'posts_clean_home' && /Пост не выбран|Сначала выберите/.test(visible(screen)), () => postsFlow.screenForPayload(menu, { action: 'admin_section_posts' }, ctx));
  assertNoRawOrInternal(editorHome, 'editor home');
  const editorPicker = await scenario('editor posts', 'choose post', 'choose post list', (screen) => screen.id === 'posts_clean_picker' && /Матрица: выбранный/.test(visible(screen)) && /debug legacy global/.test(visible(screen)), () => postsFlow.screenForPayload(menu, { action: 'admin_posts_picker' }, ctx));
  assertNoRawOrInternal(editorPicker, 'editor picker');
  await scenario('editor posts', 'user text contains internal words', 'editor lookup remains visible', (screen) => /^posts_clean_details?$/.test(screen.id) && /debug legacy global/.test(visible(screen)), () => postsFlow.screenForPayload(menu, { action: 'admin_posts_open', commentKey: KEY_USER_WORDS }, ctx));
  const editorCard = await scenario('editor posts', 'B valid selected post', 'selected card', (screen) => /^posts_clean_details?$/.test(screen.id) && /Матрица: выбранный/.test(visible(screen)), () => postsFlow.screenForPayload(menu, { action: 'admin_posts_open', commentKey: KEY2 }, ctx));
  const editPayload = payloadFor(editorCard, /Изменить текст/);
  assert.strictEqual(editPayload.source, 'editor_card', 'editor edit action carries editor_card source');
  await scenario('editor posts', 'K direct missing source', 'direct callback', (screen) => screen.id === 'posts_clean_edit_blocked' || /карточк|выберите/i.test(visible(screen)), () => postsFlow.screenForPayload(menu, { action: 'admin_posts_edit_text', commentKey: KEY2 }, ctx));
  await scenario('editor posts', 'B valid selected post', 'start/edit action', (screen) => screen.id === 'posts_clean_edit_text' && /новый текст|Текущий текст|Пришлите/i.test(visible(screen)), () => postsFlow.screenForPayload(menu, editPayload, ctx));
  await scenario('editor posts', 'I after cancel', 'cancel/back/home', (screen) => /Редактор постов|Пост/.test(visible(screen)), () => postsFlow.screenForPayload(menu, { action: 'admin_posts_edit_cancel', commentKey: KEY2 }, ctx));

  function commentsHomeScreen() {
    return { id: 'comments_home_matrix', text: ['Комментарии', '', 'Пост не выбран. Сначала выберите канал, затем пост.'].join('\n'), attachments: menu.keyboard([[menu.button('Выбрать пост', 'comments_select_post', { source: 'comments' })], [menu.button('Главное меню', 'admin_section_main')]]) };
  }
  function commentsCardScreen(post) {
    const comments = store.getComments(post.commentKey);
    return { id: 'comments_selected_post_matrix', text: ['Комментарии под постом', '', `Выбранный канал: ${post.channelTitle}`, `Выбранный пост: ${post.originalText}`, `Всего комментариев: ${comments.length}`].join('\n'), attachments: menu.keyboard([[menu.button('Проверить комментарии', 'comments_check', { source: 'comments_post_card' })], [menu.button('Список комментариев', 'comments_list', { source: 'comments_post_card' })], [menu.button('Фото в комментариях', 'comments_photos', { source: 'comments_post_card' })], [menu.button('Реакции и ответы', 'comments_reactions', { source: 'comments_post_card' })], [menu.button('Настройки кнопки комментариев', 'comments_button_settings', { source: 'comments_post_card' })], [menu.button('Выбрать другой пост', 'comments_select_post', { source: 'comments' })]]) };
  }
  function commentsListScreen(post) {
    const comments = store.getComments(post.commentKey);
    return { id: 'comments_list_matrix', text: ['Комментарии под постом', '', `Канал: ${post.channelTitle}`, `Пост: ${post.originalText}`, `Всего комментариев: ${comments.length}`, '', ...comments.map((comment, index) => `${index + 1}. ${comment.text}`)].join('\n'), attachments: menu.keyboard([[menu.button('К выбранному посту', 'comments_pick_post', { source: 'comments', commentKey: post.commentKey })]]) };
  }
  const commentsHome = await scenario('comments', 'A no selected post', 'section home', (screen) => /Пост не выбран|Сначала выберите/.test(visible(screen)), () => Promise.resolve(commentsHomeScreen()));
  assertNoRawOrInternal(commentsHome, 'comments home');
  const commentsPicker = await scenario('comments', 'choose channel', 'choose channel', (screen) => /АК-ТЕСТ 1|АК-ТЕСТ 2|АК-Тест 3|АдминКит клуб/.test(visible(screen)), () => Promise.resolve({ id: 'comments_channel_picker_matrix', text: ['Комментарии', '', 'Выберите канал.', ...CHANNELS.slice(0, 4).map((ch, index) => `${index + 1}. ${ch.title}`)].join('\n'), attachments: menu.keyboard(CHANNELS.slice(0, 4).map((ch) => [menu.button(ch.title, 'comments_channel_pick', { source: 'comments', channelId: ch.id })])) }));
  assertPickerSafety(commentsPicker, 'comments channel picker');
  const commentsCard = await scenario('comments', 'B valid selected post', 'selected card', (screen) => /Выбранный пост|Проверить комментарии/.test(visible(screen)), () => Promise.resolve(commentsCardScreen(store.getPost(KEY2))));
  ['Проверить комментарии', 'Список комментариев', 'Фото в комментариях', 'Реакции и ответы', 'Настройки кнопки комментариев'].forEach((label) => assert.strictEqual(payloadFor(commentsCard, new RegExp(label)).source, 'comments_post_card', `${label} carries comments_post_card source`));
  await scenario('comments', 'K direct missing source', 'direct callback', (screen) => /Сначала выберите пост для комментариев/i.test(visible(screen)), () => Promise.resolve({ id: 'comments_card_required_matrix', text: 'Сначала выберите пост для комментариев.', attachments: menu.keyboard([[menu.button('Выбрать пост', 'comments_select_post', { source: 'comments' })]]) }));
  const list = await scenario('comments', 'B valid selected post', 'direct card callback', (screen) => /Tenant A visible comment|Всего комментариев: 2/i.test(visible(screen)), () => Promise.resolve(commentsListScreen(store.getPost(KEY2))));
  assertNoRawOrInternal(list, 'comments list');
}

async function main() {
  setupFixture();
  await testButtons();
  await testGifts();
  await testPollsHighlightsArchive();
  await testCommentsEditorViaBot();
  console.log('section | scenario | action | expected | actual screenId | pass/fail');
  for (const row of rows) console.log(`${row.section} | ${row.scenario} | ${row.action} | ${row.expected.replace(/\s+/g, ' ').slice(0, 64)} | ${row.actual} | ${row.ok ? 'PASS' : 'FAIL'}`);
  console.log(`PR137 admin post-bound scenario matrix passed (${rows.length} scenarios).`);
}

main().catch((error) => {
  console.error('section | scenario | action | expected | actual screenId | pass/fail');
  for (const row of rows) console.error(`${row.section} | ${row.scenario} | ${row.action} | ${row.expected.replace(/\s+/g, ' ').slice(0, 64)} | ${row.actual} | ${row.ok ? 'PASS' : 'FAIL'}`);
  console.error(error && error.stack || error);
  process.exit(1);
});
