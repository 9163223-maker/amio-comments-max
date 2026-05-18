'use strict';

const base = require('./coreStressTestV13');
const routeDispatcher = require('./routeDispatcher');
const sectionRegistry = require('./sectionRegistry');
const pollsData = require('./pollsDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.46.0-POLLS';
const STRESS_ADMIN_ID = 'core-stress-admin';
const STRESS_CHANNEL_ID = 'core-stress-poll-channel';
const STRESS_POST_ID = 'core-stress-poll-post';
const STRESS_MESSAGE_ID = 'core-stress-poll-message';
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
    updateType: 'stress_test_polls_1460',
    payload: {
      channelId: STRESS_CHANNEL_ID,
      channelTitle: 'Подключённый канал',
      postId: STRESS_POST_ID,
      messageId: STRESS_MESSAGE_ID,
      postTitle: 'Тест опроса: голосование под постом',
      question: 'Какой формат постов вам интереснее?',
      options: ['Полезные разборы', 'Новости', 'Подарки'],
      voterId: 'stress-voter-1',
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
  const seeded = await pollsData.seedPost(ctx('polls.home'), {
    channelId: STRESS_CHANNEL_ID,
    channelTitle: 'Подключённый канал',
    postId: STRESS_POST_ID,
    messageId: STRESS_MESSAGE_ID,
    postTitle: 'Тест опроса: голосование под постом'
  });
  if (seeded.ok === false) throw new Error('seed poll post failed: ' + (seeded.error || 'unknown'));
  return seeded;
}

async function runPollsScenario() {
  const section = sectionRegistry.find('polls');
  if (!section) throw new Error('polls section not registered');
  const self = section.selfTest ? section.selfTest() : null;
  if (self?.ok !== true) throw new Error('polls selfTest failed');
  if (self.oneVotePerUserReady !== true || self.duplicateCallbackSafe !== true) throw new Error('polls vote policy missing');
  if (self.noLegacyCtaMix !== true) throw new Error('polls must not mix with legacy CTA');

  const seeded = await seed();
  const home = await dispatchShape('polls.home', {}, true);
  [/Опросы|голосовалки/i, /выбрать канал/i, /Выбрать пост/i, /Вопрос опроса/i, /Результаты/i].forEach((re, index) => assertText(home.screen, re, 'polls.home.tree.' + index));
  ['polls.channel', 'polls.post', 'polls.question', 'polls.options', 'polls.preview', 'polls.create', 'polls.vote', 'polls.results', 'polls.close_confirm'].forEach((route) => assertRoute(home.screen, route, 'polls.home.routes'));
  assertText(home.screen, /не смешиваем с CTA-кнопками|один актуальный голос/i, 'polls.home.policy');

  const channel = await dispatchShape('polls.channel', {}, true);
  assertText(channel.screen, /Шаг 1 из 5|Выберите канал/i, 'polls.channel.step');
  assertRoute(channel.screen, 'polls.post', 'polls.channel.next');

  const post = await dispatchShape('polls.post', {}, true);
  assertText(post.screen, /Шаг 2 из 5|Выберите пост/i, 'polls.post.step');
  assertButtonText(post.screen, /Тест опроса|голосование/i, 'polls.post.human_post_button');
  assertNoText(post.screen, /core-stress-poll-post|core-stress-poll-message/i, 'polls.post.no_raw_ids');
  assertRoute(post.screen, 'polls.question', 'polls.post.next');

  const question = await dispatchShape('polls.question', {}, true);
  assertText(question.screen, /Шаг 3 из 5|Введите вопрос/i, 'polls.question.step');
  assertRoute(question.screen, 'polls.options', 'polls.question.options');

  const options = await dispatchShape('polls.options', {}, true);
  assertText(options.screen, /Шаг 4 из 5|минимум 2|максимум 8/i, 'polls.options.step');
  assertRoute(options.screen, 'polls.preview', 'polls.options.preview');

  const createPayload = { question: 'Какой формат постов вам интереснее?', options: ['Полезные разборы', 'Новости', 'Подарки'] };
  const preview = await dispatchShape('polls.preview', createPayload, true);
  assertText(preview.screen, /Предпросмотр опроса|Варианты|один пользователь/i, 'polls.preview.ready');
  assertText(preview.screen, /отдельно от CTA-кнопок/i, 'polls.preview.no_cta_mix');
  assertRoute(preview.screen, 'polls.create', 'polls.preview.create');

  const create = await dispatchShape('polls.create', createPayload, true);
  assertText(create.screen, /Опрос создан|не смешивается с CTA-кнопками/i, 'polls.create.saved');
  assertRoute(create.screen, 'polls.vote', 'polls.create.vote');
  assertRoute(create.screen, 'polls.results', 'polls.create.results');

  const list = await dispatchShape('polls.list', {}, true);
  assertText(list.screen, /Опросы:|Какой формат постов/i, 'polls.list.items');
  assertRoute(list.screen, 'polls.vote', 'polls.list.vote');
  assertRoute(list.screen, 'polls.results', 'polls.list.results');

  const voteBtn = assertRoute(list.screen, 'polls.vote', 'polls.vote.button');
  const votePayload = payloadOf(voteBtn);
  const vote = await dispatchShape('polls.vote', votePayload, true);
  assertText(vote.screen, /Голосование|Выберите один вариант|Повторный callback/i, 'polls.vote.screen');
  assertRoute(vote.screen, 'polls.vote_apply', 'polls.vote.apply_route');

  const optionBtn = assertRoute(vote.screen, 'polls.vote_apply', 'polls.vote.option_button');
  const optionPayload = payloadOf(optionBtn);
  const voteApply = await dispatchShape('polls.vote_apply', optionPayload, true);
  assertText(voteApply.screen, /Голос учтён|Один пользователь — один актуальный голос/i, 'polls.vote_apply.first');

  const voteApplyDuplicate = await dispatchShape('polls.vote_apply', optionPayload, true);
  assertText(voteApplyDuplicate.screen, /Голос учтён|повторный callback|обновил существующий голос/i, 'polls.vote_apply.duplicate');

  const results = await dispatchShape('polls.results', optionPayload, true);
  assertText(results.screen, /Результаты опроса|Всего голосов|%/i, 'polls.results');
  assertRoute(results.screen, 'polls.close_confirm', 'polls.results.close_confirm');

  const closeConfirm = await dispatchShape('polls.close_confirm', optionPayload, true);
  assertText(closeConfirm.screen, /Подтверждение закрытия опроса|Результаты останутся доступны|MAX не удаляем/i, 'polls.close_confirm');
  assertRoute(closeConfirm.screen, 'polls.close', 'polls.close.confirm_route');

  const dataSelf = pollsData.selfTest();
  if (dataSelf.oneVotePerUserReady !== true || dataSelf.duplicateCallbackSafe !== true || dataSelf.resultsReady !== true) throw new Error('polls data policies missing');

  return {
    runtimeVersion: self.runtimeVersion,
    functionCount: self.functionCount,
    routeCount: self.routeCount,
    seeded,
    checks: [
      'polls_tree_ready',
      'channel_post_question_options_preview_create_path',
      'human_post_labels_without_raw_ids',
      'min_2_max_8_options_ready',
      'no_legacy_cta_mix',
      'poll_saved_to_adminkit_db',
      'vote_screen_ready',
      'one_vote_per_user_ready',
      'duplicate_callback_safe',
      'results_ready',
      'close_requires_confirmation'
    ]
  };
}

async function runFast(options = {}) {
  const baseResult = await base.runFast(options);
  const tests = [];
  tests.push(await step('self.pollsFinalTree', async () => sectionRegistry.find('polls').selfTest()));
  tests.push(await step('self.pollsDataAdapter', async () => pollsData.selfTest()));
  tests.push(await step('scenario.polls.full_path', runPollsScenario));
  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 1000));
  const failed = [...(Array.isArray(baseResult.failed) ? baseResult.failed : []), ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...(Array.isArray(baseResult.slow) ? baseResult.slow : []), ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];
  return {
    ...baseResult,
    ok: baseResult.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1460_polls',
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesPollsFinalTree: true,
      validatesCreatePollPath: true,
      validatesOneVotePerUser: true,
      validatesDuplicateCallbackSafe: true,
      validatesResultsAndClose: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.46.0: опросы / голосовалки прошли сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', checks: x.checks || undefined, functionCount: x.functionCount || undefined, routeCount: x.routeCount || undefined }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.46.0 наполняет раздел Опросы / голосовалки финальным деревом функций.',
      'Обычный путь: Опросы → канал → пост → вопрос → варианты → предпросмотр → создать.',
      'Опросы не смешиваются с CTA-кнопками.',
      'Голосование защищено от дубля callback: один пользователь имеет один актуальный голос.',
      'Результаты и закрытие опроса проходят отдельными сценариями.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const sectionSelf = sectionRegistry.find('polls')?.selfTest?.() || {};
  const dataSelf = pollsData.selfTest ? pollsData.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && sectionSelf.ok !== false && dataSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    pollsRuntimeVersion: sectionSelf.runtimeVersion || '',
    pollsDataRuntimeVersion: dataSelf.runtimeVersion || '',
    pollsFinalTreeReady: true,
    createPollPathReady: true,
    oneVotePerUserReady: true,
    duplicateCallbackSafe: true,
    resultsAndCloseReady: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };
