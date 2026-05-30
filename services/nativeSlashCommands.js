'use strict';

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

function getNativeSlashCommand(text = '') {
  const raw = String(text || '').trim();
  if (!raw.startsWith('/')) return '';
  const first = raw.split(/\s+/)[0] || '';
  const command = first.replace(/@[\w.:-]+$/i, '').trim().toLowerCase();
  return COMMANDS.has(command) ? command : '';
}

function buildPrivacyPolicyText() {
  return [
    '🔐 Политика конфиденциальности АдминКИТ',
    '',
    'АдминКИТ — бот для управления MAX-каналами.',
    'Бот: @id781310320690_bot',
    'Адрес бота: https://max.ru/id781310320690_bot',
    '',
    'Какие данные может обрабатывать бот:',
    '• ID пользователя MAX и имя пользователя;',
    '• ID канала, название канала и технические данные подключённых каналов;',
    '• тексты постов, которые администратор пересылает боту;',
    '• настройки комментариев, подарков, кнопок, опросов, модерации и статистики;',
    '• комментарии, реакции и служебные события, нужные для работы функций;',
    '• debug-данные, если администратор сам открывает debug-раздел.',
    '',
    'Для чего используются данные:',
    '• подключение канала к АдминКИТ;',
    '• создание комментариев под постами;',
    '• выдача подарков и лид-магнитов;',
    '• настройка CTA-кнопок;',
    '• модерация и статистика;',
    '• диагностика ошибок и восстановление работы сервиса.',
    '',
    'АдминКИТ не продаёт пользовательские данные третьим лицам.',
    'Данные используются только для работы функций бота и технической поддержки.',
    '',
    'Командой /clear можно очистить активные меню и служебные сообщения бота в чате, если MAX разрешает их удалить.'
  ].join('\n');
}

function buildTermsText() {
  return [
    '📄 Пользовательское соглашение АдминКИТ',
    '',
    'АдминКИТ — инструмент для администрирования MAX-каналов.',
    '',
    'Используя бота, администратор подтверждает, что:',
    '• имеет право управлять подключаемым каналом;',
    '• сам отвечает за публикуемые посты, подарки, ссылки, кнопки и настройки;',
    '• не использует сервис для спама, мошенничества и незаконного контента;',
    '• понимает, что часть функций зависит от API MAX, прав бота в канале, сети и доступности mini-app.',
    '',
    'Основные команды:',
    '/menu — главное меню',
    '/channels — подключение канала',
    '/comments — комментарии',
    '/gifts — подарки',
    '/stats — статистика',
    '/privacy — политика конфиденциальности',
    '/clear — очистить меню бота'
  ].join('\n');
}

function buildNativeCommandInfoText(command = '') {
  const map = {
    '/highlight': [
      '⭐ Выделение постов',
      '',
      'Раздел запланирован как отдельный экран АдминКИТ.',
      'Здесь будет настройка визуального выделения важных постов в канале.',
      '',
      'Сейчас команда не открывает старое меню и не запускает legacy-сценарии.'
    ],
    '/polls': [
      '🗳️ Голосовалки / опросы',
      '',
      'Раздел запланирован как отдельный экран АдминКИТ.',
      'Здесь будут голосования и опросы под постами.',
      '',
      'Сейчас команда не открывает старое меню и не запускает legacy-сценарии.'
    ],
    '/archive': [
      '🗄️ Архив / восстановление',
      '',
      'Раздел запланирован как отдельный экран АдминКИТ.',
      'Здесь будет восстановление сохранённых сущностей: постов, кнопок, подарков и настроек.',
      '',
      'Сейчас команда не открывает старое меню и не запускает legacy-сценарии.'
    ],
    '/account': [
      '👤 Личный кабинет',
      '',
      'Раздел запланирован как отдельный экран АдминКИТ.',
      'Здесь будет тариф, подключённые каналы и доступные функции.',
      '',
      'Сейчас команда не открывает старое меню и не запускает legacy-сценарии.'
    ],
    '/debug': [
      '🧪 Debug / GitHub export',
      '',
      'Технический раздел для диагностики.',
      'Используйте debug только при проверке сборок и production checklist.',
      '',
      'Сейчас команда не открывает старое меню и не запускает legacy-сценарии.'
    ]
  };

  return (map[command] || ['АдминКИТ', '', 'Раздел пока готовится.']).join('\n');
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

function normalizeFailedCleanupCount(failedIds) {
  return Array.isArray(failedIds) ? failedIds.length : 0;
}

async function openFreshSection({
  config,
  message,
  userId,
  cleanupAdminWorkspaceOnMainMenu,
  sendSectionMenu,
  section,
  note = ''
}) {
  await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
  await sendSectionMenu({
    config,
    message,
    section,
    note,
    editCurrent: false
  });
  return true;
}

async function handleNativeSlashCommand({
  config,
  message,
  command,
  helpers
}) {
  const {
    getSenderUserId,
    replyToUser,
    cleanupAdminWorkspaceOnMainMenu,
    sendSectionMenu,
    sendChannelsSection,
    sendStatsMenuResponse
  } = helpers;

  const userId = getSenderUserId(message);

  if (command === '/menu') {
    return openFreshSection({
      config,
      message,
      userId,
      cleanupAdminWorkspaceOnMainMenu,
      sendSectionMenu,
      section: 'main',
      note: 'Главное меню открыто.'
    });
  }

  if (command === '/clear') {
    const failedIds = await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu, { includeUserMessages: true });
    const failedCount = normalizeFailedCleanupCount(failedIds);
    await sendSectionMenu({
      config,
      message,
      section: 'main',
      note: failedCount
        ? `Очистил доступные сообщения. ${failedCount} сообщений MAX не разрешил удалить. Открываю одно актуальное меню.`
        : 'Чат очищен от активных меню бота. Открываю одно актуальное меню.',
      editCurrent: false
    });
    return true;
  }

  if (command === '/channels') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendChannelsSection({
      config,
      message,
      note: 'Раздел подключения канала.',
      editCurrent: false
    });
    return true;
  }

  if (command === '/comments') {
    return openFreshSection({ config, message, userId, cleanupAdminWorkspaceOnMainMenu, sendSectionMenu, section: 'comments' });
  }

  if (command === '/gifts') {
    return openFreshSection({ config, message, userId, cleanupAdminWorkspaceOnMainMenu, sendSectionMenu, section: 'gifts' });
  }

  if (command === '/buttons') {
    return openFreshSection({ config, message, userId, cleanupAdminWorkspaceOnMainMenu, sendSectionMenu, section: 'buttons' });
  }

  if (command === '/posts') {
    return openFreshSection({ config, message, userId, cleanupAdminWorkspaceOnMainMenu, sendSectionMenu, section: 'posts' });
  }

  if (command === '/moderation') {
    return openFreshSection({ config, message, userId, cleanupAdminWorkspaceOnMainMenu, sendSectionMenu, section: 'moderation' });
  }

  if (command === '/stats') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendStatsMenuResponse({
      config,
      message,
      userId,
      mode: 'channel',
      editCurrent: false
    });
    return true;
  }

  if (command === '/help') {
    return openFreshSection({ config, message, userId, cleanupAdminWorkspaceOnMainMenu, sendSectionMenu, section: 'help' });
  }

  if (command === '/terms') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await replyToUser({
      config,
      message,
      text: buildTermsText()
    });
    return true;
  }

  if (command === '/privacy') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await replyToUser({
      config,
      message,
      text: buildPrivacyPolicyText()
    });
    return true;
  }

  if (['/highlight', '/polls', '/archive', '/account', '/debug'].includes(command)) {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await replyToUser({
      config,
      message,
      text: buildNativeCommandInfoText(command)
    });
    return true;
  }

  return false;
}

module.exports = {
  getNativeSlashCommand,
  handleNativeSlashCommand,
  buildPrivacyPolicyText,
  buildTermsText,
  buildNativeCommandInfoText
};
