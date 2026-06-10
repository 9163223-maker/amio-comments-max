'use strict';

const storage = require('./webPushStorage');
const maxApi = require('./maxApi');

const ACTION = 'push_confirm_device';
const PROMPT_TEXT = 'Подтвердите это устройство для резервных push-уведомлений АдминКИТ.';
const PROMPT_BUTTON_TEXT = '✅ Подтвердить устройство';

function clean(value) { return String(value || '').trim(); }
function shortId(value) { return clean(value).slice(0, 16); }
function safeChatItem(value) {
  const source = value && typeof value === 'object' ? value : {};
  const title = clean(source.chatTitle || source.title).slice(0, 120);
  const chatRef = clean(source.chatRef || source.chatId || source.channelId).replace(/[^A-Za-z0-9_-]/g, '').slice(-4);
  if (!title && !chatRef) return null;
  const enabledOnThisDevice = source.enabledOnThisDevice === true;
  const knownForUser = source.knownForUser !== false;
  const needsReconnect = knownForUser && !enabledOnThisDevice;
  return {
    chatId: clean(source.chatId).replace(/[^A-Za-z0-9_.:@-]/g, '').slice(0, 80),
    channelId: clean(source.channelId).replace(/[^A-Za-z0-9_.:@-]/g, '').slice(0, 80),
    title: title || 'Чат MAX',
    chatRef,
    enabledOnThisDevice,
    knownForUser,
    needsReconnect,
    status: enabledOnThisDevice ? 'enabled' : 'needs_reconnect',
    lastConnectedAt: clean(source.lastConnectedAt).slice(0, 40)
  };
}
function safeChats(value) {
  return Array.isArray(value) ? value.map(safeChatItem).filter(Boolean).slice(0, 20) : [];
}

function buildCallbackPayload(deviceId) {
  return JSON.stringify({ action: ACTION, d: clean(deviceId) });
}

function buildConfirmationAttachments(deviceId) {
  return [{
    type: 'inline_keyboard',
    payload: { buttons: [[{ type: 'callback', text: PROMPT_BUTTON_TEXT, payload: buildCallbackPayload(deviceId) }]] }
  }];
}

function safePublicResult(result = {}) {
  return {
    ok: Boolean(result.ok),
    status: clean(result.status),
    confirmationRequired: result.confirmationRequired === false ? false : true,
    confirmationSent: Boolean(result.confirmationSent),
    confirmationDispatch: clean(result.confirmationDispatch) || (result.confirmationSent ? 'sent' : 'not_available'),
    deviceId: shortId(result.deviceId),
    chats: safeChats(result.chats)
  };
}

async function sendConfirmationPrompt({ botToken, maxUserId, deviceId, sendMessageImpl } = {}) {
  const token = clean(botToken || process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN);
  const userId = clean(maxUserId);
  const safeDeviceId = clean(deviceId);
  if (!token || !userId || !safeDeviceId) return { ok: false, confirmationSent: false, confirmationDispatch: 'not_available' };
  const sender = sendMessageImpl || maxApi.sendMessage;
  try {
    await sender({
      botToken: token,
      userId,
      text: PROMPT_TEXT,
      attachments: buildConfirmationAttachments(safeDeviceId),
      notify: false
    });
    return { ok: true, confirmationSent: true, confirmationDispatch: 'sent' };
  } catch (error) {
    return { ok: false, confirmationSent: false, confirmationDispatch: 'failed', error: clean(error && error.message).slice(0, 120) };
  }
}

async function confirmDeviceForUser({ deviceId, confirmingUserId } = {}) {
  const safeDeviceId = clean(deviceId);
  const userId = clean(confirmingUserId);
  if (!safeDeviceId) return { ok: false, status: 'missing', notification: 'Устройство не найдено.' };
  if (!userId) return { ok: false, status: 'forbidden', notification: 'Не удалось подтвердить пользователя.' };
  const device = await storage.findDeviceByDeviceId(safeDeviceId);
  if (!device) return { ok: false, status: 'missing', notification: 'Устройство не найдено.' };
  if (device.maxUserId !== userId) return { ok: false, status: 'forbidden', notification: 'Это устройство привязано к другому пользователю.' };
  if (device.status === 'active' && !device.disabled) return { ok: true, status: 'active', alreadyActive: true, notification: 'Устройство уже подключено.' };
  if (device.status !== 'pending' || device.disabled !== true) {
    return { ok: false, status: clean(device.status) || 'unavailable', notification: 'Устройство нельзя подтвердить.' };
  }
  const activated = await storage.markDeviceActive(device.deviceId, { maxUserId: userId, chatId: device.chatId, requireStatus: 'pending' });
  if (!activated.ok) return { ok: false, status: 'unavailable', notification: 'Устройство нельзя подтвердить.' };
  return { ok: true, status: 'active', deviceId: device.deviceId, notification: 'Устройство подключено.' };
}

async function handleCallback({ callbackId, confirmingUserId, payload, botToken } = {}) {
  const deviceId = clean(payload && (payload.d || payload.deviceId));
  const result = await confirmDeviceForUser({ deviceId, confirmingUserId });
  const notification = result.notification || (result.ok ? 'Устройство подключено.' : 'Устройство нельзя подтвердить.');
  if (callbackId && clean(botToken)) {
    try { await maxApi.answerCallback({ botToken, callbackId, notification }); } catch {}
  }
  return { ok: result.ok, action: ACTION, status: result.status, alreadyActive: Boolean(result.alreadyActive), notification };
}

module.exports = {
  ACTION,
  PROMPT_TEXT,
  PROMPT_BUTTON_TEXT,
  buildCallbackPayload,
  buildConfirmationAttachments,
  sendConfirmationPrompt,
  confirmDeviceForUser,
  handleCallback,
  safePublicResult
};
