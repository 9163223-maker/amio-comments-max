'use strict';

process.env.ADMIN_ID = [process.env.ADMIN_ID, 'admin-private'].filter(Boolean).join(',');

const assert = require('assert');
const slash = require('../services/nativeSlashCommands');

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

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

function getTestSenderUserId(message = {}) {
  const body = message && message.body && typeof message.body === 'object' ? message.body : {};
  return firstNonEmpty(
    message?.sender?.user_id,
    message?.sender?.userId,
    message?.sender?.id,
    body?.sender?.user_id,
    body?.sender?.userId,
    body?.sender?.id,
    message?.from?.user_id,
    message?.from?.userId,
    message?.from?.id,
    body?.from?.user_id,
    body?.from?.userId,
    body?.from?.id,
    message?.user?.user_id,
    message?.user?.userId,
    message?.user?.id,
    body?.user?.user_id,
    body?.user?.userId,
    body?.user?.id,
    message?.user_id,
    message?.userId,
    body?.user_id,
    body?.userId
  );
}

function helpers(sent) {
  return {
    getSenderUserId: getTestSenderUserId,
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

function assertGroupHelp(screen, label) {
  assert(screen.text.includes('🔔 Уведомления чата') && screen.text.includes('/push'), label);
}

(async function run() {
  assert.strictEqual(slash.isGroupContext(privateChat()), false, 'MAX private bot chat with chat_type=chat and same recipient/user semantics is private');
  assert.strictEqual(slash.isGroupContext(privateChat({ recipient: { chat_id: 'opaque-private-chat-id', user_id: 'admin-private' } })), false, 'opaque private chat id with recipient user id matching sender is private');
  const titledPrivateChat = {
    sender: { user_id: 'admin-private' },
    recipient: { chat_id: 'opaque-private-chat-id', user_id: 'admin-private', chat_type: 'chat', title: 'АдминКИТ Bot', name: 'АдминКИТ' },
    chat: { id: 'opaque-private-chat-id', title: 'АдминКИТ Bot', name: 'АдминКИТ' }
  };
  assert.strictEqual(slash.isGroupContext(titledPrivateChat), false, 'chat_type=chat with title/name and matching recipient user id is private-like');

  const minimalChatGroup = { recipient: { chat_id: 'group-1', chat_type: 'chat' }, sender: { user_id: 'ordinary-user' } };
  const ambiguousTitledChat = { recipient: { chat_id: 'opaque-chat-id', chat_type: 'chat', title: 'АдминКИТ Bot', name: 'АдминКИТ' }, sender: { user_id: 'ordinary-user' } };
  const fromOnlyChatGroup = { recipient: { chat_id: 'group-1', chat_type: 'chat' }, from: { id: 'ordinary-user' } };
  const fromUserIdChatGroup = { recipient: { chat_id: 'group-1', chat_type: 'chat' }, from: { user_id: 'ordinary-user' } };
  const bodyChatGroup = { chat_type: 'chat', body: { chat: { id: 'group-1', type: 'group' }, sender: { id: 'ordinary-user' } } };
  const camelChatIdGroup = { recipient: { chatId: 'group-1', chat_type: 'chat' }, from: { id: 'ordinary-user' } };
  const topLevelGroupOverride = { recipient: { chat_id: 'group-1', chat_type: 'private' }, chat_type: 'group', sender: { user_id: 'ordinary-user' } };
  const privateViaFrom = { recipient: { chat_id: 'opaque-private-chat-id', user_id: 'admin-private', chat_type: 'chat' }, from: { id: 'admin-private' } };

  assert.strictEqual(slash.isGroupContext(minimalChatGroup), true, 'minimal chat_type=chat payload with chatId different from sender fails closed as group');
  assert.strictEqual(slash.isGroupContext(ambiguousTitledChat), true, 'chat_type=chat with title/name but no private identity and chatId different from sender fails closed as group');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: 'group-1', chat_type: 'chat' }, chat: { type: 'group' }, sender: { user_id: 'ordinary-user' } }), true, 'message.chat.type group overrides recipient chat type');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: 'group-1', chat_type: 'private' }, chat: { type: 'group' }, sender: { user_id: 'ordinary-user' } }), true, 'message.chat.type group is stronger than recipient private type');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: 'group-1', chat_type: 'private' }, chat: { is_group: true }, sender: { user_id: 'ordinary-user' } }), true, 'message.chat group hints are stronger than recipient private type');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: '-100500', chat_type: 'chat' }, sender: { user_id: 'ordinary-user' } }), true, 'negative chat id is group/channel context');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: '-100500', chat_type: 'private' }, from: { id: 'ordinary-user' } }), true, 'negative chat id wins before private-like type');
  assert.strictEqual(slash.isGroupContext(fromOnlyChatGroup), true, 'message.from.id is used for chat fallback and fails closed as group');
  assert.strictEqual(slash.isGroupContext(fromUserIdChatGroup), true, 'message.from.user_id is used for chat fallback and fails closed as group');
  assert.strictEqual(slash.isGroupContext(bodyChatGroup), true, 'body.chat group evidence is group context');
  assert.strictEqual(slash.isGroupContext(camelChatIdGroup), true, 'recipient.chatId camelCase is used for chat fallback');
  assert.strictEqual(slash.isGroupContext(topLevelGroupOverride), true, 'top-level message.chat_type group overrides private recipient type');
  assert.strictEqual(slash.isGroupContext(privateViaFrom), false, 'private chat_type=chat with recipient.user_id matching from.id remains private');

  const realContextTypes = ['group', 'channel', 'public', 'supergroup', 'shared_chat', 'shared'];
  for (const type of realContextTypes) {
    assert.strictEqual(slash.isGroupContext(groupChat(type)), true, `${type} is group/channel context`);
  }
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_type: 'chat', title: 'Group title', name: 'Group name', chat_title: 'Group chat title' }, sender: { user_id: 'ordinary-user' } }), false, 'chat_type=chat title/name/chat_title alone is not a group hint without id mismatch');
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { is_group: true })), true, 'chat_type=chat with explicit group flag is group context');
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { members_count: 3 })), true, 'chat_type=chat with member count is group context');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: 'group-1', chat_type: 'chat' }, chat: { is_group: true }, sender: { user_id: 'ordinary-user' } }), true, 'chat.is_group is group context');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: 'group-1', chat_type: 'chat' }, chat: { members_count: 3 }, sender: { user_id: 'ordinary-user' } }), true, 'chat.members_count is group context');
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { isGroup: true })), true, 'recipient.isGroup camelCase is group context');
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { isSharedChat: true })), true, 'recipient.isSharedChat camelCase is group context');
  assert.strictEqual(slash.isGroupContext(groupChat('chat', { membersCount: 3 })), true, 'recipient.membersCount camelCase is group context');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: 'group-1', chat_type: 'chat' }, chat: { isGroup: true }, sender: { user_id: 'ordinary-user' } }), true, 'chat.isGroup camelCase is group context');
  assert.strictEqual(slash.isGroupContext({ recipient: { chat_id: 'group-1', chat_type: 'chat' }, chat: { membersCount: 3 }, sender: { user_id: 'ordinary-user' } }), true, 'chat.membersCount camelCase is group context');

  for (const command of ['/clear', '/buttons', '/stats']) {
    assert.strictEqual(slash.isCommandAllowedInContext({ command, message: privateChat(), userId: 'admin-private' }), true, `${command} is allowed in private chat`);
  }
  for (const type of realContextTypes) {
    assert.strictEqual(slash.isCommandAllowedInContext({ command: '/clear', message: groupChat(type), userId: 'admin-private' }), false, `/clear is denied in ${type} context`);
    assert.strictEqual(slash.isCommandAllowedInContext({ command: '/push', message: groupChat(type), userId: 'admin-private' }), true, `/push remains allowed in ${type} context`);
    assert.strictEqual(slash.isCommandAllowedInContext({ command: '/help', message: groupChat(type), userId: 'admin-private' }), true, `/help remains allowed in ${type} context`);
  }
  const chatOverrideGroup = { recipient: { chat_id: 'group-1', chat_type: 'chat' }, chat: { type: 'group' }, sender: { user_id: 'ordinary-user' } };
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/clear', message: chatOverrideGroup, userId: 'ordinary-user' }), false, '/clear is denied when message.chat.type forces group');
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/debug', message: chatOverrideGroup, userId: 'ordinary-user' }), false, '/debug is denied when message.chat.type forces group');
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/clear', message: fromOnlyChatGroup, userId: 'ordinary-user' }), false, '/clear is denied when message.from.id identifies group actor');
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/debug', message: bodyChatGroup, userId: 'ordinary-user' }), false, '/debug is denied when body.chat.type forces group');
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/debug', message: camelChatIdGroup, userId: 'ordinary-user' }), false, '/debug is denied when recipient.chatId identifies group chat');
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/debug', message: topLevelGroupOverride, userId: 'ordinary-user' }), false, '/debug is denied when top-level message.chat_type forces group');

  const clearPrivate = await render('/clear', privateChat());
  assert(!clearPrivate.text.includes('🔔 Уведомления чата'), '/clear in private chat must not render group help/push screen');
  assert(clearPrivate.text.includes('Чат очищен от активных меню бота'), '/clear in private chat reports cleanup and opens current gate/main screen');

  const clearTitledPrivate = await render('/clear', titledPrivateChat);
  assert(!clearTitledPrivate.text.includes('🔔 Уведомления чата'), '/clear in titled private-like chat must not render group help/push screen');

  const clearPrivateViaFrom = await render('/clear', privateViaFrom);
  assert(!clearPrivateViaFrom.text.includes('🔔 Уведомления чата'), '/clear in from.id private-like chat must not render group help/push screen');

  const buttonsPrivate = await render('/buttons', privateChat());
  assert(buttonsPrivate.text.includes('Кнопки под постами'), '/buttons opens Buttons under posts section in private chat');

  const statsPrivate = await render('/stats', privateChat());
  assert(statsPrivate.text.includes('📊 Статистика'), '/stats opens current stats root in private chat');
  assert(!/legacy/i.test(statsPrivate.text), '/stats private route must not render a legacy stats root marker');

  assertGroupHelp(await render('/clear', groupChat('group')), '/clear in group renders group help/push screen');
  assertGroupHelp(await render('/clear', chatOverrideGroup), '/clear in message.chat.type group payload renders group help/push screen');
  assertGroupHelp(await render('/debug', chatOverrideGroup), '/debug in message.chat.type group payload renders group help/push screen');
  assertGroupHelp(await render('/clear', minimalChatGroup), '/clear in minimal chat_type=chat group-like payload renders group help/push screen');
  assertGroupHelp(await render('/debug', minimalChatGroup), '/debug in minimal chat_type=chat group-like payload renders group help/push screen');
  assertGroupHelp(await render('/clear', fromOnlyChatGroup), '/clear in from.id chat_type=chat group-like payload renders group help/push screen');
  assertGroupHelp(await render('/debug', fromOnlyChatGroup), '/debug in from.id chat_type=chat group-like payload renders group help/push screen');
  assertGroupHelp(await render('/clear', bodyChatGroup), '/clear in body.chat group payload renders group help/push screen');
  assertGroupHelp(await render('/debug', camelChatIdGroup), '/debug in camelCase chatId group-like payload renders group help/push screen');
  assertGroupHelp(await render('/debug', topLevelGroupOverride), '/debug in top-level group override payload renders group help/push screen');

  console.log('native slash private context pr236 ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});