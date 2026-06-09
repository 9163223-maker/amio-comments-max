'use strict';

const assert = require('assert');
const canonical = require('../features/menu-v3/canonical-menu');
const adapter = require('../features/menu-v3/adapter');
const menuCore = require('../v3-menu-core-1539');

function rows(screen) { return screen?.attachments?.[0]?.payload?.buttons || []; }
function buttons(screen) { return rows(screen).flat(); }
function labels(screen) { return rows(screen).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function sectionRootLabels() { return canonical.clientSections.flatMap((section) => labels(adapter.render(section.route))); }
function assertNo(pattern, values, message) {
  const hits = values.filter((value) => pattern.test(value));
  assert.deepStrictEqual(hits, [], message);
}


function payloadOf(button) {
  try { return JSON.parse(String(button?.payload || '{}')); } catch { return {}; }
}
function buttonTargets(screen) {
  return rows(screen).flat().map((item) => ({ text: String(item.text || '').trim(), payload: payloadOf(item) }));
}
function assertHasAll(values, required, message) {
  for (const item of required) assert.ok(values.includes(item), `${message}: missing ${item}`);
}
function assertNoSelfRoute(screen, route) {
  const self = buttonTargets(screen).filter((item) => item.payload.route === route || item.payload.action === route);
  assert.deepStrictEqual(self.map((item) => item.text), [], `${route} must not include self-click buttons`);
}

function payloadLabelsFromSend(call) {
  return (call?.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean);
}

function createRouteRes() {
  const res = { statusCode: 200, body: '', headers: {} };
  res.set = (headers) => { res.headers = { ...res.headers, ...(headers || {}) }; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = (value) => { res.contentType = value; return res; };
  res.send = (body) => { res.body = body; return res; };
  return res;
}
function createJsonRes() {
  const res = { statusCode: 200, body: null, headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; res.headersSent = true; return res; };
  return res;
}

function callbackUpdate(userId, payload) {
  return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${userId}-${Date.now()}`, body: { mid: `mid-${userId}`, text: 'old' }, sender: { user_id: userId }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } };
}
function sentTextAndLabels(call) { return [String(call?.text || ''), ...payloadLabelsFromSend(call)].join('\n'); }
async function verifyActiveRuntimePath() {
  const coreCalls = { mainScreen: 0, screenForPayload: 0 };
  const originalMainScreen = menuCore.mainScreen;
  const originalScreenForPayload = menuCore.screenForPayload;
  menuCore.mainScreen = function countedMainScreen(...args) { coreCalls.mainScreen += 1; return originalMainScreen.apply(this, args); };
  menuCore.screenForPayload = function countedScreenForPayload(...args) { coreCalls.screenForPayload += 1; return originalScreenForPayload.apply(this, args); };
  const expectedMain = expectedSections;
  const maxApi = require('../services/maxApi');
  const sent = [];
  maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.getChat = async () => ({ title: 'Тестовый канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });

  const entrypoint = require('../clean-entrypoint-1.53.10-pr89');
  assert.strictEqual(require('../package.json').main, 'clean-entrypoint-1.53.10-pr89.js', 'package main must use active clean entrypoint');
  entrypoint.applyEnv();
  const cleanBotState = entrypoint.installCleanBot();
  assert.strictEqual(cleanBotState.ok, true, 'active entrypoint installCleanBot must succeed');

  const activeBot = require('../bot');
  assert.strictEqual(typeof activeBot.handleWebhook, 'function', 'active bot export must expose handleWebhook');

  const access = require('../services/clientAccessService');
  ['pr105-start-user', 'pr105-menu-user', 'pr105-bot-started-user'].forEach((maxUserId) => access.createClientProfile({ maxUserId, name: 'PR105 active test', planId: 'business', status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', maxChannels: 20 }));

  const startRes = createJsonRes();
  await activeBot.handleWebhook({ body: { update_type: 'message_created', message: { id: 'm-start-pr105', body: { text: '/start' }, sender: { user_id: 'pr105-start-user' }, recipient: { chat_id: 'pr105-start-chat', chat_type: 'user' } } } }, startRes, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(startRes.statusCode, 200, '/start active webhook must return 200');
  assert.deepStrictEqual(payloadLabelsFromSend(sent.at(-1)), expectedMain, '/start active runtime must send canonical main menu');
  assert.ok(coreCalls.mainScreen >= 1, '/start must render through v3-menu-core-1539.mainScreen');

  const menuRes = createJsonRes();
  await activeBot.handleWebhook({ body: { update_type: 'message_created', message: { id: 'm-menu-pr105', body: { text: '/menu' }, sender: { user_id: 'pr105-menu-user' }, recipient: { chat_id: 'pr105-menu-chat', chat_type: 'user' } } } }, menuRes, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(menuRes.statusCode, 200, '/menu active webhook must return 200');
  assert.deepStrictEqual(payloadLabelsFromSend(sent.at(-1)), expectedMain, '/menu active runtime must send canonical main menu');
  assert.ok(coreCalls.screenForPayload >= 1, '/menu must render through v3-menu-core-1539.screenForPayload');

  const botStartedRes = createJsonRes();
  await activeBot.handleWebhook({ body: { update_type: 'bot_started', update_id: 'bot-started-pr105', user: { user_id: 'pr105-bot-started-user', first_name: 'PR105' } } }, botStartedRes, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(botStartedRes.statusCode, 200, 'bot_started active webhook must return 200');
  assert.deepStrictEqual(payloadLabelsFromSend(sent.at(-1)), expectedMain, 'bot_started active runtime must send canonical main menu');
  assert.ok(coreCalls.mainScreen >= 2, 'bot_started must render through v3-menu-core-1539.mainScreen');

  const store = require('../store');
  const codeA = access.createActivationCode({ planId: 'business', durationDays: 30, maxChannels: 3, createdByMaxUserId: 'pr115-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr115-tenant-a', name: 'PR115 Tenant A', code: codeA.code }).ok, true, 'PR115 tenant A activates');
  const tenantA = access.getTenantByMaxUserId('pr115-tenant-a');
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: '-pr115-tenant-a-channel', channelTitle: 'PR115 Tenant A Channel', maxChannels: 3 }).ok, true, 'PR115 tenant A channel binds');
  store.savePost('-pr115-tenant-a-channel:post-a', { channelId: '-pr115-tenant-a-channel', postId: 'post-a', messageId: 'msg-a', originalText: 'PR115 Tenant A Post', channelTitle: 'PR115 Tenant A Channel' });
  store.saveChannel('-pr115-global-hidden', { channelId: '-pr115-global-hidden', title: 'PR115 Global Hidden Channel', channelTitle: 'PR115 Global Hidden Channel', isMaxChannel: true, isChannel: true, type: 'channel' });
  const codeB = access.createActivationCode({ planId: 'business', durationDays: 30, maxChannels: 3, createdByMaxUserId: 'pr115-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr115-tenant-b', name: 'PR115 Tenant B', code: codeB.code }).ok, true, 'PR115 tenant B activates');
  const tenantB = access.getTenantByMaxUserId('pr115-tenant-b');
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantB.tenantId, channelId: '-pr115-tenant-b-channel', channelTitle: 'PR115 Tenant B Channel', maxChannels: 3 }).ok, true, 'PR115 tenant B channel binds');

  const channelsListRes = createJsonRes();
  await activeBot.handleWebhook(callbackUpdate('pr115-tenant-a', { route: 'channels:list', action: 'channels:list' }), channelsListRes, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(channelsListRes.statusCode, 200, 'channels:list active callback must return 200');
  assert.strictEqual(channelsListRes.body?.screenId, 'channels:list', 'channels:list active callback must resolve route screen');
  const channelsVisible = sentTextAndLabels(sent.at(-1));
  assert.ok(/PR115 Tenant A Channel/.test(channelsVisible), 'tenant client with channels sees own channel in channels:list active callback');
  assert.ok(!/У вас пока нет подключённых каналов/.test(channelsVisible), 'tenant client with channels must not see false empty channels:list state');
  assert.ok(!/PR115 Tenant B Channel|PR115 Global Hidden Channel/.test(channelsVisible), 'channels:list active callback must hide foreign/global channels');
  assert.ok(!/-pr115-tenant-a-channel|post-a|commentKey|postId|channelId|token|payload|trace/i.test(channelsVisible), 'channels:list active callback must not expose technical identifiers');


  const syncGiftsHome = menuCore.screenForPayload({ action: 'gifts:home' });
  assert.ok(/(^|_)gifts_clean_home$/.test(String(syncGiftsHome?.id || '')), 'sync gifts:home must resolve clean Gifts home before unified route rendering');
  const syncGiftsVisible = sentTextAndLabels(syncGiftsHome);
  assertHasAll(labels(syncGiftsHome), ['Создать подарок', 'Текущий подарок', 'Список подарков', 'Главное меню'], 'sync gifts:home clean actions');
  assert.ok(!/Подарок под постом|Материал подарка|Шаг 1|commentKey|postId|channelId|token|payload|trace/i.test(syncGiftsVisible), 'sync gifts:home must not render unified/legacy or technical UI');

  const canonicalGiftsRootLabels = labels(adapter.render('gifts:home'));
  assertHasAll(canonicalGiftsRootLabels, ['Создать подарок', 'Текущий подарок', 'Список подарков', 'Главное меню'], 'canonical Gifts root clean actions');
  assert.ok(!canonicalGiftsRootLabels.includes('Подарок под постом'), 'canonical Gifts root must not expose old post gift action');

  const giftsHomeRes = createJsonRes();
  await activeBot.handleWebhook(callbackUpdate('pr115-tenant-a', { action: 'gifts:home' }), giftsHomeRes, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(giftsHomeRes.statusCode, 200, 'gifts:home active callback must return 200');
  assert.ok(/(^|_)gifts_clean_home$/.test(String(giftsHomeRes.body?.screenId || '')), 'gifts:home active callback must resolve clean Gifts home');
  const giftsHomeVisible = sentTextAndLabels(sent.at(-1));
  assert.ok(/Создать подарок/.test(giftsHomeVisible) && /Текущий подарок/.test(giftsHomeVisible) && /Список подарков/.test(giftsHomeVisible) && /Главное меню/.test(giftsHomeVisible), 'gifts:home active callback must expose clean Gifts home actions');
  assert.ok(!/Подарок под постом|Материал подарка|Шаг 1|commentKey|postId|channelId|token|payload|trace/i.test(giftsHomeVisible), 'gifts:home active callback must not start wizard or expose technical identifiers');

  const preservedCallbacks = [
    ['buttons add', { action: 'button_admin_start_add' }],
    ['buttons current', { action: 'button_admin_show_current' }],
    ['gifts post picker', { action: 'gift_admin_recent_posts', page: 0 }],
    ['gifts list', { action: 'gift_admin_show_current' }],
    ['editor picker', { action: 'admin_posts_picker' }],
    ['polls create picker', { action: 'comments_select_post', source: 'polls' }],
    ['polls results', { action: 'poll_status' }],
    ['highlights apply picker', { action: 'comments_select_post', source: 'highlights' }],
    ['highlights remove picker', { action: 'comments_select_post', source: 'highlights' }],
  ];
  for (const [name, payload] of preservedCallbacks) {
    const res = createJsonRes();
    await activeBot.handleWebhook(callbackUpdate('pr115-tenant-a', payload), res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
    assert.strictEqual(res.statusCode, 200, `${name} active callback must return 200`);
    assert.ok(!String(res.body?.screenId || '').includes(':choose_channel'), `${name} must not be replaced by static route choose_channel screen`);
    const visible = sentTextAndLabels(sent.at(-1));
    assert.ok(!/У вас пока нет подключённых каналов/.test(visible), `${name} must not show false no-channel state for tenant with channels`);
  }

  const legacyMapPath = require.resolve('../production-menu-map-v3-fixed');
  const legacyRendererPath = require.resolve('../production-menu-v3-renderer');
  assert.strictEqual(Boolean(require.cache[legacyMapPath]), false, 'active runtime test must not load legacy production-menu-map-v3-fixed');
  assert.strictEqual(Boolean(require.cache[legacyRendererPath]), false, 'active runtime test must not load legacy production-menu-v3-renderer');

  const audit = menuCore.audit('');
  assert.strictEqual(audit.canonicalVersion, canonical.VERSION, 'menu core audit canonicalVersion must match PR105 canonical menu');
  assert.strictEqual(audit.visibleMainMenuTotal, 13, 'menu core audit must report 13 visible client sections');

  const registered = {};
  const fakeApp = { get(route, handler) { registered[route] = handler; return this; } };
  require('../v3-menu-routes-1539').install(fakeApp);
  assert.strictEqual(typeof registered['/debug/menu/audit'], 'function', 'active debug menu audit route must be registered');
  const routeRes = createRouteRes();
  registered['/debug/menu/audit']({}, routeRes);
  const routeAudit = JSON.parse(routeRes.body);
  assert.strictEqual(routeAudit.canonicalVersion, canonical.VERSION, '/debug/menu/audit canonicalVersion must match PR105 canonical menu');
  assert.strictEqual(routeAudit.visibleMainMenuTotal, 13, '/debug/menu/audit must report 13 visible client sections');
}

const expectedSections = [
  'Каналы',
  'Комментарии',
  'Подарки / лид-магниты',
  'Кнопки под постами',
  'Статистика',
  '🔔 Push-уведомления',
  'Рекламные ссылки',
  'Опросы / голосования',
  'Выделение постов',
  'Редактор постов',
  'Архив постов',
  'Личный кабинет',
  'Настройки',
];

const validation = canonical.validate();
assert.strictEqual(validation.ok, true, `canonical menu validation failed: ${validation.errors.join(', ')}`);
assert.strictEqual(canonical.clientSections.length, 13, 'client production menu must have exactly 13 top-level sections');
assert.deepStrictEqual(canonical.clientSections.map((section) => section.title), expectedSections, 'client top-level sections must match PR105 approved order');

const main = adapter.render('main:home');
const mainLabels = labels(main);
assert.deepStrictEqual(mainLabels, expectedSections, 'main menu render must match canonical client sections');

const allVisibleLabels = [...canonical.visibleLabels(), ...mainLabels, ...sectionRootLabels()];
assertNo(/\bCTA\b/i, allVisibleLabels, 'client-facing labels must not contain CTA');
assertNo(/Debug|GitHub export|selftests|trace|production checklist/i, allVisibleLabels, 'debug/admin-only labels must not be client-visible');
assertNo(/видео|файл/i, allVisibleLabels, 'video/files comments labels must not be client-visible');
assertNo(/postId|channelId|commentKey|token|payload|trace/i, allVisibleLabels, 'technical ids must not be client-visible labels');

const flowSteps = ['Выбрать канал', 'Выбрать пост', 'Материал подарка', 'Текст получателю', 'Условия'];
for (const step of flowSteps) {
  const allowedEditorChoice = step === 'Выбрать пост' && labels(adapter.render('editor:home')).includes(step);
  assert.ok(allowedEditorChoice || !allVisibleLabels.some((label) => label.toLowerCase() === step.toLowerCase()), `${step} must not be a section-root menu item`);
}

assert.ok(!labels(adapter.render('buttons:home')).some((label) => /удалить/i.test(label)), 'delete button must stay inside current buttons, not section root');
assert.ok(!labels(adapter.render('ad_links:home')).some((label) => /отключить/i.test(label)), 'disable ad link must stay inside ad link card, not section root');
assert.ok(!labels(adapter.render('polls:home')).some((label) => /остановить/i.test(label)), 'stop poll must stay inside active poll card, not section root');
assert.ok(!labels(adapter.render('ad_links:home')).some((label) => /источники|статистик/i.test(label)), 'ad link/source statistics must stay in Stats section');

const settingsRoot = adapter.render('settings:home');
const settingsRootLabels = labels(settingsRoot);
assert.deepStrictEqual(
  settingsRootLabels,
  ['Очистить чат', 'Помощь', 'Privacy / Terms', '❓ Помощь по разделу', '🏠 Главное меню'],
  'settings root must expose safe client-visible actions plus root navigation'
);
assert.ok(!settingsRootLabels.includes('↩️ В начало раздела'), 'settings root must not include section-home self-click');

const settingsDeepRoutes = ['settings:clear_chat', 'settings:notifications', 'settings:language_format', 'settings:privacy_terms', 'settings:navigation'];
for (const route of settingsDeepRoutes) {
  const screen = adapter.render(route);
  assertHasAll(labels(screen), ['⬅️ Назад', '↩️ В начало раздела', '❓ Помощь по разделу', '🏠 Главное меню'], `${route} settings detail navigation`);
  assertNoSelfRoute(screen, route);
  assert.ok(!/postId|channelId|commentKey|token|payload|trace/i.test(screen.text), `${route} must not expose technical identifiers`);
}
assert.ok(/будут доступны позже/.test(adapter.render('settings:notifications').text), 'notifications must be an honest placeholder');
assert.ok(/русский язык/.test(adapter.render('settings:language_format').text), 'language/format must explain current defaults');
assertHasAll(labels(adapter.render('settings:privacy_terms')), ['Privacy', 'Terms'], 'privacy/terms screen must link to existing document screens');
assert.ok(/штатное меню MAX/.test(adapter.render('settings:clear_chat').text), 'clear chat must explain safe MAX client behavior');
assert.ok(/Главное меню/.test(adapter.render('settings:navigation').text) && /Назад/.test(adapter.render('settings:navigation').text) && /В начало раздела/.test(adapter.render('settings:navigation').text), 'navigation screen must explain navigation buttons');

for (const item of canonical.allActions().filter((action) => action.clientVisible && action.requiresPost)) {
  assert.strictEqual(item.requiresChannel, true, `${item.id} requires post and must require channel first`);
}


for (const section of canonical.clientSections) {
  const root = adapter.render(section.route);
  const rootLabels = labels(root);
  const expectedRootNavigation = section.id === 'push'
    ? ['Как это работает', 'Главное меню']
    : (section.id === 'channels' ? ['Помощь', 'Главное меню'] : (section.id === 'comments' ? ['Помощь', 'Главное меню'] : (section.id === 'gifts' ? ['Главное меню'] : ['❓ Помощь по разделу', '🏠 Главное меню'])));
  assertHasAll(rootLabels, expectedRootNavigation, `${section.id} root navigation`);
  assert.ok(!rootLabels.includes('↩️ В начало раздела'), `${section.id} root must not include section-home self-click`);
  assert.ok(!rootLabels.includes('⬅️ Назад'), `${section.id} root must not include back without context`);
  assertNoSelfRoute(root, section.route);

  const help = adapter.render(`${section.id}:help`);
  assert.deepStrictEqual(labels(help), ['↩️ В начало раздела', '🏠 Главное меню'], `${section.id} help navigation must be section home + main only`);
  assert.ok(!/postId|channelId|commentKey|token|payload|trace/i.test(help.text), `${section.id} help must not expose technical identifiers`);
}

const channelDeepCases = [adapter.render('channels:list'), adapter.render('channels:connect')];
for (const screen of channelDeepCases) {
  assertHasAll(labels(screen), ['Назад', 'Главное меню'], `${screen.route || screen.id} channel navigation`);
  assertNoSelfRoute(screen, screen.route || screen.id);
}

const deepCases = [
  adapter.render('comments:choose_channel', { dataContext: { channels: [{ channelId: 'internal-channel-1', title: 'Новости' }] } }),
  adapter.render('comments:choose_post', { dataContext: { channelId: 'internal-channel-1', channelTitle: 'Новости', posts: [{ postId: 'post-1', commentKey: 'comment-key-1', title: 'Анонс недели' }] } }),
  adapter.render('comments:post', { payload: { postTitle: 'Анонс недели' } }),
];
for (const screen of deepCases) {
  const deepLabels = labels(screen);
  assertHasAll(deepLabels, ['⬅️ Назад', '↩️ В начало раздела', '❓ Помощь по разделу', '🏠 Главное меню'], `${screen.route || screen.id} deep navigation`);
  assertNoSelfRoute(screen, screen.route || screen.id);
}

const zeroChannels = adapter.render('channels:list', { channels: [] });
assert.ok(/Каналы пока не подключены\./.test(zeroChannels.text), 'zero-channel channels list must show safe empty state');
assertHasAll(labels(zeroChannels), ['Подключить канал', 'Назад', 'Главное меню'], 'zero-channel channels list navigation');

const accountActive = adapter.render('account:home', { maxUserId: 'pr105-start-user' });
assert.strictEqual(labels(accountActive).filter((label) => label === '🏠 Главное меню' || label === 'Главное меню').length, 1, 'active account screen must show one main-menu button');

const channelCard = adapter.render('channels:card', { payload: { channelId: 'raw-channel-123', channelTitle: 'Новости компании' } });
assert.ok(/Новости компании/.test(channelCard.text), 'channel card must use human-readable channel title');
assert.ok(!/raw-channel-123|postId|channelId|commentKey|token|payload|trace/i.test(channelCard.text), 'channel card must not expose technical identifiers');


const highlightPlainCard = adapter.render('highlights:post', { payload: { postTitle: 'Анонс недели' } });
assert.ok(labels(highlightPlainCard).includes('Применить'), 'highlight post card should expose apply action');
assert.ok(!labels(highlightPlainCard).includes('Снять выделение'), 'highlight post card without selected highlight must not expose remove');
const highlightMarkedCard = adapter.render('highlights:post', { payload: { postTitle: 'Анонс недели', hasHighlight: true } });
assert.ok(labels(highlightMarkedCard).includes('Снять выделение'), 'highlight post card with selected highlight must expose remove');
const highlightRemoveButton = buttons(highlightMarkedCard).flat().find((item) => item.text === 'Снять выделение');
assert.strictEqual(payloadOf(highlightRemoveButton).source, 'highlight_card', 'highlight remove action must be card-marked');
assert.ok(!/postId|channelId|commentKey|token|payload|trace/i.test(highlightMarkedCard.text), 'highlight post card must not expose technical identifiers');


const pickerAudit = adapter.postPickerAudit();
assert.strictEqual(pickerAudit.ok, true, `post picker audit failed: ${JSON.stringify(pickerAudit)}`);
assert.strictEqual(pickerAudit.implementationStatus, 'contract_only', 'post picker audit must honestly report contract-only status for this PR');
assert.strictEqual(pickerAudit.productionActionsMigrated, false, 'post picker audit must not claim production post flows are migrated');
for (const section of ['comments', 'gifts', 'buttons', 'polls', 'highlights', 'editor']) {
  const contract = adapter.postPickerContract(section);
  assert.deepStrictEqual(contract.sequence, ['section', 'channel', 'post', 'action'], `${section} picker sequence must be section → channel → post → action`);
  assert.strictEqual(contract.tenantVisibleChannelsOnly, true, `${section} picker must declare tenant-visible channel filtering`);
  assert.strictEqual(contract.clientVisibleTechnicalIds, false, `${section} picker must hide technical identifiers from visible UI`);
  assert.strictEqual(contract.implementationStatus, 'contract_only', `${section} picker contract must not imply production migration`);
}
const canonicalActionById = Object.fromEntries(canonical.allActions().map((item) => [item.id, item]));
assert.strictEqual(canonicalActionById['comments.auto_comments'].targetAction, 'comments_auto_patch', 'comments auto-management action must be wired');
assert.strictEqual(canonicalActionById['comments.manual_enable'].targetAction, 'comments_select_post', 'comments manual enable must choose channel/post before action');
assert.strictEqual(canonicalActionById['gifts.replace'].targetAction, 'gift_admin_replace_pick', 'gifts replace production action must use clean replace picker');
assert.strictEqual(canonicalActionById['gifts.current'].targetAction, 'gift_admin_show_current', 'gifts current production action must keep existing current action');
assert.strictEqual(canonicalActionById['gifts.list'].targetAction, 'gift_admin_list_campaigns', 'gifts list production action must use the campaign list action');
assert.strictEqual(canonicalActionById['buttons.add'].targetAction, 'button_admin_start_add', 'buttons add production action must keep existing flow action');
assert.strictEqual(canonicalActionById['buttons.current'].targetAction, 'button_admin_show_current', 'buttons current production action must keep existing flow action');
assert.strictEqual(canonicalActionById['polls.create'].targetAction, 'comments_select_post', 'polls production action must keep existing tenant-aware picker action');
assert.strictEqual(canonicalActionById['highlights.apply'].targetAction, 'comments_select_post', 'highlights apply production action must keep existing tenant-aware picker action');
assert.strictEqual(canonicalActionById['highlights.remove'].targetAction, 'comments_select_post', 'highlights remove production action must keep existing tenant-aware picker action');
assert.strictEqual(canonicalActionById['editor.change_text'].targetAction, 'admin_posts_picker', 'editor production action must keep existing post picker action');

const hiddenDebugScreen = adapter.render('debug:home');
assertNo(/Debug|GitHub export|trace|production checklist/i, labels(hiddenDebugScreen), 'debug route must not render client-visible debug buttons');

const adapterSelfTest = adapter.selfTest();
assert.strictEqual(adapterSelfTest.ok, true, `adapter selfTest failed: ${JSON.stringify(adapterSelfTest)}`);

const coreAudit = menuCore.audit('');
assert.strictEqual(coreAudit.ok, true, `menu core audit failed: ${JSON.stringify(coreAudit.canonicalValidation || coreAudit)}`);
assert.strictEqual(coreAudit.visibleMainMenuTotal, 13, 'debug menu audit must report 13 client sections');
assert.strictEqual(coreAudit.checks.noDebugTopLevel, true, 'debug must be hidden from client top-level audit');
assert.strictEqual(coreAudit.checks.noCtaLabel, true, 'audit must reject CTA labels');

verifyActiveRuntimePath().then(() => {
  console.log('canonical client menu ok');
}).catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
