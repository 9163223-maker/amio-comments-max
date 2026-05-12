'use strict';

const VERSION = 'V3-CLEAN-TREE-0.1';

const tree = {
  main: {
    route: 'main',
    title: '🐋 АдминКИТ',
    text: 'Панель управления MAX-каналом. Выберите раздел.',
    status: 'active',
    buttons: [
      ['channels', '📺 Каналы'],
      ['comments', '💬 Комментарии'],
      ['moderation', '🛡 Модерация'],
      ['editor', '✏️ Редактор'],
      ['buttons', '⚪ Кнопки'],
      ['gifts', '🎁 Подарки'],
      ['highlight', '📌 Выделение'],
      ['polls', '🗳 Опросы'],
      ['stats', '📊 Статистика'],
      ['tariffs', '🧾 Тарифы'],
      ['referrals', '🤝 Рефералы'],
      ['help', '❓ Помощь']
    ]
  },
  channels: {
    route: 'channels',
    parent: 'main',
    title: '📺 Каналы',
    text: 'Подключение канала, список каналов и проверка прав бота.',
    status: 'active',
    buttons: [
      ['channels.list', '📋 Мои каналы'],
      ['channels.connect', '➕ Подключить канал'],
      ['channels.active', '🔁 Активный канал'],
      ['channels.verify', '✅ Проверить права']
    ]
  },
  comments: {
    route: 'comments',
    parent: 'main',
    title: '💬 Комментарии',
    text: 'Управление обсуждениями под постами MAX.',
    status: 'active',
    buttons: [
      ['comments.autoNew', '⚡ Авто для новых'],
      ['comments.oldPost', '📌 Старый пост'],
      ['comments.choosePost', '📌 Выбрать пост'],
      ['comments.preview', '👀 Как это выглядит'],
      ['comments.settings', '⚙️ Настройки'],
      ['comments.photo', '📷 Фото'],
      ['comments.reactions', '❤️ Реакции и ответы']
    ]
  },
  moderation: {
    route: 'moderation',
    parent: 'main',
    title: '🛡 Модерация',
    text: 'Правила, стоп-слова, ссылки, инвайты и проверка комментариев.',
    status: 'active',
    buttons: [
      ['moderation.rules', '🛡 Правила канала'],
      ['moderation.words', '📋 Стоп-слова'],
      ['moderation.addWord', '➕ Добавить слово'],
      ['moderation.links', '🔗 Ссылки'],
      ['moderation.invites', '✉️ Инвайты'],
      ['moderation.ai', '🤖 AI-модерация'],
      ['moderation.logs', '📋 Журнал'],
      ['moderation.test', '🧪 Проверить комментарий']
    ]
  },
  editor: {
    route: 'editor',
    parent: 'main',
    title: '✏️ Редактор',
    text: 'Редактирование постов без потери комментариев, ссылок, медиа и кнопок.',
    status: 'active',
    buttons: [
      ['editor.choosePost', '📌 Выбрать пост'],
      ['editor.history', '🕘 История']
    ]
  },
  buttons: {
    route: 'buttons',
    parent: 'main',
    title: '⚪ Кнопки',
    text: 'CTA-кнопки под постами: добавить, посмотреть, удалить.',
    status: 'active',
    buttons: [
      ['buttons.choosePost', '📌 Выбрать пост'],
      ['buttons.create', '➕ Добавить кнопку'],
      ['buttons.list', '📋 Кнопки поста'],
      ['buttons.preview', '👀 Предпросмотр']
    ]
  },
  gifts: {
    route: 'gifts',
    parent: 'main',
    title: '🎁 Подарки',
    text: 'Подарки и лид-магниты за подписку.',
    status: 'active',
    buttons: [
      ['gifts.create', '🎁 Создать подарок'],
      ['gifts.choosePost', '📌 Выбрать пост'],
      ['gifts.list', '📋 Список подарков'],
      ['gifts.subscription', '🔐 Проверка подписки'],
      ['gifts.test', '🧪 Тестовая выдача']
    ]
  },
  highlight: {
    route: 'highlight',
    parent: 'main',
    title: '📌 Выделение',
    text: 'Выделение важных постов. Раздел в разработке.',
    status: 'development',
    buttons: [['highlight.choosePost', '📌 Выбрать пост'], ['highlight.preview', '👀 Предпросмотр']]
  },
  polls: {
    route: 'polls',
    parent: 'main',
    title: '🗳 Опросы',
    text: 'Голосования и опросы. Раздел в разработке.',
    status: 'development',
    buttons: [['polls.create', '➕ Создать'], ['polls.results', '📊 Результаты']]
  },
  stats: {
    route: 'stats',
    parent: 'main',
    title: '📊 Статистика',
    text: 'Статистика канала, постов, комментариев и вовлечения.',
    status: 'active',
    buttons: [
      ['stats.channel', '📊 Канал'],
      ['stats.post', '📌 Пост'],
      ['stats.comments', '💬 Комментарии'],
      ['stats.reactions', '❤️ Реакции'],
      ['stats.gifts', '🎁 Подарки'],
      ['stats.buttons', '🔘 Клики по кнопкам']
    ]
  },
  tariffs: {
    route: 'tariffs',
    parent: 'main',
    title: '🧾 Тарифы',
    text: 'Тарифы и ограничения. Раздел в разработке.',
    status: 'development',
    buttons: [['tariffs.current', '📋 Мой тариф'], ['tariffs.limits', '📺 Лимиты']]
  },
  referrals: {
    route: 'referrals',
    parent: 'main',
    title: '🤝 Рефералы',
    text: 'Реферальные ссылки и бонусы. Раздел в разработке.',
    status: 'development',
    buttons: [['referrals.link', '🔗 Моя ссылка'], ['referrals.stats', '📊 Статистика']]
  },
  help: {
    route: 'help',
    parent: 'main',
    title: '❓ Помощь',
    text: 'Краткая помощь по разделам АдминКИТ.',
    status: 'active',
    buttons: [['help.comments', '💬 Комментарии'], ['help.channels', '📺 Каналы'], ['help.gifts', '🎁 Подарки']]
  }
};

function getScreen(route = 'main') {
  return tree[route] || null;
}

function routes() {
  const result = new Set(Object.keys(tree));
  for (const screen of Object.values(tree)) {
    for (const [route] of screen.buttons || []) result.add(route);
  }
  return Array.from(result).sort();
}

module.exports = { VERSION, tree, getScreen, routes };
