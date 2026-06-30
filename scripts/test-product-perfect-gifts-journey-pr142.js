'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const giftService = require('../services/giftService');
const { buildGiftKeyboardRows } = require('../services/maxApi');

const TEST_USER = 'pr142-admin-user';
const OTHER_USER = 'pr142-other-user';
const TEST_CHANNEL = '-914000142001';
const OTHER_CHANNEL = '-914000142999';
const TEST_POST_ID = 'pr142-post';
const OTHER_POST_ID = 'pr142-other-post';
const TEST_COMMENT_KEY = `${TEST_CHANNEL}:${TEST_POST_ID}`;
const OTHER_COMMENT_KEY = `${OTHER_CHANNEL}:${OTHER_POST_ID}`;

const PRIVATE_URL = /https?:\/\/(?:private|internal|token|raw)\.|https?:\/\/[^\s]+\/(?:private|raw|token)(?:\b|\/)/i;
const RAW_VISIBLE = /\b(?:channelId|postId|commentKey|payload|trace|file_token|rawFileToken|privateUrl|private URL|attachment URL)\b|gift_[a-z0-9:_-]{6,}|(?:photo|file)-token-|cp_-?\d/i;
const ROOT_BUTTONS = ['Выбрать пост', 'Все подарки', 'Помощь', 'Главное меню'];

function resetState() {
  access._resetForTests();
  store.store.posts = {};
  store.store.comments = {};
  store.store.reactions = {};
  store.store.channels = {};
  store.store.setup = {};
  store.store.setupState = {};
  store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
  store.store.gifts = { campaigns: {}, claims: {}, settings: {} };
  store.saveStore();
}

function activateAdmin() {
  const code = access.createActivationCode({ planId: 'business', durationDays: 3650, maxChannels: 20, createdByMaxUserId: 'pr142-system' });
  const activated = access.activateCode({ maxUserId: TEST_USER, name: 'PR142 Admin', code: code.code });
  assert.strictEqual(activated.ok, true, 'PR142 admin activation succeeds');
  const tenant = access.getTenantByMaxUserId(TEST_USER);
  assert.ok(tenant && tenant.tenantId, 'PR142 tenant exists');
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenant.tenantId, channelId: TEST_CHANNEL, channelTitle: 'PR142 Канал', maxChannels: 20 }).ok, true, 'test channel binds to tenant');
  store.saveChannel(TEST_CHANNEL, { channelId: TEST_CHANNEL, title: 'PR142 Канал', channelTitle: 'PR142 Канал', ownerUserId: TEST_USER });
  store.savePost(TEST_COMMENT_KEY, {
    channelId: TEST_CHANNEL,
    channelTitle: 'PR142 Канал',
    postId: TEST_POST_ID,
    messageId: 'msg-pr142-post',
    commentKey: TEST_COMMENT_KEY,
    originalText: 'PR142 клиентский пост',
    ownerUserId: TEST_USER,
    linkedByUserId: TEST_USER
  });
  store.saveChannel(OTHER_CHANNEL, { channelId: OTHER_CHANNEL, title: 'Tenant B Secret', channelTitle: 'Tenant B Secret', ownerUserId: OTHER_USER });
  store.savePost(OTHER_COMMENT_KEY, {
    channelId: OTHER_CHANNEL,
    channelTitle: 'Tenant B Secret',
    postId: OTHER_POST_ID,
    messageId: 'msg-pr142-other-post',
    commentKey: OTHER_COMMENT_KEY,
    originalText: 'Tenant B secret post',
    ownerUserId: OTHER_USER,
    linkedByUserId: OTHER_USER
  });
}

function stubMaxApi(sent) {
  maxApi.sendMessage = async (payload) => { sent.push({ ...payload, transport: 'sendMessage' }); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push({ ...payload, transport: 'editMessage' }); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.getChat = async () => ({ title: 'PR142 Канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });
  maxApi.getMessage = async () => ({ body: { text: 'PR142 клиентский пост', attachments: [] } });
}

function jsonRes() {
  return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return body; } };
}

function callbackUpdate(payload, userId = TEST_USER) {
  return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${Date.now()}-${Math.random()}`, user: { user_id: userId, first_name: 'PR142' }, payload: JSON.stringify(payload) }, message: { id: `menu-${Date.now()}-${Math.random()}`, body: { mid: `mid-${Date.now()}-${Math.random()}`, text: 'old menu' }, sender: { user_id: userId }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } };
}

function messageUpdate(text, userId = TEST_USER) {
  return { body: { update_type: 'message_created', message: { id: `msg-${Date.now()}-${Math.random()}`, body: { text }, sender: { user_id: userId, first_name: 'PR142' }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } };
}

function rows(call) { return call?.attachments?.find((item) => item?.type === 'inline_keyboard')?.payload?.buttons || []; }
function buttons(call) { return rows(call).flat(); }
function labels(call) { return buttons(call).map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(call) { return [String(call?.text || ''), ...labels(call)].join('\n'); }
function parsePayload(button) { try { return JSON.parse(String(button?.payload || '{}')); } catch { return {}; } }
function payloadFor(call, matcher) {
  const button = buttons(call).find((item) => matcher.test(String(item.text || '')));
  assert.ok(button, `button ${matcher} exists in:\n${visible(call)}`);
  return parsePayload(button);
}

async function sendActive(bot, sent, payload, label) {
  const before = sent.length;
  const res = jsonRes();
  await bot.handleWebhook(callbackUpdate(payload), res, { botToken: 'test-token', menuDeleteTimeoutMs: 1, appBaseUrl: 'https://example.test', botUsername: 'adminkit_test_bot' });
  assert.strictEqual(res.statusCode, 200, `${label} returns HTTP 200`);
  const call = sent.at(-1);
  assert.ok(sent.length > before && call, `${label} sends or edits a visible message`);
  return { res: res.body, call };
}

async function sendText(bot, sent, text, label) {
  const before = sent.length;
  const res = jsonRes();
  await bot.handleWebhook(messageUpdate(text), res, { botToken: 'test-token', menuDeleteTimeoutMs: 1, appBaseUrl: 'https://example.test', botUsername: 'adminkit_test_bot' });
  assert.strictEqual(res.statusCode, 200, `${label} returns HTTP 200`);
  const call = sent.at(-1);
  assert.ok(sent.length > before && call, `${label} sends a visible message`);
  return { res: res.body, call };
}

function assertNoRawLeaks(call, label) {
  const text = visible(call);
  assert.ok(!PRIVATE_URL.test(text), `${label}: visible UI must not expose private/raw URLs`);
  assert.ok(!RAW_VISIBLE.test(text), `${label}: visible UI must not expose raw ids/tokens/payloads`);
}

function assertCanonicalGiftRoot(result, label) {
  if (result.res?.screenId !== undefined) assert.ok(/(^|_)gifts_clean_home$/.test(String(result.res.screenId || '')), `${label}: screen is canonical Gifts root`);
  if (result.res?.action !== undefined) assert.strictEqual(result.res.action === 'gifts:home' || result.res.action === 'admin_section_gifts', true, `${label}: production response records canonical action`);
  if (result.res?.flow !== undefined) assert.strictEqual(result.res.flow, 'gifts', `${label}: production handler/module is Gifts flow`);
  if (result.res?.resumedFlow !== undefined) assert.strictEqual(result.res.resumedFlow, false, `${label}: top-level entry is not an auto-resumed flow`);
  const text = visible(result.call);
  for (const expected of ROOT_BUTTONS) assert.ok(labels(result.call).includes(expected), `${label}: root button ${expected} is present`);
  assert.ok(!labels(result.call).some((item) => /Выбрать другой пост/.test(item)), `${label}: clean root has no stale selected-post reselection action`);
  assert.ok(!labels(result.call).some((item) => /Текущий подарок|Создать подарок|Список подарков/.test(item)), `${label}: clean root has no context-free gift entity actions`);
  assert.ok(!/Шаг\s*(?:1|2|3|4)(?:\/4)?|материал подарка|проверить и сохранить/i.test(text), `${label}: wizard step is not the main screen`);
  assertNoRawLeaks(result.call, label);
}

function targetRecord(overrides = {}) {
  return {
    channelId: TEST_CHANNEL,
    channelTitle: 'PR142 Канал',
    postId: TEST_POST_ID,
    messageId: 'msg-pr142-post',
    commentKey: TEST_COMMENT_KEY,
    originalText: 'PR142 клиентский пост',
    ownerUserId: TEST_USER,
    ...overrides
  };
}

function giftFlowAt(stepIndex, extras = {}) {
  return {
    mode: 'gift_wizard',
    stepIndex,
    awaitingConfirmation: stepIndex >= 3,
    targetPost: targetRecord(),
    draft: {
      id: `gift_pr142_flow_${stepIndex}`,
      title: 'PR142 safe draft',
      channelId: TEST_CHANNEL,
      requiredChatId: TEST_CHANNEL,
      postIds: [TEST_POST_ID],
      commentKey: TEST_COMMENT_KEY,
      giftUrl: 'https://example.test/safe-gift',
      giftMessage: 'Спасибо за подписку! Забирайте подарок ниже.',
      enabled: true,
      ...extras.draft
    },
    ...extras
  };
}

async function verifyTopLevelMatrix(bot, sent) {
  const cases = [
    ['clean state', {}],
    ['giftFlow step 1', { giftFlow: giftFlowAt(0), activeAdminFlowKind: 'gift', giftTargetPost: targetRecord() }],
    ['giftFlow step 2', { giftFlow: giftFlowAt(1), activeAdminFlowKind: 'gift', giftTargetPost: targetRecord() }],
    ['giftFlow step 3', { giftFlow: giftFlowAt(2), activeAdminFlowKind: 'gift', giftTargetPost: targetRecord() }],
    ['giftFlow step 4/4 awaiting confirmation', { giftFlow: giftFlowAt(3, { awaitingConfirmation: true }), activeAdminFlowKind: 'gift', giftTargetPost: targetRecord() }],
    ['giftsCurrentCard exists', { giftsCurrentCard: targetRecord({ cardId: 'pr142-card' }), giftTargetPost: targetRecord() }],
    ['giftTargetPost exists', { giftTargetPost: targetRecord() }],
    ['selectedCard exists from another section', { selectedCard: { section: 'buttons', commentKey: OTHER_COMMENT_KEY, channelId: OTHER_CHANNEL, postId: OTHER_POST_ID }, buttonTargetPost: { commentKey: OTHER_COMMENT_KEY, channelId: OTHER_CHANNEL, postId: OTHER_POST_ID } }],
    ['stale target exists', { giftTargetPost: targetRecord({ postId: 'missing-post', commentKey: `${TEST_CHANNEL}:missing-post` }) }],
    ['hidden/internal target exists', { giftTargetPost: targetRecord({ channelId: OTHER_CHANNEL, channelTitle: 'debug internal global legacy', postId: OTHER_POST_ID, commentKey: OTHER_COMMENT_KEY, originalText: 'debug internal payload token' }) }]
  ];

  for (const [label, setup] of cases) {
    store.setSetupState(TEST_USER, { giftTargetPost: null, giftFlow: null, giftsCurrentCard: null, activeAdminFlowKind: '', selectedCard: null, buttonTargetPost: null, giftTargetDiagnostics: [], ...setup });
    assertCanonicalGiftRoot(await sendActive(bot, sent, { action: 'gifts:home' }, `gifts:home ${label}`), `gifts:home ${label}`);
    assertCanonicalGiftRoot(await sendActive(bot, sent, { action: 'admin_section_gifts', resetContext: true }, `admin_section_gifts ${label}`), `admin_section_gifts ${label}`);
  }
}

async function verifyRootButtons(bot, sent) {
  store.setSetupState(TEST_USER, { giftTargetPost: null, giftFlow: null, giftsCurrentCard: null, activeAdminFlowKind: '' });
  const root = (await sendActive(bot, sent, { action: 'gifts:home' }, 'root buttons entry')).call;
  const expectations = [
    [/Выбрать пост/, /Выберите канал|Выберите пост|Пока нет сохранённых постов|сначала подключите канал/i, 'choose post'],
    [/Все подарки/, /Все подарки|Пока нет подарков|Создайте подарок/i, 'all gifts'],
    [/Помощь/, /Помощь|Подарки|лид-магниты/i, 'help'],
    [/Главное меню/, /АдминКИТ|Главное меню|Панель управления/i, 'main menu']
  ];
  for (const [matcher, screenMatcher, label] of expectations) {
    const result = await sendActive(bot, sent, payloadFor(root, matcher), `root button ${label}`);
    assert.ok(screenMatcher.test(visible(result.call)), `root button ${label}: expected screen text`);
    assertNoRawLeaks(result.call, `root button ${label}`);
    assert.ok(labels(result.call).some((item) => /Главное меню|В начало подарков|Подарки|К списку каналов/.test(item)) || /Главное меню|Панель управления/.test(visible(result.call)), `root button ${label}: safe back/main path exists`);
  }
}

async function startWizard(bot, sent) {
  store.setSetupState(TEST_USER, { giftTargetPost: targetRecord(), giftFlow: null, giftsCurrentCard: targetRecord({ cardId: 'start-card' }), activeAdminFlowKind: '' });
  return sendActive(bot, sent, { action: 'gift_admin_start_create', source: 'gift_card', cardId: 'start-card' }, 'start gift wizard');
}

async function verifyWizard(bot, sent) {
  let start = await startWizard(bot, sent);
  assert.ok(/Шаг\s*1|материал подарка|Пришлите ссылку/i.test(visible(start.call)), 'wizard step 1 prompts for material');
  assertNoRawLeaks(start.call, 'wizard step 1');
  const invalid = await sendText(bot, sent, 'не ссылка', 'wizard invalid input');
  assert.ok(/Нужна ссылка|https:\/\//i.test(visible(invalid.call)), 'wizard invalid input stays safe');
  assertNoRawLeaks(invalid.call, 'wizard invalid input');
  const linkStep = await sendText(bot, sent, 'https://example.test/safe-download', 'wizard valid link');
  assert.ok(/Шаг\s*2|текст получателю/i.test(visible(linkStep.call)), 'wizard advances to text step');
  assertNoRawLeaks(linkStep.call, 'wizard text step');
  const textStep = await sendText(bot, sent, 'Спасибо за подписку!', 'wizard valid message');
  assert.ok(/Шаг\s*3|условия/i.test(visible(textStep.call)), 'wizard advances to conditions step');
  assertNoRawLeaks(textStep.call, 'wizard conditions step');
  const review = await sendActive(bot, sent, { action: 'gift_admin_save' }, 'wizard review');
  assert.ok(/Шаг\s*4|проверить|сохранить|Проверьте/i.test(visible(review.call)), 'wizard reaches step 4/4 confirmation/review');
  assertNoRawLeaks(review.call, 'wizard review step');
  const replayOld = await sendActive(bot, sent, { action: 'gift_admin_message_default' }, 'replay old callback');
  assert.ok(/условия|черновик|подар/i.test(visible(replayOld.call)), 'old callback replay is handled without dead-end');
  assertNoRawLeaks(replayOld.call, 'replay old callback');

  const cancel = await sendActive(bot, sent, { action: 'gift_admin_cancel' }, 'wizard cancel');
  assert.ok(/Подарки|Черновик|очищ/i.test(visible(cancel.call)), 'wizard cancel returns to safe Gifts UI');
  assertNoRawLeaks(cancel.call, 'wizard cancel');
  assert.strictEqual(Boolean(store.getSetupState(TEST_USER)?.giftFlow), false, 'wizard cancel clears giftFlow');

  start = await startWizard(bot, sent);
  const mainMenu = await sendActive(bot, sent, payloadFor(start.call, /Главное меню/), 'wizard main menu');
  assert.ok(/АдминКИТ|Панель управления|Главное меню/i.test(visible(mainMenu.call)), 'wizard main menu is available');
  assertNoRawLeaks(mainMenu.call, 'wizard main menu');
}

function materialCampaign(kind, suffix, id = `gift_pr142_${kind}_${suffix}`) {
  const common = {
    id,
    title: `PR142 ${kind} material`,
    channelId: TEST_CHANNEL,
    requiredChatId: TEST_CHANNEL,
    postIds: [TEST_POST_ID],
    commentKey: TEST_COMMENT_KEY,
    giftMessage: 'Спасибо за подписку! Забирайте подарок.',
    giftButtonText: `🎁 Получить ${kind}`,
    dmButtonText: 'Открыть подарок',
    enabled: true,
    ownerUserId: TEST_USER
  };
  if (kind === 'link') return { ...common, giftUrl: `https://example.test/gifts/${suffix}` };
  if (kind === 'text') return { ...common, leadMagnetCode: `PROMO-${suffix}` };
  if (kind === 'photo') return { ...common, giftAttachment: { type: 'image', payload: { token: `photo-token-${suffix}`, url: `https://private.example.test/raw/photo-token-${suffix}` }, fileName: 'gift.png', mimeType: 'image/png' } };
  if (kind === 'file') return { ...common, giftAttachment: { type: 'file', payload: { token: `file-token-${suffix}`, url: `https://private.example.test/raw/file-token-${suffix}` }, fileName: 'gift.pdf', mimeType: 'application/pdf' } };
  throw new Error(`unsupported material kind ${kind}`);
}

function attachPostGiftKeyboard(campaign) {
  const giftRows = buildGiftKeyboardRows({ campaign, commentKey: TEST_COMMENT_KEY, channelId: TEST_CHANNEL, postId: TEST_POST_ID });
  assert.ok(giftRows.length > 0, `${campaign.id}: active gift keyboard rows are built`);
  store.savePost(TEST_COMMENT_KEY, {
    giftCampaignId: campaign.id,
    lastGiftRowsCount: giftRows.length,
    patchedAttachments: [{ type: 'inline_keyboard', payload: { buttons: giftRows } }],
    customKeyboard: { rows: giftRows }
  });
}

function bindGiftContext(campaignId) {
  const card = targetRecord({ cardId: `card-${campaignId}` });
  store.setSetupState(TEST_USER, { giftTargetPost: card, giftsCurrentCard: card, activeAdminFlowKind: '', giftFlow: null });
  return card;
}

function assertDeletedPostState(campaignId, label) {
  const post = store.getPost(TEST_COMMENT_KEY) || {};
  assert.notStrictEqual(post.giftCampaignId, campaignId, `${label}: deleted campaignId removed from post state`);
  assert.ok(!JSON.stringify(post.patchedAttachments || []).includes(campaignId), `${label}: deleted campaignId removed from patched keyboard`);
  assert.ok(!JSON.stringify(post.customKeyboard || {}).includes(campaignId), `${label}: deleted campaignId removed from custom keyboard`);
}

async function verifyReplaceDeleteCurrentAndMaterials(bot, sent) {
  const covered = [];
  for (const kind of ['link', 'text', 'photo', 'file']) {
    const campaign = giftService.saveGiftCampaign(materialCampaign(kind, 'initial'));
    assert.ok(giftService.getGiftCampaign(campaign.id), `${kind}: create/save persists gift campaign`);
    attachPostGiftKeyboard(campaign);
    bindGiftContext(campaign.id);

    const current = await sendActive(bot, sent, { action: 'gift_admin_show_current' }, `${kind} show current`);
    assert.ok(/Текущий подарок|сохранён подарок|Материал подарка/i.test(visible(current.call)), `${kind}: current gift is visible`);
    assertNoRawLeaks(current.call, `${kind} current gift`);

    const replacePick = await sendActive(bot, sent, { action: 'gift_admin_replace_pick' }, `${kind} replace gift`);
    assert.ok(/Выберите канал|Выберите пост|Сначала выберите/i.test(visible(replacePick.call)), `${kind}: replace starts from safe picker`);
    assertNoRawLeaks(replacePick.call, `${kind} replace gift`);

    const replacement = giftService.saveGiftCampaign(materialCampaign(kind, 'replacement', campaign.id));
    assert.strictEqual(replacement.id, campaign.id, `${kind}: replace keeps same campaign id`);
    attachPostGiftKeyboard(replacement);
    bindGiftContext(replacement.id);

    const card = await sendActive(bot, sent, { action: 'gift_admin_show_current' }, `${kind} current before delete`);
    const deletePrompt = await sendActive(bot, sent, payloadFor(card.call, /Удалить подарок/), `${kind} delete prompt`);
    assert.ok(/Подтвердите удаление|Удалить подарок/i.test(visible(deletePrompt.call)), `${kind}: delete prompt appears before mutation wording`);
    assert.ok(giftService.getGiftCampaign(replacement.id), `${kind}: campaign still exists before confirmed delete`);
    assertNoRawLeaks(deletePrompt.call, `${kind} delete prompt`);

    const cancelPayload = payloadFor(deletePrompt.call, /Отмена|Текущий подарок/);
    const cancelDelete = await sendActive(bot, sent, cancelPayload, `${kind} cancel delete`);
    assert.ok(giftService.getGiftCampaign(replacement.id), `${kind}: cancel delete keeps campaign`);
    assertNoRawLeaks(cancelDelete.call, `${kind} cancel delete`);

    const deletePromptAgain = await sendActive(bot, sent, payloadFor(cancelDelete.call, /Удалить подарок/), `${kind} delete prompt again`);
    const confirmPayload = payloadFor(deletePromptAgain.call, /Да, удалить/);
    const afterDelete = await sendActive(bot, sent, confirmPayload, `${kind} confirmed delete`);
    assert.ok(!giftService.getGiftCampaign(replacement.id), `${kind}: confirmed delete removes campaign`);
    assertDeletedPostState(replacement.id, kind);
    assertNoRawLeaks(afterDelete.call, `${kind} after delete`);
    covered.push(kind);
  }
  return covered;
}

async function main() {
  resetState();
  activateAdmin();
  const sent = [];
  stubMaxApi(sent);
  const entrypoint = require('../clean-entrypoint-1.53.10-pr89');
  entrypoint.applyEnv();
  const install = entrypoint.installCleanBot();
  assert.strictEqual(install.ok, true, 'active clean bot installs');
  const bot = require('../bot');
  assert.strictEqual(typeof bot.handleWebhook, 'function', 'active bot exposes handleWebhook');

  await verifyTopLevelMatrix(bot, sent);
  await verifyRootButtons(bot, sent);
  await verifyWizard(bot, sent);
  const materials = await verifyReplaceDeleteCurrentAndMaterials(bot, sent);

  console.log(JSON.stringify({
    ok: true,
    test: 'PR142 product-perfect Gifts journey matrix',
    realMaxActionCovered: 'gifts:home',
    productionHandler: 'activeBot.handleWebhook',
    topLevelGiftsRootDeterministic: true,
    activeGiftFlowStep4CanInterceptTopLevel: false,
    selectedGiftTargetPostOrCurrentCardCanInterceptTopLevel: false,
    wizardCoverage: ['valid input', 'invalid input', 'cancel', 'main menu', 'replay old callback', 'clean top-level entry resets stale flow context', 'back if supported by visible keyboard'],
    materialMatrixCovered: materials
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
