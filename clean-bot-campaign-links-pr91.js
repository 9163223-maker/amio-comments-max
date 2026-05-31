'use strict';

const base = require('./clean-bot-channel-first-post-picker-pr90');
const max = require('./services/maxApi');
const store = require('./store');
const menu = require('./v3-menu-core-1539');
const statsFlow = require('./stats-flow-cc8');
const botAudit = require('./admin-bot-audit-trace');
const walkthroughTrace = require('./admin-walkthrough-trace');

const RUNTIME = 'CC8.3.17-CAMPAIGN-LINKS';

function clean(value) { return String(value || '').trim(); }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function audit(type, payload = {}) { try { botAudit.log(type, payload); } catch {} }
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
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
function message(update = {}) { return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || find(update, (x) => x && typeof x === 'object' && (x.body?.text || x.text || x.body?.caption || x.caption) && (x.recipient || x.sender || x.message_id || x.id), 6) || null; }
function directCallback(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || null; }
function callback(update = {}) { return directCallback(update) || find(update, (x) => x && typeof x === 'object' && (x.callback_id || x.callbackId || x.payload || x.callback_data || x.callbackData) && !(x.body && (x.body.text || x.body.caption)), 6) || null; }
function isMessageCreatedLikeUpdate(kind = '') { return kind === 'message_created' || kind === 'message_created_callback' || kind === 'bot_started'; }
function isRealCallback(update = {}, cb = null) { const kind = updateType(update); if (isMessageCreatedLikeUpdate(kind)) return false; if (directCallback(update)) return true; if (!cb) return false; if (kind.includes('callback')) return true; return Boolean(clean(cb.callback_id || cb.callbackId || cb.id)); }
function body(msg = {}) { return msg && msg.body && typeof msg.body === 'object' ? msg.body : {}; }
function text(msg = {}) { const b = body(msg || {}); return clean(b.text || b.caption || msg?.text || msg?.caption || ''); }
function chatId(msg = {}) { return clean(msg?.recipient?.chat_id || msg?.recipient?.id || msg?.chat_id || msg?.chat?.id); }
function chatType(msg = {}) { return clean(msg?.recipient?.chat_type || msg?.recipient?.type || msg?.chat_type || msg?.chat?.type).toLowerCase(); }
function isChannelMessage(msg = {}) { const id = chatId(msg); return chatType(msg) === 'channel' || /^-/.test(id); }
function userFrom(obj) { if (!obj || typeof obj !== 'object') return ''; return clean(obj.user_id || obj.userId || obj.sender_id || obj.senderId || obj.from_id || obj.fromId || obj.id || userFrom(obj.user) || userFrom(obj.sender) || userFrom(obj.from) || userFrom(obj.author)); }
function senderId(msg = {}) { return clean(msg?.sender?.user_id || msg?.sender?.id || msg?.user_id || ''); }
function userId(update = {}, cb = null, msg = null) { return userFrom(cb) || userFrom(update) || senderId(msg) || userFrom(find(update, (x) => x && typeof x === 'object' && (x.user_id || x.userId || x.sender_id || x.senderId || x.from_id || x.fromId), 7)); }
function isSlash(value = '') { return /^\/[a-z_]+(?:\s|$)/i.test(clean(value)); }
function resultMessageId(result = {}) { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id); }
function rememberAdminScreen(uid = '', mid = '') { const user = clean(uid); const messageId = clean(mid); if (!user || !messageId) return; const prev = safe(() => store.getSetupState(user) || {}, {}) || {}; const ids = [...(Array.isArray(prev.adminMessageIds) ? prev.adminMessageIds : []), prev.latestBotMessageId, messageId].map(clean).filter(Boolean); store.setSetupState(user, { latestBotMessageId: messageId, adminMessageIds: [...new Set(ids)].slice(-20) }); }
async function sendFreshScreen(config, update, msg = {}, screen, uid = '') {
  const cid = chatId(msg);
  const user = clean(uid || userId(update, null, msg));
  const state = safe(() => store.getSetupState(user) || {}, {}) || {};
  const ids = [...(Array.isArray(state.adminMessageIds) ? state.adminMessageIds : []), state.latestBotMessageId].map(clean).filter(Boolean);
  for (const id of [...new Set(ids)]) {
    try { await max.deleteMessage({ botToken: config.botToken, messageId: id, timeoutMs: config.menuDeleteTimeoutMs || 1800 }); } catch {}
  }
  const result = await max.sendMessage({ botToken: config.botToken, userId: cid ? '' : user, chatId: cid, text: screen.text, attachments: screen.attachments, notify: false });
  rememberAdminScreen(user, resultMessageId(result));
  return result;
}

function createCleanBot(legacy) {
  const wrapped = base.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithCampaignLinkTextFlow(req, res, config) {
      const update = req.body || {};
      const msg = message(update);
      const cb = callback(update);
      const real = isRealCallback(update, cb);
      const uid = userId(update, real ? cb : null, msg);
      const incomingText = text(msg);
      if (!real && msg && !isChannelMessage(msg) && incomingText && !isSlash(incomingText)) {
        const state = safe(() => store.getSetupState(clean(uid)) || {}, {}) || {};
        if (clean(state.activeAdminFlowKind) === 'stats_campaign' && state.statsCampaignFlow && statsFlow.handleTextInput) {
          const screen = await statsFlow.handleTextInput(menu, { config, userId: uid, text: incomingText, update });
          if (screen) {
            await sendFreshScreen(config, update, msg, screen, uid);
            walkthroughTrace.log('stats_campaign.text_input', { userId: uid, screenId: screen.id, runtimeVersion: RUNTIME });
            audit('stats_campaign.text_input', { userId: uid, screenId: screen.id, runtimeVersion: RUNTIME });
            return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'stats_campaign_text_input', screenId: screen.id });
          }
        }
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
