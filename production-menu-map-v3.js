'use strict';

// Production Menu Map V3 — canonical product menu contract.
// Test mode: PRO is open. All customer-facing functions are active.
// Tariff gates are kept as future metadata, not blockers in this test mode.

const VERSION = 'production-menu-map-v3';
const TEST_MODE = 'PRO_OPEN_ALL_FUNCTIONS';
const STATUS = { ACTIVE: 'active', INTERNAL: 'internal' };
const TARIFF = { FREE: 'free', START: 'start', PRO: 'pro', BUSINESS: 'business', INTERNAL: 'internal' };

const sections = [
  { owner: 'channels', title: '📺 Каналы и доступ', main: true, order: 10, description: 'Подключение канала, проверка прав, доступы, восстановление после redeploy.' },
  { owner: 'comments', title: '💬 Комментарии', main: true, order: 20, description: 'Обсуждения под постами MAX.' },
  { owner: 'comments_banner', title: '🖼 Баннер в обсуждениях', main: false, parentOwner: 'comments', order: 21, description: 'Плавающий баннер внутри обсуждений. Не CTA-кнопка под постом.' },
  { owner: 'comments_photo', title: '📷 Фото в комментариях', main: false, parentOwner: 'comments', order: 22, description: 'Фото в комментариях. Видео и файлы исключены.' },
  { owner: 'comments_reactions', title: '❤️ Реакции и ответы', main: false, parentOwner: 'comments', order: 23, description: 'Реакции и ответы внутри обсуждений.' },
  { owner: 'moderation', title: '🛡 Модерация', main: true, order: 30, description: 'Фильтрация комментариев по каналу и постам.' },
  { owner: 'editor', title: '✏️ Редактор постов', main: true, order: 40, description: 'Редактирование опубликованных постов без потери форматирования, ссылок, кнопок и медиа.' },
  { owner: 'buttons', title: '⚪ Кнопки под постами', main: true, order: 50, description: 'CTA-кнопки под постом MAX. Не баннер в обсуждениях.' },
  { owner: 'gifts', title: '🎁 Подарки / лид-магниты', main: true, order: 60, description: 'Подарки за подписку и лид-магниты.' },
  { owner: 'highlight', title: '📌 Выделение постов', main: true, order: 70, description: 'Визуальное продвижение важного поста.' },
  { owner: 'polls', title: '🗳 Голосования / опросы', main: true, order: 80, description: 'Голосования и опросы для вовлечения.' },
  { owner: 'stats', title: '📊 Статистика', main: true, order: 90, description: 'Понятная статистика канала, постов и функций.' },
  { owner: 'billing', title: '🧾 Покупка и тарифы', main: true, order: 100, description: 'Пробный период, подписка, токены и тариф.' },
  { owner: 'referrals', title: '🤝 Реферальная программа', main: true, order: 110, description: 'Реферальная ссылка, приглашения и бонусы.' },
  { owner: 'help', title: '❓ Помощь', main: true, order: 120, description: 'Контекстная помощь по разделам.' },
  { owner: 'debug', title: 'Debug', main: false, internal: true, order: 900, description: 'Служебные проверки.' },
  { owner: 'production_checklist', title: 'Production checklist', main: false, internal: true, order: 910, description: 'Служебный production checklist.' },
  { owner: 'stress_test', title: 'Stress-test', main: false, internal: true, order: 920, description: 'Служебные stress-test сценарии.' }
];

const def = (owner, route, title, extra = {}) => ({
  route,
  owner,
  title,
  tariffGate: extra.tariffGate || TARIFF.PRO,
  status: extra.status || STATUS.ACTIVE,
  parent: extra.parent ?? `${owner}:home`,
  level: extra.level ?? 2,
  visible: extra.visible ?? true,
  postScoped: extra.postScoped || false,
  sectionHome: extra.sectionHome || `${owner}:home`,
  description: extra.description || '',
  ui: extra.ui || 'button',
  flow: extra.flow || null,
  actionType: extra.actionType || 'screen'
});

const home = (owner, title, tariffGate = TARIFF.PRO) => def(owner, `${owner}:home`, title, {
  tariffGate,
  parent: null,
  level: 1,
  sectionHome: null,
  description: sections.find((section) => section.owner === owner)?.description || ''
});

const commonNav = (owner) => [
  def(owner, `${owner}:help`, '❓ Помощь', { parent: `${owner}:home`, tariffGate: TARIFF.FREE, actionType: 'help' }),
  def(owner, `${owner}:section_home`, '↩️ Раздел', { parent: `${owner}:home`, tariffGate: TARIFF.FREE, actionType: 'navigation' }),
  def(owner, `${owner}:main_menu`, '🏠 Главное меню', { parent: `${owner}:home`, tariffGate: TARIFF.FREE, actionType: 'navigation' })
];

const items = [
  home('channels', '📺 Каналы и доступ', TARIFF.FREE),
  def('channels', 'channels:list', '📋 Мои каналы', { tariffGate: TARIFF.FREE }),
  def('channels', 'channels:connect', '➕ Подключить канал', { tariffGate: TARIFF.FREE, actionType: 'flow' }),
  def('channels', 'channels:select', '🔁 Сменить активный канал', { tariffGate: TARIFF.FREE, actionType: 'select' }),
  def('channels', 'channels:verify_access', '✅ Проверить права бота', { tariffGate: TARIFF.FREE, actionType: 'api_check' }),
  def('channels', 'channels:access', '🔐 Доступы канала', { tariffGate: TARIFF.FREE, actionType: 'screen' }),
  def('channels', 'channels:admins', '👥 Администраторы канала', { tariffGate: TARIFF.BUSINESS, actionType: 'manage' }),
  ...commonNav('channels'),

  home('comments', '💬 Комментарии', TARIFF.START),
  def('comments', 'comments:auto_new', '⚡ Авто для новых постов', { tariffGate: TARIFF.START, actionType: 'toggle' }),
  def('comments', 'comments:old_post', '📌 Подключить старый пост', { tariffGate: TARIFF.START, actionType: 'flow' }),
  def('comments', 'comments:choose_post', '📌 Выбрать пост', { tariffGate: TARIFF.START, postScoped: true, actionType: 'post_select' }),
  def('comments', 'comments:post', 'Карточка поста комментариев', { tariffGate: TARIFF.START, parent: 'comments:choose_post', visible: false, postScoped: true, ui: 'post_card' }),
  def('comments', 'comments:toggle', '✅ / ⏸ Комментарии', { tariffGate: TARIFF.START, parent: 'comments:post', postScoped: true, actionType: 'toggle' }),
  def('comments', 'comments:preview', '👀 Как это выглядит', { tariffGate: TARIFF.START }),
  def('comments', 'comments:settings', '⚙️ Настройки комментариев', { tariffGate: TARIFF.START }),
  def('comments', 'comments_banner:home', '🖼 Баннер в обсуждениях', { tariffGate: TARIFF.PRO, owner: 'comments_banner', sectionHome: 'comments:home' }),
  def('comments', 'comments_photo:home', '📷 Фото в комментариях', { tariffGate: TARIFF.PRO, owner: 'comments_photo', sectionHome: 'comments:home' }),
  def('comments', 'comments_reactions:home', '❤️ Реакции и ответы', { tariffGate: TARIFF.START, owner: 'comments_reactions', sectionHome: 'comments:home' }),
  ...commonNav('comments'),

  home('comments_banner', '🖼 Баннер в обсуждениях', TARIFF.PRO),
  def('comments_banner', 'comments_banner:toggle', '✅ / ⏸ Баннер', { actionType: 'toggle' }),
  def('comments_banner', 'comments_banner:set_text', '✏️ Текст баннера', { actionType: 'flow' }),
  def('comments_banner', 'comments_banner:set_button', '🔘 Текст кнопки баннера', { actionType: 'flow' }),
  def('comments_banner', 'comments_banner:set_link', '🔗 Ссылка / действие', { actionType: 'flow' }),
  def('comments_banner', 'comments_banner:scope_all_posts', '🌍 Показывать во всех обсуждениях', { actionType: 'toggle' }),
  def('comments_banner', 'comments_banner:scope_one_post', '📌 Показывать у конкретного поста', { postScoped: true, actionType: 'post_select' }),
  def('comments_banner', 'comments_banner:preview', '👀 Предпросмотр'),
  def('comments_banner', 'comments_banner:back_to_comments', '↩️ В комментарии', { actionType: 'navigation' }),
  def('comments_banner', 'comments_banner:main_menu', '🏠 Главное меню', { tariffGate: TARIFF.FREE, actionType: 'navigation' }),

  home('comments_photo', '📷 Фото в комментариях', TARIFF.PRO),
  def('comments_photo', 'comments_photo:toggle', '✅ / ⏸ Фото', { actionType: 'toggle' }),
  def('comments_photo', 'comments_photo:limits', '📏 Лимиты фото'),
  def('comments_photo', 'comments_photo:moderation', '🛡 Модерация фото'),
  def('comments_photo', 'comments_photo:back_to_comments', '↩️ В комментарии', { actionType: 'navigation' }),
  def('comments_photo', 'comments_photo:main_menu', '🏠 Главное меню', { tariffGate: TARIFF.FREE, actionType: 'navigation' }),

  home('comments_reactions', '❤️ Реакции и ответы', TARIFF.START),
  def('comments_reactions', 'comments_reactions:toggle_reactions', '✅ / ⏸ Реакции', { tariffGate: TARIFF.START, actionType: 'toggle' }),
  def('comments_reactions', 'comments_reactions:toggle_replies', '✅ / ⏸ Ответы', { tariffGate: TARIFF.START, actionType: 'toggle' }),
  def('comments_reactions', 'comments_reactions:preview', '👀 Предпросмотр', { tariffGate: TARIFF.START }),
  def('comments_reactions', 'comments_reactions:back_to_comments', '↩️ В комментарии', { tariffGate: TARIFF.FREE, actionType: 'navigation' }),
  def('comments_reactions', 'comments_reactions:main_menu', '🏠 Главное меню', { tariffGate: TARIFF.FREE, actionType: 'navigation' }),

  home('moderation', '🛡 Модерация', TARIFF.START),
  def('moderation', 'moderation:channel', '🛡 Правила всего канала', { tariffGate: TARIFF.START }),
  def('moderation', 'moderation:choose_post', '🎯 Правила конкретного поста', { tariffGate: TARIFF.START, postScoped: true, actionType: 'post_select' }),
  def('moderation', 'moderation:post', 'Карточка модерации поста', { tariffGate: TARIFF.START, parent: 'moderation:choose_post', visible: false, postScoped: true, ui: 'post_card' }),
  def('moderation', 'moderation:toggle_filter', '✅ / ⏸ Фильтр', { tariffGate: TARIFF.START, actionType: 'toggle' }),
  def('moderation', 'moderation:base_words', '🧱 Базовые стоп-слова', { tariffGate: TARIFF.START }),
  def('moderation', 'moderation:manual_words', '📋 Ручной список', { tariffGate: TARIFF.START }),
  def('moderation', 'moderation:add_word', '➕ Стоп-слово', { tariffGate: TARIFF.START, actionType: 'flow' }),
  def('moderation', 'moderation:toggle_links', '🔗 Ссылки: разрешить / запретить', { tariffGate: TARIFF.START, actionType: 'toggle' }),
  def('moderation', 'moderation:toggle_invites', '✉️ Инвайты: разрешить / запретить', { tariffGate: TARIFF.START, actionType: 'toggle' }),
  def('moderation', 'moderation:toggle_ai', '🤖 AI-модерация', { tariffGate: TARIFF.BUSINESS, actionType: 'toggle' }),
  def('moderation', 'moderation:logs', '📋 Журнал модерации', { tariffGate: TARIFF.PRO }),
  def('moderation', 'moderation:test_comment', '🧪 Проверить комментарий', { tariffGate: TARIFF.START, actionType: 'flow' }),
  ...commonNav('moderation'),

  home('editor', '✏️ Редактор постов', TARIFF.PRO),
  def('editor', 'editor:choose_post', '📌 Выбрать пост', { postScoped: true, actionType: 'post_select' }),
  def('editor', 'editor:post', 'Карточка редактора поста', { parent: 'editor:choose_post', visible: false, postScoped: true, ui: 'post_card' }),
  def('editor', 'editor:edit_text', '✏️ Изменить текст', { parent: 'editor:post', postScoped: true, actionType: 'flow' }),
  def('editor', 'editor:preview', '👀 Предпросмотр', { parent: 'editor:post', postScoped: true }),
  def('editor', 'editor:save', '💾 Сохранить изменения', { parent: 'editor:post', postScoped: true, actionType: 'save' }),
  def('editor', 'editor:restore_original', '↩️ Восстановить оригинал', { parent: 'editor:post', postScoped: true, actionType: 'restore' }),
  def('editor', 'editor:history', '🕘 История изменений'),
  ...commonNav('editor'),

  home('buttons', '⚪ Кнопки под постами', TARIFF.PRO),
  def('buttons', 'buttons:add', '➕ Добавить кнопку', { actionType: 'flow' }),
  def('buttons', 'buttons:choose_post', '📌 Выбрать пост для кнопки', { postScoped: true, actionType: 'post_select' }),
  def('buttons', 'buttons:post', 'Карточка кнопок поста', { parent: 'buttons:choose_post', visible: false, postScoped: true, ui: 'post_card' }),
  def('buttons', 'buttons:list', '📋 Кнопки поста', { parent: 'buttons:post', postScoped: true }),
  def('buttons', 'buttons:edit', '✏️ Редактировать кнопку', { parent: 'buttons:post', postScoped: true, actionType: 'flow' }),
  def('buttons', 'buttons:delete', '🗑 Удалить кнопку', { parent: 'buttons:post', postScoped: true, actionType: 'delete' }),
  def('buttons', 'buttons:preview', '👀 Предпросмотр', { parent: 'buttons:post', postScoped: true }),
  def('buttons', 'buttons:step_1_post', 'Шаг 1/3 — выбрать пост', { parent: 'buttons:add', actionType: 'flow' }),
  def('buttons', 'buttons:step_2_label', 'Шаг 2/3 — текст кнопки', { parent: 'buttons:add', actionType: 'flow' }),
  def('buttons', 'buttons:step_3_url', 'Шаг 3/3 — ссылка / действие', { parent: 'buttons:add', actionType: 'flow' }),
  def('buttons', 'buttons:save', '💾 Сохранить', { parent: 'buttons:add', actionType: 'save' }),
  ...commonNav('buttons'),

  home('gifts', '🎁 Подарки / лид-магниты', TARIFF.PRO),
  def('gifts', 'gifts:create', '🎁 Создать подарок', { actionType: 'flow' }),
  def('gifts', 'gifts:choose_post', '📌 Выбрать пост для подарка', { postScoped: true, actionType: 'post_select' }),
  def('gifts', 'gifts:post', 'Карточка подарка поста', { parent: 'gifts:choose_post', visible: false, postScoped: true, ui: 'post_card' }),
  def('gifts', 'gifts:list', '📋 Список подарков'),
  def('gifts', 'gifts:edit', '✏️ Редактировать подарок', { actionType: 'flow' }),
  def('gifts', 'gifts:delete', '🗑 Удалить подарок', { actionType: 'delete' }),
  def('gifts', 'gifts:test_send', '🧪 Тестовая выдача', { actionType: 'api_check' }),
  def('gifts', 'gifts:check_subscription', '🔐 Проверка подписки', { actionType: 'api_check' }),
  def('gifts', 'gifts:recipient_message', '💬 Сообщение получателю', { actionType: 'flow' }),
  def('gifts', 'gifts:step_1_channel_post', 'Шаг 1/4 — канал и пост', { parent: 'gifts:create', actionType: 'flow' }),
  def('gifts', 'gifts:step_2_file_or_link', 'Шаг 2/4 — файл или ссылка подарка', { parent: 'gifts:create', actionType: 'flow' }),
  def('gifts', 'gifts:step_3_message', 'Шаг 3/4 — сообщение получателю', { parent: 'gifts:create', actionType: 'flow' }),
  def('gifts', 'gifts:step_4_confirm', 'Шаг 4/4 — подтверждение', { parent: 'gifts:create', actionType: 'flow' }),
  def('gifts', 'gifts:save', '💾 Сохранить подарок', { parent: 'gifts:create', actionType: 'save' }),
  ...commonNav('gifts'),

  home('highlight', '📌 Выделение постов', TARIFF.PRO),
  def('highlight', 'highlight:choose_post', '📌 Выбрать пост', { postScoped: true, actionType: 'post_select' }),
  def('highlight', 'highlight:post', 'Карточка выделения поста', { parent: 'highlight:choose_post', visible: false, postScoped: true, ui: 'post_card' }),
  def('highlight', 'highlight:toggle', '✅ / ⏸ Выделение', { parent: 'highlight:post', postScoped: true, actionType: 'toggle' }),
  def('highlight', 'highlight:set_text', '✏️ Текст выделения', { parent: 'highlight:post', postScoped: true, actionType: 'flow' }),
  def('highlight', 'highlight:preview', '👀 Предпросмотр', { parent: 'highlight:post', postScoped: true }),
  def('highlight', 'highlight:stats', '📊 Статистика выделения', { parent: 'highlight:post', postScoped: true }),
  ...commonNav('highlight'),

  home('polls', '🗳 Голосования / опросы', TARIFF.PRO),
  def('polls', 'polls:create', '➕ Создать голосование', { actionType: 'flow' }),
  def('polls', 'polls:attach_post', '📌 Привязать к посту', { postScoped: true, actionType: 'post_select' }),
  def('polls', 'polls:options', '✏️ Варианты ответа', { actionType: 'flow' }),
  def('polls', 'polls:toggle_multiple', '✅ Один ответ / несколько ответов', { actionType: 'toggle' }),
  def('polls', 'polls:results', '📊 Результаты'),
  def('polls', 'polls:finish', '⏸ Завершить голосование', { actionType: 'toggle' }),
  def('polls', 'polls:preview', '👀 Предпросмотр'),
  ...commonNav('polls'),

  home('stats', '📊 Статистика', TARIFF.START),
  def('stats', 'stats:channel', '📊 Статистика канала', { tariffGate: TARIFF.START }),
  def('stats', 'stats:choose_post', '📌 Статистика поста', { tariffGate: TARIFF.START, postScoped: true, actionType: 'post_select' }),
  def('stats', 'stats:comments', '💬 Комментарии', { tariffGate: TARIFF.START }),
  def('stats', 'stats:reactions', '❤️ Реакции', { tariffGate: TARIFF.START }),
  def('stats', 'stats:button_clicks', '🔘 Клики по кнопкам', { tariffGate: TARIFF.PRO }),
  def('stats', 'stats:gifts', '🎁 Подарки и заявки', { tariffGate: TARIFF.PRO }),
  def('stats', 'stats:growth', '📈 Прирост подписчиков', { tariffGate: TARIFF.START }),
  def('stats', 'stats:period_24h', '24 часа', { tariffGate: TARIFF.START }),
  def('stats', 'stats:period_7d', '7 дней', { tariffGate: TARIFF.START }),
  def('stats', 'stats:period_14d', '14 дней', { tariffGate: TARIFF.PRO }),
  def('stats', 'stats:period_30d', '30 дней', { tariffGate: TARIFF.PRO }),
  def('stats', 'stats:export', '📤 Экспорт', { tariffGate: TARIFF.BUSINESS }),
  ...commonNav('stats'),

  home('billing', '🧾 Покупка и тарифы', TARIFF.FREE),
  def('billing', 'billing:my_plan', '📋 Мой тариф', { tariffGate: TARIFF.FREE }),
  def('billing', 'billing:trial', '🎁 Попробовать бесплатно', { tariffGate: TARIFF.FREE, actionType: 'flow' }),
  def('billing', 'billing:buy', '💳 Купить подписку', { tariffGate: TARIFF.FREE, actionType: 'payment' }),
  def('billing', 'billing:upgrade', '⬆️ Улучшить тариф', { tariffGate: TARIFF.FREE, actionType: 'payment' }),
  def('billing', 'billing:activate_token', '🔐 Активировать токен', { tariffGate: TARIFF.FREE, actionType: 'flow' }),
  def('billing', 'billing:history', '🧾 История оплат', { tariffGate: TARIFF.FREE }),
  def('billing', 'billing:channel_limits', '📺 Каналы в тарифе', { tariffGate: TARIFF.FREE }),
  ...commonNav('billing'),

  home('referrals', '🤝 Реферальная программа', TARIFF.FREE),
  def('referrals', 'referrals:my_link', '🔗 Моя реферальная ссылка', { tariffGate: TARIFF.FREE }),
  def('referrals', 'referrals:stats', '📊 Мои приглашения', { tariffGate: TARIFF.FREE }),
  def('referrals', 'referrals:bonuses', '🎁 Мои бонусы', { tariffGate: TARIFF.FREE }),
  def('referrals', 'referrals:terms', '💸 Условия программы', { tariffGate: TARIFF.FREE }),
  def('referrals', 'referrals:share', '📤 Поделиться', { tariffGate: TARIFF.FREE, actionType: 'share' }),
  ...commonNav('referrals'),

  home('help', '❓ Помощь', TARIFF.FREE),
  ...['channels','comments','moderation','editor','buttons','gifts','highlight','polls','stats','billing','referrals'].map((owner) => def('help', `help:${owner}`, `Помощь: ${sections.find((s) => s.owner === owner)?.title || owner}`, { tariffGate: TARIFF.FREE, parent: 'help:home', actionType: 'help' })),
  def('help', 'help:main_menu', '🏠 Главное меню', { tariffGate: TARIFF.FREE, parent: 'help:home', actionType: 'navigation' }),

  def('debug', 'debug:runtime', 'Debug runtime', { tariffGate: TARIFF.INTERNAL, status: STATUS.INTERNAL, visible: false, parent: null, sectionHome: null }),
  def('debug', 'debug:production_menu_map_v3', 'Debug Production Menu Map V3', { tariffGate: TARIFF.INTERNAL, status: STATUS.INTERNAL, visible: false, parent: null, sectionHome: null }),
  def('production_checklist', 'production_checklist:home', 'Production checklist', { tariffGate: TARIFF.INTERNAL, status: STATUS.INTERNAL, visible: false, parent: null, sectionHome: null }),
  def('stress_test', 'stress_test:menu', 'Menu stress-test', { tariffGate: TARIFF.INTERNAL, status: STATUS.INTERNAL, visible: false, parent: null, sectionHome: null })
].map((item) => item.route?.includes(':') && item.owner === 'comments' && ['comments_banner', 'comments_photo', 'comments_reactions'].includes(item.route.split(':')[0]) ? { ...item, owner: item.route.split(':')[0] } : item);

const mainMenu = sections.filter((section) => section.main && !section.internal).sort((a, b) => a.order - b.order).map((section) => `${section.owner}:home`);

function validateMenuMapV3() {
  const errors = [];
  const warnings = [];
  const sectionOwners = new Set(sections.map((section) => section.owner));
  const routeSet = new Set();
  for (const item of items) {
    if (!item.route) errors.push('route_missing');
    if (!item.owner) errors.push(`owner_missing:${item.route}`);
    if (!sectionOwners.has(item.owner)) errors.push(`unknown_owner:${item.route}:${item.owner}`);
    if (!item.title) errors.push(`title_missing:${item.route}`);
    if (!item.tariffGate) errors.push(`tariff_missing:${item.route}`);
    if (!item.status) errors.push(`status_missing:${item.route}`);
    if (routeSet.has(item.route)) errors.push(`duplicate_route:${item.route}`);
    routeSet.add(item.route);
    if (item.postScoped && item.route.includes('choose_post') && item.owner !== item.route.split(':')[0]) errors.push(`post_selection_owner_mismatch:${item.route}:${item.owner}`);
    if (item.route.startsWith('comments_banner:') && item.owner !== 'comments_banner') errors.push(`comments_banner_wrong_owner:${item.route}:${item.owner}`);
    if (item.owner === 'buttons' && /banner/i.test(item.route + item.title)) errors.push(`buttons_must_not_own_banner:${item.route}`);
    if (/commentKey|postId|payload|route/i.test(item.title)) errors.push(`technical_title:${item.route}`);
  }
  for (const route of mainMenu) if (!routeSet.has(route)) errors.push(`main_route_missing:${route}`);
  for (const item of items) if (item.parent && !routeSet.has(item.parent)) warnings.push(`parent_missing:${item.route}->${item.parent}`);
  const countsByOwner = items.reduce((acc, item) => { acc[item.owner] = (acc[item.owner] || 0) + 1; return acc; }, {});
  const countsByTariff = items.reduce((acc, item) => { acc[item.tariffGate] = (acc[item.tariffGate] || 0) + 1; return acc; }, {});
  const countsByStatus = items.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
  return {
    ok: errors.length === 0,
    version: VERSION,
    testMode: TEST_MODE,
    totalSections: sections.length,
    mainMenuRoutes: mainMenu.length,
    totalRoutes: items.length,
    visibleRoutes: items.filter((item) => item.visible !== false).length,
    errors,
    warnings,
    countsByOwner,
    countsByTariff,
    countsByStatus,
    rules: {
      everyRouteHasOwner: errors.every((error) => !error.startsWith('owner_missing')),
      everyRouteHasTariffGate: errors.every((error) => !error.startsWith('tariff_missing')),
      everyRouteHasStatus: errors.every((error) => !error.startsWith('status_missing')),
      postSelectionIsSectionOwned: errors.every((error) => !error.startsWith('post_selection_owner_mismatch')),
      commentsBannerBelongsToCommentsTree: errors.every((error) => !error.startsWith('comments_banner_wrong_owner')),
      buttonsArePostCtaOnly: errors.every((error) => !error.startsWith('buttons_must_not_own_banner')),
      noTechnicalTitles: errors.every((error) => !error.startsWith('technical_title'))
    }
  };
}

function getMenuMapV3() {
  return { version: VERSION, testMode: TEST_MODE, statusValues: Object.values(STATUS), tariffValues: Object.values(TARIFF), mainMenu, sections, items, validation: validateMenuMapV3() };
}
function getOwnerRoutes(owner) {
  return items.filter((item) => item.owner === owner);
}

module.exports = { VERSION, TEST_MODE, STATUS, TARIFF, sections, mainMenu, items, validateMenuMapV3, getMenuMapV3, getOwnerRoutes };
