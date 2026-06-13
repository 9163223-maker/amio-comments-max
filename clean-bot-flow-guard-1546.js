'use strict';

const crypto = require('crypto');
const guard = require('./clean-bot-flow-guard-1544');
const menu = require('./v3-menu-core-1539');
const postsTextFlow = require('./posts-flow-cc8-text-flow');
const giftsFlow = require('./gifts-flow-cc812-bottom');
const buttonsFlow = require('./buttons-flow-cc8-clean');
const max = require('./services/maxApi');
const store = require('./store');
const timing = require('./v3-ui-timing-cc8');
const { tryPatchChannelPost } = require('./services/postPatcher');
const buttonsWizardOwner = require('./buttons-wizard-screen-owner-pr206');

const RUNTIME = 'CC8.1.19-BUTTONS-WIZARD-SINGLE-SCREEN-LINK-PREVIEW';
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
function message(update = {}) { return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || find(update, (x) => x && typeof x === 'object' && (x.body?.text || x.text || x.body?.link || x.link) && (x.recipient || x.sender || x.message_id || x.id), 5) || null; }
function directCallback(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.data?.message?.callback || null; }
function callback(update = {}) { return directCallback(update) || find(update, (x) => x && typeof x === 'object' && (x.callback_id || x.callbackId || x.payload || x.callback_data || x.callbackData) && !(x.body && x.body.text), 6) || null; }
function clean(value) { return String(value || '').trim(); }
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
function text(msg = {}) { return clean(msg?.body?.text || msg?.body?.caption || msg?.text || msg?.caption || ''); }
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
function isGiftScreen(screen = null) { return /^(gifts?|adminkit_gift)/i.test(clean(screen && screen.id)); }
function isButtonScreen(screen = null) { return /^buttons?_?clean|^buttons_/i.test(clean(screen && screen.id)); }
function resultMessageId(result, fallback = '') { return clean(result?.message?.body?.mid || result?.message?.id || result?.body?.mid || result?.message_id || result?.messageId || result?.id || fallback); }
function rememberGiftScreen(uid = '', messageId = '', screen = null) {
  const user = clean(uid);
  const mid = clean(messageId);
  if (!user || !mid || !isGiftScreen(screen)) return;
  try { store.setSetupState(user, { giftActiveScreenMessageId: mid, giftActiveScreenId: clean(screen.id), giftActiveScreenAt: Date.now() }); } catch {}
}
function rememberButtonScreen(uid = '', messageId = '', screen = null) {
  const user = clean(uid);
  const mid = clean(messageId);
  if (!user || !mid || !isButtonScreen(screen)) return;
  try { store.setSetupState(user, { buttonsActiveScreenMessageId: mid, buttonsActiveScreenId: clean(screen.id), buttonsActiveScreenAt: Date.now() }); } catch {}
}
async function closePreviousButtonScreen(config = {}, uid = '', nextScreen = null, skipMessageId = '') {
  const user = clean(uid);
  if (!user || !isButtonScreen(nextScreen)) return false;
  const state = setup(user);
  const previousMessageId = clean(state.buttonsActiveScreenMessageId);
  if (buttonsWizardOwner.shouldSkipWizardCleanup({ state, messageId: previousMessageId, nextScreen })) return false;
  if (!previousMessageId || previousMessageId === clean(skipMessageId)) return false;
  try {
    await max.editMessage({ botToken: config.botToken, messageId: previousMessageId, text: '✅ Предыдущий шаг закрыт', attachments: [], notify: false });
    try { store.setSetupState(user, { buttonsClosedScreenMessageId: previousMessageId, buttonsClosedScreenAt: Date.now() }); } catch {}
    return true;
  } catch (error) {
    timing.log('buttons_wizard_close_previous_failed', { userId: timing.mask(user), messageId: timing.mask(previousMessageId), error: clean(error && error.message || error) });
    return false;
  }
}
async function ack(config, id, notification) {
  if (!id) return null;
  try { return await max.answerCallback({ botToken: config.botToken, callbackId: id, notification: notification || undefined }); } catch { return null; }
}
async function show(config, update, msg, screen, edit = false, options = {}) {
  const messageId = clean(msg?.body?.mid || msg?.body?.message_id || msg?.message_id || msg?.messageId || msg?.id);
  const cid = chatId(msg);
  const uid = clean(options.userId || userId(update, null, msg));
  if (edit && messageId) {
    try {
      const result = await max.editMessage({ botToken: config.botToken, messageId, text: screen.text, attachments: screen.attachments, notify: false });
      rememberGiftScreen(uid, messageId, screen);
      rememberButtonScreen(uid, messageId, screen);
      buttonsWizardOwner.recordButtonsWizardScreen({ userId: uid, chatId: cid, messageId, screen });
      return result;
    } catch {}
  }
  if (!edit && isButtonScreen(screen)) await closePreviousButtonScreen(config, uid, screen);
  const result = await max.sendMessage({ botToken: config.botToken, userId: cid ? '' : uid, chatId: cid, text: screen.text, attachments: screen.attachments, notify: false });
  const sentId = resultMessageId(result);
  rememberGiftScreen(uid, sentId, screen);
  rememberButtonScreen(uid, sentId, screen);
  buttonsWizardOwner.recordButtonsWizardScreen({ userId: uid, chatId: cid, messageId: sentId, screen });
  return result;
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
function body(msg = {}) { return msg?.body && typeof msg.body === 'object' ? msg.body : {}; }
function isLinkPreviewAttachment(value = {}) { const type = clean(value?.type || value?.kind || value?.attachment_type || value?.attachmentType).toLowerCase(); return /^(link_preview|link|url)$/i.test(type); }
function filterLinkPreviewAttachments(value = null) { return (Array.isArray(value) ? value : []).filter((item) => item && typeof item === 'object' && isLinkPreviewAttachment(item)); }
function safeUrlTraceFields(value = '') { const normalized = normalizeUrlForInput(value); const out = { urlRedacted: true, urlHasQuery: false }; try { const parsed = new URL(normalized); out.urlScheme = clean(parsed.protocol).replace(/:$/, '').toLowerCase(); out.urlHost = clean(parsed.hostname).toLowerCase().slice(0, 120); out.urlHasQuery = Boolean(parsed.search); out.urlHash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16); } catch { out.urlHash = crypto.createHash('sha256').update(clean(value)).digest('hex').slice(0, 16); } return out; }
function normalizeUrlForInput(value = '') { const raw = clean(value); const m = raw.match(/https?:\/\/[^\s<>'\"]+/i); return m ? m[0].replace(/[)\],.]+$/, '').replace(/^https?:\/\//i, (scheme) => scheme.toLowerCase()) : ''; }
function valueAtPath(source = null, path = '') {
  try { return path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), source); } catch { return undefined; }
}
function collectUrlCandidates(source = null, path = 'msg', out = [], seen = new Set(), depth = 7) {
  if (source === null || source === undefined || depth < 0) return out;
  if (Array.isArray(source) && /attachments/i.test(path)) { filterLinkPreviewAttachments(source).forEach((item, index) => collectUrlCandidates(item, `${path}[${index}]`, out, seen, depth - 1)); return out; }
  if (typeof source === 'string' || typeof source === 'number') {
    const url = normalizeUrlForInput(source);
    if (url) out.push({ url, path });
    return out;
  }
  if (typeof source !== 'object' || seen.has(source)) return out;
  seen.add(source);
  const urlKeys = new Set(['url', 'uri', 'href', 'canonical_url', 'canonicalurl', 'target_url', 'targeturl']);
  for (const [key, raw] of Object.entries(source)) {
    const nextPath = `${path}.${key}`;
    if (String(key || '').toLowerCase() === 'attachments' && Array.isArray(raw)) { filterLinkPreviewAttachments(raw).forEach((item, index) => collectUrlCandidates(item, `${nextPath}[${index}]`, out, seen, depth - 1)); continue; }
    if (urlKeys.has(String(key || '').toLowerCase())) {
      const url = normalizeUrlForInput(raw);
      if (url) out.push({ url, path: nextPath });
    }
    collectUrlCandidates(raw, nextPath, out, seen, depth - 1);
  }
  return out;
}
function linkPreviewInfo(msg = {}) {
  const paths = ['body.link', 'body.preview', 'body.message', 'body.message.body', 'link', 'preview', 'message', 'message.body', 'attachments', 'body.attachments'];
  const candidates = [];
  for (const path of paths) collectUrlCandidates(valueAtPath(msg, path), `msg.${path}`, candidates);
  const first = candidates[0] || null;
  return { text: first ? first.url : '', path: first ? first.path : '', candidateCount: candidates.length };
}
function linkPreviewText(msg = {}) { return linkPreviewInfo(msg).text; }
function messageShapeForTrace(msg = {}) {
  const b = body(msg);
  return [
    b.text ? 'body.text' : '', msg.text ? 'text' : '', b.link ? 'body.link' : '', msg.link ? 'link' : '', b.preview ? 'body.preview' : '', msg.preview ? 'preview' : '',
    Array.isArray(b.attachments) ? 'body.attachments[]' : '', Array.isArray(msg.attachments) ? 'attachments[]' : '', b.message ? 'body.message' : '', msg.message ? 'message' : ''
  ].filter(Boolean).join(',') || 'unknown';
}
function messageId(msg = {}) { const b = body(msg); return clean(b.mid || b.message_id || b.messageId || msg.mid || msg.message_id || msg.messageId || msg.id); }
function messageIdCandidates(msg = {}) {
  const b = body(msg);
  const nested = b.message || msg.message || {};
  return [b.mid, b.message_id, b.messageId, b.id, msg.mid, msg.message_id, msg.messageId, msg.id, nested.mid, nested.message_id, nested.messageId, nested.id].map(clean).filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
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
function channelTitle(msg = {}) { const b = body(msg); return clean(b.link?.chat_title || b.link?.chat?.title || b.forward?.chat_title || b.forward?.chat?.title || msg.recipient?.chat_title || msg.recipient?.title || msg.chat?.title || ''); }
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
  timing.log('direct_channel_pr82_patch', { durationMs: Date.now() - started, ok: Boolean(result?.patchResult || result?.patchError === null), channelId: timing.mask(channelId), postId: timing.mask(pid), messageId: timing.mask(mid), skipped: Boolean(result?.skipped), reason: clean(result?.reason || result?.patchError?.message || '') });
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
      const linkInfo = linkPreviewInfo(msg);
      const incomingButtonText = incomingText || linkInfo.text;
      try {
        if (!realCb && msg && isDirectPatchCandidate(msg)) {
          const result = await timing.measure('direct_channel_pr82_total', { updateType: updateType(update), channelId: timing.mask(chatId(msg)), postId: timing.mask(postId(msg)), messageId: timing.mask(messageId(msg) || postId(msg)) }, () => patchDirectChannelPostFast(update, msg, config));
          return res.status(200).json({ ok: true, handledBy: RUNTIME, directChannelFastPatch: true, skipped: Boolean(result?.skipped), reason: result?.reason || '', commentKey: result?.commentKey || '', patchOk: Boolean(result?.patchResult || result?.patchError === null) });
        }

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
            await show(config, update, msg, screen, false, { userId: uid });
            return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'gift_text_input', screenId: screen.id, giftsCleanFlow: true, giftsBottomSummary: true, giftsSavePatch: true, giftsStepNumberingClean: true });
          }
        }

        if (!realCb && msg && (incomingButtonText || hasButtonFlowPriority(state)) && !/^\/?start(?:\s|$)/i.test(incomingButtonText) && !isChannelMessage(msg) && hasButtonFlowPriority(state)) {
          const fromLinkPreview = Boolean(!incomingText && incomingButtonText);
          const stepIndexBefore = Number(state.buttonFlow?.stepIndex || 0);
          timing.log('buttons_url_input_seen', { updateType: updateType(update), messageShape: messageShapeForTrace(msg), incomingTextLen: incomingText.length, hasLinkPreviewText: Boolean(linkInfo.text), fromLinkPreview, hasButtonFlowPriority: true, activeAdminFlowKind: state.activeAdminFlowKind, buttonFlowStepIndex: stepIndexBefore, userId: timing.mask(uid), chatId: timing.mask(chatId(msg)) });
          if (!incomingButtonText) {
            timing.log('buttons_url_input_no_text', { updateType: updateType(update), messageShape: messageShapeForTrace(msg), hasButtonFlowPriority: true, activeAdminFlowKind: state.activeAdminFlowKind, buttonFlowStepIndex: stepIndexBefore, userId: timing.mask(uid) });
          } else {
            timing.log('buttons_url_input_extracted', { updateType: updateType(update), fromLinkPreview, linkPreviewPath: linkInfo.path, ...safeUrlTraceFields(incomingButtonText), buttonFlowStepIndex: stepIndexBefore, userId: timing.mask(uid) });
            const screen = await timing.measure('buttons_text_flow_clean', { userId: timing.mask(uid), textLen: incomingButtonText.length, fakeCallbackIgnored: Boolean(rawCb && !realCb), fromLinkPreview }, () => buttonsFlow.handleTextInput(menu, { config, userId: uid, text: incomingButtonText, update }));
            timing.log('buttons_url_input_screen', { updateType: updateType(update), screenId: screen && screen.id, isWizardScreen: buttonsWizardOwner.isButtonsWizardScreen(screen), fromLinkPreview, buttonFlowStepIndex: stepIndexBefore, userId: timing.mask(uid) });
            if (screen) {
              if (buttonsWizardOwner.isButtonsWizardScreen(screen)) {
                const editResult = await buttonsWizardOwner.updateButtonsWizardScreen({ config, update, msg, userId: uid, screen });
                timing.log('buttons_url_input_edit_result', { updateType: updateType(update), screenId: screen.id, ok: editResult?.ok !== false, diagnostic: editResult?.diagnostic || editResult?.reason || '', messageId: editResult?.message?.body?.mid || editResult?.message?.id || '', fromLinkPreview, userId: timing.mask(uid) });
              } else {
                await show(config, update, msg, screen, false, { userId: uid });
              }
              return res.status(200).json({ ok: true, handledBy: RUNTIME, action: 'button_text_input', screenId: screen.id, buttonsCleanFlow: true, buttonsSingleScreen: true, buttonsLinkPreviewText: fromLinkPreview });
            }
          }
        } else if (!realCb && msg && hasButtonFlowPriority(state)) {
          timing.log('buttons_url_input_no_flow', { updateType: updateType(update), hasMessage: Boolean(msg), hasIncomingButtonText: Boolean(incomingButtonText), isChannelMessage: isChannelMessage(msg), activeAdminFlowKind: state.activeAdminFlowKind, userId: timing.mask(uid) });
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
        timing.log('posts_text_flow_guard', { durationMs: Date.now() - started, action, active: hasActivePostsTextFlow(state), giftActive: hasGiftFlowPriority(state), buttonActive: hasButtonFlowPriority(state), realCallback: realCb, fakeCallbackIgnored: Boolean(rawCb && !realCb), buttonInputFromLinkPreview: Boolean(!incomingText && incomingButtonText), userId: timing.mask(uid), updateType: updateType(update) });
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
