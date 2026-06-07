'use strict';

const storage = require('./webPushStorage');
const payloadService = require('./pushNotificationPayloadService');

function clean(value) { return String(value || '').trim(); }

function privateDefaultPayload(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const allowPreview = source.allowPreview === true;
  return {
    title: clean(source.title).slice(0, 80) || 'АдминКИТ Push',
    body: allowPreview ? (clean(source.body).slice(0, 160) || 'Новое сообщение. Откройте АдминКИТ Push.') : 'Новое сообщение. Откройте АдминКИТ Push.',
    icon: clean(source.icon).slice(0, 300) || '/public/adminkit-push-icon-192.png',
    badge: clean(source.badge).slice(0, 300) || '/public/favicon-32.png',
    tag: clean(source.tag).slice(0, 120) || 'adminkit-targeted',
    data: { url: clean(source.url).slice(0, 300) || '/push', sentAt: new Date().toISOString() }
  };
}

function normalizeDispatchPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const data = source.data && typeof source.data === 'object' ? source.data : {};
  if ((clean(source.title) || clean(source.body)) && clean(data.source)) {
    return {
      title: clean(source.title).slice(0, 120) || 'АдминКИТ Push',
      body: clean(source.body).slice(0, 500) || 'Новое сообщение',
      icon: clean(source.icon).slice(0, 300) || payloadService.DEFAULT_ICON,
      badge: clean(source.badge).slice(0, 300) || payloadService.DEFAULT_BADGE,
      timestamp: Number(source.timestamp) || Date.now(),
      tag: clean(source.tag).slice(0, 140) || 'adminkit-push',
      data: { ...data, url: clean(data.url || source.url).slice(0, 300) || '/push' }
    };
  }
  if (clean(source.source) || clean(data.source)) {
    return payloadService.buildPushNotificationPayload({ ...source, source: clean(source.source || data.source) });
  }
  return privateDefaultPayload(source);
}

function payloadHasPrivateLeak(payload, forbidden = []) {
  const text = JSON.stringify(payload || {});
  return forbidden.filter(Boolean).some((item) => text.includes(String(item)));
}

async function getWebPushClient(config = {}) {
  if (config.webPushClient) return config.webPushClient;
  const publicKey = clean(config.publicKey || process.env.WEB_PUSH_PUBLIC_KEY);
  const privateKey = clean(config.privateKey || process.env.WEB_PUSH_PRIVATE_KEY);
  const subject = clean(config.subject || process.env.WEB_PUSH_SUBJECT || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || 'mailto:admin@example.com');
  if (!publicKey || !privateKey || !subject) {
    const error = new Error('web_push_not_configured');
    error.code = 'web_push_not_configured';
    throw error;
  }
  const webPush = require('web-push');
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return webPush;
}

async function sendToDevices({ devices, payload, webPushClient, forbidden = [] } = {}) {
  const safePayload = normalizeDispatchPayload(payload || {});
  if (payloadHasPrivateLeak(safePayload, forbidden)) {
    return { ok: false, error: 'push_payload_private_data_rejected', total: 0, success: 0, failed: 0, results: [] };
  }
  const activeDevices = Array.isArray(devices) ? devices.filter((device) => device && device.status === 'active' && !device.disabled) : [];
  const client = activeDevices.length ? await getWebPushClient({ webPushClient }) : null;
  const results = [];
  for (const device of activeDevices) {
    try {
      const response = await client.sendNotification(device.subscription, JSON.stringify(safePayload));
      const result = { id: device.id, deviceId: clean(device.deviceId).slice(0, 16), ok: true, statusCode: response && response.statusCode };
      results.push(result);
      await storage.markResult(device.id, { ok: true });
    } catch (error) {
      const statusCode = Number(error && error.statusCode) || 0;
      const disable = statusCode === 404 || statusCode === 410;
      const result = { id: device.id, deviceId: clean(device.deviceId).slice(0, 16), ok: false, statusCode, error: clean(error && error.message).slice(0, 180), disabled: disable };
      results.push(result);
      await storage.markResult(device.id, { ok: false, error: result.error, disable });
    }
  }
  const success = results.filter((item) => item.ok).length;
  const failed = results.length - success;
  return { ok: failed === 0, total: results.length, success, failed, results };
}

async function sendPushToUser({ maxUserId, chatId, payload, includePending = false, webPushClient } = {}) {
  const user = clean(maxUserId);
  const chat = clean(chatId);
  if (!user || !chat) return { ok: false, error: 'push_target_identity_required', total: 0, success: 0, failed: 0, results: [] };
  const devices = await storage.listDevicesForUser({ maxUserId: user, chatId: chat, includePending });
  const scoped = devices.filter((device) => device.maxUserId === user && (includePending ? ['active', 'pending'].includes(device.status) : device.status === 'active') && !device.disabled);
  return sendToDevices({ devices: scoped, payload, webPushClient, forbidden: [user, clean(payload && payload.token)] });
}

async function sendPushToChat({ chatId, payload, webPushClient } = {}) {
  const chat = clean(chatId);
  if (!chat) return { ok: false, error: 'push_chat_id_required', total: 0, success: 0, failed: 0, results: [] };
  const devices = await storage.listActiveDevicesForChat(chat);
  return sendToDevices({ devices, payload, webPushClient, forbidden: [clean(payload && payload.token)] });
}

async function sendPushToChatMembers({ chatId, userIds, payloadBuilder, webPushClient } = {}) {
  const chat = clean(chatId);
  const ids = Array.isArray(userIds) ? userIds.map(clean).filter(Boolean) : [];
  if (!chat || !ids.length) return { ok: false, error: 'push_chat_targets_required', total: 0, success: 0, failed: 0, results: [] };
  const results = [];
  for (const userId of ids) {
    const payload = typeof payloadBuilder === 'function' ? payloadBuilder({ maxUserId: userId, chatId: chat }) : undefined;
    results.push({ maxUserIdHash: require('crypto').createHash('sha256').update(userId).digest('hex').slice(0, 12), ...(await sendPushToUser({ maxUserId: userId, chatId: chat, payload, webPushClient })) });
  }
  const total = results.reduce((sum, item) => sum + item.total, 0);
  const success = results.reduce((sum, item) => sum + item.success, 0);
  const failed = results.reduce((sum, item) => sum + item.failed, 0);
  return { ok: failed === 0, total, success, failed, results };
}

module.exports = { privateDefaultPayload, sendPushToUser, sendPushToChat, sendPushToChatMembers };
