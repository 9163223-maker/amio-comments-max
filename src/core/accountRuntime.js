'use strict';

const accountScreens = require('../../features/account-screens-pr106');
const clientAccess = require('../../services/clientAccessService');
const webhookContext = require('./webhookContext');

const RUNTIME = clientAccess.RUNTIME;
const ACCOUNT_ACTIONS = new Set([
  'admin_section_tariffs',
  'billing_current_plan',
  'billing_limits',
  'billing_referral',
  'billing_upgrade',
  'account_home',
  'account_my_access',
  'account_activate_code',
  'account_payment',
  'account_limits',
  'account_channels',
  'account_support',
  'account_capabilities'
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

function getMaxUserId(update = {}, context = {}) {
  const callback = getCallback(update) || {};
  const message = getMessage(update) || {};
  return clean(context?.user?.maxUserId || context?.user?.userId || callback?.user?.user_id || callback?.user?.id || callback?.sender?.user_id || callback?.sender?.id || update?.user?.user_id || update?.user?.id || update?.sender?.user_id || update?.sender?.id || message?.sender?.user_id || message?.sender?.id || message?.user?.user_id || message?.user?.id || message?.user_id || message?.userId);
}

async function buildAccountScreenForUpdate({ update = {}, context = {}, config = {} } = {}) {
  const decision = shouldHandleAccountUpdate(update);
  if (!decision.ok) return { ...decision, screen: null, runtimeVersion: RUNTIME };
  const maxUserId = getMaxUserId(update, context);
  const screen = accountScreens.screenForAction(decision.action, maxUserId);
  return { ok: Boolean(screen), action: decision.action, screen, contextOk: Boolean(maxUserId), contextReason: maxUserId ? '' : 'max_user_id_missing', runtimeVersion: RUNTIME };
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
  getMaxUserId,
  buildAccountScreenForUpdate
};
