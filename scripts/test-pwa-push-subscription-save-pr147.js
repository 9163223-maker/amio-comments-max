'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const pushHtml = fs.readFileSync(path.join(repoRoot, 'public', 'push.html'), 'utf8');
const pushClient = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const routesSource = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const FIELD = { e: 'endpoint', x: 'expirationTime', k: 'keys', p: 'p256dh', a: 'auth' };
const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];

function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function standardSubscription(suffix = 'ok') {
  return {
    [FIELD.e]: `https://push.example.test/send/${suffix}`,
    [FIELD.x]: null,
    [FIELD.k]: { [FIELD.p]: `client-key-${suffix}`, [FIELD.a]: `client-auth-${suffix}` }
  };
}
function withoutField(subscription, field) {
  const copy = JSON.parse(JSON.stringify(subscription));
  if (field === FIELD.e) delete copy[FIELD.e];
  if (field === FIELD.p) delete copy[FIELD.k][FIELD.p];
  if (field === FIELD.a) delete copy[FIELD.k][FIELD.a];
  return copy;
}
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
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

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    cleanEnv();
    resetStores();
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_PR147';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_FOR_PR147';
    process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
    process.env.PUSH_ALLOW_PUBLIC_SUBSCRIBE = '1';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_FOR_PR147';

    assert(pushClient.includes('function normalizePushSubscription('), 'client defines a push subscription normalizer');
    assert(pushClient.includes('typeof subscription.toJSON === \'function\' ? subscription.toJSON()'), 'normalizer uses PushSubscription.toJSON() when available');
    assert(pushClient.includes('const normalizedSubscription = normalizePushSubscription(subscription);'), 'save flow normalizes before network send');
    assert(pushClient.includes("fetchJson('/api/push/subscribe'") && pushClient.includes('JSON.stringify({ subscription: normalizedSubscription })'), 'manual subscribe sends normalized subscription to /api/push/subscribe');
    assert(pushClient.includes("fetchJson('/api/push/pair'") && pushClient.includes('JSON.stringify({ subscription: normalizedSubscription })'), 'join flow sends normalized subscription to /api/push/pair');

    const storage = fresh('../services/webPushStorage');
    await storage.saveSubscription(standardSubscription('storage-accepts-standard'));
    await assert.rejects(() => storage.saveSubscription(withoutField(standardSubscription('missing-e'), FIELD.e)), /invalid_push_subscription/, 'server validation rejects missing endpoint');
    await assert.rejects(() => storage.saveSubscription(withoutField(standardSubscription('missing-p'), FIELD.p)), /invalid_push_subscription/, 'server validation rejects missing keys.p256dh');
    await assert.rejects(() => storage.saveSubscription(withoutField(standardSubscription('missing-a'), FIELD.a)), /invalid_push_subscription/, 'server validation rejects missing keys.auth');

    await withServer(async (server) => {
      const nested = await request(server, '/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: standardSubscription('nested-subscribe') }) });
      assert.strictEqual(nested.status, 200, '/api/push/subscribe accepts standard nested PushSubscription JSON');
      assert.strictEqual(nested.body.ok, true, '/api/push/subscribe nested response ok');
      const direct = await request(server, '/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(standardSubscription('direct-subscribe')) });
      assert.strictEqual(direct.status, 200, '/api/push/subscribe keeps current direct body compatibility');
      const invalid = await request(server, '/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: withoutField(standardSubscription('bad-subscribe'), FIELD.p) }) });
      assert.strictEqual(invalid.status, 400, '/api/push/subscribe rejects missing keys.p256dh');
      assert.strictEqual(invalid.body.error, 'invalid_push_subscription', '/api/push/subscribe reports sanitized invalid subscription error');

      const pairing = fresh('../services/pushPairingService');
      const token = pairing.createPairingToken({ maxUserId: 'user-pr147', chatId: 'chat-pr147', ttlMinutes: 30 });
      const paired = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: token, subscription: standardSubscription('paired-standard') }) });
      assert.strictEqual(paired.status, 200, '/api/push/pair accepts standard nested PushSubscription JSON');
      assert.strictEqual(paired.body.ok, true, '/api/push/pair response ok');
    });

    assert(pushHtml.includes('Сбросить push-подписку'), 'push UI contains reset subscription button text');
    assert(pushHtml.includes('id="resetSubscriptionBtn"'), 'push UI exposes reset subscription button');
    assert(pushClient.includes('async function resetPushSubscription()'), 'client implements reset flow');
    assert(pushClient.includes("navigator.serviceWorker.getRegistration('/push/')"), 'reset flow uses the isolated /push/ registration');
    assert(pushClient.includes('subscription.unsubscribe()'), 'reset flow calls unsubscribe()');
    assert(pushClient.includes('push subscription reset: no subscription found'), 'reset flow reports no subscription found');
    assert(pushClient.includes('push subscription reset failed'), 'reset flow reports reset failures');

    const instruction = 'Сервер не принял текущую браузерную подписку. Нажмите «Сбросить push-подписку», затем снова «Включить уведомления».';
    assert(pushClient.includes(instruction), 'invalid_push_subscription displays reset instruction');
    assert(pushClient.includes("setStep('server response', 'error'"), 'invalid_push_subscription marks server response step failed');
    assert(pushClient.includes('safeServerResult(error.data'), 'invalid_push_subscription shows sanitized server error only');

    assert(routesSource.includes('req.body && req.body.subscription ? req.body.subscription : req.body'), 'subscribe route accepts nested subscription body and existing direct body shape');
    assert(routesSource.includes('const subscription = body.subscription || body'), 'pair route accepts nested subscription body and existing direct body shape');
    assert(!routesSource.includes('req.query.token'), 'push routes do not accept admin token from query string');

    for (const raw of [
      'https://push.example.test/send/',
      'client-key-',
      'client-auth-',
      'PRIVATE_KEY_FOR_PR147',
      'PAIRING_SECRET_FOR_PR147',
      'WEB_PUSH_PRIVATE_KEY',
      'PUSH_ADMIN_TOKEN value',
      'PUSH_SUBSCRIBE_TOKEN value',
      'PUSH_PAIRING_SECRET value'
    ]) {
      assert(!pushHtml.includes(raw), `visible push HTML does not expose ${raw}`);
      assert(!pushClient.includes(raw), `visible push client does not expose ${raw}`);
    }

    console.log('pwa push subscription save pr147 ok');
  } finally {
    cleanEnv();
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
