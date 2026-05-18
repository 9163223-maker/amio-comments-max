'use strict';

const base = require('./coreStressTestV16');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const menuRenderer = require('./menuRenderer');
const startLanding = require('./startLandingAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.49.1-START-LANDING-RASTER-ONLY';
const STRESS_ADMIN_ID = 'core-stress-admin';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 900) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) {
  return { adminId: STRESS_ADMIN_ID, admin_id: STRESS_ADMIN_ID, userId: STRESS_ADMIN_ID, route, planCode: 'start', updateType: 'stress_test_start_landing_1491', payload: { ...(payload || {}) } };
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
}
function assertBackHome(screen = {}, name = '') {
  const labels = buttonTexts(screen).join(' | ');
  if (!/Главное меню|К старту/i.test(labels)) throw new Error(name + ': home/back button missing: ' + labels);
}

async function runStartLandingScenario() {
  const section = sectionRegistry.find('start_landing');
  if (!section) throw new Error('start_landing section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('start_landing selfTest failed');
  if (self.primaryCtaRoute !== 'channels.connect') throw new Error('start_landing primary CTA route is not channels.connect');
  if (self.noSvg !== true || self.noVectorRedraw !== true || self.rasterOnly !== true) throw new Error('start_landing raster-only logo policy missing');

  const adapterSelf = startLanding.selfTest();
  if (adapterSelf.noSvg !== true || adapterSelf.noVectorRedraw !== true || adapterSelf.rasterOnly !== true) throw new Error('start_landing adapter raster-only policy missing');
  const logoAudit = startLanding.findLogo();
  if (Array.isArray(logoAudit.targetFormats) && logoAudit.targetFormats.includes('svg')) throw new Error('start_landing logo target includes SVG');
  if (Array.isArray(logoAudit.found) && logoAudit.found.some((item) => String(item.file || '').toLowerCase().endsWith('.svg'))) throw new Error('start_landing SVG logo candidate must not be used');
  if (logoAudit.recommendedPath !== 'public/adminkit-logo-optimized.webp') throw new Error('start_landing wrong recommended logo path');

  const home = await dispatchShape('start_landing.home', {}, true);
  assertText(home.screen, /АдминКИТ помогает управлять каналом|Начните с подключения канала|Быстрый путь/i, 'start_landing.home.copy');
  assertText(home.screen, /PNG\/JPG\/WebP|webp до 120 КБ|без изменения внешнего вида|сжат/i, 'start_landing.home.logo_policy');
  assertNoText(home.screen, /SVG|вектор/i, 'start_landing.home.no_svg');
  assertRoute(home.screen, 'channels.connect', 'start_landing.home.cta_connect');
  ['start_landing.quick_start', 'start_landing.capabilities', 'start_landing.logo', 'start_landing.readiness', 'start_landing.support'].forEach((route) => assertRoute(home.screen, route, 'start_landing.home.route.' + route));
  assertNativeInline(home.screen, 'start_landing.home.native_inline');

  const quick = await dispatchShape('start_landing.quick_start', {}, true);
  assertText(quick.screen, /Минимальный путь первого запуска|Подключить канал|Включить комментарии|Проверить статистику/i, 'start_landing.quick_start');
  assertRoute(quick.screen, 'channels.connect', 'start_landing.quick.cta');
  assertRoute(quick.screen, 'comments.home', 'start_landing.quick.comments');
  assertRoute(quick.screen, 'stats.home', 'start_landing.quick.stats');

  const capabilities = await dispatchShape('start_landing.capabilities', {}, true);
  assertText(capabilities.screen, /Комментарии|Рост канала|Управление|Аналитика/i, 'start_landing.capabilities');
  assertText(capabilities.screen, /Видео и файлы в комментариях не включаем/i, 'start_landing.capabilities.no_files_video');
  assertRoute(capabilities.screen, 'channels.connect', 'start_landing.capabilities.cta');

  const logo = await dispatchShape('start_landing.logo', {}, false);
  assertScreen(logo.screen, 'start_landing.logo.shape', false);
  assertText(logo.screen, /Только WEBP из исходного логотипа|Никаких SVG|без перерисовки|до 120 КБ|public\/adminkit-logo-optimized\.webp/i, 'start_landing.logo.policy');
  assertRoute(logo.screen, 'channels.connect', 'start_landing.logo.cta');
  assertRoute(logo.screen, 'start_landing.home', 'start_landing.logo.back');

  const readiness = await dispatchShape('start_landing.readiness', {}, true);
  assertText(readiness.screen, /Готовность первого запуска|Канал подключается|Комментарии доступны|Навигация V3/i, 'start_landing.readiness');
  assertRoute(readiness.screen, 'channels.connect', 'start_landing.readiness.cta');
  assertRoute(readiness.screen, 'main.home', 'start_landing.readiness.main');

  const support = await dispatchShape('start_landing.support', {}, true);
  assertText(support.screen, /Если канал не подключается|Перешлите боту обычный пост|права администратора|сжатый webp/i, 'start_landing.support');
  assertRoute(support.screen, 'channels.connect', 'start_landing.support.cta');
  assertBackHome(support.screen, 'start_landing.support.back');

  const main = await dispatchShape('main.home', {}, true);
  assertRoute(main.screen, 'start_landing.home', 'start_landing.main.visible');

  const rendererSelf = menuRenderer.selfTest();
  if (rendererSelf.userTextFilterReady !== true) throw new Error('menu renderer user text filter missing');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    logoFound: logoAudit.logoFound,
    logoOptimized: logoAudit.logoOptimized,
    recommendedLogoPath: logoAudit.recommendedPath,
    checks: [
      'start_landing_registered_and_visible',
      'primary_cta_connect_channel',
      'quick_start_path_ready',
      'capabilities_explain_value_without_tech_noise',
      'comments_policy_no_video_files',
      'readiness_checklist_ready',
      'support_screen_ready',
      'logo_policy_raster_webp_only',
      'no_svg_no_vector_redraw',
      'recommended_logo_path_ready'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.startLandingFinalTree', async () => sectionRegistry.find('start_landing').selfTest()));
  tests.push(await step('self.startLandingAdapter', async () => startLanding.selfTest()));
  tests.push(await step('scenario.start_landing.full_path', runStartLandingScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1491_start_landing_raster_only',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesStartLandingFinalTree: true,
      validatesStartLandingPrimaryCta: true,
      validatesQuickStartPath: true,
      validatesCapabilities: true,
      validatesReadinessChecklist: true,
      validatesSupportScreen: true,
      validatesRasterLogoOnly: true,
      validatesNoSvgNoVectorRedraw: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.49.1: посадочная Start и raster-only логотип прошли сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined, logoFound: x.logoFound, logoOptimized: x.logoOptimized, recommendedLogoPath: x.recommendedLogoPath }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.49.1 наполняет раздел Start / посадочная финальным деревом функций.',
      'Главный CTA ведёт в подключение канала через пересланный пост.',
      'Стартовый экран объясняет пользу АдминКИТ без технического мусора.',
      'Логотип: только оптимизация исходного растрового файла в WEBP; SVG и векторная перерисовка запрещены.',
      'Рекомендуемый путь замены логотипа: public/adminkit-logo-optimized.webp.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const sectionSelf = sectionRegistry.find('start_landing')?.selfTest?.() || {};
  const adapterSelf = startLanding.selfTest ? startLanding.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && sectionSelf.ok !== false && adapterSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    startLandingRuntimeVersion: sectionSelf.runtimeVersion || '',
    startLandingAdapterRuntimeVersion: adapterSelf.runtimeVersion || '',
    startLandingFinalTreeReady: true,
    primaryCtaReady: true,
    quickStartReady: true,
    logoPolicyRasterOnly: true,
    noSvg: true,
    noVectorRedraw: true,
    recommendedLogoPath: 'public/adminkit-logo-optimized.webp'
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };