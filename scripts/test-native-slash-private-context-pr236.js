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
  const titledPrivateChat = {
    sender: { user_id: 'admin-private' },
    recipient: { chat_id: 'opaque-private-chat-id', chat_type: 'chat', title: 'АдминКИТ Bot' },
    chat: { id: 'opaque-private-chat-id', title: 'АдминКИТ Bot' }
  };
  assert.strictEqual(slash.isGroupContext(titledPrivateChat), false, 'chat_type=chat with title but no explicit group/member flags is private-like');

  const realContextTypes = ['group', 'channel', 'public', 'supergroup', 'shared_chat', 'shared'];
  for (const type of realContextTypes) {
    assert.strictEqual(slash.isGroupContext(groupChat(type)), true, `${type} is group/channel context`);
  }
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { title: 'Group title' })), false, 'chat_type=chat title alone is not a group hint');
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { is_group: true })), true, 'chat_type=chat with explicit group flag is group context');
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { members_count: 3 })), true, 'chat_type=chat with member count is group context');

  for (const command of ['/clear', '/buttons', '/stats']) {
    assert.strictEqual(slash.isCommandAllowedInContext({ command, message: privateChat(), userId: 'admin-private' }), true, `${command} is allowed in private chat`);
  }
  for (const type of realContextTypes) {
    assert.strictEqual(slash.isCommandAllowedInContext({ command: '/clear', message: groupChat(type), userId: 'admin-private' }), false, `/clear is denied in ${type} context`);
    assert.strictEqual(slash.isCommandAllowedInContext({ command: '/push', message: groupChat(type), userId: 'admin-private' }), true, `/push remains allowed in ${type} context`);
    assert.strictEqual(slash.isCommandAllowedInContext({ command: '/help', message: groupChat(type), userId: 'admin-private' }), true, `/help remains allowed in ${type} context`);
  }

  const clearPrivate = await render('/clear', privateChat());
  assert(!clearPrivate.text.includes('🔔 Уведомления чата'), '/clear in private chat must not render group help/push screen');
  assert(clearPrivate.text.includes('Чат очищен от активных меню бота'), '/clear in private chat reports cleanup and opens current gate/main screen');

  const clearTitledPrivate = await render('/clear', titledPrivateChat);
  assert(!clearTitledPrivate.text.includes('🔔 Уведомления чата'), '/clear in titled private-like chat must not render group help/push screen');

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
