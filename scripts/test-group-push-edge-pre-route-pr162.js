'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const storeFile = path.join(repoRoot, 'data', 'store.json');
const pushStorageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedPairingFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const originalFetch = global.fetch;

const ENV_KEYS = [
  'BOT_TOKEN', 'MAX_BOT_TOKEN', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_PAIRING_SECRET',
  'WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'VAPID_PRIVATE_KEY', 'PUBLIC_BASE_URL', 'APP_BASE_URL',
  'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL',
  'DB_URL', 'DB_CONNECTION_STRING', 'ADMIN_TOKEN', 'WEBHOOK_PATH', 'PORT', 'DEBUG_EXPORT_ALLOW_PUBLIC'
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) {
  if (content === null) { try { fs.unlinkSync(file); } catch {} return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}
function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function restoreEnv() {
  cleanEnv();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value !== undefined) process.env[key] = value;
  }
}
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function validSubscription(suffix) {
  return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } };
}
function messageUpdate({ text = '/push', userId = 'edge-user', chatId = 'edge-chat', title = 'Edge Chat', chatType = 'chat', nested = false } = {}) {
  const sender = userId ? { user_id: userId, first_name: 'Edge' } : {};
  const recipient = chatId ? { chat_id: chatId, chat_type: chatType, title } : {};
  const body = { text };
  if (nested) {
    body.sender = sender;
    body.recipient = recipient;
    return { update_type: 'message_created', message: { id: `msg-${Date.now()}-${Math.random()}`, body } };
  }
  return { update_type: 'message_created', message: { id: `msg-${Date.now()}-${Math.random()}`, body, sender, recipient } };
}
function responseStub() {
  return { statusCode: 0, body: null, headersSent: false, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.headersSent = true; return this; } };
}
function texts(messages) { return messages.map((message) => String(message.text || '')).join('\n'); }
function assertNoPersonalLink(message, label) {
  const text = String(message && message.text || '');
  assert(!/\/push\/join\?t=/i.test(text), `${label} has no long personal join link`);
  assert(!/https?:\/\/clck\.ru\//i.test(text), `${label} has no clck.ru personal link`);
}
async function waitForServer(child, port) {
  const deadline = Date.now() + 8000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const res = await originalFetch(`http://127.0.0.1:${port}/debug/version`);
      if (res.ok) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('server did not start');
}
async function httpJson(port, target, options = {}) {
  const res = await originalFetch(`http://127.0.0.1:${port}${target}`, options);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, text, body };
}
function readSent(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } }
async function postWebhook(port, update) {
  return httpJson(port, '/webhook/max', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
}

(async () => {
  const originalStore = backup(storeFile);
  const originalPushStorage = backup(pushStorageFile);
  const originalUsedPairing = backup(usedPairingFile);
  const originalMaxApi = require.cache[require.resolve('../services/maxApi')];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr162-edge-'));
  const sentFile = path.join(tmpDir, 'sent.json');
  const preloadFile = path.join(tmpDir, 'mock-fetch.js');

  try {
    cleanEnv();
    restore(storeFile, JSON.stringify({ posts: {}, comments: {}, likes: {}, reactions: {}, channels: {}, setup: {}, setupState: {}, handoffs: {}, growth: { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} }, gifts: { campaigns: {}, claims: {}, settings: {} }, moderation: { settings: {}, logs: {} }, uploads: [] }));
    try { fs.unlinkSync(pushStorageFile); } catch {}
    try { fs.unlinkSync(usedPairingFile); } catch {}

    process.env.BOT_TOKEN = 'BOT_TOKEN_PR162_SECRET';
    process.env.MAX_BOT_TOKEN = 'MAX_BOT_TOKEN_PR162_SECRET';
    process.env.PUSH_ADMIN_TOKEN = 'PUSH_ADMIN_TOKEN_PR162_SECRET';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'PUSH_SUBSCRIBE_TOKEN_PR162_SECRET';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR162';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR162';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR162';
    process.env.PUBLIC_BASE_URL = 'https://push.example.test';

    fs.writeFileSync(preloadFile, `
      const fs = require('fs');
      const sentFile = process.env.PR162_SENT_FILE;
      function readSent() { try { return JSON.parse(fs.readFileSync(sentFile, 'utf8')); } catch { return []; } }
      function writeSent(list) { fs.writeFileSync(sentFile, JSON.stringify(list, null, 2), 'utf8'); }
      global.fetch = async (url, options = {}) => {
        const raw = String(url);
        if (raw.startsWith('https://clck.ru/--')) return { ok: true, status: 200, async text() { return 'https://clck.ru/pr162-short'; }, async json() { return {}; } };
        if (raw.startsWith('https://platform-api.max.ru')) {
          let body = {};
          try { body = options.body ? JSON.parse(options.body) : {}; } catch {}
          if (raw.includes('/messages') && String(options.method || 'GET').toUpperCase() === 'POST') {
            const list = readSent();
            const parsedUrl = new URL(raw);
            list.push({ ...body, userId: parsedUrl.searchParams.get('user_id') || '', chatId: parsedUrl.searchParams.get('chat_id') || '' });
            writeSent(list);
            return { ok: true, status: 200, async json() { return { message: { id: 'sent-' + list.length } }; }, async text() { return '{}'; } };
          }
          return { ok: true, status: 200, async json() { return { ok: true, message: { id: 'mock-message' }, id: 'mock' }; }, async text() { return '{}'; } };
        }
        throw new Error('Unexpected child fetch: ' + raw);
      };
    `, 'utf8');
    fs.writeFileSync(sentFile, '[]', 'utf8');

    const diagnostics = fresh('../services/groupPushInboundDiagnostics');
    diagnostics.clear();
    const edgeDiagnostics = fresh('../services/maxWebhookEdgeDiagnostics');
    edgeDiagnostics.clear();
    const maxApi = fresh('../services/maxApi');
    const sentMessages = [];
    maxApi.sendMessage = async (message) => { sentMessages.push(message); return { message: { id: `direct-${sentMessages.length}` } }; };
    maxApi.editMessage = async () => ({ ok: true });
    maxApi.answerCallback = async () => ({ ok: true });
    maxApi.deleteMessage = async () => ({ ok: true });
    maxApi.getBotChatMember = async () => ({ ok: true, permissions: { is_admin: true } });
    maxApi.getChat = async ({ chatId }) => ({ id: chatId, title: `Title ${chatId}` });
    global.fetch = async (url, options = {}) => String(url).startsWith('https://clck.ru/--')
      ? { ok: true, status: 200, async text() { return 'https://clck.ru/direct-short'; } }
      : originalFetch(url, options);

    const bot = fresh('../bot');
    const storage = fresh('../services/webPushStorage');
    assert.strictEqual(typeof bot.handleGroupPushCommandUpdate, 'function', 'bot exports HTTP-edge group push helper');

    for (const text of ['/push', '/push@adminkit_bot', 'пуш', 'уведомления', 'Включить уведомления']) {
      const result = await bot.handleGroupPushCommandUpdate({ update: messageUpdate({ text, userId: `helper-${text}`, chatId: `helper-chat-${text}` }), config: { botToken: 'BOT_TOKEN_PR162_SECRET', appBaseUrl: 'https://push.example.test', botUsername: 'adminkit_bot' } });
      assert(result && result.edgePreRouted, `${text} is handled by the exported edge helper`);
    }
    assert.strictEqual(await bot.handleGroupPushCommandUpdate({ update: messageUpdate({ text: 'normal message' }), config: { botToken: 'BOT_TOKEN_PR162_SECRET', appBaseUrl: 'https://push.example.test' } }), null, 'normal message is not handled by edge helper');
    assert(bot.getGroupPushInboundDiagnostics().count > 0, 'groupPushInboundDiagnostics records helper pre-route activity');

    sentMessages.length = 0;
    const directRes = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: '/push', userId: 'direct-pr161-user', chatId: 'direct-pr161-chat' }) }, directRes, { botToken: 'BOT_TOKEN_PR162_SECRET', appBaseUrl: 'https://push.example.test', botUsername: 'adminkit_bot' });
    assert.strictEqual(directRes.statusCode, 200, 'existing PR161 bot route still returns 200 when called directly');
    assert.strictEqual(directRes.body && directRes.body.action, 'group_push_message_command', 'existing PR161 bot route still handles /push directly');

    const port = 19000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, ['index.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        WEBHOOK_PATH: '/webhook/max',
        ADMIN_TOKEN: 'ADMIN_TOKEN_PR162_SECRET',
        DEBUG_EXPORT_ALLOW_PUBLIC: '0',
        PR162_SENT_FILE: sentFile,
        NODE_OPTIONS: `--require ${preloadFile}`,
        DATABASE_URL: '', POSTGRES_URL: '', POSTGRES_URI: '', PG_URL: '', PGURI: '', NF_POSTGRES_URI: '', NF_POSTGRES_URL: '', DB_URL: '', DB_CONNECTION_STRING: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const logs = [];
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));
    try {
      await waitForServer(child, port);
      fs.writeFileSync(sentFile, '[]', 'utf8');

      const first = await postWebhook(port, messageUpdate({ text: '/push', userId: 'edge-first-user', chatId: 'edge-first-chat' }));
      assert.strictEqual(first.status, 200, 'index webhook returns 200 for /push edge pre-route');
      assert.strictEqual(first.body && first.body.edgePreRouted, true, 'index webhook response marks /push as edge pre-routed');
      const firstSent = readSent(sentFile);
      const firstPrivate = firstSent.find((message) => message.userId === 'edge-first-user' && String(message.text || '').includes('Откройте ссылку на iPhone'));
      const firstGroup = firstSent.find((message) => message.chatId === 'edge-first-chat');
      assert(firstPrivate && /https:\/\/clck\.ru\/pr162-short/.test(firstPrivate.text), 'first-time user gets private setup link');
      assert(!firstGroup, 'first-time group gets no public status reply on success');

      const inbound = await httpJson(port, '/debug/group-push-inbound.json?token=ADMIN_TOKEN_PR162_SECRET');
      assert.strictEqual(inbound.status, 200, 'group push inbound debug returns 200');
      assert(inbound.body.groupPushInboundDiagnostics.count > 0, 'groupPushInboundDiagnostics count is > 0 after edge pre-route');
      assert(inbound.body.groupPushInboundDiagnostics.latest.some((item) => item.routeDecision === 'entered_edge_pre_route'), 'diagnostics records entered_edge_pre_route');
      assert(inbound.body.groupPushInboundDiagnostics.latest.some((item) => item.routeResult === 'handled'), 'diagnostics records handled edge pre-route');

      const edge = await httpJson(port, '/debug/webhook-edge.json?token=ADMIN_TOKEN_PR162_SECRET');
      assert.strictEqual(edge.status, 200, 'webhook edge debug returns 200');
      assert(edge.body.maxWebhookEdgeDiagnostics.latest.some((item) => item.matchedPushCommand && item.botResultKind === 'response_sent_200_edge_group_push'), 'webhook-edge records response_sent_200_edge_group_push');

      const beforeNormal = readSent(sentFile).length;
      const normal = await postWebhook(port, messageUpdate({ text: 'Обычный пост Product Perfect', userId: 'edge-normal-user', chatId: 'edge-normal-chat', chatType: 'channel' }));
      assert.strictEqual(normal.status, 200, 'normal message still returns 200');
      assert.notStrictEqual(normal.body && normal.body.edgePreRouted, true, 'normal message is not edge pre-routed');
      const normalEdge = await httpJson(port, '/debug/webhook-edge.json?token=ADMIN_TOKEN_PR162_SECRET');
      assert(normalEdge.body.maxWebhookEdgeDiagnostics.latest.some((item) => item.textPreview === 'Обычный пост Product Perfect' && item.botResultKind !== 'response_sent_200_edge_group_push'), 'normal message continues to botModule.handleWebhook');
      assert(readSent(sentFile).length >= beforeNormal, 'normal Product Perfect path is not blocked by edge pre-route');

      await storage.savePairedDevice(validSubscription('active-edge'), { maxUserId: 'active-edge-user', chatId: 'old-edge-chat', status: 'active' });
      fs.writeFileSync(sentFile, '[]', 'utf8');
      const active = await postWebhook(port, messageUpdate({ text: '/push', userId: 'active-edge-user', chatId: 'active-edge-chat', title: 'Active Edge Chat' }));
      assert.strictEqual(active.status, 200, 'active user /push returns 200');
      assert.strictEqual(await storage.isChatBoundForUser('active-edge-user', 'active-edge-chat'), false, 'edge /push waits for confirmed device pairing');
      let activeSent = readSent(sentFile);
      assert(activeSent.some((message) => message.userId === 'active-edge-user'), 'active user gets private setup link for another device');
      assert(!activeSent.some((message) => message.chatId === 'active-edge-chat'), 'active user gets no group success text');

      fs.writeFileSync(sentFile, '[]', 'utf8');
      const repeated = await postWebhook(port, messageUpdate({ text: '/push', userId: 'active-edge-user', chatId: 'active-edge-chat', title: 'Active Edge Chat' }));
      assert.strictEqual(repeated.status, 200, 'repeated active user /push returns 200');
      assert.strictEqual((await storage.listChatBindingsForUser('active-edge-user')).filter((binding) => binding.chatId === 'active-edge-chat').length, 0, 'repeated /push still waits for confirmed pairing');
      assert(readSent(sentFile).some((message) => message.userId === 'active-edge-user' && /https?:\/\/clck\.ru\//i.test(String(message.text || ''))), 'repeated /push sends another private personal link');
      assert(!readSent(sentFile).some((message) => message.chatId === 'active-edge-chat'), 'repeated /push posts no public group link/status');

      for (const command of ['/push@adminkit_bot', 'пуш', 'уведомления', 'Включить уведомления']) {
        const res = await postWebhook(port, messageUpdate({ text: command, userId: `edge-${command}`, chatId: `edge-chat-${command}` }));
        assert.strictEqual(res.status, 200, `${command} returns 200 through index webhook`);
        assert.strictEqual(res.body && res.body.edgePreRouted, true, `${command} is pre-routed by index webhook`);
      }
    } finally {
      child.kill('SIGTERM');
    }

    console.log('PR162 group push edge pre-route tests passed');
  } finally {
    global.fetch = originalFetch;
    if (originalMaxApi) require.cache[require.resolve('../services/maxApi')] = originalMaxApi;
    else delete require.cache[require.resolve('../services/maxApi')];
    restore(storeFile, originalStore);
    restore(pushStorageFile, originalPushStorage);
    restore(usedPairingFile, originalUsedPairing);
    restoreEnv();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
