'use strict';

const config = require('../../config');
const core = require('../../adminkit-core-runtime');
const updateAdapter = require('./updateAdapter');
const maxSendAdapter = require('./maxSendAdapter');

const RUNTIME = 'ADMINKIT-CORE-CALLBACK-BRIDGE-1.0-CANARY-ONLY';

function clean(value) {
  return String(value ?? '').trim();
}

function safeJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

function first(...values) {
  for (const value of values) {
    const s = clean(value);
    if (s) return s;
  }
  return '';
}

function callbackOf(update = {}) {
  return update.callback || update.data?.callback || update.message?.callback || update.update?.callback || null;
}

function messageOf(update = {}) {
  const c = callbackOf(update) || {};
  return update.message || update.data?.message || c.message || update.data?.callback?.message || null;
}

function payloadOf(update = {}) {
  const c = callbackOf(update) || {};
  return safeJson(c.payload || c.data || c.callback_data || c.value || update.payload || update.callback_payload || '');
}

function adminIdOf(update = {}) {
  const c = callbackOf(update) || {};
  const m = messageOf(update) || {};
  return first(
    c.user?.user_id,
    c.user?.id,
    c.sender?.user_id,
    c.sender?.id,
    update.user?.user_id,
    update.user?.id,
    update.sender?.user_id,
    update.sender?.id,
    m.sender?.user_id,
    m.sender?.id,
    update.user_id,
    update.userId
  );
}

function callbackIdOf(update = {}) {
  const c = callbackOf(update) || {};
  return first(c.callback_id, c.callbackId, c.id, update.callback_id, update.callbackId);
}

function messageIdOf(update = {}) {
  const c = callbackOf(update) || {};
  const m = messageOf(update) || {};
  const body = m.body || {};
  return first(c.message?.body?.mid, c.message?.mid, c.message?.message_id, c.message?.id, body.mid, body.message_id, body.messageId, m.mid, m.message_id, m.messageId, m.id);
}

function chatIdOf(update = {}) {
  const c = callbackOf(update) || {};
  const m = messageOf(update) || {};
  return first(m.recipient?.chat_id, m.recipient?.id, c.message?.recipient?.chat_id, c.message?.recipient?.id, m.chat_id, m.chat?.id, update.chat_id);
}

function isCallbackUpdate(update = {}) {
  const type = clean(update.update_type || update.type).toLowerCase();
  return type === 'message_callback' || !!callbackOf(update);
}

function shouldTry(update = {}) {
  if (!isCallbackUpdate(update)) return { ok: false, reason: 'not_callback' };
  const payload = payloadOf(update);
  const route = clean(payload.r);
  if (!route) return { ok: false, reason: 'payload_r_missing', payload };
  const adminId = adminIdOf(update);
  if (!adminId) return { ok: false, reason: 'admin_id_missing', payload };
  const gate = maxSendAdapter.deliveryGate(adminId);
  if (!gate.ok) return { ok: false, reason: gate.reason || 'core_canary_gate_closed', payload, adminId, gate };
  return { ok: true, payload, route, adminId, gate };
}

async function tryHandleUpdate(update = {}) {
  const decision = shouldTry(update);
  if (!decision.ok) return { handled: false, runtimeVersion: RUNTIME, ...decision };

  const activeMessageId = messageIdOf(update);
  const chatId = chatIdOf(update);
  const callbackId = callbackIdOf(update);
  const ctx = updateAdapter.toContext({
    ...update,
    payload: JSON.stringify(decision.payload || {}),
    text: decision.route,
    route: decision.route,
    adminId: decision.adminId,
    userId: decision.adminId,
    message: messageOf(update) || {}
  }, {
    route: decision.route,
    adminId: decision.adminId,
    planCode: clean(update.planCode || update.plan || 'free'),
    text: ''
  });

  const screen = await core.dispatch(ctx);
  const delivery = await maxSendAdapter.deliver({
    botToken: config.botToken,
    adminId: decision.adminId,
    userId: decision.adminId,
    chatId,
    activeMessageId,
    callbackId,
    screen,
    preferEdit: Boolean(activeMessageId),
    dryRun: false
  });

  return {
    handled: true,
    ok: true,
    runtimeVersion: RUNTIME,
    coreRuntimeVersion: core.RUNTIME,
    route: ctx.route,
    adminId: decision.adminId,
    activeMessageId,
    chatId,
    deliveryMode: delivery.mode,
    sent: delivery.mode !== 'dry-run-no-send',
    gate: delivery.gate || decision.gate
  };
}

async function tryHandleExpress(req = {}) {
  return tryHandleUpdate(req.body || {});
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    coreRuntimeVersion: core.RUNTIME,
    policy: 'handle_only_callback_payload_r_for_canary_admins_no_legacy_fallback_inside_bridge',
    gate: {
      sendEnabled: maxSendAdapter.sendEnabled(),
      canaryAll: maxSendAdapter.canaryAllEnabled(),
      allowedAdminsConfigured: maxSendAdapter.allowedAdmins().length
    },
    safety: {
      requiresPayloadR: true,
      requiresCanaryAdmin: true,
      requiresCoreSendEnabled: true,
      ignoresNonCoreCallbacks: true,
      leavesLegacyFallbackToOuterRouter: true
    }
  };
}

module.exports = { RUNTIME, tryHandleUpdate, tryHandleExpress, shouldTry, selfTest };
