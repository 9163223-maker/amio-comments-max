'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const originalFetch = global.fetch;

const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const res = await originalFetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await res.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: res.status, headers: res.headers, text, body }; }
function jsonResponse(body, status = 200) { return { ok: status >= 200 && status < 300, status, async json() { return body; } }; }
function assertNoSecrets(text, label) {
  for (const secret of ['BOT_TOKEN_MUST_NOT_LEAK_PR154', 'MAX_BOT_TOKEN_MUST_NOT_LEAK_PR154', 'access_token', 'rawSecretValue', 'ADMIN_TOKEN_MUST_NOT_LEAK_PR154', 'SUBSCRIBE_TOKEN_MUST_NOT_LEAK_PR154']) {
    assert(!String(text).includes(secret), `${label} must not leak ${secret}`);
  }
}
function assertClientSafe(html, label) {
  assert(!html.includes('Получить чаты бота'), `${label} hides chats diagnostic button`);
  assert(!html.includes('Получить участников'), `${label} hides members diagnostic button`);
  assert(!html.includes('placeholder="MAX internal chat ID"'), `${label} hides MAX chat ID input`);
  assert(!html.includes('id="maxDiagnosticsResult"'), `${label} hides members output`);
  assert(!html.includes('placeholder="PUSH_ADMIN_TOKEN"'), `${label} hides admin token`);
  assert(!html.includes('placeholder="PUSH_SUBSCRIBE_TOKEN"'), `${label} hides subscribe token`);
  assert(!html.includes('Отправить тестовое уведомление'), `${label} hides test-send controls`);
  assert(!html.includes('<h2>Диагностика</h2>'), `${label} hides raw diagnostics`);
  assert.strictEqual((html.match(/<button\b/g) || []).length, 1, `${label} stays one-button/simple`);
}

(async () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    cleanEnv();
    resetStores();
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR154';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR154';
    process.env.WEB_PUSH_SUBJECT = 'mailto:push-pr154@example.test';
    process.env.PUSH_PAIRING_SECRET = 'SECRET_VALUE_PR154';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_MUST_NOT_LEAK_PR154';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'SUBSCRIBE_TOKEN_MUST_NOT_LEAK_PR154';
    process.env.BOT_TOKEN = 'BOT_TOKEN_MUST_NOT_LEAK_PR154';

    const pairing = fresh('../services/pushPairingService');
    const token = pairing.createPairingToken({ maxUserId: 'user-pr154', chatId: 'chat-pr154', channelId: 'channel-pr154', issuedByAdminId: 'admin-pr154', ttlMinutes: 30 });

    const maxCalls = [];
    global.fetch = async (url, options = {}) => {
      maxCalls.push({ url: String(url), options });
      assert(String(url).startsWith('https://platform-api.max.ru/'), 'server-side fetch targets MAX API');
      assert(['BOT_TOKEN_MUST_NOT_LEAK_PR154', 'MAX_BOT_TOKEN_MUST_NOT_LEAK_PR154'].includes(options.headers && options.headers.Authorization), 'MAX Authorization header uses server-side bot token');
      assert(!String(url).includes('BOT_TOKEN_MUST_NOT_LEAK_PR154'), 'MAX bot token is not sent in query string');
      if (String(url).includes('/chats/chat-pr154/members')) {
        return jsonResponse({ members: [{ user: { user_id: 'user-one', name: 'User One', username: 'one', link: 'https://max.ru/one', is_bot: false, access_token: 'rawSecretValue' }, role: 'admin', permissions: ['read_all_messages', 'manage_members', { unsafe: true }], rawSecret: 'rawSecretValue' }], marker: 'members-next', access_token: 'rawSecretValue' });
      }
      if (String(url).includes('/chats')) {
        return jsonResponse({ chats: [{ chat_id: 'chat-pr154', title: 'MAX Group', type: 'group', status: 'active', participants_count: 12, access_token: 'rawSecretValue' }], marker: 'chats-next', access_token: 'rawSecretValue' });
      }
      return jsonResponse({ ok: false }, 404);
    };

    await withServer(async (server) => {
      const admin = await request(server, '/push/admin?token=ADMIN_TOKEN_MUST_NOT_LEAK_PR154&PUSH_ADMIN_TOKEN=ADMIN_TOKEN_MUST_NOT_LEAK_PR154');
      assert.strictEqual(admin.status, 200, '/push/admin renders');
      assert(admin.text.includes('MAX group chat diagnostics'), '/push/admin shows MAX group chat diagnostics title');
      assert(admin.text.includes('Получить чаты бота'), '/push/admin shows chats button');
      assert(admin.text.includes('Получить участников'), '/push/admin shows members button');
      assert(admin.text.includes('placeholder="MAX internal chat ID"'), '/push/admin shows MAX chat ID input');
      assert(admin.text.includes('placeholder="PUSH_ADMIN_TOKEN"'), '/push/admin reuses existing PUSH_ADMIN_TOKEN input');
      assert(admin.text.includes('Последний серверный тест'), '/push/admin keeps existing admin diagnostics');
      assertNoSecrets(admin.text, '/push/admin html');

      const publicPush = await request(server, '/push');
      assert.strictEqual(publicPush.status, 200, '/push renders');
      assertClientSafe(publicPush.text, '/push');

      const join = await request(server, `/push/join?t=${encodeURIComponent(token)}`);
      assert.strictEqual(join.status, 200, '/push/join renders');
      assertClientSafe(join.text, '/push/join');

      const chatsNoAuth = await request(server, '/internal/max/chats');
      assert.strictEqual(chatsNoAuth.status, 403, '/internal/max/chats requires admin token');
      const membersNoAuth = await request(server, '/internal/max/chat-members?chatId=chat-pr154');
      assert.strictEqual(membersNoAuth.status, 403, '/internal/max/chat-members requires admin token');
      const chatsQueryAuth = await request(server, '/internal/max/chats?token=ADMIN_TOKEN_MUST_NOT_LEAK_PR154&PUSH_ADMIN_TOKEN=ADMIN_TOKEN_MUST_NOT_LEAK_PR154');
      assert.strictEqual(chatsQueryAuth.status, 403, 'admin token from query string is rejected');

      delete process.env.BOT_TOKEN;
      delete process.env.MAX_BOT_TOKEN;
      const missingBot = await request(server, '/internal/max/chats', { headers: { Authorization: 'Bearer ADMIN_TOKEN_MUST_NOT_LEAK_PR154' } });
      assert.strictEqual(missingBot.status, 503, 'missing bot token returns service unavailable');
      assert.strictEqual(missingBot.body.error, 'max_bot_token_not_configured', 'missing bot token returns safe error code');
      assertNoSecrets(missingBot.text, 'missing bot token response');

      process.env.MAX_BOT_TOKEN = 'MAX_BOT_TOKEN_MUST_NOT_LEAK_PR154';
      const chats = await request(server, '/internal/max/chats?count=100&marker=start', { headers: { Authorization: 'Bearer ADMIN_TOKEN_MUST_NOT_LEAK_PR154' } });
      assert.strictEqual(chats.status, 200, 'authorized /internal/max/chats succeeds');
      assert.deepStrictEqual(chats.body.chats[0], { chatId: 'chat-pr154', title: 'MAX Group', type: 'group', status: 'active', participantsCount: 12, isChannel: false, isGroup: true, rawKind: 'group' }, 'chats response is sanitized and useful');
      assert.strictEqual(chats.body.marker, 'chats-next', 'chats marker is returned');
      assertNoSecrets(chats.text, 'sanitized chats response');

      const members = await request(server, '/internal/max/chat-members?chatId=chat-pr154&count=100&marker=start', { headers: { 'x-push-admin-token': 'ADMIN_TOKEN_MUST_NOT_LEAK_PR154' } });
      assert.strictEqual(members.status, 200, 'authorized /internal/max/chat-members succeeds');
      assert.strictEqual(members.body.chatId, 'chat-pr154', 'members response includes chatId');
      assert.deepStrictEqual(members.body.members[0], { userId: 'user-one', name: 'User One', username: 'one', link: 'https://max.ru/one', isAdmin: true, isOwner: false, isBot: false, permissions: ['read_all_messages', 'manage_members'] }, 'members response is sanitized and useful');
      assert.strictEqual(members.body.marker, 'members-next', 'members marker is returned');
      assertNoSecrets(members.text, 'sanitized members response');

      assert(maxCalls.length >= 2, 'MAX API was called server-side');
      assert(maxCalls.every((call) => call.options.headers && call.options.headers.Authorization), 'MAX Authorization header is sent server-side');
    });

    const clientJs = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
    assert(!clientJs.includes('platform-api.max.ru'), 'client bundle does not expose MAX API base URL');
    assert(!clientJs.includes('BOT_TOKEN') && !clientJs.includes('MAX_BOT_TOKEN'), 'client bundle does not mention MAX bot token env names');

    console.log('max chat members admin pr154 ok');
  } finally {
    global.fetch = originalFetch;
    cleanEnv();
    for (const [key, value] of Object.entries(originalEnv)) { if (value !== undefined) process.env[key] = value; }
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
