'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const handoffFile = path.join(repoRoot, 'data', 'push-pairing-handoffs.json');
const pushClient = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const pushRoutes = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');
const edgeDiagnostics = fs.readFileSync(path.join(repoRoot, 'services', 'maxWebhookEdgeDiagnostics.js'), 'utf8');
const inboundDiagnostics = fs.readFileSync(path.join(repoRoot, 'services', 'groupPushInboundDiagnostics.js'), 'utf8');

const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} try { fs.unlinkSync(handoffFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const res = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await res.text(); let body = null; try { body = text ? JSON.parse(text) : null; } catch {} return { status: res.status, headers: res.headers, text, body }; }
function validSubscription(suffix = 'a') { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function signPayload(payload) { const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url'); const sig = crypto.createHmac('sha256', process.env.PUSH_PAIRING_SECRET).update(encoded).digest('base64url'); return `${encoded}.${sig}`; }
function body(token, suffix) { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: token, subscription: validSubscription(suffix) }) }; }

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  const originalHandoffs = backup(handoffFile);
  try {
    cleanEnv();
    resetStores();
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR163_MUST_NOT_LEAK';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_PR163';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_VAPID_KEY_PR163_MUST_NOT_LEAK';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr163@example.test';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_PR163_MUST_NOT_LEAK';
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR163_MUST_NOT_LEAK';

    assert(pushClient.includes("const PENDING_HANDOFF_STORAGE_KEY = 'adminkit.push.pendingHandoff.v1';"), '/push/join stores only the opaque handoff id in origin localStorage');
    assert(pushClient.includes('storePendingHandoffId(pageHandoff)') && pushClient.includes('readPendingHandoffId()'), '/push can recover pending handoff after standalone launch');
    assert(pushClient.includes('const pageHandoff = safeHandoffId(state.join && state.join.handoffId);'), 'page handoff wins over stored handoff');
    assert(pushClient.includes('clearJoinState();') && pushClient.includes('clearPendingHandoffId();'), 'successful pairing clears pending handoff');
    assert(pushClient.includes("const JOIN_TOKEN_FOUND_MESSAGE = 'Нажмите кнопку, чтобы получать уведомления этого чата.'"), 'token-found UX is present');
    assert(pushClient.includes("const JOIN_TOKEN_MISSING_MESSAGE = 'Откройте ссылку из MAX-чата, чтобы подключить уведомления.'"), 'missing token UX remains safe');
    assert(pushClient.includes('Ссылка истекла. Откройте новую ссылку из MAX'), 'expired token UX is safe');
    assert(pushClient.includes('Готово. Уведомления включены для чата'), 'success UX is clear');
    assert(pushClient.includes('handoffId: pendingHandoff'), 'recovered opaque handoff is sent explicitly to /api/push/pair');
    assert(pushRoutes.includes('pushManifestHref(options.token)') && pushRoutes.includes('start_url: startUrl') && pushRoutes.includes("const startUrl = token ? `/push/join/${encodeURIComponent(token)}?source=manifest-start-url` : '/push';"), 'dynamic join manifest/start_url preserves token while normal manifest stays /push');
    assert(edgeDiagnostics.includes("/push/join?t=[redacted]") && inboundDiagnostics.includes("/push/join?t=[redacted]"), 'public diagnostics redact personal join URLs');

    const pairing = fresh('../services/pushPairingService');
    const storage = fresh('../services/webPushStorage');

    await withServer(async (server) => {
      const token = pairing.createPairingToken({ maxUserId: 'user-pr163', chatId: 'chat-pr163', channelId: 'channel-pr163', ttlMinutes: 30 });
      const join = await request(server, `/push/join?t=${encodeURIComponent(token)}`);
      assert.strictEqual(join.status, 200, '/push/join?t=TOKEN renders client page');
      assert(join.text.includes(`href="/push/manifest/${encodeURIComponent(token)}.json"`), '/push/join points Add to Home Screen at token-carrying manifest');
      assert(join.text.includes('"joinMode":true') && join.text.includes('"informationalJoin":true'), '/push/join initializes informational browser mode');
      assert(!join.text.includes('\"handoffId\":') && !join.text.includes(`\"token\":\"${token}\"`), '/push/join exposes no pairing credentials in Safari HTML');

      const manifest = await request(server, `/push/manifest/${encodeURIComponent(token)}.json`);
      assert.strictEqual(manifest.status, 200, 'dynamic join manifest is available');
      assert.strictEqual(manifest.body.start_url, `/push/join/${encodeURIComponent(token)}?source=manifest-start-url`, 'dynamic manifest start_url preserves token');
      assert.strictEqual(manifest.body.scope, '/push/', 'dynamic manifest keeps /push scope');
      const normalManifest = await request(server, '/push/manifest.json');
      assert.strictEqual(normalManifest.body.start_url, '/push', 'normal /push manifest behavior is unchanged');
      assert.strictEqual(normalManifest.body.id, '/push', 'normal manifest id remains stable');
      const plainPush = await request(server, '/push');
      assert.strictEqual(plainPush.status, 200, '/push still renders');
      assert(plainPush.text.includes('"landingMode":true'), 'normal /push without token still asks for personal MAX link');
      assert(!plainPush.text.includes(token), 'normal /push does not expose a personal token');

      const pair = await request(server, '/api/push/pair', body(token, 'first-chat'));
      assert.strictEqual(pair.status, 200, '/api/push/pair accepts recovered body pairingToken without cookie');
      assert.strictEqual(pair.body.ok, true, 'body-token pairing succeeds');
      assert(!JSON.stringify(pair.body).includes(token), 'pairing response does not leak full token');

      const usedAgain = await request(server, '/api/push/pair', body(token, 'used-token'));
      assert.strictEqual(usedAgain.status, 400, 'used token is rejected safely');
      assert(/push_pairing_token_used|invalid_push_pairing/.test(usedAgain.body.error), 'used token response is a safe error code');
      assert(!JSON.stringify(usedAgain.body).includes(token), 'used token error does not echo full token');

      const rawAfterFirstPair = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      const firstDevice = rawAfterFirstPair.subscriptions.find((item) => item.maxUserId === 'user-pr163' && item.chatId === 'chat-pr163');
      assert(firstDevice && firstDevice.deviceId, 'first pairing stores pending device for confirmation');
      await storage.markDeviceActive(firstDevice.deviceId, { maxUserId: 'user-pr163', chatId: 'chat-pr163' });
      const secondToken = pairing.createPairingToken({ maxUserId: 'user-pr163', chatId: 'second-chat-pr163', ttlMinutes: 30 });
      const secondPair = await request(server, '/api/push/pair', body(secondToken, 'first-chat'));
      assert.strictEqual(secondPair.status, 200, 'already-active installed device can bind another chat without reinstall');
      assert.strictEqual(secondPair.body.status, 'active', 'existing active device stays active for second chat');
      assert.strictEqual(secondPair.body.confirmationRequired, false, 'second chat binding does not require reinstall/reconfirmation');
      assert(await storage.isChatBoundForUser('user-pr163', 'second-chat-pr163'), 'second chat is bound to the active device');

      const tokenA = pairing.createPairingToken({ maxUserId: 'url-user-pr163', chatId: 'url-chat-pr163', ttlMinutes: 30 });
      const tokenB = pairing.createPairingToken({ maxUserId: 'stored-user-pr163', chatId: 'stored-chat-pr163', ttlMinutes: 30 });
      const urlWins = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `push_pairing_token=${encodeURIComponent(tokenB)}` }, body: JSON.stringify({ pairingToken: tokenA, subscription: validSubscription('url-wins') }) });
      assert.strictEqual(urlWins.status, 200, 'body/URL token wins over stored cookie token');
      const rawUrlWins = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      const urlDevices = rawUrlWins.subscriptions.filter((item) => item.maxUserId === 'url-user-pr163' && item.chatId === 'url-chat-pr163');
      const storedDevices = rawUrlWins.subscriptions.filter((item) => item.maxUserId === 'stored-user-pr163' && item.chatId === 'stored-chat-pr163');
      assert.strictEqual(urlDevices.length, 1, 'URL token identity was used');
      assert.strictEqual(storedDevices.length, 0, 'stored token identity was ignored when URL/body token exists');

      const expiredToken = signPayload({ purpose: 'push_pairing', maxUserId: 'expired-user-pr163', chatId: 'expired-chat-pr163', expiresAt: new Date(Date.now() - 60_000).toISOString(), nonce: 'expired-pr163' });
      const expiredJoin = await request(server, `/push/join?t=${encodeURIComponent(expiredToken)}`);
      assert.strictEqual(expiredJoin.status, 400, 'expired join URL is rejected');
      assert(expiredJoin.text.includes('Ссылка истекла. Вернитесь в MAX и отправьте /push ещё раз.'), 'expired join URL shows safe UX');
      assert(!expiredJoin.text.includes(process.env.PUSH_PAIRING_SECRET), 'expired page does not expose pairing secret');
      const invalidPair = await request(server, '/api/push/pair', body('invalid-token-pr163', 'invalid'));
      assert.strictEqual(invalidPair.status, 400, 'invalid token pair fails safely');
      assert(!JSON.stringify(invalidPair.body).includes('invalid-token-pr163'), 'invalid token response does not echo full token');
    });

    console.log('pwa push join token install pr163 ok');
  } finally {
    cleanEnv();
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
    restore(handoffFile, originalHandoffs);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
