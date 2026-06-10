'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const groupPush = require('../services/groupPushOnboardingService');
const slash = require('../services/nativeSlashCommands');
const accountScreens = require('../features/account-screens-pr106');
const payloads = require('../services/pushNotificationPayloadService');
const pairingLog = require('../services/pushPairingLogService');
const dispatchLog = require('../services/pushDispatchLogService');
const pkg = require('../package.json');
const buildInfo = require('../buildInfo').getBuildInfo();

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

(function run() {
  const fresh = groupPush.buildPrivateJoinMessage({
    chatTitle: 'Мож Хвост 2',
    joinUrl: 'https://example.test/push/join'
  });
  assert(fresh.includes('🔔 Уведомления для чата «Мож Хвост 2»'));
  assert(fresh.includes('АдминКИТ PUSH'));
  assert(!/уже подключ|уже есть подключённое устройство/i.test(fresh));
  assert.strictEqual(groupPush.buildPrivateJoinKeyboard('https://example.test/push/join')[0].payload.buttons[0][0].text, 'Открыть подключение');

  const group = { recipient: { chat_id: 'group-1', chat_type: 'group' }, sender: { user_id: 'admin-1' } };
  for (const command of ['/push', '/help']) assert.strictEqual(slash.isCommandAllowedInContext({ command, message: group, userId: 'admin-1' }), true);
  for (const command of ['/start', '/menu', '/channels', '/comments', '/gifts', '/posts', '/polls', '/privacy']) {
    assert.strictEqual(slash.isCommandAllowedInContext({ command, message: group, userId: 'admin-1' }), false, `${command} must not leak to groups`);
  }

  const account = accountScreens.pushNotificationsScreen('user-1', { chats: [
    { chatTitle: 'Мож Хвост 2', enabledOnThisDevice: true },
    { chatTitle: 'Другой чат', needsReconnect: true }
  ] });
  assert(account.text.includes('Подключённые чаты хранятся отдельно на каждом устройстве.'));
  assert(account.text.includes('Откройте АдминКИТ PUSH на нужном устройстве'));
  assert(!account.text.includes('Мож Хвост 2'));
  assert(!account.text.includes('Другой чат'));
  assert(!account.text.includes('Другие доступные чаты'));

  const campaignAdapter = read('clean-bot-campaign-attribution-cc8336.js');
  assert(campaignAdapter.includes('pushConnectedChats.resolveConnectedChats(uid'), 'bot notifications and PWA use the same binding projection');

  const client = read('public/push-client.js');
  const html = read('public/push.html');
  assert(client.includes('Готово. Уведомления включены для чата'));
  assert(client.includes("connectedChats.resolveConnectedChats") === false, 'browser code does not infer server bindings');
  assert(client.includes("title.textContent = 'Подключены на этом устройстве:'"));
  assert(!client.includes('Другие доступные чаты:'));
  assert(!client.includes('knownForUser'));
  assert(!client.includes("'нужно подключить'"));
  assert(html.includes('id="primaryActionSection" hidden'), 'empty primary card is hidden until an action is available');
  assert(html.includes('<h1>АдминКИТ PUSH</h1>'));

  const notification = payloads.buildGroupMessagePayload({ chatTitle: 'Мож Хвост 2', senderName: 'Ольга', messageText: 'Привет, кто сегодня идёт?' });
  assert.strictEqual(notification.title, 'MAX уведомления');
  assert.strictEqual(notification.body, 'Мож Хвост 2\nОльга: Привет, кто сегодня идёт?');
  const fallback = payloads.buildGroupMessagePayload({ chatTitle: 'Мож Хвост 2', messageText: 'Привет' });
  assert(fallback.body.includes('Участник: Привет'));

  const pairEvent = pairingLog.sanitizeEvent({
    event: 'pair_success', result: 'pair_success', route: '/api/push/pair',
    maxUserId: 'user-1', chatId: 'chat-1', chatTitle: 'Мож Хвост 2', endpointHash: 'abcdef1234567890',
    tokenFound: true, subscriptionCreated: true, linkedToChat: true,
    pairingToken: 'secret.token.value.that.must.not.leak', endpoint: 'https://push.example/secret', auth: 'secret-auth', p256dh: 'secret-key'
  });
  assert.strictEqual(pairEvent.userId, 'user-1');
  assert.strictEqual(pairEvent.chatId, 'chat-1');
  assert.strictEqual(pairEvent.chatTitle, 'Мож Хвост 2');
  assert.strictEqual(pairEvent.linkedToChat, true);
  assert(!JSON.stringify(pairEvent).includes('secret.token'));
  const dispatchEvent = dispatchLog.safeEvent({ event: 'dispatch_completed', chatId: 'chat-1', chatTitle: 'Мож Хвост 2', senderName: 'Ольга', messageText: 'Привет', candidateEndpoints: 2, selectedEndpoints: 1, successCount: 1, failureCount: 0, staleEndpointsRemoved: 1 });
  assert.strictEqual(dispatchEvent.candidateEndpoints, 2);
  assert.strictEqual(dispatchEvent.selectedEndpoints, 1);
  assert.strictEqual(dispatchEvent.staleEndpointsRemoved, 1);

  for (const file of ['public/push.html', 'public/push-client.js', 'public/push-sw.js', 'public/push-admin-manifest.json', 'services/groupPushOnboardingService.js', 'features/account-screens-pr106.js', 'services/pushNotificationPayloadService.js']) {
    const source = read(file);
    for (const forbidden of ['AdminKit Push', 'Adminkit Push', 'AdminKIT Push', 'АдминКИТ Push']) assert(!source.includes(forbidden), `${file} contains ${forbidden}`);
  }

  assert.strictEqual(pkg.version, buildInfo.runtimeVersion);
  assert.strictEqual(pkg.sourceMarker, buildInfo.sourceMarker);
  assert.strictEqual(pkg.pr187PushProductPerfect, true);
  assert.strictEqual(pkg.scripts.start, 'node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js');
  assert(read('clean-entrypoint-1.53.10-pr89.js').includes("require('./pr180-startup-log-bootstrap')"));
  const debugRoutes = read('v3-menu-routes-1539.js');
  assert(debugRoutes.includes('runtimeVersion:process.env.RUNTIME_VERSION||RUNTIME'), 'debug/version reports the active app runtime, not the older access runtime');

  console.log('push product perfect pr187 ok');
})();