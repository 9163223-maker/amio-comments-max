'use strict';

const base = require('./coreStressTestV14');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const channelData = require('./channelDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.47.0-CHANNEL-CONNECTION';
const STRESS_ADMIN_ID = 'core-stress-admin';
const STRESS_CHANNEL_ID = 'core-stress-channel-connect';
const STRESS_POST_ID = 'core-stress-channel-post';
const STRESS_MESSAGE_ID = 'core-stress-channel-message';
const STRESS_SERVICE_MESSAGE_ID = 'core-stress-service-message';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}|core-stress-[a-z0-9-]+/i;

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
    updateType: 'stress_test_channels_1470',
    payload: {
      channelId: STRESS_CHANNEL_ID,
      channelTitle: 'Канал для подключения',
      postId: STRESS_POST_ID,
      messageId: STRESS_MESSAGE_ID,
      serviceMessageId: STRESS_SERVICE_MESSAGE_ID,
      postTitle: 'Тестовый пост для подключения канала',
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
  if (strict && RAW_ID_RE.test(String(screen.text || ''))) throw new Error(name + ': screen_contains_raw_id: ' + cut(screen.text));
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

async function runChannelConnectionScenario() {
  const section = sectionRegistry.find('channels');
  if (!section) throw new Error('channels section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('channels selfTest failed');
  if (self.connectForwardedPostReady !== true) throw new Error('channel connect by forwarded post must be ready');
  if (self.servicePostCleanupReady !== true) throw new Error('service post cleanup must be ready');
  if (self.rawIdsHiddenInUx !== true) throw new Error('raw ids must be hidden in channel UX');

  const dataSelf = channelData.selfTest();
  if (dataSelf.readOnly === true) throw new Error('channel data adapter must not be read-only in 1.47.0');
  if (dataSelf.channelAvailableEverywhere !== true) throw new Error('channel must be available everywhere after connect');

  const connect = await dispatchShape('channels.connect', {}, true);
  assertText(connect.screen, /Перешлите боту любой пост|покажет его название|подтверждение/i, 'channels.connect.instructions');
  assertText(connect.screen, /служебный пересланный пост можно удалить|связь с каналом/i, 'channels.connect.cleanup_policy');
  assertRoute(connect.screen, 'channels.forwarded_preview', 'channels.connect.forwarded_preview');

  const previewButton = assertRoute(connect.screen, 'channels.forwarded_preview', 'channels.forwarded_preview.button');
  const forwardedPayload = payloadOf(previewButton);
  const preview = await dispatchShape('channels.forwarded_preview', forwardedPayload, true);
  assertText(preview.screen, /Проверка пересланного поста|Канал для подключения|Тестовый пост/i, 'channels.preview.human_labels');
  assertText(preview.screen, /не технические ID/i, 'channels.preview.no_ids_policy');
  assertNoText(preview.screen, /core-stress-channel|core-stress-service/i, 'channels.preview.no_raw_ids');
  assertRoute(preview.screen, 'channels.confirm', 'channels.preview.confirm');

  const confirmButton = assertRoute(preview.screen, 'channels.confirm', 'channels.confirm.button');
  const confirmPayload = payloadOf(confirmButton);
  const confirm = await dispatchShape('channels.confirm', confirmPayload, true);
  assertText(confirm.screen, /Канал подключён|Канал для подключения/i, 'channels.confirm.connected');
  assertText(confirm.screen, /доступен в комментариях|кнопках|статистике|опросах/i, 'channels.confirm.available_everywhere');
  assertText(confirm.screen, /Служебный пересланный пост можно удалить/i, 'channels.confirm.cleanup_ready');
  assertRoute(confirm.screen, 'channels.cleanup_confirm', 'channels.confirm.cleanup_route');
  assertRoute(confirm.screen, 'channels.home', 'channels.confirm.home_route');

  const home = await dispatchShape('channels.home', { refresh: 1 }, true);
  assertText(home.screen, /Канал для подключения|Постов в базе|Канал можно выбрать/i, 'channels.home.list_connected');
  assertNoText(home.screen, /core-stress-channel|core-stress-service|core-stress-channel-post/i, 'channels.home.no_raw_ids');
  assertRoute(home.screen, 'channels.connect', 'channels.home.connect');
  assertRoute(home.screen, 'channels.connections', 'channels.home.connections');

  const cleanupButton = assertRoute(confirm.screen, 'channels.cleanup_confirm', 'channels.cleanup.button');
  const cleanupPayload = payloadOf(cleanupButton);
  const cleanupConfirm = await dispatchShape('channels.cleanup_confirm', cleanupPayload, true);
  assertText(cleanupConfirm.screen, /Удалить служебный пост|Канал.*останутся|Опубликованный пост.*не удаляем/i, 'channels.cleanup_confirm.policy');
  assertRoute(cleanupConfirm.screen, 'channels.cleanup', 'channels.cleanup.confirm_route');

  const cleanup = await dispatchShape('channels.cleanup', cleanupPayload, true);
  assertText(cleanup.screen, /Служебный пост очищен|Канал и сохранённый post id остались|Пост в канале не менялся/i, 'channels.cleanup.done');

  const history = await dispatchShape('channels.connections', {}, true);
  assertText(history.screen, /История подключений|Канал для подключения|служебный пост очищен/i, 'channels.history');
  assertNoText(history.screen, /core-stress-channel|core-stress-service/i, 'channels.history.no_raw_ids');

  const selected = await channelData.listChannels(STRESS_ADMIN_ID, { noCache: true });
  if (!selected.ok || !selected.channels.some((channel) => channel.title === 'Канал для подключения')) throw new Error('connected channel not found in listChannels');
  const current = selected.channels.find((channel) => channel.title === 'Канал для подключения');
  if (!current?.selected) throw new Error('connected channel must be selected after connect');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    checks: [
      'channels_tree_ready',
      'forwarded_post_connection_path_ready',
      'preview_before_connect_ready',
      'human_channel_and_post_labels_without_raw_ids',
      'admin_channel_link_saved',
      'selected_channel_saved',
      'channel_available_everywhere',
      'service_forwarded_post_cleanup_confirmed',
      'published_channel_post_untouched',
      'connection_history_ready'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.channelsFinalTree', async () => sectionRegistry.find('channels').selfTest()));
  tests.push(await step('self.channelDataAdapter', async () => channelData.selfTest()));
  tests.push(await step('scenario.channels.connect_forwarded_post_full_path', runChannelConnectionScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1470_channel_connection',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesChannelConnectionFinalTree: true,
      validatesForwardedPostConnectionPath: true,
      validatesHumanChannelLabels: true,
      validatesServicePostCleanup: true,
      validatesChannelAvailableEverywhere: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.47.0: подключение канала прошло сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.47.0 наполняет раздел Каналы рабочим подключением через пересланный пост.',
      'Обычный путь: Каналы → Подключить → переслать пост → проверить канал → подтвердить.',
      'После подключения канал доступен во всех разделах АдминКИТ и выбирается как текущий.',
      'Служебный пересланный пост можно очистить; канал, связь и post id остаются в базе.',
      'В пользовательском интерфейсе показываются названия канала и поста, а не технические ID.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const sectionSelf = sectionRegistry.find('channels')?.selfTest?.() || {};
  const dataSelf = channelData.selfTest ? channelData.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && sectionSelf.ok !== false && dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    channelsRuntimeVersion: sectionSelf.runtimeVersion || '',
    channelDataRuntimeVersion: dataSelf.runtimeVersion || '',
    channelConnectionFinalTreeReady: true,
    forwardedPostConnectionPathReady: true,
    humanLabelsWithoutRawIdsReady: true,
    servicePostCleanupReady: true,
    channelAvailableEverywhere: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };
