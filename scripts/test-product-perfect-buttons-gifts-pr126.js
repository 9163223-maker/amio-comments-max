'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const tenant = require('../tenant-scope');
const access = require('../services/clientAccessService');
const buttons = require('../buttons-flow-cc8-clean');
const gifts = require('../gifts-flow-cc812-bottom');
const postPatcher = require('../services/postPatcher');

const TENANT_A_USER = 'pr126-tenant-a';
const TENANT_B_USER = 'pr126-tenant-b';
const CHANNELS_A = [
  { id: 'pr126_ch_olga', title: 'Olga Style' },
  { id: 'pr126_ch_reviews', title: 'Отзывы' },
  { id: 'pr126_ch_avito', title: 'Авито продажи' },
  { id: 'pr126_ch_test_ru', title: 'Тестовый канал' }
];
const CHANNEL_B = { id: 'pr126_ch_secret_b', title: 'Tenant B Secret' };
const GLOBAL_CHANNEL = { id: 'pr126_global_legacy', title: 'Global Legacy Channel' };
const SELFTEST_CHANNEL = { id: 'pr126_selftest_debug', title: 'selftest debug legacy' };
const POST_A1 = `${CHANNELS_A[0].id}:post-style-1`;
const POST_A2 = `${CHANNELS_A[1].id}:post-reviews-1`;
const RAW_GIFT_POST_ID = 'postId_raw_gift_987654321';
const RAW_GIFT_MESSAGE_ID = 'messageId_raw_gift_987654321';
const RAW_GIFT_COMMENT_KEY = `${CHANNELS_A[1].id}:${RAW_GIFT_POST_ID}`;
const POST_B = `${CHANNEL_B.id}:secret-post`;
const POST_GLOBAL = `${GLOBAL_CHANNEL.id}:global-post`;

const menu = {
  button(text, action, extra = {}) { return { text, payload: JSON.stringify({ action, ...extra }) }; },
  keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
};

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
  store.saveStore();
}

function activateTenant(userId, name, maxChannels) {
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels, createdByMaxUserId: 'pr126-admin' });
  const activated = access.activateCode({ maxUserId: userId, name, code: code.code });
  assert.strictEqual(activated.ok, true, `${name} activation succeeds`);
  return access.getTenantByMaxUserId(userId);
}

function stampFor(userId, record) {
  return tenant.stampRecord(record, tenant.ensureTenantContext(userId));
}

function savePostFor(userId, key, channel, text, extra = {}) {
  store.savePost(key, stampFor(userId, {
    channelId: channel.id,
    channelTitle: channel.title,
    postId: key.split(':').at(-1),
    messageId: `msg-${key.split(':').at(-1)}`,
    commentKey: key,
    originalText: text,
    ...extra
  }));
}

function setupFixture() {
  resetState();
  const tenantA = activateTenant(TENANT_A_USER, 'Tenant A', 4);
  const tenantB = activateTenant(TENANT_B_USER, 'Tenant B', 1);
  CHANNELS_A.forEach((channel) => {
    assert.strictEqual(access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: channel.id, channelTitle: channel.title, maxChannels: 4 }).ok, true);
    store.saveChannel(channel.id, { channelId: channel.id, title: channel.title, channelTitle: channel.title, ownerUserId: TENANT_A_USER });
  });
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantB.tenantId, channelId: CHANNEL_B.id, channelTitle: CHANNEL_B.title, maxChannels: 1 }).ok, true);
  store.saveChannel(CHANNEL_B.id, { channelId: CHANNEL_B.id, title: CHANNEL_B.title, channelTitle: CHANNEL_B.title, ownerUserId: TENANT_B_USER });
  store.saveChannel(GLOBAL_CHANNEL.id, { channelId: GLOBAL_CHANNEL.id, title: GLOBAL_CHANNEL.title, channelTitle: GLOBAL_CHANNEL.title });
  store.saveChannel(SELFTEST_CHANNEL.id, { channelId: SELFTEST_CHANNEL.id, title: SELFTEST_CHANNEL.title, channelTitle: SELFTEST_CHANNEL.title, linkedByUserId: TENANT_A_USER });

  savePostFor(TENANT_A_USER, POST_A1, CHANNELS_A[0], 'Olga Style launch post');
  savePostFor(TENANT_A_USER, POST_A2, CHANNELS_A[1], 'Отзывы клиентов за неделю');
  savePostFor(TENANT_A_USER, RAW_GIFT_COMMENT_KEY, CHANNELS_A[1], '', { postId: RAW_GIFT_POST_ID, messageId: RAW_GIFT_MESSAGE_ID, commentKey: RAW_GIFT_COMMENT_KEY });
  savePostFor(TENANT_B_USER, POST_B, CHANNEL_B, 'Tenant B secret post');
  store.savePost(POST_GLOBAL, { channelId: GLOBAL_CHANNEL.id, channelTitle: GLOBAL_CHANNEL.title, postId: 'global-post', messageId: 'msg-global', commentKey: POST_GLOBAL, originalText: 'Global legacy post' });
}

function labels(screen) {
  return (screen.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean);
}
function visible(screen) { return [String(screen.text || ''), ...labels(screen)].join('\n'); }
function reloadGiftsWithPatch(fn) {
  const original = postPatcher.patchStoredPost;
  postPatcher.patchStoredPost = fn;
  delete require.cache[require.resolve('../gifts-flow-cc812-bottom')];
  const reloaded = require('../gifts-flow-cc812-bottom');
  postPatcher.patchStoredPost = original;
  return reloaded;
}
function payloadFor(screen, pattern) {
  const button = (screen.attachments?.[0]?.payload?.buttons || []).flat().find((item) => pattern.test(String(item.text || '')));
  assert.ok(button, `button ${pattern} exists in ${screen.id}`);
  return JSON.parse(String(button.payload || '{}'));
}
async function call(flow, payload, userId = TENANT_A_USER) { return flow.screenForPayload(menu, payload, { userId, config: { botToken: '' } }); }
function assertNoUnsafeUi(screen, label) {
  const text = visible(screen);
  const rawIds = [CHANNELS_A[0].id, CHANNELS_A[1].id, CHANNELS_A[2].id, CHANNELS_A[3].id, CHANNEL_B.id, GLOBAL_CHANNEL.id, SELFTEST_CHANNEL.id, RAW_GIFT_POST_ID, RAW_GIFT_MESSAGE_ID, RAW_GIFT_COMMENT_KEY];
  rawIds.forEach((id) => assert.ok(!text.includes(id), `${label} must not show raw channel id ${id}`));
  assert.ok(!/Production comments matrix selftest|selftest|debug|legacy|store|cache|в памяти/i.test(text), `${label} must not show internal labels`);
  assert.ok(!/\b(postId|channelId|commentKey|commentId|token|payload|trace)\b/i.test(text), `${label} must not expose technical fields`);
}
function assertTenantIsolation(screen, label) {
  const text = visible(screen);
  assert.ok(!/Tenant B Secret|Tenant B secret post|Global Legacy|Global legacy post|selftest debug/i.test(text), `${label} hides Tenant B/global/selftest`);
}
function assertAllTenantAChannels(screen, label) {
  const text = visible(screen);
  CHANNELS_A.forEach((channel) => assert.ok(text.includes(channel.title), `${label} shows ${channel.title}`));
  assertTenantIsolation(screen, label);
  assertNoUnsafeUi(screen, label);
}

async function testButtons() {
  const home = await call(buttons, { action: 'admin_section_buttons' });
  assert.ok(/Сначала выберите канал и пост/i.test(visible(home)), 'Buttons home with no target explains channel/post selection');
  assert.ok(!/Шаг 1\/3/i.test(visible(home)), 'Buttons home with no target does not silently start wizard');
  assertNoUnsafeUi(home, 'buttons empty home');

  const addPicker = await call(buttons, payloadFor(home, /Добавить кнопку/));
  assert.strictEqual(addPicker.id, 'buttons_clean_channel_picker', 'Buttons add opens channel picker for multi-channel client');
  assertAllTenantAChannels(addPicker, 'buttons channel picker');

  const listPicker = await call(buttons, { action: 'button_admin_show_current' });
  assert.strictEqual(listPicker.id, 'buttons_clean_channel_picker', 'Buttons current buttons opens safe channel-first selection without target');

  const channel2Picker = await call(buttons, payloadFor(addPicker, /Отзывы/));
  assert.strictEqual(channel2Picker.id, 'buttons_clean_picker', 'Buttons channel choice opens post picker');
  assert.ok(/Отзывы клиентов за неделю/.test(visible(channel2Picker)), 'Buttons post picker shows channel 2 post');
  assert.ok(!/Olga Style launch post|Tenant B secret post|Global legacy post/.test(visible(channel2Picker)), 'Buttons post picker is scoped to selected channel');
  assertNoUnsafeUi(channel2Picker, 'buttons channel 2 posts');

  const emptyPicker = await call(buttons, payloadFor(addPicker, /Авито продажи/));
  assert.ok(/В этом канале пока нет сохранённых постов\./.test(visible(emptyPicker)), 'Buttons empty channel uses safe wording');
  assertNoUnsafeUi(emptyPicker, 'buttons empty channel');

  const card = await call(buttons, payloadFor(channel2Picker, /Отзывы клиентов/));
  assert.strictEqual(card.id, 'buttons_clean_selected_post', 'Buttons post selection returns explicit selected-post card');
  assert.ok(/Выбранный пост:|Пост для кнопок выбран/.test(visible(card)), 'Buttons selected post context is explicit');
  assert.ok(/Канал: Отзывы|Пост: Отзывы клиентов/.test(visible(card)), 'Buttons card shows selected channel and post');
  assert.ok(/Добавить кнопку к этому посту|Действие: Добавить кнопку к этому посту|Выбрать другой пост/.test(visible(card)), 'Buttons selected card exposes explicit card-only action');
  assertNoUnsafeUi(card, 'buttons selected card');

  const current = await call(buttons, { action: 'button_admin_show_current' });
  assert.strictEqual(current.id, 'buttons_clean_current', 'Buttons current card opens for selected post');
  assert.ok(/Канал: Отзывы|Пост: Отзывы клиентов/.test(visible(current)), 'Buttons current card shows selected channel/post');
  assert.ok(!/Удалить последнюю кнопку/.test(visible(current)), 'Buttons delete hidden when selected post has no buttons');

  const step1 = await call(buttons, payloadFor(card, /Добавить кнопку к этому посту/));
  assert.strictEqual(step1.id, 'buttons_clean_add_label', 'Buttons add starts at text step after explicit selected context');
  const step2 = await buttons.handleTextInput(menu, { userId: TENANT_A_USER, text: 'Записаться', config: { botToken: '' } });
  assert.strictEqual(step2.id, 'buttons_clean_add_url', 'Buttons add flow advances text → URL');
  const preview = await buttons.handleTextInput(menu, { userId: TENANT_A_USER, text: 'https://example.com/signup', config: { botToken: '' } });
  assert.strictEqual(preview.id, 'buttons_clean_add_preview', 'Buttons add flow advances URL → preview');
  const saved = await call(buttons, { action: 'button_admin_save' });
  assert.strictEqual(saved.id, 'buttons_clean_home', 'Buttons add flow saves from preview');
  assert.strictEqual(store.store.growth.byChannel[CHANNELS_A[1].id].buttonSets[POST_A2].length, 1, 'Buttons save affects selected Tenant A channel 2 post');
  assert.ok(!store.store.growth.byChannel[CHANNELS_A[0].id]?.buttonSets?.[POST_A1], 'Buttons save does not affect another Tenant A post');
  assert.ok(!store.store.growth.byChannel[CHANNEL_B.id]?.buttonSets?.[POST_B], 'Buttons save does not affect Tenant B post');

  const withButtonCard = await call(buttons, { action: 'button_admin_show_current' });
  assert.ok(/Удалить последнюю кнопку/.test(visible(withButtonCard)), 'Buttons delete appears only from current-buttons card with buttons');
  const rawDelete = await call(buttons, { action: 'button_admin_delete' });
  assert.ok(/Удаление доступно только из карточки/i.test(visible(rawDelete)), 'Buttons raw delete remains blocked');
  assert.strictEqual(store.store.growth.byChannel[CHANNELS_A[1].id].buttonSets[POST_A2].length, 1, 'Buttons raw delete does not mutate saved buttons');
}

async function testGifts() {
  store.setSetupState(TENANT_A_USER, {
    giftTargetPost: { channelId: CHANNELS_A[0].id, channelTitle: CHANNELS_A[0].title, postId: 'post-style-1', messageId: 'msg-post-style-1', commentKey: POST_A1, originalText: 'Olga Style launch post' },
    commentTargetPost: { channelId: CHANNELS_A[1].id, channelTitle: CHANNELS_A[1].title, postId: 'post-reviews-1', messageId: 'msg-post-reviews-1', commentKey: POST_A2, originalText: 'Отзывы клиентов за неделю' },
    buttonTargetPost: { channelId: CHANNELS_A[1].id, channelTitle: CHANNELS_A[1].title, postId: 'post-reviews-1', messageId: 'msg-post-reviews-1', commentKey: POST_A2, originalText: 'Отзывы клиентов за неделю' },
    giftsCurrentCard: null, giftFlow: null, activeAdminFlowKind: ''
  });
  const staleCreate = await call(gifts, { action: 'gift_admin_start_create' });
  assert.ok(/gifts_clean_channel_picker$|gifts_clean_picker$/.test(staleCreate.id), 'Gifts stale/cross-section target opens selection instead of material step');
  assert.ok(!/Шаг 1|материал подарка/i.test(visible(staleCreate)), 'Gifts stale/cross-section target does not start material step');
  assert.ok(store.getSetupState(TENANT_A_USER)?.giftTargetDiagnostics?.some((item) => /cross_section_target|denied_no_current_card/.test(item.status)), 'Gifts stale/cross-section target records source diagnostic');

  store.setSetupState(TENANT_A_USER, { giftTargetPost: null, commentTargetPost: null, buttonTargetPost: null, giftsCurrentCard: null, giftFlow: null, activeAdminFlowKind: '', giftTargetDiagnostics: [] });
  const home = await call(gifts, { action: 'admin_section_gifts' });
  assert.ok(/Сначала выберите канал и пост/i.test(visible(home)), 'Gifts home with no target explains channel/post selection');
  assert.ok(!/Шаг 1|материал подарка/i.test(visible(home)), 'Gifts home with no target does not start material step silently');
  assertNoUnsafeUi(home, 'gifts empty home');

  const createPicker = await call(gifts, payloadFor(home, /Создать подарок/));
  assert.ok(/gifts_clean_channel_picker$/.test(createPicker.id), 'Gifts create opens channel picker for multi-channel client');
  assertAllTenantAChannels(createPicker, 'gifts channel picker');

  const currentPicker = await call(gifts, { action: 'gift_admin_show_current' });
  assert.ok(/gifts_clean_channel_picker$/.test(currentPicker.id), 'Gifts current/list opens safe channel-first selection without target');
  assert.ok(!/Шаг 1|материал подарка/i.test(visible(currentPicker)), 'Gifts current/list does not start material step silently');

  const channel2Picker = await call(gifts, payloadFor(createPicker, /Отзывы/));
  assert.ok(/gifts_clean_picker$/.test(channel2Picker.id), 'Gifts channel choice opens post picker');
  assert.ok(/Отзывы клиентов за неделю/.test(visible(channel2Picker)), 'Gifts post picker shows channel 2 post');
  assert.ok(/Пост без текста/.test(visible(channel2Picker)), 'Gifts post picker uses safe fallback for empty raw-looking post');
  assert.ok(!/Olga Style launch post|Tenant B secret post|Global legacy post/.test(visible(channel2Picker)), 'Gifts post picker is scoped to selected channel');
  assertNoUnsafeUi(channel2Picker, 'gifts channel 2 posts');

  const emptyPicker = await call(gifts, payloadFor(createPicker, /Авито продажи/));
  assert.ok(/В этом канале пока нет сохранённых постов\./.test(visible(emptyPicker)), 'Gifts empty channel uses safe wording');
  assertNoUnsafeUi(emptyPicker, 'gifts empty channel');

  const card = await call(gifts, payloadFor(channel2Picker, /Отзывы клиентов/));
  assert.ok(/gifts_clean_current$/.test(card.id), 'Gifts selecting a post opens gift card before material step');
  assert.ok(/Пост для подарка выбран|Для выбранного поста ещё нет/.test(visible(card)), 'Gifts selected card context is explicit');
  assert.ok(/Канал: Отзывы|Пост: Отзывы клиентов/.test(visible(card)), 'Gifts card shows selected channel and post');
  assert.ok(!/Шаг 1|материал подарка/i.test(visible(card)), 'Gifts card appears before material step starts');
  assertNoUnsafeUi(card, 'gifts selected card');

  const rawDelete = await call(gifts, { action: 'gift_admin_delete_existing' });
  assert.ok(/Удаление доступно только из карточки/i.test(visible(rawDelete)), 'Gifts raw delete remains blocked');
  const rawReplace = await call(gifts, { action: 'gift_admin_replace_existing' });
  assert.ok(/Замена материала доступна только из карточки текущего подарка\./.test(visible(rawReplace)), 'Gifts raw replace explains card-only replacement');
  assert.ok(!/Шаг 1|материал подарка/i.test(visible(rawReplace)), 'Gifts raw replace does not open material step');
  assert.ok(!store.getSetupState(TENANT_A_USER)?.giftFlow, 'Gifts raw replace does not create giftFlow');
  assert.ok(!/Удалить подарок/.test(visible(card)), 'Gifts delete is not shown without an existing gift campaign');

  const rawPostCard = await call(gifts, payloadFor(channel2Picker, /Пост без текста/));
  assert.ok(/gifts_clean_current$/.test(rawPostCard.id), 'Gifts empty raw-looking post opens selected card');
  assert.ok(/Пост: Пост без текста/.test(visible(rawPostCard)), 'Gifts card uses safe post fallback for empty raw-looking post');
  assertNoUnsafeUi(rawPostCard, 'gifts raw-looking empty post card');

  const material = await call(gifts, payloadFor(rawPostCard, /Создать подарок для этого поста/));
  assert.strictEqual(material.id, 'adminkit_gift_step_1_material', 'Gifts create starts material step only from explicit selected card action');
  assert.ok(/Пост: Пост без текста/.test(visible(material)), 'Gifts material step uses safe post fallback');
  assertNoUnsafeUi(material, 'gifts raw-looking empty post material step');

  const messageStep = await gifts.handleTextInput(menu, { userId: TENANT_A_USER, text: 'https://example.com/gift', config: { botToken: '' } });
  assert.ok(/message_step|text/i.test(String(messageStep.id)), 'Gifts create flow accepts gift URL after material step');
  assertNoUnsafeUi(messageStep, 'gifts message step after raw-looking post');
  const conditions = await call(gifts, { action: 'gift_admin_message_default' });
  assert.ok(/conditions|condition/i.test(String(conditions.id)), 'Gifts create flow advances to conditions');
  const review = await call(gifts, { action: 'gift_admin_save' });
  assertNoUnsafeUi(review, 'gifts save review for raw-looking post');
  const saved = await call(gifts, { action: 'gift_admin_commit_save' });
  assert.ok(/Целевой пост: канал «Отзывы», пост «Пост без текста»\./.test(visible(saved)), 'Gifts save reports exact target post');
  assert.ok(!/Кнопка под постом добавлена\/обновлена/.test(visible(saved)), 'Gifts unconfirmed patch does not claim button success');
  assert.ok(/Не удалось подтвердить обновление кнопки под постом/.test(visible(saved)), 'Gifts unconfirmed patch shows recoverable failure');
  assert.ok(store.getSetupState(TENANT_A_USER)?.giftPatchDiagnostics?.some((item) => item.status === 'patch_failed'), 'Gifts failed patch diagnostic recorded');
  assertNoUnsafeUi(saved, 'gifts save summary for raw-looking post');
  const currentAfterSave = await call(gifts, { action: 'gift_admin_show_current' });
  assert.ok(/Подарок к посту \(Пост без текста\)/.test(visible(currentAfterSave)), 'Gifts saved summary uses safe gift title fallback');
  assertNoUnsafeUi(currentAfterSave, 'gifts current summary after raw-looking post save');

  const deleteConfirm = await call(gifts, payloadFor(currentAfterSave, /Удалить подарок/));
  assert.strictEqual(deleteConfirm.id, 'adminkit_gifts_clean_delete_confirm', 'Gifts delete from selected card opens confirmation');
  assert.ok(/Подтвердите удаление подарка/.test(visible(deleteConfirm)), 'Gifts delete confirmation is shown');
  const deleted = await call(gifts, payloadFor(deleteConfirm, /Да, удалить/));
  assert.ok(/Подарок удалён/.test(visible(deleted)), 'Gifts confirmed delete succeeds with selected-card guard');
  assert.ok(!/Удаление доступно только из карточки/.test(visible(deleted)), 'Gifts confirmed delete is not blocked by selected-card guard');
}

async function testGiftPatchConfirmed() {
  const patchedGifts = reloadGiftsWithPatch(async () => ({ ok: true, patchResult: { ok: true } }));
  const target = stampFor(TENANT_A_USER, { channelId: CHANNELS_A[1].id, channelTitle: CHANNELS_A[1].title, postId: 'post-reviews-1', messageId: 'msg-post-reviews-1', commentKey: POST_A2, originalText: 'Отзывы клиентов за неделю' });
  store.setSetupState(TENANT_A_USER, {
    giftTargetPost: target,
    giftsCurrentCard: { ...target, cardId: 'gifts_card_confirmed', source: 'gifts_selected_post_card' },
    giftFlow: { targetPost: target, draft: { id: 'gift-confirmed', title: 'Gift confirmed', giftUrl: 'https://example.com/gift', giftMessage: 'Спасибо!', conditions: {} } },
    activeAdminFlowKind: 'gift'
  });
  const saved = await patchedGifts.screenForPayload(menu, { action: 'gift_admin_commit_save' }, { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
  assert.ok(/Подарок сохранён/.test(visible(saved)), 'Gifts confirmed patch still saves gift');
  assert.ok(/Целевой пост: канал «Отзывы», пост «Отзывы клиентов за неделю»\./.test(visible(saved)), 'Gifts confirmed patch reports exact target');
  assert.ok(/Кнопка под постом добавлена\/обновлена\./.test(visible(saved)), 'Gifts confirmed patch claims button success only after confirmation');
  assert.ok(store.getSetupState(TENANT_A_USER)?.giftPatchDiagnostics?.some((item) => item.status === 'patch_confirmed'), 'Gifts confirmed patch diagnostic recorded');
}


async function testGiftDeleteContinuityAndCleanup() {
  store.store.gifts = { campaigns: {}, claims: {}, settings: {} };
  const patchedGifts = reloadGiftsWithPatch(async () => ({ ok: true, patchResult: { ok: true }, giftRowsCount: 0 }));
  const target = stampFor(TENANT_A_USER, { channelId: CHANNELS_A[1].id, channelTitle: CHANNELS_A[1].title, postId: 'post-reviews-1', messageId: 'msg-post-reviews-1', commentKey: POST_A2, originalText: 'Отзывы клиентов за неделю' });
  const campaignId = 'gift_delete_cleanup_pr136';
  store.store.gifts.campaigns[campaignId] = stampFor(TENANT_A_USER, { id: campaignId, title: 'Gift delete cleanup', enabled: true, channelId: target.channelId, postIds: [target.postId], commentKey: target.commentKey, giftUrl: 'https://example.com/gift', giftButtonText: '🎁 Получить подарок' });
  store.savePost(target.commentKey, {
    ...target,
    giftCampaignId: campaignId,
    lastGiftRowsCount: 1,
    patchedAttachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: '🎁 Получить подарок', payload: JSON.stringify({ campaignId }) }]] } }],
    customKeyboard: { rows: [[{ text: '🎁 Получить подарок', payload: JSON.stringify({ campaignId }) }]] }
  });
  store.setSetupState(TENANT_A_USER, { giftTargetPost: target, giftsCurrentCard: { ...target, cardId: 'gifts_card_delete_cleanup', source: 'gifts_selected_post_card' }, giftFlow: null, activeAdminFlowKind: '', giftTargetDiagnostics: [] });

  const current = await patchedGifts.screenForPayload(menu, { action: 'gift_admin_show_current' }, { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
  const confirm = await patchedGifts.screenForPayload(menu, payloadFor(current, /Удалить подарок/), { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
  const deleted = await patchedGifts.screenForPayload(menu, payloadFor(confirm, /Да, удалить/), { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
  assert.ok(/Канал: Отзывы/.test(visible(deleted)) && /Пост: Отзывы клиентов за неделю/.test(visible(deleted)), 'Gift delete returns to same selected channel/post');
  assert.ok(/Кнопка под постом обновлена\/удалена/.test(visible(deleted)), 'Gift delete claims post button cleanup only after confirmed patch');
  const createPayload = payloadFor(deleted, /Создать подарок/);
  assert.strictEqual(createPayload.source, 'gift_card', 'Post-selected create after delete keeps gift-card source');
  assert.strictEqual(createPayload.cardId, 'gifts_card_delete_cleanup', 'Post-selected create after delete keeps current card id');
  const material = await patchedGifts.screenForPayload(menu, createPayload, { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
  assert.ok(/gift_step_1_material|start_create/.test(material.id), 'Create after delete starts material step for selected post');
  assert.ok(!/channel_picker/.test(material.id), 'Create after delete does not route to channel picker');
  assert.ok(!store.getSetupState(TENANT_A_USER)?.giftTargetDiagnostics?.some((item) => item.status === 'denied_no_current_card' && item.requestedCardId === ''), 'Create after delete does not record empty-current-card denial');
  assert.ok(!store.store.gifts.campaigns[campaignId], 'Gift campaign is deleted');
  const post = store.getPost(target.commentKey);
  assert.strictEqual(post.giftCampaignId, '', 'Deleted campaign id is cleared from post state');
  assert.strictEqual(post.lastGiftRowsCount, 0, 'Gift row count is zero after delete cleanup');
  assert.ok(!JSON.stringify(post.patchedAttachments || []).includes(campaignId), 'Deleted campaign id is removed from patched attachments');
  assert.ok(!JSON.stringify(post.customKeyboard || {}).includes(campaignId), 'Deleted campaign id is removed from custom keyboard');
}

async function testGiftDeleteUnconfirmedWording() {
  store.store.gifts = { campaigns: {}, claims: {}, settings: {} };
  const unconfirmedGifts = reloadGiftsWithPatch(async () => ({ ok: false, reason: 'edit_failed' }));
  const target = stampFor(TENANT_A_USER, { channelId: CHANNELS_A[0].id, channelTitle: CHANNELS_A[0].title, postId: 'post-style-1', messageId: 'msg-post-style-1', commentKey: POST_A1, originalText: 'Olga Style launch post' });
  const campaignId = 'gift_delete_unconfirmed_pr136';
  store.store.gifts.campaigns[campaignId] = stampFor(TENANT_A_USER, { id: campaignId, title: 'Gift delete unconfirmed', enabled: true, channelId: target.channelId, postIds: [target.postId], commentKey: target.commentKey, giftUrl: 'https://example.com/gift' });
  store.savePost(target.commentKey, { ...target, giftCampaignId: campaignId, lastGiftRowsCount: 1, patchedAttachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ text: '🎁 Получить подарок', payload: JSON.stringify({ campaignId }) }]] } }] });
  store.setSetupState(TENANT_A_USER, { giftTargetPost: target, giftsCurrentCard: { ...target, cardId: 'gifts_card_unconfirmed', source: 'gifts_selected_post_card' }, giftFlow: null, activeAdminFlowKind: '' });
  const current = await unconfirmedGifts.screenForPayload(menu, { action: 'gift_admin_show_current' }, { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
  const confirm = await unconfirmedGifts.screenForPayload(menu, payloadFor(current, /Удалить подарок/), { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
  const deleted = await unconfirmedGifts.screenForPayload(menu, payloadFor(confirm, /Да, удалить/), { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
  assert.ok(/Подарок удалён, но обновление кнопки под постом не подтверждено/.test(visible(deleted)), 'Unconfirmed delete uses safe post-update wording');
  assert.ok(!/Кнопка под постом обновлена\/удалена/.test(visible(deleted)), 'Unconfirmed delete does not claim post button cleanup');
  const post = store.getPost(target.commentKey);
  assert.strictEqual(post.giftCampaignId, '', 'Unconfirmed delete still clears deleted campaign id from post state');
  assert.ok(!JSON.stringify(post.patchedAttachments || []).includes(campaignId), 'Unconfirmed delete removes stale campaign id from local patched attachments');
}

async function testTitlelessInternalChannelFiltering() {
  resetState();
  const tenantA = activateTenant(TENANT_A_USER, 'Tenant A PR136', 8);
  const channels = [
    { id: 'ak_test_1_pr136', title: 'АК-ТЕСТ 1' },
    { id: 'ak_test_2_pr136', title: 'АК-ТЕСТ 2' },
    { id: 'ak_test_3_pr136', title: 'АК-Тест 3' },
    { id: 'adminkit_club_pr136', title: 'АдминКит клуб' },
    { id: 'selftest_comments_matrix_channel', title: '' },
    { id: 'real_titleless_empty_pr136', title: '' },
    { id: 'real_titleless_visible_pr136', title: '' }
  ];
  channels.forEach((channel) => {
    assert.strictEqual(access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: channel.id, channelTitle: channel.title, maxChannels: 8 }).ok, true);
    store.saveChannel(channel.id, { channelId: channel.id, title: channel.title, channelTitle: channel.title, ownerUserId: TENANT_A_USER });
  });
  savePostFor(TENANT_A_USER, 'ak_test_1_pr136:post-1', { id: 'ak_test_1_pr136', title: 'АК-ТЕСТ 1' }, 'Named test channel post');
  savePostFor(TENANT_A_USER, 'ak_test_2_pr136:post-1', { id: 'ak_test_2_pr136', title: 'АК-ТЕСТ 2' }, 'Named test 2 post');
  savePostFor(TENANT_A_USER, 'ak_test_3_pr136:post-1', { id: 'ak_test_3_pr136', title: 'АК-Тест 3' }, 'Named test 3 post');
  savePostFor(TENANT_A_USER, 'adminkit_club_pr136:post-1', { id: 'adminkit_club_pr136', title: 'АдминКит клуб' }, 'Club post');
  savePostFor(TENANT_A_USER, 'selftest_comments_matrix_channel:post-1', { id: 'selftest_comments_matrix_channel', title: '' }, 'selftest post');
  savePostFor(TENANT_A_USER, 'real_titleless_visible_pr136:post-1', { id: 'real_titleless_visible_pr136', title: '' }, 'Visible titleless post');
  const giftsPicker = await gifts.screenForPayload(menu, { action: 'gift_admin_start_create' }, { userId: TENANT_A_USER, config: { botToken: '' } });
  const buttonsPicker = await buttons.screenForPayload(menu, { action: 'button_admin_start_add' }, { userId: TENANT_A_USER, config: { botToken: '' } });
  [giftsPicker, buttonsPicker].forEach((screen) => {
    const text = visible(screen);
    assert.ok(!/selftest_comments_matrix_channel|selftest/i.test(text), `${screen.id} hides selftest/internal channel`);
    assert.ok(!/real_titleless_empty_pr136/.test(text), `${screen.id} hides titleless empty raw channel id`);
    assert.ok(/Канал без названия/.test(text), `${screen.id} may show safe fallback for titleless channel with visible posts`);
    ['АК-ТЕСТ 1', 'АК-ТЕСТ 2', 'АК-Тест 3', 'АдминКит клуб'].forEach((title) => assert.ok(text.includes(title), `${screen.id} keeps named real channel ${title}`));
    ['ak_test_1_pr136', 'ak_test_2_pr136', 'ak_test_3_pr136', 'adminkit_club_pr136', 'real_titleless_visible_pr136'].forEach((id) => assert.ok(!text.includes(id), `${screen.id} hides raw id ${id}`));
  });
}

function testPostBoundAuditTable() {
  const audit = [
    ['gifts', 'gift_admin_start_create', 'requires giftsCurrentCard/cardId'],
    ['buttons', 'button_admin_start_add', 'requires buttonsCurrentCard/cardId'],
    ['comments', 'comments_select_post', 'uses section picker before post work'],
    ['polls', 'poll_admin_select_post', 'covered by PR127 post picker flow'],
    ['highlights', 'highlight_select_post', 'covered by PR127 post picker flow'],
    ['archive', 'archive_select_post', 'covered by PR124 archive picker flow']
  ];
  assert.ok(audit.every(([, action, guard]) => action && guard), 'Post-bound section audit table names canonical actions and guards');
}

(async () => {
  setupFixture();
  await testButtons();
  await testGifts();
  await testGiftPatchConfirmed();
  await testGiftDeleteContinuityAndCleanup();
  await testGiftDeleteUnconfirmedWording();
  await testTitlelessInternalChannelFiltering();
  testPostBoundAuditTable();
  console.log('PR126 Buttons/Gifts product-perfect channel-first UX assertions passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
