'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_PAIRING_SECRET', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];

function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function validSubscription(suffix) { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const base = `http://127.0.0.1:${server.address().port}`; const res = await fetch(base + target, options); const text = await res.text(); let body = null; try { body = text ? JSON.parse(text) : null; } catch {} return { status: res.status, headers: res.headers, text, body }; }
function assertNoLeaks(value, forbidden, label) { const text = typeof value === 'string' ? value : JSON.stringify(value); for (const item of forbidden.filter(Boolean)) assert(!text.includes(item), `${label} leaked ${item}`); }

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  const originalSendMessage = fresh('../services/maxApi').sendMessage;
  const originalAnswerCallback = fresh('../services/maxApi').answerCallback;
  try {
    cleanEnv();
    resetStores();
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_MUST_NOT_LEAK_PR145';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_PR145';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_VAPID_KEY_MUST_NOT_LEAK_PR145';
    process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_MUST_NOT_LEAK_PR145';
    process.env.BOT_TOKEN = 'BOT_TOKEN_MUST_NOT_LEAK_PR145';

    const maxApi = fresh('../services/maxApi');
    const sentMessages = [];
    const callbackAnswers = [];
    maxApi.sendMessage = async (message) => { sentMessages.push(message); return { message: { id: `prompt-${sentMessages.length}` } }; };
    maxApi.answerCallback = async (answer) => { callbackAnswers.push(answer); return { success: true }; };

    const pairing = fresh('../services/pushPairingService');
    const storage = fresh('../services/webPushStorage');
    const dispatch = fresh('../services/pushDispatchService');
    const confirmation = fresh('../services/pushConfirmationService');

    const pending = await storage.savePairedDevice(validSubscription('same-user'), { maxUserId: 'max-user-a', chatId: 'chat-x', channelId: 'channel-x', status: 'pending' });
    const wrong = await confirmation.handleCallback({ callbackId: 'cb-wrong', confirmingUserId: 'max-user-b', payload: { action: confirmation.ACTION, d: pending.deviceId }, botToken: process.env.BOT_TOKEN });
    assert.strictEqual(wrong.ok, false, 'different maxUserId cannot activate pending device');
    assert.strictEqual((await storage.findDeviceByDeviceId(pending.deviceId)).status, 'pending', 'different user leaves device pending');
    const same = await confirmation.handleCallback({ callbackId: 'cb-same', confirmingUserId: 'max-user-a', payload: { action: confirmation.ACTION, d: pending.deviceId }, botToken: process.env.BOT_TOKEN });
    assert.strictEqual(same.ok, true, 'same maxUserId confirms pending device');
    const activeDevice = await storage.findDeviceByDeviceId(pending.deviceId);
    assert.strictEqual(activeDevice.status, 'active', 'confirmed device becomes active');
    assert(activeDevice.confirmedAt, 'confirmedAt is stored');
    const already = await confirmation.handleCallback({ callbackId: 'cb-active', confirmingUserId: 'max-user-a', payload: { action: confirmation.ACTION, d: pending.deviceId }, botToken: process.env.BOT_TOKEN });
    assert.strictEqual(already.ok, true, 'already active confirmation is idempotent');
    assert.strictEqual(already.alreadyActive, true, 'already active response is explicit');
    const missing = await confirmation.handleCallback({ callbackId: 'cb-missing', confirmingUserId: 'max-user-a', payload: { action: confirmation.ACTION, d: 'missing-device' }, botToken: process.env.BOT_TOKEN });
    assert.strictEqual(missing.ok, false, 'missing device fails safely');
    assert.strictEqual(missing.status, 'missing', 'missing device safe status');
    const revoked = await storage.savePairedDevice(validSubscription('revoked-confirm'), { maxUserId: 'max-user-a', chatId: 'chat-x', status: 'revoked' });
    const disabled = await storage.savePairedDevice(validSubscription('disabled-confirm'), { maxUserId: 'max-user-a', chatId: 'chat-x', status: 'disabled' });
    assert.strictEqual((await confirmation.confirmDeviceForUser({ deviceId: revoked.deviceId, confirmingUserId: 'max-user-a' })).ok, false, 'revoked device cannot activate');
    assert.strictEqual((await confirmation.confirmDeviceForUser({ deviceId: disabled.deviceId, confirmingUserId: 'max-user-a' })).ok, false, 'disabled device cannot activate');
    assertNoLeaks(callbackAnswers.map((item) => item.notification), ['https://push.example.test/send/same-user', 'p256dh-same-user', 'auth-same-user', process.env.PUSH_PAIRING_SECRET, process.env.BOT_TOKEN, 'chat-x', 'channel-x'], 'callback UI');

    resetStores();
    await withServer(async (server) => {
      const token = pairing.createPairingToken({ maxUserId: 'bound-user', chatId: 'bound-chat', channelId: 'bound-channel', issuedByAdminId: 'admin', ttlMinutes: 30 });
      const pair = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: token, subscription: validSubscription('pair-flow') }) });
      assert.strictEqual(pair.status, 200, '/api/push/pair succeeds with valid pairing token');
      assert.strictEqual(pair.body.status, 'pending', 'pairing saves pending device');
      assert.strictEqual(pair.body.confirmationRequired, true, 'pair response requires confirmation');
      assert.strictEqual(pair.body.confirmationSent, true, 'confirmation prompt is sent when MAX send helper is configured');
      assert.strictEqual(pair.body.confirmationDispatch, 'sent', 'confirmation dispatch is honest');
      assertNoLeaks(pair.body, ['bound-user', 'bound-chat', 'bound-channel', 'https://push.example.test/send/pair-flow', 'p256dh-pair-flow', 'auth-pair-flow', process.env.PUSH_PAIRING_SECRET, process.env.WEB_PUSH_PRIVATE_KEY, process.env.BOT_TOKEN], 'pair response');
      assert.strictEqual(sentMessages.length, 1, 'one confirmation prompt sent');
      assert.strictEqual(sentMessages[0].userId, 'bound-user', 'prompt is sent only to bound maxUserId');
      assert.strictEqual(sentMessages[0].text, confirmation.PROMPT_TEXT, 'prompt text matches production copy');
      assert(JSON.stringify(sentMessages[0].attachments).includes(confirmation.ACTION), 'prompt button contains confirmation callback');
      assert(JSON.stringify(sentMessages[0].attachments).includes('✅ Подтвердить устройство'), 'prompt button label matches production copy');
      assertNoLeaks(sentMessages[0], ['bound-chat', 'bound-channel', 'https://push.example.test/send/pair-flow', 'p256dh-pair-flow', 'auth-pair-flow', process.env.PUSH_PAIRING_SECRET], 'confirmation prompt');

      const before = await dispatch.sendPushToUser({ maxUserId: 'bound-user', chatId: 'bound-chat', webPushClient: { sendNotification: async () => ({ statusCode: 201 }) } });
      assert.strictEqual(before.total, 0, 'pending paired device is excluded before confirmation');
      const stored = JSON.parse(fs.readFileSync(storageFile, 'utf8')).subscriptions[0];
      const confirmed = await confirmation.confirmDeviceForUser({ deviceId: stored.deviceId, confirmingUserId: 'bound-user' });
      assert.strictEqual(confirmed.ok, true, 'valid confirmation activates paired device');
      const sent = [];
      const after = await dispatch.sendPushToUser({ maxUserId: 'bound-user', chatId: 'bound-chat', payload: { body: 'private body bound-user bound-chat' }, webPushClient: { sendNotification: async (subscription, payload) => { sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; } } });
      assert.strictEqual(after.total, 1, 'active paired device is targeted after confirmation');
      assert.strictEqual(sent[0].endpoint, 'https://push.example.test/send/pair-flow', 'only confirmed device receives targeted push');
      assertNoLeaks(sent[0].payload, ['bound-user', 'bound-chat', 'private body'], 'targeted payload');
    });

    resetStores();
    await storage.savePairedDevice(validSubscription('user-a-chat-x'), { maxUserId: 'user-a', chatId: 'chat-x', status: 'active' });
    await storage.savePairedDevice(validSubscription('user-b-chat-x'), { maxUserId: 'user-b', chatId: 'chat-x', status: 'active' });
    await storage.savePairedDevice(validSubscription('user-a-chat-y'), { maxUserId: 'user-a', chatId: 'chat-y', status: 'active' });
    await storage.savePairedDevice(validSubscription('user-a-pending'), { maxUserId: 'user-a', chatId: 'chat-x', status: 'pending' });
    const targetedEndpoints = [];
    const targeted = await dispatch.sendPushToUser({ maxUserId: 'user-a', chatId: 'chat-x', webPushClient: { sendNotification: async (subscription) => { targetedEndpoints.push(subscription.endpoint); return { statusCode: 201 }; } } });
    assert.strictEqual(targeted.total, 1, 'targeted dispatch keeps exact maxUserId + chatId match');
    assert.deepStrictEqual(targetedEndpoints, ['https://push.example.test/send/user-a-chat-x'], 'user B, chat Y, and pending devices do not receive targeted send');

    resetStores();
    maxApi.sendMessage = async () => { throw new Error('dm_not_available'); };
    await withServer(async (server) => {
      const token = pairing.createPairingToken({ maxUserId: 'no-dm-user', chatId: 'no-dm-chat', ttlMinutes: 30 });
      const pair = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: token, subscription: validSubscription('no-dm') }) });
      assert.strictEqual(pair.status, 200, 'pairing still succeeds when DM send fails');
      assert.strictEqual(pair.body.status, 'pending', 'device remains pending when confirmation prompt send fails');
      assert.strictEqual(pair.body.confirmationSent, false, 'failed prompt does not fake success');
      assert.strictEqual(pair.body.confirmationDispatch, 'failed', 'failed prompt reports honest limitation marker');
    });
    maxApi.sendMessage = async (message) => { sentMessages.push(message); return { message: { id: 'prompt-restored' } }; };

    await withServer(async (server) => {
      const inviteNoToken = await request(server, '/internal/push/invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.strictEqual(inviteNoToken.status, 403, 'invite requires PUSH_ADMIN_TOKEN');
      const inviteQueryToken = await request(server, '/internal/push/invite?token=ADMIN_TOKEN_MUST_NOT_LEAK_PR145', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.strictEqual(inviteQueryToken.status, 403, 'admin token via query string is rejected');
      const invite = await request(server, '/internal/push/invite', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ADMIN_TOKEN_MUST_NOT_LEAK_PR145' }, body: JSON.stringify({ maxUserId: 'invite-user', chatId: 'invite-chat', channelId: 'invite-channel', ttlMinutes: 15 }) });
      assert.strictEqual(invite.status, 200, 'invite endpoint works');
      assert.strictEqual(invite.body.ok, true, 'invite ok');
      assert(invite.body.joinUrl.includes('/push/join?t='), 'invite returns valid join URL');
      assert(invite.body.expiresAt, 'invite returns expiresAt');
      assert(invite.body.tokenId, 'invite returns tokenId/nonce hash');
      assertNoLeaks(invite.body, [process.env.PUSH_PAIRING_SECRET, 'ADMIN_TOKEN_MUST_NOT_LEAK_PR145', 'BOT_TOKEN_MUST_NOT_LEAK_PR145'], 'invite response');
    });

    await withServer(async (server) => {
      const manifest = await request(server, '/push/manifest.json');
      assert.strictEqual(manifest.body.id, '/push', 'manifest id remains /push');
      assert.strictEqual(manifest.body.start_url, '/push', 'manifest start_url remains /push');
      assert.strictEqual(manifest.body.scope, '/push/', 'manifest scope remains isolated');
      assert.strictEqual(manifest.body.display, 'standalone', 'manifest display remains standalone');
      const sw = await request(server, '/push/sw.js');
      assert.strictEqual(sw.status, 200, '/push/sw.js remains isolated');
      assert.strictEqual(sw.headers.get('service-worker-allowed'), null, 'no Service-Worker-Allowed: /');
      assert(!sw.text.includes('silent:true') && !sw.text.includes('silent: true'), 'no silent:true');
      assert.strictEqual((await request(server, '/sw.js')).status, 404, 'no root /sw.js');
      assert.strictEqual((await request(server, '/manifest.json')).status, 404, 'no root /manifest.json');
      const httpsToken = pairing.createPairingToken({ maxUserId: 'https-user', chatId: 'https-chat', ttlMinutes: 30 });
      const httpsJoin = await request(server, `/push/join?t=${encodeURIComponent(httpsToken)}`, { headers: { 'x-forwarded-proto': 'https' } });
      assert(httpsJoin.headers.get('set-cookie').includes('Path=/api/push/pair'), 'pairing cookie remains scoped to /api/push/pair');
      assert(httpsJoin.headers.get('set-cookie').includes('Secure'), 'Secure works for x-forwarded-proto:https');
      const status = await request(server, '/api/push/status');
      assertNoLeaks(status.body, ['https://push.example.test/send/', 'p256dh-', 'auth-', process.env.PUSH_PAIRING_SECRET, process.env.WEB_PUSH_PRIVATE_KEY], 'public status');
    });

    console.log('targeted pwa push confirmation pr145 ok');
  } finally {
    const maxApi = require('../services/maxApi');
    maxApi.sendMessage = originalSendMessage;
    maxApi.answerCallback = originalAnswerCallback;
    cleanEnv();
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
