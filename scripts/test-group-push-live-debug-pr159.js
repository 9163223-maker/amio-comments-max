'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const originalFetch = global.fetch;
const ENV_KEYS = ['BOT_TOKEN', 'MAX_BOT_TOKEN', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_PAIRING_SECRET', 'WEB_PUSH_PRIVATE_KEY', 'VAPID_PRIVATE_KEY', 'ADMIN_TOKEN', 'PUBLIC_BASE_URL', 'APP_BASE_URL', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function responseStub() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function messageUpdate({ text = '/push', userId = 'user-secret-1234567890', chatId = 'chat-secret-0987654321', title = 'Тестовый чат' } = {}) {
  return { update_type: 'message_created', message: { id: `msg-${Date.now()}-${Math.random()}`, body: { text }, sender: userId ? { user_id: userId, first_name: 'PR159' } : {}, recipient: chatId ? { chat_id: chatId, chat_type: 'chat', title } : {} } };
}
function includesAny(haystack, needles) { return needles.some((needle) => needle && String(haystack).includes(String(needle))); }
async function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function request(server, target) { const res = await originalFetch(`http://127.0.0.1:${server.address().port}${target}`); const text = await res.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: res.status, text, body, headers: res.headers }; }

(async () => {
  const originalMaxApi = require.cache[require.resolve('../services/maxApi')];
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR159_SECRET';
    process.env.MAX_BOT_TOKEN = 'MAX_BOT_TOKEN_PR159_SECRET';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_PR159_SECRET';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'SUBSCRIBE_TOKEN_PR159_SECRET';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR159_SECRET';
    process.env.WEB_PUSH_PRIVATE_KEY = 'VAPID_PRIVATE_PR159_SECRET';
    process.env.PUBLIC_BASE_URL = 'https://push.example.test';

    const maxApiPath = require.resolve('../services/maxApi');
    require.cache[maxApiPath] = {
      id: maxApiPath,
      filename: maxApiPath,
      loaded: true,
      exports: {
        sendMessage: async () => ({ ok: true }),
        answerCallback: async () => ({ ok: true }),
        editMessage: async () => ({ ok: true }),
        deleteMessage: async () => ({ ok: true }),
        getBotChatMember: async () => ({ ok: true }),
        getChat: async () => ({ ok: true }),
        createUpload: async () => ({ url: 'https://upload.example.test' }),
        uploadBinaryToUrl: async () => ({ token: 'upload-token' }),
        buildUploadAttachmentPayload: () => ({ type: 'image', payload: { token: 'upload-token' } })
      }
    };
    global.fetch = async (url) => {
      if (String(url).startsWith('https://clck.ru/--')) return { ok: true, status: 200, async text() { return 'https://clck.ru/pr159short'; } };
      return originalFetch(url);
    };

    const diagnostics = fresh('../services/groupPushInboundDiagnostics');
    diagnostics.clear();
    const bot = fresh('../bot');

    let res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: '/push', userId: 'raw-user-id-1234567890', chatId: 'raw-chat-id-0987654321' }) }, res, { botToken: 'BOT_TOKEN_PR159_SECRET', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(res.statusCode, 200, '/push webhook returns 200');
    let summary = bot.getGroupPushInboundDiagnostics();
    assert.strictEqual(summary.count, 1, 'diagnostics buffer records /push message');
    assert.strictEqual(summary.latest[0].matchedPushCommand, true, '/push is matched as group push command');
    assert.strictEqual(summary.latest[0].normalizedText, '/push', '/push normalized command is safe and short');
    assert.strictEqual(summary.latest[0].hasUserId, true, 'hasUserId is recorded');
    assert.strictEqual(summary.latest[0].hasChatId, true, 'hasChatId is recorded');
    assert.strictEqual(summary.latest[0].userIdLast4, '7890', 'only last 4 chars of user id are stored');
    assert.strictEqual(summary.latest[0].chatIdLast4, '4321', 'only last 4 chars of chat id are stored');

    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: 'Включить уведомления', userId: 'button-user-5555', chatId: 'button-chat-6666' }) }, res, { botToken: 'BOT_TOKEN_PR159_SECRET', appBaseUrl: 'https://push.example.test' });
    summary = bot.getGroupPushInboundDiagnostics();
    assert(summary.latest.some((event) => event.textPreview === 'Включить уведомления' && event.matchedPushCommand), 'diagnostics buffer records “Включить уведомления” as matched');

    for (const text of ['/push', '/push@adminkit_bot', 'Включить уведомления', 'включить уведомления', 'уведомления', 'пуш']) {
      diagnostics.record({ updateType: 'message_created', messageShape: 'body+sender+recipient', text, userId: 'u-1234', chatId: 'c-5678' });
      assert.strictEqual(diagnostics.list(1)[0].matchedPushCommand, true, `${text} is matchedPushCommand=true`);
    }
    diagnostics.record({ updateType: 'message_created', messageShape: 'body+sender+recipient', text: 'hello unrelated', userId: 'u-1234', chatId: 'c-5678' });
    assert.strictEqual(diagnostics.list(1)[0].matchedPushCommand, false, 'unrelated text is matchedPushCommand=false');

    const longSecretText = `hello ${'x'.repeat(200)} ${process.env.BOT_TOKEN} https://push.example.test/push/join?t=PERSONAL_JOIN_TOKEN https://clck.ru/personal`;
    diagnostics.record({ updateType: 'message_created', messageShape: 'body+sender+recipient', text: longSecretText, userId: 'full-user-id-abcdef123456', chatId: 'full-chat-id-zyxw987654', chatTitle: '<Unsafe Chat>' });
    const safe = diagnostics.list(1)[0];
    assert(safe.textPreview.length <= 80, 'diagnostic textPreview is truncated');
    const serialized = JSON.stringify(bot.getGroupPushInboundDiagnostics());
    assert(!serialized.includes('full-user-id-abcdef123456') && !serialized.includes('full-chat-id-zyxw987654'), 'raw userId/chatId are not stored');
    assert(!includesAny(serialized, [process.env.BOT_TOKEN, process.env.MAX_BOT_TOKEN, process.env.PUSH_ADMIN_TOKEN, process.env.PUSH_SUBSCRIBE_TOKEN, process.env.PUSH_PAIRING_SECRET, process.env.WEB_PUSH_PRIVATE_KEY]), 'secrets are not present in diagnostics');
    assert(!serialized.includes('/push/join?t=PERSONAL_JOIN_TOKEN'), 'personal /push/join URL is not present');
    assert(!serialized.includes('https://clck.ru/personal'), 'personal clck.ru URL is not present');

    const { renderGroupPushInboundDebugHtml } = fresh('../services/groupPushInboundDebugPage');
    const html = renderGroupPushInboundDebugHtml(bot.getGroupPushInboundDiagnostics());
    assert(html.includes('<title>Group Push inbound debug</title>') && html.includes('matchedPushCommand') && html.includes('&lt;Unsafe Chat&gt;'), 'HTML debug endpoint renders safe readable page');
    assert(!includesAny(html, [process.env.BOT_TOKEN, 'PERSONAL_JOIN_TOKEN', 'https://clck.ru/personal']), 'HTML debug page does not leak secrets or personal URLs');

    const app = express();
    app.get('/debug/group-push-inbound.json', (req, res) => res.json({ ok: true, groupPushInboundDiagnostics: bot.getGroupPushInboundDiagnostics() }));
    app.get('/debug/group-push-inbound', (req, res) => res.type('html').send(renderGroupPushInboundDebugHtml(bot.getGroupPushInboundDiagnostics())));
    const server = await listen(app);
    try {
      const json = await request(server, '/debug/group-push-inbound.json?token=admin');
      assert.strictEqual(json.status, 200, 'JSON debug endpoint returns 200');
      assert(json.body.groupPushInboundDiagnostics.latest.length > 0, 'JSON debug endpoint returns safe diagnostics');
      const page = await request(server, '/debug/group-push-inbound?token=admin');
      assert.strictEqual(page.status, 200, 'HTML debug endpoint returns 200');
      assert(page.text.includes('Group Push inbound debug'), 'HTML debug endpoint renders title');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

    const indexSource = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8');
    assert(indexSource.includes('groupPushInboundDiagnostics: getGroupPushInboundDiagnosticsBlock()'), 'debug/export includes groupPushInboundDiagnostics in full debug payload');
    assert(indexSource.includes('groupPushInboundDiagnostics: clean.groupPushInboundDiagnostics'), 'latest-lite export includes compact groupPushInboundDiagnostics block');
    assert(indexSource.includes("/debug/group-push-inbound") && indexSource.includes("/debug/group-push-inbound.json"), 'production debug endpoints are registered');

    assert.strictEqual(typeof bot.getGroupPushInboundDiagnostics, 'function', 'bot exports diagnostics getter');
    assert.strictEqual(typeof bot.clearGroupPushInboundDiagnostics, 'function', 'bot exports diagnostics clear helper for tests');
    console.log('PR159 group Push live debug diagnostics tests passed');
  } finally {
    global.fetch = originalFetch;
    if (originalMaxApi) require.cache[require.resolve('../services/maxApi')] = originalMaxApi;
    else delete require.cache[require.resolve('../services/maxApi')];
    restoreEnv();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
