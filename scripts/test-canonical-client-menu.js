'use strict';

const assert = require('assert');
const canonical = require('../features/menu-v3/canonical-menu');
const adapter = require('../features/menu-v3/adapter');
const menuCore = require('../v3-menu-core-1539');

function rows(screen) { return screen?.attachments?.[0]?.payload?.buttons || []; }
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

  const legacyMapPath = require.resolve('../production-menu-map-v3-fixed');
  const legacyRendererPath = require.resolve('../production-menu-v3-renderer');
  assert.strictEqual(Boolean(require.cache[legacyMapPath]), false, 'active runtime test must not load legacy production-menu-map-v3-fixed');
  assert.strictEqual(Boolean(require.cache[legacyRendererPath]), false, 'active runtime test must not load legacy production-menu-v3-renderer');

  const audit = menuCore.audit('');
  assert.strictEqual(audit.canonicalVersion, canonical.VERSION, 'menu core audit canonicalVersion must match PR105 canonical menu');
  assert.strictEqual(audit.visibleMainMenuTotal, 12, 'menu core audit must report 12 visible client sections');

  const registered = {};
  const fakeApp = { get(route, handler) { registered[route] = handler; return this; } };
  require('../v3-menu-routes-1539').install(fakeApp);
  assert.strictEqual(typeof registered['/debug/menu/audit'], 'function', 'active debug menu audit route must be registered');
  const routeRes = createRouteRes();
  registered['/debug/menu/audit']({}, routeRes);
  const routeAudit = JSON.parse(routeRes.body);
  assert.strictEqual(routeAudit.canonicalVersion, canonical.VERSION, '/debug/menu/audit canonicalVersion must match PR105 canonical menu');
  assert.strictEqual(routeAudit.visibleMainMenuTotal, 12, '/debug/menu/audit must report 12 visible client sections');
}

const expectedSections = [
  'Каналы',
  'Комментарии',
  'Подарки / лид-магниты',
  'Кнопки под постами',
  'Статистика',
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
assert.strictEqual(canonical.clientSections.length, 12, 'client production menu must have exactly 12 top-level sections');
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
for (const step of flowSteps) assert.ok(!allVisibleLabels.some((label) => label.toLowerCase() === step.toLowerCase()), `${step} must not be a section-root menu item`);

assert.ok(!labels(adapter.render('buttons:home')).some((label) => /удалить/i.test(label)), 'delete button must stay inside current buttons, not section root');
assert.ok(!labels(adapter.render('ad_links:home')).some((label) => /отключить/i.test(label)), 'disable ad link must stay inside ad link card, not section root');
assert.ok(!labels(adapter.render('polls:home')).some((label) => /остановить/i.test(label)), 'stop poll must stay inside active poll card, not section root');
assert.ok(!labels(adapter.render('ad_links:home')).some((label) => /источники|статистик/i.test(label)), 'ad link/source statistics must stay in Stats section');

for (const item of canonical.allActions().filter((action) => action.clientVisible && action.requiresPost)) {
  assert.strictEqual(item.requiresChannel, true, `${item.id} requires post and must require channel first`);
}


for (const section of canonical.clientSections) {
  const root = adapter.render(section.route);
  const rootLabels = labels(root);
  assertHasAll(rootLabels, ['❓ Помощь по разделу', '🏠 Главное меню'], `${section.id} root navigation`);
  assert.ok(!rootLabels.includes('↩️ В начало раздела'), `${section.id} root must not include section-home self-click`);
  assert.ok(!rootLabels.includes('⬅️ Назад'), `${section.id} root must not include back without context`);
  assertNoSelfRoute(root, section.route);

  const help = adapter.render(`${section.id}:help`);
  assert.deepStrictEqual(labels(help), ['↩️ В начало раздела', '🏠 Главное меню'], `${section.id} help navigation must be section home + main only`);
  assert.ok(!/postId|channelId|commentKey|token|payload|trace/i.test(help.text), `${section.id} help must not expose technical identifiers`);
}

const deepCases = [
  adapter.render('channels:list'),
  adapter.render('channels:connect'),
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
assert.ok(/У вас пока нет подключённых каналов\./.test(zeroChannels.text), 'zero-channel channels list must show safe empty state');
assertHasAll(labels(zeroChannels), ['Подключить канал', '❓ Помощь по разделу', '🏠 Главное меню'], 'zero-channel channels list navigation');

const channelCard = adapter.render('channels:card', { payload: { channelId: 'raw-channel-123', channelTitle: 'Новости компании' } });
assert.ok(/Новости компании/.test(channelCard.text), 'channel card must use human-readable channel title');
assert.ok(!/raw-channel-123|postId|channelId|commentKey|token|payload|trace/i.test(channelCard.text), 'channel card must not expose technical identifiers');

const pickerAudit = adapter.postPickerAudit();
assert.strictEqual(pickerAudit.ok, true, `post picker audit failed: ${JSON.stringify(pickerAudit)}`);
for (const section of ['comments', 'gifts', 'buttons', 'polls', 'highlights', 'editor']) {
  const contract = adapter.postPickerContract(section);
  assert.deepStrictEqual(contract.sequence, ['section', 'channel', 'post', 'action'], `${section} picker sequence must be section → channel → post → action`);
  assert.strictEqual(contract.tenantVisibleChannelsOnly, true, `${section} picker must declare tenant-visible channel filtering`);
  assert.strictEqual(contract.clientVisibleTechnicalIds, false, `${section} picker must hide technical identifiers from visible UI`);
}

const pickerScreen = adapter.render('buttons:choose_channel', { dataContext: { channels: [{ channelId: 'secret-channel-id', title: 'Канал продаж' }] } });
assert.ok(labels(pickerScreen).includes('Канал продаж'), 'shared picker must show human-readable channel title');
assert.ok(!labels(pickerScreen).join('\n').includes('secret-channel-id'), 'shared picker must not show raw channel id in labels');

const hiddenDebugScreen = adapter.render('debug:home');
assertNo(/Debug|GitHub export|trace|production checklist/i, labels(hiddenDebugScreen), 'debug route must not render client-visible debug buttons');

const adapterSelfTest = adapter.selfTest();
assert.strictEqual(adapterSelfTest.ok, true, `adapter selfTest failed: ${JSON.stringify(adapterSelfTest)}`);

const coreAudit = menuCore.audit('');
assert.strictEqual(coreAudit.ok, true, `menu core audit failed: ${JSON.stringify(coreAudit.canonicalValidation || coreAudit)}`);
assert.strictEqual(coreAudit.visibleMainMenuTotal, 12, 'debug menu audit must report 12 client sections');
assert.strictEqual(coreAudit.checks.noDebugTopLevel, true, 'debug must be hidden from client top-level audit');
assert.strictEqual(coreAudit.checks.noCtaLabel, true, 'audit must reject CTA labels');

verifyActiveRuntimePath().then(() => {
  console.log('canonical client menu ok');
}).catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
