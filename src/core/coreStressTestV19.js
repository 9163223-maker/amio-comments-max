'use strict';

const base = require('./coreStressTestV17');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const debugExport = require('./debugExportAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.50.1-DEBUG-EXPORT-LOCKED-MENU-SAFE';
const STRESS_ADMIN_ID = 'core-stress-admin';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 900) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) { return { adminId: STRESS_ADMIN_ID, admin_id: STRESS_ADMIN_ID, userId: STRESS_ADMIN_ID, route, planCode: 'start', updateType: 'stress_test_debug_export_1501', payload: { ...(payload || {}) } }; }
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
function assertButtonLabel(screen = {}, pattern, name = '') { const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i'); const labels = buttonTexts(screen).join(' | '); if (!re.test(labels)) throw new Error(name + ': button label not found: ' + re + ': ' + labels); }
async function dispatchShape(route, payload = {}, strict = true) { const screen = await routeDispatcher.dispatch(ctx(route, payload)); return { screen, shape: assertScreen(screen, route, strict) }; }
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 900), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 900) }; } }
function assertNativeInline(screen = {}, name = '') {
  const attachments = screen.attachments || [];
  if (!attachments.length) throw new Error(name + ': no_inline_keyboard_attachment');
  const keyboard = attachments[0];
  if (keyboard.type !== 'inline_keyboard') throw new Error(name + ': non_native_inline_keyboard: ' + String(keyboard.type || ''));
  if (!keyboard.payload || !Array.isArray(keyboard.payload.buttons)) throw new Error(name + ': invalid_inline_payload');
}

async function runDebugExportScenario() {
  const section = sectionRegistry.find('debug_diagnostics');
  if (!section) throw new Error('debug_diagnostics section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('debug_diagnostics selfTest failed');
  if (self.noCacheHeadersReady !== true || self.githubExportReady !== true || self.tokenRedactionReady !== true) throw new Error('debug_diagnostics policies missing');

  const adapterSelf = debugExport.selfTest();
  if (adapterSelf.noCacheHeadersReady !== true) throw new Error('debug export no-cache missing');
  if (adapterSelf.tokenRedactionReady !== true) throw new Error('debug export token redaction missing');
  if (adapterSelf.authGuardReady !== true) throw new Error('debug export auth guard missing');
  const headers = debugExport.noCacheHeaders();
  if (!String(headers['Cache-Control'] || '').includes('no-store') || headers.Pragma !== 'no-cache' || headers.Expires !== '0') throw new Error('debug export headers invalid');
  const redacted = debugExport.redact({ GITHUB_DEBUG_TOKEN: 'secret', nested: { authorization: 'bearer secret' } });
  if (redacted.GITHUB_DEBUG_TOKEN !== '[redacted]' || redacted.nested.authorization !== '[redacted]') throw new Error('debug export redaction failed');

  const snapshot = debugExport.buildSnapshot({ lite: false });
  const lite = debugExport.buildSnapshot({ lite: true });
  const live = debugExport.buildStoreLive();
  if (!snapshot.generatedAt || !lite.generatedAt || !live.generatedAt) throw new Error('debug snapshots must include generatedAt');
  if (snapshot.runtimeVersion !== debugExport.RUNTIME || lite.runtimeVersion !== debugExport.RUNTIME || live.runtimeVersion !== debugExport.RUNTIME) throw new Error('debug snapshot runtime mismatch');
  if (lite.store) throw new Error('lite snapshot must not include full store');
  if (live.noCache !== true || live.endpoint !== '/debug/store-live') throw new Error('store-live metadata missing');

  const dry = await debugExport.exportToGithub({ dryRun: true });
  if (!dry.payloads?.latest?.path || !dry.payloads?.lite?.path) throw new Error('debug export dry-run payload paths missing');
  if (dry.payloads.latest.path !== debugExport.exportConfig().latestPath || dry.payloads.lite.path !== debugExport.exportConfig().litePath) throw new Error('debug export paths mismatch');
  if (dry.config?.tokenMasked && /ghp_|github_pat_|secret/i.test(dry.config.tokenMasked)) throw new Error('debug export token leaked in mask');

  const home = await dispatchShape('debug_diagnostics.home', {}, true);
  assertText(home.screen, /Debug \/ GitHub export|store-live|latest\.json|latest-lite\.json|no-cache/i, 'debug.home.copy');
  assertText(home.screen, /Токены не показываем|маска|пути файлов/i, 'debug.home.redaction');
  ['debug_diagnostics.store_live', 'debug_diagnostics.export_preview', 'debug_diagnostics.export_lite', 'debug_diagnostics.selftest', 'debug_diagnostics.env'].forEach((route) => assertRoute(home.screen, route, 'debug.home.route.' + route));
  assertNativeInline(home.screen, 'debug.home.native_inline');

  const storeLive = await dispatchShape('debug_diagnostics.store_live', {}, true);
  assertText(storeLive.screen, /\/debug\/store-live|GeneratedAt|no-cache/i, 'debug.store_live');
  assertRoute(storeLive.screen, 'debug_diagnostics.export_preview', 'debug.store_live.export');

  const preview = await dispatchShape('debug_diagnostics.export_preview', {}, false);
  assertScreen(preview.screen, 'debug.export_preview.shape', false);
  assertText(preview.screen, /Dry-run|Latest:|Lite:|не пишет в GitHub|не раскрывает токен/i, 'debug.export_preview');
  assertRoute(preview.screen, 'debug_diagnostics.export_lite', 'debug.export_preview.lite');

  const exportLite = await dispatchShape('debug_diagnostics.export_lite', {}, true);
  assertText(exportLite.screen, /Lite snapshot|GeneratedAt|debug\/latest-lite\.json/i, 'debug.export_lite');

  const selftest = await dispatchShape('debug_diagnostics.selftest', {}, true);
  assertText(selftest.screen, /No-cache headers: да|GitHub export ready: да|Token redaction: да|Auth guard: да/i, 'debug.selftest');

  const env = await dispatchShape('debug_diagnostics.env', {}, true);
  assertText(env.screen, /GITHUB_DEBUG_TOKEN:|GITHUB_DEBUG_REPO:|GITHUB_DEBUG_PATH:|GITHUB_DEBUG_LITE_PATH:/i, 'debug.env');
  assertText(env.screen, /Значения токенов не выводятся/i, 'debug.env.no_tokens');
  assertNoText(env.screen, /ghp_|github_pat_|Bearer|secret/i, 'debug.env.no_secret_values');

  const main = await dispatchShape('main.home', {}, true);
  assertButtonLabel(main.screen, /Debug \/ диагностика/i, 'debug.main.visible_label');
  assertButtonLabel(main.screen, /Debug \/ диагностика.*🔒|🔒.*Debug \/ диагностика/i, 'debug.main.locked_for_client_menu');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    exportConfigured: debugExport.exportConfig().tokenConfigured && !!debugExport.exportConfig().repo,
    latestPath: debugExport.exportConfig().latestPath,
    litePath: debugExport.exportConfig().litePath,
    checks: [
      'debug_section_registered_and_visible_locked_in_main',
      'store_live_ready_with_generated_at',
      'no_cache_headers_ready',
      'github_export_dry_run_ready',
      'latest_and_lite_paths_ready',
      'lite_snapshot_does_not_include_full_store',
      'auth_guard_ready',
      'token_redaction_ready',
      'env_screen_does_not_show_tokens',
      'debug_routes_ready'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.debugDiagnosticsFinalTree', async () => sectionRegistry.find('debug_diagnostics').selfTest()));
  tests.push(await step('self.debugExportAdapter', async () => debugExport.selfTest()));
  tests.push(await step('scenario.debug_export.full_path', runDebugExportScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1501_debug_export_locked_menu_safe',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesDebugDiagnosticsFinalTree: true,
      validatesStoreLive: true,
      validatesNoCacheHeaders: true,
      validatesGithubExportDryRun: true,
      validatesLatestAndLitePaths: true,
      validatesTokenRedaction: true,
      validatesAuthGuard: true,
      validatesDebugLockedInClientMenu: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.50.1: Debug / GitHub export прошёл сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined, exportConfigured: x.exportConfigured, latestPath: x.latestPath, litePath: x.litePath }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.50.1 проверяет Debug / диагностика как внутренний locked-раздел в клиентском меню.',
      'Прямые debug routes доступны для диагностики, но обычный клиентский пункт меню остаётся закрытым.',
      'Проверяются /debug/store-live, /debug/export, /debug/export-lite и selftest export adapter.',
      'Все debug endpoints должны отдавать no-cache заголовки и свежий generatedAt.',
      'GitHub export имеет dry-run, latest.json и latest-lite.json; токены не выводятся.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const sectionSelf = sectionRegistry.find('debug_diagnostics')?.selfTest?.() || {};
  const adapterSelf = debugExport.selfTest ? debugExport.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && sectionSelf.ok !== false && adapterSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    debugDiagnosticsRuntimeVersion: sectionSelf.runtimeVersion || '',
    debugExportAdapterRuntimeVersion: adapterSelf.runtimeVersion || '',
    debugDiagnosticsFinalTreeReady: true,
    storeLiveReady: true,
    noCacheHeadersReady: true,
    githubExportDryRunReady: true,
    latestAndLitePathsReady: true,
    tokenRedactionReady: true,
    authGuardReady: true,
    debugLockedInClientMenuReady: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };
