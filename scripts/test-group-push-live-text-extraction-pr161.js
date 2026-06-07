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
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;

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
function baseMessage({ userId, chatId, textIn = 'body', text = '/push' }) {
  const message = {
    id: `live-${textIn}-${Date.now()}-${Math.random()}`,
    sender: { user_id: userId, first_name: 'Live' },
    recipient: { chat_id: chatId, chat_type: 'channel', title: `Live ${chatId}` }
  };
  if (textIn === 'message.text') message.text = text;
  else if (textIn === 'message.body.text') message.body = { text, seq: `${chatId}-post` };
  else message.body = { seq: `${chatId}-post` };
  return message;
}
function updateFor(shape, text = '/push') {
  if (shape === 'message.text') {
    return { update_type: 'message_created', message: baseMessage({ userId: 'live-message-text-user', chatId: 'live-message-text-chat', textIn: shape, text }) };
  }
  if (shape === 'message.body.text') {
    return { update_type: 'message_created', message: baseMessage({ userId: 'live-body-text-user', chatId: 'live-body-text-chat', textIn: shape, text }) };
  }
  if (shape === 'data.message.body.text') {
    return { update_type: 'message_created', data: { message: baseMessage({ userId: 'live-data-body-user', chatId: 'live-data-body-chat', textIn: 'message.body.text', text }) } };
  }
  throw new Error(`unknown shape ${shape}`);
}
async function webhook(bot, update, sentMessages) {
  const res = responseStub();
  await bot.handleWebhook({ get: () => '', body: update }, res, { botToken: 'BOT_TOKEN_PR161_SECRET', appBaseUrl: 'https://push.example.test', botUsername: 'adminkit_bot' });
  assert.strictEqual(res.statusCode, 200, `${JSON.stringify(update).slice(0, 120)} returns 200`);
  assert(!JSON.stringify(res.body || {}).includes('PAIRING_SECRET_PR161_SECRET'), 'webhook response does not expose pairing secret');
  assert(!JSON.stringify(sentMessages || []).includes('PAIRING_SECRET_PR161_SECRET'), 'sent messages do not expose pairing secret');
  return res.body;
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
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR161_SECRET';
    process.env.MAX_BOT_TOKEN = 'MAX_BOT_TOKEN_PR161_SECRET';
    process.env.PUSH_ADMIN_TOKEN = 'PUSH_ADMIN_TOKEN_PR161_SECRET';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'PUSH_SUBSCRIBE_TOKEN_PR161_SECRET';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR161_SECRET';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR161';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR161';
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
      if (String(url).startsWith('https://clck.ru/--')) return { ok: true, status: 200, async text() { return 'https://clck.ru/pr161-short'; } };
      return originalFetch(url, options);
    };

    const diagnostics = fresh('../services/groupPushInboundDiagnostics');
    diagnostics.clear();
    const edgeDiagnostics = fresh('../services/maxWebhookEdgeDiagnostics');
    edgeDiagnostics.clear();
    const store = fresh('../store');
    const bot = fresh('../bot');

    for (const shape of ['message.text', 'message.body.text', 'data.message.body.text']) {
      const beforePosts = store.getPostsList().length;
      const body = await webhook(bot, updateFor(shape, '/push'), sentMessages);
      assert.strictEqual(body.action, 'group_push_message_command', `${shape} /push routes to group push onboarding`);
      assert.strictEqual(store.getPostsList().length, beforePosts, `${shape} /push routes before Product Perfect post flow`);
      const latest = bot.getGroupPushInboundDiagnostics().latest.slice(-1)[0];
      assert(latest, `${shape} records group push inbound diagnostics`);
      assert.strictEqual(latest.textPreview, '/push', `${shape} diagnostic records live-safe /push text`);
      assert.strictEqual(latest.matchedPushCommand, true, `${shape} diagnostic marks /push as matched`);
      assert.strictEqual(latest.routeCandidate, 'group_push_command', `${shape} diagnostic records route candidate`);
      assert.strictEqual(latest.routeDecision, 'group_push_route', `${shape} diagnostic records route decision`);
      assert.strictEqual(latest.routeResult, 'handled', `${shape} diagnostic records handled result`);

      edgeDiagnostics.record({ body: updateFor(shape, '/push'), handedToBot: true, botResultKind: 'response_sent_200' });
      const edgeLatest = edgeDiagnostics.summary().latest.slice(-1)[0];
      assert.strictEqual(edgeLatest.textPreview, '/push', `${shape} webhook-edge diagnostic extracts the same /push text`);
      assert.strictEqual(edgeLatest.matchedPushCommand, true, `${shape} webhook-edge diagnostic matches /push command`);
    }

    const normalMessageTextBody = await webhook(bot, updateFor('message.text', 'Обычный текст'), sentMessages);
    assert.notStrictEqual(normalMessageTextBody.action, 'group_push_message_command', 'normal message.text is not routed as group push command');

    const beforeNormalPosts = store.getPostsList().length;
    const normalBodyTextBody = await webhook(bot, updateFor('message.body.text', 'Обычный пост Product Perfect'), sentMessages);
    assert.notStrictEqual(normalBodyTextBody.action, 'group_push_message_command', 'normal message.body.text is not routed as group push command');
    assert(store.getPostsList().length > beforeNormalPosts, 'normal message.body.text continues through Product Perfect post flow');

    await webhook(bot, updateFor('message.text', '/push-not-a-command'), sentMessages);
    const mismatch = bot.getGroupPushInboundDiagnostics().latest.find((item) => item.textPreview === '/push-not-a-command' && item.routeDecision === 'command_text_not_matched');
    assert(mismatch, '/push-like non-command records text mismatch diagnostic');
    assert.strictEqual(mismatch.routeCandidate, 'group_push_command', '/push-like non-command records route candidate');
    assert.strictEqual(mismatch.routeResult, 'skipped', '/push-like non-command is skipped safely');

    assert(sentMessages.some((message) => message.userId && String(message.text || '').includes('Откройте ссылку на iPhone')), 'first-time user receives private setup link only in DM');
    assert(!sentMessages.some((message) => message.chatId && /\/push\/join\?t=/i.test(String(message.text || ''))), 'public group replies do not include personal join links');

    console.log('PR161 group push live text extraction tests passed');
  } finally {
    global.fetch = originalFetch;
    if (originalMaxApi) require.cache[require.resolve('../services/maxApi')] = originalMaxApi;
    else delete require.cache[require.resolve('../services/maxApi')];
    restore(storeFile, originalStore);
    restore(pushStorageFile, originalPushStorage);
    restore(usedPairingFile, originalUsedPairing);
    restoreEnv();
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
