'use strict';

const assert = require('assert');
const payloads = require('../services/pushNotificationPayloadService');

(function run() {
  const normal = payloads.buildGroupMessagePayload({
    chatId: 'chat-secret-id',
    resolvedChatTitle: 'Мож Хвост 3',
    chatTitle: 'Старое имя',
    senderName: 'Ольга',
    messageText: '  Привет  ',
    messageId: 'message-secret-id'
  });
  assert.strictEqual(payloads.SERVICE_NAME, 'АдминКИТ PUSH', 'web app/service name is unified');
  assert.strictEqual(normal.title, 'АдминКИТ PUSH', 'service title is unified');
  assert.strictEqual(normal.body, 'Мож Хвост 3\nОльга: Привет', 'chat, sender, and text form the body');
  assert.strictEqual(normal.data.notificationTitleSource, 'resolved_binding', 'safe title source diagnostic is included');
  assert(!JSON.stringify(normal).includes('from AdminKIT Push'), 'chat notification has no duplicate source line');

  const noSender = payloads.buildGroupMessagePayload({ chatTitle: 'Все свои MAX', messageText: 'Текст без автора' });
  assert.strictEqual(noSender.title, 'АдминКИТ PUSH', 'service title remains unified');
  assert.strictEqual(noSender.body, 'Все свои MAX\nУчастник: Текст без автора', 'missing sender uses Участник fallback');

  const missingTitle = payloads.buildGroupMessagePayload({ senderName: 'Иван', messageText: 'Готово' });
  assert.strictEqual(missingTitle.title, 'АдминКИТ PUSH', 'missing chat title keeps service title');
  assert.strictEqual(missingTitle.body, 'Чат MAX\nИван: Готово', 'fallback chat title does not discard sender/message');

  assert.strictEqual(payloads.buildGroupMessagePayload({ senderName: 'Ольга', attachments: [{ type: 'image' }] }).body, 'Чат MAX\nОльга: Фото', 'photo body is friendly');
  assert.strictEqual(payloads.buildGroupMessagePayload({ attachments: [{ type: 'file' }] }).body, 'Чат MAX\nУчастник: Файл', 'file body without sender is friendly');
  assert.strictEqual(payloads.buildGroupMessagePayload({ attachments: [{ type: 'sticker' }] }).body, 'Чат MAX\nУчастник: Новое сообщение', 'unsupported media uses generic body');

  const setup = payloads.buildAdminPayload({ body: 'Уведомления подключены' });
  assert.strictEqual(setup.title, 'АдминКИТ PUSH', 'setup notification may use service name as title');
  assert.strictEqual(setup.body, 'Уведомления подключены', 'setup notification remains distinct');

  const unsafe = payloads.buildGroupMessagePayload({
    chatTitle: 'Безопасный чат',
    senderName: 'Ольга',
    messageText: 'token=abc123 endpoint=https://push.example/x auth=qwerty p256dh=secret device_id 123456789012345678901234567890 https://example.test/push/join?t=privatepairingtoken1234567890 API debug'
  });
  const serialized = `${unsafe.title} ${unsafe.body}`.toLowerCase();
  for (const forbidden of ['token', 'endpoint', 'auth', 'p256dh', 'device_id', 'api', 'debug', '/push/join', 'privatepairingtoken']) {
    assert(!serialized.includes(forbidden), `sanitized preview excludes ${forbidden}`);
  }
  assert(unsafe.body.length <= 160, 'notification body is safely truncated for iOS');

  console.log('push notification payload format pr185 ok');
})();
