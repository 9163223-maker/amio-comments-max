'use strict';

const menuV3Adapter = require('../features/menu-v3/adapter');
const walkthroughTrace = require('../admin-walkthrough-trace');

const COMMANDS = new Set([
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
  command = ''
}) {
  const startedAt = Date.now();
  walkthroughTrace.log('slash.screen_start', { command, route, userId, skipCleanup });

  if (!skipCleanup) {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
  }

  const screen = menuV3Adapter.render(route || 'main:home');
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
  walkthroughTrace.log('slash.received', { command, userId });

  if (command === '/clear') {
    const failedIds = await cleanupBeforeSlash(
      config,
      userId,
      cleanupAdminWorkspaceOnMainMenu,
      { includeUserMessages: true }
    );

    const failedCount = cleanupFailedCount(failedIds);

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
      note: failedCount
        ? `Очистил доступные сообщения. ${failedCount} сообщений MAX не разрешил удалить. Открываю одно актуальное меню.`
        : 'Чат очищен от активных меню бота. Открываю одно актуальное меню.'
    });
  }

  const route = ROUTE_BY_COMMAND[command];
  if (!route) {
    walkthroughTrace.log('slash.unknown_route', { command, userId });
    return false;
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
    note: command === '/menu' || command === '/start' ? 'Главное меню открыто.' : ''
  });
}

module.exports = {
  getNativeSlashCommand,
  handleNativeSlashCommand
};
