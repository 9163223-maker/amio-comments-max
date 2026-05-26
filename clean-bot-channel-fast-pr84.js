'use strict';

const baseGuard = require('./clean-bot-flow-guard-1546');
const timing = require('./v3-ui-timing-cc8');
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
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
function body(msg = {}) { return msg?.body && typeof msg.body === 'object' ? msg.body : {}; }
function text(msg = {}) { const b = body(msg); return clean(b.text || b.caption || msg.text || msg.caption || ''); }
function chatId(msg = {}) { return clean(msg?.recipient?.chat_id || msg?.recipient?.id || msg?.chat_id || msg?.chat?.id); }
function chatType(msg = {}) { return clean(msg?.recipient?.chat_type || msg?.recipient?.type || msg?.chat_type || msg?.chat?.type).toLowerCase(); }
function isChannelMessage(msg = {}) { const id = chatId(msg); return chatType(msg) === 'channel' || /^-/.test(id); }
function senderId(msg = {}) { return clean(msg?.sender?.user_id || msg?.sender?.id || msg?.user_id || ''); }
function messageId(msg = {}) { const b = body(msg); return clean(b.mid || b.message_id || b.messageId || msg.mid || msg.message_id || msg.messageId || msg.id); }
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
  return result;
}

function createCleanBot(legacy) {
  const wrapped = baseGuard.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithPr84DirectChannelFastPatch(req, res, config) {
      const update = req.body || {};
      const msg = message(update);
      const hasRealCallback = Boolean(directCallback(update)) && !['message_created', 'message_created_callback', 'bot_started'].includes(updateType(update));
      if (!hasRealCallback && msg && isDirectPatchCandidate(msg)) {
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
        }
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
