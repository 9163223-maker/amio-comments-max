'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const canonical = require('../features/menu-v3/canonical-menu');
const giftService = require('../services/giftService');
const { buildGiftKeyboardRows } = require('../services/maxApi');

const TEST_USER = 'pr140-admin-user';
const TEST_CHANNEL = '-914000140001';
const TEST_POST_ID = 'pr140-post';
const TEST_COMMENT_KEY = `${TEST_CHANNEL}:${TEST_POST_ID}`;

const UNSAFE_VISIBLE = /\b(?:channelId|postId|commentKey|token|payload|trace|file_token|file token|raw file|private attachment|attachment URL|private URL)\b|https?:\/\/private\.|https?:\/\/[^\s]+\/(?:private|raw|token)\b/i;
const UNSAFE_MENU_LABEL = /\b(?:selftest|debug|global|legacy|internal)\b/i;
const UNSAFE_PAYLOAD_KEYS = new Set(['channelId', 'postId', 'commentKey', 'token', 'payload', 'trace', 'fileToken', 'file_token', 'rawFileToken', 'privateUrl', 'privateAttachmentUrl']);

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
  const code = access.createActivationCode({ planId: 'business', durationDays: 3650, maxChannels: 20, createdByMaxUserId: 'pr140-system' });
  const activated = access.activateCode({ maxUserId: TEST_USER, name: 'PR140 Admin', code: code.code });
  assert.strictEqual(activated.ok, true, 'active test tenant activation succeeds');
  const tenant = access.getTenantByMaxUserId(TEST_USER);
  assert.ok(tenant && tenant.tenantId, 'active test tenant exists');
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenant.tenantId, channelId: TEST_CHANNEL, channelTitle: 'PR140 Канал', maxChannels: 20 }).ok, true, 'test channel binds to tenant');
  store.saveChannel(TEST_CHANNEL, { channelId: TEST_CHANNEL, title: 'PR140 Канал', channelTitle: 'PR140 Канал', ownerUserId: TEST_USER });
  store.savePost(TEST_COMMENT_KEY, {
    channelId: TEST_CHANNEL,
    channelTitle: 'PR140 Канал',
    postId: TEST_POST_ID,
    messageId: 'msg-pr140-post',
    commentKey: TEST_COMMENT_KEY,
    originalText: 'PR140 клиентский пост',
    ownerUserId: TEST_USER,
    linkedByUserId: TEST_USER
  });
}

function stubMaxApi(sent) {
  maxApi.sendMessage = async (payload) => { sent.push({ ...payload, transport: 'sendMessage' }); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push({ ...payload, transport: 'editMessage' }); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.getChat = async () => ({ title: 'PR140 Канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });
  maxApi.getMessage = async () => ({ body: { text: 'PR140 клиентский пост', attachments: [] } });
}

function jsonRes() {
  return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return body; } };
}

function messageCreated(text) {
  return { body: { update_type: 'message_created', message: { id: `msg-${Date.now()}-${Math.random()}`, body: { text }, sender: { user_id: TEST_USER, first_name: 'PR140' }, recipient: { chat_id: `${TEST_USER}-chat`, chat_type: 'user' } } } };
}

function callbackUpdate(payload) {
  return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${Date.now()}-${Math.random()}`, user: { user_id: TEST_USER, first_name: 'PR140' }, payload: JSON.stringify(payload) }, message: { id: `menu-${Date.now()}-${Math.random()}`, body: { mid: `mid-${Date.now()}-${Math.random()}`, text: 'old menu' }, sender: { user_id: TEST_USER }, recipient: { chat_id: `${TEST_USER}-chat`, chat_type: 'user' } } } };
}

function rows(call) { return call?.attachments?.find((item) => item?.type === 'inline_keyboard')?.payload?.buttons || []; }
function buttons(call) { return rows(call).flat(); }
function labels(call) { return buttons(call).map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(call) { return [String(call?.text || ''), ...labels(call)].join('\n'); }
function parsePayload(button) { try { return JSON.parse(String(button?.payload || '{}')); } catch { return {}; } }
function payloadFor(call, matcher) {
  const button = buttons(call).find((item) => matcher.test(String(item.text || '')));
  assert.ok(button, `button ${matcher} exists in ${visible(call)}`);
  return parsePayload(button);
}

async function sendActive(bot, update, sent, expected = 'callback') {
  const before = sent.length;
  const res = jsonRes();
  await bot.handleWebhook(update, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1, appBaseUrl: 'https://example.test', botUsername: 'adminkit_test_bot' });
  assert.strictEqual(res.statusCode, 200, `${expected} returns HTTP 200`);
  const call = sent.at(-1);
  assert.ok(sent.length > before && call, `${expected} sends or edits a visible message`);
  return { res: res.body, call };
}

function assertNoUnsafeVisible(call, label) {
  const text = visible(call);
  assert.ok(!UNSAFE_VISIBLE.test(text), `${label}: visible UI must not expose raw ids/tokens/private URLs`);
  assert.ok(!UNSAFE_MENU_LABEL.test(labels(call).join('\n')), `${label}: user-facing labels must not expose selftest/debug/global/legacy/internal`);
}

function assertPayloadKeysSafe(value, label, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, raw] of Object.entries(value)) {
    assert.ok(!UNSAFE_PAYLOAD_KEYS.has(key), `${label}: callback payload leaks ${key}`);
    if (raw && typeof raw === 'object') assertPayloadKeysSafe(raw, label, seen);
  }
}

function assertClientSafeButtons(call, label) {
  for (const button of buttons(call)) {
    const text = String(button.text || '').trim();
    assert.ok(text, `${label}: button label is non-empty`);
    assert.ok(!UNSAFE_MENU_LABEL.test(text), `${label}: unsafe label ${text}`);
    const payload = parsePayload(button);
    assertPayloadKeysSafe(payload, `${label} / ${text}`);
  }
}

function assertBackToMain(call, label) {
  assert.ok(buttons(call).some((button) => /Главное меню/i.test(String(button.text || '')) && ['main:home', 'admin_section_main'].includes(parsePayload(button).action)), `${label}: has safe way back to main menu`);
}

function assertNoStaleWizard(call, label) {
  assert.ok(!/Шаг\s*1|Напишите текст кнопки|материал подарка/i.test(visible(call)), `${label}: top-level entry must not start a stale wizard`);
}

function primaryActions(call, patterns) {
  return labels(call).filter((label) => patterns.some((pattern) => pattern.test(label))).map((label) => label.replace(/^[^А-ЯA-Z]+\s*/i, '').replace(/ к выбранному посту$/, '').trim()).sort();
}

async function verifyGlobalMenuWalkthrough(bot, sent) {
  const menuResult = await sendActive(bot, messageCreated('/menu'), sent, '/menu');
  const mainCall = menuResult.call;
  assert.strictEqual(menuResult.res.screenId, 'main:home', 'main menu screenId is canonical main:home');
  assertNoUnsafeVisible(mainCall, 'main menu');
  assertClientSafeButtons(mainCall, 'main menu');

  const mainButtons = buttons(mainCall).map((button) => ({ label: String(button.text || '').trim(), payload: parsePayload(button) }));
  const sections = canonical.sections.filter((section) => section.clientVisible && !section.adminOnly);
  assert.ok(sections.length >= 12, 'canonical client-visible top-level sections are present');

  for (const section of sections) {
    const mainButton = mainButtons.find((button) => button.payload.action === section.route && button.payload.route === section.route);
    assert.ok(mainButton, `main menu exposes ${section.id} through canonical callback ${section.route}`);
    assert.ok(mainButton.label.includes(section.title.split(' / ')[0]) || section.title.includes(mainButton.label), `${section.id}: main menu label matches section title`);

    store.setSetupState(TEST_USER, {
      giftTargetPost: { channelId: '-000000999999', postId: 'stale-post', commentKey: '-000000999999:stale-post', channelTitle: 'selftest debug global legacy internal', originalText: 'debug legacy internal' },
      buttonTargetPost: { channelId: '-000000999999', postId: 'stale-post', commentKey: '-000000999999:stale-post', channelTitle: 'selftest debug global legacy internal', originalText: 'debug legacy internal' },
      giftsCurrentCard: { cardId: 'stale-card', channelId: '-000000999999', postId: 'stale-post', commentKey: '-000000999999:stale-post' },
      activeAdminFlowKind: ''
    });

    const { res, call } = await sendActive(bot, callbackUpdate(mainButton.payload), sent, section.route);
    assert.ok(res.ok, `${section.id}: production callback path completes successfully`);
    assert.ok(String(res.screenId || '').length > 0, `${section.id}: production response exposes a screenId`);
    if (!['gifts', 'editor'].includes(section.id)) assert.strictEqual(res.screenId, section.route, `${section.id}: screenId matches canonical route`);
    assert.ok(visible(call).includes(section.title.split(' / ')[0]) || labels(call).some((label) => /Главное меню/.test(label)), `${section.id}: visible text/buttons match section`);
    assert.ok(!/fallback|legacy|debug|internal|selftest|global/i.test(String(call.text || '')), `${section.id}: screen text is not fallback/legacy/internal/debug`);
    assertNoUnsafeVisible(call, section.id);
    assertClientSafeButtons(call, section.id);
    assertBackToMain(call, section.id);
    assertNoStaleWizard(call, section.id);
  }
  return sections.map((section) => section.id);
}

async function verifyAliasParity(bot, sent) {
  const giftsAliasResult = await sendActive(bot, callbackUpdate({ action: 'gifts:home', route: 'gifts:home' }), sent, 'gifts:home');
  const giftsAlias = giftsAliasResult.call;
  const giftsCleanResult = await sendActive(bot, callbackUpdate({ action: 'admin_section_gifts' }), sent, 'admin_section_gifts');
  const giftsClean = giftsCleanResult.call;
  assert.ok(/gifts_clean_home$/.test(String(giftsAliasResult.res.screenId || '')), 'gifts:home resolves to clean Gifts home');
  assert.ok(/gifts_clean_home$/.test(String(giftsCleanResult.res.screenId || '')), 'admin_section_gifts resolves to clean Gifts home');
  assert.deepStrictEqual(primaryActions(giftsAlias, [/Создать подарок/, /Заменить подарок/, /Текущий подарок/, /Список подарков/]), primaryActions(giftsClean, [/Создать подарок/, /Заменить подарок/, /Текущий подарок/, /Список подарков/]), 'gifts:home and admin_section_gifts expose same primary actions');
  assert.ok(/Заменить подарок/.test(visible(giftsAlias)), 'Gifts home includes “Заменить подарок”');
  assert.ok(!/Подарок под постом/.test(visible(giftsAlias)), 'Gifts home does not show legacy “Подарок под постом” root item');

  const buttonsAlias = (await sendActive(bot, callbackUpdate({ action: 'buttons:home', route: 'buttons:home' }), sent, 'buttons:home')).call;
  const buttonsClean = (await sendActive(bot, callbackUpdate({ action: 'admin_section_buttons' }), sent, 'admin_section_buttons')).call;
  assert.deepStrictEqual(primaryActions(buttonsAlias, [/Добавить кнопку/, /Текущие кнопки/]), primaryActions(buttonsClean, [/Добавить кнопку/, /Текущие кнопки/]), 'buttons canonical entry matches clean Buttons home primary actions');

  for (const route of ['comments:home', 'stats:home', 'ad_links:home', 'polls:home', 'highlights:home', 'editor:home', 'archive:home', 'account:home', 'settings:home']) {
    const call = (await sendActive(bot, callbackUpdate({ action: route, route }), sent, route)).call;
    assert.ok(!/legacy|debug|internal|selftest|global/i.test(String(call.text || '')), `${route}: canonical alias does not route to legacy/global/debug/internal screen`);
    assertNoStaleWizard(call, route);
  }
}

function materialCampaign(kind, suffix) {
  const common = {
    id: `pr140_${kind}_${suffix}`,
    title: `PR140 ${kind} material`,
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

function bindGiftCard(campaignId) {
  const card = { cardId: `card-${campaignId}`, channelId: TEST_CHANNEL, channelTitle: 'PR140 Канал', postId: TEST_POST_ID, messageId: 'msg-pr140-post', commentKey: TEST_COMMENT_KEY, originalText: 'PR140 клиентский пост', ownerUserId: TEST_USER };
  store.setSetupState(TEST_USER, { giftTargetPost: card, giftsCurrentCard: card, activeAdminFlowKind: '' });
  return card;
}

function attachPostGiftKeyboard(campaign) {
  const giftRows = buildGiftKeyboardRows({ campaign, commentKey: TEST_COMMENT_KEY, channelId: TEST_CHANNEL, postId: TEST_POST_ID });
  assert.ok(giftRows.length > 0, `${campaign.id}: gift keyboard rows are built while active`);
  store.savePost(TEST_COMMENT_KEY, {
    giftCampaignId: campaign.id,
    lastGiftRowsCount: giftRows.length,
    patchedAttachments: [{ type: 'inline_keyboard', payload: { buttons: giftRows } }],
    customKeyboard: { rows: giftRows }
  });
  return giftRows;
}

function assertCampaignButtonPointsTo(campaign, rowsToCheck, label) {
  const text = JSON.stringify(rowsToCheck);
  assert.ok(text.includes(campaign.id), `${label}: button under post points to active campaign`);
}

function assertDeletedPostState(campaignId, label) {
  const post = store.getPost(TEST_COMMENT_KEY) || {};
  assert.notStrictEqual(post.giftCampaignId, campaignId, `${label}: deleted campaignId removed from post state`);
  assert.ok(!JSON.stringify(post.patchedAttachments || []).includes(campaignId), `${label}: deleted campaignId removed from patched keyboard`);
  assert.ok(!JSON.stringify(post.customKeyboard || {}).includes(campaignId), `${label}: deleted campaignId removed from custom keyboard`);
}

async function verifyGiftMaterialMatrix(bot, sent) {
  const covered = [];
  const blockers = [];
  for (const kind of ['link', 'text', 'photo', 'file']) {
    const campaign = giftService.saveGiftCampaign(materialCampaign(kind, 'initial'));
    assert.ok(campaign.id && giftService.getGiftCampaign(campaign.id), `${kind}: create/save campaign data succeeds`);
    if (kind === 'text') {
      assert.ok(campaign.leadMagnetCode, 'text: leadMagnetCode is persisted');
      assert.ok(/PROMO-initial/.test(giftService.buildGiftDmText(campaign)), 'text: promo-code material is deliverable in DM text');
    }
    if (kind === 'photo' || kind === 'file') {
      assert.strictEqual(campaign.giftAttachment.type, kind === 'photo' ? 'image' : 'file', `${kind}: attachment type is persisted`);
    }

    const activeRows = attachPostGiftKeyboard(campaign);
    assertCampaignButtonPointsTo(campaign, activeRows, kind);
    bindGiftCard(campaign.id);
    const current = (await sendActive(bot, callbackUpdate({ action: 'gift_admin_show_current' }), sent, `${kind} current gift card`)).call;
    assert.ok(/Текущий подарок|сохранён подарок|Материал подарка/.test(visible(current)), `${kind}: show current gift card`);
    assertNoUnsafeVisible(current, `${kind} current gift card`);

    const replacement = giftService.saveGiftCampaign({ ...materialCampaign(kind, 'replacement'), id: campaign.id });
    assert.strictEqual(replacement.id, campaign.id, `${kind}: replace material keeps campaign identity`);
    assert.notDeepStrictEqual(JSON.stringify(replacement), JSON.stringify(campaign), `${kind}: replacement changes saved material`);
    const replacementRows = attachPostGiftKeyboard(replacement);
    assertCampaignButtonPointsTo(replacement, replacementRows, `${kind} replacement`);
    bindGiftCard(replacement.id);

    const deletePrompt = (await sendActive(bot, callbackUpdate({ action: 'gift_admin_delete_existing', source: 'gift_card', cardId: `card-${replacement.id}` }), sent, `${kind} delete prompt`)).call;
    assert.ok(/Удалить подарок|Подтвердите удаление/.test(visible(deletePrompt)), `${kind}: delete gift prompt appears`);
    assertNoUnsafeVisible(deletePrompt, `${kind} delete prompt`);
    const confirmPayload = payloadFor(deletePrompt, /Да, удалить/);
    const afterDelete = (await sendActive(bot, callbackUpdate(confirmPayload), sent, `${kind} confirm delete`)).call;
    assert.ok(!giftService.getGiftCampaign(replacement.id), `${kind}: delete gift removes campaign`);
    assertDeletedPostState(replacement.id, kind);
    assertNoUnsafeVisible(afterDelete, `${kind} after delete`);
    covered.push(kind);
  }
  return { covered, blockers };
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

  const sections = await verifyGlobalMenuWalkthrough(bot, sent);
  await verifyAliasParity(bot, sent);
  const materials = await verifyGiftMaterialMatrix(bot, sent);

  console.log(JSON.stringify({
    ok: true,
    test: 'PR140 global live-synced menu walkthrough and Gifts material matrix',
    globalMenuSectionsCovered: sections,
    productionCallbackParityCovered: true,
    giftsMaterialTypesCovered: materials.covered,
    unsupportedMaterialTypesOrBlockers: materials.blockers
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
