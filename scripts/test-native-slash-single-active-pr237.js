'use strict';

process.env.ADMIN_ID = [process.env.ADMIN_ID, 'admin-pr237'].filter(Boolean).join(',');

const assert = require('assert');
const slash = require('../services/nativeSlashCommands');
const runtimeContract = require('../services/runtimeContractService');

function privateChat() {
  return { id: 'slash-user-message', body: { mid: 'slash-user-mid' }, sender: { user_id: 'admin-pr237' }, recipient: { chat_id: 'admin-pr237', user_id: 'admin-pr237', chat_type: 'chat' } };
}
function groupChat() {
  return { id: 'group-slash-user-message', sender: { user_id: 'admin-pr237' }, recipient: { chat_id: 'group-pr237', chat_type: 'group', title: 'Group' } };
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
function assertPrivateSingleActive(command) {
  return run(command).then(({ events }) => {
    assert.strictEqual(events.filter((event) => event.kind === 'upsert').length, 1, `${command} uses single-active upsert`);
    assert.strictEqual(events[0].kind, 'upsert', `${command} does not cleanup before render`);
    assert.strictEqual(events[0].editCurrent, true, `${command} edits latest active menu`);
    assert.strictEqual(events.some((event) => event.kind === 'cleanup'), false, `${command} skips pre-cleanup`);
    assert.strictEqual(events.some((event) => event.kind === 'fresh' || event.kind === 'reply'), false, `${command} does not force fresh send`);
    assert.notStrictEqual(events[0].payload.message?.id, 'slash-user-message', `${command} strips inbound message id before upsert`);
    assert.notStrictEqual(events[0].payload.message?.body?.mid, 'slash-user-mid', `${command} strips inbound body mid before upsert`);
    assert.strictEqual(events[0].payload.message?.__adminkitSlashSingleActiveEditTarget, 'latest_bot_menu_only', `${command} marks latest bot menu edit target`);
  });
}
function assertGroupHelp(events, label) {
  const render = events.find((event) => event.kind === 'fresh' || event.kind === 'reply' || event.kind === 'upsert');
  assert(render, `${label} renders`);
  assert(String(render.payload.text || '').includes('🔔 Уведомления чата'), `${label} renders group push/help`);
  assert.notStrictEqual(render.kind, 'upsert', `${label} does not use single-active admin delivery`);
}

(async function main() {
  for (const command of ['/channels', '/polls', '/stats', '/menu']) await assertPrivateSingleActive(command);

  const clearEvents = (await run('/clear')).events;
  assert.deepStrictEqual(clearEvents.map((event) => event.kind), ['cleanup', 'fresh'], '/clear uses explicit cleanup then fresh screen');
  assert.strictEqual(clearEvents[0].includeUserMessages, true, '/clear includes user messages in cleanup');

  assertGroupHelp((await run('/debug', groupChat())).events, 'group /debug denied');
  assertGroupHelp((await run('/clear', groupChat())).events, 'group /clear denied');
  assertGroupHelp((await run('/help', groupChat())).events, 'group /help allowed help');
  const pushRun = await run('/push', groupChat());
  assert.strictEqual(pushRun.result, false, 'group /push is passed through to the existing public group push handler');
  assert.deepStrictEqual(pushRun.events, [], 'group /push does not render admin screens or use upsert');

  const direct = slash.pr237Contract();
  const snapshot = runtimeContract.buildContract().pr237SingleActiveSlashUx;
  for (const key of Object.keys(direct)) {
    assert.strictEqual(direct[key], true, `direct contract ${key}`);
    assert.strictEqual(snapshot[key], true, `runtime snapshot contract ${key}`);
  }
  assert.deepStrictEqual(require('../services/maxCommandRegistryService').GLOBAL_COMMAND_NAMES, ['/push', '/help'], 'global MAX registry remains push/help only');
  console.log('PR237 native slash single-active contract assertions passed');
})().catch((error) => { console.error(error); process.exit(1); });