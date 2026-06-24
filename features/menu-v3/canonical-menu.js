'use strict';

// PR105 Production Menu Canonicalization.
// Single source of truth for the client-visible production menu.
// Legacy production-menu-map-v3-fixed.js and production-menu-v3-renderer.js are reference-only.

const VERSION = 'pr240-polls-unified-workflow-v1';
const SOURCE = 'adminkit-pr240-polls-unified-post-workflow';

function action({ id, title, section, targetAction = '', existingAction = '', clientVisible = true, adminOnly = false, requiresChannel = false, requiresPost = false, implemented = true, hiddenReason = '', payload = {}, featureKey = '', minPlan = 'free', requiresActiveAccess = true, availableInPlans = [], accountOnlyWhenExpired = false }) {
  return { id, title, section, targetAction: targetAction || existingAction || id, existingAction: existingAction || targetAction || id, clientVisible: Boolean(clientVisible && !adminOnly && implemented), adminOnly: Boolean(adminOnly), requiresChannel: Boolean(requiresChannel), requiresPost: Boolean(requiresPost), implemented: Boolean(implemented), hiddenReason: hiddenReason || '', payload: payload || {}, featureKey: featureKey || section || id, minPlan, requiresActiveAccess: Boolean(requiresActiveAccess), availableInPlans, accountOnlyWhenExpired: Boolean(accountOnlyWhenExpired) };
}

const sections = [
  { id: 'channels', title: 'Каналы', route: 'channels:home', clientVisible: true, adminOnly: false, featureKey: 'channels', minPlan: 'free', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'channels.connect', title: 'Подключить канал', section: 'channels', targetAction: 'channels:connect', existingAction: 'admin_section_channels' }),
    action({ id: 'channels.mine', title: 'Мои каналы', section: 'channels', targetAction: 'channels:list', existingAction: 'admin_section_channels' }),
    action({ id: 'channels.instructions', title: 'Инструкция', section: 'channels', targetAction: 'channels:instructions', existingAction: 'admin_section_help', payload: { context: 'admin_section_channels' } }),
  ] },
  { id: 'comments', title: 'Комментарии', route: 'comments:home', clientVisible: true, adminOnly: false, featureKey: 'comments', minPlan: 'free', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'comments.auto_comments', title: 'Автокомментарии', section: 'comments', existingAction: 'comments_auto_patch', requiresChannel: true }),
    action({ id: 'comments.manual_enable', title: 'Включить к посту', section: 'comments', existingAction: 'comments_select_post', requiresChannel: true, requiresPost: true, payload: { source: 'comments_manual' } }),
    action({ id: 'comments.photo', title: 'Фото', section: 'comments', existingAction: 'comments_option_channel', requiresChannel: true, payload: { source: 'comments_photos' } }),
    action({ id: 'comments.replies', title: 'Ответы', section: 'comments', existingAction: 'comments_option_channel', requiresChannel: true, payload: { source: 'comments_replies' } }),
    action({ id: 'comments.reactions', title: 'Реакции', section: 'comments', existingAction: 'comments_option_channel', requiresChannel: true, payload: { source: 'comments_reactions' } }),
  ] },
  { id: 'gifts', title: 'Подарки / лид-магниты', route: 'gifts:home', clientVisible: true, adminOnly: false, featureKey: 'gifts', minPlan: 'pro', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'gifts.create', title: 'Создать подарок', section: 'gifts', existingAction: 'gift_admin_start_create' }),
    action({ id: 'gifts.replace', title: 'Заменить подарок', section: 'gifts', existingAction: 'gift_admin_replace_pick', clientVisible: false, implemented: false, hiddenReason: 'available_after_post_selection' }),
    action({ id: 'gifts.current', title: 'Текущий подарок', section: 'gifts', existingAction: 'gift_admin_show_current' }),
    action({ id: 'gifts.list', title: 'Список подарков', section: 'gifts', existingAction: 'gift_admin_list_campaigns' }),
  ] },
  { id: 'buttons', title: 'Кнопки под постами', route: 'buttons:home', clientVisible: true, adminOnly: false, featureKey: 'buttons', minPlan: 'start', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'buttons.add', title: 'Добавить кнопку', section: 'buttons', existingAction: 'button_admin_start_add', requiresChannel: true, requiresPost: true }),
    action({ id: 'buttons.current', title: 'Текущие кнопки', section: 'buttons', existingAction: 'button_admin_show_current', requiresChannel: true, requiresPost: true }),
    action({ id: 'buttons.delete', title: 'Удалить кнопку', section: 'buttons', existingAction: 'button_admin_delete', clientVisible: false, implemented: false, hiddenReason: 'inside_current_buttons_card' }),
  ] },
  { id: 'stats', title: 'Статистика', route: 'stats:home', clientVisible: true, adminOnly: false, featureKey: 'basic_stats', minPlan: 'start', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'stats.overview', title: 'Обзор', section: 'stats', existingAction: 'admin_section_stats' }),
    action({ id: 'stats.subscribers', title: 'Подписчики', section: 'stats', existingAction: 'admin_stats_subscribers_day' }),
    action({ id: 'stats.posts', title: 'Посты', section: 'stats', existingAction: 'admin_stats_posts_cache' }),
    action({ id: 'stats.comments', title: 'Комментарии', section: 'stats', existingAction: 'admin_stats_comments_cache' }),
    action({ id: 'stats.reactions', title: 'Реакции', section: 'stats', existingAction: 'admin_stats_reactions_cache' }),
    action({ id: 'stats.gifts', title: 'Подарки', section: 'stats', existingAction: 'admin_stats_gifts_cache' }),
    action({ id: 'stats.buttons_clicks', title: 'Кнопки под постами / клики', section: 'stats', existingAction: 'admin_stats_buttons_cache' }),
    action({ id: 'stats.ad_links', title: 'Рекламные ссылки', section: 'stats', existingAction: 'admin_stats_campaigns' }),
    action({ id: 'stats.subscriber_sources', title: 'Источники подписчиков', section: 'stats', existingAction: 'admin_stats_sources_cache' }),
    action({ id: 'stats.refresh', title: 'Обновить данные', section: 'stats', existingAction: 'admin_stats_refresh' }),
  ] },
  { id: 'push', title: '🔔 Уведомления', route: 'push:home', clientVisible: true, adminOnly: false, featureKey: 'channels', minPlan: 'free', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'push.publish', title: 'Опубликовать приглашение', section: 'push', existingAction: 'admin_push_select_chat', featureKey: 'channels' }),
    action({ id: 'push.help', title: 'Как это работает', section: 'push', existingAction: 'admin_push_help', featureKey: 'channels' }),
  ] },
  { id: 'ad_links', title: 'Рекламные ссылки', route: 'ad_links:home', aliases: ['ads:home'], clientVisible: true, adminOnly: false, featureKey: 'ad_links', minPlan: 'pro', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'ad_links.create', title: 'Создать рекламную ссылку', section: 'ad_links', existingAction: 'admin_stats_campaign_create' }),
    action({ id: 'ad_links.mine', title: 'Мои рекламные ссылки', section: 'ad_links', existingAction: 'admin_stats_campaigns' }),
    action({ id: 'ad_links.disable', title: 'Отключить ссылку', section: 'ad_links', existingAction: 'admin_stats_campaign_disable', clientVisible: false, implemented: false, hiddenReason: 'inside_ad_link_card' }),
  ] },
  { id: 'polls', title: 'Опросы / голосования', route: 'polls:home', clientVisible: true, adminOnly: false, featureKey: 'polls', minPlan: 'pro', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'polls.create', title: 'Создать опрос', section: 'polls', targetAction: 'polls:create', existingAction: 'comments_select_post', requiresChannel: true, requiresPost: true, payload: { source: 'polls' } }),
    action({ id: 'polls.results', title: 'Результаты опросов', section: 'polls', targetAction: 'polls:results', existingAction: 'poll_status' }),
    action({ id: 'polls.stop', title: 'Остановить опрос', section: 'polls', existingAction: 'poll_stop', clientVisible: false, implemented: false, hiddenReason: 'inside_active_poll_card' }),
  ] },
  { id: 'highlights', title: 'Выделение постов', route: 'highlights:home', aliases: ['highlight:home'], clientVisible: true, adminOnly: false, featureKey: 'highlights', minPlan: 'pro', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'highlights.apply', title: 'Поставить выделение', section: 'highlights', existingAction: 'comments_select_post', requiresChannel: true, requiresPost: true, payload: { source: 'highlights' } }),
    action({ id: 'highlights.remove', title: 'Снять выделение', section: 'highlights', existingAction: 'comments_select_post', requiresChannel: true, requiresPost: true, payload: { source: 'highlights' } }),
  ] },
  { id: 'editor', title: 'Редактор постов', route: 'editor:home', clientVisible: true, adminOnly: false, featureKey: 'post_editor', minPlan: 'start', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'editor.change_text', title: 'Выбрать пост', section: 'editor', existingAction: 'admin_posts_picker', requiresChannel: true, requiresPost: true }),
    action({ id: 'editor.history', title: 'История версий', section: 'editor', existingAction: 'admin_posts_history', clientVisible: false, implemented: false, hiddenReason: 'not_client_root' }),
  ] },
  { id: 'archive', title: 'Архив постов', route: 'archive:home', clientVisible: true, adminOnly: false, featureKey: 'archive', minPlan: 'free', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'archive.saved_posts', title: 'Сохранённые посты', section: 'archive', existingAction: 'archive_list', payload: { offset: 0 } }),
    action({ id: 'archive.restore_post', title: 'Восстановить пост', section: 'archive', existingAction: 'archive_list', clientVisible: false, implemented: false, hiddenReason: 'inside_archived_post_card' }),
    action({ id: 'archive.storage_limits', title: 'Лимиты хранения', section: 'archive', existingAction: 'archive_limits' }),
    action({ id: 'archive.status', title: 'Статус архива', section: 'archive', existingAction: 'archive_status', clientVisible: false, implemented: false, hiddenReason: 'technical_diagnostic_only' }),
  ] },
  { id: 'account', title: 'Личный кабинет', route: 'account:home', aliases: ['tariffs:home'], clientVisible: true, adminOnly: false, featureKey: 'account', minPlan: 'free', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: true, actions: [
    action({ id: 'account.access', title: 'Мой доступ', section: 'account', existingAction: 'billing_current_plan' }),
    action({ id: 'account.activate_code', title: 'Активировать код', section: 'account', existingAction: 'account_activate_code' }),
    action({ id: 'account.payment', title: 'Оплата / продление', section: 'account', existingAction: 'billing_upgrade' }),
    action({ id: 'account.limits', title: 'Лимиты и функции', section: 'account', existingAction: 'billing_limits' }),
    action({ id: 'account.channels', title: 'Мои каналы', section: 'account', existingAction: 'account_channels' }),
    action({ id: 'account.support', title: 'Поддержка', section: 'account', existingAction: 'account_support' }),
  ] },
  { id: 'settings', title: 'Настройки', route: 'settings:home', clientVisible: true, adminOnly: false, featureKey: 'settings', minPlan: 'free', requiresActiveAccess: true, availableInPlans: [], accountOnlyWhenExpired: false, actions: [
    action({ id: 'settings.clear_chat', title: 'Очистить чат', section: 'settings', targetAction: 'settings:clear_chat' }),
    action({ id: 'settings.notifications', title: 'Уведомления', section: 'settings', targetAction: 'settings:notifications', clientVisible: false, implemented: false, hiddenReason: 'placeholder_and_push_duplicate' }),
    action({ id: 'settings.language_format', title: 'Язык / формат', section: 'settings', targetAction: 'settings:language_format', clientVisible: false, implemented: false, hiddenReason: 'placeholder' }),
    action({ id: 'settings.help', title: 'Помощь', section: 'settings', targetAction: 'settings:help' }),
    action({ id: 'settings.privacy_terms', title: 'Privacy / Terms', section: 'settings', targetAction: 'settings:privacy_terms' }),
    action({ id: 'settings.navigation', title: 'Навигация', section: 'settings', targetAction: 'settings:navigation', clientVisible: false, implemented: false, hiddenReason: 'navigation_is_global' }),
  ] },
];

const hidden = [
  action({ id: 'debug.admin_only', title: 'Debug / Admin-only', section: 'debug', adminOnly: true, clientVisible: false, implemented: false, hiddenReason: 'admin_only' }),
  action({ id: 'debug.github_export', title: 'GitHub export', section: 'debug', adminOnly: true, clientVisible: false, implemented: false, hiddenReason: 'admin_only' }),
  action({ id: 'debug.selftests', title: 'selftests', section: 'debug', adminOnly: true, clientVisible: false, implemented: false, hiddenReason: 'admin_only' }),
  action({ id: 'debug.trace', title: 'trace', section: 'debug', adminOnly: true, clientVisible: false, implemented: false, hiddenReason: 'admin_only' }),
  action({ id: 'debug.production_checklist', title: 'production checklist', section: 'debug', adminOnly: true, clientVisible: false, implemented: false, hiddenReason: 'admin_only' }),
  action({ id: 'moderation.ai', title: 'AI-модерация', section: 'moderation', adminOnly: true, clientVisible: false, implemented: false, hiddenReason: 'not_ready' }),
  action({ id: 'comments.video', title: 'Видео в комментариях', section: 'comments', clientVisible: false, implemented: false, hiddenReason: 'not_supported' }),
  action({ id: 'comments.files', title: 'Файлы в комментариях', section: 'comments', clientVisible: false, implemented: false, hiddenReason: 'not_supported' }),
];

const hiddenFromClient = hidden.map((item) => item.id);
const clientSections = sections.filter((section) => section.clientVisible && !section.adminOnly);
const sectionById = Object.fromEntries(sections.map((section) => [section.id, section]));
const routeToSectionId = {};
for (const section of sections) {
  routeToSectionId[section.route] = section.id;
  for (const alias of section.aliases || []) routeToSectionId[alias] = section.id;
}

function clientActions(sectionId) { const section = sectionById[sectionId]; return section ? section.actions.filter((item) => item.clientVisible && !item.adminOnly && item.implemented) : []; }
function allActions() {
  return sections.flatMap((section) => section.actions.map((item) => {
    if (item.id === 'polls.create') return { ...item, targetAction: 'comments_select_post', compatibilityTargetAction: 'polls:create' };
    return item;
  })).concat(hidden);
}
function visibleLabels() { return clientSections.flatMap((section) => [section.title, ...clientActions(section.id).map((item) => item.title)]); }
function resolveSectionByRoute(route = '') { return sectionById[routeToSectionId[String(route || '').trim()]] || null; }
function validate() {
  const labels = visibleLabels();
  const joined = labels.join('\n');
  const banned = [/\bCTA\b/i, /Debug/i, /trace/i, /GitHub export/i, /production checklist/i, /postId/i, /channelId/i, /commentKey/i, /token/i, /payload/i, /видео/i, /файл/i];
  const flowSteps = ['Выбрать канал', 'Выбрать пост', 'Материал подарка', 'Текст получателю', 'Условия'];
  const errors = [];
  if (clientSections.length !== 13) errors.push(`client_sections_count:${clientSections.length}`);
  for (const pattern of banned) if (pattern.test(joined)) errors.push(`banned_label:${pattern}`);
  for (const step of flowSteps) if (labels.some((label) => label.toLowerCase() === step.toLowerCase()) && !(step === 'Выбрать пост' && clientActions('editor').some((item) => item.title === step))) errors.push(`flow_step_root:${step}`);
  for (const item of allActions().filter((entry) => entry.clientVisible && entry.requiresPost && !entry.requiresChannel)) errors.push(`post_without_channel:${item.id}`);
  if (clientActions('buttons').some((item) => /удалить/i.test(item.title))) errors.push('delete_button_visible_in_buttons_root');
  if (clientActions('ad_links').some((item) => /отключить/i.test(item.title))) errors.push('disable_ad_link_visible_in_ad_links_root');
  if (clientActions('polls').some((item) => /остановить/i.test(item.title))) errors.push('stop_poll_visible_in_polls_root');
  if (clientActions('ad_links').some((item) => /статист|источники/i.test(item.title))) errors.push('stats_visible_in_ad_links_root');
  return { ok: errors.length === 0, version: VERSION, sourceMarker: SOURCE, clientSections: clientSections.length, visibleActions: clientSections.reduce((sum, section) => sum + clientActions(section.id).length, 0), errors };
}

module.exports = { VERSION, SOURCE, sections, clientSections, hidden, hiddenFromClient, sectionById, routeToSectionId, clientActions, allActions, visibleLabels, resolveSectionByRoute, validate };
