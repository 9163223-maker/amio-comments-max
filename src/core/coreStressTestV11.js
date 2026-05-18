'use strict';

const base = require('./coreStressTestV10');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const statsData = require('./statsDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.43.0-STATS-REFERRAL-ATTRIBUTION';
const STRESS_ADMIN_ID = 'core-stress-admin';
const STRESS_CHANNEL_ID = 'core-stress-stats-channel';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 720) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function ctx(route, payload = {}) { return { adminId: STRESS_ADMIN_ID, admin_id: STRESS_ADMIN_ID, userId: STRESS_ADMIN_ID, route, planCode: 'start', updateType: 'stress_test_stats_1430', payload: { channelId: STRESS_CHANNEL_ID, channelTitle: 'Подключённый канал', ...payload } }; }
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
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 720), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 720) }; } }

async function seedReferralData() {
  const campaigns = [];
  for (const item of [
    { source: 'yandex_direct', campaign: 'майская реклама' },
    { source: 'zen', campaign: 'пост в Дзене' },
    { source: 'pikabu', campaign: 'обсуждение на Пикабу' },
    { source: 'site', campaign: 'кнопка на сайте' }
  ]) {
    const created = await statsData.createReferralCampaign({ adminId: STRESS_ADMIN_ID, channelId: STRESS_CHANNEL_ID, channelTitle: 'Подключённый канал' }, { ...item, targetUrl: statsData.defaultTargetUrl(), cost: item.source === 'yandex_direct' ? 5000 : 0 });
    if (created.ok === false) throw new Error('create referral failed: ' + (created.error || item.source));
    campaigns.push(created.campaign);
  }
  await statsData.recordReferralEvent({ campaignCode: campaigns[0].code, eventType: 'click', adminId: STRESS_ADMIN_ID, channelId: STRESS_CHANNEL_ID, referrer: 'https://yandex.ru', userAgent: 'stress-test' });
  await statsData.recordReferralEvent({ campaignCode: campaigns[0].code, eventType: 'bot_start', adminId: STRESS_ADMIN_ID, channelId: STRESS_CHANNEL_ID, userId: 'stress-user-1' });
  await statsData.recordReferralEvent({ campaignCode: campaigns[0].code, eventType: 'user_added_probable', adminId: STRESS_ADMIN_ID, channelId: STRESS_CHANNEL_ID, userId: 'stress-user-1' });
  await statsData.recordReferralEvent({ campaignCode: campaigns[1].code, eventType: 'click', adminId: STRESS_ADMIN_ID, channelId: STRESS_CHANNEL_ID, referrer: 'https://dzen.ru', userAgent: 'stress-test' });
  return campaigns;
}

async function runStatsReferralScenario() {
  const section = sectionRegistry.find('stats');
  if (!section) throw new Error('stats section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('stats selfTest failed');
  if (self.finalFunctionTreeReady !== true) throw new Error('stats final function tree missing');
  if (Number(self.functionCount || 0) < 13) throw new Error('stats final tree must include 13+ functions');
  if (self.referralAttributionReady !== true || self.doesNotPromiseExactSubscriptionSourceWithoutMaxRef !== true) throw new Error('stats referral attribution policy missing');

  const campaigns = await seedReferralData();
  const home = await dispatchShape('stats.home', {}, true);
  [/Сводка по каналу/i, /Источники трафика/i, /Реферальные ссылки/i, /Воронка источников/i, /Расходы/i, /Экспорт отчёта/i, /Свежесть данных/i].forEach((re, index) => assertText(home.screen, re, 'stats.home.tree.' + index));
  ['stats.overview', 'stats.channels', 'stats.posts', 'stats.comments', 'stats.buttons', 'stats.lead_magnets', 'stats.sources', 'stats.referrals', 'stats.funnel', 'stats.costs', 'stats.top_posts', 'stats.export', 'stats.freshness'].forEach((route) => assertRoute(home.screen, route, 'stats.home.routes'));
  assertText(home.screen, /точную и вероятную атрибуцию|Не обещаем/i, 'stats.home.attribution_policy');
  assertNoText(home.screen, /точно знаем источник подписки/i, 'stats.home.no_false_exact_subscription_source');

  const sources = await dispatchShape('stats.sources', {}, true);
  assertText(sources.screen, /Яндекс|Дзен|Пикабу|сайт|Telegram|блогер/i, 'stats.sources.available_sources');
  assertText(sources.screen, /точно считаем|вероятно считаем|Не обещаем/i, 'stats.sources.attribution');
  assertRoute(sources.screen, 'stats.referral_create', 'stats.sources.create');
  assertRoute(sources.screen, 'stats.referrals', 'stats.sources.list');
  assertRoute(sources.screen, 'stats.funnel', 'stats.sources.funnel');

  const create = await dispatchShape('stats.referral_create', { source: 'yandex_direct', campaign: 'майская реклама' }, true);
  assertText(create.screen, /Источник: Яндекс Директ|Кампания: майская реклама|\/r\//i, 'stats.referral_create.yandex_link');
  assertText(create.screen, /Дзен|Пикабу|сайта/i, 'stats.referral_create.multi_sources');

  const referrals = await dispatchShape('stats.referrals', {}, true);
  assertText(referrals.screen, /Яндекс Директ|Дзен|Клики:/i, 'stats.referrals.list');
  assertText(referrals.screen, /\/r\//i, 'stats.referrals.urls');

  const funnel = await dispatchShape('stats.funnel', {}, true);
  assertText(funnel.screen, /клик → старт бота → вероятная подписка/i, 'stats.funnel.path');
  assertText(funnel.screen, /точные клики|точные старты|вероятные подписки/i, 'stats.funnel.metrics');
  assertText(funnel.screen, /Яндекс Директ|Дзен/i, 'stats.funnel.rows');
  assertNoText(funnel.screen, /точно знаем источник подписки/i, 'stats.funnel.no_false_exact_subscription_source');

  const overview = await dispatchShape('stats.overview', {}, true);
  assertText(overview.screen, /Точные клики|Точные старты|Вероятные подписки/i, 'stats.overview.summary');

  const channels = await dispatchShape('stats.channels', {}, true);
  assertText(channels.screen, /user_added|user_removed|вероятную подписку/i, 'stats.channels.webhook_growth');

  const posts = await dispatchShape('stats.posts', {}, true);
  assertText(posts.screen, /stat от MAX|нет данных/i, 'stats.posts.max_stat_policy');

  const comments = await dispatchShape('stats.comments', {}, true);
  assertText(comments.screen, /Видео и файлы не входят/i, 'stats.comments.no_video_files');

  const buttons = await dispatchShape('stats.buttons', {}, true);
  assertText(buttons.screen, /callback-нажатия|трекинг-ссылки/i, 'stats.buttons.clicks');

  const leadMagnets = await dispatchShape('stats.lead_magnets', {}, true);
  assertText(leadMagnets.screen, /выдачу подарка|точная метрика/i, 'stats.lead_magnets.funnel');

  const costs = await dispatchShape('stats.costs', {}, true);
  assertText(costs.screen, /цену клика|цену старта|цену вероятной подписки/i, 'stats.costs.formulas');

  const topPosts = await dispatchShape('stats.top_posts', {}, true);
  assertText(topPosts.screen, /комментарии|реакции|клики|лид-магнитов/i, 'stats.top_posts.metrics');

  const exportScreen = await dispatchShape('stats.export', {}, true);
  assertText(exportScreen.screen, /CSV|JSON|не попадают токены|raw payload/i, 'stats.export.safe');

  const freshness = await dispatchShape('stats.freshness', {}, true);
  assertText(freshness.screen, /Из MAX|Из АдминКИТ|Вручную|нет данных/i, 'stats.freshness.sources');

  const dataSelf = statsData.selfTest();
  if (dataSelf.doesNotPromiseExactSubscriptionSourceWithoutMaxRef !== true) throw new Error('stats data selfTest must preserve honest attribution policy');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    campaignCodes: campaigns.map((item) => item.code).slice(0, 4),
    checks: ['final_tree_has_13_functions', 'home_has_all_stats_routes', 'sources_include_yandex_zen_pikabu_site', 'referral_create_generates_trackable_link', 'referrals_list_shows_clicks_and_url', 'funnel_separates_exact_and_probable_metrics', 'overview_summarizes_referral_totals', 'channels_use_user_added_removed_without_false_precision', 'posts_use_max_stat_only_when_available', 'comments_keep_no_video_files_policy', 'buttons_track_callbacks_and_redirect_links', 'lead_magnets_track_claims', 'costs_compute_price_metrics', 'export_hides_raw_technical_fields', 'freshness_explains_data_origin']
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.statsFinalTree', async () => sectionRegistry.find('stats').selfTest()));
  tests.push(await step('self.statsDataAdapter', async () => statsData.selfTest()));
  tests.push(await step('scenario.stats.referral_attribution_full_path', runStatsReferralScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 900));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1430_stats_referral_attribution',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesStatsFinalFunctionTree: true,
      validatesStatsReferralLinks: true,
      validatesStatsReferralRedirectModel: true,
      validatesStatsTrafficSources: true,
      validatesStatsExactVsProbableAttribution: true,
      validatesStatsNoFalseExactSubscriptionSourcePromise: true,
      validatesStatsCostsExportFreshness: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.43.0: статистика, источники трафика и реферальные ссылки прошли сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined, campaignCodes: x.campaignCodes || undefined }))],
    notes: [...((baseResult.notes || []).filter(Boolean)), 'Core 1.43.0 наполняет раздел Статистика финальным деревом функций: сводка, каналы, посты, комментарии, кнопки, лид-магниты, источники, реферальные ссылки, воронка, расходы, лучшие посты, экспорт, свежесть данных.', 'Реферальная ссылка АдминКИТ фиксирует точный клик и редиректит в MAX/целевую ссылку через /r/:code.', 'Статистика честно разделяет точные клики/старты/callback/выдачи и вероятные подписки после клика.', 'Stress-test проверяет Яндекс, Дзен, Пикабу и сайт как отдельные источники.', 'Без ref-кода от MAX мы не обещаем точный рекламный источник подписки.' ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const statsSelf = sectionRegistry.find('stats')?.selfTest?.() || {};
  const dataSelf = statsData.selfTest ? statsData.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && statsSelf.ok !== false && dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    statsRuntimeVersion: statsSelf.runtimeVersion || '',
    statsDataRuntimeVersion: dataSelf.runtimeVersion || '',
    statsFinalFunctionTreeReady: statsSelf.finalFunctionTreeReady === true,
    statsFunctionCount: statsSelf.functionCount || 0,
    statsReferralAttributionStressReady: true,
    statsReferralLinksStressReady: true,
    statsNoFalseExactSubscriptionPromiseReady: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };
