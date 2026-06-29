'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';
delete process.env.GITHUB_DEBUG_TOKEN;

const botAudit = require('../admin-bot-audit-trace');
const pr247Trace = require('../services/rootMenuLiveParityTraceService');
const runtimeTrace = require('../services/runtimeBotAuditTraceService');
const maxApi = require('../services/maxApi');

const TEST_USER = 'pr248-admin-user';
const ROUTES = [
  ['channels:home', /Каналы/i, 'admin_section_channels'],
  ['comments:home', /Комментарии/i, 'admin_section_comments'],
  ['gifts:home', /Подарки\s*\/\s*лид-магниты/i, 'admin_section_gifts'],
  ['buttons:home', /Кнопки под постами|Кнопки/i, 'admin_section_buttons'],
  ['stats:home', /Статистика|PR229|PR226/i, 'admin_section_stats'],
  ['push:home', /Уведомления|Push-уведомления/i, 'admin_section_push'],
  ['ad_links:home', /Рекламные ссылки/i, null],
  ['polls:home', /Опросы|голосования/i, 'admin_section_polls'],
  ['highlights:home', /Выделение постов|Выделение/i, null],
  ['editor:home', /Редактор постов|Редактор/i, 'admin_section_posts'],
  ['archive:home', /Архив постов|Архив/i, 'admin_section_archive'],
  ['account:home', /Личный кабинет|Мой доступ|доступ|АдминКИТ/i, 'admin_section_tariffs'],
  ['settings:home', /Настройки/i, null],
  ['main:home', /АдминКИТ|Панель управления|Главное меню/i, 'admin_section_main']
];

function reset() { botAudit.clear(); pr247Trace.clear(); runtimeTrace._resetSchedulerForTests(); }
function res() { return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return b; } }; }
function update(payload, opts = {}) {
  const callbackPayload = opts.decodedObjectPayload ? payload : (typeof payload === 'string' ? payload : JSON.stringify(payload));
  const callback = { callback_id: opts.callbackId || `cb-${Math.random()}`, payload: callbackPayload, user: { user_id: TEST_USER } };
  return { body: { update_type: 'message_callback', callback, message: { id: opts.messageId || `msg-${Math.random()}`, body: { mid: opts.mid || `mid-${Math.random()}`, text: 'old menu' }, sender: { user_id: TEST_USER }, recipient: { chat_id: `${TEST_USER}-chat`, chat_type: 'user' } } } };
}
const store = require('../store');
function seedCompetingState(route, label) {
  store.setSetupState(`${TEST_USER}-${route}-${label}`.replace(/[^a-z0-9_-]/gi, '_'), {});
  store.setSetupState(TEST_USER, { giftFlow: { stepIndex: 2 }, buttonFlow: { stepIndex: 1 }, commentAdminFlow: { step: 'stale' }, postEditFlow: { step: 'stale' }, activeAdminFlowKind: 'gift', giftActiveScreenMessageId: 'stale-gift', buttonActiveScreenMessageId: 'stale-button', commentActiveScreenMessageId: 'stale-comment' });
}
function assertCompetingStateCleared(route, label) {
  const state = store.getSetupState(TEST_USER) || {};
  assert.strictEqual(state.giftFlow, null, `${route}/${label} clears active Gifts wizard`);
  assert.strictEqual(state.buttonFlow, null, `${route}/${label} clears active Buttons wizard`);
  assert.strictEqual(state.commentAdminFlow, null, `${route}/${label} clears comments flow`);
  assert.strictEqual(state.postEditFlow, null, `${route}/${label} clears post edit flow`);
  assert.strictEqual(state.giftActiveScreenMessageId, '', `${route}/${label} clears stale Gifts screen id`);
  assert.strictEqual(state.buttonActiveScreenMessageId, '', `${route}/${label} clears stale Buttons screen id`);
  assert.strictEqual(state.commentActiveScreenMessageId, '', `${route}/${label} clears stale comments screen id`);
  assert.strictEqual(state.activeAdminFlowKind, '', `${route}/${label} clears active flow kind`);
}
function seedSelectedPost() {
  const target = { channelId: 'pr255-channel', channelTitle: 'PR255 Channel', postId: 'pr255-post', messageId: 'pr255-message', commentKey: 'pr255-channel:pr255-post', originalText: 'PR255 selected post' };
  if (typeof store.savePost === 'function') store.savePost(target.commentKey, target);
  store.setSetupState(TEST_USER, { commentTargetPost: target, postTargetPost: target, giftFlow: { stepIndex: 2 }, buttonFlow: { stepIndex: 1 }, commentAdminFlow: { step: 'stale' }, postEditFlow: { step: 'stale' }, activeAdminFlowKind: 'gift', giftActiveScreenMessageId: 'stale-gift', buttonActiveScreenMessageId: 'stale-button', commentActiveScreenMessageId: 'stale-comment' });
  return target;
}
function expectedProvider(route) {
  if (route === 'buttons:home') return 'buttons-root-provider';
  if (route === 'stats:home') return 'stats-root-provider';
  if (route === 'archive:home') return 'archive-root-provider';
  if (route === 'editor:home') return 'posts-root-provider';
  if (route === 'gifts:home') return 'gifts-root-provider';
  return 'v3-menu-provider';
}
function installStubs(calls) {
  maxApi.editMessage = async (payload) => { calls.push({ ...payload, transport: 'editMessage' }); return { ok: true, transport: 'editMessage', message: { id: `edit-${calls.length}` } }; };
  maxApi.sendMessage = async (payload) => { calls.push({ ...payload, transport: 'sendMessage' }); return { ok: true, transport: 'sendMessage', message: { id: `send-${calls.length}` } }; };
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.getChat = async () => ({ title: 'PR248 Channel' });
  maxApi.getBotChatMember = async () => ({ ok: true });
}
function keyboardLabels(call) { return (call.attachments || []).flatMap((a) => a && a.type === 'inline_keyboard' ? (a.payload.buttons || []).flat().map((b) => String(b.text || '')) : []).filter(Boolean); }
function visible(call) { return [String(call && call.text || ''), ...keyboardLabels(call)].join('\n'); }
function assertNoLeaks(obj) { const text = JSON.stringify(obj); for (const leak of ['cb-', 'msg-', 'mid-', TEST_USER, `${TEST_USER}-chat`, 'test-token-pr248']) assert(!text.includes(leak), `safe trace must not leak ${leak}`); }

async function webhook(bot, body) { const r = res(); await bot.handleWebhook(body, r, { botToken: 'test-token-pr248', appBaseUrl: 'https://example.test', botUsername: 'adminkit_test_bot', menuDeleteTimeoutMs: 1 }); assert.strictEqual(r.statusCode, 200, 'webhook returns 200'); return r.body; }

async function main() {
  reset();
  const calls = [];
  installStubs(calls);
  let flushes = 0;
  runtimeTrace._setExportLatestTraceForTests(async () => { flushes += 1; return { ok: true }; });
  delete require.cache[require.resolve('../bot')];
  const bot = require('../bot');
  store.setSetupState(TEST_USER, { commentTargetPost: null, postTargetPost: null, giftTargetPost: null, buttonTargetPost: null });

  for (const [route, expected, legacy] of ROUTES) {
    for (const [label, payload, resolver, decodedObjectPayload] of [
      ['route-object', { route }, 'payload.route', true],
      ['action-object', { action: route }, 'payload.action.canonical'],
      ['json-string', JSON.stringify({ route }), 'payload.route'],
      ...(legacy ? [['legacy', { action: legacy }, 'legacy.compatibility']] : []),
      ...(route === 'gifts:home' ? [['gift-open-menu-legacy', { action: 'gift_admin_open_menu' }, 'legacy.compatibility']] : [])
    ]) {
      const before = calls.length;
      seedCompetingState(route, label);
      const body = await webhook(bot, update(payload, { callbackId: `cb-${label}-${route}`, messageId: `msg-${label}-${route}`, mid: `mid-${label}-${route}`, decodedObjectPayload }));
      assert.notStrictEqual(body && body.reason, 'unsupported_callback', `${route}/${label} is not unsupported_callback`);
      assert.ok(calls.length > before, `${route}/${label} attempts visible delivery`);
      assert.ok(expected.test(visible(calls.at(-1))), `${route}/${label} renders expected visible screen`);
      assert.ok(keyboardLabels(calls.at(-1)).length > 0, `${route}/${label} renders keyboard`);
      assertCompetingStateCleared(route, label);
      assert.ok(botAudit.list().some((e) => e.type === 'root_section_callback_received' && e.route === route && e.resolver === resolver && e.provider === expectedProvider(route) && e.owner === route.split(':')[0]), `${route}/${label} parser/resolver/provider audited`);
      assert.ok(botAudit.list().some((e) => e.type === 'root_section_callback_resolved' && e.route === route && e.delivery), `${route}/${label} delivery is audited`);
      const chain = pr247Trace.listRoot().filter((e) => e.resolvedRootRoute === route).map((e) => e.eventKind);
      for (const kind of ['callback_received', resolver === 'legacy.compatibility' ? 'legacy_compatibility_resolved' : 'root_resolved', 'render_started', 'render_resolved', 'delivery_started', 'delivery_resolved']) assert.ok(chain.includes(kind), `${route}/${label} trace includes ${kind}`);
    }
  }


  seedSelectedPost();
  let before = calls.length;
  await webhook(bot, update({ action: 'admin_section_comments' }, { callbackId: 'cb-selected-comments-root', messageId: 'msg-selected-comments-root', mid: 'mid-selected-comments-root' }));
  assert.ok(calls.length > before, 'selected admin_section_comments attempts delivery');
  const commentsVisible = visible(calls.at(-1));
  for (const label of ['Проверить комментарии', 'Список комментариев', 'Фото в комментариях', 'Реакции и ответы', 'Настройки кнопки комментариев']) assert.ok(commentsVisible.includes(label), `selected comments root shows ${label}`);
  assert.ok(!/Сначала выберите канал|Пост не выбран|Нажмите «Выбрать пост»/i.test(commentsVisible), 'selected comments root does not force post repick');
  assert.ok(botAudit.list().some((e) => e.type === 'root_section_callback_received' && e.route === 'comments:home' && e.action === 'admin_section_comments' && e.resolver === 'legacy.compatibility'), 'selected comments root still resolves canonical comments:home through RootSectionDispatcher v2');
  assert.ok(pr247Trace.listRoot().some((e) => e.eventKind === 'legacy_compatibility_resolved' && e.resolvedRootRoute === 'comments:home'), 'selected comments trace keeps canonical comments:home route');

  seedSelectedPost();
  before = calls.length;
  await webhook(bot, update({ action: 'admin_section_posts' }, { callbackId: 'cb-selected-posts-root', messageId: 'msg-selected-posts-root', mid: 'mid-selected-posts-root' }));
  assert.ok(calls.length > before, 'selected admin_section_posts attempts delivery');
  const postsVisible = visible(calls.at(-1));
  assert.ok(postsVisible.includes('Изменить текст выбранного поста'), 'selected posts root shows editor selected-post action');
  assert.ok(!/Пост не выбран|Сначала выберите канал|Нажмите «Выбрать пост»/i.test(postsVisible), 'selected posts root does not force post repick');
  assert.ok(botAudit.list().some((e) => e.type === 'root_section_callback_received' && e.route === 'editor:home' && e.action === 'admin_section_posts' && e.resolver === 'legacy.compatibility'), 'selected posts root still resolves canonical editor:home through RootSectionDispatcher v2');
  assert.ok(pr247Trace.listRoot().some((e) => e.eventKind === 'legacy_compatibility_resolved' && e.resolvedRootRoute === 'editor:home'), 'selected posts trace keeps canonical editor:home route');

  assert.ok(!botAudit.list().some((e) => /handleGiftsRootCallback|gifts.*only/i.test(`${e.handlerName || ''} ${e.resolver || ''}`)), 'Gifts is not handled by a Gifts-only handler marker');
  assert.ok(pr247Trace.listRoot().every((e) => !/^trace_export_/.test(e.eventKind)), 'trace_export events do not consume root trace event slots');
  assertNoLeaks({ pr247: pr247Trace.payload('root'), audit: botAudit.list() });
  assert.ok(flushes >= ROUTES.length, 'root-section handlers flush durable runtime audit trace');

  console.log(JSON.stringify({ ok: true, test: 'PR248 root-section opening standard', routes: ROUTES.length }, null, 2));
}

main().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
