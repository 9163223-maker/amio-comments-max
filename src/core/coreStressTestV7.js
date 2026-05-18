'use strict';

const base = require('./coreStressTestV6');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.42.1-MODERATION-MAIN-BUTTON-CHECK';
const STRESS_ADMIN_ID = 'core-stress-admin';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 360) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) {
  return {
    adminId: STRESS_ADMIN_ID,
    admin_id: STRESS_ADMIN_ID,
    userId: STRESS_ADMIN_ID,
    route,
    planCode: 'start',
    updateType: 'stress_test_moderation_1421',
    payload
  };
}
function buttonsOf(screen = {}) { try { return (((screen.attachments || [])[0] || {}).payload || {}).buttons || []; } catch { return []; } }
function flatButtons(screen = {}) { return buttonsOf(screen).flat().filter(Boolean); }
function payloadOf(button = {}) { try { return JSON.parse(button.payload || '{}'); } catch { return {}; } }
function routeOf(button = {}) { return String(payloadOf(button).r || '').trim(); }
function buttonTexts(screen = {}) { return flatButtons(screen).map((b) => clean(b.text)); }
function findRouteButton(screen = {}, route = '') { return flatButtons(screen).find((b) => routeOf(b) === route); }
function assertScreen(screen, name, strict = true) {
  if (!screen || typeof screen.text !== 'string' || !Array.isArray(screen.attachments)) throw new Error(name + ': invalid_screen_shape');
  if (!screen.text.trim()) throw new Error(name + ': empty_text');
  if (strict && UI_ERROR_RE.test(screen.text)) throw new Error(name + ': screen_contains_error: ' + cut(screen.text));
  if (strict && TECH_RE.test(screen.text)) throw new Error(name + ': screen_contains_technical_text: ' + cut(screen.text));
  for (const b of flatButtons(screen)) {
    const text = String(b.text || '');
    if (strict && RAW_ID_RE.test(text)) throw new Error(name + ': button_contains_raw_id: ' + cut(text, 160));
  }
  return { textChars: screen.text.length, rows: buttonsOf(screen).length, buttons: flatButtons(screen).length };
}
function assertText(screen = {}, pattern, name = '') {
  const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
  if (!re.test(String(screen.text || ''))) throw new Error(name + ': expected text not found: ' + re + ': ' + cut(screen.text));
}
function assertButtonText(screen = {}, pattern, name = '') {
  const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
  const texts = buttonTexts(screen);
  if (!texts.some((text) => re.test(text))) throw new Error(name + ': expected button text not found: ' + re + ': ' + texts.join(' | '));
}
function assertRoute(screen = {}, route = '', name = '') {
  const btn = findRouteButton(screen, route);
  if (!btn) throw new Error(name + ': button route not found: ' + route + ': ' + buttonTexts(screen).join(' | '));
  return btn;
}
async function step(name, fn) {
  const t = now();
  try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; }
  catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 620), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 620) }; }
}
async function dispatchShape(route, payload = {}, strict = true) {
  const screen = await routeDispatcher.dispatch(ctx(route, payload));
  return { screen, shape: assertScreen(screen, route, strict) };
}
function assertOneTapDangerDisabled(screen = {}, name = '') {
  const texts = buttonTexts(screen).join(' | ');
  if (/заблокировать$/i.test(texts) || /удалить$/i.test(texts)) throw new Error(name + ': destructive one-tap action visible: ' + texts);
  if (/Удалить/i.test(texts) && !/подтверж/i.test(texts)) throw new Error(name + ': delete button must mention confirmation: ' + texts);
}

async function runModerationScenario() {
  const section = sectionRegistry.find('moderation');
  if (!section) throw new Error('moderation section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('moderation selfTest failed');
  if (self.finalStepsDocumented !== true) throw new Error('moderation final steps are not documented');
  if (self.destructiveActionsOneTapDisabled !== true) throw new Error('moderation dangerous actions guard missing');

  const scopedPayload = {
    channelId: 'core-stress-channel',
    channelTitle: 'Подключённый канал',
    postId: 'core-stress-moderation-post',
    postTitle: 'Тест комментариев: текст фото ответы реакции'
  };

  const main = await dispatchShape('main.home', {}, true);
  assertRoute(main.screen, 'moderation.home', 'moderation.main_route');
  assertButtonText(main.screen, /Модерация/i, 'moderation.main_button_text');

  const home = await dispatchShape('moderation.home', {}, true);
  ['moderation.queue', 'moderation.rules', 'moderation.users', 'moderation.logs', 'moderation.settings'].forEach((route) => assertRoute(home.screen, route, 'moderation.home'));
  assertText(home.screen, /Дерево функций|Очередь комментариев|Правила автофильтра/i, 'moderation.home_tree');

  const queue = await dispatchShape('moderation.queue', scopedPayload, true);
  assertText(queue.screen, /оставить, скрыть, удалить, восстановить|Очередь комментариев/i, 'moderation.queue_final');
  assertRoute(queue.screen, 'moderation.home', 'moderation.queue_back');

  const rules = await dispatchShape('moderation.rules', scopedPayload, true);
  ['moderation.keywords', 'moderation.links', 'moderation.media', 'moderation.settings'].forEach((route) => assertRoute(rules.screen, route, 'moderation.rules'));
  assertText(rules.screen, /стоп-слова|ссылки|фото|повторяющиеся комментарии/i, 'moderation.rules_groups');

  const keywords = await dispatchShape('moderation.keywords', scopedPayload, true);
  assertText(keywords.screen, /скрыть сразу|отправить на проверку|подсветить/i, 'moderation.keywords_actions');
  assertRoute(keywords.screen, 'moderation.rules', 'moderation.keywords_back');

  const links = await dispatchShape('moderation.links', scopedPayload, true);
  assertText(links.screen, /разрешённые домены|неизвестных ссылок|проверку/i, 'moderation.links_actions');
  assertRoute(links.screen, 'moderation.rules', 'moderation.links_back');

  const media = await dispatchShape('moderation.media', scopedPayload, true);
  assertText(media.screen, /только фото|Видео и файлы не добавляем|первое фото/i, 'moderation.media_photo_only');
  assertRoute(media.screen, 'moderation.rules', 'moderation.media_back');

  const users = await dispatchShape('moderation.users', scopedPayload, true);
  assertText(users.screen, /участников|администраторов|нарушителей/i, 'moderation.users_lists');
  assertRoute(users.screen, 'moderation.rights', 'moderation.users_rights');

  const rights = await dispatchShape('moderation.rights', scopedPayload, true);
  assertText(rights.screen, /читать сообщения|видеть участников|управлять участниками|права/i, 'moderation.rights_checks');
  assertRoute(rights.screen, 'moderation.users', 'moderation.rights_back');

  const actions = await dispatchShape('moderation.actions', scopedPayload, true);
  assertText(actions.screen, /опасное действие|причину и подтверждение|удалить/i, 'moderation.actions_confirm');
  assertOneTapDangerDisabled(actions.screen, 'moderation.actions');
  assertRoute(actions.screen, 'moderation.queue', 'moderation.actions_queue');

  const logs = await dispatchShape('moderation.logs', scopedPayload, true);
  assertText(logs.screen, /Журнал|восстановить|историю решений/i, 'moderation.logs_history');
  assertRoute(logs.screen, 'moderation.home', 'moderation.logs_back');

  const settings = await dispatchShape('moderation.settings', scopedPayload, true);
  assertText(settings.screen, /Ручной режим|Полуавтоматический|Автоматический/i, 'moderation.settings_modes');
  assertRoute(settings.screen, 'moderation.rules', 'moderation.settings_back');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routes: Object.keys(self.routes || {}).length,
    main: main.shape,
    home: home.shape,
    queue: queue.shape,
    rules: rules.shape,
    keywords: keywords.shape,
    links: links.shape,
    media: media.shape,
    users: users.shape,
    rights: rights.shape,
    actions: actions.shape,
    logs: logs.shape,
    settings: settings.shape,
    checks: [
      'main_route_unlocked_on_start_plan',
      'main_menu_has_visible_moderation_button',
      'function_tree_home',
      'queue_final_decision',
      'rules_groups',
      'keywords_actions',
      'links_domain_actions',
      'photo_only_no_video_files',
      'users_and_violators',
      'bot_rights_human_check',
      'destructive_actions_need_confirmation',
      'moderation_log_restore_path',
      'manual_semi_auto_auto_modes'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.moderationSection', async () => sectionRegistry.find('moderation').selfTest()));
  tests.push(await step('scenario.moderation.function_tree_end_to_end', runModerationScenario));

  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 700));
  const baseFailed = Array.isArray(baseResult.failed) ? baseResult.failed : [];
  const baseSlow = Array.isArray(baseResult.slow) ? baseResult.slow : [];
  const failed = [...baseFailed, ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...baseSlow, ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];

  return {
    ...baseResult,
    ok: baseResult.ok === true && localFailed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1421_moderation',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesModerationFunctionTree: true,
      validatesModerationQueue: true,
      validatesModerationRules: true,
      validatesModerationStopWords: true,
      validatesModerationLinks: true,
      validatesModerationPhotoOnly: true,
      validatesModerationUsersRights: true,
      validatesModerationActionConfirmations: true,
      validatesModerationLogs: true,
      validatesModerationModes: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.42.1: кнопки, лид-магниты, единые комментарии и дерево модерации прошли сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.42.1 проверяет, что в главном меню есть видимая кнопка Модерация, а не требует слова Модерация в общем тексте главного меню.',
      'Core 1.42.x добавляет сценарный обход раздела Модерация: очередь, правила, стоп-слова, ссылки, фото, участники, права бота, действия, журнал и режимы.',
      'Опасные действия в дереве модерации проверяются как двухшаговые: удаление и блокировка не должны быть доступны одним нажатием.',
      'Видео и файлы по-прежнему не входят в комментарии; внутри модерации фото проверяются отдельно как разрешённый тип вложений.'
    ]
  };
}

async function run(options = {}) {
  if (options && (options.verbose || options.raw || options.deep)) return base.run(options);
  return runFast(options);
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    moderationScenarioReady: true,
    moderationFunctionTreeReady: true,
    moderationQueueReady: true,
    moderationRulesReady: true,
    moderationKeywordsReady: true,
    moderationLinksReady: true,
    moderationPhotoOnlyReady: true,
    moderationUsersRightsReady: true,
    moderationActionConfirmationReady: true,
    moderationLogsReady: true,
    moderationModesReady: true,
    mainMenuModerationButtonCheckReady: true,
    keepsButtonsLeadMagnetsUnifiedCommentsBase: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };