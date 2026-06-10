'use strict';
const assert = require('assert');
const storage = require('../services/webPushStorage');
const connected = require('../services/pushConnectedChatsService');
const confirmation = require('../services/pushConfirmationService');

(async () => {
  const original = storage.listChatBindingsSnapshotForDevice;
  const bindings = [
    { maxUserId: 'u1', chatId: 'chat-1', chatTitle: 'Мож Хвост 3', endpointHash: 'new-endpoint', deviceId: 'new-device', status: 'active', updatedAt: '2026-06-10T10:00:00Z' },
    { maxUserId: 'u1', chatId: 'chat-2', chatTitle: 'Мож Хвост 2', endpointHash: 'old-endpoint', deviceId: 'old-device', status: 'active' },
    { maxUserId: 'u1', chatId: 'chat-3', chatTitle: 'Все свои MAX', endpointHash: 'old-endpoint', deviceId: 'old-device', status: 'active' },
    { maxUserId: 'u1', chatId: 'chat-4', chatTitle: 'Мож•Хвост', endpointHash: 'tablet-endpoint', deviceId: 'tablet-device', status: 'active' }
  ];
  storage.listChatBindingsSnapshotForDevice = async ({ endpointHash, deviceId }) => {
    const rawBindings = bindings.filter((item) => item.endpointHash === endpointHash || item.deviceId === deviceId);
    return { rawBindings, chats: rawBindings, rawBindingsCount: rawBindings.length, uniqueChatsCount: rawBindings.length, missingTitleCount: 0 };
  };
  try {
    const phone = await connected.resolveConnectedChats('u1', { endpointHash: 'new-endpoint' });
    assert.deepStrictEqual(phone.chats.map((x) => x.chatTitle), ['Мож Хвост 3']);
    assert(phone.chats.every((x) => x.enabledOnThisDevice));
    const tablet = await connected.resolveConnectedChats('u1', { endpointHash: 'tablet-endpoint' });
    assert.deepStrictEqual(tablet.chats.map((x) => x.chatTitle), ['Мож•Хвост']);
    const safe = confirmation.safePublicResult({ ok: true, status: 'active', chats: phone.chats });
    assert.strictEqual(safe.chats.filter((x) => x.status === 'enabled').length, 1);
    assert(!JSON.stringify(safe).includes('needs_reconnect'));
    assert(!JSON.stringify(safe).includes('knownForUser'));
    const client = require('fs').readFileSync(require('path').join(__dirname, '..', 'public/push-client.js'), 'utf8');
    assert(client.includes("title.textContent = 'Подключены на этом устройстве:'"));
    assert(!client.includes('Другие доступные чаты'));
    assert(!client.includes('knownForUser'));
    assert(!client.includes("'нужно подключить'"));
    assert(client.includes('setNotificationsBadge(false)'));
    console.log('PR186 device-scoped status tests passed');
  } finally { storage.listChatBindingsSnapshotForDevice = original; }
})().catch((e) => { console.error(e); process.exit(1); });
