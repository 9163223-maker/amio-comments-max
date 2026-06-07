'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const originalFetch = global.fetch;
const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'PUBLIC_BASE_URL', 'ADMINKIT_PUBLIC_BASE_URL', 'APP_BASE_URL'];

function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function jsonResponse(body, status = 200) { return { ok: status >= 200 && status < 300, status, async json() { return body; } }; }
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const res = await originalFetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await res.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: res.status, headers: res.headers, text, body }; }
function extractJoinToken(text) { const match = String(text || '').match(/\/push\/join\?t=([^\s"']+)/); return match ? decodeURIComponent(match[1]) : ''; }
function responseStub() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function messageUpdate({ text = '/push', userId = 'message-user-pr157', chatId = 'message-chat-pr157', title = 'Все свои MAX' } = {}) {
  return {
    update_type: 'message_created',
    message: {
      id: `msg-${Date.now()}-${Math.random()}`,
      body: { text },
      sender: userId ? { user_id: userId, first_name: 'PR157' } : {},
      recipient: chatId ? { chat_id: chatId, chat_type: 'chat', title } : {}
    }
  };
}

(async () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalUsed = backup(usedFile);
  const originalMaxApi = require.cache[require.resolve('../services/maxApi')];
  try {
    cleanEnv();
    try { fs.unlinkSync(usedFile); } catch {}
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR157';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR157';
    process.env.WEB_PUSH_SUBJECT = 'mailto:push-pr157@example.test';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_PR157';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'SUBSCRIBE_TOKEN_PR157';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR157';
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR157';
    process.env.PUBLIC_BASE_URL = 'https://push.example.test';

    const groupPush = fresh('../services/groupPushOnboardingService');
    const inviteText = groupPush.buildGroupInviteText('Все свои MAX');
    const inviteKeyboard = groupPush.buildGroupInviteKeyboard();
    const inviteButton = inviteKeyboard[0].payload.buttons[0][0];
    assert(inviteText.includes('Если кнопка не сработала') && inviteText.includes('/push'), 'group invite text contains /push fallback instruction');
    assert.strictEqual(inviteButton.type, 'message', 'group invite button is type message');
    assert.notStrictEqual(inviteButton.type, 'callback', 'group invite button is not callback');
    assert.strictEqual(inviteButton.text, 'Включить уведомления', 'group invite button text is exact');
    assert.strictEqual(inviteButton.payload, '/push', 'message button sends /push as normal message payload');
    assert(!JSON.stringify({ inviteText, inviteKeyboard }).includes('/push/join?t='), 'group invite contains no personal /push/join link');
    assert(!JSON.stringify({ inviteText, inviteKeyboard }).includes('clck.ru'), 'group invite contains no clck.ru link');
    assert(!JSON.stringify({ inviteText, inviteKeyboard }).includes('userId'), 'group invite contains no userId');
    assert(groupPush.isGroupPushCommandText('/push'), 'isGroupPushCommandText accepts /push');
    assert(groupPush.isGroupPushCommandText('/push@adminkit_bot'), 'isGroupPushCommandText accepts /push@bot_username');
    assert(groupPush.isGroupPushCommandText('пуш'), 'isGroupPushCommandText accepts пуш');
    assert(groupPush.isGroupPushCommandText('уведомления'), 'isGroupPushCommandText accepts уведомления');
    assert(groupPush.isGroupPushCommandText('включить уведомления'), 'isGroupPushCommandText accepts включить уведомления');

    const maxCalls = [];
    global.fetch = async (url, options = {}) => {
      maxCalls.push({ url: String(url), options, body: options.body ? JSON.parse(options.body) : null });
      assert(String(url).startsWith('https://platform-api.max.ru/'), 'group invite endpoint uses MAX API server-side');
      assert.strictEqual(options.headers && options.headers.Authorization, 'BOT_TOKEN_PR157', 'MAX API Authorization uses server-side BOT_TOKEN');
      assert(!String(url).includes('BOT_TOKEN_PR157') && !String(url).includes('MAX_BOT_TOKEN_PR157'), 'bot token is not in query string');
      return jsonResponse({ ok: true, message_id: 'max-message-pr157', access_token: 'rawSecretValue' });
    };

    await withServer(async (server) => {
      const sent = await request(server, '/internal/max/group-push-invite', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ADMIN_TOKEN_PR157' }, body: JSON.stringify({ chatId: 'chat-pr157', title: 'Все свои MAX', userId: 'must-not-use-pr157' }) });
      assert.strictEqual(sent.status, 200, 'authorized group invite endpoint succeeds');
      assert.deepStrictEqual(sent.body, { ok: true, chatId: 'chat-pr157', sent: true }, 'group invite returns sanitized result');
      const groupSend = maxCalls.find((call) => call.url.includes('/messages') && call.url.includes('chat_id=chat-pr157'));
      assert(groupSend, 'group invite endpoint sends to selected chat only');
      const publicPayload = JSON.stringify(groupSend.body);
      assert(publicPayload.includes('/push'), 'published invite contains /push fallback');
      assert(publicPayload.includes('"type":"message"'), 'published invite uses message button');
      assert(!publicPayload.includes('"type":"callback"'), 'published invite removed callback button');
      assert(!publicPayload.includes('/push/join?t='), 'published invite has no personal long link');
      assert(!publicPayload.includes('clck.ru'), 'published invite has no personal short link');
      assert(!publicPayload.includes('must-not-use-pr157') && !publicPayload.includes('userId'), 'published invite does not use manual userId');

      const publicPush = await request(server, '/push');
      const joinPush = await request(server, `/push/join?t=${encodeURIComponent(fresh('../services/pushPairingService').createPairingToken({ maxUserId: 'safe-user-pr157', chatId: 'safe-chat-pr157', ttlMinutes: 5 }))}`);
      assert.strictEqual(publicPush.status, 200, '/push renders client page');
      assert.strictEqual(joinPush.status, 200, '/push/join renders client page');
      assert(!publicPush.text.includes('Опубликовать приглашение в чат') && !publicPush.text.includes('Получить чаты бота'), '/push remains client-safe/simple');
      assert(!joinPush.text.includes('Опубликовать приглашение в чат') && !joinPush.text.includes('Получить чаты бота'), '/push/join remains client-safe/simple');
    });

    const sentMessages = [];
    const answers = [];
    const maxApiPath = require.resolve('../services/maxApi');
    require.cache[maxApiPath] = {
      id: maxApiPath,
      filename: maxApiPath,
      loaded: true,
      exports: {
        sendMessage: async (args) => { sentMessages.push(args); if (args.userId === 'dm-fails-pr157') throw new Error('dm_failed'); return { ok: true }; },
        answerCallback: async (args) => { answers.push(args); return { ok: true }; },
        editMessage: async () => ({ ok: true }),
        deleteMessage: async () => ({ ok: true }),
        getBotChatMember: async () => ({ ok: true }),
        getChat: async () => ({ ok: true }),
        createUpload: async () => ({ url: 'https://upload.example.test' }),
        uploadBinaryToUrl: async () => ({ token: 'upload-token' }),
        buildUploadAttachmentPayload: () => ({ type: 'image', payload: { token: 'upload-token' } })
      }
    };
    delete require.cache[require.resolve('../bot')];
    const bot = require('../bot');
    const pairing = fresh('../services/pushPairingService');

    let clckCalls = [];
    global.fetch = async (url, options = {}) => {
      clckCalls.push({ url: String(url), options });
      assert(String(url).startsWith('https://clck.ru/--?'), 'message flow attempts to shorten through clck.ru');
      assert(!String(url).includes('BOT_TOKEN_PR157') && !String(url).includes('PAIRING_SECRET_PR157') && !String(url).includes('ADMIN_TOKEN_PR157'), 'shortener request does not leak server secrets');
      return { ok: true, status: 200, async text() { return 'https://clck.ru/pr157short'; } };
    };
    let res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: '/push', userId: 'message-user-pr157', chatId: 'message-chat-pr157' }) }, res, { botToken: 'BOT_TOKEN_PR157', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(res.statusCode, 200, '/push normal group message returns 200');
    assert.strictEqual(sentMessages.length, 2, '/push normal message sends private link then safe group reply');
    const privateDm = sentMessages.find((msg) => msg.userId === 'message-user-pr157');
    const groupReply = sentMessages.find((msg) => msg.chatId === 'message-chat-pr157');
    assert(privateDm, '/push normal message sends personal link privately to sender userId');
    assert(privateDm.text.includes('https://clck.ru/pr157short'), 'private link uses clck.ru short URL when shortener succeeds');
    assert(!privateDm.chatId, 'private personal link is not sent with chatId');
    assert(groupReply, '/push normal message replies in group');
    assert.strictEqual(groupReply.text, 'Отправил ссылку подключения в личные сообщения.', 'public group reply is safe confirmation only');
    assert(!groupReply.text.includes('/push/join?t='), 'public group reply contains no personal long URL');
    assert(!groupReply.text.includes('clck.ru'), 'public group reply contains no personal clck.ru URL');
    const shortenedTarget = new URL(clckCalls[0].url).searchParams.get('url');
    const personalToken = extractJoinToken(shortenedTarget);
    assert(personalToken, 'shortened target contains personal /push/join link');
    const verified = pairing.verifyPairingToken(personalToken, { allowUsed: true });
    assert.strictEqual(verified.maxUserId, 'message-user-pr157', '/push token uses sender userId from real message');
    assert.strictEqual(verified.chatId, 'message-chat-pr157', '/push token uses chatId from real message recipient');

    sentMessages.length = 0; clckCalls = [];
    global.fetch = async (url, options = {}) => { clckCalls.push({ url: String(url), options }); return { ok: false, status: 503, async text() { return 'temporarily unavailable'; } }; };
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: '/push@adminkit_bot', userId: 'message-fallback-user-pr157', chatId: 'message-fallback-chat-pr157' }) }, res, { botToken: 'BOT_TOKEN_PR157', appBaseUrl: 'https://push.example.test' });
    const fallbackPrivate = sentMessages.find((msg) => msg.userId === 'message-fallback-user-pr157');
    const fallbackGroup = sentMessages.find((msg) => msg.chatId === 'message-fallback-chat-pr157');
    assert(fallbackPrivate && fallbackPrivate.text.includes('/push/join?t='), 'private link falls back to long URL when clck.ru fails');
    assert(fallbackPrivate.text.includes('Короткая ссылка временно недоступна'), 'fallback private DM explains short link failure safely');
    assert(fallbackGroup && !fallbackGroup.text.includes('/push/join?t=') && !fallbackGroup.text.includes('clck.ru'), 'shortener fallback still does not post personal link publicly');

    sentMessages.length = 0; clckCalls = [];
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: '/push', userId: '', chatId: 'missing-user-chat-pr157' }) }, res, { botToken: 'BOT_TOKEN_PR157', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(clckCalls.length, 0, 'missing sender userId does not create/shorten token');
    assert.strictEqual(sentMessages.length, 1, 'missing sender userId returns one safe group reply');
    assert.strictEqual(sentMessages[0].chatId, 'missing-user-chat-pr157', 'missing sender userId reply stays in group');
    assert(sentMessages[0].text.includes('Не удалось определить пользователя MAX'), 'missing sender userId safe reply');
    assert(!sentMessages[0].text.includes('/push/join?t=') && !sentMessages[0].text.includes('clck.ru'), 'missing sender userId reply has no personal link');

    sentMessages.length = 0; clckCalls = [];
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: '/push', userId: 'missing-chat-user-pr157', chatId: '' }) }, res, { botToken: 'BOT_TOKEN_PR157', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(clckCalls.length, 0, 'missing chatId does not create/shorten token');
    assert.strictEqual(sentMessages.length, 1, 'missing chatId returns one safe private reply');
    assert.strictEqual(sentMessages[0].userId, 'missing-chat-user-pr157', 'missing chatId reply goes privately to sender');
    assert(sentMessages[0].text.includes('Не удалось определить чат MAX'), 'missing chatId safe reply');
    assert(!sentMessages[0].text.includes('/push/join?t=') && !sentMessages[0].text.includes('clck.ru'), 'missing chatId reply has no personal link');

    sentMessages.length = 0; clckCalls = [];
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: '/push', userId: 'dm-fails-pr157', chatId: 'dm-fails-chat-pr157' }) }, res, { botToken: 'BOT_TOKEN_PR157', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(sentMessages.length, 2, 'DM failure attempts private DM then safe group reply');
    const dmFailGroup = sentMessages.find((msg) => msg.chatId === 'dm-fails-chat-pr157');
    assert(dmFailGroup && dmFailGroup.text.includes('Не удалось отправить ссылку в личные сообщения'), 'DM failure returns safe group message');
    assert(!dmFailGroup.text.includes('/push/join?t=') && !dmFailGroup.text.includes('clck.ru'), 'DM failure group reply has no personal link');

    sentMessages.length = 0; answers.length = 0; clckCalls = [];
    global.fetch = async (url, options = {}) => { clckCalls.push({ url: String(url), options }); return { ok: true, status: 200, async text() { return 'https://clck.ru/pr157callback'; } }; };
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: { update_type: 'message_callback', callback: { id: 'cb-pr157', payload: 'group_push_enable', user: { user_id: 'callback-user-pr157' }, message: { recipient: { chat_id: 'callback-chat-pr157', title: 'Все свои MAX', chat_type: 'chat' } } } } }, res, { botToken: 'BOT_TOKEN_PR157', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(res.statusCode, 200, 'existing callback flow still returns 200');
    assert.strictEqual(sentMessages.length, 1, 'existing callback flow sends only private message');
    assert.strictEqual(sentMessages[0].userId, 'callback-user-pr157', 'callback flow remains user-bound best-effort');
    assert(!sentMessages[0].chatId, 'callback flow remains safe: no public personal link');
    assert(sentMessages[0].text.includes('https://clck.ru/pr157callback'), 'callback flow still uses private short URL');
    assert(answers.some((answer) => answer.notification === 'Ссылка отправлена в личные сообщения.'), 'callback flow safe notification remains');

    const routesSource = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');
    const clientSource = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
    assert(routesSource.includes("sendPushPage(req, res, { mode: 'client', joinMode: true"), '/push/join client page remains client-safe/simple');
    assert(routesSource.includes("sendPushPage(req, res, { mode: 'client', joinMode: false"), '/push client page remains client-safe/simple');
    assert(clientSource.includes('/internal/max/group-push-invite'), 'admin Push PWA group invite wiring remains');
    assert(clientSource.includes('Authorization: `Bearer ${token}`'), 'admin Push PWA still uses bearer token');
    assert(!clientSource.includes('platform-api.max.ru'), 'client Push PWA still does not expose MAX API base URL');

    console.log('group push message button pr157 ok');
  } finally {
    global.fetch = originalFetch;
    if (originalMaxApi) require.cache[require.resolve('../services/maxApi')] = originalMaxApi; else delete require.cache[require.resolve('../services/maxApi')];
    cleanEnv();
    for (const [key, value] of Object.entries(originalEnv)) { if (value !== undefined) process.env[key] = value; }
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
