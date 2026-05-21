'use strict';

const accountCabinet = require('./accountCabinet');
const webhookContext = require('./webhookContext');

const RUNTIME = 'CC8.0.1-ACCOUNT-CONTEXT-FALLBACK';
const ACCOUNT_ACTIONS = new Set([
  'admin_section_tariffs',
  'billing_current_plan',
  'billing_limits',
  'billing_referral',
  'billing_upgrade'
]);

function clean(value) {
  return String(value || '').trim();
}

function getMessage(update = {}) {
  return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || null;
}

function getCallback(update = {}) {
  return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || null;
}

function parseCallbackPayload(callback = {}) {
  const raw = callback?.payload ?? callback?.data ?? callback?.value ?? callback?.callback_data ?? callback?.callbackData ?? '';
  if (raw && typeof raw === 'object') return raw;
  const text = clean(raw);
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { action: text, raw: text }; }
}

function getActionFromUpdate(update = {}) {
  const callback = getCallback(update);
  if (!callback) return '';
  const payload = parseCallbackPayload(callback);
  return clean(payload.action || payload.raw);
}

function isAccountAction(action = '') {
  return ACCOUNT_ACTIONS.has(clean(action));
}

function getChatType(message = {}) {
  return clean(message?.recipient?.chat_type || message?.recipient?.type || message?.chat_type || message?.chat?.type).toLowerCase();
}

function getChatId(message = {}) {
  return clean(message?.recipient?.chat_id || message?.recipient?.id || message?.chat_id || message?.chat?.id);
}

function isChannelMessage(message = {}) {
  const id = getChatId(message);
  return getChatType(message) === 'channel' || /^-/.test(id);
}

function shouldHandleAccountUpdate(update = {}) {
  const action = getActionFromUpdate(update);
  if (!isAccountAction(action)) return { ok: false, reason: 'not_account_action', action };
  const message = getMessage(update);
  if (isChannelMessage(message)) return { ok: false, reason: 'channel_message_blocked', action };
  return { ok: true, action };
}

async function resolveContext(update = {}, context = {}) {
  if (context?.ok && context?.user) return context;
  const retry = await webhookContext.ensureWebhookUserContext(update, { throwOnError: false });
  return retry;
}

async function buildAccountScreenForUpdate({ update = {}, context = {}, config = {} } = {}) {
  const decision = shouldHandleAccountUpdate(update);
  if (!decision.ok) return { ...decision, screen: null, runtimeVersion: RUNTIME };
  const resolvedContext = await resolveContext(update, context).catch((error) => ({ ok: false, reason: 'context_retry_failed', error: error?.message || String(error) }));
  const screen = await accountCabinet.buildAccountScreen({ action: decision.action, context: resolvedContext?.ok ? resolvedContext : {}, config });
  return { ok: true, action: decision.action, screen, contextOk: Boolean(resolvedContext?.ok), contextReason: resolvedContext?.reason || '', runtimeVersion: RUNTIME };
}

module.exports = {
  RUNTIME,
  ACCOUNT_ACTIONS,
  getMessage,
  getCallback,
  parseCallbackPayload,
  getActionFromUpdate,
  isAccountAction,
  shouldHandleAccountUpdate,
  buildAccountScreenForUpdate
};
