'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const pushClientPath = path.join(repoRoot, 'public', 'push-client.js');
const pushClient = fs.readFileSync(pushClientPath, 'utf8');
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
function bytes(...values) { return new Uint8Array(values).buffer; }
function standardSubscription(suffix = 'ok') {
  return {
    [FIELD.e]: `https://push.example.invalid/send/${suffix}`,
    [FIELD.x]: null,
    [FIELD.k]: { [FIELD.p]: `client-key-${suffix}`, [FIELD.a]: `client-auth-${suffix}` }
  };
}
function iosFallbackSubscription(suffix = 'ios') {
  return {
    [FIELD.e]: `https://web.push.apple.com/send/${suffix}`,
    [FIELD.x]: null,
    [FIELD.k]: { [FIELD.p]: 'AQIDBAU', [FIELD.a]: 'BgcI' }
  };
}
function withoutField(subscription, field) {
  const copy = JSON.parse(JSON.stringify(subscription));
  if (field === FIELD.e) delete copy[FIELD.e];
  if (field === FIELD.p) delete copy[FIELD.k][FIELD.p];
  if (field === FIELD.a) delete copy[FIELD.k][FIELD.a];
  return copy;
}
function clientContext() {
  const context = {
    window: {
      __ADMINKIT_PUSH_JOIN__: { joinMode: false },
      btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
      atob: (value) => Buffer.from(value, 'base64').toString('binary'),
      navigator: {},
      matchMedia: () => ({ matches: false }),
      isSecureContext: true
    },
    document: { getElementById: () => null, addEventListener: () => undefined },
    history: { replaceState: () => undefined },
    navigator: {},
    setTimeout,
    clearTimeout,
    Date,
    Map,
    JSON,
    String,
    Boolean,
    Number,
    Uint8Array,
    Error,
    console
  };
  vm.createContext(context);
  vm.runInContext(`${pushClient}\nthis.__pr149 = { normalizePushSubscription, safeSubscriptionShape, safeServerResult };`, context, { filename: pushClientPath });
  return context.__pr149;
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
  return { status: res.status, text, body };
}
function assertSafeShape(shape, expected = {}) {
  assert(shape && typeof shape === 'object', 'subscriptionShape is present');
  assert.deepStrictEqual(Object.keys(shape).sort(), ['authLength', 'endpointLength', 'hasAuth', 'hasEndpoint', 'hasKeys', 'hasP256dh', 'p256dhLength'].sort(), 'diagnostics include only safe boolean/length fields');
  for (const key of ['hasEndpoint', 'hasKeys', 'hasP256dh', 'hasAuth']) assert.strictEqual(typeof shape[key], 'boolean', `${key} is boolean`);
  for (const key of ['endpointLength', 'p256dhLength', 'authLength']) assert.strictEqual(typeof shape[key], 'number', `${key} is number`);
  for (const [key, value] of Object.entries(expected)) assert.strictEqual(shape[key], value, `${key} expected`);
}

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    cleanEnv();
    resetStores();
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_PR149';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_FOR_PR149';
    process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
    process.env.PUSH_ALLOW_PUBLIC_SUBSCRIBE = '1';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_FOR_PR149';

    const client = clientContext();
    const jsonOnly = client.normalizePushSubscription({
      toJSON: () => standardSubscription('to-json'),
      getKey: () => { throw new Error('getKey should not be needed when toJSON has keys'); }
    });
    assert.strictEqual(jsonOnly[FIELD.e], 'https://push.example.invalid/send/to-json', 'normalizer uses toJSON endpoint when available');
    assert.strictEqual(jsonOnly[FIELD.k][FIELD.p], 'client-key-to-json', 'normalizer preserves toJSON keys.p256dh');
    assert.strictEqual(jsonOnly[FIELD.k][FIELD.a], 'client-auth-to-json', 'normalizer preserves toJSON keys.auth');

    const missingP256dh = client.normalizePushSubscription({
      toJSON: () => ({ [FIELD.e]: 'https://web.push.apple.com/send/missing-p', [FIELD.x]: null, [FIELD.k]: { [FIELD.a]: 'json-auth' } }),
      getKey: (name) => (name === FIELD.p ? bytes(1, 2, 3, 4, 5) : null)
    });
    assert.strictEqual(missingP256dh[FIELD.k][FIELD.p], 'AQIDBAU', 'normalizer falls back to getKey p256dh and encodes ArrayBuffer safely');
    assert.strictEqual(missingP256dh[FIELD.k][FIELD.a], 'json-auth', 'normalizer preserves existing auth when only p256dh is missing');

    const missingAuth = client.normalizePushSubscription({
      toJSON: () => ({ [FIELD.e]: 'https://web.push.apple.com/send/missing-a', [FIELD.k]: { [FIELD.p]: 'json-p256dh' } }),
      getKey: (name) => (name === FIELD.a ? bytes(6, 7, 8) : null)
    });
    assert.strictEqual(missingAuth[FIELD.x], null, 'normalizer defaults expirationTime to null');
    assert.strictEqual(missingAuth[FIELD.k][FIELD.a], 'BgcI', 'normalizer falls back to getKey auth and encodes ArrayBuffer safely');
    assert(missingAuth[FIELD.e] && missingAuth[FIELD.k][FIELD.p] && missingAuth[FIELD.k][FIELD.a], 'normalized payload contains endpoint, expirationTime, keys.p256dh, keys.auth');

    assert(pushClient.includes('getSubscriptionKey(subscription, PUSH_SUBSCRIPTION_FIELDS.p256dhField)'), 'source has getKey p256dh fallback');
    assert(pushClient.includes('getSubscriptionKey(subscription, PUSH_SUBSCRIPTION_FIELDS.authField)'), 'source has getKey auth fallback');
    assert(pushClient.includes('arrayBufferToBase64Url'), 'source encodes ArrayBuffer keys with URL-safe base64');
    assert(pushClient.includes('clientSubscriptionShape'), 'client shows safe subscription shape diagnostics when sending fails');
    assert(pushClient.includes("fetchJson('/api/push/subscribe'") && pushClient.includes('JSON.stringify({ subscription: normalizedSubscription })'), 'manual subscribe still sends nested normalized subscription');
    assert(pushClient.includes("fetchJson('/api/push/pair'") && pushClient.includes('JSON.stringify({ subscription: normalizedSubscription })'), 'join/pair still sends nested normalized subscription');

    const storage = fresh('../services/webPushStorage');
    await storage.saveSubscription(standardSubscription('storage-standard'));
    await storage.saveSubscription(iosFallbackSubscription('storage-ios'));
    await assert.rejects(() => storage.saveSubscription(withoutField(standardSubscription('missing-endpoint'), FIELD.e)), /invalid_push_subscription/, 'server rejects missing endpoint');
    await assert.rejects(() => storage.saveSubscription(withoutField(standardSubscription('missing-p256dh'), FIELD.p)), /invalid_push_subscription/, 'server rejects missing p256dh');
    await assert.rejects(() => storage.saveSubscription(withoutField(standardSubscription('missing-auth'), FIELD.a)), /invalid_push_subscription/, 'server rejects missing auth');

    await withServer(async (server) => {
      const validStandard = await request(server, '/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: standardSubscription('route-standard') }) });
      assert.strictEqual(validStandard.status, 200, 'server accepts valid standard subscription');
      const validIos = await request(server, '/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: iosFallbackSubscription('route-ios') }) });
      assert.strictEqual(validIos.status, 200, 'server accepts valid fallback-normalized iOS-style subscription');
      const invalid = await request(server, '/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: withoutField(standardSubscription('route-invalid'), FIELD.p) }) });
      assert.strictEqual(invalid.status, 400, 'server rejects invalid route subscription');
      assert.strictEqual(invalid.body.error, 'invalid_push_subscription', 'server invalid response uses invalid_push_subscription');
      assertSafeShape(invalid.body.subscriptionShape, { hasEndpoint: true, hasKeys: true, hasP256dh: false, hasAuth: true });
      assert(!invalid.text.includes('https://push.example.invalid/send/route-invalid'), 'server diagnostics do not include raw endpoint');
      assert(!invalid.text.includes('client-key-route-invalid'), 'server diagnostics do not include raw p256dh');
      assert(!invalid.text.includes('client-auth-route-invalid'), 'server diagnostics do not include raw auth');

      const pairing = fresh('../services/pushPairingService');
      const token = pairing.createPairingToken({ maxUserId: 'user-pr149', chatId: 'chat-pr149', ttlMinutes: 30 });
      const paired = await request(server, '/api/push/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingToken: token, subscription: iosFallbackSubscription('paired-ios') }) });
      assert.strictEqual(paired.status, 200, 'join/pair accepts valid fallback-normalized iOS-style subscription');
    });

    const safeDiagnostic = client.safeSubscriptionShape(missingAuth);
    assertSafeShape(safeDiagnostic, { hasEndpoint: true, hasKeys: true, hasP256dh: true, hasAuth: true });
    const safeDiagnosticText = JSON.stringify(safeDiagnostic);
    assert(!safeDiagnosticText.includes(missingAuth[FIELD.e]), 'client diagnostics do not include raw endpoint');
    assert(!safeDiagnosticText.includes(missingAuth[FIELD.k][FIELD.p]), 'client diagnostics do not include raw p256dh');
    assert(!safeDiagnosticText.includes(missingAuth[FIELD.k][FIELD.a]), 'client diagnostics do not include raw auth');

    assert(pushClient.includes("writeResetResult('reset started')"), 'reset behavior from PR148 remains');
    assert(pushClient.includes('state.forceNewSubscriptionAfterInvalid = true'), 'invalid_push_subscription one-shot recovery remains');
    assert(pushClient.includes('INVALID_SUBSCRIPTION_RESET_INSTRUCTION'), 'invalid_push_subscription recovery instruction remains');
    assert(routesSource.includes('body.subscription || body'), 'pair route keeps nested/direct compatibility');

    console.log('pwa push ios subscription shape pr149 ok');
  } finally {
    cleanEnv();
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
