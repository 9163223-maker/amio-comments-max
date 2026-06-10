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

const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const res = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await res.text(); return { status: res.status, headers: res.headers, text }; }

function assertNoLeaks(text, label, extraForbidden = []) {
  for (const forbidden of [
    'PUSH_SUBSCRIBE_TOKEN',
    'PUSH_ADMIN_TOKEN',
    'PUSH_PAIRING_SECRET',
    'WEB_PUSH_PRIVATE_KEY',
    'SECRET_VALUE_PR151',
    'ADMIN_TOKEN_VALUE_PR151',
    'SUBSCRIBE_TOKEN_VALUE_PR151',
    'user-pr151',
    'chat-pr151',
    'channel-pr151',
    'endpoint',
    'p256dh',
    'auth',
    ...extraForbidden
  ]) {
    assert(!text.includes(forbidden), `${label} must not expose ${forbidden}`);
  }
}

(async () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    cleanEnv();
    resetStores();
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR151';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR151';
    process.env.WEB_PUSH_SUBJECT = 'mailto:push-pr151@example.test';
    process.env.PUSH_PAIRING_SECRET = 'SECRET_VALUE_PR151';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_VALUE_PR151';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'SUBSCRIBE_TOKEN_VALUE_PR151';

    const pairing = fresh('../services/pushPairingService');
    const token = pairing.createPairingToken({ maxUserId: 'user-pr151', chatId: 'chat-pr151', channelId: 'channel-pr151', issuedByAdminId: 'admin-pr151', ttlMinutes: 30 });

    await withServer(async (server) => {
      const join = await request(server, `/push/join?t=${encodeURIComponent(token)}`);
      assert.strictEqual(join.status, 200, '/push/join?t=valid token renders client UX');
      assert(join.text.includes('Включить уведомления'), 'client UX contains the one-button enable label');
      assert(join.text.includes('Откройте ссылку из MAX-чата, чтобы подключить уведомления.'), 'client UX contains short human instruction');
      assert(join.text.includes('id="clientStatus"'), 'client UX contains a visible client-safe status container');
      assert.strictEqual((join.text.match(/<button\b/g) || []).length, 1, 'client UX has one main enable button');
      assert(!join.text.includes('placeholder="PUSH_SUBSCRIBE_TOKEN"'), 'client UX hides subscribe token field');
      assert(!join.text.includes('placeholder="PUSH_ADMIN_TOKEN"'), 'client UX hides admin token field');
      assert(!join.text.includes('Отправить тестовое уведомление'), 'client UX hides test-send button');
      assert(!join.text.includes('id="subscribeSteps"'), 'client UX does not show raw connection diagnostics by default');
      assert(!join.text.includes('<h2>Диагностика</h2>'), 'client UX hides raw diagnostic table by default');
      assert(join.text.includes('id="clientStatus"') && !join.text.includes('id="subscribeSteps"'), 'client-safe join keeps visible client status while hiding raw diagnostics');
      assert(join.headers.get('set-cookie').includes('Path=/api/push/pair'), 'client UX uses narrow pairing cookie flow');
      assertNoLeaks(join.text, 'client join page', [token]);

      const publicPush = await request(server, '/push');
      assert.strictEqual(publicPush.status, 200, '/push renders safe client landing');
      assert(!publicPush.text.includes('placeholder="PUSH_SUBSCRIBE_TOKEN"'), '/push hides subscribe token field by default');
      assert(!publicPush.text.includes('placeholder="PUSH_ADMIN_TOKEN"'), '/push hides admin token field by default');
      assert(!publicPush.text.includes('Отправить тестовое уведомление'), '/push hides test send by default');
      assert(publicPush.text.includes('id="clientStatus"'), '/push contains a visible client-safe status container');
      assert(!publicPush.text.includes('id="subscribeSteps"'), '/push hides raw diagnostics while keeping client status visible');

      const admin = await request(server, '/push/admin?token=ADMIN_TOKEN_VALUE_PR151&PUSH_ADMIN_TOKEN=ADMIN_TOKEN_VALUE_PR151');
      assert.strictEqual(admin.status, 200, 'admin diagnostic route exists');
      assert(admin.text.includes('placeholder="PUSH_SUBSCRIBE_TOKEN"'), 'admin route contains subscribe-token diagnostic control placeholder');
      assert(admin.text.includes('placeholder="PUSH_ADMIN_TOKEN"'), 'admin route contains admin-token diagnostic control placeholder');
      assert(admin.text.includes('Отправить тестовое уведомление'), 'admin route contains test-send control');
      assert(admin.text.includes('Проверить статус'), 'admin route contains status check control');
      assert(admin.text.includes('id="clientStatus"'), 'admin route also contains the safe visible client status container');
      assert(admin.text.includes('id="resetPushButton"'), 'admin route contains reset control');
      assert(!admin.text.includes('ADMIN_TOKEN_VALUE_PR151'), 'admin route does not accept/expose admin token from query string');
      assert(!admin.text.includes('SECRET_VALUE_PR151'), 'admin route does not expose raw pairing secret');
      assert(!admin.text.includes('PRIVATE_KEY_PR151'), 'admin route does not expose VAPID private key');
      assert(!admin.text.includes('user-pr151') && !admin.text.includes('chat-pr151') && !admin.text.includes('channel-pr151'), 'admin route does not expose raw pairing identity');
    });

    assert(routesSource.includes("app.get('/push/admin'"), 'web-push routes expose explicit /push/admin diagnostic route');
    assert(routesSource.includes("sendPushPage(req, res, { mode: 'client', joinMode: true"), '/push/join renders client mode');
    assert(routesSource.includes("sendPushPage(req, res, { mode: 'client', joinMode: false"), '/push renders client-safe mode by default');
    assert(routesSource.includes('stripMarkedHtml(html, \'admin-diagnostics\')'), 'client mode strips admin diagnostic controls server-side');
    assert(routesSource.includes('stripMarkedHtml(html, \'raw-diagnostics\')'), 'client mode strips raw diagnostics server-side');
    assert(!routesSource.includes('req.query.admin') && !routesSource.includes('req.query.token'), 'admin token is not read from query string');

    const saveStart = pushClient.indexOf('async function saveSubscription(subscription, status)');
    const saveEnd = pushClient.indexOf('\nasync function enableNotifications()', saveStart);
    assert(saveStart !== -1 && saveEnd > saveStart, 'saveSubscription function exists');
    const saveSource = pushClient.slice(saveStart, saveEnd);
    assert(saveSource.includes('const requestBody = { subscription: normalizedSubscription };'), 'client mode sends nested { subscription } body');
    assert(saveSource.includes("fetchJson('/api/push/pair', { method: 'POST', body: JSON.stringify(requestBody) })"), 'client mode posts to /api/push/pair');
    assert(saveSource.indexOf('state.join.joinMode') < saveSource.indexOf("fetchJson('/api/push/pair'"), 'pairing branch is gated by join mode');
    assert(saveSource.indexOf("fetchJson('/api/push/pair'") < saveSource.indexOf("fetchJson('/api/push/subscribe'"), 'join branch returns before manual subscribe branch');
    assert(saveSource.includes("throw new Error('Нужен PUSH_SUBSCRIBE_TOKEN для ручного режима.');"), 'PUSH_SUBSCRIBE_TOKEN is only required in manual/admin mode');
    const enableStart = pushClient.indexOf('async function enableNotifications()');
    const enableEnd = pushClient.indexOf('\nasync function resetPushSubscription()', enableStart);
    assert(enableStart !== -1 && enableEnd > enableStart, 'enableNotifications function exists');
    const enableSource = pushClient.slice(enableStart, enableEnd);
    assert(pushClient.includes('function setClientStatus(message') && pushClient.includes('function clearClientStatus()'), 'client script defines visible client status helpers');
    assert(enableSource.includes("setClientStatus(standaloneMessage, 'warning')"), 'iOS not-standalone warning is written to visible client status');
    assert(enableSource.includes("if (state.join.joinMode || state.join.landingMode) throw new Error(standaloneMessage);"), 'client/join iOS non-standalone path stops before subscribe/save');
    assert(enableSource.includes("setClientStatus(permissionMessage, 'error')"), 'permission denied is written to visible client status');
    assert(enableSource.includes('applyPairedReadyState(successMessage)'), 'join success statuses are written to the single visible state area');
    assert(pushClient.includes('normalizePushSubscription(subscription)'), 'client flow normalizes the PushSubscription before sending');
    assert(pushClient.includes('getSubscriptionKey(subscription, PUSH_SUBSCRIPTION_FIELDS.p256dhField)'), 'PR149 p256dh getKey fallback remains');
    assert(pushClient.includes('getSubscriptionKey(subscription, PUSH_SUBSCRIPTION_FIELDS.authField)'), 'PR149 auth getKey fallback remains');
    assert(pushClient.includes("writeResetResult('reset started')"), 'PR148 reset behavior remains');
    assert(pushClient.includes("navigator.serviceWorker.getRegistration('/push/')"), 'PR148 reset uses /push/ service worker registration');
    assert(pushClient.includes('state.forceNewSubscriptionAfterInvalid = true'), 'PR148 invalid subscription one-shot remains');
    assert(pushClient.includes('Устройство подключено. Подтвердите его в MAX.'), 'confirmation-required final status exists');
    assert(pushClient.includes('Устройство подключено. Откройте MAX и нажмите «Подтвердить устройство».'), 'confirmation-sent final status exists');
    assert(pushClient.includes('Готово — уведомления подключены.'), 'no-confirmation final status exists');
    assert(pushClient.includes('Откройте АдминКИТ PUSH с иконки на экране Домой.'), 'not-standalone iOS final hint exists');
    assert(pushClient.includes('Разрешение не выдано. Включите уведомления в настройках iPhone.'), 'permission-denied final status exists');
    assert(pushClient.includes("fetchJson('/api/push/test', { method: 'POST'"), 'admin diagnostic test send uses /api/push/test');
    assert(!pushClient.includes('location.search') && !pushClient.includes('URLSearchParams'), 'client/admin script does not read admin token from query string');

    assert(routesSource.includes('function extractPushSubscriptionFromBody(body)'), 'PR150 canonical extraction helper remains');
    assert(routesSource.includes('const extracted = extractPushSubscriptionFromBody(req.body);'), 'PR150 subscribe extraction remains');
    assert(routesSource.includes('const extracted = extractPushSubscriptionFromBody(body);'), 'PR150 pair extraction remains');
    assert(routesSource.includes("status: 'pending'"), 'PR145 pairing still saves devices as pending');
    assert(routesSource.includes('confirmation.sendConfirmationPrompt'), 'PR145 MAX confirmation prompt remains');
    assert(routesSource.includes('confirmation.safePublicResult'), 'PR145 safe public confirmation result remains');

    assert(pushHtml.includes('id="resetPushButton"'), 'admin template keeps PR148 reset button marker');
    assert(pushHtml.includes('placeholder="PUSH_SUBSCRIBE_TOKEN"'), 'admin template keeps safe subscribe token placeholder');
    assert(pushHtml.includes('placeholder="PUSH_ADMIN_TOKEN"'), 'admin template keeps safe admin token placeholder');

    console.log('pwa push client/admin split pr151 ok');
  } finally {
    cleanEnv();
    for (const [key, value] of Object.entries(originalEnv)) { if (value !== undefined) process.env[key] = value; }
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
