'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const pushClient = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const pushRoutes = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');

const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const res = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await res.text(); let body = null; try { body = text ? JSON.parse(text) : null; } catch {} return { status: res.status, headers: res.headers, text, body }; }
function validSubscription(suffix = 'a') { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function pairBody(token, suffix) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: token, subscription: validSubscription(suffix) }) }; }
function statusBody(suffix) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: validSubscription(suffix) }) }; }
function assertNoSecretLeak(label, value, forbidden) { const text = typeof value === 'string' ? value : JSON.stringify(value); for (const item of forbidden.filter(Boolean)) assert(!text.includes(item), `${label} must not leak ${item}`); }

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    cleanEnv();
    resetStores();
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR164_MUST_NOT_LEAK';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_PR164';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_VAPID_KEY_PR164_MUST_NOT_LEAK';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr164@example.test';
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR164_MUST_NOT_LEAK';

    assert(pushClient.includes("const PAIRED_CONTEXT_STORAGE_KEY = 'adminkit.push.pairedContext.v1';"), 'successful pairing has a dedicated safe local paired-state key');
    assert(pushClient.includes('storePairedContext(result)') && pushClient.includes('safePairedContext'), 'successful pairing stores only sanitized paired context');
    assert(pushClient.includes("fetchJson('/api/push/device/status'") && pushRoutes.includes("app.post('/api/push/device/status'"), 'paired relaunch uses server-backed device status instead of the consumed join token');
    assert(pushClient.includes('isPairedRelaunchMode()') && pushClient.includes('applyPairedReadyState'), 'client has relaunch-ready state path');
    assert(pushClient.includes("state.join.tokenStatus === 'used'") && pushClient.includes('JOIN_TOKEN_EXPIRED_MESSAGE'), 'used token without paired state still renders safe expired UX');
    assert(!/appendResult\([^)]*(endpoint|p256dh|auth|pairingToken)/.test(pushClient), 'client diagnostics do not append raw token or push keys');

    const pairing = fresh('../services/pushPairingService');
    const storage = fresh('../services/webPushStorage');

    await withServer(async (server) => {
      const token = pairing.createPairingToken({ maxUserId: 'user-pr164', chatId: 'chat-pr164', channelId: 'channel-pr164', ttlMinutes: 30 });
      const pair = await request(server, '/api/push/pair', pairBody(token, 'relaunch'));
      assert.strictEqual(pair.status, 200, 'initial pairing succeeds');
      assert.strictEqual(pair.body.ok, true, 'initial pairing response is ok');
      assertNoSecretLeak('pairing response', pair.body, [token, 'https://push.example.test/send/relaunch', 'p256dh-relaunch', 'auth-relaunch', process.env.PUSH_PAIRING_SECRET, process.env.WEB_PUSH_PRIVATE_KEY]);

      const raw = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      const device = raw.subscriptions.find((item) => item.maxUserId === 'user-pr164' && item.chatId === 'chat-pr164');
      assert(device && device.deviceId, 'pairing stores a device row');
      await storage.markDeviceActive(device.deviceId, { maxUserId: 'user-pr164', chatId: 'chat-pr164' });

      const usedJoin = await request(server, `/push/join?t=${encodeURIComponent(token)}`);
      assert.strictEqual(usedJoin.status, 200, 'relaunch with previously used token serves the PWA shell');
      assert(usedJoin.text.includes('"tokenStatus":"used"'), 'used-token relaunch tells the client this is not a fresh pairing token');
      assert(!usedJoin.text.includes('Код: push_pairing_token_used'), 'used-token relaunch does not render push_pairing_token_used as the primary state');

      const noToken = await request(server, '/push');
      assert.strictEqual(noToken.status, 200, 'installed PWA can open without a token');
      assert(noToken.text.includes('"landingMode":true'), 'no-token launch still lets local paired state take over in the client');

      const status = await request(server, '/api/push/device/status', statusBody('relaunch'));
      assert.strictEqual(status.status, 200, 'paired subscription can confirm server-backed connected status without token');
      assert.strictEqual(status.body.ok, true, 'paired status response is ok');
      assert.strictEqual(status.body.status, 'active', 'paired status returns active after confirmation');
      assertNoSecretLeak('paired status response', status.body, ['https://push.example.test/send/relaunch', 'p256dh-relaunch', 'auth-relaunch', token, process.env.PUSH_PAIRING_SECRET, process.env.WEB_PUSH_PRIVATE_KEY]);

      const freshInvalid = await request(server, '/push/join?t=invalid-token-pr164');
      assert.strictEqual(freshInvalid.status, 400, 'fresh invalid join token still fails safely');
      assert(freshInvalid.text.includes('Ссылка истекла. Вернитесь в MAX и отправьте /push ещё раз.'), 'fresh invalid token shows safe expired/invalid copy');
      assertNoSecretLeak('fresh invalid response', freshInvalid.text, ['invalid-token-pr164', process.env.PUSH_PAIRING_SECRET, process.env.WEB_PUSH_PRIVATE_KEY]);

      const unpairedStatus = await request(server, '/api/push/device/status', statusBody('unknown'));
      assert.strictEqual(unpairedStatus.status, 404, 'unknown subscription does not get paired status');
      assert.strictEqual(unpairedStatus.body.error, 'push_device_not_paired', 'unknown subscription fails with safe code');
      assertNoSecretLeak('unpaired status response', unpairedStatus.body, ['https://push.example.test/send/unknown', 'p256dh-unknown', 'auth-unknown', process.env.PUSH_PAIRING_SECRET]);
    });

    console.log('pwa push relaunch used token pr164 ok');
  } finally {
    cleanEnv();
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
