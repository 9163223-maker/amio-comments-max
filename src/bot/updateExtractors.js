'use strict';

function asText(value = '') {
  return String(value || '').trim();
}

function getMessage(update = {}) {
  return update.message || update.data?.message || update.callback?.message || update.data?.callback?.message || null;
}

function getCallback(update = {}) {
  return update.callback || update.data?.callback || update.message?.callback || null;
}

function getBody(message = {}) {
  return message?.body || {};
}

function getText(update = {}) {
  const message = getMessage(update) || {};
  return asText(getBody(message).text || message.text || message.message?.text || '');
}

function getUserId(update = {}) {
  const callback = getCallback(update) || {};
  const message = getMessage(update) || {};
  return asText(
    callback.user?.user_id || callback.user?.id ||
    callback.sender?.user_id || callback.sender?.id ||
    update.user?.user_id || update.user?.id ||
    update.sender?.user_id || update.sender?.id ||
    message.sender?.user_id || message.sender?.id ||
    message.user_id || message.from?.id || ''
  );
}

function getUserName(update = {}) {
  const callback = getCallback(update) || {};
  const message = getMessage(update) || {};
  return asText(
    callback.user?.first_name || callback.user?.name ||
    callback.sender?.first_name || callback.sender?.name ||
    update.user?.first_name || update.user?.name ||
    update.sender?.first_name || update.sender?.name ||
    message.sender?.first_name || message.sender?.name ||
    message.from?.first_name || message.from?.name || 'Администратор'
  );
}

function getChatId(update = {}) {
  const message = getMessage(update) || {};
  return asText(message.recipient?.chat_id || message.recipient?.id || message.chat_id || message.chat?.id || '');
}

function getCallbackId(update = {}) {
  const callback = getCallback(update) || {};
  return asText(callback.callback_id || callback.callbackId || callback.id || '');
}

function parsePayload(value) {
  if (value && typeof value === 'object') return value;
  const raw = asText(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { action: raw };
  } catch {
    return { action: raw };
  }
}

function getPayload(update = {}) {
  const callback = getCallback(update) || {};
  return parsePayload(callback.payload || callback.data || callback.callback_data || callback.value || '');
}

function getMessageId(message = {}) {
  const body = getBody(message);
  return asText(body.mid || body.message_id || body.messageId || body.id || message.message_id || message.messageId || message.id || message.mid || '');
}

function getForwardedPost(update = {}) {
  const message = getMessage(update) || {};
  const body = getBody(message);
  const source = body.link?.message || body.forward?.message || message.link?.message || message.forward?.message || body.message || null;
  const sourceBody = source?.body || source || {};
  const channelId = asText(
    body.link?.chat_id || body.link?.chat?.id ||
    body.forward?.chat_id || body.forward?.chat?.id ||
    source?.recipient?.chat_id || source?.chat_id || source?.chat?.id ||
    message.link?.chat_id || message.forward?.chat_id || ''
  );
  const channelTitle = asText(
    body.link?.chat_title || body.link?.chat?.title ||
    body.forward?.chat_title || body.forward?.chat?.title ||
    source?.recipient?.title || source?.chat?.title || ''
  );
  const postId = asText(sourceBody.mid || sourceBody.message_id || sourceBody.messageId || source?.message_id || source?.id || body.link?.message_id || body.forward?.message_id || '');
  const messageId = postId || getMessageId(source || message);
  const originalText = asText(sourceBody.text || source?.text || body.link?.text || body.forward?.text || '');
  const sourceAttachments = Array.isArray(sourceBody.attachments) ? sourceBody.attachments : [];
  const originalLink = sourceBody.link && typeof sourceBody.link === 'object' ? sourceBody.link : null;
  const originalFormat = sourceBody.format !== undefined ? sourceBody.format : null;

  if (!channelId || !postId) return null;
  return { channelId, channelTitle, postId, messageId, originalText, sourceAttachments, originalLink, originalFormat };
}

module.exports = {
  getMessage,
  getCallback,
  getText,
  getUserId,
  getUserName,
  getChatId,
  getCallbackId,
  getPayload,
  getMessageId,
  getForwardedPost
};
