'use strict';

const groupPushOnboarding = require('./groupPushOnboardingService');
const rootMenuLiveParityTrace = require('./rootMenuLiveParityTraceService');

const LIMIT = 50;
const events = [];
let seq = 0;

const SECRET_ENV_KEYS = [
  'BOT_TOKEN',
  'MAX_BOT_TOKEN',
  'PUSH_ADMIN_TOKEN',
  'PUSH_SUBSCRIBE_TOKEN',
  'PUSH_PAIRING_SECRET',
  'WEB_PUSH_PRIVATE_KEY',
  'VAPID_PRIVATE_KEY',
  'WEBHOOK_SECRET',
  'GIFT_ADMIN_TOKEN',
  'ADMIN_TOKEN'
];

const SENSITIVE_KEY = /(?:token|authorization|secret|password|api[_-]?key|endpoint|auth|p256dh|vapid|private[_-]?key)/i;

function clean(value) {
  return String(value || '').trim();
}

function truncate(value, max = 80) {
  const raw = String(value || '');
  return raw.length > max ? raw.slice(0, max) : raw;
}

function last4(value) {
  const raw = clean(value);
  return raw ? raw.slice(-4) : '';
}

function redactKnownSecrets(text) {
  let safe = String(text || '');
  for (const key of SECRET_ENV_KEYS) {
    const value = clean(process.env[key]);
    if (value && value.length >= 4) safe = safe.split(value).join(`[${key.toLowerCase()}-redacted]`);
  }
  return safe;
}

function sanitizeString(text, max = 80) {
  let safe = redactKnownSecrets(String(text || ''));
  safe = safe.replace(/https?:\/\/[^\s]*\/push\/join\?t=[^\s]+/gi, '[push-join-url-redacted]');
  safe = safe.replace(/\/push\/join\?t=[^\s]+/gi, '/push/join?t=[redacted]');
  safe = safe.replace(/https?:\/\/clck\.ru\/[^\s]+/gi, '[clck-url-redacted]');
  safe = safe.replace(/([?&])(?:access_token|token|authorization|secret|password|api[_-]?key|endpoint|auth|p256dh|vapid|private[_-]?key)=([^\s&#]+)/gi, '$1[redacted-query-field]=[redacted]');
  safe = safe.replace(/\b(?:access_token|token|authorization|secret|password|api[_-]?key|endpoint|auth|p256dh|vapid|private[_-]?key)=([^\s&]+)/gi, (match) => match.replace(/=.*/, '=[redacted]'));
  return truncate(safe.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim(), max);
}

function sanitizeTextPreview(text) {
  return sanitizeString(text, 80);
}

function sanitizePath(value) {
  const raw = clean(value);
  if (!raw) return '';
  const queryIndex = raw.indexOf('?');
  const hashIndex = raw.indexOf('#');
  let pathname = raw;
  if (queryIndex >= 0 || hashIndex >= 0) {
    const cutAt = Math.min(...[queryIndex, hashIndex].filter((index) => index >= 0));
    pathname = raw.slice(0, cutAt);
  }
  const suffix = queryIndex >= 0 ? '?[redacted-query]' : '';
  return sanitizeString(`${pathname}${suffix}`, 120);
}

function normalizedCommandText(text) {
  const normalized = clean(text).replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return '';
  if (/^\/push(?:@[\w.:-]+)?(?:\s|$)/i.test(normalized)) return sanitizeString(normalized.split(/\s+/)[0], 80);
  if (new Set(['пуш', 'уведомления', 'включить уведомления']).has(normalized)) return normalized;
  return '';
}

function topLevelKeys(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body).slice(0, 20).map((key) => (SENSITIVE_KEY.test(key) ? '[redacted-key]' : sanitizeString(key, 60)));
}

function bodyType(body) {
  if (body === null) return 'null';
  if (Array.isArray(body)) return 'array';
  return typeof body;
}

function firstString(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
}

function pickMessage(body = {}) {
  if (!body || typeof body !== 'object') return null;
  if (body.message && typeof body.message === 'object') return body.message;
  if (body.data && typeof body.data === 'object' && body.data.message && typeof body.data.message === 'object') return body.data.message;
  if (body.callback && typeof body.callback === 'object' && body.callback.message && typeof body.callback.message === 'object') return body.callback.message;
  if (body.data && typeof body.data === 'object' && body.data.callback && typeof body.data.callback === 'object' && body.data.callback.message && typeof body.data.callback.message === 'object') return body.data.callback.message;
  return null;
}

function pickCallback(body = {}) {
  if (!body || typeof body !== 'object') return null;
  if (body.callback && typeof body.callback === 'object') return body.callback;
  return body.data && typeof body.data === 'object' && body.data.callback && typeof body.data.callback === 'object' ? body.data.callback : null;
}

function pickCallbackPayload(body = {}, callback = null) {
  const cb = callback || pickCallback(body);
  if (!cb || typeof cb !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(cb, 'payload')) return cb.payload;
  if (Object.prototype.hasOwnProperty.call(cb, 'data')) return cb.data;
  if (Object.prototype.hasOwnProperty.call(cb, 'value')) return cb.value;
  if (Object.prototype.hasOwnProperty.call(cb, 'callback_data')) return cb.callback_data;
  if (Object.prototype.hasOwnProperty.call(cb, 'callbackData')) return cb.callbackData;
  return '';
}

function pickCallbackId(callback = null) {
  if (!callback || typeof callback !== 'object') return '';
  return firstString(callback.callback_id, callback.callbackId, callback.id);
}

function pickSender(message = null, callback = null) {
  return (message && (message.sender || message.from || message.user)) || (callback && (callback.user || callback.sender || callback.from)) || null;
}

function pickRecipient(message = null) {
  return message && (message.recipient || message.chat) || null;
}

function payloadText(payload) {
  if (typeof payload === 'string' || typeof payload === 'number') return String(payload || '');
  if (payload && typeof payload === 'object') return firstString(payload.text, payload.command, payload.raw, payload.action);
  return '';
}

function pickText(body = {}, message = null, callback = null) {
  return firstString(
    message && message.body && message.body.text,
    message && message.text,
    body && body.text,
    body && body.message && body.message.text,
    body && body.message && body.message.body && body.message.body.text,
    body && body.data && body.data.message && body.data.message.text,
    body && body.data && body.data.message && body.data.message.body && body.data.message.body.text,
    callback && callback.message && callback.message.body && callback.message.body.text,
    callback && callback.message && callback.message.text,
    payloadText(callback && (callback.payload ?? callback.data))
  );
}

function pickAction(body = {}, callback = null) {
  const payload = callback && callback.payload;
  if (payload && typeof payload === 'object') return firstString(payload.action, payload.raw, body && body.action);
  return firstString(body && body.action, payload);
}

function safeEvent(input = {}) {
  const req = input.req || {};
  const body = input.body !== undefined ? input.body : req.body;
  const message = pickMessage(body);
  const callback = pickCallback(body);
  const sender = pickSender(message, callback);
  const recipient = pickRecipient(message);
  const text = pickText(body, message, callback);
  const chatTitle = firstString(recipient && recipient.title, recipient && recipient.name, message && message.chat_title);
  const senderUserId = firstString(sender && (sender.user_id || sender.userId || sender.id), body && body.user_id);
  const chatId = firstString(recipient && (recipient.chat_id || recipient.chatId || recipient.id), message && message.chat_id, body && body.chat_id);

  return {
    at: input.at || new Date().toISOString(),
    method: sanitizeString(input.method || req.method, 12),
    path: sanitizePath(input.path || req.originalUrl || req.path || req.url),
    contentType: sanitizeString(input.contentType || (typeof req.get === 'function' ? req.get('content-type') : ''), 80),
    bodyType: bodyType(body),
    topLevelKeys: topLevelKeys(body),
    updateType: sanitizeString(firstString(body && (body.update_type || body.updateType || body.type)), 80),
    action: sanitizeString(pickAction(body, callback), 80),
    hasMessage: Boolean(message),
    hasCallback: Boolean(callback),
    hasText: Boolean(clean(text)),
    textPreview: sanitizeTextPreview(text),
    normalizedText: normalizedCommandText(text),
    matchedPushCommand: Boolean(groupPushOnboarding.isGroupPushCommandText(text)),
    hasSender: Boolean(sender),
    hasSenderUserId: Boolean(senderUserId),
    senderUserIdLast4: last4(senderUserId),
    hasRecipient: Boolean(recipient),
    hasChat: Boolean(recipient || chatId),
    hasChatId: Boolean(chatId),
    chatIdLast4: last4(chatId),
    chatTitlePreview: sanitizeTextPreview(chatTitle),
    routeStage: 'http_webhook_edge',
    handedToBot: Boolean(input.handedToBot),
    botResultKind: sanitizeString(input.botResultKind, 80),
    errorCode: sanitizeString(input.errorCode, 80)
  };
}

function record(input = {}) {
  const req = input.req || {};
  const body = input.body !== undefined ? input.body : req.body;
  const callback = pickCallback(body);
  const event = safeEvent(input);
  const callbackPayload = pickCallbackPayload(body, callback);
  const startedAt = Date.now();
  Object.defineProperty(event, '_seq', { value: ++seq, enumerable: false, configurable: false });
  Object.defineProperty(event, '_pr246Payload', { value: callbackPayload, enumerable: false, configurable: false });
  Object.defineProperty(event, '_pr246StartedAt', { value: startedAt, enumerable: false, configurable: false });
  events.push(event);
  if (events.length > LIMIT) events.splice(0, events.length - LIMIT);
  if (event.hasCallback) {
    try {
      rootMenuLiveParityTrace.record('webhook_edge_received', {
        updateType: event.updateType,
        hasCallback: event.hasCallback,
        hasMessage: event.hasMessage,
        hasUserId: event.hasSenderUserId,
        hasCallbackId: Boolean(pickCallbackId(callback)),
        payload: callbackPayload,
        messagePresentSource: event.hasMessage ? 'http_webhook_edge' : '',
        textPreview: event.textPreview,
        handlerName: 'index.webhook.edge',
        resultKind: 'received'
      });
    } catch {}
  }
  return event;
}

function update(event, patch = {}) {
  if (!event || !events.includes(event)) return null;
  if (Object.prototype.hasOwnProperty.call(patch, 'handedToBot')) event.handedToBot = Boolean(patch.handedToBot);
  if (Object.prototype.hasOwnProperty.call(patch, 'botResultKind')) event.botResultKind = sanitizeString(patch.botResultKind, 80);
  if (Object.prototype.hasOwnProperty.call(patch, 'errorCode')) event.errorCode = sanitizeString(patch.errorCode, 80);
  if (event.hasCallback) {
    try {
      rootMenuLiveParityTrace.record('handler_returned', {
        updateType: event.updateType,
        hasCallback: event.hasCallback,
        hasMessage: event.hasMessage,
        hasUserId: event.hasSenderUserId,
        hasCallbackId: false,
        payload: event._pr246Payload || { action: event.action },
        messagePresentSource: event.hasMessage ? 'http_webhook_edge' : '',
        textPreview: event.textPreview,
        handlerName: 'index.webhook.edge',
        resultKind: event.botResultKind || 'handler_returned',
        errorCode: event.errorCode || '',
        totalMs: Date.now() - Number(event._pr246StartedAt || Date.now())
      });
    } catch {}
  }
  return publicEvent(event);
}

function publicEvent(event) {
  const { _seq, _pr246Payload, _pr246StartedAt, ...safe } = event || {};
  return { ...safe, topLevelKeys: Array.isArray(safe.topLevelKeys) ? safe.topLevelKeys.slice(0, 20) : [] };
}

function clear() {
  events.splice(0, events.length);
}

function list(limit = LIMIT) {
  const requested = Math.max(0, Math.min(LIMIT, Number(limit || LIMIT) || LIMIT));
  return events.slice(-requested).map(publicEvent);
}

function summary(limit = LIMIT) {
  return { count: events.length, latest: list(limit) };
}

function renderHtml(diagnostics = summary()) {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const latest = Array.isArray(diagnostics.latest) ? diagnostics.latest : [];
  const cards = latest.slice().reverse().map((event) => `
    <article class="card">
      <div class="meta">${esc(event.at)} · ${esc(event.method)} ${esc(event.path)}</div>
      <h2>${esc(event.updateType || 'unknown')} ${event.matchedPushCommand ? '<span class="ok">push</span>' : ''}</h2>
      <p><b>text:</b> ${esc(event.textPreview || '—')}</p>
      <dl>
        <dt>handedToBot</dt><dd>${esc(event.handedToBot)}</dd>
        <dt>botResultKind</dt><dd>${esc(event.botResultKind || '—')}</dd>
        <dt>sender</dt><dd>${event.hasSenderUserId ? `…${esc(event.senderUserIdLast4)}` : '—'}</dd>
        <dt>chat</dt><dd>${event.hasChatId ? `…${esc(event.chatIdLast4)}` : '—'} ${esc(event.chatTitlePreview || '')}</dd>
        <dt>keys</dt><dd>${esc((event.topLevelKeys || []).join(', '))}</dd>
      </dl>
    </article>`).join('') || '<p>No webhook edge events recorded yet.</p>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MAX webhook edge debug</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#f6f7f9;color:#111;padding:16px;line-height:1.35}
    header{position:sticky;top:0;background:#f6f7f9;padding:8px 0 14px;border-bottom:1px solid #ddd}
    h1{font-size:22px;margin:0 0 8px}.meta{color:#666;font-size:13px}.card{background:white;border:1px solid #ddd;border-radius:14px;padding:14px;margin:14px 0;box-shadow:0 1px 2px #0001}
    h2{font-size:17px;margin:6px 0}.ok{display:inline-block;background:#e7f8ed;color:#096b2d;border-radius:999px;padding:2px 8px;font-size:12px}
    dl{display:grid;grid-template-columns:120px 1fr;gap:6px;margin:0}dt{font-weight:700;color:#333}dd{margin:0;word-break:break-word}
  </style>
</head>
<body>
  <header>
    <h1>MAX webhook edge debug</h1>
    <div class="meta">generatedAt: ${esc(new Date().toISOString())}</div>
    <div class="meta">count: ${esc(diagnostics.count || 0)}</div>
  </header>
  ${cards}
</body>
</html>`;
}

module.exports = {
  LIMIT,
  record,
  update,
  clear,
  list,
  summary,
  renderHtml,
  sanitizeTextPreview,
  sanitizeString,
  sanitizePath,
  normalizedCommandText
};