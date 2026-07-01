'use strict';

const menu = require('../features/menu-v3/adapter');
const canonical = require('../features/menu-v3/canonical-menu');
const contracts = require('./productFlowContractService');
const tenantBinding = require('./tenantChannelBindingService');
const runtimeExport = require('./runtimeExportService');

const RUNTIME = 'PR264-MAXIMAL-FLOW-MATRIX-1.0';
const DEFAULT_PATH = 'runtime/maximal-flow-matrix.json';
const SAFE_CHANNEL = { channelId: 'mx-ch-1', title: 'MAX Канал 1', channelTitle: 'MAX Канал 1', type: 'channel', isChannel: true, ownerUserId: 'mx-user-1', linkedByUserId: 'mx-user-1' };
const SAFE_CHANNEL_2 = { ...SAFE_CHANNEL, channelId: 'mx-ch-2', title: 'MAX Канал 2', channelTitle: 'MAX Канал 2' };
const SAFE_POST = { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, postId: 'mx-post-1', commentKey: `${SAFE_CHANNEL.channelId}:mx-post-1`, title: 'MAX Пост 1', originalText: 'MAX Пост 1' };
const TECHNICAL_RE = /\b(?:postId|channelId|commentKey|payload|token|undefined|null|debug|production checklist|trace)\b/i;
const CHAT_RE = /(?:Все свои MAX|Саша - сын Мамочки|chat-|grp-|private-|dialog-|supergroup|чат|группа)/i;

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function short(value, max = 180) { return clean(value).slice(0, max); }
function buttons(screen) { return (screen && screen.attachments && screen.attachments[0] && screen.attachments[0].payload && screen.attachments[0].payload.buttons || []).flat().filter(Boolean); }
function labels(screen) { return buttons(screen).map((button) => clean(button.text)).filter(Boolean); }
function payloads(screen) { return buttons(screen).map((button) => clean(button.payload)).filter(Boolean); }
function safeParse(payload) { try { return JSON.parse(payload); } catch (error) { return null; } }
function signature(screen) { return `${short(screen && screen.text, 120)}::${labels(screen).join('|')}`; }
function violation(severity, area, scenario, reason, expected, actual, extra = {}) { return { severity, area, scenario, reason, expected, actual, ...extra }; }
function renderRoute(route, context = {}) { try { return { ok: true, screen: menu.render(route, context) }; } catch (error) { return { ok: false, error: clean(error && error.message || error) }; } }
function selectedPayload() { return { payload: { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, postId: SAFE_POST.postId, postTitle: SAFE_POST.title, commentKey: SAFE_POST.commentKey }, dataContext: { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, posts: [SAFE_POST] } }; }
function isChannelPostTarget(section, route, scenario) { return contracts.POST_SCOPED.includes(section) || section === 'channels' || /choose_channel|choose_post|:post|channels:list/.test(clean(route)) || scenario === 'dangerous_chat_records'; }
function scenarioContext(scenario) {
  if (scenario === 'zero_channels') return { channels: [], dataContext: { channels: [], posts: [] } };
  if (scenario === 'one_channel') return { channels: [SAFE_CHANNEL], dataContext: { channels: [SAFE_CHANNEL], posts: [SAFE_POST] } };
  if (scenario === 'multiple_channels') return { channels: [SAFE_CHANNEL, SAFE_CHANNEL_2], dataContext: { channels: [SAFE_CHANNEL, SAFE_CHANNEL_2], posts: [SAFE_POST] } };
  if (scenario === 'zero_posts') return { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, channels: [SAFE_CHANNEL], posts: [], dataContext: { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, posts: [] } };
  if (scenario === 'selected_post') return selectedPayload();
  if (scenario === 'dangerous_chat_records') return { channels: [SAFE_CHANNEL, { channelId: 'chat-1', chatId: 'chat-1', title: 'Все свои MAX', type: 'chat' }, { channelId: 'grp-1', title: 'Саша - сын Мамочки 🌸', chatType: 'group' }], dataContext: { channels: [SAFE_CHANNEL] } };
  if (scenario === 'malformed_payload') return { payload: '{bad-json', dataContext: {} };
  if (scenario === 'missing_payload') return { dataContext: {} };
  if (scenario === 'missing_required_id') return { payload: { channelId: SAFE_CHANNEL.channelId }, dataContext: {} };
  if (scenario === 'post_from_other_channel') return { payload: { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, postId: 'foreign-post', postTitle: 'Foreign post', commentKey: `${SAFE_CHANNEL_2.channelId}:foreign-post` }, dataContext: { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, posts: [SAFE_POST] } };
  if (scenario === 'stale_or_deleted_post') return { payload: { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, postId: 'deleted-post', postTitle: 'Deleted post', commentKey: `${SAFE_CHANNEL.channelId}:deleted-post` }, dataContext: { channelId: SAFE_CHANNEL.channelId, channelTitle: SAFE_CHANNEL.title, posts: [] } };
  return {};
}
function checkScreen({ route, section, scenario, result, violations, warnings }) {
  if (!result.ok) { violations.push(violation('block', section, scenario, 'route_throw', 'safe rendered screen', result.error, { route })); return { route, scenario, ok: false, error: result.error }; }
  const screen = result.screen || {}; const text = clean(screen.text); const screenLabels = labels(screen); const screenPayloads = payloads(screen); const combined = `${text}\n${screenLabels.join('\n')}\n${screenPayloads.join('\n')}`;
  if (!text) violations.push(violation('block', section, scenario, 'empty_screen_text', 'visible text', '', { route }));
  if (!screenLabels.length) warnings.push(violation('warn', section, scenario, 'screen_without_buttons', 'navigation/action buttons where useful', '', { route }));
  buttons(screen).forEach((button, index) => { if (!clean(button.text)) violations.push(violation('block', section, scenario, 'empty_button_label', 'non-empty label', `index:${index}`, { route })); });
  screenPayloads.forEach((payload) => { const parsed = safeParse(payload); if (!parsed) violations.push(violation('block', section, scenario, 'unparseable_callback_payload', 'JSON callback payload', short(payload), { route })); else if (!parsed.route && !parsed.action && !parsed.canonicalAction) warnings.push(violation('warn', section, scenario, 'payload_without_route_or_action', 'route/action/canonicalAction', short(payload), { route })); });
  if (TECHNICAL_RE.test(`${text}\n${screenLabels.join('\n')}`)) violations.push(violation('block', section, scenario, 'technical_identifier_visible', 'no technical identifiers visible', short(text || screenLabels.join(' | ')), { route }));
  if (isChannelPostTarget(section, route, scenario) && CHAT_RE.test(combined)) violations.push(violation('block', section, scenario, 'chat_like_record_leak', 'no chat/group/private records in channel/post flows', short(combined), { route }));
  return { route, scenario, ok: true, text: short(text, 220), labels: screenLabels, payloads: screenPayloads, signature: signature(screen) };
}
function addRootAssertions(sectionId, screenLabels, violations) {
  const has = (label) => screenLabels.includes(label); const none = (labelsToHide) => labelsToHide.filter(has);
  if (sectionId === 'gifts') { if (!has('Выбрать пост') || !has('Все подарки')) violations.push(violation('block', sectionId, 'root_contract', 'gifts_root_missing_context_gate', 'Выбрать пост + Все подарки', screenLabels.join(' | '))); const bad = none(['Создать подарок', 'Текущий подарок', 'Список подарков']); if (bad.length) violations.push(violation('block', sectionId, 'root_contract', 'gifts_context_action_visible_at_root', 'hidden until context', bad.join(' | '))); }
  if (sectionId === 'buttons') { if (!has('Выбрать пост')) violations.push(violation('block', sectionId, 'root_contract', 'buttons_root_missing_post_gate', 'Выбрать пост', screenLabels.join(' | '))); const bad = none(['Добавить кнопку', 'Текущие кнопки']); if (bad.length) violations.push(violation('block', sectionId, 'root_contract', 'buttons_post_action_visible_at_root', 'hidden until selected post', bad.join(' | '))); }
  if (sectionId === 'polls') { if (!has('Выбрать пост') || !has('Результаты опросов')) violations.push(violation('block', sectionId, 'root_contract', 'polls_root_missing_expected_actions', 'Выбрать пост + Результаты опросов', screenLabels.join(' | '))); const bad = none(['Создать опрос']); if (bad.length) violations.push(violation('block', sectionId, 'root_contract', 'polls_create_visible_at_root', 'hidden until selected post', bad.join(' | '))); }
  if (sectionId === 'highlights') { if (!has('Выбрать пост')) violations.push(violation('block', sectionId, 'root_contract', 'highlights_root_missing_post_gate', 'Выбрать пост', screenLabels.join(' | '))); const bad = none(['Поставить метку', 'Снять метку']); if (bad.length) violations.push(violation('block', sectionId, 'root_contract', 'highlights_entity_action_visible_at_root', 'hidden until selected post', bad.join(' | '))); }
}
function manualChecklist() {
  return [
    { id: 'M01', section: 'main', title: 'Главное меню открывает все 13 клиентских разделов', steps: ['Открыть /start или Главное меню', 'Проверить кнопки разделов'], expected: ['13 разделов без debug/service пунктов'] },
    { id: 'M02', section: 'gifts', title: 'Подарки: root без бессмысленных действий', steps: ['Главное меню → Подарки / лид-магниты'], expected: ['Выбрать пост', 'Все подарки', 'Помощь', 'Главное меню', 'нет Создать/Текущий/Список подарков'] },
    { id: 'M03', section: 'gifts', title: 'Подарки: выбор поста с tenant-bound каналом', steps: ['Подарки → Выбрать пост', 'Выбрать канал', 'Выбрать пост'], expected: ['каналы пользователя видны', 'посты только выбранного канала', 'Создать подарок появляется только после поста'] },
    { id: 'M04', section: 'gifts', title: 'Подарки: Все подарки имеет account-scope', steps: ['Подарки → Все подарки'], expected: ['текст Все подарки в аккаунте или явный account scope', 'есть возврат к выбору поста/главному меню'] },
    { id: 'M05', section: 'buttons', title: 'Кнопки: root является gate выбора поста', steps: ['Главное меню → Кнопки под постами'], expected: ['видно Выбрать пост', 'нет Добавить кнопку/Текущие кнопки без выбранного поста'] },
    { id: 'M06', section: 'buttons', title: 'Кнопки: selected post wizard', steps: ['Кнопки → Выбрать пост → канал → пост'], expected: ['экран выбранного поста', 'действия добавления/просмотра кнопок только в контексте поста'] },
    { id: 'M07', section: 'polls', title: 'Опросы: root и результаты', steps: ['Главное меню → Опросы / голосования', 'Нажать Результаты опросов'], expected: ['root: Выбрать пост + Результаты опросов', 'нет Создать опрос без поста'] },
    { id: 'M08', section: 'highlights', title: 'Выделение: root gate', steps: ['Главное меню → Выделение постов'], expected: ['видно Выбрать пост', 'нет Поставить/Снять метку без поста'] },
    { id: 'M09', section: 'editor', title: 'Редактор: выбор поста перед редактированием', steps: ['Главное меню → Редактор постов', 'Выбрать пост'], expected: ['редактирование доступно только после выбранного поста'] },
    { id: 'M10', section: 'channels', title: 'Каналы: мои каналы не показывают чаты', steps: ['Главное меню → Каналы → Мои каналы'], expected: ['видны только реальные каналы', 'чаты/личные диалоги отсутствуют'] },
    { id: 'M11', section: 'tenant', title: 'Tenant binding: каналы пользователя видны в picker', steps: ['Любой post-scoped раздел → Выбрать пост'], expected: ['канал пользователя есть в списке', 'если нет — проверить tenant-channel-binding-matrix по live maxUserId'] },
    { id: 'M12', section: 'navigation', title: 'Навигация не множит меню', steps: ['Открыть 3 разных раздела подряд', 'Вернуться в Главное меню', 'Повторно открыть тот же раздел'], expected: ['нет legacy/stale screens', 'нет дублирования obsolete меню'] }
  ];
}
async function buildMatrix() {
  const violations = []; const warnings = []; const routes = []; const sections = []; const rootSectionIds = ['main', ...canonical.clientSections.map((section) => section.id)];
  for (const sectionId of rootSectionIds) {
    const route = sectionId === 'main' ? 'main:home' : canonical.sectionById[sectionId] && canonical.sectionById[sectionId].route;
    const first = checkScreen({ route, section: sectionId, scenario: 'root_open', result: renderRoute(route, {}), violations, warnings });
    const second = checkScreen({ route, section: sectionId, scenario: 'repeated_open_same_section', result: renderRoute(route, {}), violations, warnings });
    if (first.ok && second.ok && first.signature !== second.signature) warnings.push(violation('warn', sectionId, 'repeated_open_same_section', 'root_signature_changed_on_repeat', 'stable repeated open', `${first.signature} -> ${second.signature}`, { route }));
    addRootAssertions(sectionId, first.labels || [], violations);
    routes.push(first, second); sections.push({ section: sectionId, rootRoute: route, rootLabels: first.labels || [], rootOk: first.ok === true });
  }
  for (const sectionId of contracts.POST_SCOPED) {
    for (const check of [['zero_channels', `${sectionId}:choose_channel`], ['one_channel', `${sectionId}:choose_channel`], ['multiple_channels', `${sectionId}:choose_channel`], ['dangerous_chat_records', `${sectionId}:choose_channel`], ['zero_posts', `${sectionId}:choose_post`], ['selected_post', `${sectionId}:post`], ['malformed_payload', `${sectionId}:post`], ['missing_payload', `${sectionId}:post`], ['missing_required_id', `${sectionId}:post`], ['post_from_other_channel', `${sectionId}:post`], ['stale_or_deleted_post', `${sectionId}:post`]]) {
      routes.push(checkScreen({ route: check[1], section: sectionId, scenario: check[0], result: renderRoute(check[1], scenarioContext(check[0])), violations, warnings }));
    }
  }
  const tenant = await tenantBinding.buildTenantChannelBindingMatrix();
  if (tenant && tenant.ok !== true) warnings.push(violation('warn', 'tenant', 'runtime_tenant_matrix', 'embedded_tenant_matrix_not_ok', 'tenant matrix ok true when data is clean', tenant.summary || tenant));
  const coverage = { rootSections: rootSectionIds.length, postScopedSections: contracts.POST_SCOPED.length, renderedRoutes: routes.filter((r) => r && r.ok).length, scenarios: Array.from(new Set(routes.map((r) => r.scenario).filter(Boolean))).sort(), manualChecklistCount: manualChecklist().length };
  const blockCount = violations.filter((v) => v.severity === 'block').length;
  return { ok: blockCount === 0, generatedAt: new Date().toISOString(), runtime: RUNTIME, sections, routes, tenantBinding: tenant, manualChecklist: manualChecklist(), coverage, violations, warnings, summary: { blockCount, warnCount: warnings.length, sectionCount: sections.length, routeCount: routes.length, postScopedSectionCount: contracts.POST_SCOPED.length, scenarioCount: coverage.scenarios.length, manualChecklistCount: manualChecklist().length } };
}
async function exportMatrix() { return runtimeExport.exportJson({ path: DEFAULT_PATH, payload: () => buildMatrix(), message: 'maximal flow matrix' }); }

module.exports = { RUNTIME, DEFAULT_PATH, buildMatrix, exportMatrix, manualChecklist, scenarioContext };