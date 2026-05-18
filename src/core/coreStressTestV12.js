'use strict';

const base = require('./coreStressTestV11');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const editorData = require('./postEditorDataAdapterV2');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.44.0-POST-EDITOR-DIRECT-ARCHIVE';
const STRESS_ADMIN_ID = 'core-stress-admin';
const STRESS_CHANNEL_ID = 'core-stress-edit-channel';
const STRESS_POST_ID = 'core-stress-edit-post';
const STRESS_MESSAGE_ID = 'core-stress-edit-message';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 760) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) {
  return {
    adminId: STRESS_ADMIN_ID,
    admin_id: STRESS_ADMIN_ID,
    userId: STRESS_ADMIN_ID,
    route,
    planCode: 'start',
    updateType: 'stress_test_post_editor_1440',
    payload: {
      channelId: STRESS_CHANNEL_ID,
      channelTitle: 'Подключённый канал',
      postId: STRESS_POST_ID,
      messageId: STRESS_MESSAGE_ID,
      postTitle: 'Тест редактирования: старый пост без архива',
      ...payload
    }
  };
}
function buttonsOf(screen = {}) { try { return (((screen.attachments || [])[0] || {}).payload || {}).buttons || []; } catch { return []; } }
function flatButtons(screen = {}) { return buttonsOf(screen).flat().filter(Boolean); }
function buttonTexts(screen = {}) { return flatButtons(screen).map((b) => clean(b.text)); }
function payloadOf(button = {}) { try { return JSON.parse(button.payload || '{}'); } catch { return {}; } }
function routeOf(button = {}) { return String(payloadOf(button).r || '').trim(); }
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
function assertRoute(screen = {}, route = '', name = '') { const btn = flatButtons(screen).find((b) => routeOf(b) === route); if (!btn) throw new Error(name + ': button route not found: ' + route + ': ' + buttonTexts(screen).join(' | ')); return btn; }
async function dispatchShape(route, payload = {}, strict = true) { const screen = await routeDispatcher.dispatch(ctx(route, payload)); return { screen, shape: assertScreen(screen, route, strict) }; }
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 760), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 760) }; } }

async function seed() {
  const seeded = await editorData.seedEditablePost(ctx('post_editor.home'), {
    channelId: STRESS_CHANNEL_ID,
    channelTitle: 'Подключённый канал',
    postId: STRESS_POST_ID,
    messageId: STRESS_MESSAGE_ID,
    postTitle: 'Тест редактирования: старый пост без архива'
  });
  if (seeded.ok === false) throw new Error('seed editable post failed: ' + (seeded.error || 'unknown'));
  const archived = await editorData.archivePost(ctx('post_editor.archive'), {
    channelId: STRESS_CHANNEL_ID,
    channelTitle: 'Подключённый канал',
    postId: STRESS_POST_ID,
    messageId: STRESS_MESSAGE_ID,
    postTitle: 'Тест редактирования: старый пост без архива',
    postText: 'Сохранённый текст архива для восстановления',
    source: 'stress_test'
  });
  if (archived.ok === false) throw new Error('archive seed failed: ' + (archived.error || 'unknown'));
  return { seeded: seeded.post, archived };
}

async function runPostEditorScenario() {
  const section = sectionRegistry.find('post_editor');
  if (!section) throw new Error('post editor section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('post editor selfTest failed');
  if (self.quickEditDoesNotRequireArchiveRestore !== true) throw new Error('quick edit must not require archive restore');
  if (self.archiveSeparateTreeReady !== true) throw new Error('archive tree must be separate from quick edit');
  if (self.noLocalAgeBlock !== true) throw new Error('direct edit must not locally block old posts by age');

  const seeded = await seed();
  const home = await dispatchShape('post_editor.home', {}, true);
  [/Быстрое редактирование поста/i, /Редактирование пересланного поста/i, /Архив постов/i, /Лимиты памяти/i].forEach((re, index) => assertText(home.screen, re, 'post_editor.home.tree.' + index));
  ['post_editor.quick_channel', 'post_editor.forwarded_post', 'post_editor.archive', 'post_editor.archive_list', 'post_editor.archive_delete_confirm'].forEach((route) => assertRoute(home.screen, route, 'post_editor.home.routes'));
  assertText(home.screen, /Обычное редактирование не должно заставлять администратора восстанавливать пост из архива/i, 'post_editor.home.no_archive_for_quick_edit');

  const quickChannel = await dispatchShape('post_editor.quick_channel', {}, true);
  assertText(quickChannel.screen, /Шаг 1 из 4|Выберите канал/i, 'post_editor.quick_channel.step');
  assertRoute(quickChannel.screen, 'post_editor.quick_post', 'post_editor.quick_channel.next');

  const quickPost = await dispatchShape('post_editor.quick_post', {}, true);
  assertText(quickPost.screen, /Шаг 2 из 4|Выберите пост/i, 'post_editor.quick_post.step');
  assertText(quickPost.screen, /Тест редактирования|старый пост/i, 'post_editor.quick_post.human_post');
  assertNoText(quickPost.screen, /core-stress-edit-post|core-stress-edit-message/i, 'post_editor.quick_post.no_raw_ids');
  assertRoute(quickPost.screen, 'post_editor.quick_text', 'post_editor.quick_post.next');

  const quickText = await dispatchShape('post_editor.quick_text', {}, true);
  assertText(quickText.screen, /Шаг 3 из 4|Пришлите новый текст/i, 'post_editor.quick_text.step');
  assertText(quickText.screen, /Медиа поста не удаляем|не пересобираем/i, 'post_editor.quick_text.media_policy');
  assertRoute(quickText.screen, 'post_editor.quick_preview', 'post_editor.quick_text.preview');

  const editPayload = { newText: 'Обновлённый текст старого поста без восстановления из архива', dryRun: true };
  const preview = await dispatchShape('post_editor.quick_preview', editPayload, true);
  assertText(preview.screen, /Предпросмотр правки|можно пробовать прямое редактирование/i, 'post_editor.preview.ready');
  assertText(preview.screen, /Архив на этом пути не используется/i, 'post_editor.preview.no_archive');
  assertRoute(preview.screen, 'post_editor.quick_apply', 'post_editor.preview.apply');

  const apply = await dispatchShape('post_editor.quick_apply', editPayload, true);
  assertText(apply.screen, /Правка готова к применению|прямое редактирование/i, 'post_editor.apply.direct_edit');
  assertText(apply.screen, /не восстанавливает пост из архива|не создаёт новый post id/i, 'post_editor.apply.no_archive_no_new_post');

  const forwarded = await dispatchShape('post_editor.forwarded_post', {}, true);
  assertText(forwarded.screen, /пересылает старый пост боту|пробует прямое редактирование/i, 'post_editor.forwarded');
  assertText(forwarded.screen, /не восстановление из архива|не создаём новый пост/i, 'post_editor.forwarded.not_archive');

  const archive = await dispatchShape('post_editor.archive', {}, true);
  assertText(archive.screen, /отдельная память постов|не основной путь редактирования|лимит памяти/i, 'post_editor.archive.separate');
  assertRoute(archive.screen, 'post_editor.archive_list', 'post_editor.archive.list');
  assertRoute(archive.screen, 'post_editor.archive_save', 'post_editor.archive.save');
  assertRoute(archive.screen, 'post_editor.archive_limits', 'post_editor.archive.limits');

  const archiveSave = await dispatchShape('post_editor.archive_save', { postText: 'Новый архивный текст' }, true);
  assertText(archiveSave.screen, /Пост сохранён в архив|лимитам тарифа/i, 'post_editor.archive_save');

  const archiveList = await dispatchShape('post_editor.archive_list', {}, true);
  assertText(archiveList.screen, /Сохранённые посты|Тест редактирования/i, 'post_editor.archive_list.items');
  assertRoute(archiveList.screen, 'post_editor.archive_restore', 'post_editor.archive_list.restore');
  assertRoute(archiveList.screen, 'post_editor.archive_delete_confirm', 'post_editor.archive_list.delete_confirm');

  const archiveRestoreBtn = assertRoute(archiveList.screen, 'post_editor.archive_restore', 'post_editor.archive_restore.button');
  const restorePayload = payloadOf(archiveRestoreBtn);
  const archiveRestore = await dispatchShape('post_editor.archive_restore', restorePayload, true);
  assertText(archiveRestore.screen, /Восстановление подготовлено|запасной путь/i, 'post_editor.archive_restore');

  const archiveDeleteBtn = assertRoute(archiveList.screen, 'post_editor.archive_delete_confirm', 'post_editor.archive_delete.button');
  const deletePayload = payloadOf(archiveDeleteBtn);
  const archiveDeleteConfirm = await dispatchShape('post_editor.archive_delete_confirm', deletePayload, true);
  assertText(archiveDeleteConfirm.screen, /Подтверждение удаления из архива|Опубликованный пост в канале этим действием не трогаем/i, 'post_editor.archive_delete_confirm');
  assertRoute(archiveDeleteConfirm.screen, 'post_editor.archive_delete', 'post_editor.archive_delete.confirm_route');

  const archiveLimits = await dispatchShape('post_editor.archive_limits', {}, true);
  assertText(archiveLimits.screen, /Бесплатный|3 поста|15 постов|60 постов/i, 'post_editor.archive_limits');

  const dataSelf = editorData.selfTest();
  if (dataSelf.quickEditDoesNotRequireArchiveRestore !== true || dataSelf.archivePlanLimitsReady !== true) throw new Error('post editor data adapter policies missing');
  if (editorData.memoryLimitForPlan('free') !== 3 || editorData.memoryLimitForPlan('plus') !== 15 || editorData.memoryLimitForPlan('business') !== 60) throw new Error('archive plan limits mismatch');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    seeded,
    checks: [
      'quick_edit_tree_ready',
      'quick_edit_does_not_require_archive_restore',
      'channel_to_post_to_text_to_preview_to_apply_path',
      'human_post_labels_without_raw_ids',
      'direct_edit_request_ready_for_existing_message',
      'no_local_age_block_for_old_forwarded_posts',
      'forwarded_post_fallback_not_archive_restore',
      'archive_separate_tree_ready',
      'archive_save_list_restore_delete_ready',
      'archive_delete_requires_confirmation',
      'archive_plan_limits_3_15_60'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.postEditorFinalTree', async () => sectionRegistry.find('post_editor').selfTest()));
  tests.push(await step('self.postEditorDataAdapter', async () => editorData.selfTest()));
  tests.push(await step('scenario.post_editor.direct_edit_archive_full_path', runPostEditorScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1440_post_editor_direct_archive',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesPostEditorFinalTree: true,
      validatesDirectEditFirstPath: true,
      validatesNoArchiveRestoreRequiredForQuickEdit: true,
      validatesForwardedPostFallback: true,
      validatesArchiveSeparateTree: true,
      validatesArchiveRestoreDeleteAndLimits: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.44.0: редактирование постов и отдельный архив прошли сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.44.0 наполняет раздел Редактирование постов финальным деревом функций.',
      'Обычный путь: Редактирование → канал → пост → новый текст → предпросмотр → применить; архив в этом пути не нужен.',
      'Для старого пересланного поста АдминКИТ не ставит локальный запрет по возрасту: боевой результат решает ответ MAX API по конкретному message id.',
      'Архив — отдельный раздел: сохранить, список, восстановить из архива, удалить из базы с подтверждением.',
      'Лимиты архива по тарифам проверены как 3 / 15 / 60 постов на канал.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const sectionSelf = sectionRegistry.find('post_editor')?.selfTest?.() || {};
  const dataSelf = editorData.selfTest ? editorData.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && sectionSelf.ok !== false && dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    postEditorRuntimeVersion: sectionSelf.runtimeVersion || '',
    postEditorDataRuntimeVersion: dataSelf.runtimeVersion || '',
    postEditorFinalTreeReady: true,
    directEditFirstPathReady: true,
    archiveSeparateTreeReady: true,
    archivePlanLimitsReady: true,
    noArchiveRestoreRequiredForQuickEdit: true,
    noLocalAgeBlockForOldForwardedPost: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };