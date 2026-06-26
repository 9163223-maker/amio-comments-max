'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';
delete process.env.GITHUB_DEBUG_TOKEN;

const store = require('../store');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const botAudit = require('../admin-bot-audit-trace');
const runtimeTrace = require('../services/runtimeBotAuditTraceService');

const TEST_USER = 'pr243-admin-user';

function resetState() {
  botAudit.clear();
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
  const code = access.createActivationCode({ planId: 'business', durationDays: 3650, maxChannels: 20, createdByMaxUserId: 'pr243-system' });
  assert.strictEqual(access.activateCode({ maxUserId: TEST_USER, name: 'PR243 Admin', code: code.code }).ok, true);
}
function stubMaxApi(sent, answers) {
  maxApi.sendMessage = async (payload) => { sent.push({ ...payload, transport: 'sendMessage' }); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push({ ...payload, transport: 'editMessage' }); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async (payload) => { answers.push(payload); return { ok: true }; };
  maxApi.getChat = async () => ({ title: 'PR243 Канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });
}
function jsonRes() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return body; } }; }
function callbackUpdate(payload, options = {}) {
  const callback = { callback_id: `cb-${Date.now()}-${Math.random()}`, payload: JSON.stringify(payload) };
  if (options.withUser !== false) callback.user = { user_id: TEST_USER, first_name: 'PR243' };
  const body = { update_type: 'message_callback', callback };
  if (options.withMessage !== false) body.message = { id: `menu-${Date.now()}`, body: { mid: `mid-${Date.now()}`, text: 'old menu' }, sender: { user_id: TEST_USER }, recipient: { chat_id: `${TEST_USER}-chat`, chat_type: 'user' } };
  return { body };
}
function labels(call) { return (call?.attachments?.find((item) => item?.type === 'inline_keyboard')?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(call) { return [String(call?.text || ''), ...labels(call)].join('\n'); }
async function webhook(bot, update) {
  const res = jsonRes();
  await bot.handleWebhook(update, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1, appBaseUrl: 'https://example.test', botUsername: 'adminkit_test_bot' });
  assert.strictEqual(res.statusCode, 200, 'webhook returns HTTP 200');
  return res.body;
}
async function main() {
  resetState(); activateAdmin();
  const sent = []; const answers = [];
  stubMaxApi(sent, answers);
  const bot = require('../bot');

  await webhook(bot, callbackUpdate({ action: 'admin_section_gifts', resetContext: true }));
  assert.strictEqual(sent.at(-1).transport, 'editMessage', 'normal message callback edits visible screen');
  assert.ok(/Подарки|лид-магниты/i.test(visible(sent.at(-1))), 'normal callback shows gifts screen');

  const beforePrivate = sent.length;
  await webhook(bot, callbackUpdate({ action: 'gifts:home' }, { withMessage: false }));
  assert.strictEqual(sent.length, beforePrivate + 1, 'no-message callback with user sends fresh private message');
  assert.strictEqual(sent.at(-1).transport, 'sendMessage', 'private fallback uses sendMessage');
  assert.strictEqual(sent.at(-1).userId, TEST_USER, 'private fallback targets callback user');
  assert.ok(/Создать подарок/i.test(visible(sent.at(-1))), 'private fallback contains gifts buttons');

  const beforeMissing = sent.length;
  await webhook(bot, callbackUpdate({ action: 'gifts:home' }, { withMessage: false, withUser: false }));
  assert.strictEqual(sent.length, beforeMissing, 'no-message/no-user callback sends no fake success message');
  assert.ok(botAudit.list().some((event) => event.type === 'gifts_root_callback_delivery_target_missing'), 'missing delivery target is audited');

  await webhook(bot, callbackUpdate({ action: 'admin_section_gifts' }));
  await webhook(bot, callbackUpdate({ action: 'gifts:home' }));
  assert.ok(!botAudit.list().some((event) => event.type === 'unsupported_callback' && ['admin_section_gifts', 'gifts:home'].includes(event.action)), 'gifts root actions never become unsupported callbacks');

  const payload = runtimeTrace.buildTracePayload({ limit: 50 });
  assert.strictEqual(payload.safe, true, 'runtime trace payload is marked safe');
  assert.ok(payload.updatedAt, 'runtime trace payload has updatedAt');
  assert.ok(payload.runtimeVersion, 'runtime trace payload has runtimeVersion');
  assert.ok(Array.isArray(payload.summary), 'runtime trace payload has summary array');
  assert.ok(Array.isArray(payload.events), 'runtime trace payload has events array');
  assert.ok(payload.events.length <= 50, 'runtime trace payload keeps bounded recent events');
  assert.ok(payload.events.some((event) => event.type === 'gifts_root_callback_private_fallback_sent'), 'runtime trace includes private fallback event');
  assert.strictEqual(runtimeTrace.DEFAULT_PATH, 'runtime/bot-audit-trace.json', 'runtime trace writes expected path');
  assert.ok(!JSON.stringify(payload).includes('test-token'), 'runtime trace payload does not expose bot token');

  console.log(JSON.stringify({ ok: true, test: 'PR243 gifts no-message callback and runtime trace export' }, null, 2));
}
main().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
