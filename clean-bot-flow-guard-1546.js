'use strict';

const guard = require('./clean-bot-flow-guard-1544');
const menu = require('./v3-menu-core-1539');
const postsTextFlow = require('./posts-flow-cc8-text-flow');
const max = require('./services/maxApi');
const store = require('./store');
const timing = require('./v3-ui-timing-cc8');

const RUNTIME = 'CC8.0.20-GIFTS-LEGACY-HANDOFF-FIX';
const EDIT_FLOW_KIND = 'post_edit_text';

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
function message(update = {}) { return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || find(update, (x) => x && typeof x === 'object' && (x.body?.text || x.text) && (x.recipient || x.sender || x.message_id || x.id), 5) || null; }
function callback(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || find(update, (x) => x && typeof x === 'object' && (x.callback_id || x.callbackId || x.payload || x.callback_data || x.callbackData) && !(x.body && x.body.text), 6) || null; }
function clean(value) { return String(value || '').trim(); }
function text(msg = {}) { return clean(msg?.body?.text || msg?.text || ''); }
function chatId(msg = {}) { return clean(msg?.recipient?.chat_id || msg?.recipient?.id || msg?.chat_id || msg?.chat?.id); }
function chatType(msg = {}) { return clean(msg?.recipient?.chat_type || msg?.recipient?.type || msg?.chat_type || msg?.chat?.type).toLowerCase(); }
function isChannelMessage(msg = {}) { const id = chatId(msg); return chatType(msg) === 'channel' || /^-/.test(id); }
function senderId(msg = {}) { return clean(msg?.sender?.user_id || msg?.sender?.id || msg?.user_id || ''); }
function userFrom(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return clean(obj.user_id || obj.userId || obj.sender_id || obj.senderId || obj.from_id || obj.fromId || obj.id || userFrom(obj.user) || userFrom(obj.sender) || userFrom(obj.from) || userFrom(obj.author));
}
function userId(update = {}, cb = null, msg = null) { return userFrom(cb) || userFrom(update) || senderId(msg) || userFrom(find(update, (x) => x && typeof x === 'object' && (x.user_id || x.userId || x.sender_id || x.senderId || x.from_id || x.fromId), 7)); }
function cbid(cb = {}) { return clean(cb.callback_id || cb.callbackId || cb.id); }
function payloadValue(cb = {}) { return cb.payload !== undefined ? cb.payload : cb.data !== undefined ? cb.data : cb.value !== undefined ? cb.value : cb.callback_data !== undefined ? cb.callback_data : cb.callbackData !== undefined ? cb.callbackData : ''; }
function parsePayload(cb = {}) {
  const value = payloadValue(cb);
  if (value && typeof value === 'object') return value;
  const raw = clean(value);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { action: raw, raw }; }
}
function setup(uid = '') { try { return store.getSetupState(clean(uid)) || {}; } catch { return {}; } }
function isPostsEditCallback(action = '', state = {}) {
  if (action === 'admin_posts_edit_text' || action === 'admin_posts_edit_cancel') return true;
  if (action !== 'comments_edit_text') return false;
  return clean(state.adminUi?.section) === 'posts' || clean(state.activeAdminUi?.section) === 'posts' || Boolean(state.postEditFlow?.commentKey) || Boolean(state.commentTargetPost?.commentKey);
}
function hasGiftFlowPriority(state = {}) {
  return clean(state.activeAdminFlowKind) === 'gift' || Boolean(state.giftFlow);
}
function hasActivePostsTextFlow(state = {}) {
  if (hasGiftFlowPriority(state)) return false;
  return clean(state.activeAdminFlowKind) === EDIT_FLOW_KIND || clean(state.postEditFlow?.mode) === 'edit_text';
}
async function ack(config, id, notification) {
  if (!id) return null;
  try { return await max.answerCallback({ botToken: config.botToken, callbackId: id, notification: notification || undefined }); } catch { return null; }
}
async function show(config, update, msg, screen, edit = false) {
  const messageId = clean(msg?.body?.mid || msg?.body?.message_id || msg?.message_id || msg?.messageId || msg?.id);
  if (edit && messageId) {
    try {
      return await max.editMessage({ botToken: config.botToken, messageId, text: screen.text, attachments: screen.attachments, notify: false });
    } catch {}
  }
  const cid = chatId(msg);
  const uid = userId(update, null, msg);
  return max.sendMessage({ botToken: config.botToken, userId: cid ? '' : uid, chatId: cid, text: screen.text, attachments: screen.attachments, notify: false });
}

function createCleanBot(legacy) {
  const wrapped = guard.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithPostsTextFlow(req, res, config) {
      const started = Date.now();
      const update = req.body || {};
      const msg = message(update);
      const cb = callback(update);
      const uid = userId(update, cb, msg);
      const state = setup(uid);
      try {
        if (cb && !isChannelMessage(msg)) {
          const payload = parsePayload(cb);
          const action = clean(payload.action || payload.raw);
          if (isPostsEditCallback(action, state)) {
            const normalized = { ...payload, action: action === 'comments_edit_text' ? 'admin_posts_edit_text' : action };
            const screen = await timing.measure('posts_text_flow_screen', { action: normalized.action, userId: timing.mask(uid) }, () => postsTextFlow.screenForPayload(menu, normalized, { userId: uid, config }));
            if (screen) {
              await ack(config, cbid(cb));
              await show(config, update, msg, screen, true);
              return res.status(200).json({ ok: true, handledBy: RUNTIME, action: normalized.action, screenId: screen.id, postsTextFlow: true });
            }
          }
        }

        if (!cb && msg && text(msg) && !/^\/?start(?:\s|$)/i.test(text(msg)) && !isChannelMessage(msg) && hasGiftFlowPriority(state)) {
          msg.__senderUserId = uid;
          msg.sender = { ...(msg.sender || {}), user_id: uid };
          msg.user_id = uid;
          timing.log('gifts_text_flow_direct_to_legacy', { durationMs: Date.now() - started, userId: timing.mask(uid), activeAdminFlowKind: clean(state.activeAdminFlowKind), hasGiftFlow: Boolean(state.giftFlow), legacySenderInjected: true });
          return wrapped.handleWebhook(req, res, config);
        }

        if (msg && text(msg) && !/^\/?start(?:\s|$)/i.test(text(msg)) && !isChannelMessage(msg) && hasActivePostsTextFlow(state)) {
          const screen = await timing.measure('posts_text_flow_save', { userId: timing.mask(uid), textLen: text(msg).length }, () => postsTextFlow.handleTextInput(menu, { config, userId: uid, text: text(msg) }));
          if (screen) {
            await show(config, update, msg, screen, false);
            return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'admin_posts_text_save', screenId: screen.id, postsTextFlow: true });
          }
        }
      } catch (error) {
        timing.log('posts_text_flow_error', { durationMs: Date.now() - started, error: String(error?.message || error), userId: timing.mask(uid) });
      } finally {
        timing.log('posts_text_flow_guard', { durationMs: Date.now() - started, action: cb ? clean(parsePayload(cb).action || parsePayload(cb).raw) : 'message_created', active: hasActivePostsTextFlow(state), userId: timing.mask(uid), updateType: clean(update.update_type || update.type) });
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
