'use strict';

// AdminKit Core -> MAX delivery adapter.
// This module is intentionally not wired into the legacy webhook yet.
// It converts Core screens into MAX-compatible message payloads and can deliver only when
// ADMINKIT_CORE_SEND_ENABLED=1 and the admin is explicitly allowed for canary.

const { sendMessage, editMessage, answerCallback } = require('../../services/maxApi');
const stateManager = require('./stateManager');

const RUNTIME = 'ADMINKIT-CORE-MAX-SEND-ADAPTER-1.1-STRICT-MAX-PAYLOAD';

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function sendEnabled() {
  return envFlag('ADMINKIT_CORE_SEND_ENABLED', false);
}

function canaryAllEnabled() {
  return envFlag('ADMINKIT_CORE_CANARY_ALL', false);
}

function allowedAdmins() {
  return envList('ADMINKIT_CORE_CANARY_ADMINS');
}

function isAllowedAdmin(adminId = '') {
  const normalized = String(adminId || '').trim();
  if (!normalized) return false;
  if (canaryAllEnabled()) return true;
  return allowedAdmins().includes(normalized);
}

function deliveryGate(adminId = '') {
  const enabled = sendEnabled();
  const allowed = isAllowedAdmin(adminId);
  return {
    ok: enabled && allowed,
    runtimeVersion: RUNTIME,
    sendEnabled: enabled,
    canaryAll: canaryAllEnabled(),
    allowedAdmin: allowed,
    adminId: String(adminId || ''),
    reason: enabled ? (allowed ? 'core_send_canary_allowed' : 'admin_not_in_core_canary') : 'core_send_disabled'
  };
}

function normalizeButton(button = {}) {
  const type = String(button.type || 'callback').trim() || 'callback';
  const text = String(button.text || '').trim().slice(0, 80);
  if (!text) return null;

  if (type === 'callback') {
    const payload = typeof button.payload === 'string' ? button.payload : JSON.stringify(button.payload || {});
    return { type: 'callback', text, payload };
  }

  if (type === 'link') {
    const url = String(button.url || '').trim();
    if (!url) return null;
    return { type: 'link', text, url };
  }

  if (type === 'open_app') {
    const webApp = String(button.web_app || button.webApp || '').trim();
    const payload = String(button.payload || '').trim();
    if (!webApp || !payload) return null;
    return { type: 'open_app', text, web_app: webApp, payload };
  }

  return null;
}

function normalizeKeyboardAttachment(attachment = {}) {
  if (!attachment || attachment.type !== 'inline_keyboard') return null;
  const payload = attachment.payload || {};
  const rows = Array.isArray(payload.buttons) ? payload.buttons : [];
  const buttons = rows
    .map((row) => (Array.isArray(row) ? row : [row]).map(normalizeButton).filter(Boolean))
    .filter((row) => row.length);

  if (!buttons.length) return null;

  // MAX message API expects inline_keyboard.payload.buttons. Core metadata stays in debug/selfTest,
  // not inside the outbound payload, to avoid strict API rejection during canary.
  return { type: 'inline_keyboard', payload: { buttons } };
}

function toMaxPayload(screen = {}, options = {}) {
  const text = String(screen.text || options.text || '').trim();
  const rawAttachments = Array.isArray(screen.attachments) ? screen.attachments : [];
  const attachments = rawAttachments.map(normalizeKeyboardAttachment).filter(Boolean);
  return {
    text: text || 'АдминКИТ',
    ...(attachments.length ? { attachments } : {}),
    ...(options.format ? { format: options.format } : {}),
    notify: options.notify === true
  };
}

function extractMessageId(data = {}) {
  return String(
    data.message_id ||
    data.messageId ||
    data.id ||
    data.message?.id ||
    data.result?.message_id ||
    data.result?.id ||
    ''
  ).trim();
}

async function deliver({
  botToken,
  adminId = '',
  userId = '',
  chatId = '',
  activeMessageId = '',
  callbackId = '',
  screen = {},
  preferEdit = true,
  notify = false,
  dryRun = false
} = {}) {
  const gate = deliveryGate(adminId || userId || chatId);
  const payload = toMaxPayload(screen, { notify });

  if (dryRun || !gate.ok) {
    return {
      ok: true,
      runtimeVersion: RUNTIME,
      mode: 'dry-run-no-send',
      gate,
      target: { userId: String(userId || ''), chatId: String(chatId || ''), activeMessageId: String(activeMessageId || '') },
      payload
    };
  }

  if (!botToken) return { ok: false, runtimeVersion: RUNTIME, error: 'bot_token_required', gate };
  if (!userId && !chatId && !activeMessageId) return { ok: false, runtimeVersion: RUNTIME, error: 'target_required', gate };

  if (callbackId) {
    try { await answerCallback({ botToken, callbackId, notification: '' }); } catch (error) { /* callback answer must not block rendering */ }
  }

  if (preferEdit && activeMessageId) {
    const data = await editMessage({ botToken, messageId: activeMessageId, ...payload });
    if (adminId) await stateManager.setActiveScreen(adminId, activeMessageId);
    return { ok: true, runtimeVersion: RUNTIME, mode: 'edit-message', gate, messageId: String(activeMessageId), data };
  }

  const data = await sendMessage({ botToken, userId, chatId, ...payload });
  const messageId = extractMessageId(data);
  if (adminId && messageId) await stateManager.setActiveScreen(adminId, messageId);
  return { ok: true, runtimeVersion: RUNTIME, mode: 'send-message', gate, messageId, data };
}

function selfTest() {
  const payload = toMaxPayload({
    text: 'Тест AdminKit Core',
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        source: 'adminkit-core',
        version: 1,
        buttons: [[{ type: 'callback', text: 'Главное меню', payload: JSON.stringify({ r: 'main.home' }) }]]
      }
    }]
  });

  return {
    ok: payload.text === 'Тест AdminKit Core' && Array.isArray(payload.attachments) && payload.attachments[0]?.payload?.buttons?.[0]?.[0]?.type === 'callback' && payload.attachments[0]?.payload?.source === undefined,
    runtimeVersion: RUNTIME,
    mode: 'canary-gated-max-delivery-adapter',
    sendEnabled: sendEnabled(),
    canaryAll: canaryAllEnabled(),
    allowedAdminsConfigured: allowedAdmins().length,
    safety: {
      notWiredToLegacyWebhook: true,
      noLegacyFallback: true,
      strictMaxPayloadOnly: true,
      dryRunDefault: true,
      requiresAdminkitCoreSendEnabled: true,
      requiresCanaryAdminOrCanaryAll: true,
      oneActiveScreenCompatible: true
    },
    sample: payload
  };
}

module.exports = {
  RUNTIME,
  sendEnabled,
  canaryAllEnabled,
  allowedAdmins,
  isAllowedAdmin,
  deliveryGate,
  toMaxPayload,
  deliver,
  selfTest
};
