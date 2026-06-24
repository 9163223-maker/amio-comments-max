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

function isGroupContext(message = {}) {
  const body = message && message.body && typeof message.body === 'object' ? message.body : {};
  const recipient = message && message.recipient && typeof message.recipient === 'object' ? message.recipient : (body.recipient || {});
  const chat = message && message.chat && typeof message.chat === 'object' ? message.chat : {};
  const type = String(recipient.chat_type || recipient.type || message.chat_type || chat.type || '').trim().toLowerCase();
  if (['group', 'public', 'channel', 'supergroup', 'shared', 'shared_chat'].includes(type)) return true;
  if (['private', 'direct', 'dialog', 'user', 'bot'].includes(type)) return false;

  const chatId = String(recipient.chat_id || recipient.id || message.chat_id || body.chat_id || chat.id || '').trim();
  const senderId = String(message?.sender?.user_id || message?.sender?.id || body?.sender?.user_id || body?.sender?.id || message?.user_id || '').trim();
  const recipientUserId = String(recipient.user_id || recipient.userId || recipient.uid || body?.recipient?.user_id || body?.recipient?.id || '').trim();
  if (recipientUserId && senderId && recipientUserId === senderId) return false;
  if (type === 'chat') {
    const hasGroupHints = Boolean(
      recipient.is_public || recipient.is_channel || recipient.is_group || recipient.is_shared_chat ||
      recipient.members_count || recipient.participants_count || recipient.chat_members_count
    );
    if (hasGroupHints) return true;
    return Boolean(chatId && senderId && chatId !== senderId);
  }
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
