'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const storeFile = path.join(repoRoot, 'data', 'store.json');
const pushStorageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedPairingFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const ENV_KEYS = [
  'BOT_TOKEN',
  'MAX_BOT_TOKEN',
  'PUSH_ADMIN_TOKEN',
  'PUSH_SUBSCRIBE_TOKEN',
  'PUSH_PAIRING_SECRET',
  'WEB_PUSH_PUBLIC_KEY',
  'WEB_PUSH_PRIVATE_KEY',
  'VAPID_PRIVATE_KEY',
  'PUBLIC_BASE_URL',
  'APP_BASE_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_URI',
  'PG_URL',
  'PGURI',
  'NF_POSTGRES_URI',
  'NF_POSTGRES_URL',
  'DB_URL',
  'DB_CONNECTION_STRING'
];
const originalFetch = global.fetch;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function backup(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}
function restore(file, content) {
  if (content === null) {
    try { fs.unlinkSync(file); } catch {}
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}
function cleanEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}
function restoreEnv() {
  cleanEnv();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value !== undefined) process.env[key] = value;
  }
}
function fresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}
function responseStub() {
  return {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
function validSubscription(suffix) {
  return {
    endpoint: `https://push.example.test/send/${suffix}`,
    expirationTime: null,
    keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` }
  };
}
function messageUpdate({
  text = '/push',
  userId = 'route-user',
  chatId = 'route-chat',
  title = 'Route Chat',
  chatType = 'chat',
  postId = '',
  bodyNestedIdentity = false
} = {}) {
  const sender = userId ? { user_id: userId, first_name: 'Route' } : {};
  const recipient = chatId ? { chat_id: chatId, chat_type: chatType, title } : {};
  const body = { text };
  if (postId) body.seq = postId;
  if (bodyNestedIdentity) {
    body.sender = sender;
    body.recipient = recipient;
    return { update_type: 'message_created', message: { id: `msg-${Date.now()}-${Math.random()}`, body } };
  }
  return {
    update_type: 'message_created',
    message: {
      id: `msg-${Date.now()}-${Math.random()}`,
      body,
      sender,
      recipient
    }
  };
}
async function webhook(bot, update, sentMessages) {
  const res = responseStub();
  await bot.handleWebhook({ get: () => '', body: update }, res, { botToken: 'BOT_TOKEN_ROUTE_SECRET', appBaseUrl: 'https://push.example.test', botUsername: 'adminkit_bot' });
  assert.strictEqual(res.statusCode, 200, `${update.message?.body?.text || 'message'} webhook returns 200`);
  assert(!JSON.stringify(res.body || {}).includes('PAIRING_SECRET_ROUTE'), 'webhook response does not expose pairing secret');
  assert(!JSON.stringify(sentMessages || []).includes('PAIRING_SECRET_ROUTE'), 'sent messages do not expose pairing secret');
  return res.body;
}
function texts(messages) {
  return messages.map((message) => String(message.text || '')).join('\n');
}
function assertNoPersonalLink(message, label) {
  const text = String(message?.text || '');
  assert(!/\/push\/join\?t=/i.test(text), `${label} has no long personal join link`);
  assert(!/https?:\/\/clck\.ru\//i.test(text), `${label} has no clck.ru personal link`);
}

(async () => {
  const originalStore = backup(storeFile);
  const originalPushStorage = backup(pushStorageFile);
  const originalUsedPairing = backup(usedPairingFile);
  const originalMaxApi = require.cache[require.resolve('../services/maxApi')];
  try {
    cleanEnv();
    restore(storeFile, JSON.stringify({ posts: {}, comments: {}, likes: {}, reactions: {}, channels: {}, setup: {}, setupState: {}, handoffs: {}, growth: { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} }, gifts: { campaigns: {}, claims: {}, settings: {} }, moderation: { settings: {}, logs: {} }, uploads: [] }));
    try { fs.unlinkSync(pushStorageFile); } catch {}
    try { fs.unlinkSync(usedPairingFile); } catch {}
    process.env.BOT_TOKEN = 'BOT_TOKEN_ROUTE_SECRET';
    process.env.MAX_BOT_TOKEN = 'MAX_BOT_TOKEN_ROUTE_SECRET';
    process.env.PUSH_ADMIN_TOKEN = 'PUSH_ADMIN_TOKEN_ROUTE_SECRET';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'PUSH_SUBSCRIBE_TOKEN_ROUTE_SECRET';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_ROUTE';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_ROUTE';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_ROUTE';
    process.env.PUBLIC_BASE_URL = 'https://push.example.test';

    const maxApi = fresh('../services/maxApi');
    const sentMessages = [];
    const editedMessages = [];
    maxApi.sendMessage = async (message) => { sentMessages.push(message); return { message: { id: `sent-${sentMessages.length}` } }; };
    maxApi.editMessage = async (message) => { editedMessages.push(message); return { ok: true, durationMs: 1 }; };
    maxApi.answerCallback = async () => ({ ok: true });
    maxApi.deleteMessage = async () => ({ ok: true });
    maxApi.getBotChatMember = async () => ({ ok: true, permissions: { is_admin: true } });
    maxApi.getChat = async ({ chatId }) => ({ id: chatId, title: `Title ${chatId}` });
    global.fetch = async (url, options = {}) => {
      if (String(url).startsWith('https://clck.ru/--')) return { ok: true, status: 200, async text() { return 'https://clck.ru/route-short'; } };
      return originalFetch(url, options);
    };

    const diagnostics = fresh('../services/groupPushInboundDiagnostics');
    diagnostics.clear();
    const store = fresh('../store');
    const bot = fresh('../bot');
    const storage = fresh('../services/webPushStorage');

    for (const text of ['/push', 'Включить уведомления', '/push@adminkit_bot', 'пуш', 'уведомления']) {
      const beforePosts = store.getPostsList().length;
      const beforeEdits = editedMessages.length;
      const body = await webhook(bot, messageUpdate({ text, userId: `first-${text}`, chatId: `chat-${text}`, chatType: 'channel', postId: `post-${text}` }), sentMessages);
      assert.strictEqual(body.action, 'group_push_message_command', `${text} routes to group push onboarding`);
      assert.strictEqual(store.getPostsList().length, beforePosts, `${text} does not create/persist normal post record`);
      assert.strictEqual(editedMessages.length, beforeEdits, `${text} does not get comments button patch`);
      const latest = bot.getGroupPushInboundDiagnostics().latest.slice(-1)[0];
      assert.strictEqual(latest.matchedPushCommand, true, `${text} diagnostic records matchedPushCommand=true`);
      assert.strictEqual(latest.routeCandidate, 'group_push_command', `${text} diagnostic records command route candidate`);
      assert.strictEqual(latest.routeDecision, 'group_push_route', `${text} diagnostic records group push route decision`);
      assert.strictEqual(latest.routeResult, 'handled', `${text} diagnostic records handled route result`);
    }

    const firstPrivate = sentMessages.find((message) => message.userId && String(message.text || '').includes('Откройте ссылку на iPhone'));
    const firstGroup = sentMessages.find((message) => message.chatId && String(message.text || '').includes('Отправил ссылку подключения'));
    assert(firstPrivate && /https:\/\/clck\.ru\/route-short/.test(firstPrivate.text), 'first-time user receives private setup link');
    assert(!firstGroup, 'first-time user gets no public group acknowledgement on success');

    const beforeNormalPosts = store.getPostsList().length;
    const beforeNormalEdits = editedMessages.length;
    await webhook(bot, messageUpdate({ text: 'Обычный пост Product Perfect', userId: 'normal-user', chatId: 'normal-channel', title: 'Normal Channel', chatType: 'channel', postId: 'normal-post-1' }), sentMessages);
    assert(store.getPostsList().length > beforeNormalPosts, 'non-command message still goes to existing normal post path');
    assert(editedMessages.length > beforeNormalEdits, 'non-command direct channel post still gets comments button patch');

    await storage.savePairedDevice(validSubscription('active-route'), { maxUserId: 'active-user', chatId: 'old-chat', status: 'active' });
    sentMessages.length = 0;
    await webhook(bot, messageUpdate({ text: '/push', userId: 'active-user', chatId: 'active-chat', title: 'Active Chat' }), sentMessages);
    assert.strictEqual(await storage.isChatBoundForUser('active-user', 'active-chat'), false, '/push does not claim a binding before the device confirms pairing');
    assert.strictEqual(sentMessages.filter((message) => message.userId === 'active-user').length, 1, 'existing active user gets a fresh setup link for another device');
    assert(sentMessages.some((message) => message.userId === 'active-user' && String(message.text || '').includes('подключите этот чат')), 'existing active user gets a fresh enable explanation');
    assert.strictEqual(sentMessages.filter((message) => message.chatId === 'active-chat').length, 0, 'existing active user gets no public group success reply');

    sentMessages.length = 0;
    await webhook(bot, messageUpdate({ text: '/push', userId: 'active-user', chatId: 'active-chat', title: 'Active Chat' }), sentMessages);
    assert.strictEqual((await storage.listChatBindingsForUser('active-user')).filter((binding) => binding.chatId === 'active-chat').length, 0, 'repeated /push still waits for confirmed device pairing');
    assert(sentMessages.some((message) => message.userId === 'active-user' && /https:\/\/clck\.ru\/route-short/.test(String(message.text || ''))), 'repeated /push sends another private setup link');
    assert.strictEqual(sentMessages.filter((message) => message.chatId === 'active-chat').length, 0, 'repeated /push sends no public group reply');

    sentMessages.length = 0;
    await webhook(bot, messageUpdate({ text: '/push', userId: '', chatId: 'missing-user-chat' }), sentMessages);
    let latest = bot.getGroupPushInboundDiagnostics().latest.slice(-1)[0];
    assert.strictEqual(latest.routeDecision, 'missing_user_id', 'missing userId diagnostic records safe error route');
    assert.strictEqual(latest.routeResult, 'error', 'missing userId diagnostic records error result');
    assert.strictEqual(latest.errorCode, 'message_user_id_missing', 'missing userId diagnostic records errorCode');
    assert(!texts(sentMessages).includes('/push/join?t='), 'missing userId sends no token');

    sentMessages.length = 0;
    await webhook(bot, messageUpdate({ text: '/push', userId: 'missing-chat-user', chatId: '' }), sentMessages);
    latest = bot.getGroupPushInboundDiagnostics().latest.slice(-1)[0];
    assert.strictEqual(latest.routeDecision, 'missing_chat_id', 'missing chatId diagnostic records safe error route');
    assert.strictEqual(latest.routeResult, 'error', 'missing chatId diagnostic records error result');
    assert.strictEqual(latest.errorCode, 'message_chat_id_missing', 'missing chatId diagnostic records errorCode');
    assert(!texts(sentMessages).includes('/push/join?t='), 'missing chatId sends no token');

    sentMessages.length = 0;
    await webhook(bot, messageUpdate({ text: '/push', userId: 'nested-user', chatId: 'nested-chat', bodyNestedIdentity: true }), sentMessages);
    latest = bot.getGroupPushInboundDiagnostics().latest.slice(-1)[0];
    assert.strictEqual(latest.hasUserId, true, 'body-nested sender identity is recognized for live MAX shape');
    assert.strictEqual(latest.hasChatId, true, 'body-nested chat identity is recognized for live MAX shape');
    assert.strictEqual(latest.routeDecision, 'group_push_route', 'body-nested MAX shape routes to group push onboarding');

    const edgeSource = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8');
    assert(edgeSource.includes("app.get('/debug/webhook-edge'"), 'PR159/PR160 webhook edge diagnostics endpoint remains registered');
    assert(edgeSource.includes('maxWebhookEdgeDiagnostics.record({ req, handedToBot: false })'), 'PR159/PR160 webhook edge diagnostic record remains before bot handoff');
    const storageSource = fs.readFileSync(path.join(repoRoot, 'services', 'webPushStorage.js'), 'utf8');
    assert(storageSource.includes('upsertChatBindingForUserDevices'), 'PR158 multi-chat binding helper remains available');

    console.log('group push command route ok');
  } finally {
    global.fetch = originalFetch;
    if (originalMaxApi) require.cache[require.resolve('../services/maxApi')] = originalMaxApi;
    else delete require.cache[require.resolve('../services/maxApi')];
    restore(storeFile, originalStore);
    restore(pushStorageFile, originalPushStorage);
    restore(usedPairingFile, originalUsedPairing);
    restoreEnv();
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
