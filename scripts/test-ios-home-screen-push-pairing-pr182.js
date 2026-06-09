'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const envKeys = ['GITHUB_DEBUG_TOKEN', 'WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];

function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, value) { if (value === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); } }
function reset(file) { try { fs.unlinkSync(file); } catch {} }
function subscription(suffix) { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function request(server, target, options = {}) { const response = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await response.text(); let body; try { body = JSON.parse(text); } catch {} return { status: response.status, text, body, headers: response.headers }; }
function postJson(body, headers = {}) { return { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }; }

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of envKeys) delete process.env[key];
    reset(storageFile); reset(usedFile);
    process.env.WEB_PUSH_PUBLIC_KEY = 'PR182_PUBLIC_KEY';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PR182_PRIVATE_KEY';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr182@example.test';
    process.env.PUSH_PAIRING_SECRET = 'PR182_PAIRING_SECRET_MUST_NOT_LEAK';

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
      const token = pairing.createPairingToken({ maxUserId: 'max-user-pr182', chatId: 'chat-pr182', chatTitle: 'PR182 Chat' });
      const personal = await request(server, `/push/join?t=${encodeURIComponent(token)}`);
      assert.strictEqual(personal.status, 200);
      const manifestMatch = personal.text.match(/<link rel="manifest" href="([^"]+)">/);
      assert(manifestMatch, 'personal page exposes a manifest');
      assert(manifestMatch[1].startsWith('/push/manifest/') && manifestMatch[1].endsWith('.json'), 'personal manifest is flow-specific');

      const manifest = await request(server, manifestMatch[1]);
      assert.strictEqual(manifest.status, 200);
      assert.strictEqual(manifest.headers.get('cache-control').includes('no-store'), true, 'personal manifest is not cached');
      assert(manifest.body.start_url.startsWith('/push/join/'), 'Home Screen start_url carries token in the path');
      assert(manifest.body.start_url.endsWith('?source=manifest-start-url'), 'Home Screen launch is safely attributable');
      assert(manifest.body.id.startsWith('/push/install/') && !manifest.body.id.includes(token), 'manifest identity is flow-specific without exposing raw token in id');

      const pwaOpen = await request(server, manifest.body.start_url);
      assert.strictEqual(pwaOpen.status, 200);
      assert(pwaOpen.text.includes('"tokenStatus":"valid"') && pwaOpen.text.includes(token), 'standalone launch resumes the same personal flow');
      assert(events.some((event) => event.result === 'pwa_opened' && event.tokenSource === 'manifest-start-url' && event.openedAs === 'standalone-pwa'), 'PWA launch is safely logged');

      const generic = await request(server, '/push');
      assert.strictEqual(generic.status, 200);
      assert(generic.text.includes('href="/push/manifest.json"'), 'generic /push uses generic manifest');
      assert(!generic.text.includes(token), 'generic /push does not expose personal token');
      const genericManifest = await request(server, '/push/manifest.json');
      assert.strictEqual(genericManifest.body.start_url, '/push');
      assert.strictEqual(genericManifest.body.id, '/push');

      events.length = 0;
      const pairBody = await request(server, '/api/push/pair', postJson({ pairingToken: token, subscription: subscription('body') }));
      assert.strictEqual(pairBody.status, 200);
      assert(pairBody.body.chats.length > 0, 'pair response contains selected chat');
      assert(events.some((event) => event.result === 'pair_started' && event.tokenSource === 'body'), 'body token source is logged');
      assert(events.some((event) => event.result === 'binding_created' && event.chatsCount > 0), 'successful binding is logged with chatsCount');
      assert(!JSON.stringify(events).includes(token), 'raw pairing token never enters safe events');

      const reopened = await request(server, manifest.body.start_url);
      assert.strictEqual(reopened.status, 200);
      assert(reopened.text.includes('"tokenStatus":"used"') && reopened.text.includes('"relaunchMode":true'), 'consumed start_url enters status-recovery mode');
      assert(!reopened.text.includes(`"token":"${token}"`), 'consumed token is not reinjected into client state');

      const cookieToken = pairing.createPairingToken({ maxUserId: 'cookie-user-pr182', chatId: 'cookie-chat-pr182' });
      events.length = 0;
      const cookiePair = await request(server, '/api/push/pair', postJson({ subscription: subscription('cookie') }, { cookie: `push_pairing_token=${encodeURIComponent(cookieToken)}` }));
      assert.strictEqual(cookiePair.status, 200);
      assert(events.some((event) => event.result === 'pair_started' && event.tokenSource === 'cookie' && event.hasPairingCookie), 'cookie token source is logged');

      events.length = 0;
      const missingPair = await request(server, '/api/push/pair', postJson({ subscription: subscription('missing') }));
      assert.strictEqual(missingPair.status, 403);
      assert(events.some((event) => event.result === 'pair_failed' && event.tokenSource === 'missing' && !event.hasPairingToken), 'missing token source is logged safely');

      const safe = logService.sanitizeEvent({
        event: 'pair_failed', pairingToken: token, maxUserId: 'raw-user', chatId: 'raw-chat', deviceId: 'raw-device',
        endpoint: 'https://push.example/send/raw-endpoint', auth: 'raw-auth-secret', p256dh: 'raw-p256dh-secret',
        botToken: 'raw-bot-token', githubToken: 'raw-github-token', joinUrl: `https://example.test/push/join?t=${token}`,
        clckUrl: `https://clck.ru/secret-${token}`, error: `https://clck.ru/secret-${token}`,
        route: '/api/push/pair', result: 'pair_failed', tokenSource: 'body'
      });
      const serializedSafe = JSON.stringify(safe);
      for (const forbidden of [token, 'raw-user', 'raw-chat', 'raw-device', 'raw-endpoint', 'raw-auth-secret', 'raw-p256dh-secret', 'raw-bot-token', 'raw-github-token', 'clck.ru']) {
        assert(!serializedSafe.includes(forbidden), `safe event removes ${forbidden}`);
      }
      assert(safe.flowId && safe.maxUserIdHash && safe.chatIdHash && safe.deviceIdHash, 'safe hashes remain available');

      const storage = require('../services/webPushStorage');
      const active = await storage.listActiveDevicesForUser('max-user-pr182');
      const bindings = await storage.listChatBindingsForUser('max-user-pr182');
      assert(active.length > 0 && bindings.some((item) => item.chatId === 'chat-pr182'), 'PR178 active device + selected chat binding still works');

      const indexSource = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8');
      assert(indexSource.includes("pushPairingLog:require('./services/pushPairingLogService').info()"), '/debug/version exposes pushPairingLog state');
      assert.deepStrictEqual(Object.keys(logService.info()).sort(), ['branch', 'enabled', 'lastAttemptAt', 'lastError', 'lastOk', 'lastSyncedAt', 'limit', 'path'].sort());
      assert.strictEqual(logService.info().branch, 'runtime-status');
      assert.strictEqual(logService.info().path, 'runtime/push-pairing-log.json');
      assert.strictEqual(logService.info().limit, 100);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    console.log('ios home screen push pairing pr182 ok');
  } finally {
    restore(storageFile, originalStorage); restore(usedFile, originalUsed);
    for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
