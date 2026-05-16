'use strict';

const updateAdapter = require('./updateAdapter');
const stateManager = require('./stateManager');
const maxSendAdapter = require('./maxSendAdapter');
const core = require('../../adminkit-core-runtime');

const RUNTIME = 'ADMINKIT-CORE-CANARY-WEBHOOK-1.0-ISOLATED-NO-LEGACY-FALLBACK';
const DEFAULT_PATH = '/webhook/adminkit-core-canary';

function cleanValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try { return decodeURIComponent(raw.replace(/\+/g, ' ')).trim(); } catch { return raw.replace(/\+/g, ' ').trim(); }
}

function safeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanValue(value);
    if (cleaned) return cleaned;
  }
  return '';
}

function getMessage(update = {}) {
  return update.message || update.data?.message || update.callback?.message || update.data?.callback?.message || null;
}

function getCallback(update = {}) {
  return update.callback || update.data?.callback || update.message?.callback || null;
}

function getMessageBody(message = {}) {
  return message?.body || {};
}

function getMessageText(message = {}) {
  const body = getMessageBody(message);
  return firstValue(body.text, message.text, message.message?.text);
}

function getMessageId(message = {}) {
  const body = getMessageBody(message);
  return firstValue(body.mid, body.message_id, body.messageId, message.mid, message.message_id, message.messageId, message.id);
}

function getCallbackPayload(callback = {}) {
  return firstValue(callback.payload, callback.data, callback.value, callback.callback_data);
}

function getCallbackId(callback = {}) {
  return firstValue(callback.callback_id, callback.id, callback.callbackId);
}

function getSenderUserId(message = {}) {
  return firstValue(message.sender?.user_id, message.sender?.id, message.user_id, message.from?.id);
}

function getCallbackUserId(update = {}, callback = {}) {
  return firstValue(callback.user?.user_id, callback.user?.id, callback.sender?.user_id, callback.sender?.id, update.user?.user_id, update.user?.id, update.sender?.user_id, update.sender?.id);
}

function getChatId(message = {}) {
  return firstValue(message.recipient?.chat_id, message.recipient?.id, message.chat_id, message.chat?.id);
}

function extractTarget(update = {}) {
  const callback = getCallback(update);
  const message = getMessage(update);
  const adminId = firstValue(getCallbackUserId(update, callback), getSenderUserId(message), update.user_id, update.userId, 'debug-admin');
  return {
    adminId,
    userId: adminId,
    chatId: getChatId(message),
    activeMessageId: getMessageId(message),
    callbackId: getCallbackId(callback)
  };
}

function parseCallbackPayload(update = {}) {
  return safeJson(getCallbackPayload(getCallback(update)));
}

async function routeForIncomingUpdate(update = {}, target = {}) {
  const updateType = cleanValue(update.update_type || update.type);
  const callbackPayload = parseCallbackPayload(update);
  const message = getMessage(update);
  const text = getMessageText(message);

  if (updateType === 'message_callback' || Object.keys(callbackPayload).length) {
    if (callbackPayload.r) return { route: String(callbackPayload.r), payload: callbackPayload, text: '' };
    return { route: 'core.unsupported_callback', payload: callbackPayload, text: '' };
  }

  if (updateType === 'bot_started') return { route: 'main.home', payload: {}, text: '/start' };
  if (/^\/?start(?:\s|$)/i.test(text) || /^меню$/i.test(text)) return { route: 'main.home', payload: {}, text };

  const session = await stateManager.getSession(target.adminId);
  if (session?.active_flow && ['input_title', 'input_url'].includes(String(session.active_step || ''))) {
    return { route: 'flow.input', payload: { flowId: session.active_flow }, text };
  }

  if (!text && !message) return { route: 'core.no_message', payload: {}, text: '' };
  if (text) return { route: text, payload: {}, text };
  return { route: 'core.unsupported_update', payload: {}, text: '' };
}

function canaryAccessOk(req = {}) {
  const expected = cleanValue(process.env.ADMINKIT_CORE_WEBHOOK_TOKEN || '');
  if (!expected) return true;
  const provided = cleanValue(req.query?.token || req.get?.('x-adminkit-core-token') || '');
  return provided === expected;
}

async function buildScreenFromUpdate(update = {}, config = {}) {
  const target = extractTarget(update);
  const routed = await routeForIncomingUpdate(update, target);

  if (routed.route === 'core.no_message' || routed.route === 'core.unsupported_update' || routed.route === 'core.unsupported_callback') {
    return { ok: true, skipped: true, reason: routed.route, runtimeVersion: RUNTIME, target, routed };
  }

  const ctx = updateAdapter.toContext({
    ...update,
    payload: JSON.stringify(routed.payload || {}),
    text: routed.text || routed.route,
    route: routed.route,
    adminId: target.adminId,
    userId: target.userId,
    message: getMessage(update) || {}
  }, {
    route: routed.route,
    adminId: target.adminId,
    planCode: String(update.planCode || update.plan || 'free'),
    text: routed.text
  });

  const screen = await core.dispatch(ctx);
  return { ok: true, runtimeVersion: RUNTIME, coreRuntimeVersion: core.RUNTIME, target, routed, ctx, screen };
}

async function preview(update = {}, config = {}) {
  const built = await buildScreenFromUpdate(update, config);
  if (built.skipped) return built;
  const delivery = await maxSendAdapter.deliver({
    botToken: config.botToken,
    adminId: built.target.adminId,
    userId: built.target.userId,
    chatId: built.target.chatId,
    activeMessageId: built.target.activeMessageId,
    callbackId: built.target.callbackId,
    screen: built.screen,
    preferEdit: Boolean(built.target.activeMessageId),
    dryRun: true
  });
  return { ok: true, runtimeVersion: RUNTIME, mode: 'core-canary-preview-dry-run', coreRuntimeVersion: core.RUNTIME, target: built.target, ctx: { route: built.ctx.route, adminId: built.ctx.adminId, text: built.ctx.text, payload: built.ctx.payload }, screen: built.screen, delivery };
}

async function handleWebhook(req, res, config = {}) {
  try {
    if (!canaryAccessOk(req)) return res.status(403).json({ ok: false, runtimeVersion: RUNTIME, error: 'core_canary_token_required' });
    const built = await buildScreenFromUpdate(req.body || {}, config);
    if (built.skipped) return res.status(200).json(built);
    const delivery = await maxSendAdapter.deliver({
      botToken: config.botToken,
      adminId: built.target.adminId,
      userId: built.target.userId,
      chatId: built.target.chatId,
      activeMessageId: built.target.activeMessageId,
      callbackId: built.target.callbackId,
      screen: built.screen,
      preferEdit: Boolean(built.target.activeMessageId),
      dryRun: false
    });
    return res.status(200).json({ ok: true, runtimeVersion: RUNTIME, coreRuntimeVersion: core.RUNTIME, route: built.ctx.route, deliveryMode: delivery.mode, deliveryGate: delivery.gate, sent: delivery.mode !== 'dry-run-no-send' });
  } catch (error) {
    console.error('[core-canary-webhook] error:', error?.message || error, error?.data || '');
    return res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error?.message || 'core_canary_webhook_failed' });
  }
}

function selfTest() {
  return {
    ok: typeof handleWebhook === 'function' && typeof preview === 'function' && maxSendAdapter.selfTest().ok === true,
    runtimeVersion: RUNTIME,
    path: process.env.ADMINKIT_CORE_WEBHOOK_PATH || DEFAULT_PATH,
    coreRuntimeVersion: core.RUNTIME,
    delivery: maxSendAdapter.selfTest(),
    safety: {
      isolatedFromLegacyBotJs: true,
      noLegacyFallback: true,
      doesNotAutoRegisterWebhook: true,
      realSendCanaryGated: true,
      optionalCanaryToken: true,
      supportsDryRunPreview: true,
      ignoresNonCoreCallbacks: true
    }
  };
}

module.exports = { RUNTIME, DEFAULT_PATH, handleWebhook, preview, selfTest, extractTarget, routeForIncomingUpdate };
