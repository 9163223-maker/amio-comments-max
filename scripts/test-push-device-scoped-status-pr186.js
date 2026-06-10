'use strict';
const assert = require('assert');
const storage = require('../services/webPushStorage');
const connected = require('../services/pushConnectedChatsService');
const confirmation = require('../services/pushConfirmationService');

(async () => {
  const original = storage.listChatBindingsSnapshot;
  storage.listChatBindingsSnapshot = async () => ({
    rawBindingsCount: 4, uniqueChatsCount: 4, missingTitleCount: 0,
    rawBindings: [
      { maxUserId: 'u1', chatId: 'chat-1', chatTitle: 'Мож Хвост 3', endpointHash: 'new-endpoint', deviceId: 'new-device', status: 'active', updatedAt: '2026-06-10T10:00:00Z' },
      { maxUserId: 'u1', chatId: 'chat-2', chatTitle: 'Мож Хвост 2', endpointHash: 'old-endpoint', deviceId: 'old-device', status: 'active' },
      { maxUserId: 'u1', chatId: 'chat-3', chatTitle: 'Все свои MAX', endpointHash: 'old-endpoint', deviceId: 'old-device', status: 'active' },
      { maxUserId: 'u1', chatId: 'chat-4', chatTitle: 'Мож•Хвост', endpointHash: 'tablet-endpoint', deviceId: 'tablet-device', status: 'active' }
    ],
    chats: [
      { maxUserId: 'u1', chatId: 'chat-1', chatTitle: 'Мож Хвост 3', endpointHash: 'new-endpoint', deviceId: 'new-device' },
      { maxUserId: 'u1', chatId: 'chat-2', chatTitle: 'Мож Хвост 2', endpointHash: 'old-endpoint', deviceId: 'old-device' },
      { maxUserId: 'u1', chatId: 'chat-3', chatTitle: 'Все свои MAX', endpointHash: 'old-endpoint', deviceId: 'old-device' },
      { maxUserId: 'u1', chatId: 'chat-4', chatTitle: 'Мож•Хвост', endpointHash: 'tablet-endpoint', deviceId: 'tablet-device' }
    ]
  });
  try {
    const phone = await connected.resolveConnectedChats('u1', { endpointHash: 'new-endpoint' });
    assert.strictEqual(phone.chats.filter((x) => x.enabledOnThisDevice).length, 1);
    assert.strictEqual(phone.chats.filter((x) => x.needsReconnect).length, 3);
    const tablet = await connected.resolveConnectedChats('u1', { endpointHash: 'tablet-endpoint' });
    assert.strictEqual(tablet.chats.find((x) => x.chatTitle === 'Мож•Хвост').enabledOnThisDevice, true);
    assert.strictEqual(tablet.chats.find((x) => x.chatTitle === 'Мож Хвост 3').enabledOnThisDevice, false);
    const safe = confirmation.safePublicResult({ ok: true, status: 'active', chats: phone.chats });
    assert.strictEqual(safe.chats.filter((x) => x.status === 'enabled').length, 1);
    assert.strictEqual(safe.chats.filter((x) => x.status === 'needs_reconnect').length, 3);
    assert(safe.chats.every((x) => x.chatRef), 'safe chat references are exposed for diagnostics');
    const client = require('fs').readFileSync(require('path').join(__dirname, '..', 'public/push-client.js'), 'utf8');
    assert(client.includes("appendChatGroup(node, 'Подключены на этом устройстве:', enabled, 'включены')"));
    assert(client.includes("appendChatGroup(node, 'Другие доступные чаты:', available, 'откройте ссылку из этого чата')"));
    assert(!client.includes("'нужно подключить'"));
    assert(client.includes('setNotificationsBadge(false)'));
    console.log('PR186 device-scoped status tests passed');
  } finally { storage.listChatBindingsSnapshot = original; }
})().catch((e) => { console.error(e); process.exit(1); });
