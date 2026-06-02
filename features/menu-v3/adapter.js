'use strict';

const canonical = require('./canonical-menu');

const VERSION = 'menu-v3-feature-adapter-pr105-canonical';
const SOURCE = 'adminkit-menu-v3-feature-adapter-pr105-canonical';

function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function ownerOf(route) { return normalize(route).split(':')[0] || 'main'; }
function button(text, route, data) { return { type: 'callback', text, payload: JSON.stringify({ ...(data || {}), route, action: route }) }; }
function actionButton(text, action, data) { return { type: 'callback', text, payload: JSON.stringify({ ...(data || {}), action }) }; }
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean).filter(row => row.length) } }]; }
function docNav() { return [[button('🏠 Главное меню', 'main:home')]]; }
function nav(owner) { return [[button('🏠 Главное меню', 'main:home'), button('↩️ Раздел', `${owner}:home`)]]; }
function postTitle(post, index) { const title = normalize(post && post.title) || `Пост ${index + 1}`; return `${index + 1}. ${title}`; }
function sectionTitle(owner) { return canonical.sectionById[owner]?.title || owner; }
function rowsOfTwo(items) { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2)); return rows; }
function buttonForAction(item) {
  const data = { ...(item.payload || {}), canonicalAction: item.id, section: item.section };
  return String(item.targetAction || '').includes(':') ? button(item.title, item.targetAction, data) : actionButton(item.title, item.existingAction || item.targetAction, data);
}
function visibleButtonTexts(screen) {
  const rows = screen?.attachments?.[0]?.payload?.buttons || [];
  return rows.flat().map((item) => normalize(item.text)).filter(Boolean);
}

function mainHome() {
  return {
    ok: true,
    route: 'main:home',
    owner: 'main',
    text: '🐋 АдминКИТ\n\nПанель управления MAX-каналом.\nВыберите раздел.',
    attachments: keyboard(canonical.clientSections.map((section) => [button(section.title, section.route)])),
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
    text: ['🔐 Политика конфиденциальности АдминКИТ', '', 'АдминКИТ — бот для управления MAX-каналами.', 'Бот: @id781310320690_bot', 'Адрес бота: https://max.ru/id781310320690_bot', '', 'Бот обрабатывает только данные, необходимые для работы функций: профиль MAX, подключённые каналы, посты, комментарии, кнопки, подарки, статистику и технические события.', '', 'Данные используются для подключения каналов, комментариев под постами, подарков, кнопок, статистики и работы сервиса.', '', 'АдминКИТ не передаёт данные для сторонней рекламы. Технические данные используются только для работы и поддержки сервиса.'].join('\n'),
    attachments: keyboard(docNav()),
  };
}

function sectionHome(owner) {
  const section = canonical.sectionById[owner];
  if (!section || !section.clientVisible || section.adminOnly) return mainHome();
  const actions = canonical.clientActions(section.id).map(buttonForAction);
  return { ok: true, route: section.route, owner: section.id, text: `${section.title}\n\nВыберите действие.`, attachments: keyboard([...rowsOfTwo(actions), ...nav(section.id)]) };
}

function choosePost(owner, context = {}) {
  const section = canonical.sectionById[owner] || { title: sectionTitle(owner) };
  const dataContext = context.dataContext || {};
  const posts = Array.isArray(dataContext.posts) ? dataContext.posts : [];
  if (dataContext.ok && posts.length) {
    const rows = posts.map((post, index) => [button(postTitle(post, index), `${owner}:post`, { owner, postId: normalize(post.postId), commentKey: normalize(post.commentKey), channelId: normalize(dataContext.channelId), channelTitle: normalize(dataContext.channelTitle), postTitle: normalize(post.title) })]);
    return { ok: true, route: `${owner}:choose_post`, owner, dataBound: true, text: `${section.title} → выбор поста\n\n📺 ${normalize(dataContext.channelTitle) || 'Канал'}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments: keyboard([...rows, ...nav(owner)]) };
  }
  return { ok: true, route: `${owner}:choose_post`, owner, needsData: 'posts', text: `${section.title} → выбор поста\n\nПосты пока не переданы в экран. Вернитесь в раздел и используйте нужное действие.`, attachments: keyboard(nav(owner)) };
}

function postScreen(owner, context = {}) {
  const payload = context.payload || context.post || {};
  const title = normalize(payload.postTitle) || normalize(payload.title) || 'выбранный пост';
  const rowsByOwner = {
    comments: [[button('✅/⏸ Комментарии', 'comments:toggle', payload)], [actionButton('📌 К списку', 'comments_select_post', { source: 'comments' })]],
    editor: [[actionButton('✏️ Изменить текст', 'admin_posts_edit_text', payload)], [actionButton('📌 К списку', 'admin_posts_picker')]],
    buttons: [[actionButton('➕ Добавить кнопку', 'button_admin_start_add', payload), actionButton('📋 Текущие кнопки', 'button_admin_show_current', payload)], [actionButton('📌 К списку', 'button_admin_recent_posts', { page: 0 })]],
    gifts: [[actionButton('🎁 Создать подарок', 'gift_admin_start_create', payload), actionButton('📋 Список подарков', 'gift_admin_show_current', payload)], [actionButton('📌 К списку', 'gift_admin_recent_posts', { page: 0 })]],
    highlights: [[actionButton('⭐ Поставить выделение', 'highlight_apply', payload), actionButton('↩️ Снять выделение', 'highlight_remove', payload)], [actionButton('📌 К списку', 'comments_select_post', { source: 'highlights' })]],
    polls: [[actionButton('➕ Создать опрос', 'poll_create', payload), actionButton('📊 Результаты опросов', 'poll_status', payload)], [actionButton('📌 К списку', 'comments_select_post', { source: 'polls' })]],
    stats: [[actionButton('📊 Статистика поста', 'admin_stats_post', payload)], [actionButton('🏠 Главное меню', 'admin_section_main')]],
  };
  return { ok: true, route: `${owner}:post`, owner, text: `${sectionTitle(owner)} → пост\n\n📝 ${title}\n\nВыберите действие.`, attachments: keyboard([...(rowsByOwner[owner] || []), ...nav(owner)]) };
}

function safeError(route, error) {
  const owner = ownerOf(route);
  return { ok: false, route, owner, text: `⚠️ Не удалось открыть экран.\n\nРаздел: ${sectionTitle(owner)}\nОшибка записана в журнал диагностики.`, error: error && error.message ? error.message : String(error || 'unknown_error'), attachments: keyboard(docNav()) };
}

function normalizeRoute(route) {
  const safeRoute = normalize(route || 'main:home');
  return canonical.resolveSectionByRoute(safeRoute)?.route || safeRoute;
}

function render(route, context = {}) {
  try {
    const safeRoute = normalizeRoute(route || 'main:home');
    if (safeRoute === 'main:home' || safeRoute === 'start' || safeRoute === '/start') return mainHome();
    if (safeRoute === 'terms:home' || safeRoute === '/terms') return termsHome();
    if (safeRoute === 'privacy:home' || safeRoute === '/privacy') return privacyHome();
    const section = canonical.resolveSectionByRoute(safeRoute);
    const owner = section ? section.id : ownerOf(safeRoute);
    if (safeRoute.endsWith(':home')) return sectionHome(owner);
    if (safeRoute.endsWith(':choose_post')) return choosePost(owner, context);
    if (safeRoute.endsWith(':post')) return postScreen(owner, context);
    return sectionHome(owner);
  } catch (error) { return safeError(route, error); }
}

function selfTest() {
  const validation = canonical.validate();
  const routes = ['main:home', ...canonical.clientSections.map((section) => section.route), 'comments:choose_post', 'editor:choose_post', 'gifts:choose_post', 'highlights:choose_post', 'polls:choose_post', 'terms:home', 'privacy:home'];
  const sampleContext = { dataContext: { ok: true, channelId: 'test-channel', channelTitle: 'Тестовый канал', posts: [{ postId: '1', commentKey: 'test-channel:1', title: 'Тестовый пост' }] } };
  const results = routes.map(route => render(route, route.endsWith(':choose_post') ? sampleContext : {}));
  const screensOk = results.every(result => result && result.text && Array.isArray(result.attachments));
  const mainLabels = visibleButtonTexts(mainHome());
  const rootLabels = canonical.clientSections.flatMap((section) => visibleButtonTexts(sectionHome(section.id)));
  const labelText = [...mainLabels, ...rootLabels].join('\n');
  const banned = [/\bCTA\b/i, /Debug/i, /trace/i, /GitHub export/i, /production checklist/i, /postId/i, /channelId/i, /commentKey/i, /token/i, /payload/i, /видео/i, /файл/i];
  const bannedHits = banned.filter((pattern) => pattern.test(labelText)).map(String);
  return { ok: validation.ok && screensOk && canonical.clientSections.length === 12 && bannedHits.length === 0, version: VERSION, sourceMarker: SOURCE, canonicalVersion: canonical.VERSION, safeCoreFreeze: true, touchesBoot: false, patchesExpress: false, patchesModuleLoad: false, patchesAppPost: false, touchesDebugStore: false, touchesDebugPing: false, clientSections: canonical.clientSections.length, routesChecked: routes.length, validation, bannedHits, failures: results.filter(result => !result || !result.text).map(result => result && result.route) };
}

module.exports = { VERSION, SOURCE, render, selfTest, mainHome, sectionHome };
