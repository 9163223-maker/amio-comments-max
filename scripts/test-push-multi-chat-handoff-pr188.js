'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pairing = require('../services/pushPairingService');
const handoffs = require('../services/pushPairingHandoffService');
const pairingLog = require('../services/pushPairingLogService');
const groupPush = require('../services/groupPushOnboardingService');
const slash = require('../services/nativeSlashCommands');
const maxCommandRegistry = require('../services/maxCommandRegistryService');
const payloads = require('../services/pushNotificationPayloadService');
const pkg = require('../package.json');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

(function run() {
  const originalSecret = process.env.PUSH_PAIRING_SECRET;
  const originalStore = fs.existsSync(handoffs.DATA_FILE) ? fs.readFileSync(handoffs.DATA_FILE) : null;
  process.env.PUSH_PAIRING_SECRET = 'pr188-test-secret-with-enough-entropy';
  try {
    fs.mkdirSync(path.dirname(handoffs.DATA_FILE), { recursive: true });
    fs.writeFileSync(handoffs.DATA_FILE, '{"handoffs":{}}\n');
    const tokenA = pairing.createPairingToken({ maxUserId: 'user-188', chatId: 'chat-a', chatTitle: 'Чат А' });
    const tokenB = pairing.createPairingToken({ maxUserId: 'user-188', chatId: 'chat-b', chatTitle: 'Чат Б' });
    const verifiedA = pairing.verifyPairingToken(tokenA);
    const verifiedB = pairing.verifyPairingToken(tokenB);
    const pendingA = handoffs.create({ pairingToken: tokenA, context: verifiedA });
    const pendingB = handoffs.create({ pairingToken: tokenB, context: verifiedB });
    const pending = handoffs.listPendingForUser('user-188');
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].chatTitle, 'Чат Б');
    assert.strictEqual(pending[0].consumed, false);
    assert(pending[0].flowId && pending[0].handoffIdHash);
    handoffs.consume(pendingB.handoffId);
    assert.deepStrictEqual(handoffs.listPendingForUser('user-188').map((item) => item.chatTitle), ['Чат А']);
    assert.strictEqual(handoffs.resolve(pendingA.handoffId).status, 'found');
  } finally {
    if (originalStore) fs.writeFileSync(handoffs.DATA_FILE, originalStore);
    else fs.rmSync(handoffs.DATA_FILE, { force: true });
    if (originalSecret === undefined) delete process.env.PUSH_PAIRING_SECRET;
    else process.env.PUSH_PAIRING_SECRET = originalSecret;
  }

  const invite = groupPush.buildPrivateJoinMessage({ chatTitle: 'Чат Б', joinUrl: 'https://example.test/push/join?t=fresh' });
  assert(invite.includes('затем откройте приложение с экрана Домой и подключите этот чат'));
  assert(!/уже подключ/i.test(invite));

  const html = read('public/push.html');
  const client = read('public/push-client.js');
  const routes = read('web-push-routes.js');
  const bootstrap = read('pr178-push-pairing-bootstrap.js');
  for (const text of ['Как добавить на экран Домой', 'Я уже установил АдминКИТ PUSH', 'Открыть инструкцию', 'Подключить этот чат']) assert(html.includes(text));
  assert(client.includes('Чат найден'));
  assert(!html.includes('Персональная ссылка найдена'));
  assert(client.includes("fetchJson('/api/push/pending'"));
  assert(client.includes("hasConnectedChats ? 'Подключить этот чат' : 'Включить уведомления'"));
  assert(client.includes('async function connectPendingChatWithExistingSubscription()'));
  assert(client.includes('JSON.stringify({ subscription: normalizePushSubscription(subscription), handoffId })'));
  const directConnect = client.slice(client.indexOf('async function connectPendingChatWithExistingSubscription()'), client.indexOf('async function handlePrimaryButton()'));
  assert(!directConnect.includes('Notification.requestPermission'), 'existing-subscription chat connect does not request permission again');
  assert(!directConnect.includes('pushManager.subscribe'), 'existing-subscription chat connect does not create another subscription');
  assert(client.includes('отправьте /push в этом чате и откройте ссылку'));
  assert(routes.includes('informationalJoin: !fromManifest'));
  assert(bootstrap.includes("originalGet('/api/push/pending', handlers.pending)"));
  assert(bootstrap.includes("tokenSource: ['found', 'consumed'].includes(recovered.status) ? 'pending_handoff' : 'missing'"));
  assert(bootstrap.indexOf('if (bodyHandoff)') < bootstrap.indexOf('if (bodyToken || cookieToken)'), 'explicit pending handoff wins over stale cookies');

  const groupMessage = { recipient: { chat_id: 'group-188', chat_type: 'group' }, sender: { user_id: 'user-188' } };
  assert.deepStrictEqual(slash.PUBLIC_GROUP_COMMANDS, ['/push', '/help']);
  for (const command of ['/start', '/menu', '/channels', '/comments', '/gifts', '/posts', '/polls', '/buttons', '/stats', '/privacy', '/settings', '/archive']) {
    assert.strictEqual(slash.isCommandAllowedInContext({ command, message: groupMessage, userId: 'user-188' }), false, `${command} must stay out of groups`);
  }
  const cleanBot = read('clean-bot-1539.js');
  assert(cleanBot.includes('privateMessage(m)&&txt(m).trim()'), 'ordinary group messages never enter activation-code handling');

  assert.deepStrictEqual(maxCommandRegistry.GLOBAL_COMMAND_NAMES, ['/push', '/help']);
  assert.deepStrictEqual(maxCommandRegistry.commandsPayload(), { commands: [
    { name: 'push', description: '🔔 Уведомления этого чата' },
    { name: 'help', description: '🆘 Помощь' }
  ] });
  assert.strictEqual(maxCommandRegistry.SCOPE_SUPPORT, 'global-only-no-public-scopes');

  const event = pairingLog.sanitizeEvent({ event: 'pending_lookup', route: '/api/push/pending', result: 'pending_found', maxUserId: 'user-188', deviceId: 'device-secret', endpointHash: 'abcdef1234567890', pendingCount: 1, selectedPendingChatId: 'chat-b', selectedPendingChatTitle: 'Чат Б', endpoint: 'https://secret', auth: 'secret', p256dh: 'secret' });
  assert.strictEqual(event.pendingCount, 1);
  assert.strictEqual(event.selectedPendingChatTitle, 'Чат Б');
  assert(!JSON.stringify(event).includes('https://secret'));

  const notification = payloads.buildGroupMessagePayload({ chatTitle: 'Чат Б', senderName: 'Ольга', messageText: 'Новое сообщение' });
  assert.strictEqual(notification.title, 'АдминКИТ PUSH');
  assert.strictEqual(notification.body, 'Чат Б\nОльга: Новое сообщение');

  assert.strictEqual(pkg.version, 'CC8.3.54-PR188-PUSH-MULTI-CHAT-HANDOFF');
  assert.strictEqual(pkg.sourceMarker, 'adminkit-pr188-push-multi-chat-handoff');
  assert.strictEqual(pkg.pr188PushMultiChatHandoff, true);
  console.log('PR188 push multi-chat handoff tests passed');
})();
