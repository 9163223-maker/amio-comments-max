'use strict';

process.env.ADMIN_ID = [process.env.ADMIN_ID, 'admin-pr237'].filter(Boolean).join(',');

const assert = require('assert');
const slash = require('../services/nativeSlashCommands');
const runtimeContract = require('../services/runtimeContractService');

function privateChat() {
  return { sender: { user_id: 'admin-pr237' }, recipient: { chat_id: 'admin-pr237', user_id: 'admin-pr237', chat_type: 'chat' } };
}
function groupChat() {
  return { sender: { user_id: 'admin-pr237' }, recipient: { chat_id: 'group-pr237', chat_type: 'group', title: 'Group' } };
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
  await slash.handleNativeSlashCommand({ config: {}, message, command, helpers: helpers(events, opts) });
  return events;
}
function assertPrivateSingleActive(command) {
  return run(command).then((events) => {
    assert.strictEqual(events.filter((event) => event.kind === 'upsert').length, 1, `${command} uses single-active upsert`);
    assert.strictEqual(events[0].kind, 'upsert', `${command} does not cleanup before render`);
    assert.strictEqual(events[0].editCurrent, true, `${command} edits current/latest active menu`);
    assert.strictEqual(events.some((event) => event.kind === 'cleanup'), false, `${command} skips pre-cleanup`);
    assert.strictEqual(events.some((event) => event.kind === 'fresh' || event.kind === 'reply'), false, `${command} does not force fresh send`);
  });
}
function assertGroupHelp(events, label) {
  const render = events.find((event) => event.kind === 'fresh' || event.kind === 'reply' || event.kind === 'upsert');
  assert(render, `${label} renders`);
  assert(String(render.payload.text || '').includes('🔔 Уведомления чата'), `${label} renders group push/help`);
}

(async function main() {
  for (const command of ['/channels', '/polls', '/stats', '/menu']) await assertPrivateSingleActive(command);

  const clearEvents = await run('/clear');
  assert.deepStrictEqual(clearEvents.map((event) => event.kind), ['cleanup', 'fresh'], '/clear uses explicit cleanup then fresh screen');
  assert.strictEqual(clearEvents[0].includeUserMessages, true, '/clear includes user messages in cleanup');

  assertGroupHelp(await run('/debug', groupChat()), 'group /debug denied');
  assertGroupHelp(await run('/clear', groupChat()), 'group /clear denied');
  assertGroupHelp(await run('/help', groupChat()), 'group /help allowed help');
  const pushEvents = await run('/push', groupChat());
  assert(pushEvents.length >= 1, 'group /push remains allowed');
  assert(!pushEvents.some((event) => String(event.payload?.text || '').includes('Кнопки под постами')), 'group /push does not render private admin screens');

  const direct = slash.pr237Contract();
  const snapshot = runtimeContract.buildContract().pr237SingleActiveSlashUx;
  for (const key of Object.keys(direct)) {
    assert.strictEqual(direct[key], true, `direct contract ${key}`);
    assert.strictEqual(snapshot[key], true, `runtime snapshot contract ${key}`);
  }
  assert.deepStrictEqual(require('../services/maxCommandRegistryService').GLOBAL_COMMAND_NAMES, ['/push', '/help'], 'global MAX registry remains push/help only');
  console.log('PR237 native slash single-active contract assertions passed');
})().catch((error) => { console.error(error); process.exit(1); });
