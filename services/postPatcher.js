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
  editMessage,
  buildGiftKeyboardRows,
  getMessage
} = require("./maxApi");
const { findGiftCampaignForPost } = require("./giftService");
const { buildCustomKeyboardRows } = require("./keyboardBuilderService");

function normalizeAttachments(value) {
  return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [];
}

function stripInlineKeyboard(attachments) {
  return normalizeAttachments(attachments).filter((item) => item?.type !== "inline_keyboard");
}

function stableStringify(value) {
  return JSON.stringify(value || []);
}

async function patchStoredPost({
  botToken,
  appBaseUrl,
  botUsername,
  maxDeepLinkBase,
  commentKey
}) {
  const post = getPost(commentKey);
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
  const textOverrideActive = Boolean(post.textOverrideActive);

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
      }
    } catch {}
  }

  const handoffToken = String(post.handoffToken || "").trim() || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(post.postId || ""),
    channelId: String(post.channelId || ""),
    messageId: String(post.messageId || "")
  });

  if (handoffToken && handoffToken !== post.handoffToken) {
    savePost(commentKey, { handoffToken });
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

  const keyboardAttachments = buildCommentsKeyboard({
    appBaseUrl,
    botUsername,
    maxDeepLinkBase,
    handoffToken,
    postId: post.postId,
    channelId: post.channelId,
    commentKey,
    count: commentCount,
    extraRows: [...customRows, ...giftRows],
    buttonSuffix: "",
    primaryButtonText: String(post?.customKeyboard?.commentButtonText || "").trim(),
    showPrimaryButton: !Boolean(post?.commentsDisabled)
  });
  const mergedAttachments = [...originalAttachments, ...keyboardAttachments];
  const nextFingerprint = stableStringify(mergedAttachments);

  if (stableStringify(post.patchedAttachments) === nextFingerprint) {
    return { ok: true, commentCount, skipped: true, reason: "already_patched", giftCampaignId: giftCampaign?.id || "" };
  }

  try {
    const payload = {
      botToken,
      messageId: post.messageId,
      attachments: mergedAttachments,
      notify: false
    };

    if (textOverrideActive) {
      if (originalText) {
        payload.text = String(originalText || "");
      }
      if (originalLink) {
        payload.link = JSON.parse(JSON.stringify(originalLink));
      }
      if (originalFormat !== undefined) {
        payload.format = originalFormat;
      }
    }

    const patchResult = await editMessage(payload);

    savePost(commentKey, {
      patchedAttachments: mergedAttachments,
      lastPatchedFingerprint: nextFingerprint,
      lastPatchedAt: Date.now(),
      lastPatchError: null,
      giftCampaignId: giftCampaign?.id || ""
    });

    return { ok: true, commentCount, patchResult, giftCampaignId: giftCampaign?.id || "" };
  } catch (error) {
    const patchError = {
      status: error?.status || 0,
      message: error?.message || "patch_failed",
      data: error?.data || null
    };

    savePost(commentKey, {
      lastPatchError: patchError,
      lastPatchAttemptAt: Date.now(),
      giftCampaignId: giftCampaign?.id || ""
    });

    return {
      ok: false,
      commentCount,
      error: patchError,
      giftCampaignId: giftCampaign?.id || ""
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

  const existingPost = getPost(commentKey);
  if (existingPost && String(existingPost.messageId || "") === String(messageId || "") && existingPost.lastPatchedFingerprint) {
    return {
      commentKey,
      botStartLink: buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken: existingPost.handoffToken, postId, channelId, commentKey }),
      miniAppLink: buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken: existingPost.handoffToken, postId, channelId, commentKey }),
      fallbackLink: `${String(appBaseUrl || "").replace(/\/$/, "")}/fallback?postId=${encodeURIComponent(String(postId || ""))}`,
      post: existingPost,
      patchResult: null,
      patchError: null,
      commentCount: getComments(commentKey).length,
      skipped: true
    };
  }

  const handoffToken = saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(postId || ""),
    channelId: String(channelId || ""),
    messageId: String(messageId || "")
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

  const patchAttempt = await patchStoredPost({
    botToken,
    appBaseUrl,
    botUsername,
    maxDeepLinkBase,
    commentKey
  });

  return {
    commentKey,
    botStartLink: buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }),
    miniAppLink: buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }),
    fallbackLink: `${String(appBaseUrl || "").replace(/\/$/, "")}/fallback?postId=${encodeURIComponent(String(postId || ""))}`,
    post: postRecord,
    patchResult: patchAttempt.ok ? patchAttempt.patchResult : null,
    patchError: patchAttempt.ok ? null : patchAttempt.error || { message: patchAttempt.reason || "patch_failed" },
    commentCount: patchAttempt.commentCount || 0,
    giftCampaignId: patchAttempt.giftCampaignId || ""
  };
}

module.exports = {
  tryPatchChannelPost,
  patchStoredPost
};
