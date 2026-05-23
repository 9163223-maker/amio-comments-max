'use strict';

const helper = require('./services/giftPendingClaimLookup');
const RUNTIME = 'CC8.1.5-GIFT-CONDITIONS-GATEKEEPER';

function str(value) {
  return String(value || '').trim();
}

function find(value, predicate, depth = 5) {
  if (!value || depth < 0 || typeof value !== 'object') return null;
  if (predicate(value)) return value;
  const values = Array.isArray(value) ? value : Object.values(value);
  for (const item of values) {
    const found = find(item, predicate, depth - 1);
    if (found) return found;
  }
  return null;
}

function readMessage(update = {}) {
  return update.message || update.data?.message || find(update, (item) => item && (item.body?.text || item.text) && (item.sender || item.recipient || item.id));
}

function readUserId(update = {}, message = {}) {
  return str(update.user?.id || update.user_id || update.userId || message.sender?.user_id || message.sender?.id || message.user_id);
}

function readText(message = {}) {
  return str(message.body?.text || message.text);
}

function isCallback(update = {}) {
  return str(update.update_type || update.type || update.data?.update_type || update.data?.type).toLowerCase().includes('callback');
}

function isCommand(text = '') {
  return /^\/\S+/.test(str(text));
}

function isChannel(message = {}) {
  const type = str(message.recipient?.chat_type || message.recipient?.type || message.chat_type || message.chat?.type).toLowerCase();
  const id = str(message.recipient?.chat_id || message.recipient?.id || message.chat_id || message.chat?.id);
  return type === 'channel' || /^-/.test(id);
}

function createCleanBot(wrapped) {
  return {
    handleWebhook: async function handleWebhook(req, res, config) {
      const update = req.body || {};
      const message = readMessage(update);
      const text = readText(message);
      const userId = readUserId(update, message);
      if (message && text && userId && !isCommand(text) && !isCallback(update) && !isChannel(message)) {
        const handled = await helper.processPendingGiftClaimInput({ config, userId, input: text });
        if (handled && handled.handled) {
          return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'gift_claim_code_input', status: handled.status || '' });
        }
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot, helper };