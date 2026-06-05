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
const KEY_SELFTEST = `${CH_SELFTEST}:post-selftest`;

const menu = {
  button(text, action, extra = {}) { return { text, payload: JSON.stringify({ action, ...extra }) }; },
  keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
};
function labels(screen) { return (screen.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(screen) { return [String(screen.text || ''), ...labels(screen)].join('\n'); }
function payloadFor(screen, pattern) { const b = (screen.attachments?.[0]?.payload?.buttons || []).flat().find((item) => pattern.test(String(item.text || ''))); assert.ok(b, `button ${pattern} exists in ${visible(screen)}`); return JSON.parse(String(b.payload || '{}')); }
function assertNoRaw(text, label) { assert.ok(!/selftest_comments_matrix_channel|debug|legacy|selftest|global|internal/i.test(text), `${label}: no selftest/debug/legacy/global/internal`); assert.ok(!/-?\d{6,}|\b(?:channelId|postId|messageId|commentKey|token|payload|trace)\b/i.test(text), `${label}: no raw ids or key names`); }
function reset() { access._resetForTests(); store.store.posts = {}; store.store.comments = {}; store.store.reactions = {}; store.store.channels = {}; store.store.setup = {}; store.store.setupState = {}; store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} }; store.store.gifts = { campaigns: {}, claims: {}, settings: {} }; store.saveStore(); }
function activate(userId, name, maxChannels) { const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels, createdByMaxUserId: 'pr128-live-admin' }); const result = access.activateCode({ maxUserId: userId, name, code: code.code }); assert.strictEqual(result.ok, true); return access.getTenantByMaxUserId(userId); }
function bind(tenant, channelId, title) { assert.strictEqual(access.bindTenantChannel({ tenantId: tenant.tenantId, channelId, channelTitle: title, maxChannels: tenant.maxChannels }).ok, true); store.saveChannel(channelId, { channelId, title, channelTitle: title }); }
function savePost(key, channelId, title, text) { store.savePost(key, { channelId, channelTitle: title, postId: key.split(':').at(-1), messageId: `msg-${key.split(':').at(-1)}`, commentKey: key, originalText: text }); }
function callbackUpdate(userId, payload) { return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId, first_name: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${Date.now()}`, body: { mid: `mid-${Date.now()}`, text: 'old' }, sender: { user_id: '244564887' }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } }; }
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
  savePost(KEY_SELFTEST, CH_SELFTEST, 'selftest debug channel', 'selftest global legacy internal post');

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

    store.setSetupState(TENANT_A_USER, {
      giftTargetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' },
      commentTargetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' }
    });
    const liveGiftStart = await sendBot(bot, { action: 'gift_admin_start_create' }, sent);
    const liveGiftStartText = visible(liveGiftStart);
    assert.ok(liveGiftStartText.length > 0, 'actual gift_admin_start_create produces a visible screen');
    assert.ok(/Выберите канал|Выберите пост|Olga Style Live|Отзывы|Канал без названия/.test(liveGiftStartText), 'actual gift_admin_start_create routes to tenant-visible channel/post selection');
    assert.ok(!/Tenant B secret post|Tenant B Secret|Tenant B secret/i.test(liveGiftStartText), 'actual gift_admin_start_create hides Tenant B dirty target');
    assertNoRaw(liveGiftStartText, 'actual gift_admin_start_create screen');
    const giftLast = bot.debugUiLast({ userId: TENANT_A_USER, action: 'gift_admin_start_create' });
    assert.strictEqual(giftLast.ok, true, 'debug ui-last records gift_admin_start_create actual callback');
    assert.strictEqual(giftLast.replayMode, 'actual', 'gift_admin_start_create ui-last record is actual');
    const latestUserLast = bot.debugUiLast({ userId: TENANT_A_USER });
    assert.strictEqual(latestUserLast.ok, true, 'debug ui-last user-level lookup returns latest actual record');
    assert.strictEqual(latestUserLast.replayMode, 'actual', 'debug ui-last user-level record is actual');
    const missingActionLast = bot.debugUiLast({ userId: TENANT_A_USER, action: 'missing_action' });
    assert.deepStrictEqual(missingActionLast, { ok: false, error: 'ui_last_not_recorded', userId: TENANT_A_USER, action: 'missing_action' }, 'debug ui-last action lookup does not fall back to latest user-level record');
    const giftLastVisible = [giftLast.text, ...giftLast.buttonLabels].join('\n');
    assert.strictEqual(giftLast.text, liveGiftStart.text, 'gift_admin_start_create ui-last text matches actual edited/sent screen');
    assert.deepStrictEqual(giftLast.buttonLabels, labels(liveGiftStart), 'gift_admin_start_create ui-last buttons match actual edited/sent screen');
    store.setSetupState(TENANT_A_USER, {
      buttonTargetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' },
      commentTargetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' },
      buttonFlow: { mode: 'button_wizard', stepIndex: 0, targetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' }, draft: { text: '', url: '' } },
      activeAdminFlowKind: 'button'
    });
    const liveButtonStart = await sendBot(bot, { action: 'button_admin_start_add' }, sent);
    const liveButtonStartText = visible(liveButtonStart);
    assert.ok(liveButtonStartText.length > 0, 'actual button_admin_start_add produces a visible screen');
    assert.ok(/Выберите канал|Выбор поста для кнопок|Olga Style Live|Отзывы|Канал без названия/.test(liveButtonStartText), 'actual button_admin_start_add routes to tenant-visible channel/post selection');
    assert.ok(!/Tenant B secret post|Tenant B Secret|Tenant B secret/i.test(liveButtonStartText), 'actual button_admin_start_add hides Tenant B dirty target');
    assertNoRaw(liveButtonStartText, 'actual button_admin_start_add screen');
    assert.ok(!/Шаг 1\/3/.test(liveButtonStartText), 'actual button_admin_start_add does not show Step 1/3 for foreign target');
    const setupAfterButtonStart = store.getSetupState(TENANT_A_USER) || {};
    assert.notStrictEqual(setupAfterButtonStart.buttonFlow?.targetPost?.commentKey, KEY_B, 'button wizard does not start for Tenant B target');
    assert.notStrictEqual(setupAfterButtonStart.buttonTargetPost?.commentKey, KEY_B, 'stale Tenant B button target is cleared');
    const buttonLast = bot.debugUiLast({ userId: TENANT_A_USER, action: 'button_admin_start_add' });
    assert.strictEqual(buttonLast.ok, true, 'debug ui-last records button_admin_start_add actual callback');
    assert.strictEqual(buttonLast.replayMode, 'actual', 'button_admin_start_add ui-last record is actual');
    assert.strictEqual(buttonLast.text, liveButtonStart.text, 'button_admin_start_add ui-last text matches actual edited/sent screen');
    assert.deepStrictEqual(buttonLast.buttonLabels, labels(liveButtonStart), 'button_admin_start_add ui-last buttons match actual edited/sent screen');


    store.setSetupState(TENANT_A_USER, {
      buttonTargetPost: { channelId: CH_REVIEWS, channelTitle: 'Отзывы', postId: 'post-reviews', messageId: 'msg-post-reviews', commentKey: KEY_REVIEWS, originalText: 'Отзывы клиентов за неделю' },
      commentTargetPost: { channelId: CH_REVIEWS, channelTitle: 'Отзывы', postId: 'post-reviews', messageId: 'msg-post-reviews', commentKey: KEY_REVIEWS, originalText: 'Отзывы клиентов за неделю' },
      buttonFlow: null,
      activeAdminFlowKind: ''
    });
    await sendBot(bot, { action: 'admin_section_buttons' }, sent);
    const staleValidStart = await sendBot(bot, { action: 'button_admin_start_add' }, sent);
    const staleValidText = visible(staleValidStart);
    assert.ok(!/Шаг 1\/3/.test(staleValidText), 'actual button_admin_start_add does not start from old valid Tenant A target after Buttons home');
    assert.ok(/Выберите канал|Выбор поста для кнопок|Olga Style Live|Отзывы|Канал без названия/.test(staleValidText), 'old valid Tenant A target routes to safe selection/card flow');
    const staleValidLast = bot.debugUiLast({ userId: TENANT_A_USER, action: 'button_admin_start_add' });
    assert.strictEqual(staleValidLast.ok, true, 'debug ui-last records old-valid-target button_admin_start_add for callback actor');
    assert.strictEqual(staleValidLast.replayMode, 'actual', 'old-valid-target button ui-last is actual');
    assert.strictEqual(staleValidLast.text, staleValidStart.text, 'old-valid-target ui-last text matches actual screen');
    assert.deepStrictEqual(staleValidLast.buttonLabels, labels(staleValidStart), 'old-valid-target ui-last buttons match actual screen');

    const explicitChannelPicker = await sendBot(bot, { action: 'button_admin_start_add' }, sent);
    const explicitPostPicker = await sendBot(bot, payloadFor(explicitChannelPicker, /Отзывы/), sent);
    const explicitCard = await sendBot(bot, payloadFor(explicitPostPicker, /Отзывы клиентов/), sent);
    assert.ok(/Пост для кнопок выбран|Действие: Добавить кнопку к этому посту/.test(visible(explicitCard)), 'actual Buttons explicit selected post card is shown');
    const explicitStep1 = await sendBot(bot, payloadFor(explicitCard, /Добавить кнопку к этому посту/), sent);
    assert.ok(/Шаг 1\/3/.test(visible(explicitStep1)), 'actual Buttons wizard starts only from explicit selected-post card action');

    assert.ok(!/Tenant B secret post|Tenant B Secret|Tenant B secret|global|legacy|selftest|debug|internal/i.test(giftLastVisible), 'gift_admin_start_create ui-last hides foreign and internal labels');
    assertNoRaw(giftLastVisible, 'gift_admin_start_create ui-last');

    store.setSetupState(TENANT_A_USER, {
      giftTargetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' },
      commentTargetPost: { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'post-secret', messageId: 'msg-secret', commentKey: KEY_B, originalText: 'Tenant B secret post' }
    });
    const deniedTenantBSelect = await sendBot(bot, { action: 'gift_admin_select_post', commentKey: KEY_B }, sent);
    const deniedTenantBText = visible(deniedTenantBSelect);
    assert.ok(deniedTenantBText.length > 0, 'direct Tenant B gift_admin_select_post produces safe screen');
    assert.ok(/Выберите канал|Выберите пост|Сначала выберите пост|Olga Style Live|Отзывы|Канал без названия|нет подключённых каналов/.test(deniedTenantBText), 'direct Tenant B gift_admin_select_post routes to safe selection/rejection');
    assert.ok(!/Tenant B secret post|Tenant B Secret|Tenant B secret/i.test(deniedTenantBText), 'direct Tenant B gift_admin_select_post hides Tenant B data');
    assertNoRaw(deniedTenantBText, 'direct Tenant B gift_admin_select_post screen');
    let setupAfterDenied = store.getSetupState(TENANT_A_USER) || {};
    assert.notStrictEqual(setupAfterDenied.giftTargetPost?.commentKey, KEY_B, 'direct Tenant B select does not set giftTargetPost');
    assert.notStrictEqual(setupAfterDenied.giftFlow?.draft?.commentKey, KEY_B, 'direct Tenant B select does not start Tenant B gift flow');

    store.setSetupState(TENANT_A_USER, {
      giftTargetPost: { channelId: CH_SELFTEST, channelTitle: 'selftest debug channel', postId: 'post-selftest', messageId: 'msg-post-selftest', commentKey: KEY_SELFTEST, originalText: 'selftest global legacy internal post' },
      commentTargetPost: { channelId: CH_SELFTEST, channelTitle: 'selftest debug channel', postId: 'post-selftest', messageId: 'msg-post-selftest', commentKey: KEY_SELFTEST, originalText: 'selftest global legacy internal post' }
    });
    const deniedInternalSelect = await sendBot(bot, { action: 'gift_admin_select_post', commentKey: KEY_SELFTEST }, sent);
    const deniedInternalText = visible(deniedInternalSelect);
    assert.ok(!/selftest|debug|legacy|global|internal/i.test(deniedInternalText), 'direct internal gift_admin_select_post hides internal labels');
    assertNoRaw(deniedInternalText, 'direct internal gift_admin_select_post screen');
    setupAfterDenied = store.getSetupState(TENANT_A_USER) || {};
    assert.notStrictEqual(setupAfterDenied.giftTargetPost?.commentKey, KEY_SELFTEST, 'direct internal select does not set giftTargetPost');
    assert.notStrictEqual(setupAfterDenied.giftFlow?.draft?.commentKey, KEY_SELFTEST, 'direct internal select does not start gift flow');

    const validGiftSelect = await sendBot(bot, { action: 'gift_admin_select_post', commentKey: KEY_LIVE }, sent);
    const validGiftSelectText = visible(validGiftSelect);
    assert.ok(/Пост для подарка выбран|Live hydrated post/.test(validGiftSelectText), 'valid Tenant A gift_admin_select_post shows selected context');
    assert.ok(!/Tenant B secret post|Tenant B Secret|selftest|debug|legacy|global|internal/i.test(validGiftSelectText), 'valid Tenant A gift_admin_select_post stays tenant-safe');
    assertNoRaw(validGiftSelectText, 'valid Tenant A gift_admin_select_post screen');
    const setupAfterValid = store.getSetupState(TENANT_A_USER) || {};
    assert.strictEqual(setupAfterValid.giftTargetPost?.commentKey, KEY_LIVE, 'valid Tenant A select sets giftTargetPost');
    assert.strictEqual(setupAfterValid.giftFlow?.draft?.commentKey, KEY_LIVE, 'valid Tenant A select starts gift flow for selected post');
    const selectLast = bot.debugUiLast({ userId: TENANT_A_USER, action: 'gift_admin_select_post' });
    assert.strictEqual(selectLast.ok, true, 'debug ui-last records gift_admin_select_post actual callback');
    assert.strictEqual(selectLast.replayMode, 'actual', 'gift_admin_select_post ui-last record is actual');
    assert.strictEqual(selectLast.text, validGiftSelect.text, 'gift_admin_select_post ui-last text matches actual edited/sent screen');
    assert.deepStrictEqual(selectLast.buttonLabels, labels(validGiftSelect), 'gift_admin_select_post ui-last buttons match actual edited/sent screen');

    assert.doesNotThrow(() => bot.__testBuildCommentsPostAdminText({ channelId: CH_LIVE, commentKey: KEY_LIVE, originalText: 'Live hydrated post' }, TENANT_A_USER), 'old comments post admin text path does not throw with userId');
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
    assert.deepStrictEqual(beforeLast, { ok: false, error: 'ui_last_not_recorded', userId: TENANT_A_USER, action: 'comments_select_post' }, 'ui-last is not populated for comments_select_post by replay alone');
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
