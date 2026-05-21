'use strict';

// Clean Core 8 bridge: create user/tenant/tariff context before private admin flows.
// This wrapper intentionally does not change Telegram-style comments UI, post patching,
// webhook routing decisions, gifts, CTA, reactions, or public channel callbacks.
const flowGuard = require('./clean-bot-flow-guard-1545');
const webhookContext = require('./src/core/webhookContext');

const RUNTIME = 'CC8.0.0-USER-CONTEXT-BRIDGE';

function find(value, predicate, depth = 6, seen = new Set()) {
  if (!value || depth < 0 || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (predicate(value)) return value;
  for (const item of (Array.isArray(value) ? value : Object.values(value))) {
    const found = find(item, predicate, depth - 1, seen);
    if (found) return found;
  }
  return null;
}

function message(update = {}) {
  return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || null;
}

function chatType(msg = {}) {
  return String(msg?.recipient?.chat_type || msg?.recipient?.type || msg?.chat_type || msg?.chat?.type || '').trim().toLowerCase();
}

function chatId(msg = {}) {
  return String(msg?.recipient?.chat_id || msg?.recipient?.id || msg?.chat_id || msg?.chat?.id || '').trim();
}

function isChannelMessage(msg = {}) {
  const id = chatId(msg);
  return chatType(msg) === 'channel' || /^-/.test(id);
}

function isPrivateAdminCandidate(update = {}) {
  const msg = message(update) || find(update, (item) => item && typeof item === 'object' && (item.body?.text || item.text) && (item.recipient || item.sender), 5) || null;
  if (!msg) return false;
  return !isChannelMessage(msg);
}

async function safeEnsureUserContext(update = {}) {
  if (!isPrivateAdminCandidate(update)) return { ok: false, skipped: true, reason: 'not_private_admin_candidate' };
  return webhookContext.ensureWebhookUserContext(update, { throwOnError: false });
}

function createCleanBot(legacy) {
  const wrapped = flowGuard.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithUserContext(req, res, config) {
      try {
        const result = await safeEnsureUserContext(req.body || {});
        if (result?.ok) {
          req.adminkitUserContext = result;
        }
      } catch {
        // User context must never block existing bot behaviour.
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = {
  ...flowGuard,
  RUNTIME,
  createCleanBot,
  safeEnsureUserContext
};
