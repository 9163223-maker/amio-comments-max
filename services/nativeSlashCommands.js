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

function withSlashMessageMode(message) {
  return { ...(message || {}), __fromCallback: true };
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
  const slashMessage = withSlashMessageMode(message);

  if (command === '/menu') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendSectionMenu({
      config,
      message: slashMessage,
      section: 'main',
      note: 'Главное меню открыто.',
      editCurrent: true
    });
    return true;
  }

  if (command === '/clear') {
    const failedIds = await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu, { includeUserMessages: true });
    await sendSectionMenu({
      config,
      message: slashMessage,
      section: 'main',
      note: failedIds.length
        ? `Очистил доступные сообщения. ${failedIds.length} сообщений MAX не разрешил удалить. Открываю одно актуальное меню.`
        : 'Чат очищен от активных меню бота. Открываю одно актуальное меню.',
      editCurrent: true
    });
    return true;
  }

  if (command === '/channels') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendChannelsSection({
      config,
      message: slashMessage,
      note: 'Раздел подключения канала.',
      editCurrent: true
    });
    return true;
  }

  if (command === '/comments') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendSectionMenu({ config, message: slashMessage, section: 'comments', editCurrent: true });
    return true;
  }

  if (command === '/gifts') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendSectionMenu({ config, message: slashMessage, section: 'gifts', editCurrent: true });
    return true;
  }

  if (command === '/buttons') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendSectionMenu({ config, message: slashMessage, section: 'buttons', editCurrent: true });
    return true;
  }

  if (command === '/posts') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendSectionMenu({ config, message: slashMessage, section: 'posts', editCurrent: true });
    return true;
  }

  if (command === '/moderation') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendSectionMenu({ config, message: slashMessage, section: 'moderation', editCurrent: true });
    return true;
  }

  if (command === '/stats') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendStatsMenuResponse({
      config,
      message: slashMessage,
      userId,
      mode: 'channel',
      editCurrent: true
    });
    return true;
  }

  if (command === '/help') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await sendSectionMenu({ config, message: slashMessage, section: 'help', editCurrent: true });
    return true;
  }

  if (command === '/terms') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await replyToUser({
      config,
      message: slashMessage,
      text: buildTermsText()
    });
    return true;
  }

  if (command === '/privacy') {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await replyToUser({
      config,
      message: slashMessage,
      text: buildPrivacyPolicyText()
    });
    return true;
  }

  if (['/highlight', '/polls', '/archive', '/account', '/debug'].includes(command)) {
    await cleanupBeforeSlash(config, userId, cleanupAdminWorkspaceOnMainMenu);
    await replyToUser({
      config,
      message: slashMessage,
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
