const path = require("path");
const {
  getPost,
  savePost,
  savePostVersion,
  listPostVersions,
  getComments,
  listPostsByChannel
} = require("../store");
const {
  editMessage,
  createUpload,
  uploadBinaryToUrl,
  buildUploadAttachmentPayload
} = require("./maxApi");
const { patchStoredPost } = require("./postPatcher");
const { normalizeKeyboardBuilder } = require("./keyboardBuilderService");

const MEDIA_ATTACHMENT_TYPES = new Set(["image", "video", "audio", "file"]);
const MEDIA_EXT_TO_TYPE = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  mp4: "video",
  mov: "video",
  mkv: "video",
  webm: "video",
  matroska: "video",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio"
};

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function getEditWindowHours(config = {}) {
  const hours = Number(config.postEditWindowHours || 24);
  return Number.isFinite(hours) && hours > 0 ? hours : 24;
}

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeAttachments(value) {
  return Array.isArray(value) ? cloneDeep(value) : [];
}

function isMediaAttachment(item) {
  return MEDIA_ATTACHMENT_TYPES.has(String(item?.type || "").trim().toLowerCase());
}

function detectUploadType({ explicitType = "", mimeType = "", fileName = "" } = {}) {
  const normalizedExplicit = String(explicitType || "").trim().toLowerCase();
  if (MEDIA_ATTACHMENT_TYPES.has(normalizedExplicit)) return normalizedExplicit;

  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  if (normalizedMime.startsWith("image/")) return "image";
  if (normalizedMime.startsWith("video/")) return "video";
  if (normalizedMime.startsWith("audio/")) return "audio";

  const ext = path.extname(String(fileName || "")).replace(/^\./, "").toLowerCase();
  if (ext && MEDIA_EXT_TO_TYPE[ext]) return MEDIA_EXT_TO_TYPE[ext];
  return "file";
}

function extractAttachmentPreviewUrl(item = {}) {
  const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
  return String(
    payload.url ||
      payload.preview_url ||
      payload.download_url ||
      payload.src ||
      payload.thumbnail?.url ||
      payload.photo?.url ||
      ""
  ).trim();
}

function summarizeAttachment(item = {}, index = 0) {
  const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
  const type = String(item?.type || "file").trim().toLowerCase() || "file";
  return {
    id: `${type}_${index}`,
    index,
    type,
    isMedia: isMediaAttachment(item),
    token: String(payload.token || payload.file_token || payload.video_token || payload.audio_token || "").trim(),
    name: String(payload.file_name || payload.filename || payload.name || item?.fileName || "").trim(),
    mimeType: String(payload.mime_type || payload.mime || item?.mimeType || "").trim(),
    size: Number(payload.size || payload.file_size || item?.size || 0) || 0,
    previewUrl: extractAttachmentPreviewUrl(item),
    raw: cloneDeep(item)
  };
}

function getEditableMeta(post = {}, config = {}) {
  const hours = getEditWindowHours(config);
  const createdAt = Number(post.createdAt || post.updatedAt || 0) || 0;
  const deadlineAt = createdAt ? createdAt + hours * 60 * 60 * 1000 : 0;
  const now = Date.now();
  const msLeft = deadlineAt ? deadlineAt - now : 0;
  return {
    windowHours: hours,
    createdAt,
    deadlineAt,
    editable: Boolean(deadlineAt) && msLeft > 0,
    msLeft: Math.max(0, msLeft)
  };
}

function buildPostAdminCard(post = {}, config = {}) {
  const editable = getEditableMeta(post, config);
  const sourceAttachments = normalizeAttachments(post.sourceAttachments || post.attachments || []);
  const attachmentSummaries = sourceAttachments.map((item, index) => summarizeAttachment(item, index));
  const mediaAttachments = attachmentSummaries.filter((item) => item.isMedia);
  return {
    commentKey: post.commentKey,
    channelId: post.channelId,
    postId: post.postId,
    messageId: post.messageId,
    originalText: post.originalText || "",
    linkedByName: post.linkedByName || "",
    commentCount: getComments(post.commentKey).length,
    createdAt: post.createdAt || 0,
    updatedAt: post.updatedAt || 0,
    lastEditedAt: post.lastEditedAt || 0,
    lastEditedBy: post.lastEditedBy || "",
    lastPatchError: post.lastPatchError || null,
    versionsCount: Array.isArray(post.versions) ? post.versions.length : 0,
    editable,
    giftCampaignId: post.giftCampaignId || "",
    sourceAttachmentsCount: sourceAttachments.length,
    mediaCount: mediaAttachments.length,
    hasMedia: mediaAttachments.length > 0,
    mediaAttachments,
    attachments: attachmentSummaries,
    customKeyboard: normalizeKeyboardBuilder(post.customKeyboard || {})
  };
}

function listAdminPosts({ channelId = "", limit = 100, config = {} } = {}) {
  return listPostsByChannel(channelId, limit).map((post) => buildPostAdminCard(post, config));
}

function ensureEditablePost(commentKey = "", config = {}) {
  const post = getPost(commentKey);
  if (!post) throw new Error("post_not_found");
  if (!post.messageId) throw new Error("message_id_missing");

  const editable = getEditableMeta(post, config);
  if (!editable.editable) throw new Error("post_edit_window_expired");

  return { post, editable };
}

async function editPostText({ commentKey = "", text = "", link = undefined, format = undefined, actorId = "", actorName = "", config = {} }) {
  const { post } = ensureEditablePost(commentKey, config);

  const nextText = normalizeText(text);
  if (!nextText) throw new Error("text_required");
  if (nextText === normalizeText(post.originalText || "")) throw new Error("text_not_changed");

  const version = savePostVersion(commentKey, {
    type: "edit",
    snapshotText: String(post.originalText || ""),
    appliedText: nextText,
    snapshotAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    appliedAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    actorId: String(actorId || "").trim(),
    actorName: String(actorName || "").trim(),
    sourceVersionId: ""
  });

  const nextLink = link !== undefined ? cloneDeep(link) : cloneDeep(post.originalLink || null);
  const nextFormat = format !== undefined ? cloneDeep(format) : cloneDeep(post.originalFormat);

  const editResult = await editMessage({
    botToken: config.botToken,
    messageId: post.messageId,
    text: nextText,
    ...(nextLink ? { link: cloneDeep(nextLink) } : {}),
    ...(nextFormat !== undefined ? { format: cloneDeep(nextFormat) } : {}),
    notify: false
  });

  savePost(commentKey, {
    originalText: nextText,
    ...(nextLink !== undefined ? { originalLink: cloneDeep(nextLink) } : {}),
    ...(nextFormat !== undefined ? { originalFormat: cloneDeep(nextFormat) } : {}),
    lastEditedAt: Date.now(),
    lastEditedBy: String(actorName || actorId || "admin").trim(),
    lastEditedById: String(actorId || "").trim(),
    lastEditVersionId: version?.id || ""
  });

  const patch = await patchStoredPost({
    botToken: config.botToken,
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    commentKey
  });

  return {
    ok: true,
    version,
    editResult,
    patch,
    post: buildPostAdminCard(getPost(commentKey), config)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAttachmentNotReadyMessage(result = {}) {
  const source = [
    result?.reason,
    result?.error?.message,
    result?.error?.data?.code,
    result?.error?.data?.message
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
  return source.includes("attachment.not.ready") || source.includes("not_processed") || source.includes("not ready");
}

async function patchStoredPostWithRetry({ commentKey = "", config = {} }) {
  const attempts = Math.max(1, Number(config.postEditorMediaPatchRetryCount || 4));
  const baseDelay = Math.max(200, Number(config.postEditorMediaPatchRetryBaseMs || 1200));
  let lastResult = null;

  for (let index = 0; index < attempts; index += 1) {
    if (index > 0) {
      await sleep(baseDelay * index);
    }
    const result = await patchStoredPost({
      botToken: config.botToken,
      appBaseUrl: config.appBaseUrl,
      botUsername: config.botUsername,
      maxDeepLinkBase: config.maxDeepLinkBase,
      commentKey
    });
    lastResult = result;
    if (result?.ok) return result;
    if (!getAttachmentNotReadyMessage(result)) return result;
  }

  return lastResult || { ok: false, reason: "patch_failed" };
}

function decodeUploadBody({ dataUrl = "", base64 = "" } = {}) {
  const raw = String(base64 || dataUrl || "").trim();
  if (!raw) throw new Error("upload_data_required");
  const cleaned = raw.includes(",") ? raw.split(",").slice(1).join(",") : raw;
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) throw new Error("upload_data_empty");
  return buffer;
}

function replaceMediaAttachments(existingAttachments = [], nextMediaAttachment = null) {
  const preserved = normalizeAttachments(existingAttachments).filter((item) => !isMediaAttachment(item) && String(item?.type || "").trim().toLowerCase() !== "inline_keyboard");
  return nextMediaAttachment ? [cloneDeep(nextMediaAttachment), ...preserved] : preserved;
}



async function setPostCommentsEnabled({ commentKey = "", enabled = true, actorId = "", actorName = "", config = {} }) {
  const { post } = ensureEditablePost(commentKey, config);
  const nextEnabled = Boolean(enabled);
  const currentEnabled = !Boolean(post.commentsDisabled);
  const snapshotBuilder = normalizeKeyboardBuilder(post.customKeyboard || {});

  const version = savePostVersion(commentKey, {
    type: "comments_toggle",
    snapshotText: String(post.originalText || ""),
    appliedText: String(post.originalText || ""),
    snapshotAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    appliedAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    snapshotKeyboard: snapshotBuilder,
    appliedKeyboard: snapshotBuilder,
    actorId: String(actorId || "").trim(),
    actorName: String(actorName || "").trim(),
    sourceVersionId: ""
  });

  savePost(commentKey, {
    commentsDisabled: !nextEnabled,
    lastEditedAt: Date.now(),
    lastEditedBy: String(actorName || actorId || "admin").trim(),
    lastEditedById: String(actorId || "").trim(),
    lastCommentsToggleAt: Date.now(),
    lastCommentsEnabled: nextEnabled,
    lastEditVersionId: version?.id || ""
  });

  const patch = await patchStoredPost({
    botToken: config.botToken,
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    commentKey
  });
  if (!patch?.ok) {
    throw new Error(patch?.error?.message || patch?.reason || "comments_toggle_patch_failed");
  }

  return {
    ok: true,
    skipped: currentEnabled === nextEnabled,
    version,
    patch,
    post: buildPostAdminCard(getPost(commentKey), config)
  };
}

async function savePostKeyboard({ commentKey = "", builder = {}, actorId = "", actorName = "", config = {} }) {
  const { post } = ensureEditablePost(commentKey, config);
  const normalizedBuilder = normalizeKeyboardBuilder(builder || {});
  const snapshotBuilder = normalizeKeyboardBuilder(post.customKeyboard || {});

  const version = savePostVersion(commentKey, {
    type: "keyboard_builder",
    snapshotText: String(post.originalText || ""),
    appliedText: String(post.originalText || ""),
    snapshotAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    appliedAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    snapshotKeyboard: snapshotBuilder,
    appliedKeyboard: normalizedBuilder,
    actorId: String(actorId || "").trim(),
    actorName: String(actorName || "").trim(),
    sourceVersionId: ""
  });

  savePost(commentKey, {
    customKeyboard: normalizedBuilder,
    lastEditedAt: Date.now(),
    lastEditedBy: String(actorName || actorId || "admin").trim(),
    lastEditedById: String(actorId || "").trim(),
    lastKeyboardEditedAt: Date.now(),
    lastKeyboardEditedBy: String(actorName || actorId || "admin").trim(),
    lastEditVersionId: version?.id || ""
  });

  const patch = await patchStoredPost({
    botToken: config.botToken,
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    commentKey
  });
  if (!patch?.ok) {
    throw new Error(patch?.error?.message || patch?.reason || "keyboard_patch_failed");
  }

  return {
    ok: true,
    version,
    patch,
    post: buildPostAdminCard(getPost(commentKey), config)
  };
}

async function replacePostMedia({ commentKey = "", upload = {}, actorId = "", actorName = "", config = {} }) {
  const { post } = ensureEditablePost(commentKey, config);
  const fileName = String(upload.fileName || upload.filename || "media.bin").trim() || "media.bin";
  const mimeType = String(upload.mimeType || upload.mime || "application/octet-stream").trim() || "application/octet-stream";
  const uploadType = detectUploadType({
    explicitType: upload.type,
    mimeType,
    fileName
  });
  const buffer = decodeUploadBody({ dataUrl: upload.dataUrl, base64: upload.base64 });
  const size = Number(upload.size || buffer.length || 0) || buffer.length;
  const maxBytes = Math.max(1024 * 1024, Number(config.postEditorMediaMaxBytes || 32 * 1024 * 1024));
  if (size > maxBytes || buffer.length > maxBytes) throw new Error("media_too_large");

  const previousAttachments = normalizeAttachments(post.sourceAttachments || post.attachments || []);
  const uploadInitResponse = await createUpload({ botToken: config.botToken, type: uploadType });
  const uploadResponse = await uploadBinaryToUrl({
    uploadUrl: uploadInitResponse?.url,
    botToken: config.botToken,
    buffer,
    fileName,
    mimeType
  });
  const uploadedAttachment = buildUploadAttachmentPayload({
    uploadType,
    uploadInitResponse,
    uploadResponse
  });

  const nextAttachments = replaceMediaAttachments(previousAttachments, uploadedAttachment);
  const version = savePostVersion(commentKey, {
    type: "media_replace",
    snapshotText: String(post.originalText || ""),
    appliedText: String(post.originalText || ""),
    snapshotAttachments: previousAttachments,
    appliedAttachments: nextAttachments,
    snapshotKeyboard: normalizeKeyboardBuilder(post.customKeyboard || {}),
    appliedKeyboard: normalizeKeyboardBuilder(post.customKeyboard || {}),
    actorId: String(actorId || "").trim(),
    actorName: String(actorName || "").trim(),
    mediaType: uploadType,
    fileName,
    mimeType,
    size,
    sourceVersionId: ""
  });

  savePost(commentKey, {
    sourceAttachments: nextAttachments,
    lastEditedAt: Date.now(),
    lastEditedBy: String(actorName || actorId || "admin").trim(),
    lastEditedById: String(actorId || "").trim(),
    lastMediaEditedAt: Date.now(),
    lastMediaEditedBy: String(actorName || actorId || "admin").trim(),
    lastEditVersionId: version?.id || ""
  });

  const patch = await patchStoredPostWithRetry({ commentKey, config });
  if (!patch?.ok) {
    savePost(commentKey, {
      sourceAttachments: previousAttachments,
      lastPatchError: patch?.error || { message: patch?.reason || "media_patch_failed" }
    });
    throw new Error(getAttachmentNotReadyMessage(patch) ? "attachment_not_ready_retry_later" : (patch?.error?.message || patch?.reason || "media_patch_failed"));
  }

  return {
    ok: true,
    version,
    patch,
    media: summarizeAttachment(uploadedAttachment, 0),
    post: buildPostAdminCard(getPost(commentKey), config)
  };
}

async function rollbackPostVersion({ commentKey = "", versionId = "", actorId = "", actorName = "", config = {} }) {
  const { post } = ensureEditablePost(commentKey, config);

  const version = listPostVersions(commentKey).find((item) => String(item.id || "") === String(versionId || ""));
  if (!version) throw new Error("version_not_found");
  const restoreText = normalizeText(version.snapshotText || post.originalText || "");
  const restoreAttachments = Array.isArray(version.snapshotAttachments)
    ? normalizeAttachments(version.snapshotAttachments)
    : normalizeAttachments(post.sourceAttachments || post.attachments || []);

  const rollbackVersion = savePostVersion(commentKey, {
    type: "rollback",
    snapshotText: String(post.originalText || ""),
    appliedText: restoreText,
    snapshotAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    appliedAttachments: restoreAttachments,
    snapshotKeyboard: normalizeKeyboardBuilder(post.customKeyboard || {}),
    appliedKeyboard: Array.isArray(version.snapshotKeyboard?.rows) || version.snapshotKeyboard?.commentButtonText ? normalizeKeyboardBuilder(version.snapshotKeyboard || {}) : normalizeKeyboardBuilder(post.customKeyboard || {}),
    actorId: String(actorId || "").trim(),
    actorName: String(actorName || "").trim(),
    sourceVersionId: String(version.id || "")
  });

  savePost(commentKey, {
    originalText: restoreText,
    sourceAttachments: restoreAttachments,
    customKeyboard: Array.isArray(version.snapshotKeyboard?.rows) || version.snapshotKeyboard?.commentButtonText ? normalizeKeyboardBuilder(version.snapshotKeyboard || {}) : normalizeKeyboardBuilder(post.customKeyboard || {}),
    lastEditedAt: Date.now(),
    lastEditedBy: String(actorName || actorId || "admin").trim(),
    lastEditedById: String(actorId || "").trim(),
    lastEditVersionId: rollbackVersion?.id || ""
  });

  const patch = await patchStoredPostWithRetry({ commentKey, config });
  if (!patch?.ok) {
    throw new Error(getAttachmentNotReadyMessage(patch) ? "attachment_not_ready_retry_later" : (patch?.error?.message || patch?.reason || "post_rollback_failed"));
  }

  return {
    ok: true,
    version: rollbackVersion,
    patch,
    restoredFromVersionId: String(version.id || ""),
    post: buildPostAdminCard(getPost(commentKey), config)
  };
}

module.exports = {
  normalizeText,
  getEditableMeta,
  buildPostAdminCard,
  listAdminPosts,
  editPostText,
  savePostKeyboard,
  setPostCommentsEnabled,
  replacePostMedia,
  rollbackPostVersion,
  listPostVersions,
  summarizeAttachment,
  detectUploadType,
  replaceMediaAttachments
};
