'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const handoffFile = path.join(repoRoot, 'data', 'push-pairing-handoffs.json');
const envKeys = ['GITHUB_DEBUG_TOKEN', 'WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];

function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, value) { if (value === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); } }
function reset(file) { try { fs.unlinkSync(file); } catch {} }
function subscription(suffix) { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function request(server, target, options = {}) { const response = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await response.text(); let body; try { body = JSON.parse(text); } catch {} return { status: response.status, text, body, headers: response.headers }; }
function postJson(body, headers = {}) { return { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }; }
function handoffFrom(response) {
  const cookies = response.headers.get('set-cookie') || '';
  const cookieMatch = cookies.match(/push_pairing_handoff=([^;,]+)/);
  const pageMatch = response.text.match(/"handoffId":"([A-Za-z0-9_-]+)"/);
  assert(cookieMatch && pageMatch, 'join response provides the same opaque handoff through HttpOnly cookie and page state');
  assert.strictEqual(decodeURIComponent(cookieMatch[1]), pageMatch[1]);
  return pageMatch[1];
}

(async () => {
  const files = [storageFile, usedFile, handoffFile];
  const originals = new Map(files.map((file) => [file, backup(file)]));
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of envKeys) delete process.env[key];
    files.forEach(reset);
    process.env.WEB_PUSH_PUBLIC_KEY = 'PR183_PUBLIC_KEY';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PR183_PRIVATE_KEY';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr183@example.test';
    process.env.PUSH_PAIRING_SECRET = 'PR183_PAIRING_SECRET_MUST_NOT_LEAK';

    require('../pr178-push-pairing-bootstrap');
    const logService = require('../services/pushPairingLogService');
    const events = [];
    logService.record = async (event) => { events.push(logService.sanitizeEvent(event)); return { ok: true }; };
    const pairing = require('../services/pushPairingService');
    const routes = require('../web-push-routes');
    const app = express();
    app.use(express.json());
    routes.install(app);
    const server = await listen(app);
    try {
      const deviceSubscription = subscription('same-ios-device');

      // A. First install: Safari creates the handoff; a later generic PWA launch recovers it.
      const tokenA = pairing.createPairingToken({ maxUserId: 'max-user-pr183', chatId: 'chat-a-pr183', chatTitle: 'Chat A' });
      const joinA = await request(server, `/push/join/${encodeURIComponent(tokenA)}`);
      assert.strictEqual(joinA.status, 200);
      const handoffA = handoffFrom(joinA);
      assert(!joinA.text.includes(`"token":"${tokenA}"`), 'raw pairing token is not injected into client state');
      assert(events.some((event) => event.event === 'handoff_created' && event.hasHandoff && event.handoffIdHash), 'handoff creation is safely logged');

      const genericA = await request(server, '/push', { headers: { cookie: `push_pairing_handoff=${encodeURIComponent(handoffA)}` } });
      assert.strictEqual(genericA.status, 200);
      assert(genericA.text.includes(`"handoffId":"${handoffA}"`) && genericA.text.includes('"joinMode":true'), 'generic /push recovers pending handoff from cookie');
      assert(genericA.text.includes('Нажмите «Включить уведомления», чтобы получать уведомления этого чата.') || fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8').includes('Нажмите «Включить уведомления», чтобы получать уведомления этого чата.'), 'handoff UX has a chat-found state');

      events.length = 0;
      const pairA = await request(server, '/api/push/pair', postJson({ handoffId: handoffA, subscription: deviceSubscription }));
      assert.strictEqual(pairA.status, 200);
      assert.strictEqual(pairA.body.status, 'active');
      assert(pairA.body.chats.some((chat) => chat.chatId === 'chat-a-pr183'), 'first handoff creates first chat binding');
      assert(events.some((event) => event.event === 'pair_started' && event.tokenSource === 'pending_handoff' && event.hasHandoff), 'pair starts from handoff recovery');
      assert(events.some((event) => event.event === 'pair_success' && event.result === 'pair_success'), 'pair success is logged');
      assert(events.some((event) => event.event === 'binding_created' && event.chatsCount > 0), 'first binding is logged');

      const statusA = await request(server, '/api/push/device/status', postJson({ subscription: deviceSubscription }));
      assert.strictEqual(statusA.status, 200);
      assert(statusA.body.chats.length > 0, 'status returns the first connected chat');

      // Reopening a consumed handoff remains idempotent for the already-active device.
      const retryA = await request(server, '/api/push/pair', postJson({ handoffId: handoffA, subscription: deviceSubscription }));
      assert.strictEqual(retryA.status, 200);
      assert(retryA.body.chats.some((chat) => chat.chatId === 'chat-a-pr183'));

      // B. Later chat: the same browser subscription/device gains another chat without reinstall.
      const tokenB = pairing.createPairingToken({ maxUserId: 'max-user-pr183', chatId: 'chat-b-pr183', chatTitle: 'Chat B' });
      const joinB = await request(server, `/push/join/${encodeURIComponent(tokenB)}`);
      assert.strictEqual(joinB.status, 200);
      const handoffB = handoffFrom(joinB);
      assert(joinB.text.includes('"existingActiveDevicesFound":true'), 'later-chat page recognizes an existing active device');
      const genericB = await request(server, '/push');
      assert(genericB.text.includes('"landingMode":true') && !genericB.text.includes(handoffB), 'standalone PWA may launch without Safari cookies');
      events.length = 0;
      const pendingB = await request(server, '/api/push/pending', postJson({ subscription: deviceSubscription }));
      assert.strictEqual(pendingB.status, 200);
      assert.strictEqual(pendingB.body.pending[0].handoffId, handoffB, 'existing endpoint discovers the server-side pending handoff');
      assert(events.some((event) => event.event === 'pending_lookup' && event.result === 'pending_found' && event.selectedPendingChatTitle === 'Chat B'), 'pending lookup path is safely logged');
      const pairB = await request(server, '/api/push/pair', postJson({ handoffId: pendingB.body.pending[0].handoffId, subscription: deviceSubscription }, { cookie: `push_pairing_token=${encodeURIComponent(tokenA)}` }));
      assert.strictEqual(pairB.status, 200);
      assert(pairB.body.chats.length >= 2, 'later chat is added to the existing device/user chat list');
      const deviceIds = new Set([pairA.body.deviceId, pairB.body.deviceId]);
      assert.strictEqual(deviceIds.size, 1, 'later chat reuses the same active device');
      const statusB = await request(server, '/api/push/device/status', postJson({ subscription: deviceSubscription }));
      assert(statusB.body.chats.some((chat) => chat.chatId === 'chat-a-pr183') && statusB.body.chats.some((chat) => chat.chatId === 'chat-b-pr183'), 'status returns both connected chats');

      // C. Token loss regression and safe public fallback.
      const noContext = await request(server, '/push');
      assert.strictEqual(noContext.status, 200);
      assert(noContext.text.includes('"landingMode":true') && !noContext.text.includes(handoffA) && !noContext.text.includes(handoffB), 'public /push remains generic without a handoff');
      const missingPair = await request(server, '/api/push/pair', postJson({ subscription: subscription('missing-context') }));
      assert.strictEqual(missingPair.status, 403);
      assert.strictEqual(missingPair.body.error, 'handoff_missing');

      // D. Safe log schema excludes all raw secrets and subscription material.
      const safe = logService.sanitizeEvent({
        event: 'pair_success', result: 'pair_success', route: '/api/push/pair', tokenSource: 'handoff',
        pairingToken: tokenB, handoffId: handoffB, maxUserId: 'raw-user-pr183', chatId: 'raw-chat-pr183', deviceId: 'raw-device-pr183',
        endpoint: deviceSubscription.endpoint, auth: deviceSubscription.keys.auth, p256dh: deviceSubscription.keys.p256dh,
        botToken: 'raw-bot-token-pr183', githubToken: 'raw-github-token-pr183', clckUrl: `https://clck.ru/${tokenB}`,
        error: `https://clck.ru/${tokenB}`, hasHandoff: true
      });
      const serialized = JSON.stringify(safe);
      for (const forbidden of [tokenA, tokenB, handoffA, handoffB, deviceSubscription.endpoint, deviceSubscription.keys.auth, deviceSubscription.keys.p256dh, 'raw-bot-token-pr183', 'raw-github-token-pr183', 'clck.ru']) {
        assert(!serialized.includes(forbidden), `safe pairing log excludes ${forbidden}`);
      }
      assert(safe.flowId && safe.handoffIdHash && safe.maxUserIdHash && safe.chatIdHash && safe.deviceIdHash, 'safe hashes and booleans remain available');
      assert.deepStrictEqual(Object.keys(logService.info()).sort(), ['branch', 'enabled', 'lastAttemptAt', 'lastError', 'lastOk', 'lastSyncedAt', 'limit', 'path'].sort(), '/debug/version log state stays compact');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    console.log('push pairing handoff pr183 ok');
  } finally {
    for (const file of files) restore(file, originals.get(file));
    for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
