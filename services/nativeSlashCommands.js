'use strict';

const menuV3Adapter = require('../features/menu-v3/adapter');

const COMMANDS = new Set([
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
    return await cleanupAdminWorkspaceOnMainMenu(config, userId, {
      includeUserMessages: Boolean(options.includeUserMessages)
    });
  } catch {
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
  replyToUser,
  route = 'main:home',
  note = '',
  skipCleanup = false
}) {
  if (!skipCleanup) {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
  }

  const screen = menuV3Adapter.render(route || 'main:home');
  const text = [
    note ? String(note).trim() : '',
    screen.text || 'АдминКИТ'
  ].filter(Boolean).join('\n\n');

  return replyToUser({
    config,
    message,
    text,
    attachments: Array.isArray(screen.attachments) ? screen.attachments : []
  });
}

async function handleNativeSlashCommand({ config, message, command, helpers }) {
  const {
    getSenderUserId,
    replyToUser,
    cleanupAdminWorkspaceOnMainMenu
  } = helpers;

  const userId = getSenderUserId(message);

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
      replyToUser,
      route: 'main:home',
      skipCleanup: true,
      note: failedCount
        ? `Очистил доступные сообщения. ${failedCount} сообщений MAX не разрешил удалить. Открываю одно актуальное меню.`
        : 'Чат очищен от активных меню бота. Открываю одно актуальное меню.'
    });
  }

  const route = ROUTE_BY_COMMAND[command];
  if (!route) return false;

  return sendUnifiedScreen({
    config,
    message,
    userId,
    cleanupAdminWorkspaceOnMainMenu,
    replyToUser,
    route,
    note: command === '/menu' ? 'Главное меню открыто.' : ''
  });
}

module.exports = {
  getNativeSlashCommand,
  handleNativeSlashCommand
};
