'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');

const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }

function validSubscription(suffix = 'a') {
  return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } };
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  fresh('../web-push-routes').install(app);
  return app;
}
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) {
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(base + target, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, headers: res.headers, text, body };
}
function signPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.PUSH_PAIRING_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}
function decodePayload(token) { return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')); }

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    cleanEnv();
    resetStores();
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_MUST_NOT_LEAK_PR144';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_PR144';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_VAPID_KEY_MUST_NOT_LEAK_PR144';
    process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_MUST_NOT_LEAK_PR144';

    const pairing = fresh('../services/pushPairingService');
    const storage = fresh('../services/webPushStorage');
    const dispatch = fresh('../services/pushDispatchService');

    const token = pairing.createPairingToken({ maxUserId: 'max-user-1', chatId: 'chat-1', channelId: 'channel-1', issuedByAdminId: 'admin-1', ttlMinutes: 30 });
    const verified = pairing.verifyPairingToken(token);
    assert.strictEqual(verified.maxUserId, 'max-user-1', 'valid token verifies maxUserId');
    assert.strictEqual(verified.chatId, 'chat-1', 'valid token verifies chatId');
    assert(!token.includes(process.env.PUSH_PAIRING_SECRET), 'token does not expose raw secret');
    assert.throws(() => pairing.verifyPairingToken(`${token.slice(0, -2)}xx`), /invalid_push_pairing_signature/, 'tampered token rejected');

    const expiredPayload = { ...decodePayload(token), expiresAt: new Date(Date.now() - 60_000).toISOString(), nonce: 'expired-nonce' };
    assert.throws(() => pairing.verifyPairingToken(signPayload(expiredPayload)), /push_pairing_token_expired/, 'expired token rejected');
    const wrongPurposePayload = { ...decodePayload(token), purpose: 'not_push_pairing', nonce: 'wrong-purpose-nonce' };
    assert.throws(() => pairing.verifyPairingToken(signPayload(wrongPurposePayload)), /invalid_push_pairing_purpose/, 'wrong purpose rejected');
    const savedSecret = process.env.PUSH_PAIRING_SECRET;
    delete process.env.PUSH_PAIRING_SECRET;
    assert.throws(() => pairing.createPairingToken({ maxUserId: 'u', chatId: 'c' }), /push_pairing_secret_required/, 'missing PUSH_PAIRING_SECRET fails safely');
    process.env.PUSH_PAIRING_SECRET = savedSecret;

    await withServer(async (server) => {
      const joinToken = pairing.createPairingToken({ maxUserId: 'join-user-secret', chatId: 'join-chat-secret', channelId: 'join-channel-secret', issuedByAdminId: 'admin', ttlMinutes: 30 });
      const join = await request(server, `/push/join?t=${encodeURIComponent(joinToken)}`);
      assert.strictEqual(join.status, 200, '/push/join?t=valid works');
      assert(join.text.includes('Подключение уведомлений для вашего чата готово'), 'join page shows safe pairing text');
      for (const forbidden of ['PAIRING_SECRET_MUST_NOT_LEAK_PR144', 'PRIVATE_VAPID_KEY_MUST_NOT_LEAK_PR144', 'ADMIN_TOKEN_MUST_NOT_LEAK_PR144', 'join-user-secret', 'join-chat-secret', 'join-channel-secret', joinToken]) {
        assert(!join.text.includes(forbidden), `join HTML leaked ${forbidden}`);
      }
      const invalid = await request(server, '/push/join?t=invalid');
      assert.strictEqual(invalid.status, 400, 'invalid token returns safe error');
      const expired = await request(server, `/push/join?t=${encodeURIComponent(signPayload(expiredPayload))}`);
      assert.strictEqual(expired.status, 400, 'expired token returns safe error');

      const missingPair = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: validSubscription('missing') }) });
      assert.strictEqual(missingPair.status, 403, 'missing pairing token rejected');
      const badPair = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: 'invalid', subscription: validSubscription('bad') }) });
      assert.strictEqual(badPair.status, 400, 'invalid pairing token rejected');

      const pairToken = pairing.createPairingToken({ maxUserId: 'bound-user', chatId: 'bound-chat', channelId: 'bound-channel', issuedByAdminId: 'admin', ttlMinutes: 30 });
      const pair = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: pairToken, maxUserId: 'attacker-user', chatId: 'attacker-chat', subscription: validSubscription('bound') }) });
      assert.strictEqual(pair.status, 200, 'valid pairing token saves subscription');
      assert.strictEqual(pair.body.status, 'pending', 'paired device starts pending');
      const activeBeforeConfirm = await storage.listDevicesForUser({ maxUserId: 'bound-user', chatId: 'bound-chat' });
      assert.strictEqual(activeBeforeConfirm.length, 0, 'pending device cannot receive real notifications');
      const pairText = JSON.stringify(pair.body);
      for (const forbidden of ['bound-user', 'bound-chat', 'bound-channel', 'https://push.example.test/send/bound', 'p256dh-bound', 'auth-bound']) {
        assert(!pairText.includes(forbidden), `pair response leaked ${forbidden}`);
      }
      const rawStore = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      assert(JSON.stringify(rawStore).includes('https://push.example.test/send/bound'), 'raw subscription is stored server-side');
      const summaries = rawStore.subscriptions.map(storage.publicSummary);
      const summaryText = JSON.stringify(summaries);
      for (const forbidden of ['https://push.example.test/send/bound', 'p256dh-bound', 'auth-bound']) {
        assert(!summaryText.includes(forbidden), `public summary leaked ${forbidden}`);
      }
      const wrongActive = await storage.listDevicesForUser({ maxUserId: 'attacker-user', chatId: 'attacker-chat', includePending: true });
      assert.strictEqual(wrongActive.length, 0, 'subscription cannot be saved for different user/chat supplied by client');

      const page = await request(server, '/push');
      assert.strictEqual(page.status, 200, '/push still works');
      const manifest = await request(server, '/push/manifest.json');
      assert.strictEqual(manifest.body.id, '/push');
      assert.strictEqual(manifest.body.start_url, '/push');
      assert.strictEqual(manifest.body.scope, '/push/');
      assert.strictEqual(manifest.body.display, 'standalone');
      const sw = await request(server, '/push/sw.js');
      assert.strictEqual(sw.status, 200, '/push/sw.js remains isolated');
      assert.strictEqual(sw.headers.get('service-worker-allowed'), null, 'no Service-Worker-Allowed: /');
      assert(!sw.text.includes('silent:true') && !sw.text.includes('silent: true'), 'no silent:true');
      assert.strictEqual((await request(server, '/sw.js')).status, 404, 'no root /sw.js');
      assert.strictEqual((await request(server, '/manifest.json')).status, 404, 'no root /manifest.json');

      const invite = await request(server, '/internal/push/invite', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ADMIN_TOKEN_MUST_NOT_LEAK_PR144' }, body: JSON.stringify({ maxUserId: 'invite-user', chatId: 'invite-chat', channelId: 'invite-channel', ttlMinutes: 15 }) });
      assert.strictEqual(invite.status, 200, 'admin invite generation endpoint works');
      assert(invite.body.joinUrl.includes('/push/join?t='), 'invite returns join URL');
      assert(!JSON.stringify(invite.body).includes(process.env.PUSH_PAIRING_SECRET), 'invite does not expose signing secret');
      const bulkEmpty = await request(server, '/internal/push/invite-chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ADMIN_TOKEN_MUST_NOT_LEAK_PR144' }, body: JSON.stringify({ chatId: 'chat' }) });
      assert.strictEqual(bulkEmpty.body.error, 'member_registry_not_available', 'bulk invite does not fake member discovery');
    });

    resetStores();
    await storage.savePairedDevice(validSubscription('u1-chat1'), { maxUserId: 'target-user', chatId: 'chat-a', channelId: 'chan-a', status: 'active' });
    await storage.savePairedDevice(validSubscription('other-user'), { maxUserId: 'other-user', chatId: 'chat-a', status: 'active' });
    await storage.savePairedDevice(validSubscription('other-chat'), { maxUserId: 'target-user', chatId: 'chat-b', status: 'active' });
    await storage.savePairedDevice(validSubscription('revoked'), { maxUserId: 'target-user', chatId: 'chat-a', status: 'revoked' });
    await storage.savePairedDevice(validSubscription('disabled'), { maxUserId: 'target-user', chatId: 'chat-a', status: 'disabled' });
    await storage.savePairedDevice(validSubscription('pending'), { maxUserId: 'target-user', chatId: 'chat-a', status: 'pending' });
    const sent = [];
    const fakeClient = { sendNotification: async (subscription, payload) => { sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; } };
    const targeted = await dispatch.sendPushToUser({ maxUserId: 'target-user', chatId: 'chat-a', payload: { title: 'АдминКИТ', body: 'private preview target-user chat-a', channelId: 'chan-a', token: 'private-token' }, webPushClient: fakeClient });
    assert.strictEqual(targeted.total, 1, 'sendPushToUser sends only active matching device');
    assert.strictEqual(sent[0].endpoint, 'https://push.example.test/send/u1-chat1', 'does not send to other users/chats/statuses');
    const payloadText = JSON.stringify(sent[0].payload);
    for (const forbidden of ['target-user', 'chat-a', 'chan-a', 'private-token', 'private preview']) assert(!payloadText.includes(forbidden), `default notification payload leaked ${forbidden}`);

    const deadClient = { sendNotification: async () => { const error = new Error('gone'); error.statusCode = 410; throw error; } };
    const dead = await dispatch.sendPushToUser({ maxUserId: 'target-user', chatId: 'chat-a', webPushClient: deadClient });
    assert.strictEqual(dead.results[0].disabled, true, '404/410 disables dead subscription');
    const afterDead = await dispatch.sendPushToUser({ maxUserId: 'target-user', chatId: 'chat-a', webPushClient: fakeClient });
    assert.strictEqual(afterDead.total, 0, 'disabled dead subscription is no longer targeted');

    console.log('targeted pwa push identity pr144 ok');
  } finally {
    cleanEnv();
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
