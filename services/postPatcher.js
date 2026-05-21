const db = require("../cc5-db-core");
const {
  savePost,
  saveChannel,
  makeCommentKey,
  getPost,
  getComments,
  makeHandoffToken,
  saveHandoff
} = require("../store");
const {
  buildCommentsKeyboard,
  buildMiniAppLaunchUrl,
  buildBotStartLink,
  buildStableOpenPayload,
  editMessage,
  buildGiftKeyboardRows,
  getMessage
} = require("./maxApi");
const { findGiftCampaignForPost } = require("./giftService");
const { buildCustomKeyboardRows } = require("./keyboardBuilderService");
const pollService = require("./pollService");

const DB_SYNC_RUNTIME = "CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE";
let postPatchTraceHook = null;
function setPostPatchTraceHook(fn) { postPatchTraceHook = typeof fn === "function" ? fn : null; }
function emitPostPatchTrace(event, payload = {}) { if (postPatchTraceHook) { try { postPatchTraceHook(event, payload); } catch {} } }

function normalizeAttachments(value) {
  return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [];
}

function stripInlineKeyboard(attachments) {
  return normalizeAttachments(attachments).filter((item) => item?.type !== "inline_keyboard");
}

function stableStringify(value) {
  return JSON.stringify(value || []);
}

function clean(value) {
  return String(value || "").trim();
}

function cloneObject(value, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
}

function cloneKeyboardBuilder(value) {
  const source = value && typeof value === "object" ? value : {};
  const cloned = cloneObject(source, {});
  if (!cloned || typeof cloned !== "object") return {};
  if (!Array.isArray(cloned.rows)) cloned.rows = [];
  return cloned;
}

function resolvePatchMessageId({ messageId = "", postId = "", existingPost = null } = {}) {
  // CC7.5.61: MAX can deliver media/channel post updates without the normal mid,
  // while the channel seq/postId is still present. Text posts usually had mid, media
  // posts sometimes did not, so auto-patching silently stopped before editMessage.
  // Keep the original mid when it exists; otherwise fall back to the stable post id.
  return clean(messageId || existingPost?.messageId || postId);
}

function highlightText(post = {}, originalText = "") {
  const txt = String(originalText || post.originalText || post.postText || "");
  const h = post && post.highlight && post.highlight.enabled ? post.highlight : null;
  if (!h) return txt;
  const label = clean(h.label || "⭐ Важно");
  return label + (txt ? "\n\n" + txt : "");
}

function buildPostSnapshotRaw({
  source,
  commentKey,
  channelId,
  postId,
  messageId,
  title,
  channelTitle,
  originalText,
  sourceAttachments,
  originalLink,
  originalFormat,
  handoffToken,
  stablePayload,
  linkedByUserId,
  linkedByName,
  customKeyboard,
  commentsDisabled,
  giftCampaignId
} = {}) {
  const resolvedMessageId = resolvePatchMessageId({ messageId, postId });
  return {
    source: clean(source || "post_patcher"),
    runtimeVersion: DB_SYNC_RUNTIME,
    commentKey: clean(commentKey),
    channelId: clean(channelId),
    postId: clean(postId),
    messageId: resolvedMessageId,
    title: clean(title || originalText || postId),
    channelTitle: clean(channelTitle || channelId),
    originalText: String(originalText || ""),
    originalFormat: originalFormat === undefined ? null : originalFormat,
    originalLink: cloneObject(originalLink, null),
    sourceAttachments: stripInlineKeyboard(sourceAttachments || []),
    handoffToken: clean(handoffToken),
    stablePayload: clean(stablePayload),
    linkedByUserId: clean(linkedByUserId),
    linkedByName: clean(linkedByName),
    customKeyboard: cloneKeyboardBuilder(customKeyboard),
    commentsDisabled: Boolean(commentsDisabled),
    giftCampaignId: clean(giftCampaignId),
    patchedAt: new Date().toISOString()
  };
}

async function adminIdsForChannel(channelId, fallbackAdminId = "") {
  const ids = new Set();
  const fallback = clean(fallbackAdminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || "17507246");
  if (fallback) ids.add(fallback);
  try {
    await db.init();
    const result = await db.query("select admin_id from ak_admin_channels where channel_id=$1 order by updated_at desc limit 20", [String(channelId || "")]);
    for (const row of result.rows || []) if (row.admin_id) ids.add(String(row.admin_id));
  } catch {}
  return [...ids];
}

async function syncPatchedPostToDb({
  channelId,
  postId,
  messageId,
  title,
  channelTitle,
  linkedByUserId,
  linkedByName,
  commentKey,
  originalText,
  sourceAttachments,
  originalLink,
  originalFormat,
  handoffToken,
  stablePayload,
  customKeyboard,
  commentsDisabled,
  giftCampaignId,
  source = "post_patcher"
}) {
  const ch = clean(channelId);
  const post = clean(postId);
  if (!ch || !post || ch === "CHANNEL_ID" || post === "POST_ID") return { ok: true, skipped: true, reason: "invalid_channel_or_post" };
  const ck = clean(commentKey || `${ch}:${post}`);
  const resolvedMessageId = resolvePatchMessageId({ messageId, postId: post });
  const payload = clean(stablePayload || buildStableOpenPayload({ commentKey: ck, channelId: ch, postId: post, messageId: resolvedMessageId }));
  const raw = buildPostSnapshotRaw({
    source,
    commentKey: ck,
    channelId: ch,
    postId: post,
    messageId: resolvedMessageId,
    title: title || originalText || post,
    channelTitle,
    originalText: originalText || title || "",
    sourceAttachments,
    originalLink,
    originalFormat,
    handoffToken,
    stablePayload: payload,
    linkedByUserId,
    linkedByName,
    customKeyboard,
    commentsDisabled,
    giftCampaignId
  });
  const admins = await adminIdsForChannel(ch, linkedByUserId);
  const registered = [];
  for (const adminId of admins) {
    const result = await db.upsertPost(adminId, ch, post, String(title || originalText || post).slice(0, 120), raw, resolvedMessageId);
    if (result) registered.push(result);
  }
  return { ok: true, runtimeVersion: DB_SYNC_RUNTIME, registered: registered.length, admins, channelId: ch, postId: post, commentKey: ck, stablePayload: payload, messageId: resolvedMessageId };
}

async function enrichOriginalFromLive({ botToken, post, commentKey }) {
  let originalAttachments = stripInlineKeyboard(post.sourceAttachments || post.attachments || []);
  let originalText = String(post.originalText || "");
  let originalLink = cloneObject(post.originalLink, null);
  let originalFormat = post.originalFormat !== undefined ? post.originalFormat : undefined;

  if ((!originalAttachments.length || !originalText || !originalLink || originalFormat === undefined) && botToken && post.messageId) {
    try {
      const liveMessage = await getMessage({ botToken, messageId: post.messageId });
      const liveBody = liveMessage?.body && typeof liveMessage.body === "object" ? liveMessage.body : {};
      const liveAttachments = stripInlineKeyboard(Array.isArray(liveBody.attachments) ? liveBody.attachments : []);
      const liveLink = cloneObject(liveBody.link, null);
      if (!originalAttachments.length && liveAttachments.length) originalAttachments = liveAttachments;
      if (!originalText && liveBody.text) originalText = String(liveBody.text || "");
      if (!originalLink && liveLink) originalLink = liveLink;
      if (originalFormat === undefined && liveBody.format !== undefined) originalFormat = liveBody.format;
      savePost(commentKey, {
        sourceAttachments: normalizeAttachments(liveAttachments.length ? liveAttachments : originalAttachments),
        originalText,
        originalLink,
        ...(originalFormat !== undefined ? { originalFormat } : {})
      });
      post = getPost(commentKey) || post;
    } catch {}
  }
  return { post, originalAttachments, originalText, originalLink, originalFormat };
}

async function patchStoredPost({
  botToken,
  appBaseUrl,
  botUsername,
  maxDeepLinkBase,
  commentKey
}) {
  let post = getPost(commentKey);
  if (!post) return { ok: false, reason: "post_not_found" };
  if (!post.messageId && post.postId) {
    savePost(commentKey, { messageId: String(post.postId || "") });
    post = getPost(commentKey) || post;
  }
  if (!post.messageId) return { ok: false, reason: "message_id_missing", post, runtimeVersion: DB_SYNC_RUNTIME };

  const live = await enrichOriginalFromLive({ botToken, post, commentKey });
  post = live.post;
  const { originalAttachments, originalText, originalLink, originalFormat } = live;
  const commentCount = getComments(commentKey).length;

  const stablePayload = clean(post.stablePayload || buildStableOpenPayload({
    commentKey,
    postId: post.postId,
    channelId: post.channelId,
    messageId: post.messageId || post.postId
  }));

  const handoffToken = String(post.handoffToken || "").trim() || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(post.postId || ""),
    channelId: String(post.channelId || ""),
    messageId: String(post.messageId || ""),
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
    savePost(commentKey, { lastPollRowsComposeError: String(error?.message || error), lastPollRowsComposeErrorAt: Date.now() });
  }

  await syncPatchedPostToDb({
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
    giftCampaignId: giftCampaign?.id || post.giftCampaignId || "",
    source: "post_patcher_media_post_fallback_snapshot"
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
    extraRows: [...customRows, ...pollRows, ...giftRows],
    buttonSuffix: "",
    primaryButtonText: String(post?.customKeyboard?.commentButtonText || "").trim(),
    showPrimaryButton: !Boolean(post?.commentsDisabled)
  });
  const mergedAttachments = [...originalAttachments, ...keyboardAttachments];
  const nextText = highlightText(post, originalText);
  const nextFingerprint = stableStringify({ attachments: mergedAttachments, text: nextText });

  if (post.lastPatchedFingerprint === nextFingerprint) {
    return { ok: true, commentCount, skipped: true, reason: "already_patched", giftCampaignId: giftCampaign?.id || "", stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: DB_SYNC_RUNTIME };
  }

  try {
    emitPostPatchTrace("edit_message_started", {
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      originalAttachmentCount: originalAttachments.length,
      keyboardAttachmentCount: keyboardAttachments.length,
      attachmentCount: mergedAttachments.length,
      attachmentTypes: mergedAttachments.map((x) => String(x?.type || "file")).slice(0, 20)
    });
    const editStartedAt = Date.now();
    const payload = { botToken, messageId: post.messageId, attachments: mergedAttachments, notify: false };
    if (nextText) payload.text = nextText;
    if (originalLink && typeof originalLink === "object") payload.link = cloneObject(originalLink, null);
    if (originalFormat !== undefined && originalFormat !== null) payload.format = originalFormat;
const rawPatchResult = await editMessage(payload);
const editDurationMs = Date.now() - editStartedAt;
const patchResult = rawPatchResult && typeof rawPatchResult === "object"
  ? rawPatchResult
  : { ok: true, emptyBody: true };
patchResult.durationMs = editDurationMs;
emitPostPatchTrace("edit_message_ok", { commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, durationMs: patchResult.durationMs, status: "ok" });
    savePost(commentKey, {
      patchedAttachments: mergedAttachments,
      lastPatchedText: nextText,
      lastPatchedFingerprint: nextFingerprint,
      lastPatchedAt: Date.now(),
      lastPatchError: null,
      stablePayload,
      giftCampaignId: giftCampaign?.id || "",
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: DB_SYNC_RUNTIME
    });
    return { ok: true, commentCount, patchResult, giftCampaignId: giftCampaign?.id || "", stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: DB_SYNC_RUNTIME };
  } catch (error) {
    const patchError = { status: error?.status || 0, message: error?.message || "patch_failed", data: error?.data || null };
    savePost(commentKey, {
      lastPatchError: patchError,
      lastPatchAttemptAt: Date.now(),
      stablePayload,
      giftCampaignId: giftCampaign?.id || "",
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: DB_SYNC_RUNTIME
    });
    emitPostPatchTrace("edit_message_failed", { commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: "error", error: patchError.message, durationMs: 0 });
    return { ok: false, commentCount, error: patchError, giftCampaignId: giftCampaign?.id || "", stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: DB_SYNC_RUNTIME };
  }
}

async function tryPatchChannelPost({
  botToken,
  appBaseUrl,
  botUsername,
  maxDeepLinkBase,
  channelId,
  postId,
  messageId,
  originalText,
  sourceAttachments,
  originalLink,
  originalFormat,
  nativeReactions = [],
  channelTitle,
  linkedByUserId,
  linkedByName,
  autoMode = false
}) {
  const commentKey = makeCommentKey(channelId, postId);
  const existingPost = getPost(commentKey);
  const resolvedMessageId = resolvePatchMessageId({ messageId, postId, existingPost });
  const stablePayload = buildStableOpenPayload({ commentKey, postId, channelId, messageId: resolvedMessageId });

  const handoffToken = String(existingPost?.handoffToken || "").trim() || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(postId || ""),
    channelId: String(channelId || ""),
    messageId: String(resolvedMessageId || ""),
    stablePayload
  });

  const postRecord = savePost(commentKey, {
    ...(existingPost || {}),
    postId: String(postId || ""),
    channelId: String(channelId || ""),
    messageId: resolvedMessageId,
    originalText: String(existingPost?.originalText || originalText || ""),
    sourceAttachments: normalizeAttachments(existingPost?.sourceAttachments || sourceAttachments),
    nativeReactions: Array.isArray(nativeReactions) ? JSON.parse(JSON.stringify(nativeReactions)).slice(0, 8) : [],
    originalLink: cloneObject(existingPost?.originalLink || originalLink, null),
    ...(existingPost?.originalFormat !== undefined ? { originalFormat: existingPost.originalFormat } : (originalFormat !== undefined ? { originalFormat } : {})),
    channelTitle: String(existingPost?.channelTitle || channelTitle || "").trim(),
    textOverrideActive: false,
    linkedByUserId: String(existingPost?.linkedByUserId || linkedByUserId || ""),
    linkedByName: String(existingPost?.linkedByName || linkedByName || ""),
    autoMode: Boolean(autoMode),
    handoffToken,
    stablePayload,
    customKeyboard: existingPost?.customKeyboard || {},
    createdAt: existingPost?.createdAt || Date.now()
  });

  saveChannel(channelId, {
    lastPostId: String(postId || ""),
    lastMessageId: String(resolvedMessageId || ""),
    linkedByUserId: String(linkedByUserId || ""),
    linkedByName: String(linkedByName || ""),
    ...(String(channelTitle || "").trim() ? { title: String(channelTitle || "").trim() } : {}),
    autoModeEnabled: true
  });

  await syncPatchedPostToDb({
    channelId,
    postId,
    messageId: resolvedMessageId,
    title: postRecord.originalText || originalText || postId,
    channelTitle,
    linkedByUserId,
    linkedByName,
    commentKey,
    originalText: postRecord.originalText || originalText || "",
    sourceAttachments: postRecord.sourceAttachments || sourceAttachments || [],
    originalLink: postRecord.originalLink || originalLink || null,
    originalFormat: postRecord.originalFormat !== undefined ? postRecord.originalFormat : originalFormat,
    handoffToken,
    stablePayload,
    customKeyboard: postRecord?.customKeyboard || {},
    commentsDisabled: Boolean(postRecord?.commentsDisabled),
    giftCampaignId: postRecord?.giftCampaignId || "",
    source: "post_patcher_try_patch_channel_post_media_fallback"
  });

  const patchAttempt = await patchStoredPost({ botToken, appBaseUrl, botUsername, maxDeepLinkBase, commentKey });

  return {
    commentKey,
    botStartLink: buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId: resolvedMessageId }),
    miniAppLink: buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId: resolvedMessageId }),
    fallbackLink: `${String(appBaseUrl || "").replace(/\/$/, "")}/fallback?postId=${encodeURIComponent(String(postId || ""))}`,
    post: postRecord,
    patchResult: patchAttempt.ok ? patchAttempt.patchResult : null,
    patchError: patchAttempt.ok ? null : patchAttempt.error || { message: patchAttempt.reason || "patch_failed" },
    commentCount: patchAttempt.commentCount || 0,
    giftCampaignId: patchAttempt.giftCampaignId || "",
    stablePayload: patchAttempt.stablePayload || stablePayload,
    customRowsCount: patchAttempt.customRowsCount || 0,
    pollRowsCount: patchAttempt.pollRowsCount || 0,
    giftRowsCount: patchAttempt.giftRowsCount || 0,
    runtimeVersion: DB_SYNC_RUNTIME
  };
}

module.exports = {
  tryPatchChannelPost,
  patchStoredPost,
  syncPatchedPostToDb,
  DB_SYNC_RUNTIME,
  setPostPatchTraceHook
};
