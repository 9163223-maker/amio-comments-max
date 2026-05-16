'use strict';

const { RUNTIME } = require('../../adminkit-core-runtime');

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { raw: String(value) };
  }
}

function body(update) {
  return update && typeof update === 'object' ? (update.body || update.data || update) : {};
}

function callback(update) {
  const b = body(update);
  return b.callback || update?.callback || b.message?.callback || null;
}

function message(update) {
  const b = body(update);
  return b.message || update?.message || callback(update)?.message || null;
}

function normalize(update = {}) {
  const b = body(update);
  const cb = callback(update) || {};
  const msg = message(update) || {};
  const msgBody = msg.body && typeof msg.body === 'object' ? msg.body : {};
  const payload = safeJson(cb.payload || cb.data || b.payload || '');
  const text = clean(msgBody.text || msg.text || b.text || '');
  const route = clean(payload.r || payload.route || payload.action || text || '');
  const type = cb.callback_id || cb.id ? 'callback' : (text ? 'message' : clean(b.update_type || b.type || 'unknown'));

  return {
    runtimeVersion: RUNTIME,
    type,
    route,
    payload,
    text,
    adminId: clean(cb.user?.user_id || cb.user?.id || msg.sender?.user_id || msg.sender?.id || b.user_id || ''),
    chatId: clean(msg.recipient?.chat_id || msg.chat_id || b.chat_id || ''),
    messageId: clean(cb.message?.message_id || cb.message?.id || msg.message_id || msg.id || ''),
    callbackId: clean(cb.callback_id || cb.id || ''),
    raw: update
  };
}

module.exports = { normalize, clean, safeJson };
