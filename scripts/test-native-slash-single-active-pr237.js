'use strict';

process.env.ADMIN_ID = [process.env.ADMIN_ID, 'admin-pr237'].filter(Boolean).join(',');

const assert = require('assert');
const slash = require('../services/nativeSlashCommands');
const runtimeContract = require('../services/runtimeContractService');
const store = require('../store');

const USER_ID = 'admin-pr237';
const INBOUND_ID = 'slash-user-message';
const INBOUND_MESSAGE_ID = 'slash-user-message-id';
const INBOUND_MESSAGE_ID_CAMEL = 'slash-user-message-id-camel';
const INBOUND_BODY_MID = 'slash-user-mid';
const INBOUND_BODY_MESSAGE_ID = 'slash-user-body-message-id';
const INBOUND_BODY_MESSAGE_ID_CAMEL = 'slash-user-body-message-id-camel';

function privateChat(overrides = {}) {
  return {
    id: INBOUND_ID,
    message_id: INBOUND_MESSAGE_ID,
    messageId: INBOUND_MESSAGE_ID_CAMEL,
    body: {
      mid: INBOUND_BODY_MID,
      message_id: INBOUND_BODY_MESSAGE_ID,
      messageId: INBOUND_BODY_MESSAGE_ID_CAMEL,
      ...(overrides.body || {})
    },
    sender: { user_id: USER_ID },
    recipient: { chat_id: USER_ID, user_id: USER_ID, chat_type: 'chat' },
    ...overrides
  };
}
function groupChat() {
  return { id: 'group-slash-user-message', sender: { user_id: USER_ID }, recipient: { chat_id: 'group-pr237', chat_type: 'group', title: 'Group' } };
}
function helpers(events, opts = {}) {
  return {
    getSenderUserId: (message) => message?.sender?.user_id || message?.sender?.id || '',
    cleanupAdminWorkspaceOnMainMenu: async (_config, _userId, options = {}) => { events.push({ kind: 'cleanup', includeUserMessages: Boolean(options.includeUserMessages) }); return []; },
    sendFreshAdminMessage: async (payload) => { events.push({ kind: 'fresh', payload }); return { id: opts.freshId || 'fresh-1' }; },
    replyToUser: async (payload) => { events.push({ kind: 'reply', payload }); return { id: opts.replyId || 'reply-1' }; },
    upsertBotMessage: async (payload) => { events.push({ kind: 'upsert', editCurrent: payload.editCurrent, payload }); return { id: opts.upsertId || 'active-1' }; }
  };
}
async function run(command, message = privateChat(), opts = {}) {
  const events = [];
  const result = await slash.handleNativeSlashCommand({ config: {}, message, command, helpers: helpers(events, opts) });
  return { events, result };
}
async function assertPrivateSingleActive(command) {
  const { events } = await run(command);
  assert.strictEqual(events.filter((event) => event.kind === 'upsert').length, 1, `${command} uses single-active upsert`);
  assert.strictEqual(events[0].kind, 'upsert', `${command} does not cleanup before render`);
  assert.strictEqual(events[0].editCurrent, true, `${command} edits latest active menu`);
  assert.strictEqual(events.some((event) => event.kind === 'cleanup'), false, `${command} skips pre-cleanup`);
  assert.strictEqual(events.some((event) => event.kind === 'fresh' || event.kind === 'reply'), false, `${command} does not force fresh send`);
  const target = events[0].payload.message || {};
  assert.notStrictEqual(target.id, INBOUND_ID, `${command} strips inbound id before upsert`);
  assert.notStrictEqual(target.message_id, INBOUND_MESSAGE_ID, `${command} strips inbound message_id before upsert`);
  assert.notStrictEqual(target.messageId, INBOUND_MESSAGE_ID_CAMEL, `${command} strips inbound messageId before upsert`);
  assert.notStrictEqual(target.body?.mid, INBOUND_BODY_MID, `${command} strips inbound body.mid before upsert`);
  assert.notStrictEqual(target.body?.message_id, INBOUND_BODY_MESSAGE_ID, `${command} strips inbound body.message_id before upsert`);
  assert.notStrictEqual(target.body?.messageId, INBOUND_BODY_MESSAGE_ID_CAMEL, `${command} strips inbound body.messageId before upsert`);
  assert.strictEqual(target.__adminkitSlashSingleActiveEditTarget, 'latest_bot_menu_only', `${command} marks latest bot menu edit target`);
}
function assertGroupHelp(events, label) {
  const render = events.find((event) => event.kind === 'fresh' || event.kind === 'reply' || event.kind === 'upsert');
  assert(render, `${label} renders`);
  assert(String(render.payload.text || '').includes('🔔 Уведомления чата'), `${label} renders group push/help`);
  assert.strictEqual(render.kind, 'reply', `${label} uses untracked reply delivery`);
  assert(!events.some((event) => event.kind === 'fresh'), `${label} must not use tracked sendFreshAdminMessage`);
  assert(!events.some((event) => event.kind === 'upsert'), `${label} must not use single-active admin delivery`);
}
function assertNoPrivateAdminPush(events, label) {
  assert(!events.some((event) => event.kind === 'upsert'), `${label} must not use single-active admin delivery`);
  assert(!events.some((event) => event.kind === 'fresh'), `${label} must not use tracked sendFreshAdminMessage`);
  assert(!events.some((event) => /Уведомления MAX|Опубликовать приглашение/.test(String(event.payload?.text || ''))), `${label} must not render private/admin push screen`);
}
function seedStaleFlowState() {
  store.clearSetupState(USER_ID);
  store.setSetupState(USER_ID, {
    latestBotMessageId: 'latest-bot-menu-mid',
    adminMessageIds: ['old-menu-mid', 'latest-bot-menu-mid'],
    currentScreen: { id: 'main:home' },
    giftFlow: { step: 'gift-title' },
    commentAdminFlow: { step: 'comment-text' },
    activeAdminFlowKind: 'gift'
  });
}
function assertStaleFlowClearedAndMenuPreserved() {
  const state = store.getSetupState(USER_ID) || {};
  assert.strictEqual(state.giftFlow, undefined, 'giftFlow is cleared by private slash navigation');
  assert.strictEqual(state.commentAdminFlow, undefined, 'commentAdminFlow is cleared by private slash navigation');
  assert.strictEqual(state.activeAdminFlowKind, undefined, 'activeAdminFlowKind is cleared by private slash navigation');
  assert.strictEqual(state.latestBotMessageId, 'latest-bot-menu-mid', 'latest active bot menu is preserved');
  assert.deepStrictEqual(state.adminMessageIds, ['old-menu-mid', 'latest-bot-menu-mid'], 'admin menu id history is preserved');
  assert.deepStrictEqual(state.currentScreen, { id: 'main:home' }, 'non-flow setup state is preserved');
}

(async function main() {
  const privateSingleActiveCommands = ['/channels', '/polls', '/stats', '/menu', '/buttons', '/comments', '/gifts'];
  for (const command of privateSingleActiveCommands) await assertPrivateSingleActive(command);

  seedStaleFlowState();
  await assertPrivateSingleActive('/channels');
  assertStaleFlowClearedAndMenuPreserved();

  const clearEvents = (await run('/clear')).events;
  assert.deepStrictEqual(clearEvents.map((event) => event.kind), ['cleanup', 'fresh'], '/clear uses explicit cleanup then fresh screen');
  assert.strictEqual(clearEvents[0].includeUserMessages, true, '/clear includes user messages in cleanup');

  const groupDeniedCommands = ['/debug', '/clear', '/buttons', '/stats', '/channels'];
  for (const command of groupDeniedCommands) assertGroupHelp((await run(command, groupChat())).events, `group ${command} denied`);
  assertGroupHelp((await run('/help', groupChat())).events, 'group /help allowed help');
  const pushRun = await run('/push', groupChat());
  assertNoPrivateAdminPush(pushRun.events, 'group /push');
  if (pushRun.result !== false) assertGroupHelp(pushRun.events, 'group /push fallback help');

  const direct = slash.pr237Contract();
  const snapshot = runtimeContract.buildContract().pr237SingleActiveSlashUx;
  for (const key of Object.keys(direct)) {
    assert.strictEqual(direct[key], true, `direct contract ${key}`);
    assert.strictEqual(snapshot[key], true, `runtime snapshot contract ${key}`);
  }
  assert.deepStrictEqual(require('../services/maxCommandRegistryService').GLOBAL_COMMAND_NAMES, ['/push', '/help'], 'global MAX registry remains push/help only');
  store.clearSetupState(USER_ID);
  console.log('PR237 native slash single-active contract assertions passed');
})().catch((error) => { console.error(error); process.exit(1); });
