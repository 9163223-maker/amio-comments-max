'use strict';

const { sendMessage, editMessage } = require('./maxApi');
const { getSetupState, setSetupState } = require('../store');
const maxCommandRegistry = require('./maxCommandRegistryService');

const RUNTIME = 'PR237-SINGLE-ACTIVE-SLASH-UX';
const SOURCE = 'adminkit-pr237-single-active-menu-slash-ux';

function clean(value) { return String(value || '').trim(); }
function firstNonEmpty(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
}
function findFirstMessageIdDeep(value, seen = new Set()) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^mid\./i.test(trimmed) ? trimmed : '';
  }
  if (typeof value !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);
  const keys = ['mid', 'message_id', 'messageId', 'id'];
  for (const key of keys) {
    const candidate = clean(value[key]);
    if (candidate && (/^mid\./i.test(candidate) || key !== 'id')) return candidate;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstMessageIdDeep(item, seen);
      if (found) return found;
    }
    return '';
  }
  for (const key of Object.keys(value)) {
    const found = findFirstMessageIdDeep(value[key], seen);
    if (found) return found;
  }
  return '';
}
function extractSentMessageId(result) {
  return firstNonEmpty(
    result?.message_id,
    result?.messageId,
    result?.mid,
    result?.body?.mid,
    result?.body?.message_id,
    result?.message?.body?.mid,
    result?.message?.message_id,
    result?.message?.messageId,
    result?.message?.mid,
    result?.data?.message?.body?.mid,
    result?.data?.message_id,
    result?.data?.mid,
    findFirstMessageIdDeep(result)
  );
}
function getRecipientChatId(message = {}) {
  const body = message && message.body && typeof message.body === 'object' ? message.body : {};
  const recipient = message && message.recipient && typeof message.recipient === 'object' ? message.recipient : (body.recipient || {});
  const chat = message && message.chat && typeof message.chat === 'object'
    ? message.chat
    : (body.chat && typeof body.chat === 'object' ? body.chat : {});
  return firstNonEmpty(
    recipient.chat_id,
    recipient.chatId,
    recipient.id,
    message.chat_id,
    message.chatId,
    body.chat_id,
    body.chatId,
    chat.id,
    chat.chat_id,
    chat.chatId
  );
}
function getLatestBotMessageId(userId = '') {
  return clean(getSetupState(userId)?.latestBotMessageId);
}
function rememberActiveMenuMessage(userId = '', messageId = '', meta = {}) {
  const uid = clean(userId);
  const mid = clean(messageId);
  if (!uid || !mid) return null;
  const current = getSetupState(uid) || {};
  const existingIds = Array.isArray(current.adminMessageIds) ? current.adminMessageIds : [];
  const adminMessageIds = [...new Set([...existingIds, mid].map(clean).filter(Boolean))].slice(-25);
  return setSetupState(uid, {
    latestBotMessageId: mid,
    adminMessageIds,
    slashSingleActiveMenu: {
      runtime: RUNTIME,
      source: SOURCE,
      activeMessageId: mid,
      mode: clean(meta.mode),
      editedExisting: meta.editedExisting === true,
      freshFallback: meta.freshFallback === true,
      updatedAt: Date.now()
    }
  });
}
function metaResult(result, meta = {}) {
  const payload = result && typeof result === 'object' ? result : {};
  payload.__singleActiveMenu = {
    runtime: RUNTIME,
    source: SOURCE,
    ...meta
  };
  return payload;
}
async function sendSingleActiveMenu({ config = {}, message = {}, userId = '', text = '', attachments = [] } = {}) {
  const uid = clean(userId);
  const latestMessageId = getLatestBotMessageId(uid);
  if (latestMessageId) {
    try {
      const result = await editMessage({
        botToken: config.botToken,
        messageId: latestMessageId,
        text,
        attachments,
        notify: false
      });
      rememberActiveMenuMessage(uid, latestMessageId, { mode: 'editMessage', editedExisting: true, freshFallback: false });
      return metaResult(result, { ok: true, mode: 'editMessage', activeMessageId: latestMessageId, editedExisting: true, freshFallback: false });
    } catch (error) {
      // MAX can reject editing stale/deleted message ids. Fall back to one fresh active menu,
      // remember it, and let subsequent slash navigation edit that bottom message.
    }
  }

  const chatId = getRecipientChatId(message);
  const result = await sendMessage({
    botToken: config.botToken,
    ...(chatId ? { chatId } : { userId: uid }),
    text,
    ...(attachments !== undefined ? { attachments } : {}),
    notify: false
  });
  const sentMessageId = extractSentMessageId(result);
  if (sentMessageId) rememberActiveMenuMessage(uid, sentMessageId, { mode: 'sendMessageFallback', editedExisting: false, freshFallback: true });
  return metaResult(result, { ok: true, mode: 'sendMessageFallback', activeMessageId: sentMessageId, editedExisting: false, freshFallback: true });
}
function info() {
  return {
    ok: true,
    runtime: RUNTIME,
    source: SOURCE,
    privateSlashUsesSingleActiveMenu: true,
    privateSlashEditsLatestMenuBeforeFreshFallback: true,
    privateSlashSkipsPreCleanup: true,
    clearKeepsExplicitCleanupFlow: true,
    groupDeniedUsesGroupHelp: true,
    serverSideGroupCommandFilter: true,
    slashPreviewCatalogExternal: maxCommandRegistry.SCOPE_SUPPORT === 'global-only-no-public-scopes',
    maxCommandCatalogWriteSupported: false,
    desiredGlobalCommands: maxCommandRegistry.GLOBAL_COMMAND_NAMES.slice(),
    safe: true
  };
}

module.exports = {
  RUNTIME,
  SOURCE,
  sendSingleActiveMenu,
  getLatestBotMessageId,
  rememberActiveMenuMessage,
  getRecipientChatId,
  extractSentMessageId,
  info
};