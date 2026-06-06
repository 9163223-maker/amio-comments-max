'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pushHtml = fs.readFileSync(path.join(repoRoot, 'public', 'push.html'), 'utf8');
const pushClient = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const combined = `${pushHtml}\n${pushClient}`;

const requiredSteps = [
  'checking environment',
  'checking installed/standalone hint',
  'registering service worker',
  'waiting for service worker active/ready',
  'requesting notification permission',
  'permission result',
  'creating push subscription',
  'sending subscription to server',
  'server response'
];

assert(pushHtml.includes('id="subscribeSteps"'), 'push UI exposes a subscribe diagnostics step container');
assert(pushHtml.includes('id="iosPwaWarning"'), 'push UI exposes the iOS/PWA warning container');
assert(pushHtml.includes('id="standaloneState"'), 'status diagnostics expose standalone/install detection');
for (const step of requiredSteps) {
  assert(combined.includes(step), `subscribe diagnostics include step: ${step}`);
}

assert(pushClient.includes('function withTimeout('), 'subscribe client uses explicit timeout wrapper');
assert(pushClient.includes('TIMEOUTS.serviceWorkerReady'), 'service worker active/ready wait has a timeout');
assert(pushClient.includes('TIMEOUTS.permission'), 'permission request has a timeout');
assert(pushClient.includes('TIMEOUTS.subscription'), 'push subscription has a timeout');
assert(pushClient.includes('TIMEOUTS.serverSave'), 'server save has a timeout');
assert(!pushClient.includes("appendResult('working...')"), 'subscribe flow no longer has a working-only result path');
assert(!pushClient.includes('navigator.serviceWorker.ready;'), 'subscribe flow does not rely on an indefinite serviceWorker.ready await');

const tokenMessage = 'Нужен PUSH_SUBSCRIBE_TOKEN для ручного режима.';
assert(pushClient.includes(tokenMessage), 'missing manual subscribe token has a clear local error message');
const missingTokenIndex = pushClient.indexOf(tokenMessage);
const protectedSubscribeIndex = pushClient.indexOf("fetchJson('/api/push/subscribe'");
assert(missingTokenIndex !== -1 && protectedSubscribeIndex !== -1 && missingTokenIndex < protectedSubscribeIndex, 'missing token is checked before protected subscribe network call');
assert(pushClient.includes('flags.subscribeRequiresToken && !token'), 'missing token check is gated by subscribeRequiresToken');
assert(pushClient.includes('state.join.joinMode') && pushClient.includes("fetchJson('/api/push/pair'"), 'join mode still uses the pairing endpoint instead of manual subscribe token');

const iosWarning = 'На iOS уведомления работают только из приложения, добавленного на экран Домой. Откройте АдминКИТ Push с иконки.';
assert(combined.includes(iosWarning), 'iOS standalone warning text exists');
assert(pushClient.includes('window.navigator.standalone === true'), 'standalone detection checks navigator.standalone');
assert(pushClient.includes("matchMedia('(display-mode: standalone)')"), 'standalone detection checks display-mode standalone');

assert(pushClient.includes('Notification.permission') && pushClient.includes('Notification.requestPermission()'), 'permission flow logs current permission and requests permission');
assert(pushClient.includes('Разрешение не выдано. Проверьте настройки iOS для АдминКИТ Push.'), 'denied/default permission shows clear iOS settings message');
assert(pushClient.includes('browser subscription created'), 'successful subscribe displays browser subscription creation');
assert(pushClient.includes('service_worker_push_manager_missing'), 'subscribe verifies registration.pushManager before subscribing');
assert(pushClient.includes('public_key_missing'), 'subscribe verifies public key before subscribing');
assert(pushClient.includes('notification_permission_not_granted_before_subscribe'), 'subscribe verifies granted permission before subscribing');

assert(pushClient.includes('Устройство подключено и ожидает подтверждения в MAX.'), 'join mode still shows pending paired device message');
assert(pushClient.includes('Откройте MAX и нажмите «Подтвердить устройство».'), 'join mode still shows MAX confirmation prompt message');
assert(pushClient.includes('safeStatusSummary'), 'status refresh result is sanitized before visible output');
assert(pushClient.includes('safeServerResult'), 'server save response is sanitized before visible output');

for (const forbidden of [
  'maxUserId',
  'chatId',
  'channelId',
  'endpoint:',
  'p256dh:',
  'auth:',
  'WEB_PUSH_PRIVATE_KEY',
  'PUSH_PAIRING_SECRET'
]) {
  assert(!combined.includes(forbidden), `visible push client/html must not expose ${forbidden}`);
}

const subscribeTokenMentions = (combined.match(/PUSH_SUBSCRIBE_TOKEN/g) || []).length;
assert(subscribeTokenMentions <= 2, 'PUSH_SUBSCRIBE_TOKEN appears only as the safe placeholder/local missing-token label');
const adminTokenMentions = (combined.match(/PUSH_ADMIN_TOKEN/g) || []).length;
assert(adminTokenMentions <= 1, 'PUSH_ADMIN_TOKEN appears only as the safe placeholder label');

console.log('pwa push subscribe diagnostics pr146 ok');
