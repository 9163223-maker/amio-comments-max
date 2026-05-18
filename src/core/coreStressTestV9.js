'use strict';

const base = require('./coreStressTestV8');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const postRegistry = require('./postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.42.5-MODERATION-FULL-PATH';
const STRESS_ADMIN_ID = 'core-stress-admin';
const MOD_CHANNEL_ID = 'core-stress-moderation-channel';
const MOD_POST_ID = 'core-stress-moderation-post-full-path';
const MOD_COMMENT_KEY = 'core-stress-moderation-comment-key-full-path';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 520) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) { return { adminId: STRESS_ADMIN_ID, admin_id: STRESS_ADMIN_ID, userId: STRESS_ADMIN_ID, route, planCode: 'start', updateType: 'stress_test_moderation_1425', payload }; }
function buttonsOf(screen = {}) { try { return (((screen.attachments || [])[0] || {}).payload || {}).buttons || []; } catch { return []; } }
function flatButtons(screen = {}) { return buttonsOf(screen).flat().filter(Boolean); }
function payloadOf(button = {}) { try { return JSON.parse(button.payload || '{}'); } catch { return {}; } }
function routeOf(button = {}) { return String(payloadOf(button).r || '').trim(); }
function buttonTexts(screen = {}) { return flatButtons(screen).map((b) => clean(b.text)); }
function findRouteButton(screen = {}, route = '') { return flatButtons(screen).find((b) => routeOf(b) === route); }
function routeButtons(screen = {}, route = '') { return flatButtons(screen).filter((b) => routeOf(b) === route); }
function assertScreen(screen, name, strict = true) {
  if (!screen || typeof screen.text !== 'string' || !Array.isArray(screen.attachments)) throw new Error(name + ': invalid_screen_shape');
  if (!screen.text.trim()) throw new Error(name + ': empty_text');
  if (strict && UI_ERROR_RE.test(screen.text)) throw new Error(name + ': screen_contains_error: ' + cut(screen.text));
  if (strict && TECH_RE.test(screen.text)) throw new Error(name + ': screen_contains_technical_text: ' + cut(screen.text));
  for (const b of flatButtons(screen)) {
    if (strict && RAW_ID_RE.test(String(b.text || ''))) throw new Error(name + ': button_contains_raw_id: ' + cut(b.text, 180));
  }
  return { textChars: screen.text.length, rows: buttonsOf(screen).length, buttons: flatButtons(screen).length };
}
function assertText(screen = {}, pattern, name = '') { const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i'); if (!re.test(String(screen.text || ''))) throw new Error(name + ': expected text not found: ' + re + ': ' + cut(screen.text)); }
function assertNoText(screen = {}, pattern, name = '') { const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i'); if (re.test(String(screen.text || ''))) throw new Error(name + ': forbidden text found: ' + re + ': ' + cut(screen.text)); }
function assertButtonText(screen = {}, pattern, name = '') { const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i'); const texts = buttonTexts(screen); if (!texts.some((text) => re.test(text))) throw new Error(name + ': expected button text not found: ' + re + ': ' + texts.join(' | ')); }
function assertRoute(screen = {}, route = '', name = '') { const btn = findRouteButton(screen, route); if (!btn) throw new Error(name + ': button route not found: ' + route + ': ' + buttonTexts(screen).join(' | ')); return btn; }
function assertScopeVisible(screen = {}, name = '') { assertText(screen, /Область:/i, name + '.scope_visible'); assertNoText(screen, /core-stress|channelId|postId|-?\d{8,}|[a-f0-9]{16,}/i, name + '.no_raw_ids'); }
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 720), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 720) }; } }
async function dispatchShape(route, payload = {}, strict = true) { const screen = await routeDispatcher.dispatch(ctx(route, payload)); return { screen, shape: assertScreen(screen, route, strict) }; }
function assertDangerNeedsConfirm(screen = {}, name = '') {
  const buttons = flatButtons(screen);
  const danger = buttons.filter((b) => /удалить|заблокировать/i.test(String(b.text || '')));
  if (danger.length < 2) throw new Error(name + ': delete/block confirmation buttons missing');
  for (const b of danger) {
    const text = clean(b.text || '');
    if (!/подтверд/i.test(text)) throw new Error(name + ': destructive button text must mention confirmation: ' + text);
    if (routeOf(b) !== 'moderation.action_confirm') throw new Error(name + ': destructive action must route to confirmation: ' + text);
  }
}
async function seedModerationPost() {
  const channelTitle = 'Подключённый канал';
  const postTitle = 'Тест модерации: стоп-слова, ссылки, фото, спам и жалобы';
  const result = await postRegistry.upsertPost({ adminId: STRESS_ADMIN_ID, admin_id: STRESS_ADMIN_ID, channelId: MOD_CHANNEL_ID, channelTitle }, {
    channelId: MOD_CHANNEL_ID, channelTitle, postId: MOD_POST_ID, commentKey: MOD_COMMENT_KEY, postTitle, postPreview: postTitle,
    source: 'stress_test', meta: { stressTest: true, runtimeVersion: RUNTIME, purpose: 'moderation_full_path' }
  });
  const post = result.post || {};
  return { channelId: post.channelId || MOD_CHANNEL_ID, channelTitle: post.channelTitle || channelTitle, postId: post.postId || MOD_POST_ID, postTitle: post.displayTitle || post.postTitle || post.postPreview || postTitle };
}

async function runModerationFullPathScenario() {
  const section = sectionRegistry.find('moderation');
  if (!section) throw new Error('moderation section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('moderation selfTest failed');
  if (self.finalFunctionTreeReady !== true) throw new Error('moderation final function tree missing');
  if (Number(self.functionCount || 0) < 13) throw new Error('moderation final tree must include 13+ functions');
  if (self.reportsReady !== true || self.spamFloodReady !== true || self.actionConfirmRouteReady !== true) throw new Error('moderation reports/spam/confirm routes missing');

  const seeded = await seedModerationPost();
  const channelScope = { ...seeded, scopeType: 'channel', postId: '', postTitle: '' };
  const postScope = { ...seeded, scopeType: 'post' };

  const home = await dispatchShape('moderation.home', {}, true);
  [/Область действия правил/i, /Очередь комментариев/i, /Жалобы пользователей/i, /Правила автофильтра/i, /Стоп-слова/i, /Ссылки и домены/i, /Фото в комментариях/i, /Спам и флуд/i, /Участники и нарушители/i, /Права бота/i, /Действия модератора/i, /Журнал действий/i, /Режимы модерации/i].forEach((re, index) => assertText(home.screen, re, 'moderation.home.final_tree.' + index));
  ['moderation.scope', 'moderation.queue', 'moderation.reports', 'moderation.rules', 'moderation.keywords', 'moderation.links', 'moderation.media', 'moderation.spam', 'moderation.users', 'moderation.rights', 'moderation.actions', 'moderation.logs', 'moderation.settings'].forEach((route) => assertRoute(home.screen, route, 'moderation.home.routes'));

  const scopeStart = await dispatchShape('moderation.scope', {}, true);
  assertButtonText(scopeStart.screen, /Весь канал/i, 'moderation.scope.channel_button');
  assertRoute(scopeStart.screen, 'moderation.scope_post_select', 'moderation.scope.post_picker_button');
  assertText(scopeStart.screen, /Правила канала не требуют выбора поста/i, 'moderation.scope.channel_no_post_required');

  const postPicker = await dispatchShape('moderation.scope_post_select', channelScope, true);
  const postButton = routeButtons(postPicker.screen, 'moderation.scope')[0];
  if (!postButton) throw new Error('moderation.post_picker: no post select button');
  const postPayload = payloadOf(postButton);
  if (postPayload.r !== 'moderation.scope' || postPayload.scopeType !== 'post' || !clean(postPayload.postTitle) || /Пост без текста|выбранный пост/i.test(clean(postPayload.postTitle))) throw new Error('moderation.post_picker: invalid human post payload');

  const scopeChannel = await dispatchShape('moderation.scope', channelScope, true);
  assertScopeVisible(scopeChannel.screen, 'moderation.scope_channel');
  assertText(scopeChannel.screen, /Область: весь канал|Пост: не нужен/i, 'moderation.scope_channel.text');

  const scopePost = await dispatchShape('moderation.scope', postScope, true);
  assertScopeVisible(scopePost.screen, 'moderation.scope_post');
  assertText(scopePost.screen, /Область: один пост|Тест модерации/i, 'moderation.scope_post.text');

  const rules = await dispatchShape('moderation.rules', postScope, true);
  assertScopeVisible(rules.screen, 'moderation.rules');
  ['moderation.keywords', 'moderation.links', 'moderation.media', 'moderation.spam', 'moderation.settings'].forEach((route) => assertRoute(rules.screen, route, 'moderation.rules.routes'));
  assertText(rules.screen, /стоп-слова|ссылки|фото|спам/i, 'moderation.rules.groups');

  const keywords = await dispatchShape('moderation.keywords', postScope, true);
  assertScopeVisible(keywords.screen, 'moderation.keywords');
  assertText(keywords.screen, /скрыть сразу|отправить на проверку|подсветить|сохранить правило/i, 'moderation.keywords.full_path');

  const links = await dispatchShape('moderation.links', channelScope, true);
  assertScopeVisible(links.screen, 'moderation.links');
  assertText(links.screen, /разрешённые домены|неизвестных ссылок|сохранить список/i, 'moderation.links.full_path');

  const media = await dispatchShape('moderation.media', postScope, true);
  assertScopeVisible(media.screen, 'moderation.media');
  assertText(media.screen, /только фото|Видео и файлы не добавляем|проверять все фото|сохранить режим/i, 'moderation.media.photo_only');
  assertNoText(media.screen, /разрешить видео|разрешить файлы/i, 'moderation.media.no_video_files');

  const spam = await dispatchShape('moderation.spam', channelScope, true);
  assertScopeVisible(spam.screen, 'moderation.spam');
  assertText(spam.screen, /повторяющиеся комментарии|слишком частые сообщения|лимит|флуд/i, 'moderation.spam.full_path');

  const queue = await dispatchShape('moderation.queue', postScope, true);
  assertScopeVisible(queue.screen, 'moderation.queue');
  assertText(queue.screen, /оставить|скрыть|удалить с подтверждением|восстановить|предупредить/i, 'moderation.queue.final_decisions');
  assertRoute(queue.screen, 'moderation.reports', 'moderation.queue.reports');
  assertRoute(queue.screen, 'moderation.actions', 'moderation.queue.actions');

  const reports = await dispatchShape('moderation.reports', postScope, true);
  assertScopeVisible(reports.screen, 'moderation.reports');
  assertText(reports.screen, /кто пожаловался|на какой комментарий|финальное решение/i, 'moderation.reports.full_path');
  assertRoute(reports.screen, 'moderation.actions', 'moderation.reports.to_actions');
  assertRoute(reports.screen, 'moderation.logs', 'moderation.reports.to_logs');

  const users = await dispatchShape('moderation.users', channelScope, true);
  assertScopeVisible(users.screen, 'moderation.users');
  assertText(users.screen, /участников|администраторов|нарушителей|удаление и блокировка/i, 'moderation.users.full_path');
  assertRoute(users.screen, 'moderation.rights', 'moderation.users.rights');
  assertRoute(users.screen, 'moderation.actions', 'moderation.users.actions');

  const rights = await dispatchShape('moderation.rights', channelScope, true);
  assertScopeVisible(rights.screen, 'moderation.rights');
  assertText(rights.screen, /читать сообщения|видеть участников|управлять участниками|права/i, 'moderation.rights.full_path');

  const actions = await dispatchShape('moderation.actions', postScope, true);
  assertScopeVisible(actions.screen, 'moderation.actions');
  assertText(actions.screen, /оставить комментарий|скрыть|удалить|восстановить|предупредить|заблокировать/i, 'moderation.actions.list');
  assertDangerNeedsConfirm(actions.screen, 'moderation.actions.confirm_routes');

  const confirmDelete = await dispatchShape('moderation.action_confirm', { ...postScope, action: 'delete' }, true);
  assertScopeVisible(confirmDelete.screen, 'moderation.action_confirm');
  assertText(confirmDelete.screen, /Подтверждение действия|Перед выполнением|нет мгновенной блокировки или удаления/i, 'moderation.action_confirm.text');
  assertRoute(confirmDelete.screen, 'moderation.logs', 'moderation.action_confirm.final_log_route');
  assertRoute(confirmDelete.screen, 'moderation.actions', 'moderation.action_confirm.cancel_route');

  const logs = await dispatchShape('moderation.logs', postScope, true);
  assertScopeVisible(logs.screen, 'moderation.logs');
  assertText(logs.screen, /Журнал|историю решений|восстановить|откатить/i, 'moderation.logs.full_path');

  const settings = await dispatchShape('moderation.settings', channelScope, true);
  assertScopeVisible(settings.screen, 'moderation.settings');
  assertText(settings.screen, /Ручной режим|Полуавтоматический|Автоматический|очередь спорных случаев/i, 'moderation.settings.modes');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    postPayloadTitle: postPayload.postTitle,
    checks: ['final_tree_has_13_functions', 'home_has_all_final_moderation_routes', 'scope_channel_or_single_post', 'channel_scope_does_not_require_post', 'post_scope_requires_human_post_picker', 'rules_open_keywords_links_photo_spam_modes', 'keywords_full_path_save_rule', 'links_full_path_domain_rules', 'photo_only_no_video_files', 'spam_flood_rate_duplicate_rules', 'queue_reports_actions_full_path', 'reports_to_actions_and_logs', 'users_rights_actions', 'delete_and_block_go_to_confirmation', 'confirm_screen_routes_to_logs_or_cancel', 'logs_restore_path', 'manual_semi_auto_auto_modes']
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.moderationFinalTree', async () => sectionRegistry.find('moderation').selfTest()));
  tests.push(await step('scenario.moderation.final_tree_full_path_end_to_end', runModerationFullPathScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 900));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1425_moderation_full_path',
    summary: { ...(baseResult.summary || {}), totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length, failed: failed.length, slow: slow.length, validatesModerationFinalFunctionTree: true, validatesModerationFullPath: true, validatesModerationReports: true, validatesModerationSpamFlood: true, validatesModerationDangerConfirmScreen: true, validatesModerationScopePersistenceAcrossRules: true },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.42.5: финальное дерево модерации и полный путь прошли сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined, postPayloadTitle: x.postPayloadTitle || undefined }))],
    notes: [...((baseResult.notes || []).filter(Boolean)), 'Core 1.42.5 наполняет раздел Модерация финальным деревом функций: область, очередь, жалобы, правила, стоп-слова, ссылки, фото, спам/флуд, участники, права, действия, журнал, режимы.', 'Stress-test проверяет полный путь: выбор области → выбор поста → правила → стоп-слова/ссылки/фото/спам → очередь/жалобы → действия → подтверждение → журнал.', 'Правила канала не требуют выбора поста; правила одного поста обязаны идти через человекочитаемый post picker.', 'Удаление и блокировка остаются двухшаговыми и ведут на moderation.action_confirm.', 'Видео и файлы по-прежнему не входят в комментарии; внутри модерации фото проверяются отдельно как разрешённый тип вложений.']
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const moderationSelf = sectionRegistry.find('moderation')?.selfTest?.() || {};
  return { ...baseSelf, ok: baseSelf.ok !== false && moderationSelf.ok !== false, runtimeVersion: RUNTIME, baseRuntimeVersion: base.RUNTIME, moderationRuntimeVersion: moderationSelf.runtimeVersion || '', moderationFinalFunctionTreeReady: moderationSelf.finalFunctionTreeReady === true, moderationFunctionCount: moderationSelf.functionCount || 0, moderationFullPathStressReady: true, moderationReportsStressReady: true, moderationSpamFloodStressReady: true, moderationActionConfirmStressReady: true };
}
module.exports = { RUNTIME, run, runFast, selfTest };
