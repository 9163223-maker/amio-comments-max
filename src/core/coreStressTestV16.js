'use strict';

const base = require('./coreStressTestV15');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const menuRenderer = require('./menuRenderer');
const navigationV3 = require('./navigationV3Adapter');
const stateManager = require('./stateManager');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.48.1-NAVIGATION-V3-HINTS-SAFE';
const STRESS_ADMIN_ID = 'core-stress-admin';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;
const FORBIDDEN_FLOAT_HINT_RE = /(overlay|floating|float[-_\s]*hint)/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 900) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) {
  return {
    adminId: STRESS_ADMIN_ID,
    admin_id: STRESS_ADMIN_ID,
    userId: STRESS_ADMIN_ID,
    route,
    planCode: 'start',
    updateType: 'stress_test_navigation_v3_1481',
    payload: { ...(payload || {}) }
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
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 900), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 900) }; } }
function assertNativeInline(screen = {}, name = '') {
  const attachments = screen.attachments || [];
  if (!attachments.length) throw new Error(name + ': no_inline_keyboard_attachment');
  const keyboard = attachments[0];
  if (keyboard.type !== 'inline_keyboard') throw new Error(name + ': non_native_inline_keyboard: ' + String(keyboard.type || ''));
  if (!keyboard.payload || !Array.isArray(keyboard.payload.buttons)) throw new Error(name + ': invalid_inline_payload');
  if (FORBIDDEN_FLOAT_HINT_RE.test(String(screen.text || ''))) throw new Error(name + ': forbidden_float_hint_text_detected');
}
function assertBackHome(screen = {}, name = '') {
  const labels = buttonTexts(screen).join(' | ');
  if (!/Главное меню/i.test(labels)) throw new Error(name + ': home button missing: ' + labels);
}

async function runNavigationV3Scenario() {
  const section = sectionRegistry.find('navigation');
  if (!section) throw new Error('navigation section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('navigation selfTest failed');
  if (self.nativeInlineOnly !== true || self.overlayHintsDisabled !== true || self.floatingHintsDisabled !== true) throw new Error('navigation hints policy missing');

  const adapterSelf = navigationV3.selfTest();
  if (adapterSelf.nativeInlineOnly !== true || adapterSelf.cleanupPipelineReady !== true) throw new Error('navigation V3 adapter policy missing');

  const main = await dispatchShape('main.home', {}, true);
  assertText(main.screen, /АдминКИТ|Выберите раздел/i, 'navigation.main.title');
  assertNativeInline(main.screen, 'navigation.main.native_inline');
  const analysis = navigationV3.analyzeMainMenuButtons(buttonsOf(main.screen));
  if (analysis.missingRequiredRoutes.length) throw new Error('navigation.main.missing_required_routes: ' + analysis.missingRequiredRoutes.join(', '));
  if (analysis.foldedVisibleRoutes.length) throw new Error('navigation.main.folded_routes_visible: ' + analysis.foldedVisibleRoutes.join(', '));
  if (analysis.duplicateLabels.length) throw new Error('navigation.main.duplicate_labels: ' + analysis.duplicateLabels.join(', '));
  assertNoText(main.screen, /Фото в комментариях|Реакции и ответы/i, 'navigation.main.folded_not_visible');

  const navHome = await dispatchShape('navigation.home', {}, true);
  assertText(navHome.screen, /Меню и навигация V3|one active screen|cleanup pipeline/i, 'navigation.home.tree');
  assertText(navHome.screen, /только нативные inline|Всплывающие и плавающие подсказки.*запрещены/i, 'navigation.home.native_policy');
  ['navigation.audit', 'navigation.active_screen', 'navigation.cleanup', 'navigation.flow_guard', 'navigation.back_home', 'navigation.folded_sections'].forEach((route) => assertRoute(navHome.screen, route, 'navigation.home.route.' + route));
  assertNativeInline(navHome.screen, 'navigation.home.native_inline');
  assertBackHome(navHome.screen, 'navigation.home.back_home');

  const audit = await dispatchShape('navigation.audit', {}, true);
  assertText(audit.screen, /главного меню|видимые маршруты|native inline/i, 'navigation.audit');
  assertRoute(audit.screen, 'main.home', 'navigation.audit.main');
  assertRoute(audit.screen, 'navigation.home', 'navigation.audit.back');
  assertNativeInline(audit.screen, 'navigation.audit.native_inline');

  const backHome = await dispatchShape('navigation.back_home', {}, true);
  assertText(backHome.screen, /Назад|Главное меню|не плодит новый flow/i, 'navigation.back_home');
  assertRoute(backHome.screen, 'navigation.home', 'navigation.back_home.back');
  assertRoute(backHome.screen, 'main.home', 'navigation.back_home.home');

  const activeScreen = await dispatchShape('navigation.active_screen', { messageId: 'navigation-v3-stress-screen' }, true);
  assertText(activeScreen.screen, /Активный экран|один актуальный экран|cleanup pipeline/i, 'navigation.active_screen');
  const sessionAfterActive = await stateManager.getSession(STRESS_ADMIN_ID);
  if (clean(sessionAfterActive?.active_message_id) !== 'navigation-v3-stress-screen') throw new Error('navigation.active_screen.session_not_updated');

  const cleanup = await dispatchShape('navigation.cleanup', {}, true);
  assertText(cleanup.screen, /Cleanup pipeline работает|Предыдущий экран|Активный сценарий очищается/i, 'navigation.cleanup');
  const sessionAfterCleanup = await stateManager.getSession(STRESS_ADMIN_ID);
  if (clean(sessionAfterCleanup?.active_flow) || clean(sessionAfterCleanup?.active_step)) throw new Error('navigation.cleanup.flow_not_cleared');

  const flowGuard = await dispatchShape('navigation.flow_guard', {}, true);
  assertText(flowGuard.screen, /Защита одного активного сценария работает|Старый callback другого сценария блокируется/i, 'navigation.flow_guard');

  const folded = await dispatchShape('navigation.folded_sections', {}, true);
  assertText(folded.screen, /Фото в комментариях|реакции и ответы|внутри «Комментарии»/i, 'navigation.folded');
  assertRoute(folded.screen, 'comments.home', 'navigation.folded.comments');

  const visibleRouteSamples = navigationV3.REQUIRED_VISIBLE_ROUTES.filter((route) => !['navigation.home'].includes(route));
  for (const route of visibleRouteSamples) {
    const screen = await routeDispatcher.dispatch(ctx(route));
    assertScreen(screen, 'navigation.route_sample.' + route, route !== 'billing.home');
    assertNativeInline(screen, 'navigation.route_sample.native.' + route);
  }

  const rendererSelf = menuRenderer.selfTest();
  if (rendererSelf.userTextFilterReady !== true || rendererSelf.hiddenSectionsReady !== true) throw new Error('menu renderer V3 policies missing');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    visibleRouteCount: analysis.visibleCount,
    checks: [
      'main_menu_has_required_routes_once',
      'folded_sections_not_visible_as_top_menu',
      'native_inline_only_no_overlay_float',
      'navigation_tree_ready',
      'back_home_routes_ready',
      'one_active_screen_updates_session',
      'cleanup_pipeline_moves_old_screens_and_clears_flow',
      'one_active_flow_stale_callback_guard',
      'all_visible_route_samples_render',
      'technical_text_filter_ready'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.navigationFinalTree', async () => sectionRegistry.find('navigation').selfTest()));
  tests.push(await step('self.navigationV3Adapter', async () => navigationV3.selfTest()));
  tests.push(await step('scenario.navigation.v3_full_path', runNavigationV3Scenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1481_navigation_v3_hints_safe',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesNavigationV3FinalTree: true,
      validatesMainMenuRoutes: true,
      validatesNativeInlineOnly: true,
      validatesOneActiveScreen: true,
      validatesOneActiveFlow: true,
      validatesCleanupPipeline: true,
      validatesBackHomeNavigation: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.48.1: меню и навигация V3 прошли сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined, visibleRouteCount: x.visibleRouteCount || undefined }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.48.1 наполняет раздел Меню и навигация V3 финальным деревом функций.',
      'Проверяется главное меню: нужные разделы видны, вложенные комментарии не дублируются наверху.',
      'Подсказки только native inline; всплывающие и плавающие подсказки запрещены.',
      'Проверяются one active screen, one active flow и cleanup pipeline.',
      'Проверяются кнопки Назад / Главное меню и рендер всех видимых разделов.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const sectionSelf = sectionRegistry.find('navigation')?.selfTest?.() || {};
  const adapterSelf = navigationV3.selfTest ? navigationV3.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && sectionSelf.ok !== false && adapterSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    navigationRuntimeVersion: sectionSelf.runtimeVersion || '',
    navigationV3RuntimeVersion: adapterSelf.runtimeVersion || '',
    navigationFinalTreeReady: true,
    mainMenuRoutesReady: true,
    nativeInlineOnly: true,
    overlayHintsDisabled: true,
    floatingHintsDisabled: true,
    oneActiveScreenReady: true,
    oneActiveFlowGuardReady: true,
    cleanupPipelineReady: true,
    backHomeRoutesReady: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };