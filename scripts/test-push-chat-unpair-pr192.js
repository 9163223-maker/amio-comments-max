'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const root = path.join(__dirname, '..');
const storageFile = path.join(root, 'data', 'web-push-subscriptions.json');
const files = [storageFile, path.join(root, 'data', 'push-pairing-used.json'), path.join(root, 'data', 'push-pairing-handoffs.json')];
const envKeys = ['GITHUB_DEBUG_TOKEN', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
const backup = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
const restore = (file, value) => { if (value === null) fs.rmSync(file, { force: true }); else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); } };
const subscription = (suffix) => ({ endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } });
const listen = (app) => new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
async function request(server, target, options = {}) { const response = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await response.text(); let body; try { body = JSON.parse(text); } catch {} return { status: response.status, text, body }; }
const postJson = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

(async () => {
  const originals = new Map(files.map((file) => [file, backup(file)]));
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    envKeys.forEach((key) => delete process.env[key]);
    files.forEach((file) => fs.rmSync(file, { force: true }));
    process.env.WEB_PUSH_PUBLIC_KEY = 'PR192_PUBLIC';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PR192_PRIVATE';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr192@example.test';
    process.env.PUSH_PAIRING_SECRET = 'pr192-unpair-secret-with-enough-entropy';

    require('../pr178-push-pairing-bootstrap');
    const logService = require('../services/pushPairingLogService');
    const events = [];
    logService.record = async (event) => { events.push(logService.sanitizeEvent(event)); return { ok: true }; };
    const storage = require('../services/webPushStorage');
    const routes = require('../web-push-routes');
    const deviceA = subscription('device-a');
    const deviceB = subscription('device-b');
    const savedA = await storage.savePairedDevice(deviceA, { maxUserId: 'user-unpair', chatId: 'chat-one', chatTitle: 'Мож Хвост 2', status: 'active' });
    const savedB = await storage.savePairedDevice(deviceB, { maxUserId: 'user-unpair', chatId: 'chat-one', chatTitle: 'Мож Хвост 2', status: 'active' });
    await storage.upsertChatBindingForDevice({ maxUserId: 'user-unpair', chatId: 'chat-one', chatTitle: 'Мож Хвост 2', deviceId: savedA.deviceId, endpointHash: savedA.endpointHash });
    await storage.upsertChatBindingForDevice({ maxUserId: 'user-unpair', chatId: 'chat-two', chatTitle: 'Мож Хвост 3', deviceId: savedA.deviceId, endpointHash: savedA.endpointHash });
    await storage.upsertChatBindingForDevice({ maxUserId: 'user-unpair', chatId: 'chat-one', chatTitle: 'Мож Хвост 2', deviceId: savedB.deviceId, endpointHash: savedB.endpointHash });

    const app = express();
    app.use(express.json());
    routes.install(app);
    const server = await listen(app);
    try {
      const response = await request(server, '/api/push/unpair', postJson({ subscription: deviceA, chatId: 'chat-one' }));
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.ok, true);
      assert.deepStrictEqual(response.body.chats.map((chat) => chat.title), ['Мож Хвост 3']);
      const aSnapshot = await storage.listChatBindingsSnapshotForDevice({ deviceId: savedA.deviceId, endpointHash: savedA.endpointHash });
      assert.deepStrictEqual(aSnapshot.chats.map((chat) => chat.chatId), ['chat-two']);
      const bSnapshot = await storage.listChatBindingsSnapshotForDevice({ deviceId: savedB.deviceId, endpointHash: savedB.endpointHash });
      assert(bSnapshot.chats.some((chat) => chat.chatId === 'chat-one'), 'other endpoint keeps the same chat');
      const chatOneDevices = await storage.listActiveDevicesForChat('chat-one');
      assert(!chatOneDevices.some((device) => device.endpointHash === savedA.endpointHash), 'unpaired endpoint is excluded from dispatch');
      assert(chatOneDevices.some((device) => device.endpointHash === savedB.endpointHash), 'other endpoint remains in dispatch');
      const chatTwoDevices = await storage.listActiveDevicesForChat('chat-two');
      assert(chatTwoDevices.some((device) => device.endpointHash === savedA.endpointHash), 'other chat remains dispatchable on the current endpoint');
      assert((await storage.findDeviceByEndpointHash(savedA.endpointHash)).status === 'active', 'subscription remains active when another chat exists');
      assert(events.some((event) => event.event === 'unpair_success'));

      const repeated = await request(server, '/api/push/unpair', postJson({ subscription: deviceA, chatId: 'chat-one' }));
      assert.strictEqual(repeated.status, 404);
      assert.strictEqual(repeated.body.ok, false);
      assert(events.some((event) => event.event === 'unpair_not_found'));
      const serialized = JSON.stringify(events);
      for (const secret of [deviceA.endpoint, deviceA.keys.auth, deviceA.keys.p256dh]) assert(!serialized.includes(secret));
    } finally { await new Promise((resolve) => server.close(resolve)); }
    console.log('PR192 per-chat device unpair: OK');
  } finally {
    files.forEach((file) => restore(file, originals.get(file)));
    for (const key of envKeys) originalEnv[key] === undefined ? delete process.env[key] : process.env[key] = originalEnv[key];
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
