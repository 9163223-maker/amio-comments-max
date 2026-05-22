'use strict';

const guard = require('./clean-bot-flow-guard-1544');
const menu = require('./v3-menu-core-1539');
const postsTextFlow = require('./posts-flow-cc8-text-flow');
const giftsFlow = require('./gifts-flow-cc811-ux');
const buttonsFlow = require('./buttons-flow-cc8-clean');
const max = require('./services/maxApi');
const store = require('./store');
const timing = require('./v3-ui-timing-cc8');

const RUNTIME = 'CC8.1.1-GIFTS-WIZARD-UX-CONDITIONS-CLEANUP';
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
function directCallback(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || null; }
function callback(update = {}) { return directCallback(update) || find(update, (x) => x && typeof x === 'object' && (x.callback_id || x.callbackId || x.payload || x.callback_data || x.callbackData) && !(x.body && x.body.text), 6) || null; }
function clean(value) { return String(value || '').trim(); }
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
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
function isMessageCreatedLikeUpdate(kind = '') { return kind === 'message_created' || kind === 'message_created_callback' || kind === 'bot_started'; }
function isRealCallbackUpdate(update = {}, cb = null) {
  const kind = updateType(update);
  if (isMessageCreatedLikeUpdate(kind)) return false;
  if (directCallback(update)) return true;
  if (!cb) return false;
  if (kind.includes('callback')) return true;
  return Boolean(cbid(cb));
}
function setup(uid = '') { try { return store.getSetupState(clean(uid)) || {}; } catch { return {}; } }
function hasGiftFlowPriority(state = {}) { return clean(state.activeAdminFlowKind) === 'gift' || Boolean(state.giftFlow); }
function hasButtonFlowPriority(state = {}) { return clean(state.activeAdminFlowKind) === 'button' || Boolean(state.buttonFlow); }
function isPostsEditCallback(action = '', state = {}) {
  if (action === 'admin_posts_edit_text' || action === 'admin_posts_edit_cancel') return true;
  if (action !== 'comments_edit_text') return false;
  return clean(state.adminUi?.section) === 'posts' || clean(state.activeAdminUi?.section) === 'posts' || Boolean(state.postEditFlow?.commentKey) || Boolean(state.commentTargetPost?.commentKey);
}
function hasActivePostsTextFlow(state = {}) {
  if (hasGiftFlowPriority(state) || hasButtonFlowPriority(state)) return false;
  return clean(state.activeAdminFlowKind) === EDIT_FLOW_KIND || clean(state.postEditFlow?.mode) === 'edit_text';
}
function isGiftScreen(screen = null) { return /^gifts?_/i.test(clean(screen && screen.id)); }
function resultMessageId(result, fallback = '') { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id || fallback); }
function rememberGiftScreen(uid = '', messageId = '', screen = null) {
  const user = clean(uid);
  const mid = clean(messageId);
  if (!user || !mid || !isGiftScreen(screen)) return;
  try { store.setSetupState(user, { giftActiveScreenMessageId: mid, giftActiveScreenId: clean(screen.id), giftActiveScreenAt: Date.now() }); } catch {}
}
async function ack(config, id, notification) {
  if (!id) return null;
  try { return await max.answerCallback({ botToken: config.botToken, callbackId: id, notification: notification || undefined }); } catch { return null; }
}
async function show(config, update, msg, screen, edit = false, options = {}) {
  const messageId = clean(msg?.body?.mid || msg?.body?.message_id || msg?.message_id || msg?.messageId || msg?.id);
  const cid = chatId(msg);
  const uid = clean(options.userId || userId(update, null, msg));
  if (options.preferGiftActive && isGiftScreen(screen)) {
    const activeId = clean(setup(uid).giftActiveScreenMessageId);
    if (activeId) {
      try {
        const result = await max.editMessage({ botToken: config.botToken, messageId: activeId, text: screen.text, attachments: screen.attachments, notify: false });
        rememberGiftScreen(uid, activeId, screen);
        timing.log('gifts_active_screen_edit', { durationMs: 0, ok: true, screenId: screen.id, userId: timing.mask(uid) });
        return result;
      } catch (error) {
        timing.log('gifts_active_screen_edit', { durationMs: 0, ok: false, screenId: screen.id, userId: timing.mask(uid), error: String(error?.message || error) });
      }
    }
  }
  if (edit && messageId) {
    try {
      const result = await max.editMessage({ botToken: config.botToken, messageId, text: screen.text, attachments: screen.attachments, notify: false });
      rememberGiftScreen(uid, messageId, screen);
      return result;
    } catch {}
  }
  const result = await max.sendMessage({ botToken: config.botToken, userId: cid ? '' : uid, chatId: cid, text: screen.text, attachments: screen.attachments, notify: false });
  rememberGiftScreen(uid, resultMessageId(result), screen);
  return result;
}

function createCleanBot(legacy) {
  const wrapped = guard.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithCleanFlowGuard(req, res, config) {
      const started = Date.now();
      const update = req.body || {};
      const msg = message(update);
      const rawCb = callback(update);
      const realCb = isRealCallbackUpdate(update, rawCb);
      const cb = realCb ? rawCb : null;
      const uid = userId(update, cb, msg);
      const state = setup(uid);
      const incomingText = text(msg);
      try {
        if (cb && !isChannelMessage(msg)) {
          const payload = parsePayload(cb);
          const action = clean(payload.action || payload.raw);
          if (isPostsEditCallback(action, state)) {
            const normalized = { ...payload, action: action === 'comments_edit_text' ? 'admin_posts_edit_text' : action };
            const screen = await timing.measure('posts_text_flow_screen', { action: normalized.action, userId: timing.mask(uid) }, () => postsTextFlow.screenForPayload(menu, normalized, { userId: uid, config }));
            if (screen) {
              await ack(config, cbid(cb));
              await show(config, update, msg, screen, true, { userId: uid });
              return res.status(200).json({ ok: true, handledBy: RUNTIME, action: normalized.action, screenId: screen.id, postsTextFlow: true });
            }
          }
        }

        if (!realCb && msg && incomingText && !/^\/?start(?:\s|$)/i.test(incomingText) && !isChannelMessage(msg) && hasGiftFlowPriority(state)) {
          const screen = await timing.measure('gifts_text_flow_clean', { userId: timing.mask(uid), textLen: incomingText.length, fakeCallbackIgnored: Boolean(rawCb && !realCb) }, () => giftsFlow.handleTextInput(menu, { config, userId: uid, text: incomingText, update }));
          if (screen) {
            await show(config, update, msg, screen, false, { userId: uid, preferGiftActive: true });
            return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'gift_text_input', screenId: screen.id, giftsCleanFlow: true, activeGiftScreenEditAttempt: true });
          }
        }

        if (!realCb && msg && incomingText && !/^\/?start(?:\s|$)/i.test(incomingText) && !isChannelMessage(msg) && hasButtonFlowPriority(state)) {
          const screen = await timing.measure('buttons_text_flow_clean', { userId: timing.mask(uid), textLen: incomingText.length, fakeCallbackIgnored: Boolean(rawCb && !realCb) }, () => buttonsFlow.handleTextInput(menu, { config, userId: uid, text: incomingText, update }));
          if (screen) {
            await show(config, update, msg, screen, false, { userId: uid });
            return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'button_text_input', screenId: screen.id, buttonsCleanFlow: true });
          }
        }

        if (msg && incomingText && !/^\/?start(?:\s|$)/i.test(incomingText) && !isChannelMessage(msg) && hasActivePostsTextFlow(state)) {
          const screen = await timing.measure('posts_text_flow_save', { userId: timing.mask(uid), textLen: incomingText.length }, () => postsTextFlow.handleTextInput(menu, { config, userId: uid, text: incomingText }));
          if (screen) {
            await show(config, update, msg, screen, false, { userId: uid });
            return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'admin_posts_text_save', screenId: screen.id, postsTextFlow: true });
          }
        }
      } catch (error) {
        timing.log('clean_flow_guard_error', { durationMs: Date.now() - started, error: String(error?.message || error), userId: timing.mask(uid) });
      } finally {
        const action = cb ? clean(parsePayload(cb).action || parsePayload(cb).raw) : 'message_created';
        timing.log('posts_text_flow_guard', { durationMs: Date.now() - started, action, active: hasActivePostsTextFlow(state), giftActive: hasGiftFlowPriority(state), buttonActive: hasButtonFlowPriority(state), realCallback: realCb, fakeCallbackIgnored: Boolean(rawCb && !realCb), userId: timing.mask(uid), updateType: updateType(update) });
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };