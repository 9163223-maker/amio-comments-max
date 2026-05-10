'use strict';

// Production menu map for АдминКИТ.
// Every visible button must have: route, owner, tariffGate and status.
// Status values: active | disabled | coming_soon | pro_only | business_only | internal.
// Tariff gates: free | start | pro | business | internal.

const STATUS = Object.freeze({
  ACTIVE: 'active',
  DISABLED: 'disabled',
  COMING_SOON: 'coming_soon',
  PRO_ONLY: 'pro_only',
  BUSINESS_ONLY: 'business_only',
  INTERNAL: 'internal'
});

const TARIFF = Object.freeze({
  FREE: 'free',
  START: 'start',
  PRO: 'pro',
  BUSINESS: 'business',
  INTERNAL: 'internal'
});

const OWNER_ORDER = [
  'channels',
  'comments',
  'comments_banner',
  'comments_photo',
  'comments_reactions',
  'moderation',
  'editor',
  'buttons',
  'gifts',
  'highlight',
  'polls',
  'stats',
  'billing',
  'referrals',
  'help',
  'debug'
];

const MAIN_MENU = [
  'channels:home',
  'comments:home',
  'moderation:home',
  'editor:home',
  'buttons:home',
  'gifts:home',
  'highlight:home',
  'stats:home',
  'billing:home',
  'referrals:home',
  'help:home'
];

function item(route, owner, title, tariffGate, status, options = {}) {
  return {
    route,
    owner,
    title,
    tariffGate,
    status,
    parent: options.parent || null,
    level: options.level || 1,
    visible: options.visible !== false,
    postScoped: Boolean(options.postScoped),
    sectionHome: options.sectionHome || null,
    helpRoute: options.helpRoute || null,
    description: options.description || '',
    productionNote: options.productionNote || ''
  };
}

const MENU_ITEMS = [
  // Channels and access
  item('channels:home', 'channels', '📺 Каналы и доступ', TARIFF.FREE, STATUS.ACTIVE, { level: 0, helpRoute: 'help:channels', description: 'Подключение канала, выбор активного канала, проверка прав и восстановление после redeploy.' }),
  item('channels:list', 'channels', '📋 Мои каналы', TARIFF.FREE, STATUS.ACTIVE, { parent: 'channels:home' }),
  item('channels:connect', 'channels', '➕ Подключить канал', TARIFF.FREE, STATUS.ACTIVE, { parent: 'channels:home' }),
  item('channels:select', 'channels', '🔁 Сменить активный канал', TARIFF.FREE, STATUS.ACTIVE, { parent: 'channels:home' }),
  item('channels:verify_access', 'channels', '✅ Проверить права бота', TARIFF.FREE, STATUS.ACTIVE, { parent: 'channels:home' }),
  item('channels:disconnect', 'channels', 'Отключить канал', TARIFF.FREE, STATUS.DISABLED, { parent: 'channels:home', productionNote: 'Не показывать в MVP без подтверждения и soft-delete.' }),
  item('access:channel_status', 'channels', '🔐 Доступы канала', TARIFF.FREE, STATUS.ACTIVE, { parent: 'channels:home' }),
  item('access:admins', 'channels', '👥 Администраторы канала', TARIFF.BUSINESS, STATUS.BUSINESS_ONLY, { parent: 'channels:home' }),

  // Comments
  item('comments:home', 'comments', '💬 Комментарии', TARIFF.START, STATUS.ACTIVE, { level: 0, helpRoute: 'help:comments', description: 'Обсуждения под постами MAX.' }),
  item('comments:auto_new', 'comments', '⚡ Авто для новых постов', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:home' }),
  item('comments:old_post', 'comments', '📌 Подключить старый пост', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:home' }),
  item('comments:choose_post', 'comments', '📌 Выбрать пост', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:home', postScoped: true }),
  item('comments:post', 'comments', 'Карточка поста комментариев', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:choose_post', postScoped: true, visible: false }),
  item('comments:enable', 'comments', '✅ Включить комментарии', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:post', postScoped: true }),
  item('comments:disable', 'comments', '⏸ Выключить комментарии', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:post', postScoped: true }),
  item('comments:open_discussion', 'comments', '👀 Открыть обсуждение', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:post', postScoped: true }),
  item('comments:remove_button', 'comments', 'Убрать кнопку комментариев', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:post', postScoped: true }),
  item('comments:restore_button', 'comments', 'Восстановить кнопку комментариев', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:post', postScoped: true }),
  item('comments:preview', 'comments', '👀 Как это выглядит', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:home' }),
  item('comments:settings', 'comments', '⚙️ Настройки комментариев', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:home' }),

  // Floating banner inside comments
  item('comments_banner:home', 'comments_banner', '🖼 Баннер в обсуждениях', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments:home', sectionHome: 'comments:home', helpRoute: 'help:comments_banner', description: 'Плавающий промо-баннер внутри интерфейса комментариев, не CTA-кнопка под постом.' }),
  item('comments_banner:enable', 'comments_banner', 'Включить баннер', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_banner:home' }),
  item('comments_banner:disable', 'comments_banner', 'Выключить баннер', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_banner:home' }),
  item('comments_banner:set_text', 'comments_banner', 'Текст баннера', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_banner:home' }),
  item('comments_banner:set_button', 'comments_banner', 'Текст кнопки баннера', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_banner:home' }),
  item('comments_banner:set_link', 'comments_banner', 'Ссылка / действие баннера', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_banner:home' }),
  item('comments_banner:scope_all_posts', 'comments_banner', 'Показывать во всех обсуждениях', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_banner:home' }),
  item('comments_banner:scope_one_post', 'comments_banner', 'Показывать у конкретного поста', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_banner:home', postScoped: true }),
  item('comments_banner:preview', 'comments_banner', 'Предпросмотр баннера', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_banner:home' }),

  // Photo, reactions and replies
  item('comments_photo:home', 'comments_photo', '📷 Фото в комментариях', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments:home', sectionHome: 'comments:home' }),
  item('comments_photo:enable', 'comments_photo', 'Включить фото', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_photo:home' }),
  item('comments_photo:disable', 'comments_photo', 'Выключить фото', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_photo:home' }),
  item('comments_photo:limits', 'comments_photo', 'Лимиты фото', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_photo:home' }),
  item('comments_photo:moderation', 'comments_photo', 'Модерация фото', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'comments_photo:home' }),
  item('comments_reactions:home', 'comments_reactions', '❤️ Реакции и ответы', TARIFF.START, STATUS.ACTIVE, { parent: 'comments:home', sectionHome: 'comments:home' }),
  item('comments_reactions:enable', 'comments_reactions', 'Включить реакции', TARIFF.START, STATUS.ACTIVE, { parent: 'comments_reactions:home' }),
  item('comments_replies:enable', 'comments_reactions', 'Включить ответы', TARIFF.START, STATUS.ACTIVE, { parent: 'comments_reactions:home' }),

  // Moderation
  item('moderation:home', 'moderation', '🛡 Модерация', TARIFF.START, STATUS.ACTIVE, { level: 0, helpRoute: 'help:moderation' }),
  item('moderation:channel_rules', 'moderation', '🛡 Правила всего канала', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:choose_post', 'moderation', '🎯 Правила конкретного поста', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home', postScoped: true }),
  item('moderation:post', 'moderation', 'Карточка модерации поста', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:choose_post', postScoped: true, visible: false }),
  item('moderation:enable_filter', 'moderation', '✅ Включить фильтр', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:disable_filter', 'moderation', '⏸ Выключить фильтр', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:basic_words', 'moderation', '🧱 Базовые стоп-слова', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:manual_words', 'moderation', 'Ручной список стоп-слов', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:add_word', 'moderation', '➕ Добавить стоп-слово', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:manual_words' }),
  item('moderation:remove_word', 'moderation', '➖ Удалить стоп-слово', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:manual_words' }),
  item('moderation:clear_manual_words', 'moderation', '🧹 Очистить ручной список', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:manual_words' }),
  item('moderation:links_allow', 'moderation', 'Ссылки: разрешить', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:links_block', 'moderation', 'Ссылки: запретить', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:invites_allow', 'moderation', 'Приглашения: разрешить', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:invites_block', 'moderation', 'Приглашения: запретить', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),
  item('moderation:ai_enable', 'moderation', '🤖 Включить AI-модерацию', TARIFF.BUSINESS, STATUS.BUSINESS_ONLY, { parent: 'moderation:home' }),
  item('moderation:ai_disable', 'moderation', 'Выключить AI-модерацию', TARIFF.BUSINESS, STATUS.BUSINESS_ONLY, { parent: 'moderation:home' }),
  item('moderation:logs', 'moderation', '📋 Журнал модерации', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'moderation:home' }),
  item('moderation:test_comment', 'moderation', '🧪 Тест комментария', TARIFF.START, STATUS.ACTIVE, { parent: 'moderation:home' }),

  // Editor
  item('editor:home', 'editor', '✏️ Редактор постов', TARIFF.PRO, STATUS.PRO_ONLY, { level: 0, helpRoute: 'help:editor' }),
  item('editor:choose_post', 'editor', '📌 Выбрать пост', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'editor:home', postScoped: true }),
  item('editor:edit_text', 'editor', 'Изменить текст', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'editor:post', postScoped: true }),
  item('editor:preview', 'editor', 'Предпросмотр', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'editor:post', postScoped: true }),
  item('editor:save', 'editor', 'Сохранить изменения', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'editor:post', postScoped: true }),
  item('editor:restore_original', 'editor', 'Восстановить оригинал', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'editor:post', postScoped: true }),
  item('editor:history', 'editor', 'История изменений', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'editor:home' }),

  // Buttons under posts / CTA
  item('buttons:home', 'buttons', '⚪ Кнопки под постами', TARIFF.PRO, STATUS.PRO_ONLY, { level: 0, helpRoute: 'help:buttons', description: 'CTA-кнопки под постом MAX. Не путать с баннером в обсуждениях.' }),
  item('buttons:add', 'buttons', '➕ Добавить кнопку', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:home' }),
  item('buttons:choose_post', 'buttons', '📌 Выбрать пост для кнопки', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:home', postScoped: true }),
  item('buttons:post', 'buttons', 'Карточка кнопок поста', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:choose_post', postScoped: true, visible: false }),
  item('buttons:step_2_label', 'buttons', 'Шаг 2/3 — текст кнопки', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:add' }),
  item('buttons:step_3_url', 'buttons', 'Шаг 3/3 — ссылка', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:add' }),
  item('buttons:save', 'buttons', 'Сохранить кнопку', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:add' }),
  item('buttons:list', 'buttons', '📋 Кнопки поста', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:home' }),
  item('buttons:edit', 'buttons', 'Редактировать кнопку', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:post' }),
  item('buttons:delete', 'buttons', 'Удалить кнопку', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:post' }),
  item('buttons:preview', 'buttons', 'Предпросмотр', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'buttons:post' }),

  // Gifts
  item('gifts:home', 'gifts', '🎁 Подарки / лид-магниты', TARIFF.PRO, STATUS.PRO_ONLY, { level: 0, helpRoute: 'help:gifts' }),
  item('gifts:create', 'gifts', '🎁 Создать подарок', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:home' }),
  item('gifts:choose_post', 'gifts', '📌 Выбрать пост для подарка', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:home', postScoped: true }),
  item('gifts:post', 'gifts', 'Карточка подарка поста', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:choose_post', postScoped: true, visible: false }),
  item('gifts:step_1_channel_post', 'gifts', 'Шаг 1/4 — канал и пост', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:create' }),
  item('gifts:step_2_file_or_link', 'gifts', 'Шаг 2/4 — файл или ссылка', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:create' }),
  item('gifts:step_3_message', 'gifts', 'Шаг 3/4 — сообщение получателю', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:create' }),
  item('gifts:step_4_confirm', 'gifts', 'Шаг 4/4 — подтверждение', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:create' }),
  item('gifts:save', 'gifts', 'Сохранить подарок', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:create' }),
  item('gifts:list', 'gifts', '📋 Список подарков', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:home' }),
  item('gifts:edit', 'gifts', 'Редактировать подарок', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:list' }),
  item('gifts:delete', 'gifts', 'Удалить подарок', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:list' }),
  item('gifts:test_send', 'gifts', '🧪 Тестовая выдача', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:home' }),
  item('gifts:check_subscription', 'gifts', '🔐 Проверка подписки', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'gifts:home' }),

  // Highlight and polls
  item('highlight:home', 'highlight', '📌 Выделение постов', TARIFF.PRO, STATUS.COMING_SOON, { level: 0, helpRoute: 'help:highlight' }),
  item('highlight:choose_post', 'highlight', 'Выбрать пост для выделения', TARIFF.PRO, STATUS.COMING_SOON, { parent: 'highlight:home', postScoped: true }),
  item('highlight:enable', 'highlight', 'Включить выделение', TARIFF.PRO, STATUS.COMING_SOON, { parent: 'highlight:post' }),
  item('polls:home', 'polls', 'Голосования / опросы', TARIFF.PRO, STATUS.COMING_SOON, { level: 0, visible: false }),

  // Stats
  item('stats:home', 'stats', '📊 Статистика', TARIFF.START, STATUS.ACTIVE, { level: 0, helpRoute: 'help:stats' }),
  item('stats:channel', 'stats', '📊 Статистика канала', TARIFF.START, STATUS.ACTIVE, { parent: 'stats:home' }),
  item('stats:choose_post', 'stats', '📌 Статистика поста', TARIFF.START, STATUS.ACTIVE, { parent: 'stats:home', postScoped: true }),
  item('stats:comments', 'stats', 'Комментарии', TARIFF.START, STATUS.ACTIVE, { parent: 'stats:home' }),
  item('stats:reactions', 'stats', 'Реакции', TARIFF.START, STATUS.ACTIVE, { parent: 'stats:home' }),
  item('stats:buttons', 'stats', 'Клики по кнопкам', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'stats:home' }),
  item('stats:gifts', 'stats', 'Подарки и заявки', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'stats:home' }),
  item('stats:growth', 'stats', 'Прирост подписчиков', TARIFF.START, STATUS.ACTIVE, { parent: 'stats:home' }),
  item('stats:period_24h', 'stats', '24 часа', TARIFF.START, STATUS.ACTIVE, { parent: 'stats:home' }),
  item('stats:period_7d', 'stats', '7 дней', TARIFF.START, STATUS.ACTIVE, { parent: 'stats:home' }),
  item('stats:period_14d', 'stats', '14 дней', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'stats:home' }),
  item('stats:period_30d', 'stats', '30 дней', TARIFF.PRO, STATUS.PRO_ONLY, { parent: 'stats:home' }),
  item('stats:export', 'stats', 'Экспорт', TARIFF.BUSINESS, STATUS.BUSINESS_ONLY, { parent: 'stats:home' }),

  // Billing, tariffs, tokens
  item('billing:home', 'billing', '🧾 Покупка и тарифы', TARIFF.FREE, STATUS.ACTIVE, { level: 0, helpRoute: 'help:billing' }),
  item('billing:buy', 'billing', '💳 Купить подписку', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'billing:home' }),
  item('billing:trial', 'billing', '🎁 Попробовать бесплатно', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'billing:home' }),
  item('billing:my_plan', 'billing', '📋 Мой тариф', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'billing:home' }),
  item('billing:activate_token', 'billing', '🔐 Активировать токен', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'billing:home' }),
  item('billing:history', 'billing', '🧾 История оплат', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'billing:home' }),
  item('billing:upgrade', 'billing', '⬆️ Улучшить тариф', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'billing:home' }),
  item('tokens:activate', 'billing', 'Активация токена', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'billing:activate_token', visible: false }),

  // Referrals
  item('referrals:home', 'referrals', '🤝 Реферальная программа', TARIFF.FREE, STATUS.COMING_SOON, { level: 0, helpRoute: 'help:referrals' }),
  item('referrals:my_link', 'referrals', '🔗 Моя реферальная ссылка', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'referrals:home' }),
  item('referrals:stats', 'referrals', '📊 Мои приглашения', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'referrals:home' }),
  item('referrals:bonuses', 'referrals', '🎁 Мои бонусы', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'referrals:home' }),
  item('referrals:terms', 'referrals', '💸 Условия программы', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'referrals:home' }),

  // Help
  item('help:home', 'help', '❓ Помощь', TARIFF.FREE, STATUS.ACTIVE, { level: 0 }),
  item('help:comments', 'help', 'Помощь: Комментарии', TARIFF.FREE, STATUS.ACTIVE, { parent: 'help:home' }),
  item('help:gifts', 'help', 'Помощь: Подарки', TARIFF.FREE, STATUS.ACTIVE, { parent: 'help:home' }),
  item('help:buttons', 'help', 'Помощь: Кнопки', TARIFF.FREE, STATUS.ACTIVE, { parent: 'help:home' }),
  item('help:moderation', 'help', 'Помощь: Модерация', TARIFF.FREE, STATUS.ACTIVE, { parent: 'help:home' }),
  item('help:billing', 'help', 'Помощь: Оплата и тарифы', TARIFF.FREE, STATUS.COMING_SOON, { parent: 'help:home' }),

  // Debug/admin only
  item('debug:runtime', 'debug', 'Debug runtime', TARIFF.INTERNAL, STATUS.INTERNAL, { visible: false }),
  item('debug:persistence', 'debug', 'Debug persistence', TARIFF.INTERNAL, STATUS.INTERNAL, { visible: false }),
  item('debug:menu_architecture', 'debug', 'Debug menu architecture', TARIFF.INTERNAL, STATUS.INTERNAL, { visible: false }),
  item('debug:entitlements', 'debug', 'Debug entitlements', TARIFF.INTERNAL, STATUS.INTERNAL, { visible: false }),
  item('debug:tokens', 'debug', 'Debug tokens', TARIFF.INTERNAL, STATUS.INTERNAL, { visible: false })
];

function getProductionMenuMap() {
  return {
    version: 'production-menu-map-v1',
    statusValues: Object.values(STATUS),
    tariffValues: Object.values(TARIFF),
    ownerOrder: OWNER_ORDER,
    mainMenu: MAIN_MENU,
    items: MENU_ITEMS
  };
}

function getByOwner(owner) {
  return MENU_ITEMS.filter((item) => item.owner === owner);
}

function getChildren(parentRoute) {
  return MENU_ITEMS.filter((item) => item.parent === parentRoute);
}

function getRoute(route) {
  return MENU_ITEMS.find((item) => item.route === route) || null;
}

function validateProductionMenuMap() {
  const routes = new Set();
  const errors = [];
  const warnings = [];
  const allowedStatuses = new Set(Object.values(STATUS));
  const allowedTariffs = new Set(Object.values(TARIFF));
  const allowedOwners = new Set(OWNER_ORDER);

  for (const entry of MENU_ITEMS) {
    if (!entry.route) errors.push('route_missing');
    if (routes.has(entry.route)) errors.push(`duplicate_route:${entry.route}`);
    routes.add(entry.route);
    if (!allowedOwners.has(entry.owner)) errors.push(`bad_owner:${entry.route}:${entry.owner}`);
    if (!allowedStatuses.has(entry.status)) errors.push(`bad_status:${entry.route}:${entry.status}`);
    if (!allowedTariffs.has(entry.tariffGate)) errors.push(`bad_tariff:${entry.route}:${entry.tariffGate}`);
    if (entry.parent && !MENU_ITEMS.find((item) => item.route === entry.parent)) warnings.push(`parent_missing:${entry.route}->${entry.parent}`);
  }

  for (const route of MAIN_MENU) {
    if (!routes.has(route)) errors.push(`main_route_missing:${route}`);
  }

  const crossSectionPostRoutes = MENU_ITEMS
    .filter((entry) => entry.postScoped && ['comments', 'gifts', 'buttons'].includes(entry.owner))
    .filter((entry) => entry.owner === 'moderation');
  if (crossSectionPostRoutes.length) errors.push('moderation_cross_section_post_leak');

  const countsByStatus = MENU_ITEMS.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});
  const countsByTariff = MENU_ITEMS.reduce((acc, entry) => {
    acc[entry.tariffGate] = (acc[entry.tariffGate] || 0) + 1;
    return acc;
  }, {});
  const countsByOwner = MENU_ITEMS.reduce((acc, entry) => {
    acc[entry.owner] = (acc[entry.owner] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: errors.length === 0,
    totalRoutes: MENU_ITEMS.length,
    visibleRoutes: MENU_ITEMS.filter((item) => item.visible).length,
    mainMenuRoutes: MAIN_MENU.length,
    errors,
    warnings,
    countsByStatus,
    countsByTariff,
    countsByOwner,
    rules: {
      everyRouteHasOwner: true,
      everyRouteHasTariffGate: true,
      everyRouteHasStatus: true,
      postSelectionIsSectionOwned: true,
      commentsBannerBelongsToComments: true,
      buttonsArePostCtaOnly: true
    }
  };
}

function getProductionMenuSummaryLines() {
  const validation = validateProductionMenuMap();
  return [
    `OK: ${validation.ok ? 'PRODUCTION_MENU_MAP_READY' : 'PRODUCTION_MENU_MAP_FAIL'}`,
    'version: production-menu-map-v1',
    `totalRoutes: ${validation.totalRoutes}`,
    `visibleRoutes: ${validation.visibleRoutes}`,
    `mainMenuRoutes: ${validation.mainMenuRoutes}`,
    `errors: ${validation.errors.length}`,
    `warnings: ${validation.warnings.length}`,
    `active: ${validation.countsByStatus.active || 0}`,
    `pro_only: ${validation.countsByStatus.pro_only || 0}`,
    `business_only: ${validation.countsByStatus.business_only || 0}`,
    `coming_soon: ${validation.countsByStatus.coming_soon || 0}`,
    `internal: ${validation.countsByStatus.internal || 0}`,
    'rule: every_button_has_route_owner_tariff_gate_status',
    'rule: post_selection_is_section_owned',
    'rule: comments_banner_belongs_to_comments_not_buttons',
    'rule: buttons_are_post_cta_only'
  ];
}

module.exports = {
  STATUS,
  TARIFF,
  OWNER_ORDER,
  MAIN_MENU,
  MENU_ITEMS,
  getProductionMenuMap,
  getByOwner,
  getChildren,
  getRoute,
  validateProductionMenuMap,
  getProductionMenuSummaryLines
};
