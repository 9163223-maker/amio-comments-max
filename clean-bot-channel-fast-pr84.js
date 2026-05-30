'use strict';

const baseGuard = require('./clean-bot-flow-guard-1546');
const timing = require('./v3-ui-timing-cc8');
const walkthroughTrace = require('./admin-walkthrough-trace');
const max = require('./services/maxApi');
const store = require('./store');
const unifiedMenu = require('./features/menu-v3/adapter');
const { tryPatchChannelPost, FAST_PATCH_RUNTIME } = require('./services/postPatcherFastPr84');

const RUNTIME = FAST_PATCH_RUNTIME || 'CC8.1.19-DIRECT-CHANNEL-FAST-PATCH-NO-BOOTSTRAP-DB-PR84';

function clean(value) { return String(value || '').trim(); }
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
  return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || find(update, (x) => x && typeof x === 'object' && (x.body?.text || x.body?.caption || x.text || x.caption) && (x.recipient || x.sender || x.message_id || x.id), 5) || null;
}
function directCallback(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || null; }
function callback(update = {}) { return directCallback(update) || find(update, (x) => x && typeof x === 'object' && (x.callback_id || x.callbackId || x.payload || x.callback_data || x.callbackData) && !(x.body && (x.body.text || x.body.caption)), 6) || null; }
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
function cbid(cb = {}) { return clean(cb.callback_id || cb.callbackId || cb.id); }
function isMessageCreatedLikeUpdate(kind = '') { return kind === 'message_created' || kind === 'message_created_callback' || kind === 'bot_started'; }
function isRealCallbackUpdate(update = {}, cb = null) {
  const kind = updateType(update);
  if (isMessageCreatedLikeUpdate(kind)) return false;
  if (directCallback(update)) return true;
  if (!cb) return false;
  if (kind.includes('callback')) return true;
  return Boolean(cbid(cb));
}
function body(msg = {}) { return msg?.body && typeof msg.body === 'object' ? msg.body : {}; }
function text(msg = {}) { const b = body(msg); return clean(b.text || b.caption || msg.text || msg.caption || ''); }
function chatId(msg = {}) { return clean(msg?.recipient?.chat_id || msg?.recipient?.id || msg?.chat_id || msg?.chat?.id); }
function chatType(msg = {}) { return clean(msg?.recipient?.chat_type || msg?.recipient?.type || msg?.chat_type || msg?.chat?.type).toLowerCase(); }
function isChannelMessage(msg = {}) { const id = chatId(msg); return chatType(msg) === 'channel' || /^-/.test(id); }
function senderId(msg = {}) { return clean(msg?.sender?.user_id || msg?.sender?.id || msg?.user_id || ''); }
function messageId(msg = {}) { const b = body(msg); return clean(b.mid || b.message_id || b.messageId || msg.mid || msg.message_id || msg.messageId || msg.id); }
function resultMessageId(result = {}) { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id); }
function isStartText(value = '') { return /^\/?start(?:\s|$)/i.test(clean(value)); }
function uniqueIds(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [items]).map(clean).filter(Boolean).filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}
async function deleteStoredAdminMessages(config, ids = []) {
  const failed = [];
  for (const id of uniqueIds(ids)) {
    try {
      await max.deleteMessage({ botToken: config.botToken, messageId: id, timeoutMs: config.menuDeleteTimeoutMs || 1800 });
      walkthroughTrace.log('start.cleanup_delete_ok', { messageId: id });
    } catch (error) {
      failed.push(id);
      timing.log('start_menu_delete_failed', { durationMs: 0, messageId: timing.mask(id), error: clean(error?.message || error), status: clean(error?.status) });
      walkthroughTrace.log('start.cleanup_delete_failed', { messageId: id, error: clean(error?.message || error), status: clean(error?.status) });
    }
  }
  return failed;
}
async function handleUnifiedStart(update, msg, config) {
  const startedAt = Date.now();
  const userId = senderId(msg) || clean(findFirstDeepValue(update, ['user_id', 'userId', 'sender_id', 'senderId', 'from_id', 'fromId']));
  if (!userId) return { ok: false, skipped: true, reason: 'user_id_missing' };
  const state = store.getSetupState(userId) || {};
  const previousIds = uniqueIds([
    ...(Array.isArray(state.adminMessageIds) ? state.adminMessageIds : []),
    state.latestBotMessageId,
    state?.giftFlow?.anchorMessageId,
    state?.commentAdminFlow?.anchorMessageId,
    ...(Array.isArray(state.pendingDeleteMessageIds) ? state.pendingDeleteMessageIds : [])
  ]);
  walkthroughTrace.log('start.received', { userId, messageId: messageId(msg), previousIdsCount: previousIds.length });
  const failedIds = await deleteStoredAdminMessages(config, previousIds);
  const screen = unifiedMenu.render('main:home');
  walkthroughTrace.log('start.rendered', { userId, route: 'main:home', attachmentsCount: Array.isArray(screen.attachments) ? screen.attachments.length : 0, textLength: String(screen.text || '').length });
  const result = await max.sendMessage({
    botToken: config.botToken,
    userId: chatId(msg) ? '' : userId,
    chatId: chatId(msg),
    text: screen.text,
    attachments: screen.attachments,
    notify: false
  });
  const sentId = resultMessageId(result);
  store.setSetupState(userId, {
    latestBotMessageId: sentId || state.latestBotMessageId || '',
    adminMessageIds: sentId ? [sentId] : [],
    pendingDeleteMessageIds: failedIds.slice(-50),
    adminUi: {
      ...(state.adminUi || {}),
      section: 'main',
      backAction: 'admin_section_main',
      rootAction: 'admin_section_main',
      selectMode: ''
    }
  });
  walkthroughTrace.log('start.sent', { userId, sentMessageId: sentId, deletedCount: previousIds.length - failedIds.length, failedCount: failedIds.length, durationMs: Date.now() - startedAt });
  return { ok: true, sentMessageId: sentId, deletedCount: previousIds.length - failedIds.length, failedCount: failedIds.length };
}
function findFirstDeepValue(value, keys = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return '';
  seen.add(value);
  const keySet = new Set((Array.isArray(keys) ? keys : [keys]).map((key) => String(key || '').toLowerCase()));
  for (const [key, raw] of Object.entries(value)) {
    if (keySet.has(String(key || '').toLowerCase())) {
      const normalized = clean(raw);
      if (normalized && normalized !== '[object Object]') return normalized;
    }
  }
  for (const raw of Object.values(value)) {
    const found = findFirstDeepValue(raw, keys, seen);
    if (found) return found;
  }
  return '';
}
function postId(msg = {}) {
  const b = body(msg);
  const direct = b.message || msg.message || b || msg || {};
  return clean(
    b.seq || msg.seq || msg.post_id || b.post_id ||
    b.link?.message?.seq || b.link?.message?.body?.seq || b.link?.message?.post_id ||
    b.forward?.message?.seq || b.forward?.message?.body?.seq ||
    msg.link?.message?.seq ||
    findFirstDeepValue(b.link?.message || b.forward?.message || msg.link?.message || msg.forward?.message || {}, ['seq', 'post_id']) ||
    (chatType(msg) === 'channel' ? findFirstDeepValue(direct, ['seq', 'post_id']) : '')
  );
}
function channelTitle(msg = {}) {
  const b = body(msg);
  return clean(b.link?.chat_title || b.link?.chat?.title || b.forward?.chat_title || b.forward?.chat?.title || msg.recipient?.chat_title || msg.recipient?.title || msg.chat?.title || '');
}
function clonePlain(value) { try { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null; } catch { return null; } }
function attachmentLikeItems(source = null) {
  const out = [];
  const push = (value, forcedType = '') => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach((item) => push(item, forcedType));
    if (typeof value !== 'object') return;
    const normalizedType = clean(forcedType || value.type || value.kind || value.attachment_type).toLowerCase();
    const payload = value?.payload && typeof value.payload === 'object' ? value.payload : value;
    const looksLikeAttachment = Boolean(normalizedType || value.token || payload.token || payload.url || payload.file_id || payload.photo_id || payload.image_id || payload.video_id || payload.audio_id || payload.document_id || payload.file_name || payload.filename || payload.mime_type || payload.content_type);
    if (!looksLikeAttachment) return;
    out.push(value.type || value.kind || value.attachment_type ? value : { type: normalizedType || 'file', payload });
  };
  if (!source || typeof source !== 'object') return out;
  if (Array.isArray(source.attachments)) source.attachments.forEach((entry) => push(entry));
  ['photo', 'image', 'picture', 'document', 'file', 'video', 'audio', 'voice'].forEach((key) => push(source[key], key));
  return out;
}
function messageAttachments(msg = {}) {
  const b = body(msg);
  const pools = [...attachmentLikeItems(b.message), ...attachmentLikeItems(b.message?.body), ...attachmentLikeItems(b), ...attachmentLikeItems(msg), ...attachmentLikeItems(msg.message), ...attachmentLikeItems(msg.message?.body)];
  const seen = new Set();
  return pools.filter((item) => { const marker = JSON.stringify(item); if (seen.has(marker)) return false; seen.add(marker); return true; });
}
function hasCommentsKeyboard(msg = {}) { return messageAttachments(msg).some((item) => item?.type === 'inline_keyboard' && JSON.stringify(item).includes('Комментар')); }
function originalLink(msg = {}) { const b = body(msg); return clonePlain(b.link || msg.link || null); }
function originalFormat(msg = {}) { const b = body(msg); return b.format !== undefined ? b.format : msg.format; }
function nativeReactions(msg = {}) { const b = body(msg); return Array.isArray(b.reactions) ? b.reactions : Array.isArray(msg.reactions) ? msg.reactions : []; }
function isDirectPatchCandidate(msg = {}) { return isChannelMessage(msg) && Boolean(chatId(msg) && postId(msg)); }

async function patchDirectChannelPostFast(update, msg, config) {
  const started = Date.now();
  const channelId = chatId(msg);
  const pid = postId(msg);
  const mid = messageId(msg) || pid;
  if (!channelId || !pid) return { ok: false, skipped: true, reason: 'direct_channel_identity_missing' };
  if (hasCommentsKeyboard(msg)) return { ok: true, skipped: true, reason: 'already_patched' };
  walkthroughTrace.log('post.patch_start', { channelId, postId: pid, messageId: mid, textLength: text(msg).length, attachmentsCount: messageAttachments(msg).length });
  const result = await tryPatchChannelPost({
    botToken: config.botToken,
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    channelId,
    postId: pid,
    messageId: mid,
    originalText: text(msg),
    sourceAttachments: messageAttachments(msg),
    nativeReactions: nativeReactions(msg),
    originalLink: originalLink(msg),
    originalFormat: originalFormat(msg),
    channelTitle: channelTitle(msg) || channelId,
    linkedByUserId: senderId(msg),
    linkedByName: clean(msg?.sender?.name || msg?.sender?.first_name || ''),
    autoMode: true
  });
  timing.log('direct_channel_pr84_patch', {
    durationMs: Date.now() - started,
    ok: Boolean(result?.patchResult || result?.patchError === null),
    channelId: timing.mask(channelId),
    postId: timing.mask(pid),
    messageId: timing.mask(mid),
    skipped: Boolean(result?.skipped),
    reason: clean(result?.reason || result?.patchError?.message || ''),
    fastPatchNoBootstrapDb: Boolean(result?.fastPatchNoBootstrapDb)
  });
  walkthroughTrace.log('post.patch_result', { channelId, postId: pid, messageId: mid, commentKey: result?.commentKey || '', ok: Boolean(result?.patchResult || result?.patchError === null), skipped: Boolean(result?.skipped), reason: clean(result?.reason || result?.patchError?.message || ''), durationMs: Date.now() - started });
  return result;
}

function createCleanBot(legacy) {
  const wrapped = baseGuard.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithPr84DirectChannelFastPatch(req, res, config) {
      const update = req.body || {};
      const msg = message(update);
      const rawCb = callback(update);
      const realCb = isRealCallbackUpdate(update, rawCb);
      if (!realCb && msg && !isChannelMessage(msg) && isStartText(text(msg))) {
        try {
          const result = await timing.measure('unified_start_menu', {
            updateType: updateType(update),
            userId: timing.mask(senderId(msg)),
            messageId: timing.mask(messageId(msg))
          }, () => handleUnifiedStart(update, msg, config));
          return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'unified_start_menu', ...result });
        } catch (error) {
          timing.log('unified_start_menu_error', { durationMs: 0, error: clean(error?.message || error), userId: timing.mask(senderId(msg)) });
          walkthroughTrace.log('start.error', { userId: senderId(msg), error: clean(error?.message || error), status: clean(error?.status) });
        }
      }
      if (!realCb && msg && isDirectPatchCandidate(msg)) {
        try {
          const result = await timing.measure('direct_channel_pr84_total', {
            updateType: updateType(update),
            channelId: timing.mask(chatId(msg)),
            postId: timing.mask(postId(msg)),
            messageId: timing.mask(messageId(msg) || postId(msg))
          }, () => patchDirectChannelPostFast(update, msg, config));
          return res.status(200).json({
            ok: true,
            handledBy: RUNTIME,
            directChannelFastPatch: true,
            fastPatchNoBootstrapDb: Boolean(result?.fastPatchNoBootstrapDb),
            skipped: Boolean(result?.skipped),
            reason: result?.reason || '',
            commentKey: result?.commentKey || '',
            patchOk: Boolean(result?.patchResult || result?.patchError === null)
          });
        } catch (error) {
          timing.log('direct_channel_pr84_error', { durationMs: 0, error: clean(error?.message || error), channelId: timing.mask(chatId(msg)), postId: timing.mask(postId(msg)) });
          walkthroughTrace.log('post.patch_error', { channelId: chatId(msg), postId: postId(msg), messageId: messageId(msg) || postId(msg), error: clean(error?.message || error), status: clean(error?.status) });
        }
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
