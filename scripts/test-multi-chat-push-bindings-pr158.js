'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'PUBLIC_BASE_URL', 'ADMINKIT_PUBLIC_BASE_URL', 'APP_BASE_URL', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
const originalFetch = global.fetch;

function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function validSubscription(suffix) { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function responseStub() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function messageUpdate({ text = '/push', userId = 'multi-user', chatId = 'chat-one', title = 'Все свои MAX' } = {}) { return { update_type: 'message_created', message: { id: `msg-${Date.now()}-${Math.random()}`, body: { text }, sender: userId ? { user_id: userId, first_name: 'PR158' } : {}, recipient: chatId ? { chat_id: chatId, chat_type: 'chat', title } : {} } }; }
function callbackUpdate({ userId = 'multi-user', chatId = 'callback-chat', title = 'Callback Chat' } = {}) { return { update_type: 'message_callback', callback: { id: `cb-${Date.now()}-${Math.random()}`, payload: 'group_push_enable', user: { user_id: userId }, message: { recipient: { chat_id: chatId, title, chat_type: 'chat' } } } }; }
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const res = await originalFetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await res.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: res.status, headers: res.headers, text, body }; }

(async () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  const originalMaxApi = require.cache[require.resolve('../services/maxApi')];
  try {
    cleanEnv();
    resetStores();
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR158';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR158';
    process.env.WEB_PUSH_SUBJECT = 'mailto:push-pr158@example.test';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_PR158';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR158';
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR158';
    process.env.PUBLIC_BASE_URL = 'https://push.example.test';

    const maxApi = fresh('../services/maxApi');
    const sentMessages = [];
    const answers = [];
    maxApi.sendMessage = async (message) => { sentMessages.push(message); return { message: { id: `sent-${sentMessages.length}` } }; };
    maxApi.answerCallback = async (answer) => { answers.push(answer); return { success: true }; };
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('https://clck.ru/--')) return { ok: true, status: 200, async text() { return 'https://clck.ru/pr158'; } };
      return originalFetch(url, options);
    };

    const bot = fresh('../bot');
    const storage = fresh('../services/webPushStorage');
    const dispatch = fresh('../services/pushDispatchService');
    const pairing = fresh('../services/pushPairingService');
    const confirmation = fresh('../services/pushConfirmationService');

    let res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ userId: 'first-user', chatId: 'first-chat', title: 'Первый чат' }) }, res, { botToken: 'BOT_TOKEN_PR158', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(res.statusCode, 200, 'first /push webhook succeeds');
    assert.strictEqual(sentMessages.length, 1, 'first /push sends private setup link only');
    const privateSetup = sentMessages.find((msg) => msg.userId === 'first-user');
    const publicReply = sentMessages.find((msg) => msg.chatId === 'first-chat');
    assert(privateSetup && privateSetup.text.includes('https://clck.ru/pr158'), 'first-time user gets private shortened setup link');
    assert(!publicReply, 'first /push does not post publicly on success');

    resetStores(); sentMessages.length = 0; answers.length = 0;
    const pending = await storage.savePairedDevice(validSubscription('pair-initial'), { maxUserId: 'pair-user', chatId: 'pair-chat', status: 'pending' });
    assert.strictEqual((await dispatch.sendPushToUser({ maxUserId: 'pair-user', chatId: 'pair-chat', webPushClient: { sendNotification: async () => ({ statusCode: 201 }) } })).total, 0, 'pending/unconfirmed devices do not receive chat notifications');
    const activated = await confirmation.confirmDeviceForUser({ deviceId: pending.deviceId, confirmingUserId: 'pair-user' });
    assert.strictEqual(activated.ok, true, 'existing confirmation callback behavior activates device');
    assert.strictEqual(await storage.isChatBoundForUser('pair-user', 'pair-chat'), true, 'device activation adds initial chat binding from pairing token');
    assert.strictEqual((await storage.listChatBindingsForUser('pair-user')).length, 1, 'initial binding count is one');

    await storage.savePairedDevice(validSubscription('active-one'), { maxUserId: 'multi-user', chatId: 'chat-one', status: 'active' });
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ userId: 'multi-user', chatId: 'chat-two', title: 'Второй чат' }) }, res, { botToken: 'BOT_TOKEN_PR158', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(sentMessages.filter((msg) => msg.userId === 'multi-user').length, 1, 'second /push with active device sends private setup link for another device');
    const secondReply = sentMessages.find((msg) => msg.chatId === 'chat-two');
    assert(!secondReply, 'second /push posts no group success text');
    assert.strictEqual(await storage.isChatBoundForUser('multi-user', 'chat-two'), false, 'second /push waits for endpoint confirmation');
    assert.strictEqual((await storage.listChatBindingsForUser('multi-user')).filter((b) => b.chatId === 'chat-two').length, 0, 'no binding is created before confirmation');
    res = responseStub(); sentMessages.length = 0;
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ userId: 'multi-user', chatId: 'chat-two', title: 'Второй чат' }) }, res, { botToken: 'BOT_TOKEN_PR158', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual((await storage.listChatBindingsForUser('multi-user')).filter((b) => b.chatId === 'chat-two').length, 0, 'repeated /push still waits for confirmation');
    assert(sentMessages.some((message) => message.userId === 'multi-user' && String(message.text || '').includes('подключите этот чат')), 'repeated /push sends private multi-device link safely');

    await storage.savePairedDevice(validSubscription('active-two'), { maxUserId: 'multi-user', chatId: 'chat-one', status: 'active' });
    await storage.upsertChatBindingForUserDevices({ maxUserId: 'multi-user', chatId: 'chat-three', chatTitle: 'Третий чат' });
    assert.strictEqual((await storage.listActiveDevicesForChatAndUser({ maxUserId: 'multi-user', chatId: 'chat-three' })).length, 2, 'multiple active devices for same user all get new chat binding');
    assert((await storage.listChatBindingsForUser('multi-user')).some((b) => b.chatId === 'chat-one'), 'previous chat binding is preserved');
    assert(!(await storage.listChatBindingsForUser('multi-user')).some((b) => b.chatId === 'chat-two'), 'unconfirmed chat is not reported as connected');

    await storage.savePairedDevice(validSubscription('other-user'), { maxUserId: 'other-user', chatId: 'other-chat', status: 'active' });
    const endpoints = [];
    const chatSend = await dispatch.sendPushToChat({ chatId: 'chat-three', payload: { source: 'max_group', chatId: 'chat-three', chatTitle: 'Третий чат', senderName: 'Анна', messageText: 'Сообщение только для третьего чата', messageId: 'm3' }, webPushClient: { sendNotification: async (subscription, payload) => { endpoints.push(subscription.endpoint); JSON.parse(payload); return { statusCode: 201 }; } } });
    assert.strictEqual(chatSend.total, 2, 'chat-aware dispatch sends only to bound active devices');
    assert.deepStrictEqual(endpoints.sort(), ['https://push.example.test/send/active-one', 'https://push.example.test/send/active-two'].sort(), 'unbound devices are excluded from chat notification');

    sentMessages.length = 0; answers.length = 0;
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: callbackUpdate({ userId: 'multi-user', chatId: 'callback-chat', title: 'Callback Chat' }) }, res, { botToken: 'BOT_TOKEN_PR158', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(await storage.isChatBoundForUser('multi-user', 'callback-chat'), false, 'callback waits for confirmed endpoint binding');
    assert.strictEqual(sentMessages.filter((message) => message.userId === 'multi-user').length, 1, 'callback fallback with active device sends private setup link for another device');
    assert(answers.some((answer) => String(answer.notification || '') === 'Ссылка отправлена в личные сообщения.'), 'callback fallback answers safely without link');

    await withServer(async (server) => {
      const token = pairing.createPairingToken({ maxUserId: 'route-user', chatId: 'route-chat', ttlMinutes: 30 });
      const pair = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: token, subscription: validSubscription('route-pair') }) });
      assert.strictEqual(pair.status, 200, '/api/push/pair behavior remains');
      const device = JSON.parse(fs.readFileSync(storageFile, 'utf8')).subscriptions.find((item) => item.maxUserId === 'route-user');
      assert(device && device.status === 'pending', '/api/push/pair still stores pending device before confirmation');
      assert.strictEqual(await storage.isChatBoundForUser('route-user', 'route-chat'), false, 'pending /api/push/pair device is not bound before activation');
      const confirmed = await confirmation.confirmDeviceForUser({ deviceId: device.deviceId, confirmingUserId: 'route-user' });
      assert.strictEqual(confirmed.ok, true, 'pair route device confirmation remains');
      assert.strictEqual(await storage.isChatBoundForUser('route-user', 'route-chat'), true, 'pair route activation adds initial chat binding');
    });

    const sourceStorage = fs.readFileSync(path.join(repoRoot, 'services', 'webPushStorage.js'), 'utf8');
    for (const name of ['listActiveDevicesForUser', 'upsertChatBindingForDevice', 'upsertChatBindingForUserDevices', 'listChatBindingsForUser', 'isChatBoundForUser', 'listActiveDevicesForChat', 'listActiveDevicesForChatAndUser']) assert(sourceStorage.includes(name), `storage helper ${name} exists`);
    assert(!sentMessages.map((msg) => msg.text || '').join('\n').includes('PAIRING_SECRET_PR158'), 'message text does not expose pairing secret');

    console.log('multi chat push bindings pr158 ok');
  } finally {
    global.fetch = originalFetch;
    if (originalMaxApi) require.cache[require.resolve('../services/maxApi')] = originalMaxApi; else delete require.cache[require.resolve('../services/maxApi')];
    cleanEnv();
    for (const [key, value] of Object.entries(originalEnv)) { if (value !== undefined) process.env[key] = value; }
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
