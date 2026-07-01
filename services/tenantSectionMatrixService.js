'use strict';

const menu = require('../features/menu-v3/adapter');
const canonical = require('../features/menu-v3/canonical-menu');
const contracts = require('./productFlowContractService');
const tenantBinding = require('./tenantChannelBindingService');
const liveTenant = require('./liveTenantSelfDiagnosticService');
const picker = require('../channel-post-picker-core');
const runtimeExport = require('./runtimeExportService');

const RUNTIME = 'PR267-TENANT-SECTION-MATRIX-1.0';
const DEFAULT_PATH = 'runtime/tenant-section-matrix.json';
const CHAT_RE = /(?:chat-|grp-|private-|dialog-|supergroup|семейный чат|group chat|private chat|Все свои MAX|Саша - сын Мамочки)/i;
const TECH_RE = /\b(?:postId|channelId|commentKey|payload|token|trace|debug|null|undefined)\b/i;

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function short(value = '', max = 160) { const text = clean(value); return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trim()}…`; }
function buttons(screen = {}) { return (screen.attachments?.[0]?.payload?.buttons || []).flat().filter(Boolean); }
function labels(screen = {}) { return buttons(screen).map((button) => clean(button.text)).filter(Boolean); }
function payloads(screen = {}) { return buttons(screen).map((button) => clean(button.payload)).filter(Boolean); }
function visibleText(screen = {}) { return `${clean(screen.text)}\n${labels(screen).join('\n')}\n${payloads(screen).join('\n')}`; }
function titleOf(channel = {}, index = 0) { return clean(channel.title || channel.channelTitle || channel.name || channel.channelName || `Канал ${index + 1}`); }
function postTitleOf(post = {}, index = 0) { return clean(post.title || post.preview || post.originalText || `${index + 1}. Пост`); }
function violation(severity, userId, section, scenario, reason, expected, actual, extra = {}) { return { severity, userId, section, scenario, reason, expected, actual: short(actual), ...extra }; }
function render(route, context = {}) { try { return { ok: true, screen: menu.render(route, context) }; } catch (error) { return { ok: false, error: clean(error && error.message || error) }; } }
function enrichChannel(userId = '', channel = {}) { return { ...channel, channelId: clean(channel.channelId || channel.id || channel.chatId), title: titleOf(channel), channelTitle: titleOf(channel), type: 'channel', isChannel: true, ownerUserId: clean(channel.ownerUserId || userId), linkedByUserId: clean(channel.linkedByUserId || userId) }; }
function scenarioContext(userId = '', channels = [], posts = [], channel = null) {
  const first = channel || channels[0] || {};
  return { maxUserId: userId, userId, channels, posts, channelId: clean(first.channelId), channelTitle: titleOf(first), dataContext: { channels, posts, channelId: clean(first.channelId), channelTitle: titleOf(first) } };
}
function selectedContext(userId = '', channel = {}, post = {}) {
  const title = postTitleOf(post);
  return { maxUserId: userId, userId, payload: { channelId: clean(channel.channelId), channelTitle: titleOf(channel), postId: clean(post.postId), postTitle: title, commentKey: clean(post.commentKey), section: '', step: 'action' }, dataContext: { channelId: clean(channel.channelId), channelTitle: titleOf(channel), posts: [post] } };
}
function checkRendered({ userId, section, scenario, route, result, ownTitles = [], foreignTitles = [], violations, warnings, requireOwn = false, forbidTechIds = true, guardChatLeaks = false }) {
  if (!result.ok) { violations.push(violation('block', userId, section, scenario, 'route_throw', 'safe rendered screen', result.error, { route })); return { section, route, scenario, ok: false, error: result.error }; }
  const screen = result.screen || {};
  const combined = visibleText(screen);
  const screenLabels = labels(screen);
  if (!clean(screen.text)) violations.push(violation('block', userId, section, scenario, 'empty_screen_text', 'visible screen text', '', { route }));
  if (guardChatLeaks && CHAT_RE.test(combined)) violations.push(violation('block', userId, section, scenario, 'chat_like_record_visible', 'no chat/group/private records', combined, { route }));
  for (const title of foreignTitles.filter(Boolean)) {
    if (combined.includes(title)) violations.push(violation('block', userId, section, scenario, 'foreign_tenant_channel_visible', 'only current tenant channels', title, { route }));
  }
  if (requireOwn && ownTitles.length && !ownTitles.some((title) => combined.includes(title))) {
    violations.push(violation('block', userId, section, scenario, 'own_tenant_channel_missing', 'current tenant channel visible', ownTitles.join(' | '), { route }));
  }
  if (forbidTechIds && TECH_RE.test(`${clean(screen.text)}\n${screenLabels.join('\n')}`)) {
    violations.push(violation('block', userId, section, scenario, 'technical_identifier_visible', 'no technical identifiers in visible text/buttons', `${clean(screen.text)} | ${screenLabels.join(' | ')}`, { route }));
  }
  if (!screenLabels.length) warnings.push(violation('warn', userId, section, scenario, 'screen_without_buttons', 'navigation/action buttons where useful', '', { route }));
  return { section, route, scenario, ok: true, text: short(screen.text, 220), labels: screenLabels };
}
function manualAlgorithms() {
  return [
    {
      id: 'A1',
      title: 'Tenant diagnostic first, then all post-scoped sections',
      steps: ['В личном чате отправить /tenant или открыть Личный кабинет → Диагностика привязки', 'Убедиться: Tenant найден, Каналы в picker ≥ 1, Чаты исключены', 'Главное меню → Подарки / Кнопки / Опросы / Выделение / Редактор / Комментарии', 'В каждом разделе нажать Выбрать пост и проверить список каналов'],
      expected: ['Везде виден один и тот же ваш канал', 'Не видно чатов/групп/личных диалогов', 'Не видно чужих или технических каналов']
    },
    {
      id: 'A2',
      title: 'One channel happy path: channel → post → action',
      steps: ['Открыть Подарки / лид-магниты → Выбрать пост', 'Выбрать свой канал', 'Выбрать пост', 'Повторить коротко для Кнопки под постами и Редактор постов'],
      expected: ['При одном доступном tenant-канале не должно появляться чужих каналов', 'После выбора канала экран пишет Канал: <название>', 'После выбора поста появляются действия только выбранного раздела']
    },
    {
      id: 'A3',
      title: 'Account and Channels cross-check',
      steps: ['Главное меню → Каналы → Мои каналы', 'Проверить, что список совпадает с /tenant picker count/title', 'Главное меню → Личный кабинет → Мои каналы', 'Вернуться и открыть Статистика / Архив / Настройки для проверки навигации'],
      expected: ['Каналы и Личный кабинет показывают tenant-scoped каналы', 'Диагностика привязки доступна в Личном кабинете', 'Непостовые разделы открываются без tenant leakage и без debug/trace текста']
    }
  ];
}
async function usersFromRuntime() {
  const tenant = await tenantBinding.buildTenantChannelBindingMatrix();
  return Array.from(new Set((tenant.checkedUsers || []).map(clean).filter(Boolean)));
}
async function buildUserRow(userId = '', allUserChannels = {}) {
  const violations = [];
  const warnings = [];
  const routes = [];
  const diagnostic = await liveTenant.buildSelfDiagnostic({ maxUserId: userId, label: 'tenant_section_matrix' });
  const tenant = await tenantBinding.buildTenantChannelBindingMatrix({ maxUserId: userId });
  const pickerChannels = (await picker.listUiChannelsForUser(userId, {})).map((channel) => enrichChannel(userId, channel));
  const ownTitles = pickerChannels.map((channel, index) => titleOf(channel, index)).filter(Boolean);
  const foreignTitles = Object.entries(allUserChannels).filter(([id]) => id !== userId).flatMap(([, items]) => items.map((channel, index) => titleOf(channel, index))).filter(Boolean);
  const firstChannel = pickerChannels[0] || null;
  const ownPosts = firstChannel ? picker.listUiPostsForChannel(userId, firstChannel.channelId) : [];
  const context = scenarioContext(userId, pickerChannels, ownPosts, firstChannel);

  if (!diagnostic.ok) violations.push(violation('block', userId, 'tenant', 'self_diagnostic', 'live_tenant_self_diagnostic_not_ok', 'diagnostic ok true', diagnostic.verdict || diagnostic.violations?.map((v) => v.code).join(',')));
  if (!diagnostic.summary?.knownTenant) violations.push(violation('block', userId, 'tenant', 'self_diagnostic', 'tenant_missing', 'known tenant for current user', diagnostic.verdict || 'missing'));
  if (!pickerChannels.length) violations.push(violation('block', userId, 'tenant', 'picker', 'zero_picker_channels', 'at least one tenant channel', '0'));

  for (const section of canonical.clientSections) {
    const route = section.route;
    const result = checkRendered({ userId, section: section.id, scenario: 'root_open', route, result: render(route, { maxUserId: userId, userId }), ownTitles, foreignTitles, violations, warnings, forbidTechIds: section.id !== 'privacy' });
    routes.push(result);
  }
  routes.push(checkRendered({ userId, section: 'main', scenario: 'root_open', route: 'main:home', result: render('main:home', { maxUserId: userId, userId }), ownTitles, foreignTitles, violations, warnings }));
  routes.push(checkRendered({ userId, section: 'channels', scenario: 'my_channels', route: 'channels:list', result: render('channels:list', context), ownTitles, foreignTitles, violations, warnings, requireOwn: pickerChannels.length > 0, guardChatLeaks: true }));
  routes.push(checkRendered({ userId, section: 'account', scenario: 'account_home', route: 'account:home', result: render('account:home', { maxUserId: userId, userId }), ownTitles, foreignTitles, violations, warnings }));

  for (const sectionId of contracts.POST_SCOPED) {
    routes.push(checkRendered({ userId, section: sectionId, scenario: 'choose_channel', route: `${sectionId}:choose_channel`, result: render(`${sectionId}:choose_channel`, context), ownTitles, foreignTitles, violations, warnings, requireOwn: pickerChannels.length > 0, guardChatLeaks: true }));
    routes.push(checkRendered({ userId, section: sectionId, scenario: 'choose_post', route: `${sectionId}:choose_post`, result: render(`${sectionId}:choose_post`, context), ownTitles, foreignTitles, violations, warnings, requireOwn: pickerChannels.length > 0, guardChatLeaks: true }));
    if (firstChannel && ownPosts[0]) {
      routes.push(checkRendered({ userId, section: sectionId, scenario: 'selected_post', route: `${sectionId}:post`, result: render(`${sectionId}:post`, selectedContext(userId, firstChannel, ownPosts[0])), ownTitles, foreignTitles, violations, warnings, forbidTechIds: false, guardChatLeaks: true }));
    }
  }

  return { userId, ok: violations.filter((v) => v.severity === 'block').length === 0, diagnosticSummary: diagnostic.summary || {}, tenantSummary: tenant.summary || {}, pickerChannelsCount: pickerChannels.length, pickerChannelTitles: ownTitles, firstChannelPostsCount: ownPosts.length, routes, violations, warnings };
}
async function buildMatrix({ users = null } = {}) {
  const ids = Array.from(new Set((Array.isArray(users) && users.length ? users : await usersFromRuntime()).map(clean).filter(Boolean)));
  const allUserChannels = {};
  for (const id of ids) allUserChannels[id] = (await picker.listUiChannelsForUser(id, {})).map((channel) => enrichChannel(id, channel));
  const rows = [];
  for (const id of ids) rows.push(await buildUserRow(id, allUserChannels));
  const violations = rows.flatMap((row) => row.violations || []);
  const warnings = rows.flatMap((row) => row.warnings || []);
  const blockCount = violations.filter((v) => v.severity === 'block').length;
  return { ok: blockCount === 0, generatedAt: new Date().toISOString(), runtime: RUNTIME, checkedUsers: ids, rows, manualAlgorithms: manualAlgorithms(), summary: { checkedUsersCount: ids.length, rootSectionsChecked: canonical.clientSections.length + 1, postScopedSectionsChecked: contracts.POST_SCOPED.length, renderedRoutes: rows.reduce((n, row) => n + (row.routes || []).length, 0), blockCount, warnCount: warnings.length }, violations, warnings };
}
async function exportMatrix() { return runtimeExport.exportJson({ path: DEFAULT_PATH, payload: () => buildMatrix(), message: 'tenant section matrix' }); }

module.exports = { RUNTIME, DEFAULT_PATH, buildMatrix, exportMatrix, manualAlgorithms };
