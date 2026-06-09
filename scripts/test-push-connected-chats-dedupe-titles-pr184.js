'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const handoffFile = path.join(repoRoot, 'data', 'push-pairing-handoffs.json');
const files = [storageFile, usedFile, handoffFile];
const envKeys = ['GITHUB_DEBUG_TOKEN', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];

function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, value) { if (value === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); } }
function reset(file) { try { fs.unlinkSync(file); } catch {} }
function subscription(suffix) { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function request(server, target, options = {}) { const response = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await response.text(); let body; try { body = JSON.parse(text); } catch {} return { status: response.status, text, body, headers: response.headers }; }
function postJson(body, headers = {}) { return { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }; }
function handoffFrom(response) { const match = response.text.match(/"handoffId":"([A-Za-z0-9_-]+)"/); assert(match, 'join response contains handoff id'); return match[1]; }

(async () => {
  const originals = new Map(files.map((file) => [file, backup(file)]));
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of envKeys) delete process.env[key];
    files.forEach(reset);
    process.env.WEB_PUSH_PUBLIC_KEY = 'PR184_PUBLIC_KEY';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PR184_PRIVATE_KEY';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr184@example.test';
    process.env.PUSH_PAIRING_SECRET = 'PR184_PAIRING_SECRET_MUST_NOT_LEAK';

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
      const device = subscription('same-user-device');

      // D. PR183 first-pair handoff still creates the initial titled chat.
      const tokenA = pairing.createPairingToken({ maxUserId: 'max-user-pr184', chatId: 'chat-a-pr184', chatTitle: 'Новости команды' });
      const joinA = await request(server, `/push/join/${encodeURIComponent(tokenA)}`);
      const handoffA = handoffFrom(joinA);
      const pairA = await request(server, '/api/push/pair', postJson({ handoffId: handoffA, subscription: device }));
      assert.strictEqual(pairA.status, 200);
      assert.deepStrictEqual(pairA.body.chats.map((chat) => chat.title), ['Новости команды']);

      // A/C. A newer blank-title row for another endpoint/device cannot duplicate or erase the title.
      const payload = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      const originalBinding = payload.chatBindings.find((item) => item.chatId === 'chat-a-pr184');
      payload.chatBindings.push({ ...originalBinding, id: 'duplicate-binding-pr184', deviceId: 'other-device-pr184', endpointHash: 'other-endpoint-hash-pr184', chatTitle: '', createdAt: new Date(Date.now() + 1000).toISOString(), updatedAt: new Date(Date.now() + 1000).toISOString() });
      fs.writeFileSync(storageFile, JSON.stringify(payload, null, 2));
      events.length = 0;
      const statusA = await request(server, '/api/push/device/status', postJson({ subscription: device }));
      assert.strictEqual(statusA.status, 200);
      assert.strictEqual(statusA.body.chats.length, 1, 'duplicate same-chat binding rows produce one visible card');
      assert.strictEqual(statusA.body.chats[0].title, 'Новости команды', 'newer blank title does not overwrite an older non-empty title');

      // B/D. A later handoff adds a genuinely different chat and keeps both unique titles.
      const tokenB = pairing.createPairingToken({ maxUserId: 'max-user-pr184', chatId: 'chat-b-pr184', chatTitle: 'Канал продукта' });
      const joinB = await request(server, `/push/join/${encodeURIComponent(tokenB)}`);
      const pairB = await request(server, '/api/push/pair', postJson({ handoffId: handoffFrom(joinB), subscription: device }));
      assert.strictEqual(pairB.status, 200);
      assert.strictEqual(pairB.body.chats.length, 2, 'different chats remain separately visible');
      assert.deepStrictEqual(new Set(pairB.body.chats.map((chat) => chat.title)), new Set(['Новости команды', 'Канал продукта']));

      // C. The public fallback is used only when storage, registry, and safe API resolution have no title.
      const activeDevice = (await storage.listActiveDevicesForUser('max-user-pr184'))[0];
      await storage.upsertChatBindingForDevice({ maxUserId: 'max-user-pr184', chatId: 'chat-c-pr184', deviceId: activeDevice.deviceId, endpointHash: activeDevice.endpointHash });
      const statusC = await request(server, '/api/push/device/status', postJson({ subscription: device }));
      const fallback = statusC.body.chats.find((chat) => chat.chatId === 'chat-c-pr184');
      assert(fallback && fallback.title === 'Чат MAX', 'fallback appears only for the unresolved chat');
      assert.strictEqual(statusC.body.chats.filter((chat) => chat.title === 'Чат MAX').length, 1);

      // E. Counts describe raw storage versus normalized output without leaking secrets.
      const countEvent = events.find((event) => event.rawBindingsCount > event.uniqueChatsCount);
      assert(countEvent, 'safe pairing diagnostics include raw and unique counts for duplicate bindings');
      assert.strictEqual(countEvent.missingTitleCount, 0, 'the duplicate titled chat is not counted as missing a title');
      const safe = logService.sanitizeEvent({
        event: 'pair_success', result: 'pair_success', route: '/api/push/pair', pairingToken: tokenB, handoffId: handoffA,
        endpoint: device.endpoint, auth: device.keys.auth, p256dh: device.keys.p256dh, botToken: 'raw-bot-token-pr184', githubToken: 'raw-github-token-pr184',
        rawBindingsCount: 5, uniqueChatsCount: 2, missingTitleCount: 1
      });
      const serialized = JSON.stringify(safe);
      for (const forbidden of [tokenB, handoffA, device.endpoint, device.keys.auth, device.keys.p256dh, 'raw-bot-token-pr184', 'raw-github-token-pr184']) assert(!serialized.includes(forbidden), `safe log excludes ${forbidden}`);
      assert.strictEqual(safe.rawBindingsCount, 5);
      assert.strictEqual(safe.uniqueChatsCount, 2);
      assert.strictEqual(safe.missingTitleCount, 1);

      const pending = await storage.savePairedDevice(subscription('pending-confirmation'), { maxUserId: 'pending-user-pr184', chatId: 'pending-chat-pr184', chatTitle: 'Чат подтверждения', status: 'pending' });
      await storage.markDeviceActive(pending.deviceId, { maxUserId: 'pending-user-pr184', chatId: 'pending-chat-pr184', requireStatus: 'pending' });
      assert.strictEqual((await storage.listChatBindingsForUser('pending-user-pr184'))[0].chatTitle, 'Чат подтверждения', 'confirmation activation preserves the pairing title');

      const clientSource = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
      assert(clientSource.includes('function uniqueChatItems(values)'), 'client also deduplicates malformed duplicate responses defensively');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    console.log('push connected chats dedupe titles pr184 ok');
  } finally {
    for (const file of files) restore(file, originals.get(file));
    for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
