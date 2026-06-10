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
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const res = await originalFetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await res.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: res.status, headers: res.headers, text, body }; }
function jsonResponse(body, status = 200) { return { ok: status >= 200 && status < 300, status, async json() { return body; } }; }
function assertNoSecrets(text, label) {
  for (const secret of ['BOT_TOKEN_PR155', 'MAX_BOT_TOKEN_PR155', 'PAIRING_SECRET_PR155', 'ADMIN_TOKEN_PR155', 'access_token', 'rawSecretValue']) {
    assert(!String(text).includes(secret), `${label} must not leak ${secret}`);
  }
}
function assertClientSafe(html, label) {
  assert(!html.includes('Опубликовать приглашение в чат'), `${label} hides group invite publish control`);
  assert(!html.includes('Получить чаты бота'), `${label} hides MAX chat diagnostics`);
  assert(!html.includes('placeholder="PUSH_ADMIN_TOKEN"'), `${label} hides admin token input`);
  assert.strictEqual((html.match(/<button\b/g) || []).length, 1, `${label} stays one-button/simple`);
}
function extractJoinToken(text) {
  const match = String(text || '').match(/\/push\/join\?t=([^\s"']+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

(async () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalUsed = backup(usedFile);
  const originalMaxApi = require.cache[require.resolve('../services/maxApi')];
  try {
    cleanEnv();
    try { fs.unlinkSync(usedFile); } catch {}
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR155';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR155';
    process.env.WEB_PUSH_SUBJECT = 'mailto:push-pr155@example.test';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_PR155';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'SUBSCRIBE_TOKEN_PR155';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR155';
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR155';
    process.env.PUBLIC_BASE_URL = 'https://push.example.test';

    const pairing = fresh('../services/pushPairingService');
    const joinToken = pairing.createPairingToken({ maxUserId: 'existing-user', chatId: 'existing-chat', ttlMinutes: 30 });

    const maxCalls = [];
    global.fetch = async (url, options = {}) => {
      maxCalls.push({ url: String(url), options, body: options.body ? JSON.parse(options.body) : null });
      assert(String(url).startsWith('https://platform-api.max.ru/'), 'group invite endpoint uses MAX API server-side');
      assert.strictEqual(options.headers && options.headers.Authorization, 'BOT_TOKEN_PR155', 'MAX API Authorization uses server-side BOT_TOKEN');
      assert(!String(url).includes('BOT_TOKEN_PR155') && !String(url).includes('MAX_BOT_TOKEN_PR155'), 'bot token is not in query string');
      return jsonResponse({ ok: true, message_id: 'max-message-pr155', access_token: 'rawSecretValue' });
    };

    await withServer(async (server) => {
      const admin = await request(server, '/push/admin?token=ADMIN_TOKEN_PR155&PUSH_ADMIN_TOKEN=ADMIN_TOKEN_PR155');
      assert.strictEqual(admin.status, 200, '/push/admin renders');
      assert(admin.text.includes('Опубликовать приглашение в чат'), '/push/admin shows group invite publish button');
      assert(admin.text.includes('Получить чаты бота'), '/push/admin keeps MAX chat diagnostics');
      assertNoSecrets(admin.text, '/push/admin');

      const publicPush = await request(server, '/push');
      assert.strictEqual(publicPush.status, 200, '/push renders');
      assertClientSafe(publicPush.text, '/push');
      const join = await request(server, `/push/join?t=${encodeURIComponent(joinToken)}`);
      assert.strictEqual(join.status, 200, '/push/join renders');
      assertClientSafe(join.text, '/push/join');

      const noAuth = await request(server, '/internal/max/group-push-invite', { method: 'POST', body: JSON.stringify({ chatId: 'chat-pr155' }), headers: { 'Content-Type': 'application/json' } });
      assert.strictEqual(noAuth.status, 403, '/internal/max/group-push-invite requires PUSH_ADMIN_TOKEN');
      const queryAuth = await request(server, '/internal/max/group-push-invite?token=ADMIN_TOKEN_PR155&PUSH_ADMIN_TOKEN=ADMIN_TOKEN_PR155', { method: 'POST', body: JSON.stringify({ chatId: 'chat-pr155' }), headers: { 'Content-Type': 'application/json' } });
      assert.strictEqual(queryAuth.status, 403, 'admin token from query string is rejected');

      const sent = await request(server, '/internal/max/group-push-invite', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ADMIN_TOKEN_PR155' }, body: JSON.stringify({ chatId: 'chat-pr155', title: 'Все свои MAX', userId: 'must-not-use' }) });
      assert.strictEqual(sent.status, 200, 'authorized group invite endpoint succeeds');
      assert.deepStrictEqual(sent.body, { ok: true, chatId: 'chat-pr155', sent: true }, 'group invite returns sanitized result');
      assertNoSecrets(sent.text, 'group invite response');
      const groupSend = maxCalls.find((call) => call.url.includes('/messages') && call.url.includes('chat_id=chat-pr155'));
      assert(groupSend, 'group invite endpoint sends group message to selected chatId');
      const messageText = JSON.stringify(groupSend.body);
      assert(messageText.includes('🔔 Подключить уведомления'), 'group invite message contains private enable button');
      assert(messageText.includes('group_push_enable'), 'group invite message uses callback payload');
      assert(!messageText.includes('"payload":"/push"'), 'group invite button does not send /push into group');
      assert(!messageText.includes('must-not-use') && !messageText.includes('userId'), 'group invite message does not contain userId');
      assert(!messageText.includes('/push/join?t='), 'group invite message does not contain personal join link');
      assertNoSecrets(messageText, 'group invite MAX payload');
    });

    const clientJs = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
    const adminHtml = fs.readFileSync(path.join(repoRoot, 'public', 'push.html'), 'utf8');
    assert(clientJs.includes('/internal/max/group-push-invite'), 'admin client publishes through group invite endpoint');
    assert(clientJs.includes('Authorization: `Bearer ${token}`'), 'admin client uses Authorization bearer header');
    assert(!clientJs.includes('platform-api.max.ru'), 'client bundle does not expose MAX API base URL');
    assert(!clientJs.includes('PUSH_PAIRING_SECRET') && !clientJs.includes('BOT_TOKEN') && !clientJs.includes('MAX_BOT_TOKEN'), 'client bundle does not expose server secrets');
    assert(!adminHtml.includes('type="text" autocomplete="off" placeholder="MAX internal chat ID"'), 'admin UI removes visible manual MAX chat ID input from publish flow');
    assert(clientJs.includes("const selectedId = selected.id || '';"), 'admin publish/members use selected chat only');
    assert(clientJs.includes('Сначала выберите чат из списка.'), 'admin selected-chat missing error uses exact safe copy');
    assert(!clientJs.includes('Выберите чат из списка MAX.'), 'old selected-chat missing error copy is removed');
    assert(!clientJs.includes("selected.id || (input ? input.value.trim() : '')"), 'admin publish has no manual input fallback');

    const sentMessages = [];
    const answers = [];
    const maxApiPath = require.resolve('../services/maxApi');
    require.cache[maxApiPath] = {
      id: maxApiPath,
      filename: maxApiPath,
      loaded: true,
      exports: {
        sendMessage: async (args) => { sentMessages.push(args); if (args.userId === 'dm-fails') throw new Error('dm_failed'); return { ok: true }; },
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

    const clckCalls = [];
    global.fetch = async (url, options = {}) => {
      clckCalls.push({ url: String(url), options });
      assert(String(url).startsWith('https://clck.ru/--?'), 'callback flow attempts to shorten through clck.ru helper');
      assert(!String(url).includes('BOT_TOKEN_PR155') && !String(url).includes('PAIRING_SECRET_PR155') && !String(url).includes('ADMIN_TOKEN_PR155'), 'shortener request does not leak server secrets');
      return { ok: true, status: 200, async text() { return 'https://clck.ru/pr155short'; } };
    };
    const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await bot.handleWebhook({ get: () => '', body: { update_type: 'message_callback', callback: { id: 'cb-pr155', payload: 'group_push_enable', user: { user_id: 'callback-user-pr155' }, message: { recipient: { chat_id: 'callback-chat-pr155', title: 'Все свои MAX', chat_type: 'chat' } } } } }, res, { botToken: 'BOT_TOKEN_PR155', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(res.statusCode, 200, 'callback handler returns 200');
    assert.strictEqual(sentMessages.length, 1, 'callback sends one private message');
    assert.strictEqual(sentMessages[0].userId, 'callback-user-pr155', 'callback handler uses callback userId');
    assert(!sentMessages[0].chatId, 'callback handler does not post personal link publicly into group');
    assert(sentMessages[0].text.includes('https://clck.ru/pr155short'), 'private DM contains short clck.ru link');
    assert(!sentMessages[0].text.includes('/push/join?t='), 'private DM does not show long join URL when short URL exists');
    const shortenedTarget = new URL(clckCalls[0].url).searchParams.get('url');
    const personalToken = extractJoinToken(shortenedTarget);
    assert(personalToken, 'callback shortening target contains personal /push/join?t= link');
    const verified = pairing.verifyPairingToken(personalToken, { allowUsed: true });
    assert.strictEqual(verified.maxUserId, 'callback-user-pr155', 'pairing token uses callback userId');
    assert.strictEqual(verified.chatId, 'callback-chat-pr155', 'pairing token uses callback chatId');
    assert(answers.some((answer) => answer.notification === 'Ссылка отправлена в личные сообщения.'), 'callback success notification is safe');

    sentMessages.length = 0; answers.length = 0; clckCalls.length = 0;
    global.fetch = async (url, options = {}) => {
      clckCalls.push({ url: String(url), options });
      return { ok: false, status: 503, async text() { return 'temporarily unavailable'; } };
    };
    const fallbackRes = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await bot.handleWebhook({ get: () => '', body: { update_type: 'message_callback', callback: { id: 'cb-pr155-fallback', payload: 'group_push_enable', user: { user_id: 'callback-user-fallback-pr155' }, message: { recipient: { chat_id: 'callback-chat-fallback-pr155', title: 'Все свои MAX', chat_type: 'chat' } } } } }, fallbackRes, { botToken: 'BOT_TOKEN_PR155', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(fallbackRes.statusCode, 200, 'shortener failure still returns callback 200');
    assert.strictEqual(sentMessages.length, 1, 'shortener failure still sends private message');
    assert(sentMessages[0].text.includes('/push/join?t='), 'shortener failure falls back to long join URL');
    assert(sentMessages[0].text.includes('АдминКИТ PUSH'), 'shortener failure includes safe fallback note');
    assert(answers.some((answer) => answer.notification === 'Ссылка отправлена в личные сообщения.'), 'shortener failure does not block callback success');

    global.fetch = async (url, options = {}) => {
      assert(String(url).startsWith('https://clck.ru/--?'), 'existing ad clck helper still calls clck endpoint');
      return { ok: true, status: 200, async text() { return 'https://clck.ru/adpr155'; } };
    };
    const adCopyClck = require('../ad-copy-link-patch-pr94').createClckShortUrl;
    assert.strictEqual(await adCopyClck('https://push.example.test/r/ad-pr155'), 'https://clck.ru/adpr155', 'existing advertising clck.ru helper remains intact');

    sentMessages.length = 0; answers.length = 0;
    const missingUserRes = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await bot.handleWebhook({ get: () => '', body: { update_type: 'message_callback', callback: { id: 'cb-missing-user-pr155', payload: 'group_push_enable', message: { recipient: { chat_id: 'callback-chat-pr155' } } } } }, missingUserRes, { botToken: 'BOT_TOKEN_PR155', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(sentMessages.length, 0, 'missing callback userId does not create/send personal link');
    assert(answers.some((answer) => String(answer.notification || '').includes('Не удалось определить пользователя')), 'missing callback userId returns safe notification');

    sentMessages.length = 0; answers.length = 0;
    const missingChatRes = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await bot.handleWebhook({ get: () => '', body: { update_type: 'message_callback', callback: { id: 'cb-missing-chat-pr155', payload: 'group_push_enable', user: { user_id: 'callback-user-pr155' }, message: {} } } }, missingChatRes, { botToken: 'BOT_TOKEN_PR155', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(sentMessages.length, 0, 'missing callback chatId does not send personal link');
    assert(answers.some((answer) => String(answer.notification || '').includes('Не удалось определить чат')), 'missing callback chatId returns safe notification');

    assert(fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8').includes("app.post('/api/push/pair'"), 'existing PR145 confirmation/pair route remains');
    assert(fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8').includes('extractPushSubscriptionFromBody'), 'existing PR150 body extraction remains');
    assert(fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8').includes("sendPushPage(req, res, { mode: 'client', joinMode: true"), 'existing PR151 client/admin split remains');
    assert(fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8').includes('/public/push-admin-manifest.json'), 'existing PR152 admin manifest behavior remains');

    console.log('group self-service push pr155 ok');
  } finally {
    global.fetch = originalFetch;
    if (originalMaxApi) require.cache[require.resolve('../services/maxApi')] = originalMaxApi; else delete require.cache[require.resolve('../services/maxApi')];
    cleanEnv();
    for (const [key, value] of Object.entries(originalEnv)) { if (value !== undefined) process.env[key] = value; }
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
