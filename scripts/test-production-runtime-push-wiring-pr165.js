'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function responseCollector() { return { statusCode: 0, body: null, headersSent: false, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.headersSent = true; return this; } }; }
function validSubscription(suffix) { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function messageUpdate({ text = 'Тест PR165', id = 'msg-pr165' } = {}) {
  return { update_type: 'message_created', message: { mid: id, text, sender: { user_id: 'sender-pr165', name: 'PR165' }, recipient: { chat_id: 'chat-pr165', chat_type: 'chat', title: 'PR165 Chat' } } };
}

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    try { fs.unlinkSync(storageFile); } catch {}
    try { fs.unlinkSync(usedFile); } catch {}
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR165_MUST_NOT_LEAK';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR165';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR165_MUST_NOT_LEAK';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr165@example.test';

    const maxApi = fresh('../services/maxApi');
    const sentMessages = [];
    maxApi.sendMessage = async (message) => { sentMessages.push(message); return { message: { id: `sent-${sentMessages.length}` } }; };
    maxApi.editMessage = async () => ({ ok: true });
    maxApi.answerCallback = async () => ({ ok: true });
    maxApi.deleteMessage = async () => ({ ok: true });
    maxApi.getBotChatMember = async () => ({ ok: true, permissions: { is_admin: true } });
    maxApi.getChat = async ({ chatId }) => ({ id: chatId, title: `Title ${chatId}` });

    const diagnostics = fresh('../services/pushDispatchDiagnostics');
    diagnostics.clear();
    const storage = fresh('../services/webPushStorage');
    const active = await storage.savePairedDevice(validSubscription('active'), { maxUserId: 'user-pr165', chatId: 'chat-pr165', status: 'active' });
    await storage.savePairedDevice(validSubscription('pending'), { maxUserId: 'pending-pr165', chatId: 'chat-pr165', status: 'pending' });
    await storage.savePairedDevice(validSubscription('unbound'), { maxUserId: 'unbound-pr165', chatId: 'other-chat-pr165', status: 'active' });
    await storage.upsertChatBindingForDevice({ maxUserId: 'user-pr165', chatId: 'chat-pr165', deviceId: active.deviceId, endpointHash: active.endpointHash });

    const entrypoint = fresh('../clean-entrypoint-1.53.10-pr89.js');
    entrypoint.applyEnv();
    const install = entrypoint.installCleanBot();
    assert.strictEqual(install.pr165LiveChatPushRuntime, true, 'active entrypoint installs PR165 live push wrapper');
    assert(entrypoint.RUNTIME.includes('PR172'), 'active entrypoint advances to PR172 while preserving PR165 runtime wiring');

    const bot = require('../bot');
    assert.strictEqual(bot.pr165LiveChatPushRuntime, true, 'production bot export is wrapped by PR165 runtime');
    const delivered = [];
    const webPushClient = { sendNotification: async (subscription, payload) => { delivered.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; } };

    const normalRes = responseCollector();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: 'тест push после PR165', id: 'normal-pr165' }) }, normalRes, { botToken: 'BOT_TOKEN_PR165_MUST_NOT_LEAK', appBaseUrl: 'https://push.example.test', botUsername: 'adminkit_bot', webPushClient });
    assert.strictEqual(normalRes.statusCode, 200, 'normal message is accepted through active production bot wrapper');
    assert.deepStrictEqual(delivered.map((item) => item.endpoint), ['https://push.example.test/send/active'], 'active production wrapper dispatches only active bound devices');

    const beforeCommand = delivered.length;
    const commandRes = responseCollector();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ text: '/push', id: 'push-command-pr165' }) }, commandRes, { botToken: 'BOT_TOKEN_PR165_MUST_NOT_LEAK', appBaseUrl: 'https://push.example.test', botUsername: 'adminkit_bot', webPushClient });
    assert.strictEqual(commandRes.statusCode, 200, '/push command is accepted through active production bot wrapper');
    assert.strictEqual(delivered.length, beforeCommand, '/push command is not dispatched as a web push');

    const summary = diagnostics.summary(10);
    assert(summary.latest.some((item) => item.source === 'live_chat_push' && item.success === 1 && item.totalDevices === 1), 'normal message records live_chat_push dispatch diagnostics');
    assert(summary.latest.some((item) => item.source === 'live_chat_push' && item.skippedReason === 'push_command'), '/push records sanitized skipped command diagnostics');
    const serialized = JSON.stringify(summary);
    assert(!/PAIRING_SECRET|PRIVATE_KEY|BOT_TOKEN|p256dh-|auth-|https:\/\/push\.example\.test\/send\//.test(serialized), 'PR165 active runtime diagnostics stay sanitized');

    console.log('production runtime push wiring pr165 ok');
  } finally {
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
    delete process.env.PUSH_PAIRING_SECRET;
    delete process.env.WEB_PUSH_PUBLIC_KEY;
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    delete process.env.WEB_PUSH_SUBJECT;
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
