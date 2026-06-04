'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const pickerCore = require('../channel-post-picker-core');
const buttons = require('../buttons-flow-cc8-clean');
const gifts = require('../gifts-flow-cc812-bottom');

const TENANT_A_USER = 'pr128-live-a';
const TENANT_B_USER = 'pr128-live-b';
const CH_LIVE = '-75423245645230';
const CH_FAIL = '-753000002';
const CH_REVIEWS = '-753000003';
const CH_SELFTEST = 'selftest_comments_matrix_channel';
const CH_B = '-753999999';
const KEY_LIVE = `${CH_LIVE}:post-live`;
const KEY_REVIEWS = `${CH_REVIEWS}:post-reviews`;
const KEY_B = `${CH_B}:post-secret`;

const menu = {
  button(text, action, extra = {}) { return { text, payload: JSON.stringify({ action, ...extra }) }; },
  keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
};
function labels(screen) { return (screen.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(screen) { return [String(screen.text || ''), ...labels(screen)].join('\n'); }
function payloadFor(screen, pattern) { const b = (screen.attachments?.[0]?.payload?.buttons || []).flat().find((item) => pattern.test(String(item.text || ''))); assert.ok(b, `button ${pattern} exists in ${visible(screen)}`); return JSON.parse(String(b.payload || '{}')); }
function assertNoRaw(text, label) { assert.ok(!/selftest_comments_matrix_channel|debug|legacy|selftest/i.test(text), `${label}: no selftest/debug/legacy`); assert.ok(!/-?\d{6,}|\b(?:channelId|postId|messageId|commentKey)\b/i.test(text), `${label}: no raw ids or key names`); }
function reset() { access._resetForTests(); store.store.posts = {}; store.store.comments = {}; store.store.reactions = {}; store.store.channels = {}; store.store.setup = {}; store.store.setupState = {}; store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} }; store.store.gifts = { campaigns: {}, claims: {}, settings: {} }; store.saveStore(); }
function activate(userId, name, maxChannels) { const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels, createdByMaxUserId: 'pr128-live-admin' }); const result = access.activateCode({ maxUserId: userId, name, code: code.code }); assert.strictEqual(result.ok, true); return access.getTenantByMaxUserId(userId); }
function bind(tenant, channelId, title) { assert.strictEqual(access.bindTenantChannel({ tenantId: tenant.tenantId, channelId, channelTitle: title, maxChannels: tenant.maxChannels }).ok, true); store.saveChannel(channelId, { channelId, title, channelTitle: title }); }
function savePost(key, channelId, title, text) { store.savePost(key, { channelId, channelTitle: title, postId: key.split(':').at(-1), messageId: `msg-${key.split(':').at(-1)}`, commentKey: key, originalText: text }); }
function callbackUpdate(userId, payload) { return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId, first_name: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${Date.now()}`, body: { mid: `mid-${Date.now()}`, text: 'old' }, sender: { user_id: userId }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } }; }
function response() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } }; }
async function sendBot(bot, payload, sent, userId = TENANT_A_USER) { const res = response(); await bot.handleWebhook(callbackUpdate(userId, payload), res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 }); assert.strictEqual(res.statusCode, 200, `callback ${payload.action} returns 200`); return sent.at(-1) || {}; }
async function main() {
  reset();
  const tenantA = activate(TENANT_A_USER, 'Tenant A', 5);
  const tenantB = activate(TENANT_B_USER, 'Tenant B', 1);
  bind(tenantA, CH_LIVE, '');
  bind(tenantA, CH_FAIL, '');
  bind(tenantA, CH_REVIEWS, 'Отзывы');
  bind(tenantA, CH_SELFTEST, 'selftest debug channel');
  bind(tenantB, CH_B, 'Tenant B Secret');
  savePost(KEY_LIVE, CH_LIVE, '', 'Live hydrated post');
  savePost(KEY_REVIEWS, CH_REVIEWS, 'Отзывы', 'Отзывы клиентов за неделю');
  savePost(KEY_B, CH_B, 'Tenant B Secret', 'Tenant B secret post');

  const originalGetChat = maxApi.getChat;
  maxApi.getChat = async ({ chatId }) => {
    if (chatId === CH_LIVE) return { title: 'Olga Style Live' };
    if (chatId === CH_FAIL) throw new Error('max_getChat_failed_for_test');
    return { title: '' };
  };

  try {
    const channels = await pickerCore.listUiChannelsForUser(TENANT_A_USER, { botToken: 'test-token' });
    const channelText = channels.map((item) => item.title).join('\n');
    assert.ok(/Olga Style Live/.test(channelText), 'MAX getChat title hydration shows live title');
    assert.ok(/Канал без названия/.test(channelText), 'failed getChat falls back to untitled');
    assert.ok(!/Tenant B Secret|selftest_comments_matrix_channel|selftest/.test(channelText), 'unified core hides foreign/internal channels');
    assertNoRaw(channelText, 'unified core channel titles');
    const failDiag = channels.find((item) => item.channelId === CH_FAIL)?.diagnostic || {};
    assert.strictEqual(failDiag.getChatAttempted, true, 'getChat attempted for missing title');
    assert.strictEqual(failDiag.getChatOk, false, 'getChat failure recorded');
    assert.ok(/max_getChat_failed_for_test/.test(failDiag.error || ''), 'getChat failure diagnostic is recorded');

    store.setSetupState(TENANT_A_USER, { buttonTargetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' } });
    const buttonsHome = await buttons.screenForPayload(menu, { action: 'admin_section_buttons' }, { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
    assert.ok(/Сначала выберите канал и пост/.test(visible(buttonsHome)) || /Выбранный пост/.test(visible(buttonsHome)), 'Buttons home either shows selected context or routes to selection');
    assert.ok(!/Tenant B secret|Tenant B Secret/.test(visible(buttonsHome)), 'Buttons home does not show invisible dirty target');
    const buttonsStart = await buttons.screenForPayload(menu, { action: 'button_admin_start_add' }, { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
    assert.notStrictEqual(buttonsStart.id, 'buttons_clean_add_label', 'Buttons raw wizard from invisible target is blocked');
    assert.ok(/Канал для кнопок|Выбор поста для кнопок|Сначала выберите/.test(visible(buttonsStart)), 'Buttons start routes to picker/selection');
    assertNoRaw(visible(buttonsStart), 'buttons start selection');

    store.setSetupState(TENANT_A_USER, { giftTargetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' } });
    const giftsHome = await gifts.screenForPayload(menu, { action: 'admin_section_gifts' }, { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
    assert.ok(!/Tenant B secret|Tenant B Secret/.test(visible(giftsHome)), 'Gifts home does not show invisible dirty target');
    const giftsStart = await gifts.screenForPayload(menu, { action: 'gift_admin_start_create' }, { userId: TENANT_A_USER, config: { botToken: 'test-token' } });
    assert.notStrictEqual(giftsStart.id, 'adminkit_gift_step_1_material', 'Gifts raw material step from invisible target is blocked');
    assert.ok(/Сначала выберите канал и пост|Выбрать пост|Выберите канал|Olga Style Live|Канал без названия|Отзывы/.test(visible(giftsStart)), 'Gifts start routes to selection');
    assertNoRaw(visible(giftsStart), 'gifts start selection');

    const originalSend = maxApi.sendMessage;
    const originalEdit = maxApi.editMessage;
    const originalAnswer = maxApi.answerCallback;
    const sent = [];
    maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
    maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
    maxApi.answerCallback = async () => ({ ok: true });
    delete require.cache[require.resolve('../bot')];
    const bot = require('../bot');
    const editorReplay = await bot.debugUiReplay({ userId: TENANT_A_USER, action: 'comments_select_post', source: 'posts', config: { botToken: 'test-token' } });
    assert.strictEqual(editorReplay.ok, true, 'debug ui replay succeeds');
    assert.strictEqual(editorReplay.replayMode, 'production', 'channel picker replay uses production picker core');
    const syntheticReplay = await bot.debugUiReplay({ userId: TENANT_A_USER, action: 'admin_section_buttons', config: { botToken: 'test-token' } });
    assert.strictEqual(syntheticReplay.replayMode, 'synthetic', 'synthetic replay is explicitly marked');
    assert.strictEqual(syntheticReplay.notActualProductionPath, true, 'synthetic replay declares it is not actual production path');
    assert.ok(/Olga Style Live|Канал без названия|Отзывы/.test(editorReplay.buttonLabels.join('\n')), 'Editor production channel picker shows human/hydrated/fallback labels');
    assertNoRaw([editorReplay.text, ...editorReplay.buttonLabels].join('\n'), 'editor ui replay');
    assert.ok(editorReplay.channelDiagnostics.some((item) => item.titleSource === 'maxGetChat' && item.getChatOk), 'ui replay includes maxGetChat diagnostic');
    assert.ok(editorReplay.channelDiagnostics.some((item) => item.getChatAttempted && item.getChatOk === false), 'ui replay includes getChat failure diagnostic');
    const beforeLast = bot.debugUiLast({ userId: TENANT_A_USER, action: 'comments_select_post' });
    assert.strictEqual(beforeLast.error, 'ui_last_not_recorded', 'ui-last is not populated by replay alone');
    const liveScreen = await sendBot(bot, { action: 'comments_select_post', source: 'posts' }, sent);
    assert.ok(/Olga Style Live|Канал без названия|Отзывы/.test(visible(liveScreen)), 'actual callback renders safe channel picker');
    const last = bot.debugUiLast({ userId: TENANT_A_USER, action: 'comments_select_post' });
    assert.strictEqual(last.ok, true, 'debug ui-last returns actual callback diagnostics');
    assert.strictEqual(last.replayMode, 'actual', 'ui-last record is actual callback output');
    assert.ok(/Olga Style Live|Канал без названия|Отзывы/.test([last.text, ...last.buttonLabels].join('\n')), 'ui-last captures actual visible callback screen');
    assertNoRaw([last.text, ...last.buttonLabels].join('\n'), 'ui-last actual screen');
    const indexSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.js'), 'utf8');
    assert.ok(/debug_disabled/.test(indexSource) && /status\(403\)/.test(indexSource), 'debug endpoints are disabled/403 when token is missing or wrong');
    maxApi.sendMessage = originalSend;
    maxApi.editMessage = originalEdit;
    maxApi.answerCallback = originalAnswer;
  } finally {
    maxApi.getChat = originalGetChat;
  }

  console.log('PR128 live parity Buttons/Gifts/channel picker diagnostics assertions passed');
}
main().catch((error) => { console.error(error); process.exit(1); });
