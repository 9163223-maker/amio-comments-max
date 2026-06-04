'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const postEditorService = require('../services/postEditorService');

const TENANT_A_USER = 'pr125-tenant-a';
const TENANT_B_USER = 'pr125-tenant-b';
const TENANT_A_CHANNEL = '-pr125-tenant-a-channel';
const TENANT_B_CHANNEL = '-pr125-tenant-b-channel';
const TENANT_A_KEY = `${TENANT_A_CHANNEL}:post-a`;
const TENANT_B_KEY = `${TENANT_B_CHANNEL}:post-b`;
const GLOBAL_KEY = '-pr125-global:post-global';

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

function activateTenant(userId, name) {
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr125-admin' });
  const activated = access.activateCode({ maxUserId: userId, name, code: code.code });
  assert.strictEqual(activated.ok, true, `${name} activation succeeds`);
  return access.getTenantByMaxUserId(userId);
}

function callbackUpdate(userId, payload) {
  return {
    body: {
      update_type: 'message_callback',
      callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId, first_name: userId }, payload: JSON.stringify(payload) },
      message: { id: `msg-${userId}-${Date.now()}`, body: { mid: `mid-${userId}`, text: 'old' }, sender: { user_id: userId }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } }
    }
  };
}

function response() {
  return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
}

async function sendBot(bot, payload, sent) {
  const res = response();
  await bot.handleWebhook(callbackUpdate(TENANT_A_USER, payload), res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(res.statusCode, 200, `callback ${payload.action} returns 200`);
  return sent.at(-1) || {};
}

function labels(call) {
  return (call.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean);
}

function visible(call) {
  return [String(call.text || ''), ...labels(call)].join('\n');
}

function callbackPayload(call, pattern) {
  const button = (call.attachments?.[0]?.payload?.buttons || []).flat().find((item) => pattern.test(String(item.text || '')));
  assert.ok(button, `button ${pattern} exists`);
  return JSON.parse(String(button.payload || '{}'));
}

function assertNoCommentsUnsafeUi(call, label) {
  const text = visible(call);
  assert.ok(!/удалить|убрать|скрыть|модерир/i.test(labels(call).join('\n')), `${label} must not expose destructive/moderation actions at comments root/home`);
  assert.ok(!/видео|файл/i.test(text), `${label} must not expose video/files wording`);
  assert.ok(!/\b(postId|channelId|commentKey|commentId|token|payload|trace)\b/i.test(text), `${label} must not expose raw technical identifiers`);
  assert.ok(!/\bCTA\b|debug|legacy|selftest|store|cache|в памяти/i.test(text), `${label} must not expose internal wording`);
}

async function main() {
  resetState();
  const tenantA = activateTenant(TENANT_A_USER, 'Tenant A');
  const tenantB = activateTenant(TENANT_B_USER, 'Tenant B');
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', maxChannels: 1 }).ok, true);
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantB.tenantId, channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', maxChannels: 1 }).ok, true);

  store.saveChannel(TENANT_A_CHANNEL, { channelId: TENANT_A_CHANNEL, title: 'Tenant A Channel', channelTitle: 'Tenant A Channel' });
  store.saveChannel(TENANT_B_CHANNEL, { channelId: TENANT_B_CHANNEL, title: 'Tenant B Channel', channelTitle: 'Tenant B Channel' });
  store.saveChannel('-pr125-global', { channelId: '-pr125-global', title: 'Global Legacy Channel', channelTitle: 'Global Legacy Channel' });
  store.savePost(TENANT_A_KEY, { channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a', commentKey: TENANT_A_KEY, originalText: 'Tenant A Public Post', commentsDisabled: false });
  store.savePost(TENANT_B_KEY, { channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', postId: 'post-b', messageId: 'msg-b', commentKey: TENANT_B_KEY, originalText: 'Tenant B Secret Post', commentsDisabled: false });
  store.savePost(GLOBAL_KEY, { channelId: '-pr125-global', channelTitle: 'Global Legacy Channel', postId: 'post-global', messageId: 'msg-global', commentKey: GLOBAL_KEY, originalText: 'Global Legacy Post postId channelId payload trace token', commentsDisabled: false });
  store.addComment(TENANT_A_KEY, { id: 'a-comment-1', text: 'Tenant A visible comment', userId: 'reader-a', attachments: [{ type: 'image', url: 'https://example.test/a.jpg' }] });
  store.addComment(TENANT_A_KEY, { id: 'a-comment-2', text: 'Tenant A visible reply', userId: 'reader-a2', replyToId: 'a-comment-1' });
  store.addComment(TENANT_B_KEY, { id: 'b-comment-1', text: 'Tenant B hidden comment', userId: 'reader-b' });
  store.addComment(GLOBAL_KEY, { id: 'global-comment-1', text: 'Global legacy hidden comment', userId: 'reader-global' });
  store.store.reactions[TENANT_A_KEY] = { 'a-comment-1': { '👍': ['reader-a'] } };
  store.store.reactions[TENANT_B_KEY] = { 'b-comment-1': { '👍': ['reader-b', 'reader-b2'] } };
  store.saveStore();

  const sent = [];
  maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.deleteMessage = async () => ({ ok: true });
  const toggleCalls = [];
  postEditorService.setPostCommentsEnabled = async ({ commentKey, enabled }) => {
    toggleCalls.push({ commentKey, enabled });
    const current = store.getPost(commentKey) || {};
    store.savePost(commentKey, { ...current, commentsDisabled: !enabled, commentsEnabled: enabled });
    return { ok: true, post: store.getPost(commentKey) };
  };
  delete require.cache[require.resolve('../bot')];
  const bot = require('../bot');

  const root = await sendBot(bot, { action: 'admin_section_comments' }, sent);
  assertNoCommentsUnsafeUi(root, 'comments root/home');
  assert.ok(/Комментарии под постом|Выбрать пост/.test(visible(root)), 'comments root/home must route through post selection');
  assert.ok(/Фото в комментариях/.test(visible(root)) || /Комментарии под постом/.test(visible(root)), 'photo comments wording is allowed');

  const rawList = await sendBot(bot, { action: 'comments_list' }, sent);
  assert.ok(/Сначала выберите пост/i.test(visible(rawList)), 'raw comments list without selected post is blocked or routes to selection');
  assertNoCommentsUnsafeUi(rawList, 'raw comments list rejection');

  const picker = await sendBot(bot, { action: 'comments_select_post', source: 'comments' }, sent);
  assert.ok(/Tenant A Channel|Tenant A Public Post/.test(visible(picker)), 'comments picker shows tenant A post/channel');
  assert.ok(!/Tenant B Secret Post|Tenant B Channel|Global Legacy/.test(visible(picker)), 'comments picker hides tenant B/global/legacy posts');
  assertNoCommentsUnsafeUi(picker, 'comments picker');

  const pickPayload = callbackPayload(picker, /Tenant A Public Post/);
  const card = await sendBot(bot, pickPayload, sent);
  assert.ok(/Tenant A Public Post/.test(visible(card)), 'comments card keeps selected tenant-visible post context');
  assert.ok(labels(card).includes('Проверить комментарии'), 'selected comments card exposes safe check action');
  assert.ok(labels(card).includes('Список комментариев'), 'selected comments card exposes comments list');
  assert.ok(labels(card).includes('Фото в комментариях'), 'selected comments card keeps photo comments wording');
  assert.ok(labels(card).includes('Реакции и ответы'), 'selected comments card exposes scoped reactions/replies');
  assert.ok(labels(card).includes('Настройки кнопки комментариев'), 'selected comments card exposes button settings without raw IDs');
  assertNoCommentsUnsafeUi(card, 'selected comments card');

  const rawToggle = await sendBot(bot, { action: 'comments_toggle_post_comments', enabled: '0' }, sent);
  assert.ok(/Сначала выберите пост для комментариев/i.test(visible(rawToggle)), 'raw/stale comments toggle without card marker is blocked');
  assert.strictEqual(toggleCalls.length, 0, 'raw/stale comments toggle must not call setPostCommentsEnabled');
  assert.strictEqual(store.getPost(TENANT_A_KEY).commentsDisabled, false, 'raw/stale comments toggle must not change selected post state');
  assertNoCommentsUnsafeUi(rawToggle, 'raw comments toggle rejection');

  const rawEdit = await sendBot(bot, { action: 'comments_edit_text' }, sent);
  assert.ok(/Сначала выберите пост для комментариев/i.test(visible(rawEdit)), 'raw/stale comments_edit_text from Comments UI is blocked');
  assert.ok(!store.getSetupState(TENANT_A_USER)?.commentAdminFlow, 'raw/stale comments_edit_text must not enter edit flow from Comments UI');
  assertNoCommentsUnsafeUi(rawEdit, 'raw comments edit rejection');

  const cardToggle = await sendBot(bot, { action: 'comments_toggle_post_comments', enabled: '0', source: 'comments_post_card' }, sent);
  assert.strictEqual(toggleCalls.length, 1, 'card-marked comments toggle calls setPostCommentsEnabled once');
  assert.deepStrictEqual(toggleCalls[0], { commentKey: TENANT_A_KEY, enabled: false }, 'card-marked comments toggle targets selected Tenant A post');
  assert.strictEqual(store.getPost(TENANT_A_KEY).commentsDisabled, true, 'card-marked comments toggle updates selected Tenant A post');
  assert.strictEqual(store.getPost(TENANT_B_KEY).commentsDisabled, false, 'card-marked comments toggle does not touch Tenant B post');
  assert.strictEqual(store.getPost(GLOBAL_KEY).commentsDisabled, false, 'card-marked comments toggle does not touch global legacy post');

  store.setSetupState(TENANT_A_USER, { commentTargetPost: { channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', postId: 'post-b', messageId: 'msg-b', commentKey: TENANT_B_KEY, originalText: 'Tenant B Secret Post' } });
  const staleTenantBToggle = await sendBot(bot, { action: 'comments_toggle_post_comments', enabled: '0', source: 'comments_post_card' }, sent);
  assert.ok(/Сначала выберите пост для комментариев/i.test(visible(staleTenantBToggle)), 'card-marked comments toggle rejects non-visible Tenant B selected context');
  assert.strictEqual(toggleCalls.length, 1, 'Tenant B stale toggle must not call setPostCommentsEnabled');
  assert.strictEqual(store.getPost(TENANT_B_KEY).commentsDisabled, false, 'Tenant A cannot toggle Tenant B comments');

  store.setSetupState(TENANT_A_USER, { commentTargetPost: { channelId: '-pr125-global', channelTitle: 'Global Legacy Channel', postId: 'post-global', messageId: 'msg-global', commentKey: GLOBAL_KEY, originalText: 'Global Legacy Post' } });
  const staleGlobalToggle = await sendBot(bot, { action: 'comments_toggle_post_comments', enabled: '0', source: 'comments_post_card' }, sent);
  assert.ok(/Сначала выберите пост для комментариев/i.test(visible(staleGlobalToggle)), 'card-marked comments toggle rejects global legacy selected context');
  assert.strictEqual(toggleCalls.length, 1, 'global stale toggle must not call setPostCommentsEnabled');
  assert.strictEqual(store.getPost(GLOBAL_KEY).commentsDisabled, false, 'Tenant A cannot toggle global legacy comments');

  store.setSetupState(TENANT_A_USER, { commentTargetPost: { channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a', commentKey: TENANT_A_KEY, originalText: 'Tenant A Public Post' } });

  const listPayload = callbackPayload(card, /Список комментариев/);
  assert.strictEqual(listPayload.source, 'comments_post_card', 'comments list callback carries selected post/card marker');
  const list = await sendBot(bot, listPayload, sent);
  const listText = visible(list);
  assert.ok(/Tenant A visible comment|Tenant A visible reply/.test(listText), 'comments list shows selected tenant A comments');
  assert.ok(/Всего комментариев: 2/.test(listText), 'comments total is selected-post scoped');
  assert.ok(!/Tenant B hidden comment|Global legacy hidden comment|Tenant B Secret Post|Global Legacy/.test(listText), 'comments list hides tenant B/global/legacy comments and posts');
  assertNoCommentsUnsafeUi(list, 'tenant A comments list');

  const photos = await sendBot(bot, callbackPayload(card, /Фото в комментариях/), sent);
  assert.ok(/Фото в комментариях: 1/.test(visible(photos)), 'photo comment counter is selected-post scoped');
  assertNoCommentsUnsafeUi(photos, 'photos screen');

  const reactions = await sendBot(bot, callbackPayload(card, /Реакции и ответы/), sent);
  assert.ok(/1 реакц|1 ответ/.test(visible(reactions)), 'reactions/replies are selected tenant-visible comment/post scoped');
  assert.ok(!/2 реакц|Tenant B/.test(visible(reactions)), 'tenant B reactions are not included in tenant A screen');
  assertNoCommentsUnsafeUi(reactions, 'reactions screen');

  const settings = await sendBot(bot, callbackPayload(card, /Настройки кнопки комментариев/), sent);
  assert.ok(/Настройки кнопки комментариев/.test(visible(settings)), 'comment button settings screen opens without raw identifiers');
  assertNoCommentsUnsafeUi(settings, 'button settings screen');

  const beforeModeration = JSON.stringify(store.store.moderation);
  const rawModeration = await sendBot(bot, { action: 'comments_toggle_moderation', channelId: TENANT_A_CHANNEL, field: 'enabled' }, sent);
  assert.strictEqual(JSON.stringify(store.store.moderation), beforeModeration, 'raw/stale comments moderation callback from comments UI does not mutate moderation state');
  assertNoCommentsUnsafeUi(rawModeration, 'raw moderation rejection');

  console.log('PR125 comments product-ready tenant containment assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
