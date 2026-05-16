'use strict';

const api = require('../../services/maxApi');
const config = require('../../config');
const stateManager = require('./stateManager');

function responseMessageId(value = {}) {
  return String(value.message_id || value.messageId || value.id || value.message?.message_id || value.message?.id || value.data?.message_id || value.data?.id || '').trim();
}

async function deleteMessageLater(messageId, delayMs = 0) {
  if (!messageId || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}

async function closeGarbage(adminId) {
  const session = await stateManager.getSession(adminId);
  const ids = Array.isArray(session?.garbage_message_ids) ? session.garbage_message_ids : [];
  for (const mid of ids) {
    await api.editMessage({ botToken: config.botToken, messageId: mid, text: '✅ Меню закрыто', attachments: [], notify: false }).catch(() => {});
    await api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    await deleteMessageLater(mid, 900);
  }
}

async function sendScreen(ctx, screen) {
  const adminId = ctx.adminId || ctx.chatId || '';
  const sent = await api.sendMessage({ botToken: config.botToken, chatId: ctx.chatId || undefined, userId: ctx.chatId ? undefined : adminId, text: screen.text, attachments: screen.attachments, notify: false });
  const messageId = responseMessageId(sent);
  if (adminId && messageId) await stateManager.setActiveScreen(adminId, messageId);
  if (adminId) await closeGarbage(adminId);
  return { ok: true, messageId };
}

module.exports = { sendScreen, closeGarbage, responseMessageId };
