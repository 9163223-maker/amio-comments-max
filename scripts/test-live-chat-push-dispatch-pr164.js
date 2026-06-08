'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const dispatch = require('../services/pushDispatchService');
const pushDispatchDiagnostics = require('../services/pushDispatchDiagnostics');
const edgeDiagnostics = fs.readFileSync(path.join(repoRoot, 'services', 'maxWebhookEdgeDiagnostics.js'), 'utf8');
const inboundDiagnostics = fs.readFileSync(path.join(repoRoot, 'services', 'groupPushInboundDiagnostics.js'), 'utf8');

function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function validSubscription(suffix) { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function responseCollector() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function messageUpdate({ text = 'Новое сообщение', chatId = 'chat-pr164', userId = 'sender-pr164', name = 'Анна', id = 'msg-pr164' } = {}) {
  return {
    update_type: 'message_created',
    message: {
      mid: id,
      text,
      sender: { user_id: userId, name },
      recipient: { chat_id: chatId, chat_type: 'chat', title: 'PR164 Chat' }
    }
  };
}
async function webhook(bot, update, webPushClient) {
  const res = responseCollector();
  await bot.handleWebhook({ get: () => '', body: update }, res, { botToken: 'BOT_TOKEN_PR164_SECRET', appBaseUrl: 'https://push.example.test', botUsername: 'adminkit_bot', webPushClient });
  return res;
}
function assertNoDiagnosticLeak(extra = []) {
  assert(edgeDiagnostics.includes('/push/join?t=[redacted]') && inboundDiagnostics.includes('/push/join?t=[redacted]'), 'diagnostics redact join URLs');
  for (const source of [edgeDiagnostics, inboundDiagnostics]) {
    assert(!/p256dh-[a-z0-9-]+|auth-[a-z0-9-]+|https:\/\/push\.example\.test\/send\//i.test(source), 'diagnostic source does not contain fixture endpoint/auth/p256dh values');
  }
  for (const source of extra.map((item) => JSON.stringify(item))) {
    assert(!/p256dh-[a-z0-9-]+|auth-[a-z0-9-]+|https:\/\/push\.example\.test\/send\//i.test(source), 'push dispatch diagnostics do not contain fixture endpoint/auth/p256dh values');
    assert(!/PAIRING_SECRET|PRIVATE_KEY|BOT_TOKEN|MAX_BOT_TOKEN|\/push\/join\?t=[A-Za-z0-9_.~-]+|clck\.ru\//i.test(source), 'push dispatch diagnostics do not contain tokens, secrets, personal links, or short links');
  }
}

function assertSafePushDispatchDiagnosticShape(summary) {
  const allowed = new Set(['source', 'chatIdLast4', 'channelIdLast4', 'messageIdLast4', 'totalDevices', 'activeDeviceCount', 'success', 'failed', 'skippedReason', 'errorCode', 'titlePreview', 'bodyPreview', 'timestamp']);
  assert(summary && Array.isArray(summary.latest), 'push dispatch diagnostics summary has latest array');
  for (const item of summary.latest) {
    for (const key of Object.keys(item)) assert(allowed.has(key), `unexpected push dispatch diagnostic field: ${key}`);
  }
}

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    resetStores();
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_LIVE_PR164_MUST_NOT_LEAK';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_LIVE_PR164';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_LIVE_PR164_MUST_NOT_LEAK';
    process.env.WEB_PUSH_SUBJECT = 'mailto:live-pr164@example.test';
    process.env.BOT_TOKEN = 'BOT_TOKEN_LIVE_PR164_MUST_NOT_LEAK';

    assert(pushDispatchDiagnostics && typeof pushDispatchDiagnostics.record === 'function', 'pushDispatchDiagnostics service exists');
    assert.strictEqual(typeof pushDispatchDiagnostics.summary, 'function', 'pushDispatchDiagnostics exposes summary');
    assert.strictEqual(typeof pushDispatchDiagnostics.clear, 'function', 'pushDispatchDiagnostics exposes clear');
    pushDispatchDiagnostics.clear();

    const maxApi = fresh('../services/maxApi');
    const sentMessages = [];
    maxApi.sendMessage = async (message) => { sentMessages.push(message); return { message: { id: `sent-${sentMessages.length}` } }; };
    maxApi.editMessage = async () => ({ ok: true });
    maxApi.answerCallback = async () => ({ ok: true });
    maxApi.deleteMessage = async () => ({ ok: true });
    maxApi.getBotChatMember = async () => ({ ok: true, permissions: { is_admin: true } });
    maxApi.getChat = async ({ chatId }) => ({ id: chatId, title: `Title ${chatId}` });
    const bot = fresh('../bot');
    const storage = fresh('../services/webPushStorage');
    const active = await storage.savePairedDevice(validSubscription('active'), { maxUserId: 'user-active-pr164', chatId: 'chat-pr164', status: 'active' });
    const pending = await storage.savePairedDevice(validSubscription('pending'), { maxUserId: 'user-pending-pr164', chatId: 'chat-pr164', status: 'pending' });
    await storage.savePairedDevice(validSubscription('unbound'), { maxUserId: 'user-unbound-pr164', chatId: 'other-chat-pr164', status: 'active' });
    await storage.upsertChatBindingForDevice({ maxUserId: 'user-active-pr164', chatId: 'chat-pr164', deviceId: active.deviceId, endpointHash: active.endpointHash });

    const directSent = [];
    const directResult = await dispatch.sendPushToChat({
      chatId: 'chat-pr164',
      payload: { source: 'max_group', chatId: 'chat-pr164', chatTitle: 'PR164 Chat', senderName: 'Анна', messageText: 'Привет из MAX', messageId: 'direct-msg-pr164' },
      webPushClient: { sendNotification: async (subscription, payload) => { directSent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; } }
    });
    assert.strictEqual(directResult.total, 1, 'direct chat dispatch targets only paired active bound devices');
    assert.deepStrictEqual(directSent.map((item) => item.endpoint), ['https://push.example.test/send/active'], 'pending and unbound devices are excluded from direct dispatch');
    assert.strictEqual(directSent[0].payload.data.source, 'max_group', 'live chat payload keeps MAX group source');

    const botSent = [];
    const botClient = { sendNotification: async (subscription, payload) => { botSent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; } };
    const normalResponse = await webhook(bot, messageUpdate({ text: 'Обычное сообщение MAX', id: 'bot-normal-pr164' }), botClient);
    assert.strictEqual(normalResponse.statusCode, 200, 'normal MAX chat webhook is accepted');
    assert(botSent.some((item) => item.endpoint === 'https://push.example.test/send/active'), 'normal live MAX chat message dispatches push to paired active device');
    assert(!botSent.some((item) => item.endpoint === 'https://push.example.test/send/pending'), 'normal live MAX chat message excludes pending device');
    assert(!botSent.some((item) => item.endpoint === 'https://push.example.test/send/unbound'), 'normal live MAX chat message excludes unbound device');

    const beforePushCommand = botSent.length;
    const pushResponse = await webhook(bot, messageUpdate({ text: '/push', id: 'bot-push-command-pr164' }), botClient);
    assert.strictEqual(pushResponse.statusCode, 200, '/push command webhook is accepted');
    assert.strictEqual(pushResponse.body.action, 'group_push_message_command', '/push command routes to onboarding');
    assert.strictEqual(botSent.length, beforePushCommand, '/push command messages do not trigger chat push notifications');

    const noDeviceResponse = await webhook(bot, messageUpdate({ text: 'Сообщение без подписчиков', chatId: 'empty-chat-pr164', id: 'bot-empty-pr164' }), botClient);
    assert.strictEqual(noDeviceResponse.statusCode, 200, 'no-device chat webhook is accepted');

    const pushDispatchSummary = pushDispatchDiagnostics.summary(10);
    assertSafePushDispatchDiagnosticShape(pushDispatchSummary);
    assert(pushDispatchSummary.latest.some((item) => item.source === 'live_chat_push' && item.success === 1 && item.failed === 0 && item.totalDevices === 1), 'diagnostics record normal live chat dispatch success safely');
    assert(pushDispatchSummary.latest.some((item) => item.source === 'live_chat_push' && item.skippedReason === 'push_command'), 'diagnostics record skipped /push command safely');
    assert(pushDispatchSummary.latest.some((item) => item.source === 'live_chat_push' && item.skippedReason === 'no_bound_devices' && item.totalDevices === 0), 'diagnostics record no-bound-device dispatch safely');

    assertNoDiagnosticLeak([pushDispatchSummary]);
    assert(!JSON.stringify(directResult).includes('p256dh-active') && !JSON.stringify(directResult).includes('auth-active'), 'dispatch result does not leak subscription keys');
    assert(!JSON.stringify(pending).includes('PAIRING_SECRET_LIVE_PR164'), 'storage public save result does not leak secrets');

    console.log('live chat push dispatch pr164 ok');
  } finally {
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
    delete process.env.PUSH_PAIRING_SECRET;
    delete process.env.WEB_PUSH_PUBLIC_KEY;
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    delete process.env.WEB_PUSH_SUBJECT;
    delete process.env.BOT_TOKEN;
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
