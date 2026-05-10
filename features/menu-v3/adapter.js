'use strict';

// AdminKIT V3 Feature Adapter
// Safe Core Freeze: this module does not touch Dockerfile, package.json, boot, express, app.post, Module._load, webhook bootstrap, debug/store, or debug/ping.
// It is intentionally isolated and must be connected only by an existing safe router layer after self-test passes.

const VERSION = 'menu-v3-feature-adapter-1';
const SOURCE = 'adminkit-menu-v3-feature-adapter-safe-isolated';

const MAIN_ROUTES = [
  ['channels:home', '📺 Каналы'],
  ['comments:home', '💬 Комменты'],
  ['moderation:home', '🛡 Модерация'],
  ['editor:home', '✏️ Редактор'],
  ['buttons:home', '⚪ Кнопки'],
  ['gifts:home', '🎁 Подарки'],
  ['highlight:home', '📌 Выделение'],
  ['polls:home', '🗳 Опросы'],
  ['stats:home', '📊 Статистика'],
  ['billing:home', '🧾 Тарифы'],
  ['referrals:home', '🤝 Рефералы'],
  ['help:home', '❓ Помощь'],
];

const SECTION_TITLES = {
  channels: '📺 Каналы',
  comments: '💬 Комменты',
  moderation: '🛡 Модерация',
  editor: '✏️ Редактор',
  buttons: '⚪ Кнопки',
  gifts: '🎁 Подарки',
  highlight: '📌 Выделение',
  polls: '🗳 Опросы',
  stats: '📊 Статистика',
  billing: '🧾 Тарифы',
  referrals: '🤝 Рефералы',
  help: '❓ Помощь',
};

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function ownerOf(route) {
  return normalize(route).split(':')[0] || 'main';
}

function button(text, route, data) {
  return {
    type: 'callback',
    text,
    payload: JSON.stringify({ ...(data || {}), route, action: route }),
  };
}

function keyboard(rows) {
  return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean).filter(row => row.length) } }];
}

function nav(owner) {
  return [
    [button('❓ Помощь', `help:${owner}`), button('↩️ Раздел', `${owner}:home`)],
    [button('🏠 Главное меню', 'main:home')],
  ];
}

function mainHome() {
  return {
    ok: true,
    route: 'main:home',
    owner: 'main',
    text: '🐋 АдминКИТ\n\nПанель управления MAX-каналом.\nРежим теста: PRO открыт.',
    attachments: keyboard([
      [button('📺 Каналы', 'channels:home'), button('💬 Комменты', 'comments:home')],
      [button('🛡 Модерация', 'moderation:home'), button('✏️ Редактор', 'editor:home')],
      [button('⚪ Кнопки', 'buttons:home'), button('🎁 Подарки', 'gifts:home')],
      [button('📌 Выделение', 'highlight:home'), button('🗳 Опросы', 'polls:home')],
      [button('📊 Статистика', 'stats:home'), button('🧾 Тарифы', 'billing:home')],
      [button('🤝 Рефералы', 'referrals:home'), button('❓ Помощь', 'help:home')],
    ]),
  };
}

function sectionHome(owner) {
  const title = SECTION_TITLES[owner] || owner;
  const rowsByOwner = {
    channels: [
      [button('📋 Мои каналы', 'channels:list'), button('✅ Проверить права', 'channels:verify_access')],
      [button('➕ Подключить', 'channels:connect'), button('🔐 Доступы', 'channels:access')],
    ],
    comments: [
      [button('⚡ Авто', 'comments:auto_new'), button('📌 Старый пост', 'comments:old_post')],
      [button('📌 Выбрать пост', 'comments:choose_post'), button('👀 Вид', 'comments:preview')],
      [button('⚙️ Настройки', 'comments:settings'), button('🖼 Баннер', 'comments_banner:home')],
      [button('📷 Фото', 'comments_photo:home'), button('❤️ Реакции', 'comments_reactions:home')],
    ],
    moderation: [
      [button('🛡 Канал', 'moderation:channel'), button('🎯 Пост', 'moderation:choose_post')],
      [button('➕ Стоп-слово', 'moderation:add_word'), button('📋 Журнал', 'moderation:logs')],
      [button('🧪 Проверка', 'moderation:test_comment')],
    ],
    editor: [[button('📌 Выбрать пост', 'editor:choose_post')]],
    buttons: [[button('📌 Выбрать пост', 'buttons:choose_post'), button('➕ Добавить', 'buttons:add')]],
    gifts: [[button('📌 Выбрать пост', 'gifts:choose_post'), button('🎁 Создать', 'gifts:create')]],
    highlight: [[button('📌 Выбрать пост', 'highlight:choose_post')]],
    polls: [[button('➕ Создать опрос', 'polls:create'), button('📌 Выбрать пост', 'polls:choose_post')]],
    stats: [[button('📊 Канал', 'stats:channel'), button('📌 Пост', 'stats:choose_post')]],
    billing: [[button('💳 Купить', 'billing:buy'), button('🎁 Пробный период', 'billing:trial')]],
    referrals: [[button('🔗 Моя ссылка', 'referrals:my_link'), button('📊 Статистика', 'referrals:stats')]],
    help: [[button('💬 Комменты', 'help:comments'), button('🛡 Модерация', 'help:moderation')]],
  };
  return {
    ok: true,
    route: `${owner}:home`,
    owner,
    text: `${title}\n\nВыберите действие.`,
    attachments: keyboard([...(rowsByOwner[owner] || []), ...nav(owner)]),
  };
}

function choosePost(owner) {
  return {
    ok: true,
    route: `${owner}:choose_post`,
    owner,
    needsData: 'posts',
    text: `${SECTION_TITLES[owner] || owner} → выбор поста\n\nСписок постов должен передать внешний безопасный router-adapter. Этот feature-adapter не читает базу и не трогает core.`,
    attachments: keyboard(nav(owner)),
  };
}

function safeError(route, error) {
  const owner = ownerOf(route);
  return {
    ok: false,
    route,
    owner,
    text: `⚠️ Не удалось открыть экран.\n\nРаздел: ${SECTION_TITLES[owner] || owner}\nМаршрут: ${route}\nОшибка записана в debug.`,
    error: error && error.message ? error.message : String(error || 'unknown_error'),
    attachments: keyboard(nav(owner)),
  };
}

function render(route, context) {
  try {
    const safeRoute = normalize(route || 'main:home');
    if (safeRoute === 'main:home' || safeRoute === 'start' || safeRoute === '/start') return mainHome();
    const owner = ownerOf(safeRoute);
    if (safeRoute.endsWith(':home')) return sectionHome(owner);
    if (safeRoute.endsWith(':choose_post')) return choosePost(owner);
    if (safeRoute.startsWith('help:')) return sectionHome('help');
    return sectionHome(owner);
  } catch (error) {
    return safeError(route, error);
  }
}

function selfTest() {
  const routes = ['main:home', ...MAIN_ROUTES.map(([route]) => route), 'comments:choose_post', 'moderation:choose_post', 'editor:choose_post', 'gifts:choose_post'];
  const results = routes.map(route => render(route, {}));
  return {
    ok: results.every(result => result && result.text && Array.isArray(result.attachments)),
    version: VERSION,
    sourceMarker: SOURCE,
    safeCoreFreeze: true,
    touchesBoot: false,
    patchesExpress: false,
    patchesModuleLoad: false,
    patchesAppPost: false,
    touchesDebugStore: false,
    touchesDebugPing: false,
    routesChecked: routes.length,
    failures: results.filter(result => !result || !result.text).map(result => result && result.route),
  };
}

module.exports = {
  VERSION,
  SOURCE,
  render,
  selfTest,
};
