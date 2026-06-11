'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const files = ['data/web-push-subscriptions.json', 'data/push-pairing-used.json', 'data/push-pairing-handoffs.json'].map((file) => path.join(root, file));
const envKeys = ['GITHUB_DEBUG_TOKEN', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
const backup = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
const restore = (file, value) => { if (value === null) fs.rmSync(file, { force: true }); else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); } };
const subscription = (suffix) => ({ endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } });
const listen = (app) => new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
async function request(server, target, options = {}) { const response = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await response.text(); let body; try { body = JSON.parse(text); } catch {} return { status: response.status, text, body, headers: response.headers }; }
const postJson = (body, headers = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const cookieValue = (response, name) => { const match = String(response.headers.get('set-cookie') || '').match(new RegExp(`${name}=([^;,]+)`)); return match ? decodeURIComponent(match[1]) : ''; };
function signedDeviceProof(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

(async () => {
  const originals = new Map(files.map((file) => [file, backup(file)]));
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    envKeys.forEach((key) => delete process.env[key]);
    files.forEach((file) => fs.rmSync(file, { force: true }));
    process.env.WEB_PUSH_PUBLIC_KEY = 'PR192_PUBLIC';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PR192_PRIVATE';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr192@example.test';
    process.env.PUSH_PAIRING_SECRET = 'pr192-device-proof-secret-with-enough-entropy';

    require('../pr178-push-pairing-bootstrap');
    const logService = require('../services/pushPairingLogService');
    const events = [];
    logService.record = async (event) => { events.push(logService.sanitizeEvent(event)); return { ok: true }; };
    const pairing = require('../services/pushPairingService');
    const storage = require('../services/webPushStorage');
    const routes = require('../web-push-routes');
    const app = express();
    app.use(express.json());
    routes.install(app);
    const server = await listen(app);
    try {
      const currentSubscription = subscription('current-device');
      const firstToken = pairing.createPairingToken({ maxUserId: 'user-pr192', chatId: 'chat-first', chatTitle: 'Первый чат' });
      const firstJoin = await request(server, `/push/join?t=${encodeURIComponent(firstToken)}`);
      assert.strictEqual(firstJoin.status, 200);
      const handoffId = cookieValue(firstJoin, 'push_pairing_handoff');
      assert(handoffId, 'fallback join creates a pending handoff');
      const firstPair = await request(server, '/api/push/pair', postJson({ handoffId, subscription: currentSubscription }));
      assert.strictEqual(firstPair.status, 200);
      const deviceProof = cookieValue(firstPair, 'push_device_proof');
      assert(deviceProof, 'paired PWA receives an HttpOnly device-bound proof');

      events.length = 0;
      const autoToken = pairing.createPairingToken({ maxUserId: 'user-pr192', chatId: 'chat-auto', chatTitle: 'Мож Хвост 3' });
      const autoJoin = await request(server, `/push/join?t=${encodeURIComponent(autoToken)}`, { headers: { cookie: `push_device_proof=${encodeURIComponent(deviceProof)}` } });
      assert.strictEqual(autoJoin.status, 200);
      assert(autoJoin.text.includes('Готово.'));
      assert(autoJoin.text.includes('Чат «Мож Хвост 3» подключён к уведомлениям на этом устройстве.'));
      assert(autoJoin.text.includes('Можно закрыть эту страницу.'));
      assert(!autoJoin.text.includes('другом устройстве'));
      assert(events.some((event) => event.event === 'auto_pair_success' && event.result === 'auto_pair_success'));
      const device = await storage.findDeviceByEndpointHash(storage.subscriptionId(currentSubscription));
      const connected = await storage.listChatBindingsSnapshotForDevice({ deviceId: device.deviceId, endpointHash: device.endpointHash });
      assert(connected.chats.some((chat) => chat.chatId === 'chat-auto'));

      const otherSubscription = subscription('other-device-same-user');
      const otherDevice = await storage.savePairedDevice(otherSubscription, { maxUserId: 'user-pr192', chatId: 'chat-other', chatTitle: 'Другой endpoint', status: 'active' });
      const otherBefore = await storage.listChatBindingsSnapshotForDevice({ deviceId: otherDevice.deviceId, endpointHash: otherDevice.endpointHash });
      assert(!otherBefore.chats.some((chat) => chat.chatId === 'chat-auto'));

      events.length = 0;
      const mismatchedToken = pairing.createPairingToken({ maxUserId: 'user-pr192', chatId: 'chat-mismatch', chatTitle: 'Чужой endpoint' });
      const mismatchedProof = pairing.createDeviceProof({ deviceId: device.deviceId, endpointHash: otherDevice.endpointHash });
      const mismatchedJoin = await request(server, `/push/join?t=${encodeURIComponent(mismatchedToken)}`, { headers: { cookie: `push_device_proof=${encodeURIComponent(mismatchedProof)}` } });
      assert.strictEqual(mismatchedJoin.status, 200);
      assert(mismatchedJoin.text.includes('Подключить этот чат'));
      assert(!mismatchedJoin.text.includes('Готово.'));
      assert(events.some((event) => event.event === 'auto_pair_skipped_device_mismatch'));
      assert(events.some((event) => event.event === 'auto_pair_fallback_pending'));

      events.length = 0;
      const expiredToken = pairing.createPairingToken({ maxUserId: 'user-pr192', chatId: 'chat-expired-proof', chatTitle: 'Истёкший proof' });
      const expiredProof = signedDeviceProof({ purpose: pairing.DEVICE_PURPOSE, deviceId: device.deviceId, endpointHash: device.endpointHash, expiresAt: '2020-01-01T00:00:00.000Z' }, process.env.PUSH_PAIRING_SECRET);
      const expiredJoin = await request(server, `/push/join?t=${encodeURIComponent(expiredToken)}`, { headers: { cookie: `push_device_proof=${encodeURIComponent(expiredProof)}` } });
      assert.strictEqual(expiredJoin.status, 200);
      assert(expiredJoin.text.includes('Подключить этот чат'));
      assert(events.some((event) => event.event === 'auto_pair_skipped_device_mismatch'));
      assert(events.some((event) => event.event === 'auto_pair_fallback_pending'));

      events.length = 0;
      const noProofToken = pairing.createPairingToken({ maxUserId: 'user-pr192', chatId: 'chat-fallback', chatTitle: 'Чат fallback' });
      const noProofJoin = await request(server, `/push/join?t=${encodeURIComponent(noProofToken)}`);
      assert.strictEqual(noProofJoin.status, 200);
      assert(noProofJoin.text.includes('Откройте АдминКИТ PUSH с экрана Домой.'));
      assert(noProofJoin.text.includes('В приложении появится кнопка «Подключить этот чат».'));
      assert(!noProofJoin.text.includes('Готово.'));
      assert(cookieValue(noProofJoin, 'push_pairing_handoff'));
      assert(events.some((event) => event.event === 'auto_pair_skipped_no_device_proof'));
      assert(events.some((event) => event.event === 'auto_pair_fallback_pending'));
      const otherDevices = await storage.listActiveDevicesForUser('user-pr192');
      for (const other of otherDevices) {
        const snapshot = await storage.listChatBindingsSnapshotForDevice({ deviceId: other.deviceId, endpointHash: other.endpointHash });
        assert(!snapshot.chats.some((chat) => chat.chatId === 'chat-fallback'), 'maxUserId alone never auto-pairs a chat');
        if (other.deviceId !== device.deviceId) assert(!snapshot.chats.some((chat) => chat.chatId === 'chat-auto'), 'successful auto-pair creates no cross-device binding');
      }

      const safeLog = JSON.stringify(events);
      for (const secret of [noProofToken, currentSubscription.endpoint, currentSubscription.keys.auth, currentSubscription.keys.p256dh]) assert(!safeLog.includes(secret));
    } finally { await new Promise((resolve) => server.close(resolve)); }
    console.log('PR192 device-scoped auto-connect: OK');
  } finally {
    files.forEach((file) => restore(file, originals.get(file)));
    for (const key of envKeys) originalEnv[key] === undefined ? delete process.env[key] : process.env[key] = originalEnv[key];
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
