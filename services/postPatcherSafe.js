const original = require('./postPatcher');
const {
  getPost,
  savePost,
  getComments,
  makeHandoffToken,
  saveHandoff
} = require('../store');
const {
  buildCommentsKeyboard,
  buildStableOpenPayload,
  editMessage,
  buildGiftKeyboardRows,
  getMessage
} = require('./maxApi');
const { findGiftCampaignForPost } = require('./giftService');
const { buildCustomKeyboardRows } = require('./keyboardBuilderService');
const pollService = require('./pollService');

const RUNTIME = 'CC7.5.45-POST-PATCHER-SAFE-COMPOSE';

function normalizeAttachments(value) {
  return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [];
}
function stripInlineKeyboard(attachments) {
  return normalizeAttachments(attachments).filter((item) => item?.type !== 'inline_keyboard');
}
function stableStringify(value) {
  return JSON.stringify(value || []);
}
function clean(value) {
  return String(value || '').trim();
}
function cloneObject(value, fallback = null) {
  if (!value || typeof value !== 'object') return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
}
function highlightText(post = {}, originalText = '') {
  const txt = String(originalText || post.originalText || post.postText || '');
  const h = post && post.highlight && post.highlight.enabled ? post.highlight : null;
  if (!h) return txt;
  const label = clean(h.label || '⭐ Важно');
  return label + (txt ? '\n\n' + txt : '');
}

async function patchStoredPost({
  botToken,
  appBaseUrl,
  botUsername,
  maxDeepLinkBase,
  commentKey
}) {
  let post = getPost(commentKey);
  if (!post) return { ok: false, reason: 'post_not_found' };
  if (!post.messageId) return { ok: false, reason: 'message_id_missing', post };

  const commentCount = getComments(commentKey).length;
  let originalAttachments = stripInlineKeyboard(post.sourceAttachments || post.attachments || []);
  let originalText = String(post.originalText || '');
  let originalLink = post.originalLink && typeof post.originalLink === 'object' ? cloneObject(post.originalLink, null) : null;
  let originalFormat = post.originalFormat !== undefined ? post.originalFormat : undefined;

  if ((!originalAttachments.length || !originalText || !originalLink || originalFormat === undefined) && botToken && post.messageId) {
    try {
      const liveMessage = await getMessage({ botToken, messageId: post.messageId });
      const liveBody = liveMessage?.body && typeof liveMessage.body === 'object' ? liveMessage.body : {};
      const liveAttachments = stripInlineKeyboard(Array.isArray(liveBody.attachments) ? liveBody.attachments : []);
      const liveLink = liveBody.link && typeof liveBody.link === 'object' ? cloneObject(liveBody.link, null) : null;
      if (!originalAttachments.length && liveAttachments.length) originalAttachments = liveAttachments;
      if (!originalText && liveBody.text) originalText = String(liveBody.text || '');
      if (!originalLink && liveLink) originalLink = liveLink;
      if (originalFormat === undefined && liveBody.format !== undefined) originalFormat = liveBody.format;
      if ((liveAttachments.length && stableStringify(post.sourceAttachments || []) !== stableStringify(liveAttachments)) || (originalText && originalText !== String(post.originalText || '')) || (liveLink && stableStringify(post.originalLink || null) !== stableStringify(liveLink)) || (originalFormat !== post.originalFormat && originalFormat !== undefined)) {
        savePost(commentKey, { sourceAttachments: normalizeAttachments(liveAttachments.length ? liveAttachments : originalAttachments), originalText, originalLink, ...(originalFormat !== undefined ? { originalFormat } : {}) });
        post = getPost(commentKey) || post;
      }
    } catch {}
  }

  const stablePayload = clean(post.stablePayload || buildStableOpenPayload({
    commentKey,
    postId: post.postId,
    channelId: post.channelId,
    messageId: post.messageId || post.postId
  }));

  const handoffToken = String(post.handoffToken || '').trim() || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(post.postId || ''),
    channelId: String(post.channelId || ''),
    messageId: String(post.messageId || ''),
    stablePayload
  });

  if ((handoffToken && handoffToken !== post.handoffToken) || (stablePayload && stablePayload !== post.stablePayload)) {
    savePost(commentKey, { handoffToken, stablePayload });
    post = getPost(commentKey) || post;
  }

  const giftCampaign = findGiftCampaignForPost({ channelId: post.channelId, postId: post.postId });
  const giftRows = giftCampaign
    ? buildGiftKeyboardRows({ campaign: giftCampaign, commentKey, channelId: post.channelId, postId: post.postId })
    : [];
  const customRows = buildCustomKeyboardRows({
    builder: post.customKeyboard || {},
    appBaseUrl,
    channelId: post.channelId,
    postId: post.postId,
    commentKey
  });
  let pollRows = [];
  try {
    pollRows = await pollService.buildPollKeyboardRows({ channelId: post.channelId, postId: post.postId, commentKey });
  } catch (error) {
    savePost(commentKey, { lastPollRowsComposeError: String(error && error.message || error), lastPollRowsComposeErrorAt: Date.now() });
  }

  await original.syncPatchedPostToDb({
    channelId: post.channelId,
    postId: post.postId,
    messageId: post.messageId,
    title: originalText || post.originalText || post.postId,
    channelTitle: post.channelTitle,
    linkedByUserId: post.linkedByUserId,
    linkedByName: post.linkedByName,
    commentKey,
    originalText,
    sourceAttachments: originalAttachments,
    originalLink,
    originalFormat,
    handoffToken,
    stablePayload,
    customKeyboard: post.customKeyboard || {},
    commentsDisabled: Boolean(post?.commentsDisabled),
    giftCampaignId: giftCampaign?.id || post.giftCampaignId || '',
    source: 'post_patcher_safe_compose_snapshot'
  });

  const keyboardAttachments = buildCommentsKeyboard({
    appBaseUrl,
    botUsername,
    maxDeepLinkBase,
    handoffToken,
    postId: post.postId,
    channelId: post.channelId,
    commentKey,
    messageId: post.messageId || post.postId,
    count: commentCount,
    // Canonical order: custom CTA -> active poll -> gift rows. No patch may drop another feature.
    extraRows: [...customRows, ...pollRows, ...giftRows],
    buttonSuffix: '',
    primaryButtonText: String(post?.customKeyboard?.commentButtonText || '').trim(),
    showPrimaryButton: !Boolean(post?.commentsDisabled)
  });

  const mergedAttachments = [...originalAttachments, ...keyboardAttachments];
  const nextText = highlightText(post, originalText);
  const nextFingerprint = stableStringify({ attachments: mergedAttachments, text: nextText });

  if (stableStringify({ attachments: post.patchedAttachments, text: post.lastPatchedText || '' }) === nextFingerprint) {
    return { ok: true, commentCount, skipped: true, reason: 'already_patched', giftCampaignId: giftCampaign?.id || '', stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: RUNTIME };
  }

  try {
    const payload = { botToken, messageId: post.messageId, attachments: mergedAttachments, notify: false };
    if (nextText) payload.text = nextText;
    if (originalLink && typeof originalLink === 'object') payload.link = cloneObject(originalLink, null);
    if (originalFormat !== undefined && originalFormat !== null) payload.format = originalFormat;

    const patchResult = await editMessage(payload);
    savePost(commentKey, {
      patchedAttachments: mergedAttachments,
      lastPatchedText: nextText,
      lastPatchedFingerprint: nextFingerprint,
      lastPatchedAt: Date.now(),
      lastPatchError: null,
      stablePayload,
      giftCampaignId: giftCampaign?.id || '',
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: RUNTIME
    });
    return { ok: true, commentCount, patchResult, giftCampaignId: giftCampaign?.id || '', stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: RUNTIME };
  } catch (error) {
    const patchError = { status: error?.status || 0, message: error?.message || 'patch_failed', data: error?.data || null };
    savePost(commentKey, {
      lastPatchError: patchError,
      lastPatchAttemptAt: Date.now(),
      stablePayload,
      giftCampaignId: giftCampaign?.id || '',
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: RUNTIME
    });
    return { ok: false, commentCount, error: patchError, giftCampaignId: giftCampaign?.id || '', stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: RUNTIME };
  }
}

module.exports = {
  ...original,
  patchStoredPost,
  RUNTIME
};
