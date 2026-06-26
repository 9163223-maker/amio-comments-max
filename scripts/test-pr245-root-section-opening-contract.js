'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';
delete process.env.GITHUB_DEBUG_TOKEN;

const botAudit = require('../admin-bot-audit-trace');
const runtimeTrace = require('../services/runtimeBotAuditTraceService');
const maxApi = require('../services/maxApi');

const TEST_USER = 'pr245-admin-user';
const ROUTES = [
  ['channels:home', /Каналы/i],
  ['comments:home', /Комментарии/i],
  ['gifts:home', /Подарки\s*\/\s*лид-магниты/i],
  ['buttons:home', /Кнопки/i],
  ['stats:home', /Статистика/i],
  ['push:home', /Уведомления/i],
  ['ad_links:home', /Рекламные ссылки/i],
  ['polls:home', /Опросы/i],
  ['highlights:home', /Выделение/i],
  ['editor:home', /Редактор/i],
  ['archive:home', /Архив/i],
  ['account:home', /Личный кабинет|Мой доступ|доступ|АдминКИТ/i],
  ['settings:home', /Настройки/i]
];

function reset() {
  botAudit.clear();
  runtimeTrace._resetSchedulerForTests();
}
function jsonRes() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return body; } }; }
function callbackUpdate(payload, options = {}) {
  const callback = { callback_id: options.callbackId || `cb-${Math.random()}`, payload: JSON.stringify(payload) };
  if (options.withUser !== false) callback.user = { user_id: TEST_USER };
  const body = { update_type: 'message_callback', callback };
  if (options.withMessage !== false) body.message = { id: options.messageId || `msg-${Math.random()}`, body: { mid: options.mid || `mid-${Math.random()}`, text: 'old' }, sender: { user_id: TEST_USER }, recipient: { chat_id: `${TEST_USER}-chat`, chat_type: 'user' } };
  return { body };
}
function buttons(call) { return (call?.attachments?.find((item) => item?.type === 'inline_keyboard')?.payload?.buttons || []).flat().filter(Boolean); }
function labels(call) { return buttons(call).map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(call) { return [String(call?.text || ''), ...labels(call)].join('\n'); }
function parsePayload(button) { try { return JSON.parse(String(button && button.payload || '{}')); } catch { return {}; } }
function routeFromPayload(payload = {}) { return String(payload.route || payload.r || (/^[a-z][a-z0-9_]*:[a-z0-9_]+$/i.test(String(payload.action || '')) ? payload.action : '') || '').trim(); }
function clientRoutePayloads(call) { return buttons(call).map(parsePayload).filter((payload) => routeFromPayload(payload)); }
function installMaxStubs(sent, answers) {
  maxApi.sendMessage = async (payload) => { sent.push({ ...payload, transport: 'sendMessage' }); return { ok: true, message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push({ ...payload, transport: 'editMessage' }); return { ok: true, message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async (payload) => { answers.push(payload); return { ok: true }; };
  maxApi.getChat = async () => ({ title: 'PR245 Канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });
}
async function webhook(bot, update) {
  const res = jsonRes();
  await bot.handleWebhook(update, res, { botToken: 'test-token-pr245', appBaseUrl: 'https://example.test', botUsername: 'adminkit_test_bot', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(res.statusCode, 200, 'webhook returns HTTP 200');
  return res.body;
}
function assertSafeTracePayload(payload) {
  const text = JSON.stringify(payload);
  assert.strictEqual(payload.safe, true, 'trace payload is safe');
  assert.ok(payload.events.length <= 50, 'trace payload is bounded');
  assert.ok(!text.includes('test-token-pr245'), 'trace excludes bot token');
  assert.ok(!text.includes('cb-'), 'trace excludes raw callback ids');
  assert.ok(!text.includes('msg-'), 'trace excludes raw message ids');
}

async function main() {
  reset();
  const sent = []; const answers = [];
  installMaxStubs(sent, answers);
  delete require.cache[require.resolve('../bot')];
  const bot = require('../bot');

  runtimeTrace._resetSchedulerForTests();
  let flushed = 0;
  runtimeTrace._setExportLatestTraceForTests(async () => { flushed += 1; return { ok: true, branch: runtimeTrace.DEFAULT_BRANCH, path: runtimeTrace.DEFAULT_PATH }; });

  const rootScreens = new Map();
  for (const [route, expected] of ROUTES) {
    const before = sent.length;
    await webhook(bot, callbackUpdate({ route }, { callbackId: `cb-${route}-1`, messageId: `msg-${route}-1`, mid: `mid-${route}-1` }));
    const result = botAudit.list().find((event) => event.type === 'root_section_callback_resolved' && event.route === route);
    assert.ok(result, `${route} returns canonical route`);
    assert.ok(sent.length > before, `${route} opens a visible screen`);
    assert.ok(expected.test(visible(sent.at(-1))), `${route} visible text matches expected section`);
    assert.ok(labels(sent.at(-1)).length > 0, `${route} has inline keyboard`);
    rootScreens.set(route, sent.at(-1));
    assert.ok(!botAudit.list().some((event) => event.type === 'unsupported_callback' && event.route === route), `${route} does not hit unsupported_callback`);
    assert.strictEqual(result.resolver, 'payload.route', `${route} uses unified payload.route resolver`);

    const repeatedBefore = sent.length;
    await webhook(bot, callbackUpdate({ route }, { callbackId: `same-${route}`, messageId: `same-msg-${route}`, mid: `same-mid-${route}` }));
    await webhook(bot, callbackUpdate({ route }, { callbackId: `same-${route}`, messageId: `same-msg-${route}`, mid: `same-mid-${route}` }));
    assert.ok(sent.length >= repeatedBefore + 2, `${route} repeated root callback is idempotent and not swallowed`);
  }

  assert.ok(flushed >= ROUTES.length, 'real root callback handler flushes runtime trace after root events');

  for (const [rootRoute, rootCall] of rootScreens.entries()) {
    const childPayloads = clientRoutePayloads(rootCall).filter((payload) => {
      const route = routeFromPayload(payload);
      return route && route !== rootRoute;
    });
    for (const payload of childPayloads) {
      const route = routeFromPayload(payload);
      const before = sent.length;
      await webhook(bot, callbackUpdate(payload, { callbackId: `child-${rootRoute}-${route}`, messageId: `child-msg-${rootRoute}-${route}`, mid: `child-mid-${rootRoute}-${route}` }));
      assert.ok(!botAudit.list().some((event) => event.type === 'unsupported_callback' && (event.route === route || event.action === route)), `${rootRoute} child ${route} does not hit unsupported_callback`);
      assert.ok(sent.length > before || botAudit.list().some((event) => event.type === 'v3_route_callback_resolved' && event.route === route) || botAudit.list().some((event) => event.type === 'root_section_callback_resolved' && event.route === route), `${rootRoute} child ${route} visibly updates or returns documented route state`);
      assert.ok(!botAudit.list().some((event) => event.type === 'duplicate_callback_skipped' && (event.route === route || event.action === route)), `${rootRoute} child ${route} is not swallowed by duplicate gate`);
      if (route !== 'main:home') assert.ok(!/Панель управления MAX-каналом/i.test(String(sent.at(-1)?.text || '')), `${rootRoute} child ${route} does not route back to main`);
    }
  }

  const channelsHome = rootScreens.get('channels:home');
  for (const route of ['channels:list', 'channels:connect', 'channels:instructions']) {
    const payload = clientRoutePayloads(channelsHome).find((item) => routeFromPayload(item) === route) || { route, action: route };
    const before = sent.length;
    await webhook(bot, callbackUpdate(payload, { callbackId: `channels-regression-${route}`, messageId: `channels-msg-${route}`, mid: `channels-mid-${route}` }));
    assert.ok(sent.length > before, `${route} visibly updates`);
    assert.ok(!botAudit.list().some((event) => event.type === 'unsupported_callback' && (event.route === route || event.action === route)), `${route} does not hit unsupported_callback`);
  }

  const giftCall = rootScreens.get('gifts:home');
  assert.ok(giftCall, 'gifts:home opens Gifts root screen');
  for (const label of ['Создать подарок', 'Текущий подарок', 'Список подарков', 'Главное меню']) assert.ok(labels(giftCall).includes(label), `Gifts keyboard contains ${label}`);
  assert.ok(!/Панель управления MAX-каналом/i.test(String(giftCall.text || '')), 'Gifts does not route to main');

  const beforeLegacy = sent.length;
  await webhook(bot, callbackUpdate({ action: 'gift_admin_open_menu' }, { callbackId: 'legacy-gift-open', messageId: 'legacy-gift-msg', mid: 'legacy-gift-mid' }));
  const legacyResult = botAudit.list().find((event) => event.type === 'root_section_callback_resolved' && event.action === 'gift_admin_open_menu');
  assert.strictEqual(legacyResult.route, 'gifts:home', 'gift_admin_open_menu remains legacy compatibility for Gifts');
  assert.strictEqual(legacyResult.resolver, 'legacy.compatibility', 'gift_admin_open_menu is documented as compatibility, not canonical');
  assert.ok(sent.length > beforeLegacy && /Подарки\s*\/\s*лид-магниты/i.test(visible(sent.at(-1))), 'legacy gift action does not route to main');
  const mainPayloads = sent.flatMap((call) => buttons(call).map((button) => button.payload || ''));
  assert.ok(!mainPayloads.some((payload) => String(payload).includes('gift_admin_open_menu')), 'current canonical menus do not emit gift_admin_open_menu');

  const mainBefore = sent.length;
  await webhook(bot, callbackUpdate({ action: 'admin_section_main' }, { callbackId: 'main-menu-action', messageId: 'main-menu-msg', mid: 'main-menu-mid' }));
  assert.ok(sent.length > mainBefore && /АдминКИТ|Панель управления/i.test(visible(sent.at(-1))), 'existing main action still opens main menu');

  await webhook(bot, callbackUpdate({ route: 'settings:home' }, { withMessage: false, withUser: false, callbackId: 'missing-target' }));
  assert.ok(botAudit.list().some((event) => event.type === 'root_section_callback_failed' && event.error === 'delivery_target_missing'), 'missing delivery target fails safely');

  const events = botAudit.list();
  assert.ok(events.some((event) => event.type === 'root_section_callback_received'), 'root_section_callback_received is logged');
  assert.ok(events.some((event) => event.type === 'root_section_callback_resolved'), 'root_section_callback_resolved is logged');
  assert.ok(events.some((event) => event.type === 'root_section_callback_failed'), 'root_section_callback_failed is logged');

  assert.ok(flushed >= ROUTES.length, 'runtime trace export is flushed by real root/v3 callback handlers');
  const tracePayload = runtimeTrace.buildTracePayload({ limit: 50 });
  assertSafeTracePayload(tracePayload);
  assert.strictEqual(runtimeTrace.DEFAULT_BRANCH, 'runtime-status', 'DEFAULT_BRANCH remains runtime-status');
  assert.strictEqual(runtimeTrace.DEFAULT_PATH, 'runtime/bot-audit-trace.json', 'DEFAULT_PATH remains runtime/bot-audit-trace.json');
  runtimeTrace._resetSchedulerForTests();

  console.log(JSON.stringify({ ok: true, test: 'PR245 root section opening contract' }, null, 2));
}
main().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
