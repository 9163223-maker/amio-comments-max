'use strict';

const groupPushOnboarding = require('./groupPushOnboardingService');

const LIMIT = 30;
const events = [];

const SECRET_ENV_KEYS = [
  'BOT_TOKEN',
  'MAX_BOT_TOKEN',
  'PUSH_ADMIN_TOKEN',
  'PUSH_SUBSCRIBE_TOKEN',
  'PUSH_PAIRING_SECRET',
  'WEB_PUSH_PRIVATE_KEY',
  'VAPID_PRIVATE_KEY',
  'WEBHOOK_SECRET',
  'ADMIN_TOKEN'
];

function clean(value) {
  return String(value || '').trim();
}

function truncate(value, max = 80) {
  const raw = String(value || '');
  return raw.length > max ? raw.slice(0, max) : raw;
}

function last4(value) {
  const raw = clean(value);
  if (!raw) return '';
  return raw.slice(-4);
}

function redactKnownSecrets(text) {
  let safe = String(text || '');
  for (const key of SECRET_ENV_KEYS) {
    const value = clean(process.env[key]);
    if (value && value.length >= 4) safe = safe.split(value).join(`[${key.toLowerCase()}-redacted]`);
  }
  return safe;
}

function sanitizeTextPreview(text) {
  let safe = redactKnownSecrets(String(text || ''));
  safe = safe.replace(/https?:\/\/[^\s]*\/push\/join\?t=[^\s]+/gi, '[push-join-url-redacted]');
  safe = safe.replace(/\/push\/join\?t=[^\s]+/gi, '/push/join?t=[redacted]');
  safe = safe.replace(/https?:\/\/clck\.ru\/[^\s]+/gi, '[clck-url-redacted]');
  safe = safe.replace(/(?:endpoint|auth|p256dh)=[^\s&]+/gi, '$1=[redacted]');
  return truncate(safe.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim(), 80);
}

function normalizedCommandText(text) {
  const normalized = clean(text).replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return '';
  if (/^\/push(?:@[\w.:-]+)?(?:\s|$)/i.test(normalized)) return truncate(normalized.split(/\s+/)[0], 80);
  if (new Set(['пуш', 'уведомления', 'включить уведомления']).has(normalized)) return normalized;
  return '';
}

function messageShape(message = null, callback = null) {
  if (callback) return callback.message ? 'callback_with_message' : 'callback_without_message';
  if (!message) return 'no_message';
  const parts = [];
  if (message.body) parts.push('body');
  if (message.sender || message.from) parts.push('sender');
  if (message.recipient || message.chat) parts.push('recipient');
  if (message.callback) parts.push('callback');
  return parts.length ? parts.join('+') : 'message';
}

function safeEvent(input = {}) {
  const text = String(input.text || '');
  const matchedPushCommand = Boolean(groupPushOnboarding.isGroupPushCommandText(text));
  const userId = clean(input.userId);
  const chatId = clean(input.chatId);
  let routeDecision = clean(input.routeDecision);
  if (!routeDecision) {
    if (matchedPushCommand && !userId) routeDecision = 'missing_user_id';
    else if (matchedPushCommand && !chatId) routeDecision = 'missing_chat_id';
    else if (matchedPushCommand) routeDecision = 'would_route_group_push';
    else routeDecision = 'non_command';
  }
  return {
    at: input.at || new Date().toISOString(),
    updateType: truncate(clean(input.updateType) || 'unknown', 64),
    messageShape: truncate(clean(input.messageShape) || 'unknown', 80),
    textPreview: sanitizeTextPreview(text),
    normalizedText: normalizedCommandText(text),
    matchedPushCommand,
    hasUserId: Boolean(userId),
    userIdLast4: last4(userId),
    hasChatId: Boolean(chatId),
    chatIdLast4: last4(chatId),
    chatType: truncate(clean(input.chatType), 40),
    chatTitlePreview: sanitizeTextPreview(clean(input.chatTitle)).slice(0, 80),
    routeCandidate: truncate(clean(input.routeCandidate) || (matchedPushCommand ? 'group_push_command' : 'unknown'), 80),
    routeDecision: truncate(routeDecision, 80),
    routeResult: truncate(clean(input.routeResult) || 'observed_only', 80),
    errorCode: truncate(clean(input.errorCode), 80),
    sentPrivate: Boolean(input.sentPrivate),
    freshLinkIssued: Boolean(input.freshLinkIssued),
    alreadyHadActiveDevice: Boolean(input.alreadyHadActiveDevice),
    commandDeleteAttempted: Boolean(input.commandDeleteAttempted),
    commandDeleteOk: Boolean(input.commandDeleteOk),
    commandDeleteFailedReason: truncate(sanitizeTextPreview(clean(input.commandDeleteFailedReason)), 80)
  };
}

function record(input = {}) {
  const event = safeEvent(input);
  events.push(event);
  if (events.length > LIMIT) events.splice(0, events.length - LIMIT);
  return event;
}

function clear() {
  events.splice(0, events.length);
}

function list(limit = LIMIT) {
  const requested = Math.max(0, Math.min(LIMIT, Number(limit || LIMIT) || LIMIT));
  return events.slice(-requested).map((event) => ({ ...event }));
}

function summary(limit = LIMIT) {
  return { count: events.length, latest: list(limit) };
}

module.exports = {
  LIMIT,
  messageShape,
  record,
  clear,
  list,
  summary,
  sanitizeTextPreview,
  normalizedCommandText
};
