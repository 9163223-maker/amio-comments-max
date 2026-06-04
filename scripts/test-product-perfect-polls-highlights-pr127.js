'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const tenant = require('../tenant-scope');
const access = require('../services/clientAccessService');
const polls = require('../poll-flow-15313');
const highlights = require('../highlight-flow-15311');
const pollService = require('../services/pollService');
const maxApi = require('../services/maxApi');

const TENANT_A_USER = 'pr127-tenant-a';
const TENANT_B_USER = 'pr127-tenant-b';
const CHANNELS_A = [
  { id: 'pr127_ch_olga', title: 'Olga Style' },
  { id: 'pr127_ch_reviews', title: 'Отзывы' },
  { id: 'pr127_ch_avito', title: 'Авито продажи' },
  { id: 'pr127_ch_test_ru', title: 'Тестовый канал' }
];
const CHANNEL_B = { id: 'pr127_ch_secret_b', title: 'Tenant B Secret' };
const GLOBAL_CHANNEL = { id: 'pr127_global_legacy', title: 'Global Legacy Channel' };
const SELFTEST_CHANNEL = { id: 'pr127_selftest_debug', title: 'selftest debug legacy' };
const POST_A1 = `${CHANNELS_A[0].id}:style-post-1`;
const POST_A2 = `${CHANNELS_A[1].id}:reviews-post-1`;
const RAW_POST_ID = 'postId_raw_pr127_987654321';
const RAW_MESSAGE_ID = 'messageId_raw_pr127_987654321';
const RAW_COMMENT_KEY = `${CHANNELS_A[1].id}:${RAW_POST_ID}`;
const POST_B = `${CHANNEL_B.id}:secret-post`;
const POST_GLOBAL = `${GLOBAL_CHANNEL.id}:global-post`;
const RAW_POLL_ID = 'pollId_raw_pr127_123456789';
const RAW_HIGHLIGHT_ID = 'highlightId_raw_pr127_123456789';

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
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels, createdByMaxUserId: 'pr127-admin' });
  const activated = access.activateCode({ maxUserId: userId, name, code: code.code });
  assert.strictEqual(activated.ok, true, `${name} activation succeeds`);
  return access.getTenantByMaxUserId(userId);
}

function stampFor(userId, record) { return tenant.stampRecord(record, tenant.ensureTenantContext(userId)); }

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
  savePostFor(TENANT_A_USER, RAW_COMMENT_KEY, CHANNELS_A[1], '', { postId: RAW_POST_ID, messageId: RAW_MESSAGE_ID, commentKey: RAW_COMMENT_KEY });
  savePostFor(TENANT_B_USER, POST_B, CHANNEL_B, 'Tenant B secret post');
  store.savePost(POST_GLOBAL, { channelId: GLOBAL_CHANNEL.id, channelTitle: GLOBAL_CHANNEL.title, postId: 'global-post', messageId: 'msg-global', commentKey: POST_GLOBAL, originalText: 'Global legacy post' });
}

function labels(screen) { return (screen.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(screen) { return [String(screen.text || ''), ...labels(screen)].join('\n'); }
function payloadFor(screen, pattern) {
  const button = (screen.attachments?.[0]?.payload?.buttons || []).flat().find((item) => pattern.test(String(item.text || '')));
  assert.ok(button, `button ${pattern} exists in ${screen.id}`);
  return JSON.parse(String(button.payload || '{}'));
}
function assertAllTenantAChannels(screen, label) {
  const text = visible(screen);
  CHANNELS_A.forEach((channel) => assert.ok(text.includes(channel.title), `${label} shows ${channel.title}`));
  assert.ok(!text.includes(CHANNEL_B.title), `${label} hides Tenant B channel`);
  assert.ok(!text.includes(GLOBAL_CHANNEL.title), `${label} hides global channel`);
  assert.ok(!/selftest debug legacy/i.test(text), `${label} hides selftest channel`);
  assertNoUnsafeUi(screen, label);
}
function assertNoUnsafeUi(screen, label) {
  const text = visible(screen);
  const rawIds = [
    ...CHANNELS_A.map((c) => c.id), CHANNEL_B.id, GLOBAL_CHANNEL.id, SELFTEST_CHANNEL.id,
    RAW_POST_ID, RAW_MESSAGE_ID, RAW_COMMENT_KEY, POST_A1, POST_A2, POST_B, POST_GLOBAL, RAW_POLL_ID, RAW_HIGHLIGHT_ID
  ];
  rawIds.forEach((id) => assert.ok(!text.includes(id), `${label} must not show raw id ${id}`));
  assert.ok(!/selftest|debug|legacy|store|cache|в памяти/i.test(text), `${label} must not show internal wording`);
  assert.ok(!/\b(postId|channelId|commentKey|commentId|pollId|highlightId|token|payload|trace)\b/i.test(text), `${label} must not expose raw field names`);
}

async function testPolls() {
  const home = polls.home(menu, TENANT_A_USER);
  assert.ok(/Пост не выбран|выберите канал, затем пост/i.test(visible(home)), 'Polls home with no target explains channel/post selection');
  assert.ok(!/Свой опрос|Вопрос:|Ответы:/.test(visible(home)), 'Polls home with no target does not silently start builder');
  assertNoUnsafeUi(home, 'polls empty home');

  const channelPicker = polls.picker(menu, TENANT_A_USER);
  assert.strictEqual(channelPicker.id, 'polls_channel_picker', 'Polls create opens channel picker for multi-channel client');
  assertAllTenantAChannels(channelPicker, 'polls channel picker');

  const channel2Picker = polls.picker(menu, TENANT_A_USER, payloadFor(channelPicker, /Отзывы/).channelId);
  assert.strictEqual(channel2Picker.id, 'polls_post_picker', 'Polls channel choice opens post picker');
  assert.ok(/Отзывы клиентов за неделю/.test(visible(channel2Picker)), 'Polls post picker shows channel 2 post');
  assert.ok(/Пост без текста/.test(visible(channel2Picker)), 'Polls post picker uses safe fallback for empty raw-looking post');
  assert.ok(!/Olga Style launch post|Tenant B secret post|Global legacy post/.test(visible(channel2Picker)), 'Polls post picker is scoped to selected channel');
  assertNoUnsafeUi(channel2Picker, 'polls channel 2 posts');

  const emptyPicker = polls.picker(menu, TENANT_A_USER, payloadFor(channelPicker, /Авито продажи/).channelId);
  assert.ok(/В этом канале пока нет сохранённых постов\./.test(visible(emptyPicker)), 'Polls empty channel uses safe wording');
  assert.ok(!/в памяти/i.test(visible(emptyPicker)), 'Polls empty channel does not use memory wording');
  assertNoUnsafeUi(emptyPicker, 'polls empty channel');

  const card = polls.picked(menu, payloadFor(channel2Picker, /Отзывы клиентов/).commentKey, TENANT_A_USER);
  assert.strictEqual(card.id, 'polls_picked', 'Polls selecting a post opens selected card before builder');
  assert.ok(/Канал: Отзывы/.test(visible(card)) && /Пост: Отзывы клиентов за неделю/.test(visible(card)), 'Polls card shows selected channel/post');
  assert.ok(!/Шаг 1|Напишите одним сообщением вопрос/.test(visible(card)), 'Polls builder does not start before selected card action');
  assertNoUnsafeUi(card, 'polls selected card');

  const selectedHome = polls.home(menu, TENANT_A_USER);
  assert.ok(/Выбранный канал: Отзывы/.test(visible(selectedHome)) && /Выбранный пост: Отзывы клиентов за неделю/.test(visible(selectedHome)), 'Polls home shows selected context');
  assert.ok(/Создать опрос к выбранному посту/.test(visible(selectedHome)) && /Выбрать другой пост/.test(visible(selectedHome)), 'Polls home actions are explicit');
  assertNoUnsafeUi(selectedHome, 'polls selected home');

  let quickCreates = 0;
  let customCreates = 0;
  const originalQuick = pollService.createQuickPoll;
  const originalCustom = pollService.createPoll;
  const originalRows = pollService.buildPollKeyboardRows;
  const originalEdit = maxApi.editMessage;
  pollService.createQuickPoll = async () => { quickCreates += 1; return { ok: true, poll: { id: 101, question: 'Safe quick question', options: [{ text: 'Да' }, { text: 'Нет' }] } }; };
  pollService.createPoll = async () => { customCreates += 1; return { ok: true, poll: { id: 102, question: 'Safe custom question', options: [{ text: 'Да' }, { text: 'Нет' }] } }; };
  pollService.buildPollKeyboardRows = async () => [];
  maxApi.editMessage = async () => { throw new Error('patch_failed raw internal Postgres details'); };
  try {
    const quickPayload = payloadFor(card, /Да \/ Нет/);
    assert.strictEqual(quickPayload.source, 'poll_card', 'Polls quick create button carries poll_card marker');

    const rawCreate = await polls.createPoll(menu, { userId: TENANT_A_USER, commentKey: quickPayload.commentKey, template: quickPayload.template, source: '' });
    assert.strictEqual(rawCreate.id, 'poll_card_required', 'Polls raw/stale quick create is blocked without poll_card source');
    assert.ok(/Создание опроса доступно только из карточки выбранного поста\./.test(visible(rawCreate)), 'Polls raw quick create returns card-required wording');
    assert.strictEqual(quickCreates, 0, 'Polls raw quick create does not call poll creation service');
    assertNoUnsafeUi(rawCreate, 'polls raw quick create');

    const rawCustom = await polls.customStart(menu, { userId: TENANT_A_USER, commentKey: quickPayload.commentKey, source: '' });
    assert.strictEqual(rawCustom.id, 'poll_card_required', 'Polls raw/stale custom start is blocked without poll_card source');
    assert.ok(!/Напишите одним сообщением вопрос/.test(visible(rawCustom)), 'Polls raw custom start does not open question flow');
    assertNoUnsafeUi(rawCustom, 'polls raw custom start');

    const created = await polls.createPoll(menu, { userId: TENANT_A_USER, commentKey: quickPayload.commentKey, template: quickPayload.template, source: 'poll_card', config: { botToken: '', appBaseUrl: '', botUsername: '', maxDeepLinkBase: '' } });
    assert.strictEqual(created.id, 'poll_created', 'Polls card-marked quick create works from selected post card');
    assert.strictEqual(quickCreates, 1, 'Polls card-marked quick create calls poll creation service once');
    assert.ok(/Опрос создан/.test(visible(created)) && /Результаты будут сохраняться автоматически/.test(visible(created)), 'Polls created screen uses product-safe success wording');
    assert.ok(/Опрос сохранён, но кнопки под постом пока не обновились\. Проверьте подключение канала и повторите позже\./.test(visible(created)), 'Polls created screen uses product-safe post update failure wording');
    assert.ok(!/Postgres|в базе|пропатч|patch_failed|raw internal|Error:/i.test(visible(created)), 'Polls created screen hides DB/patch/internal wording');
    assertNoUnsafeUi(created, 'polls created quick poll');

    const customPayload = payloadFor(card, /Свой вопрос/);
    assert.strictEqual(customPayload.source, 'poll_card', 'Polls custom start button carries poll_card marker');
    const customQuestion = await polls.customStart(menu, { userId: TENANT_A_USER, commentKey: customPayload.commentKey, source: 'poll_card' });
    assert.strictEqual(customQuestion.id, 'poll_custom_question', 'Polls card-marked custom start opens question step');
    assert.ok(/Напишите одним сообщением вопрос/.test(visible(customQuestion)), 'Polls card-marked custom start begins custom flow');
    assert.strictEqual(customCreates, 0, 'Polls custom start does not create poll before custom answers');
    assertNoUnsafeUi(customQuestion, 'polls custom question');
  } finally {
    pollService.createQuickPoll = originalQuick;
    pollService.createPoll = originalCustom;
    pollService.buildPollKeyboardRows = originalRows;
    maxApi.editMessage = originalEdit;
  }

  const rawStop = await polls.stopPoll(menu, { userId: TENANT_A_USER, pollId: RAW_POLL_ID, source: '' });
  assert.strictEqual(rawStop.id, 'poll_stop_blocked', 'Polls raw stop remains blocked');
  assert.ok(/Откройте карточку активного опроса/.test(visible(rawStop)), 'Polls stop remains active-card only');
  assertNoUnsafeUi(rawStop, 'polls raw stop');

  const rawPostCard = polls.picked(menu, payloadFor(channel2Picker, /Пост без текста/).commentKey, TENANT_A_USER);
  assert.ok(/Пост: Пост без текста/.test(visible(rawPostCard)), 'Polls empty raw-looking post card uses safe fallback');
  assertNoUnsafeUi(rawPostCard, 'polls raw-looking post card');
}

async function testHighlights() {
  store.setSetupState(TENANT_A_USER, { pollTargetPost: null, highlightTargetPost: null });
  const home = highlights.home(menu, TENANT_A_USER);
  assert.ok(/Пост не выбран|выберите канал, затем пост/i.test(visible(home)), 'Highlights home with no target explains channel/post selection');
  assert.ok(!/Выберите тип метки|Применить/.test(visible(home)), 'Highlights home with no target does not silently apply highlight');
  assertNoUnsafeUi(home, 'highlights empty home');

  const channelPicker = highlights.picker(menu, TENANT_A_USER);
  assert.strictEqual(channelPicker.id, 'highlights_channel_picker', 'Highlights apply/check opens channel picker for multi-channel client');
  assertAllTenantAChannels(channelPicker, 'highlights channel picker');

  const channel2Picker = highlights.picker(menu, TENANT_A_USER, payloadFor(channelPicker, /Отзывы/).channelId);
  assert.strictEqual(channel2Picker.id, 'highlights_post_picker', 'Highlights channel choice opens post picker');
  assert.ok(/Отзывы клиентов за неделю/.test(visible(channel2Picker)), 'Highlights post picker shows channel 2 post');
  assert.ok(/Пост без текста/.test(visible(channel2Picker)), 'Highlights post picker uses safe fallback for empty raw-looking post');
  assert.ok(!/Olga Style launch post|Tenant B secret post|Global legacy post/.test(visible(channel2Picker)), 'Highlights post picker is scoped to selected channel');
  assertNoUnsafeUi(channel2Picker, 'highlights channel 2 posts');

  const emptyPicker = highlights.picker(menu, TENANT_A_USER, payloadFor(channelPicker, /Авито продажи/).channelId);
  assert.ok(/В этом канале пока нет сохранённых постов\./.test(visible(emptyPicker)), 'Highlights empty channel uses safe wording');
  assertNoUnsafeUi(emptyPicker, 'highlights empty channel');

  const card = highlights.picked(menu, payloadFor(channel2Picker, /Отзывы клиентов/).commentKey, TENANT_A_USER);
  assert.strictEqual(card.id, 'highlight_picked', 'Highlights selecting a post opens selected card before apply/remove');
  assert.ok(/Канал: Отзывы/.test(visible(card)) && /Пост: Отзывы клиентов за неделю/.test(visible(card)), 'Highlights card shows selected channel/post');
  assert.ok(/Применить/.test(visible(card)), 'Highlights apply actions are shown only on selected card');
  assertNoUnsafeUi(card, 'highlights selected card');

  const selectedHome = highlights.home(menu, TENANT_A_USER);
  assert.ok(/Выбранный канал: Отзывы/.test(visible(selectedHome)) && /Выбранный пост: Отзывы клиентов за неделю/.test(visible(selectedHome)), 'Highlights home shows selected context');
  assert.ok(/Поставить выделение на выбранный пост/.test(visible(selectedHome)) && /Выбрать другой пост/.test(visible(selectedHome)), 'Highlights home actions are explicit');
  assertNoUnsafeUi(selectedHome, 'highlights selected home');

  const rawApply = await highlights.apply(menu, { userId: TENANT_A_USER, commentKey: RAW_COMMENT_KEY, source: '', badgeId: 'important' });
  assert.strictEqual(rawApply.id, 'highlight_card_required', 'Highlights raw apply remains blocked');
  const rawRemove = await highlights.remove(menu, { userId: TENANT_A_USER, commentKey: RAW_COMMENT_KEY, source: '' });
  assert.strictEqual(rawRemove.id, 'highlight_card_required', 'Highlights raw remove remains blocked');
  assertNoUnsafeUi(rawApply, 'highlights raw apply');
  assertNoUnsafeUi(rawRemove, 'highlights raw remove');

  const rawPostCard = highlights.picked(menu, payloadFor(channel2Picker, /Пост без текста/).commentKey, TENANT_A_USER);
  assert.ok(/Пост: Пост без текста/.test(visible(rawPostCard)), 'Highlights empty raw-looking post card uses safe fallback');
  assertNoUnsafeUi(rawPostCard, 'highlights raw-looking post card');
}

(async () => {
  setupFixture();
  await testPolls();
  await testHighlights();
  console.log('PR127 Polls/Highlights product-perfect channel-first UX assertions passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
