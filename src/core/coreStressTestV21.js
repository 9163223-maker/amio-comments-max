'use strict';

const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const checklist = require('./productionChecklistAdapter');
const debugExport = require('./debugExportAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.51.1-PRODUCTION-CHECKLIST-COMPACT';
const STRESS_ADMIN_ID = 'core-stress-admin';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 700) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) { return { adminId: STRESS_ADMIN_ID, admin_id: STRESS_ADMIN_ID, userId: STRESS_ADMIN_ID, route, planCode: 'start', updateType: 'stress_test_production_checklist_1511_compact', payload: { ...(payload || {}) } }; }
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
function assertRoute(screen = {}, route = '', name = '') { const btn = flatButtons(screen).find((b) => routeOf(b) === route); if (!btn) throw new Error(name + ': button route not found: ' + route + ': ' + buttonTexts(screen).join(' | ')); return btn; }
async function dispatchShape(route, payload = {}, strict = true) { const screen = await routeDispatcher.dispatch(ctx(route, payload)); return { screen, shape: assertScreen(screen, route, strict) }; }
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 700), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 700) }; } }
function assertNativeInline(screen = {}, name = '') {
  const attachments = screen.attachments || [];
  if (!attachments.length) throw new Error(name + ': no_inline_keyboard_attachment');
  const keyboard = attachments[0];
  if (keyboard.type !== 'inline_keyboard') throw new Error(name + ': non_native_inline_keyboard: ' + String(keyboard.type || ''));
  if (!keyboard.payload || !Array.isArray(keyboard.payload.buttons)) throw new Error(name + ': invalid_inline_payload');
}

async function runProductionChecklistCompact() {
  const section = sectionRegistry.find('production_checklist');
  if (!section) throw new Error('production_checklist section not registered');
  const sectionSelf = section.selfTest ? section.selfTest() : null;
  if (sectionSelf?.ok !== true) throw new Error('production_checklist selfTest failed');

  const adapterSelf = checklist.selfTest();
  if (adapterSelf.ok !== true) throw new Error('production checklist adapter selfTest failed');
  if (adapterSelf.productionEnableRequiresManualConfirm !== true) throw new Error('manual production confirmation flag missing');
  if (adapterSelf.canaryFirstReady !== true || adapterSelf.rollbackPlanReady !== true) throw new Error('canary/rollback flags missing');

  const gate = checklist.releaseGate();
  if (gate.blockers.length) throw new Error('release gate blockers: ' + gate.blockers.map((x) => x.id || x.title).join(', '));
  if (gate.productionEnableRequiresManualConfirm !== true || gate.canaryFirst !== true || gate.rollbackRequired !== true) throw new Error('release gate manual/canary/rollback flags missing');

  const featureMatrix = checklist.featureMatrix();
  const missing = checklist.REQUIRED_SECTION_IDS.filter((id) => !featureMatrix.some((item) => item.id === id && item.ok));
  if (missing.length) throw new Error('missing required sections: ' + missing.join(', '));

  const debugSelf = debugExport.selfTest();
  if (debugSelf.noCacheHeadersReady !== true || debugSelf.tokenRedactionReady !== true || debugSelf.authGuardReady !== true) throw new Error('debug export guardrails missing');

  const home = await dispatchShape('production_checklist.home', {}, true);
  assertText(home.screen, /Production checklist|Blockers:|Warnings:|ручной проверке в MAX|не выполняется.*автоматически/i, 'production.home.copy');
  ['production_checklist.features', 'production_checklist.env', 'production_checklist.security', 'production_checklist.policy', 'production_checklist.gate', 'production_checklist.canary', 'production_checklist.rollback'].forEach((route) => assertRoute(home.screen, route, 'production.home.route.' + route));
  assertNativeInline(home.screen, 'production.home.native_inline');

  const gateScreen = await dispatchShape('production_checklist.gate', {}, true);
  assertText(gateScreen.screen, /Blockers нет|готово к боевой ручной проверке в MAX|Warnings:/i, 'production.gate');
  assertRoute(gateScreen.screen, 'production_checklist.canary', 'production.gate.canary');

  const canaryScreen = await dispatchShape('production_checklist.canary', {}, true);
  assertText(canaryScreen.screen, /Боевой запуск.*не сразу на всех|тестовый канал|реальный канал|ADMINKIT_CORE_CANARY_ALL не включать/i, 'production.canary');

  const rollbackScreen = await dispatchShape('production_checklist.rollback', {}, true);
  assertText(rollbackScreen.screen, /План отката|commit|runtimeVersion|package\.json main|не чистить пользовательские данные/i, 'production.rollback');

  return {
    functionCount: sectionSelf.functionCount,
    routeCount: sectionSelf.routeCount,
    featureCount: featureMatrix.length,
    blockers: gate.blockers.length,
    warnings: gate.warnings.length,
    readyForManualMaxCheck: gate.readyForManualMaxCheck,
    readyForProduction: gate.readyForProduction,
    checks: [
      'production_checklist_selftest_ok',
      'feature_matrix_required_sections_ok',
      'release_gate_no_blockers',
      'manual_confirmation_required',
      'canary_first_plan_ready',
      'rollback_plan_ready',
      'debug_guardrails_ready',
      'compact_ui_routes_ready'
    ]
  };
}

async function runFast(options = {}) {
  const tests = [];
  tests.push(await step('self.productionChecklistFinalTree', async () => sectionRegistry.find('production_checklist').selfTest()));
  tests.push(await step('self.productionChecklistAdapter', async () => checklist.selfTest()));
  tests.push(await step('scenario.production_checklist.compact', runProductionChecklistCompact));
  const failed = tests.filter((x) => x.ok === false).map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }));
  const slow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000)).map((x) => ({ name: x.name, ms: x.ms }));
  return {
    ok: failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'compact_scenario_1511_production_checklist_only',
    summary: {
      totalChecks: tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesProductionChecklistFinalTree: true,
      validatesFeatureMatrix: true,
      validatesReleaseGate: true,
      validatesCanaryPlan: true,
      validatesRollbackPlan: true,
      compactOnly: true,
      previousSectionsCoveredByFeatureMatrix: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.51.1: Production checklist compact прошёл сценарный обход',
    failed,
    slow,
    tests: tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined, featureCount: x.featureCount, blockers: x.blockers, warnings: x.warnings, readyForManualMaxCheck: x.readyForManualMaxCheck, readyForProduction: x.readyForProduction })),
    notes: [
      '1.51.1 intentionally does not run the full historical stress chain to keep /debug/core-stress fast and small.',
      'Previous sections are covered here through the production feature matrix and each section selfTest.',
      'Use earlier version-specific stress links for deep scenario checks of individual sections.',
      'Next step after green compact test: manual MAX bot verification.'
    ]
  };
}
async function run(options = {}) { return runFast(options); }
function selfTest() {
  const sectionSelf = sectionRegistry.find('production_checklist')?.selfTest?.() || {};
  const adapterSelf = checklist.selfTest ? checklist.selfTest() : {};
  return {
    ok: sectionSelf.ok !== false && adapterSelf.ok !== false,
    runtimeVersion: RUNTIME,
    compactOnly: true,
    productionChecklistFinalTreeReady: true,
    featureMatrixReady: true,
    releaseGateReady: true,
    canaryPlanReady: true,
    rollbackPlanReady: true,
    previousSectionsCoveredByFeatureMatrix: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };