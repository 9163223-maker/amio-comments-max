'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const postEditorService = require('../services/postEditorService');
const fastText = require('../services/postEditorFastTextService');

const TENANT_A_USER = 'pr128-tenant-a';
const TENANT_B_USER = 'pr128-tenant-b';
const CH1 = '-pr128-olga-style';
const CH2 = '-pr128-otzyvy';
const CH3 = '-pr128-avito';
const CH4 = '-pr128-testovyi';
const CH_B = '-pr128-tenant-b-secret';
const CH_GLOBAL = '-pr128-global-legacy';
const CH_SELFTEST = '-pr128-selftest-channel';
const KEY1 = `${CH1}:olga-post`;
const KEY2 = `${CH2}:reviews-post`;
const KEY2_EMPTY = `${CH2}:empty-raw-post`;
const KEY_B = `${CH_B}:secret-post`;
const KEY_GLOBAL = `${CH_GLOBAL}:legacy-post`;

function resetState() {
  access._resetForTests();
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.channels = {};
  store.store.setup = {};
  store.store.setupState = {};
  store.store.moderation = { byChannel: {}, logs: [] };
  store.saveStore();
}
function activate(userId, name, maxChannels) {
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels, createdByMaxUserId: 'pr128-admin' });
  const result = access.activateCode({ maxUserId: userId, name, code: code.code });
  assert.strictEqual(result.ok, true, `${name} activation succeeds`);
  return access.getTenantByMaxUserId(userId);
}
function bind(tenant, channelId, title) {
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenant.tenantId, channelId, channelTitle: title, maxChannels: tenant.maxChannels }).ok, true, `bind ${title}`);
  store.saveChannel(channelId, { channelId, title, channelTitle: title });
}
function savePost(key, post) { store.savePost(key, { commentKey: key, commentsDisabled: false, ...post }); }
function callbackUpdate(userId, payload) {
  return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId, first_name: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${Date.now()}`, body: { mid: `mid-${Date.now()}`, text: 'old' }, sender: { user_id: userId }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } };
}
function response() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } }; }
async function sendBot(bot, payload, sent, userId = TENANT_A_USER) {
  const res = response();
  await bot.handleWebhook(callbackUpdate(userId, payload), res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(res.statusCode, 200, `callback ${payload.action} returns 200`);
  return sent.at(-1) || {};
}
function labels(call) { return (call.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function visible(call) { return [String(call.text || ''), ...labels(call)].join('\n'); }
function payloadFor(call, pattern) {
  const button = (call.attachments?.[0]?.payload?.buttons || []).flat().find((item) => pattern.test(String(item.text || '')));
  assert.ok(button, `button ${pattern} exists in ${visible(call)}`);
  return JSON.parse(String(button.payload || '{}'));
}
function assertNoUnsafeUi(call, label) {
  const text = visible(call);
  assert.ok(!/\b(postId|channelId|messageId|commentKey|commentId|token|payload|trace)\b/i.test(text), `${label}: no raw technical identifiers`);
  assert.ok(!/debug|legacy|selftest|store|cache|в памяти/i.test(text), `${label}: no internal wording`);
  assert.ok(!/\bCTA\b/i.test(text), `${label}: no CTA wording`);
}
function assertNoCommentsUnsafeUi(call, label) {
  assertNoUnsafeUi(call, label);
  assert.ok(!/видео|файл/i.test(visible(call)), `${label}: no video/files wording`);
}
function assertChannelPicker(call, label) {
  const text = visible(call);
  assert.ok(/Olga Style/.test(text), `${label}: shows channel 1`);
  assert.ok(/Отзывы/.test(text), `${label}: shows channel 2`);
  assert.ok(/Авито продажи/.test(text), `${label}: shows empty channel 3`);
  assert.ok(/Тестовый канал/.test(text), `${label}: shows tenant-visible channel 4`);
  assert.ok(!/Tenant B Secret|Global Legacy|selftest|debug|legacy/.test(text), `${label}: hides foreign/global/internal channels`);
  assert.ok(!new RegExp([CH1, CH2, CH3, CH4, CH_B].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')).test(text), `${label}: hides raw channel ids`);
  assertNoUnsafeUi(call, label);
}

async function main() {
  resetState();
  const tenantA = activate(TENANT_A_USER, 'Tenant A', 4);
  const tenantB = activate(TENANT_B_USER, 'Tenant B', 1);
  bind(tenantA, CH1, 'Olga Style');
  bind(tenantA, CH2, 'Отзывы');
  bind(tenantA, CH3, 'Авито продажи');
  bind(tenantA, CH4, 'Тестовый канал');
  bind(tenantB, CH_B, 'Tenant B Secret');
  store.saveChannel(CH_GLOBAL, { channelId: CH_GLOBAL, title: 'Global Legacy' });
  store.saveChannel(CH_SELFTEST, { channelId: CH_SELFTEST, title: 'selftest debug channel' });
  savePost(KEY1, { channelId: CH1, channelTitle: 'Olga Style', postId: 'olga-post-id', messageId: 'olga-message-id', originalText: 'Olga Style launch post' });
  savePost(KEY2, { channelId: CH2, channelTitle: 'Отзывы', postId: 'reviews-post-id', messageId: 'reviews-message-id', originalText: 'Отзывы клиентов за неделю' });
  savePost(KEY2_EMPTY, { channelId: CH2, channelTitle: 'Отзывы', postId: 'postId-raw-empty', messageId: 'messageId-raw-empty', originalText: '' });
  savePost(KEY_B, { channelId: CH_B, channelTitle: 'Tenant B Secret', postId: 'secret-post-id', messageId: 'secret-message-id', originalText: 'Tenant B secret post' });
  savePost(KEY_GLOBAL, { channelId: CH_GLOBAL, channelTitle: 'Global Legacy', postId: 'global-post-id', messageId: 'global-message-id', originalText: 'Global legacy post' });
  store.addComment(KEY2, { id: 'a-comment-1', text: 'Tenant A visible comment', userId: 'reader-a', attachments: [{ type: 'image', url: 'https://example.test/a.jpg' }] });
  store.addComment(KEY2, { id: 'a-comment-2', text: 'Tenant A visible reply', userId: 'reader-a2', replyToId: 'a-comment-1' });
  store.addComment(KEY_B, { id: 'b-comment-1', text: 'Tenant B hidden comment', userId: 'reader-b' });
  store.addComment(KEY_GLOBAL, { id: 'global-comment-1', text: 'Global legacy hidden comment', userId: 'reader-global' });
  store.store.reactions[KEY2] = { 'a-comment-1': { '👍': ['reader-a'] } };
  store.store.reactions[KEY_B] = { 'b-comment-1': { '👍': ['reader-b', 'reader-b2'] } };
  store.saveStore();

  const sent = [];
  maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.deleteMessage = async () => ({ ok: true });
  const toggleCalls = [];
  postEditorService.setPostCommentsEnabled = async ({ commentKey, enabled }) => { toggleCalls.push({ commentKey, enabled }); const current = store.getPost(commentKey) || {}; store.savePost(commentKey, { ...current, commentsDisabled: !enabled }); return { ok: true, post: store.getPost(commentKey) }; };
  const saveCalls = [];
  fastText.editPostTextFast = async ({ commentKey, text }) => { saveCalls.push({ commentKey, text }); const current = store.getPost(commentKey) || {}; store.savePost(commentKey, { ...current, originalText: text }); return { ok: true, post: store.getPost(commentKey) }; };
  delete require.cache[require.resolve('../bot')];
  const bot = require('../bot');

  // Editor
  store.setSetupState(TENANT_A_USER, { commentTargetPost: null, giftTargetPost: null });
  const editorHome = await sendBot(bot, { action: 'admin_section_posts' }, sent);
  assert.ok(/Пост не выбран|Сначала выберите канал, затем пост/i.test(visible(editorHome)), 'Editor home with no target explains channel/post selection');
  assert.ok(!/Отправьте следующим сообщением новый текст|Текущий текст/i.test(visible(editorHome)), 'Editor home does not silently start edit flow');
  assertNoUnsafeUi(editorHome, 'editor empty home');

  const editorChannels = await sendBot(bot, payloadFor(editorHome, /Выбрать пост/), sent);
  assertChannelPicker(editorChannels, 'editor channel picker');
  const editorCh2 = await sendBot(bot, payloadFor(editorChannels, /Отзывы/), sent);
  assert.ok(/Отзывы/.test(visible(editorCh2)) && /Отзывы клиентов за неделю/.test(visible(editorCh2)) && /Пост без текста/.test(visible(editorCh2)), 'Editor channel 2 picker shows only channel 2 posts with safe fallback');
  assert.ok(!/Olga Style launch post|Tenant B secret post|Global legacy post/.test(visible(editorCh2)), 'Editor channel 2 picker is channel-scoped');
  assertNoUnsafeUi(editorCh2, 'editor channel 2 posts');
  const editorEmpty = await sendBot(bot, payloadFor(editorChannels, /Авито продажи/), sent);
  assert.ok(/В этом канале пока нет сохранённых постов\./.test(visible(editorEmpty)), 'Editor empty channel uses safe wording');
  assert.ok(!/в памяти/i.test(visible(editorEmpty)), 'Editor empty channel avoids internal wording');
  const editorCard = await sendBot(bot, payloadFor(editorCh2, /Отзывы клиентов/), sent);
  assert.ok(/Редактор постов|Выбранный канал: Отзывы|Выбранный пост: Отзывы клиентов за неделю/s.test(visible(editorCard)), 'Editor selecting post opens explicit selected context');
  const editPayload = payloadFor(editorCard, /Изменить текст выбранного поста/);
  assert.strictEqual(editPayload.source, 'editor_card', 'Editor edit action carries editor_card source');
  const rawEdit = await sendBot(bot, { action: 'comments_edit_text' }, sent);
  assert.ok(/карточку редактора|Сначала выберите пост/i.test(visible(rawEdit)), 'Raw/stale editor edit without editor_card remains blocked');
  assert.strictEqual(store.getSetupState(TENANT_A_USER)?.postEditFlow, undefined, 'Raw/stale editor edit does not start save flow');
  const editStart = await sendBot(bot, editPayload, sent);
  assert.ok(/новый текст выбранного поста|Текущий текст/i.test(visible(editStart)), 'Editor card-marked edit starts only after explicit selected card');
  assertNoUnsafeUi(editorCard, 'editor card');

  // Comments
  store.setSetupState(TENANT_A_USER, { commentTargetPost: null, giftTargetPost: null, postEditFlow: null, activeAdminFlowKind: '' });
  const commentsHome = await sendBot(bot, { action: 'admin_section_comments' }, sent);
  assert.ok(/Пост не выбран|Сначала выберите канал, затем пост/i.test(visible(commentsHome)), 'Comments home with no target explains channel/post selection');
  assert.ok(!/Tenant A visible comment|Всего комментариев/.test(visible(commentsHome)), 'Comments home does not silently open old selected post data');
  assertNoCommentsUnsafeUi(commentsHome, 'comments empty home');
  const commentsChannels = await sendBot(bot, payloadFor(commentsHome, /Выбрать пост/), sent);
  assertChannelPicker(commentsChannels, 'comments channel picker');
  const commentsCh2 = await sendBot(bot, payloadFor(commentsChannels, /Отзывы/), sent);
  assert.ok(/Отзывы клиентов за неделю/.test(visible(commentsCh2)) && /Пост без текста/.test(visible(commentsCh2)), 'Comments channel 2 picker shows only channel 2 posts');
  assert.ok(!/Olga Style launch post|Tenant B secret post|Global legacy post/.test(visible(commentsCh2)), 'Comments channel 2 picker is scoped');
  assertNoCommentsUnsafeUi(commentsCh2, 'comments channel 2 posts');
  const commentsEmpty = await sendBot(bot, payloadFor(commentsChannels, /Авито продажи/), sent);
  assert.ok(/В этом канале пока нет сохранённых постов\./.test(visible(commentsEmpty)), 'Comments empty channel uses safe wording');
  assertNoCommentsUnsafeUi(commentsEmpty, 'comments empty channel');
  const commentsCard = await sendBot(bot, payloadFor(commentsCh2, /Отзывы клиентов/), sent);
  assert.ok(/Выбранный канал: Отзывы|Выбранный пост: Отзывы клиентов за неделю/s.test(visible(commentsCard)), 'Comments selected post card shows selected context');
  ['Проверить комментарии', 'Список комментариев', 'Фото в комментариях', 'Реакции и ответы', 'Настройки кнопки комментариев'].forEach((label) => {
    assert.strictEqual(payloadFor(commentsCard, new RegExp(label)).source, 'comments_post_card', `${label} carries comments_post_card source`);
  });
  assertNoCommentsUnsafeUi(commentsCard, 'comments card');
  const rawList = await sendBot(bot, { action: 'comments_list' }, sent);
  assert.ok(/Сначала выберите пост для комментариев/i.test(visible(rawList)), 'Raw/stale comments action without card does not show selected data');
  assert.ok(!/Tenant A visible comment|Всего комментариев/.test(visible(rawList)), 'Raw/stale comments action does not expose selected-post data');
  const rawToggle = await sendBot(bot, { action: 'comments_toggle_post_comments', enabled: '0' }, sent);
  assert.strictEqual(toggleCalls.length, 0, 'Raw/stale comments toggle does not mutate');
  assert.ok(/Сначала выберите пост для комментариев/i.test(visible(rawToggle)), 'Raw/stale comments toggle remains blocked');
  const list = await sendBot(bot, payloadFor(commentsCard, /Список комментариев/), sent);
  assert.ok(/Tenant A visible comment|Tenant A visible reply/.test(visible(list)), 'Comments list shows Tenant A selected-post comments');
  assert.ok(/Всего комментариев: 2/.test(visible(list)), 'Comments counter is selected-post scoped');
  assert.ok(!/Tenant B hidden comment|Global legacy hidden comment|Tenant B secret post|Global legacy post/i.test(visible(list)), 'Comments list hides Tenant B/global/legacy data');
  const photos = await sendBot(bot, payloadFor(commentsCard, /Фото в комментариях/), sent);
  assert.ok(/Фото в комментариях: 1/.test(visible(photos)), 'Photo comments wording is allowed and scoped');
  const reactions = await sendBot(bot, payloadFor(commentsCard, /Реакции и ответы/), sent);
  assert.ok(/1 реакц|1 ответ/.test(visible(reactions)), 'Reactions/replies are scoped to selected post');
  assertNoCommentsUnsafeUi(list, 'comments list');
  assertNoCommentsUnsafeUi(photos, 'comments photos');
  assertNoCommentsUnsafeUi(reactions, 'comments reactions');

  console.log('PR128 Editor/Comments product-perfect channel-first UX assertions passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
