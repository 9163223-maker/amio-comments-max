'use strict';

const VERSION = 'menu-v3-feature-adapter-6-ads-top-level';
const SOURCE = 'adminkit-menu-v3-feature-adapter-ads-top-level';

const MAIN_ROUTES = [
  ['channels:home', '📺 Каналы'],
  ['comments:home', '💬 Комментарии'],
  ['gifts:home', '🎁 Подарки'],
  ['buttons:home', '⚪ Кнопки'],
  ['ads:home', '📣 Реклама'],
  ['highlight:home', '⭐ Выделение'],
  ['polls:home', '🗳 Опросы'],
  ['editor:home', '✏️ Редактор'],
  ['archive:home', '🗄 Архив'],
  ['moderation:home', '🛡 Модерация'],
  ['stats:home', '📊 Статистика'],
  ['account:home', '👤 Личный кабинет'],
  ['debug:home', '🧪 Debug'],
  ['help:home', '❓ Помощь'],
];

const SECTION_TITLES = {
  channels: '📺 Подключение канала',
  comments: '💬 Комментарии под постами',
  gifts: '🎁 Подарки / лид-магниты',
  buttons: '⚪ CTA / пользовательские кнопки',
  ads: '📣 Реклама / источники',
  highlight: '⭐ Выделение постов',
  polls: '🗳 Голосовалки / опросы',
  editor: '✏️ Редактирование постов',
  archive: '🗄 Архив / восстановление',
  moderation: '🛡 Модерация',
  stats: '📊 Статистика',
  account: '👤 Личный кабинет',
  debug: '🧪 Debug / GitHub export',
  help: '❓ Помощь',
  terms: '📄 Пользовательское соглашение',
  privacy: '🔐 Политика конфиденциальности',
};

function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function ownerOf(route) { return normalize(route).split(':')[0] || 'main'; }

function button(text, route, data) {
  return { type: 'callback', text, payload: JSON.stringify({ ...(data || {}), route, action: route }) };
}

function actionButton(text, action, data) {
  return { type: 'callback', text, payload: JSON.stringify({ ...(data || {}), action }) };
}

function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean).filter(row => row.length) } }]; }
function nav(owner) { return [[button('❓ Помощь', `help:${owner}`), button('↩️ Раздел', `${owner}:home`)], [button('🏠 Главное меню', 'main:home')]]; }
function docNav() { return [[button('🏠 Главное меню', 'main:home')]]; }
function postTitle(post, index) { const title = normalize(post && post.title) || normalize(post && post.postId) || `Пост ${index + 1}`; return `${index + 1}. ${title}`; }

function mainHome() {
  return {
    ok: true,
    route: 'main:home',
    owner: 'main',
    text: '🐋 АдминКИТ\n\nПанель управления MAX-каналом.\nВыберите раздел.',
    attachments: keyboard([
      [button('📺 Подключение канала', 'channels:home')],
      [button('💬 Комментарии под постами', 'comments:home')],
      [button('🎁 Подарки / лид-магниты', 'gifts:home')],
      [button('⚪ CTA / пользовательские кнопки', 'buttons:home')],
      [button('📣 Реклама / источники', 'ads:home')],
      [button('⭐ Выделение постов', 'highlight:home')],
      [button('🗳 Голосовалки / опросы', 'polls:home')],
      [button('✏️ Редактирование постов', 'editor:home')],
      [button('🗄 Архив / восстановление', 'archive:home')],
      [button('🛡 Модерация', 'moderation:home')],
      [button('📊 Статистика', 'stats:home')],
      [button('👤 Личный кабинет', 'account:home')],
      [button('🧪 Debug / GitHub export', 'debug:home')],
      [button('❓ Помощь', 'help:home')],
    ]),
  };
}

function termsHome() {
  return {
    ok: true,
    route: 'terms:home',
    owner: 'terms',
    text: ['📄 Пользовательское соглашение АдминКИТ', '', 'АдминКИТ — инструмент для администрирования MAX-каналов.', '', 'Используя бота, администратор подтверждает право управлять подключаемым каналом и отвечает за публикуемые посты, ссылки, кнопки, подарки и настройки.', '', 'Часть функций зависит от возможностей MAX API, прав бота в канале, сети и доступности mini-app.', '', 'Основные команды: /menu, /channels, /comments, /gifts, /stats, /privacy, /clear.'].join('\n'),
    attachments: keyboard(docNav()),
  };
}

function privacyHome() {
  return {
    ok: true,
    route: 'privacy:home',
    owner: 'privacy',
    text: ['🔐 Политика конфиденциальности АдминКИТ', '', 'АдминКИТ — бот для управления MAX-каналами.', 'Бот: @id781310320690_bot', 'Адрес бота: https://max.ru/id781310320690_bot', '', 'Бот обрабатывает только данные, необходимые для работы функций: профиль MAX, подключённые каналы, посты, комментарии, кнопки, подарки, статистику и технические события.', '', 'Данные используются для подключения каналов, комментариев под постами, подарков, кнопок, модерации, статистики и диагностики работы сервиса.', '', 'АдминКИТ не передаёт данные для сторонней рекламы. Технические данные используются только для работы и поддержки сервиса.'].join('\n'),
    attachments: keyboard(docNav()),
  };
}

function sectionHome(owner) {
  const title = SECTION_TITLES[owner] || owner;
  const rowsByOwner = {
    channels: [
      [actionButton('📋 Мои каналы', 'admin_section_channels'), actionButton('✅ Проверить права', 'admin_section_channels')],
      [actionButton('➕ Подключить', 'admin_section_channels'), actionButton('🔐 Доступы', 'admin_section_channels')],
    ],
    comments: [
      [actionButton('📌 Выбрать пост', 'comments_select_post', { source: 'comments' }), button('👀 Как выглядит', 'comments:preview')],
      [button('📷 Фото', 'comments_photo:home'), button('❤️ Реакции', 'comments_reactions:home')],
    ],
    gifts: [
      [actionButton('📌 Выбрать пост', 'gift_admin_recent_posts', { page: 0 }), actionButton('🎁 Создать подарок', 'gift_admin_start_create')],
      [actionButton('🧾 Текущий подарок', 'gift_admin_show_current')],
    ],
    buttons: [
      [actionButton('📌 Выбрать пост', 'button_admin_recent_posts', { page: 0 }), actionButton('➕ Добавить кнопку', 'button_admin_start_add')],
      [actionButton('📋 Кнопки поста', 'button_admin_show_current')],
    ],
    ads: [
      [actionButton('➕ Создать ссылку', 'admin_stats_campaign_create'), actionButton('🔗 Все ссылки', 'admin_stats_campaigns')],
      [actionButton('🧭 Источники', 'admin_stats_sources_cache'), actionButton('🔄 Обновить', 'admin_stats_refresh')],
    ],
    highlight: [
      [actionButton('📌 Выбрать пост', 'comments_select_post', { source: 'highlights' })],
      [button('⭐ Включить выделение', 'highlight:enable'), button('🗑 Убрать выделение', 'highlight:disable')],
    ],
    polls: [
      [actionButton('📌 Выбрать пост', 'comments_select_post', { source: 'polls' }), actionButton('📊 Результаты', 'poll_status')],
      [actionButton('➕ Создать опрос', 'comments_select_post', { source: 'polls' })],
    ],
    editor: [
      [actionButton('📌 Выбрать пост', 'admin_posts_picker')],
      [actionButton('📋 История редактора', 'admin_posts_history')],
    ],
    archive: [
      [actionButton('📦 Архив постов', 'archive_list', { offset: 0 }), actionButton('🔄 Статус архива', 'archive_status')],
      [actionButton('📏 Лимиты архива', 'archive_limits')],
    ],
    moderation: [
      [actionButton('🎯 Выбрать пост', 'comments_select_post', { source: 'moderation' }), actionButton('🛡 Раздел модерации', 'admin_section_moderation')],
    ],
    stats: [
      [actionButton('📊 Обзор', 'admin_section_stats'), actionButton('📌 Пост', 'admin_stats_post')],
      [actionButton('👥 Подписчики', 'admin_stats_subscribers_day'), actionButton('🔄 Обновить', 'admin_stats_refresh')],
    ],
    account: [
      [actionButton('👤 Профиль', 'admin_section_tariffs'), actionButton('💳 Тариф', 'billing_current_plan')],
      [actionButton('📏 Лимиты', 'billing_limits'), actionButton('🤝 Рефералы', 'billing_referral')],
    ],
    debug: [
      [actionButton('🧪 Debug status', 'admin_section_debug'), actionButton('✅ Production checklist', 'admin_section_production_checklist')],
      [button('🧹 Clear walkthrough trace', 'debug:clear_timing')],
    ],
    help: [
      [button('💬 Комментарии', 'help:comments'), button('🛡 Модерация', 'help:moderation')],
      [button('🎁 Подарки', 'help:gifts'), button('📣 Реклама', 'ads:home')],
      [button('📊 Статистика', 'help:stats')],
    ],
  };
  return { ok: true, route: `${owner}:home`, owner, text: `${title}\n\nВыберите действие.`, attachments: keyboard([...(rowsByOwner[owner] || []), ...nav(owner)]) };
}

function choosePost(owner, context = {}) {
  const dataContext = context.dataContext || {};
  const posts = Array.isArray(dataContext.posts) ? dataContext.posts : [];
  if (dataContext.ok && posts.length) {
    const rows = posts.map((post, index) => [button(postTitle(post, index), `${owner}:post`, { owner, postId: normalize(post.postId), commentKey: normalize(post.commentKey), channelId: normalize(dataContext.channelId), channelTitle: normalize(dataContext.channelTitle), postTitle: normalize(post.title) })]);
    return { ok: true, route: `${owner}:choose_post`, owner, dataBound: true, text: `${SECTION_TITLES[owner] || owner} → выбор поста\n\n📺 ${normalize(dataContext.channelTitle) || 'Канал'}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments: keyboard([...rows, ...nav(owner)]) };
  }
  return { ok: true, route: `${owner}:choose_post`, owner, needsData: 'posts', text: `${SECTION_TITLES[owner] || owner} → выбор поста\n\nПосты пока не переданы в экран. Нажмите «Раздел» и используйте функциональную кнопку выбора поста.`, attachments: keyboard(nav(owner)) };
}

function postScreen(owner, context = {}) {
  const payload = context.payload || context.post || {};
  const title = normalize(payload.postTitle) || normalize(payload.title) || normalize(payload.postId) || 'выбранный пост';
  const rowsByOwner = {
    comments: [[button('✅/⏸ Комменты', 'comments:toggle', payload)], [actionButton('📌 К списку', 'comments_select_post', { source: 'comments' })]],
    moderation: [[actionButton('🛡 Правила поста', 'admin_section_moderation')], [actionButton('📌 К списку', 'comments_select_post', { source: 'moderation' })]],
    editor: [[actionButton('✏️ Редактировать', 'admin_posts_edit_text', payload)], [actionButton('📌 К списку', 'admin_posts_picker')]],
    buttons: [[actionButton('➕ Добавить кнопку', 'button_admin_start_add', payload), actionButton('📋 Кнопки поста', 'button_admin_show_current', payload)], [actionButton('📌 К списку', 'button_admin_recent_posts', { page: 0 })]],
    gifts: [[actionButton('🎁 Создать подарок', 'gift_admin_start_create', payload), actionButton('🧾 Текущий подарок', 'gift_admin_show_current', payload)], [actionButton('📌 К списку', 'gift_admin_recent_posts', { page: 0 })]],
    highlight: [[button('⭐ Включить', 'highlight:enable', payload)], [actionButton('📌 К списку', 'comments_select_post', { source: 'highlights' })]],
    polls: [[actionButton('➕ Создать опрос', 'poll_create', payload), actionButton('📊 Результаты', 'poll_status', payload)], [actionButton('📌 К списку', 'comments_select_post', { source: 'polls' })]],
    stats: [[actionButton('📊 Статистика поста', 'admin_stats_post', payload)], [actionButton('📌 К списку', 'admin_stats_post')]],
  };
  return { ok: true, route: `${owner}:post`, owner, text: `${SECTION_TITLES[owner] || owner} → пост\n\n📝 ${title}\n\nВыберите действие.`, attachments: keyboard([...(rowsByOwner[owner] || []), ...nav(owner)]) };
}

function safeError(route, error) {
  const owner = ownerOf(route);
  return { ok: false, route, owner, text: `⚠️ Не удалось открыть экран.\n\nРаздел: ${SECTION_TITLES[owner] || owner}\nМаршрут: ${route}\nОшибка записана в debug.`, error: error && error.message ? error.message : String(error || 'unknown_error'), attachments: keyboard(nav(owner)) };
}

function render(route, context = {}) {
  try {
    const safeRoute = normalize(route || 'main:home');
    if (safeRoute === 'main:home' || safeRoute === 'start' || safeRoute === '/start') return mainHome();
    if (safeRoute === 'terms:home' || safeRoute === '/terms') return termsHome();
    if (safeRoute === 'privacy:home' || safeRoute === '/privacy') return privacyHome();
    const owner = ownerOf(safeRoute);
    if (safeRoute.endsWith(':home')) return sectionHome(owner);
    if (safeRoute.endsWith(':choose_post')) return choosePost(owner, context);
    if (safeRoute.endsWith(':post')) return postScreen(owner, context);
    if (safeRoute.startsWith('help:')) return sectionHome('help');
    return sectionHome(owner);
  } catch (error) { return safeError(route, error); }
}

function selfTest() {
  const routes = ['main:home', ...MAIN_ROUTES.map(([route]) => route), 'comments:choose_post', 'moderation:choose_post', 'editor:choose_post', 'gifts:choose_post', 'highlight:choose_post', 'polls:choose_post', 'ads:home', 'terms:home', 'privacy:home'];
  const sampleContext = { dataContext: { ok: true, channelId: 'test-channel', channelTitle: 'Тестовый канал', posts: [{ postId: '1', commentKey: 'test-channel:1', title: 'Тестовый пост' }] } };
  const results = routes.map(route => render(route, route.endsWith(':choose_post') ? sampleContext : {}));
  return { ok: results.every(result => result && result.text && Array.isArray(result.attachments)), version: VERSION, sourceMarker: SOURCE, safeCoreFreeze: true, touchesBoot: false, patchesExpress: false, patchesModuleLoad: false, patchesAppPost: false, touchesDebugStore: false, touchesDebugPing: false, routesChecked: routes.length, failures: results.filter(result => !result || !result.text).map(result => result && result.route) };
}

module.exports = { VERSION, SOURCE, render, selfTest };
