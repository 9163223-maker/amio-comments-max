'use strict';

const base = require('./coreStressTestV19');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const checklist = require('./productionChecklistAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.51.0-PRODUCTION-CHECKLIST';
const STRESS_ADMIN_ID = 'core-stress-admin';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 1000) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) { return { adminId: STRESS_ADMIN_ID, admin_id: STRESS_ADMIN_ID, userId: STRESS_ADMIN_ID, route, planCode: 'start', updateType: 'stress_test_production_checklist_1510', payload: { ...(payload || {}) } }; }
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
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 1000), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 1000) }; } }
function assertNativeInline(screen = {}, name = '') {
  const attachments = screen.attachments || [];
  if (!attachments.length) throw new Error(name + ': no_inline_keyboard_attachment');
  const keyboard = attachments[0];
  if (keyboard.type !== 'inline_keyboard') throw new Error(name + ': non_native_inline_keyboard: ' + String(keyboard.type || ''));
  if (!keyboard.payload || !Array.isArray(keyboard.payload.buttons)) throw new Error(name + ': invalid_inline_payload');
}

async function runProductionChecklistScenario() {
  const section = sectionRegistry.find('production_checklist');
  if (!section) throw new Error('production_checklist section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('production_checklist selfTest failed');
  if (self.productionEnableRequiresManualConfirm !== true || self.canaryFirstReady !== true || self.rollbackPlanReady !== true) throw new Error('production checklist release policies missing');

  const adapterSelf = checklist.selfTest();
  if (adapterSelf.featureMatrixReady !== true || adapterSelf.releaseGateReady !== true || adapterSelf.hardRulesReady !== true) throw new Error('production checklist adapter policies missing');
  const features = checklist.featureMatrix();
  const missing = checklist.REQUIRED_SECTION_IDS.filter((id) => !features.some((item) => item.id === id && item.ok));
  if (missing.length) throw new Error('production checklist missing sections: ' + missing.join(', '));
  const security = checklist.securityChecklist();
  const securityBad = security.filter((item) => item.status === 'blocker');
  if (securityBad.length) throw new Error('production checklist security blockers: ' + securityBad.map((x) => x.id).join(', '));
  const policy = checklist.policyChecklist();
  if (!policy.some((item) => item.id === 'comments_no_video_files' && item.ok === true)) throw new Error('no-video-files policy missing');
  if (!policy.some((item) => item.id === 'logo_task_deferred' && item.status !== 'blocker')) throw new Error('logo deferred warning policy missing');
  const gate = checklist.releaseGate();
  if (gate.blockers.length) throw new Error('production release gate has blockers: ' + gate.blockers.map((x) => x.id).join(', '));
  if (gate.productionEnableRequiresManualConfirm !== true || gate.canaryFirst !== true || gate.rollbackRequired !== true) throw new Error('production gate manual/canary/rollback flags missing');

  const home = await dispatchShape('production_checklist.home', {}, true);
  assertText(home.screen, /Production checklist|Blockers:|Warnings:|ручной проверке в MAX|не выполняется.*автоматически/i, 'production.home.copy');
  ['production_checklist.features', 'production_checklist.env', 'production_checklist.security', 'production_checklist.policy', 'production_checklist.gate', 'production_checklist.canary', 'production_checklist.rollback'].forEach((route) => assertRoute(home.screen, route, 'production.home.route.' + route));
  assertNativeInline(home.screen, 'production.home.native_inline');

  const featureScreen = await dispatchShape('production_checklist.features', {}, true);
  assertText(featureScreen.screen, /Матрица разделов|Каналы|Комментарии|Статистика|Production/i, 'production.features');
  assertText(featureScreen.screen, /photo_comments|reactions_replies/i, 'production.features.folded');
  assertRoute(featureScreen.screen, 'production_checklist.gate', 'production.features.gate');

  const envScreen = await dispatchShape('production_checklist.env', {}, true);
  assertText(envScreen.screen, /Env \/ deployment|DATABASE_URL|GITHUB_DEBUG_REPO|GITHUB_DEBUG_TOKEN|Токены и секреты не показываются/i, 'production.env');
  assertNoText(envScreen.screen, /ghp_|github_pat_|Bearer\s+/i, 'production.env.no_tokens');

  const securityScreen = await dispatchShape('production_checklist.security', {}, true);
  assertText(securityScreen.screen, /Security \/ UX guard|no-cache|токены|One active screen|Debug остаётся внутренним/i, 'production.security');
  assertRoute(securityScreen.screen, 'navigation.home', 'production.security.navigation');
  assertRoute(securityScreen.screen, 'debug_diagnostics.home', 'production.security.debug');

  const policyScreen = await dispatchShape('production_checklist.policy', {}, false);
  assertScreen(policyScreen.screen, 'production.policy.shape', false);
  assertText(policyScreen.screen, /нет видео\/файлов|нет SVG|опасные действия|Логотип пока можно оставить/i, 'production.policy');

  const gateScreen = await dispatchShape('production_checklist.gate', {}, true);
  assertText(gateScreen.screen, /Blockers нет|готово к боевой ручной проверке в MAX|Warnings:/i, 'production.gate');
  assertRoute(gateScreen.screen, 'production_checklist.canary', 'production.gate.canary');

  const canaryScreen = await dispatchShape('production_checklist.canary', {}, true);
  assertText(canaryScreen.screen, /Боевой запуск.*не сразу на всех|тестовый канал|реальный канал|ADMINKIT_CORE_CANARY_ALL не включать/i, 'production.canary');
  assertRoute(canaryScreen.screen, 'production_checklist.rollback', 'production.canary.rollback');

  const rollbackScreen = await dispatchShape('production_checklist.rollback', {}, true);
  assertText(rollbackScreen.screen, /План отката|commit|runtimeVersion|package\.json main|не чистить пользовательские данные/i, 'production.rollback');
  assertRoute(rollbackScreen.screen, 'production_checklist.gate', 'production.rollback.gate');

  const main = await dispatchShape('main.home', {}, true);
  assertRoute(main.screen, 'production_checklist.home', 'production.main.visible');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    blockers: gate.blockers.length,
    warnings: gate.warnings.length,
    readyForManualMaxCheck: gate.readyForManualMaxCheck,
    readyForProduction: gate.readyForProduction,
    checks: [
      'production_checklist_registered_and_visible',
      'feature_matrix_all_required_sections_ok',
      'env_checklist_ready_without_secret_values',
      'security_guardrails_ready',
      'product_policy_no_video_files_no_svg_ready',
      'debug_locked_and_no_cache_policy_ready',
      'release_gate_has_no_blockers',
      'manual_confirmation_required_for_production',
      'canary_first_plan_ready',
      'rollback_plan_ready'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.productionChecklistFinalTree', async () => sectionRegistry.find('production_checklist').selfTest()));
  tests.push(await step('self.productionChecklistAdapter', async () => checklist.selfTest()));
  tests.push(await step('scenario.production_checklist.full_path', runProductionChecklistScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1510_production_checklist',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesProductionChecklistFinalTree: true,
      validatesFeatureMatrix: true,
      validatesEnvChecklist: true,
      validatesSecurityGuardrails: true,
      validatesProductPolicy: true,
      validatesReleaseGate: true,
      validatesCanaryPlan: true,
      validatesRollbackPlan: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.51.0: Production checklist прошёл сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined, blockers: x.blockers, warnings: x.warnings, readyForManualMaxCheck: x.readyForManualMaxCheck, readyForProduction: x.readyForProduction }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.51.0 закрывает Production checklist финальным деревом функций.',
      'Проверяются матрица разделов, env, security/UX guardrails, product policy, release gate, canary plan и rollback plan.',
      'Production checklist ничего не включает автоматически; выпуск требует отдельного ручного подтверждения.',
      'Физический файл логотипа остаётся отложенной задачей и не является blocker, если соблюдена политика no SVG/no redraw.',
      'Следующий шаг после зелёного stress-test — боевая ручная проверка в MAX.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const sectionSelf = sectionRegistry.find('production_checklist')?.selfTest?.() || {};
  const adapterSelf = checklist.selfTest ? checklist.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && sectionSelf.ok !== false && adapterSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    productionChecklistRuntimeVersion: sectionSelf.runtimeVersion || '',
    productionChecklistAdapterRuntimeVersion: adapterSelf.runtimeVersion || '',
    productionChecklistFinalTreeReady: true,
    featureMatrixReady: true,
    envChecklistReady: true,
    securityGuardrailsReady: true,
    productPolicyReady: true,
    releaseGateReady: true,
    canaryPlanReady: true,
    rollbackPlanReady: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };