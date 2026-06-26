'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';
delete process.env.GITHUB_DEBUG_TOKEN;

const store = require('../store');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const botAudit = require('../admin-bot-audit-trace');
const runtimeTrace = require('../services/runtimeBotAuditTraceService');

const TEST_USER = 'pr244-admin-user';

function resetState() {
  botAudit.clear();
  runtimeTrace._resetSchedulerForTests();
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
  const code = access.createActivationCode({ planId: 'business', durationDays: 3650, maxChannels: 20, createdByMaxUserId: 'pr244-system' });
  assert.strictEqual(access.activateCode({ maxUserId: TEST_USER, name: 'PR244 Admin', code: code.code }).ok, true);
}
function stubMaxApi(sent, answers) {
  maxApi.sendMessage = async (payload) => { sent.push({ ...payload, transport: 'sendMessage' }); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push({ ...payload, transport: 'editMessage' }); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async (payload) => { answers.push(payload); return { ok: true }; };
  maxApi.getChat = async () => ({ title: 'PR244 Канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });
}
function jsonRes() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return body; } }; }
function callbackUpdate(payload, options = {}) {
  const callback = { callback_id: options.callbackId || `cb-${Date.now()}-${Math.random()}`, payload: JSON.stringify(payload) };
  if (options.withUser !== false) callback.user = { user_id: TEST_USER, first_name: 'PR244' };
  const body = { update_type: 'message_callback', callback };
  if (options.withMessage !== false) body.message = { id: options.messageId || `menu-${Date.now()}`, body: { mid: options.mid || `mid-${Date.now()}`, text: 'old menu' }, sender: { user_id: TEST_USER }, recipient: { chat_id: `${TEST_USER}-chat`, chat_type: 'user' } };
  return { body };
}
function labels(call) { return (call?.attachments?.find((item) => item?.type === 'inline_keyboard')?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(call) { return [String(call?.text || ''), ...labels(call)].join('\n'); }
async function webhook(bot, update) {
  const res = jsonRes();
  await bot.handleWebhook(update, res, { botToken: 'test-token-pr244', menuDeleteTimeoutMs: 1, appBaseUrl: 'https://example.test', botUsername: 'adminkit_test_bot' });
  assert.strictEqual(res.statusCode, 200, 'webhook returns HTTP 200');
  return res.body;
}

async function main() {
  resetState();
  activateAdmin();
  const sent = []; const answers = [];
  stubMaxApi(sent, answers);
  const bot = require('../bot');

  await webhook(bot, callbackUpdate({ action: 'admin_section_gifts', resetContext: true }, { callbackId: 'same-root-callback', messageId: 'same-root-message', mid: 'same-root-mid' }));
  assert.strictEqual(sent.at(-1).transport, 'editMessage', 'first Gifts root callback edits visible screen');
  assert.ok(/Подарки|лид-магниты/i.test(visible(sent.at(-1))), 'first Gifts root callback renders Gifts screen');

  const afterFirstRoot = sent.length;
  await webhook(bot, callbackUpdate({ action: 'admin_section_gifts', resetContext: true }, { callbackId: 'same-root-callback', messageId: 'same-root-message', mid: 'same-root-mid' }));
  assert.strictEqual(sent.length, afterFirstRoot + 1, 'repeated same Gifts root callback is not swallowed by duplicate gate');
  assert.strictEqual(sent.at(-1).transport, 'editMessage', 'repeated Gifts root callback still updates visible screen');
  assert.ok(/Подарки|лид-магниты/i.test(visible(sent.at(-1))), 'repeated Gifts root callback still renders Gifts screen');

  await webhook(bot, callbackUpdate({ action: 'gifts:home' }, { callbackId: 'route-root-callback' }));
  await webhook(bot, callbackUpdate({ route: 'gifts:home' }, { callbackId: 'route-root-callback' }));
  await webhook(bot, callbackUpdate({ r: 'gifts:home' }, { callbackId: 'route-root-callback' }));
  assert.ok(!botAudit.list().some((event) => event.type === 'unsupported_callback' && ['admin_section_gifts', 'gifts:home'].includes(event.action || event.route || event.r)), 'Gifts root variants do not reach unsupported_callback');

  const beforeDuplicateSent = sent.length;
  await webhook(bot, callbackUpdate({ action: 'pr244_non_root_duplicate_probe' }, { callbackId: 'same-non-root-callback', messageId: 'same-non-root-message', mid: 'same-non-root-mid' }));
  await webhook(bot, callbackUpdate({ action: 'pr244_non_root_duplicate_probe' }, { callbackId: 'same-non-root-callback', messageId: 'same-non-root-message', mid: 'same-non-root-mid' }));
  assert.strictEqual(sent.length, beforeDuplicateSent, 'duplicate non-root callback can be skipped without rendering');

  const chronological = botAudit.list().slice().reverse();
  const preDedupeEvents = chronological.filter((event) => event.type === 'callback_received_pre_dedupe');
  assert.ok(preDedupeEvents.length >= 6, 'callback_received_pre_dedupe is logged for all callbacks before dedupe');
  const duplicateEventIndex = chronological.findIndex((event) => event.type === 'duplicate_callback_skipped');
  assert.ok(duplicateEventIndex >= 0, 'duplicate non-root callback emits duplicate_callback_skipped');
  assert.ok(chronological.slice(0, duplicateEventIndex).some((event) => event.type === 'callback_received_pre_dedupe' && event.action === 'pr244_non_root_duplicate_probe'), 'pre-dedupe event is logged before duplicate skip');
  const duplicateEvent = chronological[duplicateEventIndex];
  assert.strictEqual(duplicateEvent.action, 'pr244_non_root_duplicate_probe', 'duplicate audit keeps safe action');
  assert.strictEqual(duplicateEvent.hasMessage, true, 'duplicate audit includes hasMessage');
  assert.strictEqual(duplicateEvent.hasUserId, true, 'duplicate audit includes hasUserId');
  assert.strictEqual(duplicateEvent.hasCallbackId, true, 'duplicate audit includes hasCallbackId');
  assert.strictEqual(duplicateEvent.actionKeyPresent, false, 'duplicate audit includes actionKeyPresent');
  assert.strictEqual(duplicateEvent.duplicateReason, 'callback_id', 'duplicate audit includes duplicateReason');

  runtimeTrace._resetSchedulerForTests();
  runtimeTrace._setDebounceMsForTests(5);
  let scheduledExports = 0;
  runtimeTrace._setExportLatestTraceForTests(async () => { scheduledExports += 1; return { ok: true, branch: runtimeTrace.DEFAULT_BRANCH, path: runtimeTrace.DEFAULT_PATH }; });
  botAudit.log('duplicate_callback_skipped', { action: 'manual_duplicate_probe', hasMessage: true, hasUserId: true, hasCallbackId: true, duplicateReason: 'callback_id', actionKeyPresent: false });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(scheduledExports >= 1, 'duplicate_callback_skipped triggers runtime trace schedule/export path');

  const tracePayload = runtimeTrace.buildTracePayload({ limit: 50 });
  assert.strictEqual(tracePayload.safe, true, 'trace payload remains marked safe');
  assert.ok(tracePayload.events.length <= 50, 'trace payload remains bounded');
  const traceText = JSON.stringify(tracePayload);
  assert.ok(!traceText.includes('test-token-pr244'), 'trace payload does not include bot token');
  assert.ok(!traceText.includes('same-root-callback'), 'trace payload does not include raw callback IDs');
  assert.ok(!traceText.includes('same-root-message'), 'trace payload does not include raw message IDs');
  assert.ok(tracePayload.events.some((event) => event.type === 'callback_received_pre_dedupe'), 'trace payload includes pre-dedupe callback event');
  assert.ok(tracePayload.events.some((event) => event.type === 'duplicate_callback_skipped'), 'trace payload includes duplicate callback event');
  assert.strictEqual(runtimeTrace.DEFAULT_PATH, 'runtime/bot-audit-trace.json', 'runtime trace writes only expected runtime path');
  assert.strictEqual(runtimeTrace.DEFAULT_BRANCH, 'runtime-status', 'runtime trace writes diagnostic runtime-status branch only');
  runtimeTrace._resetSchedulerForTests();

  console.log(JSON.stringify({ ok: true, test: 'PR244 Gifts root pre-dedupe trace' }, null, 2));
}
main().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
