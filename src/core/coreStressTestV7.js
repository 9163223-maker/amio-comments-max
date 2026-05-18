'use strict';

const base = require('./coreStressTestV6');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const postRegistry = require('./postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.42.3-MODERATION-SCOPE-POST-PICKER';
const STRESS_ADMIN_ID = 'core-stress-admin';
const MOD_CHANNEL_ID = 'core-stress-moderation-channel';
const MOD_POST_ID = 'core-stress-moderation-post';
const MOD_COMMENT_KEY = 'core-stress-moderation-comment-key';
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
    updateType: 'stress_test_moderation_1423',
    payload
  };
}
function buttonsOf(screen = {}) { try { return (((screen.attachments || [])[0] || {}).payload || {}).buttons || []; } catch { return []; } }
function flatButtons(screen = {}) { return buttonsOf(screen).flat().filter(Boolean); }
function payloadOf(button = {}) { try { return JSON.parse(button.payload || '{}'); } catch { return {}; } }
function routeOf(button = {}) { return String(payloadOf(button).r || '').trim(); }
function buttonTexts(screen = {}) { return flatButtons(screen).map((b) => clean(b.text)); }
function routeButtons(screen = {}, route = '') { return flatButtons(screen).filter((b) => routeOf(b) === route); }
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
function assertNoText(screen = {}, pattern, name = '') {
  const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
  if (re.test(String(screen.text || ''))) throw new Error(name + ': forbidden text found: ' + re + ': ' + cut(screen.text));
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
function assertHumanScope(screen = {}, name = '') {
  assertNoText(screen, /core-stress|channelId|postId|-?\d{8,}|[a-f0-9]{16,}/i, name + '.no_raw_ids');
  assertText(screen, /Область:/i, name + '.scope_visible');
}
function humanLabelFromButton(button = {}) { return clean(button.text || '').replace(/^\d+\.\s*/, '').trim(); }
function assertHumanPostPicker(screen = {}, name = '') {
  assertNoText(screen, /core-stress|channelId|postId|-?\d{8,}|[a-f0-9]{16,}/i, name + '.no_raw_ids');
  assertText(screen, /Выберите пост|правила модерации/i, name + '.picker_text');
  const buttons = routeButtons(screen, 'moderation.scope');
  if (!buttons.length) throw new Error(name + ': no post buttons leading to moderation.scope');
  const labels = buttons.map(humanLabelFromButton).filter(Boolean);
  const raw = labels.filter((x) => RAW_ID_RE.test(x));
  if (raw.length) throw new Error(name + ': raw ids in post labels: ' + raw.join(' | '));
  if (!labels.some((x) => /Тест модерации|стоп-слова|ссылки|фото/i.test(x))) throw new Error(name + ': seeded human post label not visible: ' + labels.join(' | '));
  const payload = payloadOf(buttons[0]);
  if (payload.r !== 'moderation.scope' || payload.scopeType !== 'post') throw new Error(name + ': post button must select post scope');
  if (!clean(payload.postTitle) || /Пост без текста|выбранный пост/i.test(clean(payload.postTitle))) throw new Error(name + ': post payload title is generic');
  return { labels: labels.slice(0, 5), payloadTitle: payload.postTitle };
}
async function seedModerationPost() {
  const channelTitle = 'Подключённый канал';
  const postTitle = 'Тест модерации: стоп-слова, ссылки и фото';
  const result = await postRegistry.upsertPost({
    adminId: STRESS_ADMIN_ID,
    admin_id: STRESS_ADMIN_ID,
    channelId: MOD_CHANNEL_ID,
    channelTitle
  }, {
    channelId: MOD_CHANNEL_ID,
    channelTitle,
    postId: MOD_POST_ID,
    commentKey: MOD_COMMENT_KEY,
    postTitle,
    postPreview: postTitle,
    source: 'stress_test',
    meta: { stressTest: true, runtimeVersion: RUNTIME, purpose: 'moderation_scope_post_picker' }
  });
  const post = result.post || {};
  return {
    channelId: post.channelId || MOD_CHANNEL_ID,
    channelTitle: post.channelTitle || channelTitle,
    postId: post.postId || MOD_POST_ID,
    postTitle: post.postTitle || postTitle
  };
}

async function runModerationScenario() {
  const section = sectionRegistry.find('moderation');
  if (!section) throw new Error('moderation section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('moderation selfTest failed');
  if (self.finalStepsDocumented !== true) throw new Error('moderation final steps are not documented');
  if (self.destructiveActionsOneTapDisabled !== true) throw new Error('moderation dangerous actions guard missing');
  if (self.scopeSelectionReady !== true || self.rulesCanApplyToWholeChannel !== true || self.rulesCanApplyToSinglePost !== true) throw new Error('moderation scope channel/post support missing');
  if (self.scopePostSelectReady !== true) throw new Error('moderation post picker route missing');

  const seeded = await seedModerationPost();
  const basePayload = seeded;
  const channelScope = { ...basePayload, postId: '', postTitle: '', scopeType: 'channel' };
  const postScope = { ...basePayload, scopeType: 'post' };

  const main = await dispatchShape('main.home', {}, true);
  assertRoute(main.screen, 'moderation.home', 'moderation.main_route');
  assertButtonText(main.screen, /Модерация/i, 'moderation.main_button_text');

  const home = await dispatchShape('moderation.home', {}, true);
  ['moderation.scope', 'moderation.queue', 'moderation.rules', 'moderation.users', 'moderation.logs', 'moderation.settings'].forEach((route) => assertRoute(home.screen, route, 'moderation.home'));
  assertText(home.screen, /Область действия правил|Дерево функций|Очередь комментариев|Правила автофильтра/i, 'moderation.home_tree');

  const scopeStart = await dispatchShape('moderation.scope', {}, true);
  assertText(scopeStart.screen, /Весь канал|Выбрать один пост|область ещё не выбрана/i, 'moderation.scope_start');
  assertRoute(scopeStart.screen, 'moderation.scope_post_select', 'moderation.scope_post_picker_button');
  assertRoute(scopeStart.screen, 'moderation.rules', 'moderation.scope_to_rules');

  const postPicker = await dispatchShape('moderation.scope_post_select', channelScope, true);
  const picker = assertHumanPostPicker(postPicker.screen, 'moderation.scope_post_select');

  const scopeChannel = await dispatchShape('moderation.scope', channelScope, true);
  assertHumanScope(scopeChannel.screen, 'moderation.scope_channel');
  assertText(scopeChannel.screen, /Сейчас выбрано: весь канал|всем новым комментариям/i, 'moderation.scope_channel_text');
  assertText(scopeChannel.screen, /Подключённый канал/i, 'moderation.scope_channel_title');
  assertNoText(scopeChannel.screen, /Тест модерации: стоп-слова, ссылки и фото/i, 'moderation.scope_channel_no_post_title');

  const scopePost = await dispatchShape('moderation.scope', postScope, true);
  assertHumanScope(scopePost.screen, 'moderation.scope_post');
  assertText(scopePost.screen, /Сейчас выбрано: один пост|только к комментариям под выбранным постом/i, 'moderation.scope_post_text');
  assertText(scopePost.screen, /Тест модерации: стоп-слова, ссылки и фото/i, 'moderation.scope_post_title');

  const queue = await dispatchShape('moderation.queue', postScope, true);
  assertHumanScope(queue.screen, 'moderation.queue_scope');
  assertText(queue.screen, /оставить, скрыть, удалить, восстановить|Очередь комментариев/i, 'moderation.queue_final');
  assertRoute(queue.screen, 'moderation.scope', 'moderation.queue_scope_button');
  assertRoute(queue.screen, 'moderation.home', 'moderation.queue_back');

  const rulesChannel = await dispatchShape('moderation.rules', channelScope, true);
  assertHumanScope(rulesChannel.screen, 'moderation.rules_channel_scope');
  assertText(rulesChannel.screen, /Область: весь канал|всех постов канала|Правила автофильтра/i, 'moderation.rules_channel_area');
  assertText(rulesChannel.screen, /Пост: не нужен/i, 'moderation.rules_channel_no_post_required');

  const rulesPost = await dispatchShape('moderation.rules', postScope, true);
  ['moderation.scope', 'moderation.keywords', 'moderation.links', 'moderation.media', 'moderation.settings'].forEach((route) => assertRoute(rulesPost.screen, route, 'moderation.rules_post'));
  assertHumanScope(rulesPost.screen, 'moderation.rules_post_scope');
  assertText(rulesPost.screen, /Область: один пост|Тест модерации: стоп-слова, ссылки и фото/i, 'moderation.rules_post_area');
  assertText(rulesPost.screen, /стоп-слова|ссылки|фото|повторяющиеся комментарии/i, 'moderation.rules_groups');

  const keywords = await dispatchShape('moderation.keywords', postScope, true);
  assertHumanScope(keywords.screen, 'moderation.keywords_scope');
  assertText(keywords.screen, /скрыть сразу|отправить на проверку|подсветить/i, 'moderation.keywords_actions');
  assertRoute(keywords.screen, 'moderation.scope', 'moderation.keywords_scope_button');
  assertRoute(keywords.screen, 'moderation.rules', 'moderation.keywords_back');

  const links = await dispatchShape('moderation.links', channelScope, true);
  assertHumanScope(links.screen, 'moderation.links_scope');
  assertText(links.screen, /разрешённые домены|неизвестных ссылок|проверку/i, 'moderation.links_actions');
  assertRoute(links.screen, 'moderation.scope', 'moderation.links_scope_button');
  assertRoute(links.screen, 'moderation.rules', 'moderation.links_back');

  const media = await dispatchShape('moderation.media', postScope, true);
  assertHumanScope(media.screen, 'moderation.media_scope');
  assertText(media.screen, /только фото|Видео и файлы не добавляем|первое фото/i, 'moderation.media_photo_only');
  assertRoute(media.screen, 'moderation.scope', 'moderation.media_scope_button');
  assertRoute(media.screen, 'moderation.rules', 'moderation.media_back');

  const users = await dispatchShape('moderation.users', channelScope, true);
  assertHumanScope(users.screen, 'moderation.users_scope');
  assertText(users.screen, /участников|администраторов|нарушителей/i, 'moderation.users_lists');
  assertRoute(users.screen, 'moderation.rights', 'moderation.users_rights');

  const rights = await dispatchShape('moderation.rights', channelScope, true);
  assertHumanScope(rights.screen, 'moderation.rights_scope');
  assertText(rights.screen, /читать сообщения|видеть участников|управлять участниками|права/i, 'moderation.rights_checks');
  assertRoute(rights.screen, 'moderation.users', 'moderation.rights_back');

  const actions = await dispatchShape('moderation.actions', postScope, true);
  assertHumanScope(actions.screen, 'moderation.actions_scope');
  assertText(actions.screen, /опасное действие|причину и подтверждение|удалить/i, 'moderation.actions_confirm');
  assertOneTapDangerDisabled(actions.screen, 'moderation.actions');
  assertRoute(actions.screen, 'moderation.queue', 'moderation.actions_queue');

  const logs = await dispatchShape('moderation.logs', postScope, true);
  assertHumanScope(logs.screen, 'moderation.logs_scope');
  assertText(logs.screen, /Журнал|восстановить|историю решений/i, 'moderation.logs_history');
  assertRoute(logs.screen, 'moderation.home', 'moderation.logs_back');

  const settings = await dispatchShape('moderation.settings', channelScope, true);
  assertHumanScope(settings.screen, 'moderation.settings_scope');
  assertText(settings.screen, /Ручной режим|Полуавтоматический|Автоматический/i, 'moderation.settings_modes');
  assertRoute(settings.screen, 'moderation.scope', 'moderation.settings_scope_button');
  assertRoute(settings.screen, 'moderation.rules', 'moderation.settings_back');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routes: Object.keys(self.routes || {}).length,
    seeded,
    picker,
    main: main.shape,
    home: home.shape,
    scopeStart: scopeStart.shape,
    postPicker: postPicker.shape,
    scopeChannel: scopeChannel.shape,
    scopePost: scopePost.shape,
    queue: queue.shape,
    rulesChannel: rulesChannel.shape,
    rulesPost: rulesPost.shape,
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
      'scope_selection_screen',
      'scope_post_picker_human_labels',
      'scope_post_picker_payload_selects_post_scope',
      'scope_whole_channel_rules',
      'scope_single_post_rules',
      'channel_scope_does_not_require_post',
      'post_scope_shows_human_post_preview',
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
  tests.push(await step('scenario.moderation.scope_channel_post_picker_end_to_end', runModerationScenario));

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
    mode: 'fast_compact_scenario_1423_moderation_scope_post_picker',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesModerationFunctionTree: true,
      validatesModerationScopeSelection: true,
      validatesModerationPostPicker: true,
      validatesModerationPostPickerHumanLabels: true,
      validatesModerationPostPickerPayload: true,
      validatesModerationWholeChannelScope: true,
      validatesModerationSinglePostScope: true,
      validatesModerationHumanScopeLabels: true,
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
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.42.3: модерация проверяет область правил и выбор конкретного поста',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, picker: x.picker || undefined, seeded: x.seeded || undefined }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.42.3 проверяет обязательный выбор области модерации: весь канал или один конкретный пост.',
      'Для режима одного поста stress-test теперь проходит отдельный экран выбора поста и проверяет человекочитаемое начало поста в кнопке.',
      'Правила канала не требуют выбора поста и должны явно показывать, что работают для всех постов канала.',
      'Правила поста должны показывать человеческое начало/название поста, а не id.',
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
    moderationScopeSelectionReady: true,
    moderationPostPickerReady: true,
    moderationPostPickerHumanLabelsReady: true,
    moderationScopeSelectionPayloadReady: true,
    moderationWholeChannelScopeReady: true,
    moderationSinglePostScopeReady: true,
    moderationHumanScopeLabelsReady: true,
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
