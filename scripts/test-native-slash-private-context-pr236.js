'use strict';

process.env.ADMIN_ID = [process.env.ADMIN_ID, 'admin-private'].filter(Boolean).join(',');

const assert = require('assert');
const slash = require('../services/nativeSlashCommands');

function privateChat(overrides = {}) {
  return {
    sender: { user_id: 'admin-private' },
    recipient: { chat_id: 'admin-private', user_id: 'admin-private', chat_type: 'chat', ...overrides.recipient },
    ...overrides
  };
}

function groupChat(type = 'group', extra = {}) {
  return {
    sender: { user_id: 'admin-private' },
    recipient: { chat_id: 'group-1', chat_type: type, title: 'Public group', ...extra }
  };
}

function helpers(sent) {
  return {
    getSenderUserId: (message) => message.sender.user_id,
    cleanupAdminWorkspaceOnMainMenu: async () => [],
    sendFreshAdminMessage: async (payload) => { sent.push(payload); return payload; },
    replyToUser: async (payload) => { sent.push(payload); return payload; }
  };
}

async function render(command, message) {
  const sent = [];
  await slash.handleNativeSlashCommand({ config: {}, message, command, helpers: helpers(sent) });
  assert.strictEqual(sent.length, 1, `${command} should render exactly one screen`);
  return sent[0];
}

(async function run() {
  assert.strictEqual(slash.isGroupContext(privateChat()), false, 'MAX private bot chat with chat_type=chat and same recipient/user semantics is private');
  assert.strictEqual(slash.isGroupContext(privateChat({ recipient: { chat_id: 'opaque-private-chat-id', user_id: 'admin-private' } })), false, 'opaque private chat id with recipient user id matching sender is private');

  for (const type of ['group', 'channel', 'public', 'supergroup', 'shared_chat', 'shared']) {
    assert.strictEqual(slash.isGroupContext(groupChat(type)), true, `${type} is group/channel context`);
  }
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { title: 'Group title' })), true, 'chat_type=chat with group title hint is group context');

  for (const command of ['/clear', '/buttons', '/stats']) {
    assert.strictEqual(slash.isCommandAllowedInContext({ command, message: privateChat(), userId: 'admin-private' }), true, `${command} is allowed in private chat`);
  }
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/clear', message: groupChat('group'), userId: 'admin-private' }), false, '/clear is denied in real group context');
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/push', message: groupChat('group'), userId: 'admin-private' }), true, '/push remains allowed in group context');
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/help', message: groupChat('group'), userId: 'admin-private' }), true, '/help remains allowed in group context');

  const clearPrivate = await render('/clear', privateChat());
  assert(!clearPrivate.text.includes('🔔 Уведомления чата'), '/clear in private chat must not render group help/push screen');
  assert(clearPrivate.text.includes('Чат очищен от активных меню бота'), '/clear in private chat reports cleanup and opens current gate/main screen');

  const buttonsPrivate = await render('/buttons', privateChat());
  assert(buttonsPrivate.text.includes('Кнопки под постами'), '/buttons opens Buttons under posts section in private chat');

  const statsPrivate = await render('/stats', privateChat());
  assert(statsPrivate.text.includes('📊 Статистика'), '/stats opens current stats root in private chat');
  assert(!/legacy/i.test(statsPrivate.text), '/stats private route must not render a legacy stats root marker');

  const clearGroup = await render('/clear', groupChat('group'));
  assert(clearGroup.text.includes('🔔 Уведомления чата') && clearGroup.text.includes('/push'), '/clear in group renders group help/push screen');

  console.log('native slash private context pr236 ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
