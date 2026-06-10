'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const storage = require('../services/webPushStorage');
const dispatch = require('../services/pushDispatchService');
const log = require('../services/pushDispatchLogService');
const file = path.join(__dirname, '..', log.DEFAULT_PATH);
const backup = fs.existsSync(file) ? fs.readFileSync(file) : null;
const originals = { list: storage.listActiveDevicesForChat, bindings: storage.listChatBindingsForUser, mark: storage.markResult };
(async () => {
  storage.listActiveDevicesForChat = async () => [
    { id: 'one', maxUserId: 'user-secret', deviceId: 'device-one', endpointHash: 'hash-one', status: 'active', disabled: false, subscription: { endpoint: 'https://push.example/secret-one', keys: { auth: 'auth-secret', p256dh: 'p256dh-secret' } } },
    { id: 'two', maxUserId: 'user-secret', deviceId: 'device-two', endpointHash: 'hash-two', status: 'active', disabled: false, subscription: { endpoint: 'https://push.example/secret-two', keys: { auth: 'auth-secret-2', p256dh: 'p256dh-secret-2' } } }
  ];
  storage.listChatBindingsForUser = async () => [{ chatId: 'full-chat-secret-9876', chatTitle: 'Мож Хвост 3' }];
  storage.markResult = async () => ({ ok: true });
  let calls = 0;
  const webPushClient = { sendNotification: async () => { calls += 1; if (calls === 2) { const e = new Error('gone'); e.statusCode = 410; throw e; } return { statusCode: 201 }; } };
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const result = await dispatch.sendPushToChat({ chatId: 'full-chat-secret-9876', payload: { source: 'max_group', chatTitle: 'Мож Хвост 3', senderName: 'Ольга', messageText: 'Тест', attachments: [] }, webPushClient });
    assert.strictEqual(result.success, 1); assert.strictEqual(result.failed, 1); assert.strictEqual(result.removedExpiredCount, 1);
    const summary = log.summary(10); const completed = summary.latest.find((x) => x.event === 'dispatch_completed');
    assert(completed); assert.strictEqual(completed.chatTitle, 'Мож Хвост 3'); assert.strictEqual(completed.senderNamePreview, 'Ольга'); assert.strictEqual(completed.messagePreview, 'Тест');
    assert.strictEqual(completed.selectedEndpointsCount, 2); assert.strictEqual(completed.successCount, 1); assert.strictEqual(completed.failureCount, 1); assert.strictEqual(completed.removedExpiredCount, 1);
    const raw = fs.readFileSync(file, 'utf8');
    for (const secret of ['https://push.example', 'auth-secret', 'p256dh-secret', 'user-secret', 'full-chat-secret-9876']) assert(!raw.includes(secret), `log excludes ${secret}`);
    console.log('PR186 persistent dispatch log tests passed');
  } finally {
    Object.assign(storage, { listActiveDevicesForChat: originals.list, listChatBindingsForUser: originals.bindings, markResult: originals.mark });
    if (backup) fs.writeFileSync(file, backup); else if (fs.existsSync(file)) fs.unlinkSync(file);
  }
})().catch((e) => { console.error(e); process.exit(1); });
