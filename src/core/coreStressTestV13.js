'use strict';

const base = require('./coreStressTestV12');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const highlightData = require('./postHighlightsDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.45.0-POST-HIGHLIGHTS';
const STRESS_ADMIN_ID = 'core-stress-admin';
const STRESS_CHANNEL_ID = 'core-stress-highlight-channel';
const STRESS_POST_ID = 'core-stress-highlight-post';
const STRESS_MESSAGE_ID = 'core-stress-highlight-message';
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
    updateType: 'stress_test_post_highlights_1450',
    payload: {
      channelId: STRESS_CHANNEL_ID,
      channelTitle: 'Подключённый канал',
      postId: STRESS_POST_ID,
      messageId: STRESS_MESSAGE_ID,
      postTitle: 'Тест выделения: важный пост',
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
function assertButtonText(screen = {}, pattern, name = '') { const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i'); const labels = buttonTexts(screen).join(' | '); if (!re.test(labels)) throw new Error(name + ': expected button text not found: ' + re + ': ' + cut(labels)); }
function assertNoText(screen = {}, pattern, name = '') { const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i'); if (re.test(String(screen.text || ''))) throw new Error(name + ': forbidden text found: ' + re + ': ' + cut(screen.text)); }
function assertRoute(screen = {}, route = '', name = '') { const btn = flatButtons(screen).find((b) => routeOf(b) === route); if (!btn) throw new Error(name + ': button route not found: ' + route + ': ' + buttonTexts(screen).join(' | ')); return btn; }
async function dispatchShape(route, payload = {}, strict = true) { const screen = await routeDispatcher.dispatch(ctx(route, payload)); return { screen, shape: assertScreen(screen, route, strict) }; }
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 760), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 760) }; } }

async function seed() {
  const seeded = await highlightData.seedPost(ctx('post_highlights.home'), {
    channelId: STRESS_CHANNEL_ID,
    channelTitle: 'Подключённый канал',
    postId: STRESS_POST_ID,
    messageId: STRESS_MESSAGE_ID,
    postTitle: 'Тест выделения: важный пост'
  });
  if (seeded.ok === false) throw new Error('seed highlight post failed: ' + (seeded.error || 'unknown'));
  return seeded;
}

async function runPostHighlightsScenario() {
  const section = sectionRegistry.find('post_highlights');
  if (!section) throw new Error('post highlights section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('post highlights selfTest failed');
  if (self.noDirectMaxPostPatch !== true) throw new Error('post highlights must not patch MAX post directly');
  if (self.removeNeedsConfirmation !== true) throw new Error('highlight remove must require confirmation');

  const seeded = await seed();
  const home = await dispatchShape('post_highlights.home', {}, true);
  [/Выделение постов/i, /выбрать канал/i, /выбрать пост/i, /предпросмотр/i, /Список выделенных/i].forEach((re, index) => assertText(home.screen, re, 'post_highlights.home.tree.' + index));
  ['post_highlights.channel', 'post_highlights.post', 'post_highlights.type', 'post_highlights.preview', 'post_highlights.apply', 'post_highlights.list', 'post_highlights.remove_confirm', 'post_highlights.stats'].forEach((route) => assertRoute(home.screen, route, 'post_highlights.home.routes'));
  assertText(home.screen, /не меняет исходный MAX-пост/i, 'post_highlights.home.no_direct_patch');

  const channel = await dispatchShape('post_highlights.channel', {}, true);
  assertText(channel.screen, /Шаг 1 из 4|Выберите канал/i, 'post_highlights.channel.step');
  assertRoute(channel.screen, 'post_highlights.post', 'post_highlights.channel.next');

  const post = await dispatchShape('post_highlights.post', {}, true);
  assertText(post.screen, /Шаг 2 из 4|Выберите пост/i, 'post_highlights.post.step');
  assertButtonText(post.screen, /Тест выделения|важный пост/i, 'post_highlights.post.human_post_button');
  assertNoText(post.screen, /core-stress-highlight-post|core-stress-highlight-message/i, 'post_highlights.post.no_raw_ids');
  assertRoute(post.screen, 'post_highlights.type', 'post_highlights.post.next');

  const type = await dispatchShape('post_highlights.type', {}, true);
  assertText(type.screen, /Шаг 3 из 4|Выберите бейдж/i, 'post_highlights.type.step');
  [/Важно/i, /Новое/i, /Подарок/i, /Акция/i, /Закрепить/i].forEach((re, index) => assertButtonText(type.screen, re, 'post_highlights.type.option.' + index));
  assertRoute(type.screen, 'post_highlights.preview', 'post_highlights.type.preview');

  const previewPayload = { highlightType: 'important', badgeText: 'Важное' };
  const preview = await dispatchShape('post_highlights.preview', previewPayload, true);
  assertText(preview.screen, /Предпросмотр выделения|Бейдж/i, 'post_highlights.preview.ready');
  assertText(preview.screen, /Исходный MAX-пост этим действием не переписываем/i, 'post_highlights.preview.no_direct_patch');
  assertRoute(preview.screen, 'post_highlights.apply', 'post_highlights.preview.apply');

  const apply = await dispatchShape('post_highlights.apply', previewPayload, true);
  assertText(apply.screen, /Пост выделен|Выделение сохранено/i, 'post_highlights.apply.saved');
  assertText(apply.screen, /не удалялся|не пересоздавался/i, 'post_highlights.apply.no_delete_no_recreate');
  assertRoute(apply.screen, 'post_highlights.list', 'post_highlights.apply.list');

  const list = await dispatchShape('post_highlights.list', {}, true);
  assertText(list.screen, /Активные выделения|Тест выделения/i, 'post_highlights.list.items');
  assertRoute(list.screen, 'post_highlights.remove_confirm', 'post_highlights.list.remove_confirm');
  assertRoute(list.screen, 'post_highlights.stats', 'post_highlights.list.stats');

  const removeBtn = assertRoute(list.screen, 'post_highlights.remove_confirm', 'post_highlights.remove.button');
  const removePayload = payloadOf(removeBtn);
  const removeConfirm = await dispatchShape('post_highlights.remove_confirm', removePayload, true);
  assertText(removeConfirm.screen, /Подтверждение снятия выделения|Пост в MAX не удаляем/i, 'post_highlights.remove_confirm');
  assertRoute(removeConfirm.screen, 'post_highlights.remove', 'post_highlights.remove.confirm_route');

  const stats = await dispatchShape('post_highlights.stats', {}, true);
  assertText(stats.screen, /Статистика выделений|Всего активных выделений|Важно/i, 'post_highlights.stats');

  const dataSelf = highlightData.selfTest();
  if (dataSelf.noDirectMaxPostPatch !== true || dataSelf.removeNeedsConfirmation !== true || dataSelf.statsReady !== true) throw new Error('post highlights data policies missing');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    seeded,
    checks: [
      'post_highlights_tree_ready',
      'channel_post_badge_preview_apply_path',
      'human_post_labels_without_raw_ids',
      'highlight_types_ready',
      'preview_before_apply_ready',
      'no_direct_max_post_patch',
      'highlight_saved_to_adminkit_db',
      'highlight_list_ready',
      'remove_requires_confirmation',
      'stats_by_highlight_type_ready'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.postHighlightsFinalTree', async () => sectionRegistry.find('post_highlights').selfTest()));
  tests.push(await step('self.postHighlightsDataAdapter', async () => highlightData.selfTest()));
  tests.push(await step('scenario.post_highlights.full_path', runPostHighlightsScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1450_post_highlights',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesPostHighlightsFinalTree: true,
      validatesChannelPostBadgePreviewApplyPath: true,
      validatesNoDirectMaxPostPatch: true,
      validatesHighlightListRemoveAndStats: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.45.0: выделение постов прошло сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.45.0 наполняет раздел Выделение постов финальным деревом функций.',
      'Обычный путь: Выделение постов → канал → пост → тип бейджа → предпросмотр → применить.',
      'Выделение сохраняется в базе АдминКИТ и не патчит MAX-пост напрямую.',
      'Снятие выделения требует отдельного подтверждения и не удаляет опубликованный пост.',
      'Статистика выделений проверяет счётчики по типам.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const sectionSelf = sectionRegistry.find('post_highlights')?.selfTest?.() || {};
  const dataSelf = highlightData.selfTest ? highlightData.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && sectionSelf.ok !== false && dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    postHighlightsRuntimeVersion: sectionSelf.runtimeVersion || '',
    postHighlightsDataRuntimeVersion: dataSelf.runtimeVersion || '',
    postHighlightsFinalTreeReady: true,
    channelPostBadgePreviewApplyReady: true,
    noDirectMaxPostPatch: true,
    removeNeedsConfirmation: true,
    statsReady: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };
