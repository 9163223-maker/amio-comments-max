'use strict';

const config = require('../../config');
const core = require('../../adminkit-core-runtime');
const updateAdapter = require('./updateAdapter');
const maxSendAdapter = require('./maxSendAdapter');
const timingStore = require('./coreTimingStore');
const { answerCallback } = require('../../services/maxApi');

const RUNTIME = 'ADMINKIT-CORE-CALLBACK-BRIDGE-1.6-IDEMPOTENCY-ACTIVE-SCREEN';
const CALLBACK_TTL_MS = 2 * 60 * 1000;
const recentCallbacks = new Map();

function now() { return Date.now(); }
function clean(value) { return String(value ?? '').trim(); }
function safeJson(value) { if (!value) return {}; if (typeof value === 'object') return value; try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
function first(...values) { for (const value of values) { const s = clean(value); if (s) return s; } return ''; }
function callbackOf(update = {}) { return update.callback || update.data?.callback || update.message?.callback || update.update?.callback || null; }
function messageOf(update = {}) { const c = callbackOf(update) || {}; return update.message || update.data?.message || c.message || update.data?.callback?.message || null; }
function payloadOf(update = {}) { const c = callbackOf(update) || {}; return safeJson(c.payload || c.data || c.callback_data || c.value || update.payload || update.callback_payload || ''); }
function adminIdOf(update = {}) { const c = callbackOf(update) || {}; const m = messageOf(update) || {}; return first(c.user?.user_id, c.user?.id, c.sender?.user_id, c.sender?.id, update.user?.user_id, update.user?.id, update.sender?.user_id, update.sender?.id, m.sender?.user_id, m.sender?.id, update.user_id, update.userId); }
function callbackIdOf(update = {}) { const c = callbackOf(update) || {}; return first(c.callback_id, c.callbackId, c.id, update.callback_id, update.callbackId); }
function messageIdOf(update = {}) { const c = callbackOf(update) || {}; const m = messageOf(update) || {}; const body = m.body || {}; return first(c.message?.body?.mid, c.message?.mid, c.message?.message_id, c.message?.id, body.mid, body.message_id, body.messageId, m.mid, m.message_id, m.messageId, m.id); }
function chatIdOf(update = {}) { const c = callbackOf(update) || {}; const m = messageOf(update) || {}; return first(m.recipient?.chat_id, m.recipient?.id, c.message?.recipient?.chat_id, c.message?.recipient?.id, m.chat_id, m.chat?.id, update.chat_id); }
function textOf(update = {}) { const m = messageOf(update) || {}; const body = m.body || {}; return first(update.text, update.messageText, body.text, m.text, m.message?.text, update.body?.text); }
function isCallbackUpdate(update = {}) { const type = clean(update.update_type || update.type).toLowerCase(); return type === 'message_callback' || !!callbackOf(update); }
function isTextUpdate(update = {}) { if (isCallbackUpdate(update)) return false; const type = clean(update.update_type || update.type).toLowerCase(); return type === 'message_created' || !!messageOf(update) || !!textOf(update); }
function isStartOrMenuText(text = '') { return /^\/?start(?:\s|$)/i.test(clean(text)) || /^меню$/i.test(clean(text)) || /^старт$/i.test(clean(text)); }

function pruneRecentCallbacks(ts = now()) {
  for (const [key, item] of recentCallbacks.entries()) {
    if (!item?.at || ts - item.at > CALLBACK_TTL_MS) recentCallbacks.delete(key);
  }
}

function idempotencyKey(update = {}, callbackId = '') {
  const payload = payloadOf(update);
  const adminId = adminIdOf(update);
  const messageId = messageIdOf(update);
  const route = clean(payload.r);
  if (callbackId) return `cb:${callbackId}`;
  if (adminId && messageId && route) return `fallback:${adminId}:${messageId}:${route}:${JSON.stringify(payload).slice(0, 300)}`;
  return '';
}

function markCallbackStarted(update = {}, callbackId = '') {
  const key = idempotencyKey(update, callbackId);
  if (!key) return { duplicate: false, key: '', skipped: true };
  const ts = now();
  pruneRecentCallbacks(ts);
  const existing = recentCallbacks.get(key);
  if (existing && ts - existing.at <= CALLBACK_TTL_MS) return { duplicate: true, key, firstSeenAt: existing.at, ageMs: ts - existing.at };
  recentCallbacks.set(key, { at: ts });
  return { duplicate: false, key, firstSeenAt: ts, ageMs: 0 };
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
  return { ok: true, kind: 'callback', payload, route, adminId, gate, text: '' };
}

async function shouldTryFlowTextInput(update = {}) {
  if (!isTextUpdate(update)) return { ok: false, reason: 'not_text_update' };
  const text = textOf(update);
  if (!text) return { ok: false, reason: 'text_missing' };
  if (isStartOrMenuText(text)) return { ok: false, reason: 'start_or_menu_text_ignored' };
  const adminId = adminIdOf(update);
  if (!adminId) return { ok: false, reason: 'admin_id_missing_for_text' };
  const gate = maxSendAdapter.deliveryGate(adminId);
  if (!gate.ok) return { ok: false, reason: gate.reason || 'core_canary_gate_closed_for_text', adminId, gate };
  let session = null;
  try { session = await require('./stateManager').getSession(adminId); } catch (error) { return { ok: false, reason: 'session_read_failed', adminId, error: error?.message || String(error) }; }
  const activeFlow = clean(session?.active_flow || session?.activeFlow);
  const activeStep = clean(session?.active_step || session?.activeStep);
  if (!activeFlow || !['input_title', 'input_url'].includes(activeStep)) return { ok: false, reason: 'no_active_core_text_step', adminId, activeFlow, activeStep };
  return {
    ok: true,
    kind: 'flow-text-input',
    payload: { flowId: activeFlow },
    route: 'flow.input',
    adminId,
    gate,
    text,
    session,
    activeMessageId: clean(session?.active_message_id || session?.activeMessageId)
  };
}

function isKnownAck400(error) {
  const message = String(error?.message || error || '');
  return message.includes('MAX API 400') && message.includes('/answers');
}

async function fastAck(callbackId = '') {
  const started = now();
  if (!callbackId) return { ok: true, skipped: true, ignored: true, reason: 'callback_id_missing', ms: 0 };
  try {
    await answerCallback({ botToken: config.botToken, callbackId, notification: '' });
    return { ok: true, ms: now() - started };
  } catch (error) {
    if (isKnownAck400(error)) return { ok: true, ignored: true, reason: 'max_answers_400_ignored', ms: now() - started };
    return { ok: false, error: error?.message || String(error), ms: now() - started };
  }
}

async function tryHandleUpdate(update = {}) {
  const started = now();
  let decision = shouldTry(update);
  if (!decision.ok && decision.reason === 'not_callback') decision = await shouldTryFlowTextInput(update);
  if (!decision.ok) return { handled: false, runtimeVersion: RUNTIME, ...decision, timing: { totalMs: now() - started } };

  const activeMessageId = decision.activeMessageId || messageIdOf(update);
  const chatId = chatIdOf(update);
  const callbackId = decision.kind === 'callback' ? callbackIdOf(update) : '';
  const idem = decision.kind === 'callback' ? markCallbackStarted(update, callbackId) : { duplicate: false, skipped: true };
  if (idem.duplicate) {
    const ack = await fastAck(callbackId);
    const timing = { totalMs: now() - started, ackMs: ack.ms || 0, ackOk: ack.ok === true, duplicateIgnored: true };
    timingStore.push({ kind: 'callback-duplicate', route: decision.route, adminId: decision.adminId, deliveryMode: 'idempotent-duplicate-no-send', sent: false, timing, gate: decision.gate, note: 'duplicate callback ignored by 1.31 idempotency guard' });
    return { handled: true, ok: true, duplicate: true, runtimeVersion: RUNTIME, route: decision.route, adminId: decision.adminId, deliveryMode: 'idempotent-duplicate-no-send', sent: false, timing };
  }

  const ack = decision.kind === 'callback' ? await fastAck(callbackId) : { ok: true, skipped: true, ignored: true, reason: 'text_input_no_callback_ack', ms: 0 };
  const afterAck = now();

  const ctx = updateAdapter.toContext({ ...update, payload: JSON.stringify(decision.payload || {}), text: decision.text || decision.route, route: decision.route, adminId: decision.adminId, userId: decision.adminId, message: messageOf(update) || {} }, { route: decision.route, adminId: decision.adminId, planCode: clean(update.planCode || update.plan || 'free'), text: decision.text || '' });

  const screen = await core.dispatch(ctx);
  const afterRender = now();
  const preferEdit = decision.kind !== 'flow-text-input';
  const delivery = await maxSendAdapter.deliver({ botToken: config.botToken, adminId: decision.adminId, userId: decision.adminId, chatId, activeMessageId: preferEdit ? activeMessageId : '', callbackId: '', screen, preferEdit, dryRun: false });
  const finished = now();
  const timing = { totalMs: finished - started, ackMs: ack.ms || 0, beforeAckMs: afterAck - started, renderMs: afterRender - afterAck, deliveryMs: finished - afterRender, ackOk: ack.ok === true, ackIgnored: ack.ignored === true, ackReason: ack.reason || '', ackError: ack.ok === true ? '' : (ack.error || ''), idempotencyKey: idem.key || '' };
  timingStore.push({ kind: decision.kind === 'flow-text-input' ? 'text-input' : 'callback', route: ctx.route, adminId: decision.adminId, deliveryMode: delivery.mode, sent: delivery.mode !== 'dry-run-no-send', timing, gate: delivery.gate || decision.gate, note: decision.kind === 'flow-text-input' ? 'send new active core message below user text input' : (activeMessageId ? 'edit existing message' : 'send new message fallback') });

  return { handled: true, ok: true, runtimeVersion: RUNTIME, coreRuntimeVersion: core.RUNTIME, kind: decision.kind, route: ctx.route, adminId: decision.adminId, activeMessageId: delivery.messageId || activeMessageId, chatId, deliveryMode: delivery.mode, sent: delivery.mode !== 'dry-run-no-send', gate: delivery.gate || decision.gate, timing };
}

async function tryHandleExpress(req = {}) { return tryHandleUpdate(req.body || {}); }

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, coreRuntimeVersion: core.RUNTIME, policy: 'callbacks_edit_active_screen_text_inputs_send_new_screen_and_duplicate_callbacks_are_ignored', gate: { sendEnabled: maxSendAdapter.sendEnabled(), canaryAll: maxSendAdapter.canaryAllEnabled(), allowedAdminsConfigured: maxSendAdapter.allowedAdmins().length }, timingStore: timingStore.selfTest(), safety: { requiresPayloadR: true, requiresCanaryAdmin: true, requiresCoreSendEnabled: true, ignoresNonCoreCallbacks: true, handlesCoreFlowTextInput: true, textInputRequiresActiveFlow: true, textInputRequiresActiveInputStep: true, textInputUsesActiveCoreMessage: true, textInputSendsNewActiveScreenBelowUserMessage: true, callbacksEditExistingActiveScreen: true, leavesLegacyFallbackToOuterRouter: true, fastAckBeforeRender: true, timingDiagnostics: true, timingStoreReady: true, ack400Silent: true, callbackIdempotencyReady: true, duplicateCallbacksNoSend: true, idempotencyTtlMs: CALLBACK_TTL_MS } };
}

module.exports = { RUNTIME, tryHandleUpdate, tryHandleExpress, shouldTry, shouldTryFlowTextInput, markCallbackStarted, selfTest };
