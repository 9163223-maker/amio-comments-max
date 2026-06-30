'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const botAudit = require('../admin-bot-audit-trace');

const TEST_USER = 'pr242-admin-user';

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
  const code = access.createActivationCode({ planId: 'business', durationDays: 3650, maxChannels: 20, createdByMaxUserId: 'pr242-system' });
  const activated = access.activateCode({ maxUserId: TEST_USER, name: 'PR242 Admin', code: code.code });
  assert.strictEqual(activated.ok, true, 'active test tenant activation succeeds');
}

function stubMaxApi(sent, answers) {
  maxApi.sendMessage = async (payload) => { sent.push({ ...payload, transport: 'sendMessage' }); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push({ ...payload, transport: 'editMessage' }); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async (payload) => { answers.push(payload); return { ok: true }; };
  maxApi.getChat = async () => ({ title: 'PR242 Канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });
}

function jsonRes() {
  return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return body; } };
}

function callbackUpdate(payload) {
  return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${Date.now()}-${Math.random()}`, user: { user_id: TEST_USER, first_name: 'PR242' }, payload: JSON.stringify(payload) }, message: { id: `menu-${Date.now()}-${Math.random()}`, body: { mid: `mid-${Date.now()}-${Math.random()}`, text: 'old menu' }, sender: { user_id: TEST_USER }, recipient: { chat_id: `${TEST_USER}-chat`, chat_type: 'user' } } } };
}

function labels(call) {
  return (call?.attachments?.find((item) => item?.type === 'inline_keyboard')?.payload?.buttons || [])
    .flat()
    .map((button) => String(button.text || '').trim())
    .filter(Boolean);
}

function visible(call) { return [String(call?.text || ''), ...labels(call)].join('\n'); }

async function send(bot, sent, payload, label) {
  const before = sent.length;
  const res = jsonRes();
  await bot.handleWebhook(callbackUpdate(payload), res, { botToken: 'test-token', menuDeleteTimeoutMs: 1, appBaseUrl: 'https://example.test', botUsername: 'adminkit_test_bot' });
  assert.strictEqual(res.statusCode, 200, `${label}: HTTP 200`);
  assert.notStrictEqual(res.body?.reason, 'unsupported_callback', `${label}: must not be unsupported_callback`);
  assert.ok(res.body?.ok, `${label}: callback result ok`);
  assert.ok(sent.length > before, `${label}: edits or sends a visible screen`);
  const call = sent.at(-1);
  assert.ok(/Подарки|лид-магниты/i.test(visible(call)), `${label}: visible Gifts root text`);
  assert.ok(/Выбрать пост/i.test(visible(call)), `${label}: visible choose post button`);
  assert.ok(/Все подарки/i.test(visible(call)), `${label}: visible scoped all gifts button`);
  assert.ok(/Помощь/i.test(visible(call)), `${label}: visible help button`);
  assert.ok(/Главное меню/i.test(visible(call)), `${label}: visible main menu button`);
  return { res: res.body, call };
}

async function main() {
  resetState();
  activateAdmin();
  const sent = [];
  const answers = [];
  stubMaxApi(sent, answers);
  const bot = require('../bot');

  const cases = [
    ['action admin_section_gifts', { action: 'admin_section_gifts', resetContext: true }],
    ['action gifts:home', { action: 'gifts:home' }],
    ['route gifts:home', { action: 'unknown_for_pr242_route', route: 'gifts:home' }],
    ['r gifts:home', { action: 'unknown_for_pr242_r', r: 'gifts:home' }]
  ];
  for (const [label, payload] of cases) await send(bot, sent, payload, label);

  assert.strictEqual(answers.length, cases.length, 'every Gifts root callback is acknowledged');
  const events = botAudit.list().filter((event) => event.type === 'gifts_root_callback_resolved');
  assert.ok(events.length >= cases.length, 'timing/audit event is recorded for Gifts root callbacks');
  for (const event of events.slice(0, cases.length)) {
    assert.ok(['v3-menu-core', 'legacy-sendSectionMenu', 'safe-fallback'].includes(event.resolver), 'audit resolver is known');
    assert.strictEqual(typeof event.totalMs, 'number', 'audit totalMs is numeric');
    assert.strictEqual(typeof event.renderMs, 'number', 'audit renderMs is numeric');
    assert.strictEqual(typeof event.deliveryMs, 'number', 'audit deliveryMs is numeric');
  }

  console.log(JSON.stringify({ ok: true, test: 'PR242 gifts root callback coverage', cases: cases.map(([label]) => label) }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
