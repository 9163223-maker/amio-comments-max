'use strict';

const API_BASE_URL = 'https://platform-api.max.ru';

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function addQuery(url, query = {}) {
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') url.searchParams.append(key, String(item));
      });
      return;
    }
    url.searchParams.set(key, String(value));
  });
}

async function maxApi(path, { token, method = 'GET', query = {}, body, timeoutMs = 12000 } = {}) {
  if (!token) throw new Error('bot_token_missing');
  const url = new URL(`${API_BASE_URL}${path}`);
  addQuery(url, query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 12000)));
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: token,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await readJsonSafe(response);
    if (!response.ok) {
      const error = new Error(`MAX API ${response.status} ${method} ${path}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendMessage({ botToken, userId, chatId, text, attachments, notify = false, format, link }) {
  if (!userId && !chatId) throw new Error('user_id_or_chat_id_required');
  const body = { notify };
  if (text !== undefined) body.text = text;
  if (attachments !== undefined) body.attachments = attachments;
  if (format !== undefined) body.format = format;
  if (link !== undefined) body.link = link;
  return maxApi('/messages', {
    token: botToken,
    method: 'POST',
    query: {
      ...(userId ? { user_id: userId } : {}),
      ...(chatId ? { chat_id: chatId } : {})
    },
    body
  });
}

async function editMessage({ botToken, messageId, text, attachments, notify = false, format, link }) {
  if (!messageId) throw new Error('message_id_required');
  const body = { notify };
  if (text !== undefined) body.text = text;
  if (attachments !== undefined) body.attachments = attachments;
  if (format !== undefined) body.format = format;
  if (link !== undefined) body.link = link;
  return maxApi('/messages', {
    token: botToken,
    method: 'PUT',
    query: { message_id: messageId },
    body
  });
}

async function answerCallback({ botToken, callbackId, notification, message }) {
  if (!callbackId) return { ok: false, skipped: true, reason: 'callback_id_missing' };
  return maxApi('/answers', {
    token: botToken,
    method: 'POST',
    query: { callback_id: callbackId },
    body: {
      ...(notification ? { notification } : {}),
      ...(message ? { message } : {})
    }
  });
}

function buildStartappPayload({ handoffToken = '', commentKey = '', channelId = '', postId = '' } = {}) {
  const handoff = String(handoffToken || '').trim();
  if (handoff) return handoff;
  const key = String(commentKey || '').trim();
  if (key) return `ck:${key}`;
  const channel = String(channelId || '').trim();
  const post = String(postId || '').trim();
  if (channel && post) return `cp:${channel}:${post}`;
  return '';
}

function buildMiniAppUrl({ appBaseUrl = '', handoffToken = '', commentKey = '', channelId = '', postId = '' } = {}) {
  const base = String(appBaseUrl || '').trim().replace(/\/$/, '');
  const query = new URLSearchParams();
  const startapp = buildStartappPayload({ handoffToken, commentKey, channelId, postId });
  if (startapp) query.set('startapp', startapp);
  if (commentKey) query.set('commentKey', String(commentKey || '').trim());
  if (channelId) query.set('channelId', String(channelId || '').trim());
  if (postId) query.set('postId', String(postId || '').trim());
  return `${base || ''}/app?${query.toString()}`;
}

function buildCommentsButtonText(count = 0) {
  const n = Number(count || 0);
  if (n <= 0) return '💬 Комментарии';
  if (n === 1) return '💬 1 комментарий';
  if (n >= 2 && n <= 4) return `💬 ${n} комментария`;
  return `💬 ${n} комментариев`;
}

function buildCommentsKeyboard({ appBaseUrl = '', commentKey = '', channelId = '', postId = '', count = 0, extraRows = [] } = {}) {
  const url = buildMiniAppUrl({ appBaseUrl, commentKey, channelId, postId });
  const rows = [[{ type: 'link', text: buildCommentsButtonText(count), url }]];
  if (Array.isArray(extraRows)) rows.push(...extraRows.filter((row) => Array.isArray(row) && row.length));
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

module.exports = {
  API_BASE_URL,
  maxApi,
  sendMessage,
  editMessage,
  answerCallback,
  buildMiniAppUrl,
  buildCommentsKeyboard,
  buildCommentsButtonText,
  buildStartappPayload
};
