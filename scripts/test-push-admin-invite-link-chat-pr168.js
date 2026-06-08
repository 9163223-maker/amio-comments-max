'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const botSource = fs.readFileSync(path.join(repoRoot, 'bot.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(repoRoot, 'clean-bot-campaign-attribution-cc8336.js'), 'utf8');
const adminSource = fs.readFileSync(path.join(repoRoot, 'features', 'admin-activation-screens-pr108.js'), 'utf8');
const pushClient = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const pushHtml = fs.readFileSync(path.join(repoRoot, 'public', 'push.html'), 'utf8');
const pushRoutes = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');
const entrypoint = fs.readFileSync(path.join(repoRoot, 'clean-entrypoint-1.53.10-pr89.js'), 'utf8');
const pkg = require('../package.json');
const groupPush = require('../services/groupPushOnboardingService');

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
function assertNoSecretLeak(label, value, forbidden) { const text = typeof value === 'string' ? value : JSON.stringify(value); for (const item of forbidden.filter(Boolean)) assert(!text.includes(item), `${label} must not leak ${item}`); }

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    cleanEnv();
    resetStores();
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR168_MUST_NOT_LEAK';
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_PR168';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_VAPID_KEY_PR168_MUST_NOT_LEAK';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr168@example.test';
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR168_MUST_NOT_LEAK';

    assert(adminSource.includes('Опубликовать приглашение Push в чат'), 'real AdminKIT admin panel exposes Push invite action');
    assert(botSource.includes('Опубликовать приглашение Push в чат') && botSource.includes('admin_push_publish_invite'), 'active bot admin channels UI exposes Push invite action outside /push/admin');
    assert(adapterSource.includes("a === 'admin_push_publish_invite'") && adminSource.includes('assertAdmin(maxUserId)') && botSource.includes('clientAccessService.isAdmin(userId)'), 'admin action uses existing AdminKIT admin context/auth gate');
    assert(!/admin_push_publish_invite[\s\S]{0,400}PUSH_ADMIN_TOKEN/.test(botSource), 'product admin action does not require manual PUSH_ADMIN_TOKEN');
    assert(botSource.includes('publishAdminGroupPushInvite') && botSource.includes('groupPushOnboarding.buildGroupInviteText') && botSource.includes('groupPushOnboarding.buildGroupInviteKeyboard'), 'product admin action publishes group invite server-side');
    assert(botSource.includes('Приглашение опубликовано в чат.') && botSource.includes('Не удалось опубликовать приглашение. Проверьте, что бот добавлен в чат и выбран правильный чат.'), 'admin action has safe success/failure copy');

    const inviteText = groupPush.buildGroupInviteText('PR168 Group');
    const keyboard = groupPush.buildGroupInviteKeyboard();
    const button = keyboard[0].payload.buttons[0][0];
    assert.strictEqual(button.type, 'callback', 'published group invite uses callback button');
    assert.strictEqual(button.payload, 'group_push_enable', 'published group invite payload is group_push_enable');
    assert.strictEqual(button.action, 'group_push_enable', 'published group invite action is group_push_enable');
    assert.notStrictEqual(button.type, 'message', 'published group invite does not use message button');
    assert(!/\/push\/join\?t=|clck\.ru|token|PUSH_ADMIN_TOKEN|BOT_TOKEN/i.test(inviteText), 'group invite has no personal link/token/secret text');

    assert(pushHtml.includes('АдминКИТ Push') && pushHtml.includes('Включить уведомления') && pushHtml.includes('Подключённые чаты'), 'PWA product UI keeps title, enable button, connected chats');
    assert(pushClient.includes('Подключить этот чат') && pushClient.includes("fetchJson('/api/push/link-chat'") && pushRoutes.includes("app.post('/api/push/link-chat'"), 'existing-device add-chat UI and endpoint are wired');
    assert(pushClient.includes('Готово. Уведомления этого чата подключены.') && pushClient.includes('Можно подключить этот чат к уже установленному AdminKIT Push.'), 'add-chat flow has product copy');
    assert(!pushHtml.replace(/[\s\S]*<!-- raw-diagnostics-start -->[\s\S]*/m, '').includes('Последний результат'), 'normal PWA shell hides raw diagnostics before marker strip');
    assert(!/appendResult\([^)]*(endpoint|p256dh|auth|PUSH_ADMIN_TOKEN|BOT_TOKEN|pairingToken)/.test(pushClient), 'client does not append raw push or secret fields');
    assert(entrypoint.includes('adminkit-pr169-public-push-entrypoint') && pkg.sourceMarker === 'adminkit-pr169-public-push-entrypoint', 'active runtime marker is PR169 while PR168 link-chat remains covered');

    const pairing = fresh('../services/pushPairingService');
    const storage = fresh('../services/webPushStorage');

    await withServer(async (server) => {
      const tokenA = pairing.createPairingToken({ maxUserId: 'user-pr168', chatId: 'chat-a-pr168', chatTitle: 'Chat A', ttlMinutes: 30 });
      const pair = await request(server, '/api/push/pair', pairBody(tokenA, 'existing-device'));
      assert.strictEqual(pair.status, 200, 'initial new-device pairing still works');
      assert.strictEqual(pair.body.ok, true, 'initial pair response is ok');
      const rawBefore = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      const device = rawBefore.subscriptions.find((item) => item.maxUserId === 'user-pr168' && item.chatId === 'chat-a-pr168');
      assert(device && device.deviceId, 'initial pairing creates one device');
      await storage.markDeviceActive(device.deviceId, { maxUserId: 'user-pr168', chatId: 'chat-a-pr168' });

      const tokenB = pairing.createPairingToken({ maxUserId: 'user-pr168', chatId: 'chat-b-pr168', chatTitle: 'Chat B Safe', ttlMinutes: 30 });
      const joinB = await request(server, `/push/join?t=${encodeURIComponent(tokenB)}`);
      assert.strictEqual(joinB.status, 200, 'fresh join for user with active device renders PWA');
      assert(joinB.text.includes('"chatLinkMode":true') && joinB.text.includes('"existingActiveDevicesFound":true'), 'join page enters add-chat mode for active device user');
      assert(joinB.text.includes('Chat B Safe'), 'join page includes sanitized chat title label data');
      assert(!joinB.text.includes(tokenB) && !joinB.text.includes('/push/join?t='), 'add-chat page does not expose full token or join URL');
      const cookie = joinB.headers.get('set-cookie');
      assert(cookie && /push_pairing_token=/.test(cookie), 'add-chat join sets HttpOnly pairing cookie');

      const link = await request(server, '/api/push/link-chat', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
      assert.strictEqual(link.status, 200, 'link-chat succeeds without browser push subscription');
      assert.strictEqual(link.body.ok, true, 'link-chat response is ok');
      assert.strictEqual(link.body.existingActiveDevicesFound, true, 'link-chat reports existing active devices');
      assert.strictEqual(link.body.linkedExistingDevicesCount, 1, 'link-chat links one existing active device');
      assert.strictEqual(link.body.chatBindingUpserted, true, 'link-chat upserts chat binding');
      assert(Array.isArray(link.body.chats) && link.body.chats.some((chat) => chat.chatId === 'chat-b-pr168'), 'link-chat returns sanitized connected chats');
      assertNoSecretLeak('link-chat response', link.body, [tokenB, 'https://push.example.test/send/existing-device', 'p256dh-existing-device', 'auth-existing-device', process.env.PUSH_PAIRING_SECRET, process.env.WEB_PUSH_PRIVATE_KEY, process.env.BOT_TOKEN]);
      const rawAfter = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      assert.strictEqual(rawAfter.subscriptions.length, 1, 'link-chat does not create duplicate devices');
      assert(rawAfter.chatBindings.some((item) => item.chatId === 'chat-b-pr168'), 'link-chat stores Chat B binding for dispatch');

      const reuse = await request(server, '/api/push/link-chat', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
      assert.strictEqual(reuse.status, 400, 'link-chat consumes one-time token');
      assert.strictEqual(reuse.body.error, 'push_pairing_token_used', 'used link-chat token returns safe error code');

      const tokenC = pairing.createPairingToken({ maxUserId: 'new-user-pr168', chatId: 'chat-c-pr168', chatTitle: 'Chat C', ttlMinutes: 30 });
      const joinC = await request(server, `/push/join?t=${encodeURIComponent(tokenC)}`);
      assert.strictEqual(joinC.status, 200, 'fresh join for user without active device still works');
      assert(joinC.text.includes('"joinMode":true') && joinC.text.includes('"chatLinkMode":false'), 'new-device onboarding remains normal join mode');
      assert(joinC.text.includes('Включить уведомления'), 'new-device onboarding still shows enable notifications');
    });

    console.log('push admin invite link chat pr168 ok');
  } finally {
    cleanEnv();
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
