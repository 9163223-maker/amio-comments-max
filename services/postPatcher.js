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

const DB_SYNC_RUNTIME = "CC7.4.7-POST-PATCHER-PERSIST-ADMIN-ADDONS";

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
  return {
    source: clean(source || "post_patcher"),
    runtimeVersion: DB_SYNC_RUNTIME,
    commentKey: clean(commentKey),
    channelId: clean(channelId),
    postId: clean(postId),
    messageId: clean(messageId || postId),
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
    for (const row of result.rows || []) {
      if (row.admin_id) ids.add(String(row.admin_id));
    }
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
  const payload = clean(stablePayload || buildStableOpenPayload({ commentKey: ck, channelId: ch, postId: post, messageId: messageId || post }));
  const raw = buildPostSnapshotRaw({
    source,
    commentKey: ck,
    channelId: ch,
    postId: post,
    messageId: messageId || post,
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
    const result = await db.upsertPost(adminId, ch, post, String(title || originalText || post).slice(0, 120), raw, clean(messageId || post));
    if (result) registered.push(result);
  }

  return { ok: true, runtimeVersion: DB_SYNC_RUNTIME, registered: registered.length, admins, channelId: ch, postId: post, commentKey: ck, stablePayload: payload };
}

async function patchStoredPost({
  botToken,
  appBaseUrl,
  botUsername,
  maxDeepLinkBase,
  commentKey
}) {
  let post = getPost(commentKey);
  if (!post) {
    return { ok: false, reason: "post_not_found" };
  }

  if (!post.messageId) {
    return { ok: false, reason: "message_id_missing", post };
  }

  const commentCount = getComments(commentKey).length;
  let originalAttachments = stripInlineKeyboard(post.sourceAttachments || post.attachments || []);
  let originalText = String(post.originalText || "");
  let originalLink = post.originalLink && typeof post.originalLink === "object" ? JSON.parse(JSON.stringify(post.originalLink)) : null;
  let originalFormat = post.originalFormat !== undefined ? post.originalFormat : undefined;

  if ((!originalAttachments.length || !originalText || !originalLink || originalFormat === undefined) && botToken && post.messageId) {
    try {
      const liveMessage = await getMessage({ botToken, messageId: post.messageId });
      const liveBody = liveMessage?.body && typeof liveMessage.body === "object" ? liveMessage.body : {};
      const liveAttachments = stripInlineKeyboard(Array.isArray(liveBody.attachments) ? liveBody.attachments : []);
      const liveLink = liveBody.link && typeof liveBody.link === "object" ? JSON.parse(JSON.stringify(liveBody.link)) : null;
      if (!originalAttachments.length && liveAttachments.length) originalAttachments = liveAttachments;
      if (!originalText && liveBody.text) originalText = String(liveBody.text || "");
      if (!originalLink && liveLink) originalLink = liveLink;
      if (originalFormat === undefined && liveBody.format !== undefined) originalFormat = liveBody.format;
      if ((liveAttachments.length && stableStringify(post.sourceAttachments || []) !== stableStringify(liveAttachments)) || (originalText && originalText !== String(post.originalText || "")) || (liveLink && stableStringify(post.originalLink || null) !== stableStringify(liveLink)) || (originalFormat !== post.originalFormat && originalFormat !== undefined)) {
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

  const giftCampaign = findGiftCampaignForPost({
    channelId: post.channelId,
    postId: post.postId
  });

  const giftRows = giftCampaign
    ? buildGiftKeyboardRows({
        campaign: giftCampaign,
        commentKey,
        channelId: post.channelId,
        postId: post.postId
      })
    : [];

  const customRows = buildCustomKeyboardRows({
    builder: post.customKeyboard || {},
    appBaseUrl,
    channelId: post.channelId,
    postId: post.postId,
    commentKey
  });

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
    source: "post_patcher_patch_stored_post_snapshot"
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
    extraRows: [...customRows, ...giftRows],
    buttonSuffix: "",
    primaryButtonText: String(post?.customKeyboard?.commentButtonText || "").trim(),
    showPrimaryButton: !Boolean(post?.commentsDisabled)
  });
  const mergedAttachments = [...originalAttachments, ...keyboardAttachments];
  const nextFingerprint = stableStringify(mergedAttachments);

  if (stableStringify(post.patchedAttachments) === nextFingerprint) {
    return { ok: true, commentCount, skipped: true, reason: "already_patched", giftCampaignId: giftCampaign?.id || "", stablePayload, customRowsCount: customRows.length };
  }

  try {
    const payload = {
      botToken,
      messageId: post.messageId,
      attachments: mergedAttachments,
      notify: false
    };

    // CC7.4.5+: MAX PUT /messages may rebuild the message when only attachments are sent.
    // Always send the original text/link/format back when we have them, so native links/entities survive patching.
    if (originalText) {
      payload.text = String(originalText || "");
    }
    if (originalLink && typeof originalLink === "object") {
      payload.link = JSON.parse(JSON.stringify(originalLink));
    }
    if (originalFormat !== undefined && originalFormat !== null) {
      payload.format = originalFormat;
    }

    const patchResult = await editMessage(payload);

    savePost(commentKey, {
      patchedAttachments: mergedAttachments,
      lastPatchedFingerprint: nextFingerprint,
      lastPatchedAt: Date.now(),
      lastPatchError: null,
      stablePayload,
      giftCampaignId: giftCampaign?.id || "",
      lastCustomRowsCount: customRows.length,
      lastGiftRowsCount: giftRows.length
    });

    return { ok: true, commentCount, patchResult, giftCampaignId: giftCampaign?.id || "", stablePayload, customRowsCount: customRows.length, giftRowsCount: giftRows.length };
  } catch (error) {
    const patchError = {
      status: error?.status || 0,
      message: error?.message || "patch_failed",
      data: error?.data || null
    };

    savePost(commentKey, {
      lastPatchError: patchError,
      lastPatchAttemptAt: Date.now(),
      stablePayload,
      giftCampaignId: giftCampaign?.id || "",
      lastCustomRowsCount: customRows.length,
      lastGiftRowsCount: giftRows.length
    });

    return {
      ok: false,
      commentCount,
      error: patchError,
      giftCampaignId: giftCampaign?.id || "",
      stablePayload,
      customRowsCount: customRows.length,
      giftRowsCount: giftRows.length
    };
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
  const stablePayload = buildStableOpenPayload({ commentKey, postId, channelId, messageId: messageId || postId });

  const existingPost = getPost(commentKey);
  if (existingPost && String(existingPost.messageId || "") === String(messageId || "") && existingPost.lastPatchedFingerprint) {
    await syncPatchedPostToDb({
      channelId,
      postId,
      messageId,
      title: existingPost.originalText || originalText || postId,
      channelTitle: existingPost.channelTitle || channelTitle,
      linkedByUserId: existingPost.linkedByUserId || linkedByUserId,
      linkedByName: existingPost.linkedByName || linkedByName,
      commentKey,
      originalText: existingPost.originalText || originalText || "",
      sourceAttachments: existingPost.sourceAttachments || sourceAttachments || [],
      originalLink: existingPost.originalLink || originalLink || null,
      originalFormat: existingPost.originalFormat !== undefined ? existingPost.originalFormat : originalFormat,
      handoffToken: existingPost.handoffToken,
      stablePayload: existingPost.stablePayload || stablePayload,
      customKeyboard: existingPost.customKeyboard || {},
      commentsDisabled: Boolean(existingPost.commentsDisabled),
      giftCampaignId: existingPost.giftCampaignId || "",
      source: "post_patcher_existing_already_patched"
    });
    return {
      commentKey,
      botStartLink: buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken: existingPost.handoffToken, postId, channelId, commentKey, messageId }),
      miniAppLink: buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken: existingPost.handoffToken, postId, channelId, commentKey, messageId }),
      fallbackLink: `${String(appBaseUrl || "").replace(/\/$/, "")}/fallback?postId=${encodeURIComponent(String(postId || ""))}`,
      post: existingPost,
      patchResult: null,
      patchError: null,
      commentCount: getComments(commentKey).length,
      skipped: true,
      stablePayload: existingPost.stablePayload || stablePayload
    };
  }

  const handoffToken = saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(postId || ""),
    channelId: String(channelId || ""),
    messageId: String(messageId || ""),
    stablePayload
  });

  const postRecord = savePost(commentKey, {
    postId: String(postId || ""),
    channelId: String(channelId || ""),
    messageId: String(messageId || ""),
    originalText: String(originalText || ""),
    sourceAttachments: normalizeAttachments(sourceAttachments),
    nativeReactions: Array.isArray(nativeReactions) ? JSON.parse(JSON.stringify(nativeReactions)).slice(0, 8) : [],
    originalLink: originalLink && typeof originalLink === "object" ? JSON.parse(JSON.stringify(originalLink)) : null,
    ...(originalFormat !== undefined ? { originalFormat } : {}),
    channelTitle: String(channelTitle || "").trim(),
    textOverrideActive: false,
    linkedByUserId: String(linkedByUserId || ""),
    linkedByName: String(linkedByName || ""),
    autoMode: Boolean(autoMode),
    handoffToken,
    stablePayload,
    customKeyboard: existingPost?.customKeyboard || {},
    createdAt: Date.now()
  });

  saveChannel(channelId, {
    lastPostId: String(postId || ""),
    lastMessageId: String(messageId || ""),
    linkedByUserId: String(linkedByUserId || ""),
    linkedByName: String(linkedByName || ""),
    ...(String(channelTitle || "").trim() ? { title: String(channelTitle || "").trim() } : {}),
    autoModeEnabled: true
  });

  await syncPatchedPostToDb({
    channelId,
    postId,
    messageId,
    title: originalText || postId,
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
    customKeyboard: postRecord?.customKeyboard || {},
    source: "post_patcher_try_patch_channel_post"
  });

  const patchAttempt = await patchStoredPost({
    botToken,
    appBaseUrl,
    botUsername,
    maxDeepLinkBase,
    commentKey
  });

  return {
    commentKey,
    botStartLink: buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId }),
    miniAppLink: buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId }),
    fallbackLink: `${String(appBaseUrl || "").replace(/\/$/, "")}/fallback?postId=${encodeURIComponent(String(postId || ""))}`,
    post: postRecord,
    patchResult: patchAttempt.ok ? patchAttempt.patchResult : null,
    patchError: patchAttempt.ok ? null : patchAttempt.error || { message: patchAttempt.reason || "patch_failed" },
    commentCount: patchAttempt.commentCount || 0,
    giftCampaignId: patchAttempt.giftCampaignId || "",
    stablePayload: patchAttempt.stablePayload || stablePayload,
    customRowsCount: patchAttempt.customRowsCount || 0,
    giftRowsCount: patchAttempt.giftRowsCount || 0
  };
}

module.exports = {
  tryPatchChannelPost,
  patchStoredPost,
  syncPatchedPostToDb,
  DB_SYNC_RUNTIME
};