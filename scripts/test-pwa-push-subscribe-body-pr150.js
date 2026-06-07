'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const pushClient = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const routesSource = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING', 'BOT_TOKEN', 'MAX_BOT_TOKEN'];

function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function validSubscription(suffix = 'ok') {
  return {
    endpoint: `https://push.example.invalid/send/${suffix}`,
    expirationTime: null,
    keys: { p256dh: `safe-p256dh-${suffix}`, auth: `safe-auth-${suffix}` }
  };
}
function invalidSubscription(suffix = 'bad') {
  return {
    endpoint: `https://push.example.invalid/send/${suffix}`,
    expirationTime: null,
    keys: { auth: `safe-auth-${suffix}` }
  };
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
  return { status: res.status, text, body };
}
function jsonPost(body, headers = {}) {
  return { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) };
}
function assertNoLeaks(payload, forbidden, label) {
  const text = JSON.stringify(payload);
  for (const value of forbidden.filter(Boolean)) {
    assert(!text.includes(value), `${label} must not expose ${value}`);
  }
}
function assertInvalidDiagnostics(body, expected) {
  assert.strictEqual(body.ok, false, 'invalid response is not ok');
  assert.strictEqual(body.error, 'invalid_push_subscription', 'invalid response has invalid_push_subscription error');
  assert.deepStrictEqual(body.requestShape, expected.requestShape, 'invalid response includes safe request shape');
  assert.strictEqual(body.subscriptionShape.hasEndpoint, expected.hasEndpoint, 'shape endpoint is from extracted candidate');
  assert.strictEqual(body.subscriptionShape.hasKeys, expected.hasKeys, 'shape keys is from extracted candidate');
  assert.strictEqual(body.subscriptionShape.hasP256dh, expected.hasP256dh, 'shape p256dh is from extracted candidate');
  assert.strictEqual(body.subscriptionShape.hasAuth, expected.hasAuth, 'shape auth is from extracted candidate');
}

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  cleanEnv();
  resetStores();
  try {
    process.env.WEB_PUSH_PUBLIC_KEY = 'public-key-pr150';
    process.env.WEB_PUSH_PRIVATE_KEY = 'private-key-pr150';
    process.env.WEB_PUSH_SUBJECT = 'mailto:push-pr150@example.invalid';
    process.env.PUSH_ALLOW_PUBLIC_SUBSCRIBE = '1';
    process.env.PUSH_PAIRING_SECRET = 'pairing-secret-pr150';

    const { extractPushSubscriptionFromBody } = fresh('../web-push-routes');
    const nested = extractPushSubscriptionFromBody({ subscription: validSubscription('nested') });
    assert.strictEqual(nested.source, 'nested', 'nested subscription source is detected');
    assert.deepStrictEqual(nested.subscription, validSubscription('nested'), 'nested subscription candidate is returned');
    const direct = extractPushSubscriptionFromBody(validSubscription('direct'));
    assert.strictEqual(direct.source, 'direct', 'direct subscription source is detected');
    assert.deepStrictEqual(direct.subscription, validSubscription('direct'), 'direct subscription candidate is returned');
    const missing = extractPushSubscriptionFromBody({});
    assert.strictEqual(missing.source, 'missing', 'missing subscription source is detected');
    assert.strictEqual(missing.subscription, undefined, 'missing subscription candidate is undefined');

    await withServer(async (server) => {
      const subscribeNested = await request(server, '/api/push/subscribe', jsonPost({ subscription: validSubscription('subscribe-nested') }));
      assert.strictEqual(subscribeNested.status, 200, '/api/push/subscribe accepts nested valid subscription');
      const subscribeDirect = await request(server, '/api/push/subscribe', jsonPost(validSubscription('subscribe-direct')));
      assert.strictEqual(subscribeDirect.status, 200, '/api/push/subscribe accepts direct valid subscription');

      const pairing = fresh('../services/pushPairingService');
      const tokenNested = pairing.createPairingToken({ maxUserId: 'user-pr150-nested', chatId: 'chat-pr150-nested', issuedByAdminId: 'admin-pr150', ttlMinutes: 30 });
      const pairNested = await request(server, '/api/push/pair', jsonPost({ pairingToken: tokenNested, subscription: validSubscription('pair-nested') }));
      assert.strictEqual(pairNested.status, 200, '/api/push/pair accepts nested valid subscription');
      const tokenDirect = pairing.createPairingToken({ maxUserId: 'user-pr150-direct', chatId: 'chat-pr150-direct', issuedByAdminId: 'admin-pr150', ttlMinutes: 30 });
      const pairDirect = await request(server, '/api/push/pair', jsonPost(validSubscription('pair-direct'), { cookie: `push_pairing_token=${encodeURIComponent(tokenDirect)}` }));
      assert.strictEqual(pairDirect.status, 200, '/api/push/pair accepts direct valid subscription with pairing cookie');

      const invalidNested = await request(server, '/api/push/subscribe', jsonPost({ subscription: invalidSubscription('invalid-nested') }));
      assert.strictEqual(invalidNested.status, 400, 'invalid nested body is rejected');
      assertInvalidDiagnostics(invalidNested.body, {
        requestShape: { bodyType: 'object', hasNestedSubscription: true, extractionSource: 'nested' },
        hasEndpoint: true,
        hasKeys: true,
        hasP256dh: false,
        hasAuth: true
      });
      assert.strictEqual(invalidNested.body.subscriptionShape.endpointLength, invalidSubscription('invalid-nested').endpoint.length, 'endpoint length is reported without endpoint value');
      assertNoLeaks(invalidNested.body, [invalidSubscription('invalid-nested').endpoint, invalidSubscription('invalid-nested').keys.auth, 'safe-p256dh-invalid-nested', process.env.WEB_PUSH_PRIVATE_KEY, process.env.PUSH_PAIRING_SECRET], 'invalid nested response');

      const invalidDirect = await request(server, '/api/push/subscribe', jsonPost(invalidSubscription('invalid-direct')));
      assert.strictEqual(invalidDirect.status, 400, 'invalid direct body is rejected');
      assertInvalidDiagnostics(invalidDirect.body, {
        requestShape: { bodyType: 'object', hasNestedSubscription: false, extractionSource: 'direct' },
        hasEndpoint: true,
        hasKeys: true,
        hasP256dh: false,
        hasAuth: true
      });
      assertNoLeaks(invalidDirect.body, [invalidSubscription('invalid-direct').endpoint, invalidSubscription('invalid-direct').keys.auth], 'invalid direct response');

      const invalidMissing = await request(server, '/api/push/subscribe', jsonPost({}));
      assert.strictEqual(invalidMissing.status, 400, 'missing body is rejected');
      assertInvalidDiagnostics(invalidMissing.body, {
        requestShape: { bodyType: 'object', hasNestedSubscription: false, extractionSource: 'missing' },
        hasEndpoint: false,
        hasKeys: false,
        hasP256dh: false,
        hasAuth: false
      });

      const tokenInvalidPair = pairing.createPairingToken({ maxUserId: 'user-pr150-invalid', chatId: 'chat-pr150-invalid', issuedByAdminId: 'admin-pr150', ttlMinutes: 30 });
      const invalidPair = await request(server, '/api/push/pair', jsonPost({ pairingToken: tokenInvalidPair, subscription: invalidSubscription('pair-invalid') }));
      assert.strictEqual(invalidPair.status, 400, 'invalid pair nested body is rejected');
      assertInvalidDiagnostics(invalidPair.body, {
        requestShape: { bodyType: 'object', hasNestedSubscription: true, extractionSource: 'nested' },
        hasEndpoint: true,
        hasKeys: true,
        hasP256dh: false,
        hasAuth: true
      });
      assertNoLeaks(invalidPair.body, [invalidSubscription('pair-invalid').endpoint, invalidSubscription('pair-invalid').keys.auth, process.env.PUSH_PAIRING_SECRET], 'invalid pair response');
    });

    assert(routesSource.includes('function extractPushSubscriptionFromBody(body)'), 'server defines canonical extractPushSubscriptionFromBody helper');
    assert(routesSource.includes('const extracted = extractPushSubscriptionFromBody(req.body);'), 'subscribe route uses canonical extraction helper');
    assert(routesSource.includes('const extracted = extractPushSubscriptionFromBody(body);'), 'pair route uses canonical extraction helper');
    assert(pushClient.includes('const requestBody = { subscription: normalizedSubscription };'), 'client builds one nested subscription request body');
    assert(pushClient.includes("fetchJson('/api/push/subscribe', { method: 'POST', headers, body: JSON.stringify(requestBody) })"), 'manual subscribe sends nested requestBody');
    assert(pushClient.includes("fetchJson('/api/push/pair', { method: 'POST', body: JSON.stringify(requestBody) })"), 'join/pair sends nested requestBody');
    assert(pushClient.includes("headers: { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) }"), 'fetch helper enforces JSON content type while preserving Authorization');
    assert(pushClient.includes("setStep('sending subscription to server', 'running', JSON.stringify({ requestShape, clientSubscriptionShape: subscriptionShape }))"), 'client shows safe request shape and subscription shape diagnostics');
    assert(pushClient.includes('getSubscriptionKey(subscription, PUSH_SUBSCRIPTION_FIELDS.p256dhField)'), 'PR149 p256dh getKey fallback remains');
    assert(pushClient.includes('getSubscriptionKey(subscription, PUSH_SUBSCRIPTION_FIELDS.authField)'), 'PR149 auth getKey fallback remains');
    assert(pushClient.includes("writeResetResult('reset started')"), 'PR148 reset started remains');
    assert(pushClient.includes("navigator.serviceWorker.getRegistration('/push/')"), 'PR148 reset uses /push/ registration');
    assert(pushClient.includes('state.forceNewSubscriptionAfterInvalid = true'), 'PR148 invalid subscription one-shot reset remains');

    console.log('pwa push subscribe body pr150 ok');
  } finally {
    cleanEnv();
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
