'use strict';

const menuCore = require('../v3-menu-core-1539');
const walkthroughTrace = require('../admin-walkthrough-trace');
const access = require('./clientAccessService');
const accessGate = require('./accessGateService');
const accountScreens = require('../features/account-screens-pr106');
const maxCommandRegistry = require('./maxCommandRegistryService');

const PUBLIC_GROUP_COMMANDS = maxCommandRegistry.GLOBAL_COMMAND_NAMES;
const ADMIN_PRIVATE_COMMANDS = Object.freeze([
  '/start',
  '/menu',
  '/channels',
  '/comments',
  '/gifts',
  '/buttons',
  '/highlight',
  '/polls',
  '/posts',
  '/archive',
  '/moderation',
  '/stats',
  '/account',
  '/debug',
  '/help',
  '/terms',
  '/privacy',
  '/clear'
]);
const COMMANDS = new Set([...PUBLIC_GROUP_COMMANDS, ...ADMIN_PRIVATE_COMMANDS]);

const ROUTE_BY_COMMAND = {
  '/start': 'main:home',
  '/menu': 'main:home',
  '/channels': 'channels:home',
  '/comments': 'comments:home',
  '/gifts': 'gifts:home',
  '/buttons': 'buttons:home',
  '/highlight': 'highlight:home',
  '/polls': 'polls:home',
  '/posts': 'editor:home',
  '/archive': 'archive:home',
  '/moderation': 'moderation:home',
  '/stats': 'stats:home',
  '/account': 'account:home',
  '/debug': 'debug:home',
  '/help': 'help:home',
  '/terms': 'terms:home',
  '/privacy': 'privacy:home'
};

function getNativeSlashCommand(text = '') {
  const raw = String(text || '').trim();
  if (!raw.startsWith('/')) return '';
  const first = raw.split(/\s+/)[0] || '';
  const command = first.replace(/@[\w.:-]+$/i, '').trim().toLowerCase();
  return COMMANDS.has(command) ? command : '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function isPositiveCount(value) {
  if (value === undefined || value === null || value === '') return false;
  const count = Number(value);
  return Number.isFinite(count) ? count > 0 : Boolean(value);
}

function hasExplicitGroupHints(source = {}) {
  return Boolean(
    source.is_group || source.isGroup ||
    source.is_public || source.isPublic ||
    source.is_channel || source.isChannel ||
    source.is_shared_chat || source.isSharedChat ||
    isPositiveCount(source.members_count || source.membersCount) ||
    isPositiveCount(source.participants_count || source.participantsCount) ||
    isPositiveCount(source.chat_members_count || source.chatMembersCount)
  );
}

function isNegativeChatId(value = '') {
  return /^-\d+$/.test(String(value || '').trim());
}

function isGroupContext(message = {}) {
  const body = message && message.body && typeof message.body === 'object' ? message.body : {};
  const recipient = message && message.recipient && typeof message.recipient === 'object' ? message.recipient : (body.recipient || {});
  const chat = message && message.chat && typeof message.chat === 'object'
    ? message.chat
    : (body.chat && typeof body.chat === 'object' ? body.chat : {});
  const recipientType = String(recipient.chat_type || recipient.type || '').trim().toLowerCase();
  const messageType = String(message.chat_type || message.chatType || message.type || body.chat_type || body.chatType || body.type || '').trim().toLowerCase();
  const chatType = String(chat.type || chat.chat_type || chat.chatType || '').trim().toLowerCase();
  const groupTypes = ['group', 'public', 'channel', 'supergroup', 'shared', 'shared_chat'];
  const privateTypes = ['private', 'direct', 'dialog', 'user', 'bot'];
  if (groupTypes.includes(recipientType) || groupTypes.includes(messageType) || groupTypes.includes(chatType)) return true;

  const chatId = firstNonEmpty(
    recipient.chat_id,
    recipient.chatId,
    recipient.id,
    message.chat_id,
    message.chatId,
    body.chat_id,
    body.chatId,
    chat.id,
    chat.chat_id,
    chat.chatId
  );
  const senderId = firstNonEmpty(
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
  const recipientUserId = firstNonEmpty(
    recipient.user_id,
    recipient.userId,
    recipient.uid,
    body?.recipient?.user_id,
    body?.recipient?.userId,
    body?.recipient?.id
  );

  if (hasExplicitGroupHints(recipient) || hasExplicitGroupHints(chat) || hasExplicitGroupHints(body.chat || {})) return true;
  if (isNegativeChatId(chatId)) return true;
  if (privateTypes.includes(recipientType) || privateTypes.includes(messageType) || privateTypes.includes(chatType)) return false;
  if (recipientUserId && senderId && recipientUserId === senderId) return false;

  if (recipientType === 'chat' || messageType === 'chat' || chatType === 'chat') return Boolean(chatId && senderId && chatId !== senderId);
  return Boolean(chatId && senderId && chatId !== senderId);
}

function clientGroupHelpScreen() {
  return {
    id: 'pr185_group_client_help',
    text: ['🔔 Уведомления чата', '', 'Отправьте /push, чтобы подключить уведомления этого чата.', 'Если нужна помощь, откройте личный чат с ботом.'].join('\n'),
    attachments: []
  };
}

function isCommandAllowedInContext({ command = '', message = {}, userId = '' } = {}) {
  if (!isGroupContext(message)) return true;
  return PUBLIC_GROUP_COMMANDS.includes(command);
}

async function cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu, options = {}) {
  if (!cleanupAdminWorkspaceOnMainMenu || !userId) return [];
  try {
    const failed = await cleanupAdminWorkspaceOnMainMenu(config, userId, {
      includeUserMessages: Boolean(options.includeUserMessages)
    });
    walkthroughTrace.log('slash.cleanup', {
      userId,
      includeUserMessages: Boolean(options.includeUserMessages),
      failedCount: Array.isArray(failed) ? failed.length : 0
    });
    return failed;
  } catch (error) {
    walkthroughTrace.log('slash.cleanup_error', {
      userId,
      error: error?.message || String(error)
    });
    return [];
  }
}

function cleanupFailedCount(failedIds) {
  return Array.isArray(failedIds) ? failedIds.length : 0;
}

async function sendUnifiedScreen({
  config,
  message,
  userId,
  cleanupAdminWorkspaceOnMainMenu,
  sendFreshAdminMessage,
  replyToUser,
  route = 'main:home',
  note = '',
  skipCleanup = false,
  command = '',
  screen: providedScreen = null
}) {
  const startedAt = Date.now();
  walkthroughTrace.log('slash.screen_start', { command, route, userId, skipCleanup });

  if (!skipCleanup) {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
  }

  const screen = providedScreen || menuCore.screenForPayload({ action: route || 'main:home', route: route || 'main:home' }) || menuCore.mainScreen();
  const text = [
    note ? String(note).trim() : '',
    screen.text || 'АдминКИТ'
  ].filter(Boolean).join('\n\n');

  walkthroughTrace.log('slash.screen_rendered', {
    command,
    route,
    userId,
    textLength: text.length,
    attachmentsCount: Array.isArray(screen.attachments) ? screen.attachments.length : 0,
    firstLine: String(text || '').split('\n')[0] || ''
  });

  const sendScreen = sendFreshAdminMessage || replyToUser;
  try {
    const result = await sendScreen({
      config,
      message,
      text,
      attachments: Array.isArray(screen.attachments) ? screen.attachments : []
    });
    walkthroughTrace.log('slash.screen_sent', {
      command,
      route,
      userId,
      durationMs: Date.now() - startedAt,
      resultMessageId: result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.id || ''
    });
    return result;
  } catch (error) {
    walkthroughTrace.log('slash.screen_send_error', {
      command,
      route,
      userId,
      durationMs: Date.now() - startedAt,
      error: error?.message || String(error),
      status: error?.status || ''
    });
    throw error;
  }
}

async function handleNativeSlashCommand({ config, message, command, helpers }) {
  const {
    getSenderUserId,
    replyToUser,
    sendFreshAdminMessage,
    cleanupAdminWorkspaceOnMainMenu
  } = helpers;

  const userId = getSenderUserId(message);
  const groupContext = isGroupContext(message);
  walkthroughTrace.log('slash.received', { command, userId, groupContext });

  if (!isCommandAllowedInContext({ command, message, userId })) {
    return sendUnifiedScreen({
      config,
      message,
      userId,
      cleanupAdminWorkspaceOnMainMenu,
      sendFreshAdminMessage,
      replyToUser,
      route: 'help:home',
      skipCleanup: true,
      command,
      screen: clientGroupHelpScreen()
    });
  }

  if (groupContext && command === '/help') {
    return sendUnifiedScreen({
      config,
      message,
      userId,
      cleanupAdminWorkspaceOnMainMenu,
      sendFreshAdminMessage,
      replyToUser,
      route: 'help:home',
      skipCleanup: true,
      command,
      screen: clientGroupHelpScreen()
    });
  }

  if (command === '/clear') {
    const failedIds = await cleanupBeforeSlash(
      config,
      userId,
      cleanupAdminWorkspaceOnMainMenu,
      { includeUserMessages: true }
    );

    const failedCount = cleanupFailedCount(failedIds);
    const screen = accountScreens.gateMenuForUser(userId);

    return sendUnifiedScreen({
      config,
      message,
      userId,
      cleanupAdminWorkspaceOnMainMenu,
      sendFreshAdminMessage,
      replyToUser,
      route: 'main:home',
      skipCleanup: true,
      command,
      screen,
      note: failedCount
        ? `Очистил доступные сообщения. ${failedCount} сообщений MAX не разрешил удалить. Открываю актуальный экран.`
        : 'Чат очищен от активных меню бота. Открываю актуальный экран.'
    });
  }

  const route = ROUTE_BY_COMMAND[command];
  if (!route) {
    walkthroughTrace.log('slash.unknown_route', { command, userId });
    return false;
  }

  let screen = null;
  let note = command === '/menu' || command === '/start' ? 'Главное меню открыто.' : '';
  if (command === '/account') {
    screen = accountScreens.accountHome(userId);
  } else if (command === '/start' || command === '/menu') {
    screen = accountScreens.gateMenuForUser(userId);
  } else {
    const decision = accessGate.checkCommand(userId, command);
    if (!decision.allow) screen = accountScreens.screenForGateDecision(decision, userId);
    else if (command === '/debug' && access.isAdmin(userId)) screen = menuCore.screenForPayload({ action: 'admin_section_debug' });
  }

  return sendUnifiedScreen({
    config,
    message,
    userId,
    cleanupAdminWorkspaceOnMainMenu,
    sendFreshAdminMessage,
    replyToUser,
    route,
    command,
    screen,
    note
  });
}

module.exports = {
  PUBLIC_GROUP_COMMANDS,
  ADMIN_PRIVATE_COMMANDS,
  getNativeSlashCommand,
  isGroupContext,
  isCommandAllowedInContext,
  clientGroupHelpScreen,
  handleNativeSlashCommand
};