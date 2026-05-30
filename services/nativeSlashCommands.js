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
      'Раздел предназначен для выделения важных постов в канале.',
      'Функция находится в дорожной карте АдминКИТ и будет подключаться через главное меню.'
    ],
    '/polls': [
      '🗳️ Голосовалки / опросы',
      '',
      'Раздел для голосований и опросов под постами.',
      'Функция находится в дорожной карте АдминКИТ.'
    ],
    '/archive': [
      '🗄️ Архив / восстановление',
      '',
      'Раздел для восстановления и обслуживания сохранённых сущностей: постов, кнопок, подарков и настроек.',
      'Пока используйте основное меню и Debug-раздел.'
    ],
    '/account': [
      '👤 Личный кабинет',
      '',
      'Здесь будет информация о тарифе, подключённых каналах и доступных функциях.',
      'Пока управление идёт через главное меню.'
    ],
    '/debug': [
      '🧪 Debug / GitHub export',
      '',
      'Технический раздел для диагностики.',
      'Используйте его только при проверке сборок, debug и production checklist.'
    ]
  };

  return (map[command] || ['АдминКИТ', '', 'Раздел пока готовится.']).join('\n');
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
    buildAdminMainMenuAttachments,
    cleanupAdminWorkspaceOnMainMenu,
    sendSectionMenu,
    sendChannelsSection,
    sendStatsMenuResponse
  } = helpers;

  const userId = getSenderUserId(message);

  if (command === '/menu') {
    await cleanupAdminWorkspaceOnMainMenu(config, userId, { includeUserMessages: false });
    await sendSectionMenu({
      config,
      message,
      section: 'main',
      note: 'Главное меню открыто.'
    });
    return true;
  }

  if (command === '/clear') {
    const failedIds = await cleanupAdminWorkspaceOnMainMenu(config, userId, { includeUserMessages: true });
    await sendSectionMenu({
      config,
      message,
      section: 'main',
      note: failedIds.length
        ? `Очистил доступные сообщения. ${failedIds.length} сообщений MAX не разрешил удалить.`
        : 'Чат очищен от активных меню бота. Открываю главное меню.'
    });
    return true;
  }

  if (command === '/channels') {
    await sendChannelsSection({
      config,
      message,
      note: 'Раздел подключения канала.'
    });
    return true;
  }

  if (command === '/comments') {
    await sendSectionMenu({ config, message, section: 'comments' });
    return true;
  }

  if (command === '/gifts') {
    await sendSectionMenu({ config, message, section: 'gifts' });
    return true;
  }

  if (command === '/buttons') {
    await sendSectionMenu({ config, message, section: 'buttons' });
    return true;
  }

  if (command === '/posts') {
    await sendSectionMenu({ config, message, section: 'posts' });
    return true;
  }

  if (command === '/moderation') {
    await sendSectionMenu({ config, message, section: 'moderation' });
    return true;
  }

  if (command === '/stats') {
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
    await sendSectionMenu({ config, message, section: 'help' });
    return true;
  }

  if (command === '/terms') {
    await replyToUser({
      config,
      message,
      text: buildTermsText(),
      attachments: await buildAdminMainMenuAttachments(config)
    });
    return true;
  }

  if (command === '/privacy') {
    await replyToUser({
      config,
      message,
      text: buildPrivacyPolicyText(),
      attachments: await buildAdminMainMenuAttachments(config)
    });
    return true;
  }

  if (['/highlight', '/polls', '/archive', '/account', '/debug'].includes(command)) {
    await replyToUser({
      config,
      message,
      text: buildNativeCommandInfoText(command),
      attachments: await buildAdminMainMenuAttachments(config)
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
