'use strict';

const LIMIT = 50;
const events = [];

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function last4(value) {
  const safe = clean(value).replace(/[^A-Za-z0-9_-]/g, '');
  return safe ? safe.slice(-4) : '';
}

function redactUnsafeText(value) {
  let text = clean(value);
  if (!text) return '';
  text = text.replace(/https?:\/\/clck\.ru\/\S+/gi, '[short-link-redacted]');
  text = text.replace(/https?:\/\/[^\s]*\/push\/join\?t=[^\s]+/gi, '[push-join-url-redacted]');
  text = text.replace(/\/push\/join\?t=[^\s]+/gi, '/push/join?t=[redacted]');
  text = text.replace(/(BOT_TOKEN|MAX_BOT_TOKEN|PUSH_PAIRING_SECRET|WEB_PUSH_PRIVATE_KEY)[A-Za-z0-9_:\-.]*/gi, '[secret-redacted]');
  text = text.replace(/(endpoint|p256dh|auth)\s*[:=]\s*[^\s,;}]+/gi, '$1=[redacted]');
  text = text.replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_.~-]{24,}/g, '[token-redacted]');
  text = text.replace(/[A-Za-z0-9_=-]{48,}/g, '[long-value-redacted]');
  return text.slice(0, 120);
}

function safeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.floor(number), 100000) : 0;
}

function safeEvent(input = {}) {
  const source = clean(input.source).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80) || 'unknown';
  const errorCode = clean(input.errorCode || input.error || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80);
  const skippedReason = clean(input.skippedReason || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80);
  return {
    source,
    chatIdLast4: last4(input.chatId || input.chatIdLast4),
    channelIdLast4: last4(input.channelId || input.channelIdLast4),
    messageIdLast4: last4(input.messageId || input.messageIdLast4),
    totalDevices: safeCount(input.totalDevices),
    activeDeviceCount: safeCount(input.activeDeviceCount),
    success: safeCount(input.success),
    failed: safeCount(input.failed),
    skippedReason,
    errorCode,
    titlePreview: redactUnsafeText(input.titlePreview || input.title),
    bodyPreview: redactUnsafeText(input.bodyPreview || input.body || input.messageText),
    timestamp: clean(input.timestamp).slice(0, 40) || nowIso()
  };
}

function record(event = {}) {
  const item = safeEvent(event);
  events.push(item);
  while (events.length > LIMIT) events.shift();
  return item;
}

function summary(limit = LIMIT) {
  const requested = Number(limit || LIMIT);
  const safeLimit = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), LIMIT) : LIMIT;
  return { count: events.length, latest: events.slice(-safeLimit) };
}

function clear() {
  events.length = 0;
}

module.exports = { record, summary, clear };
