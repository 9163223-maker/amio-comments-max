
const {
  getComments,
  addComment,
  getLikesMap,
  setLikeState,
  getReactionsMap,
  setReactionState,
  setComments
} = require("../store");

function sanitizeText(value) {
  return String(value || "").trim();
}

function stripLargeInlinePayload(value = "") {
  const raw = String(value || "").trim();
  // Комментарии не должны хранить base64-файлы в store.json.
  // Большие dataUrl вызывали паузы, временное исчезновение списка и риск порчи store.
  if (/^data:/i.test(raw)) return "";
  return raw.slice(0, 4096);
}

function sanitizeAttachmentPayload(source = {}) {
  const payload = source.payload && typeof source.payload === "object" ? source.payload : null;
  const maxAttachment = source.maxAttachment && typeof source.maxAttachment === "object" ? source.maxAttachment : null;
  const normalized = {};
  const sourcePayload = payload || maxAttachment?.payload || {};
  ["token", "url", "download_url", "link", "file_id", "image_id", "photo_id", "video_id", "audio_id", "document_id"].forEach((key) => {
    if (sourcePayload?.[key] !== undefined && sourcePayload?.[key] !== null) {
      normalized[key] = stripLargeInlinePayload(sourcePayload[key]);
    }
  });
  if (sourcePayload?.photos && typeof sourcePayload.photos === "object") {
    const photos = {};
    Object.entries(sourcePayload.photos).slice(0, 8).forEach(([key, value]) => {
      const cleanKey = String(key || "").slice(0, 120);
      const cleanValue = stripLargeInlinePayload(value);
      if (cleanKey && cleanValue) photos[cleanKey] = cleanValue;
    });
    if (Object.keys(photos).length) normalized.photos = photos;
  }
  return normalized;
}

function sanitizeAttachments(value) {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 5).map((item) => {
    const source = item && typeof item === "object" ? item : {};
    const type = String(source.type || "file").trim().toLowerCase();
    const allowedType = ["image", "video", "audio", "file"].includes(type) ? type : "file";
    const payload = sanitizeAttachmentPayload(source);
    const url = stripLargeInlinePayload(source.url || payload.url || payload.download_url || payload.link || "");
    const previewUrl = stripLargeInlinePayload(source.previewUrl || source.preview_url || source.localPreviewUrl || "");
    const posterUrl = stripLargeInlinePayload(source.posterUrl || source.poster_url || "");
    const fallbackId = String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
    return {
      id: String(source.id || payload.token || payload.file_id || payload.image_id || payload.photo_id || fallbackId),
      type: allowedType,
      name: String(source.name || "Вложение").slice(0, 180),
      mime: String(source.mime || source.mimeType || "").slice(0, 120),
      size: Number(source.size || 0) || 0,
      url,
      previewUrl,
      posterUrl,
      payload,
      native: Boolean(source.native || Object.keys(payload).length)
    };
  }).filter((item) => item.url || item.previewUrl || Object.keys(item.payload || {}).length || item.name);
}

function buildReplyPreview(allComments, replyToId) {
  if (!replyToId) return null;
  const parent = allComments.find((item) => item.id === replyToId);
  if (!parent) return null;
  return {
    id: parent.id,
    userId: String(parent.userId || ""),
    userName: String(parent.userName || "Гость"),
    text: String(parent.text || "").slice(0, 180)
  };
}

function enrichComments(commentKey, comments, currentUserId = "") {
  const likesMap = getLikesMap(commentKey);
  const reactionsMap = getReactionsMap(commentKey);
  const normalizedUserId = String(currentUserId || "").trim();
  const usersById = new Map();

  comments.forEach((item) => {
    const id = String(item.userId || "").trim();
    if (!id || usersById.has(id)) return;
    usersById.set(id, {
      userId: id,
      userName: String(item.userName || "Гость"),
      avatarUrl: String(item.avatarUrl || "")
    });
  });

  return comments.map((item) => {
    const reactionUsers = reactionsMap?.[item.id] || {};
    const reactionCounts = {};
    const ownReactions = [];
    const reactionDetails = [];

    Object.entries(reactionUsers).forEach(([emoji, byUser]) => {
      const normalizedEmoji = String(emoji || "").trim();
      if (!normalizedEmoji) return;
      const users = Object.entries(byUser || {})
        .filter(([, isOn]) => Boolean(isOn))
        .map(([userId]) => String(userId));
      if (users.length) {
        reactionCounts[normalizedEmoji] = users.length;
        if (normalizedUserId && users.includes(normalizedUserId)) ownReactions.push(normalizedEmoji);
        reactionDetails.push({
          emoji: normalizedEmoji,
          count: users.length,
          active: normalizedUserId ? users.includes(normalizedUserId) : false,
          users: users.slice(0, 3).map((userId) => usersById.get(userId) || {
            userId,
            userName: "",
            avatarUrl: ""
          })
        });
      }
    });

    return {
      ...item,
      likedByMe: normalizedUserId ? Boolean(likesMap?.[item.id]?.[normalizedUserId]) : false,
      reactionCounts,
      reactionDetails,
      ownReactions,
      replyTo: buildReplyPreview(comments, item.replyToId)
    };
  });
}

function listComments(commentKey, currentUserId = "") {
  const comments = [...getComments(commentKey)].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return enrichComments(commentKey, comments, currentUserId);
}

function createComment({ commentKey, userId, userName, text, avatarUrl, replyToId = "", attachments = [] }) {
  const cleanText = sanitizeText(text);
  const cleanAttachments = sanitizeAttachments(attachments);
  if (!cleanText && !cleanAttachments.length) throw new Error("text_or_attachment_required");

  return addComment(commentKey, {
    userId: String(userId || "guest"),
    userName: String(userName || "Гость"),
    avatarUrl: String(avatarUrl || ""),
    text: cleanText,
    attachments: cleanAttachments,
    replyToId: String(replyToId || "").trim(),
    editedAt: 0
  });
}

function toggleLike({ commentKey, commentId, userId }) {
  const comments = getComments(commentKey);
  const likesMap = getLikesMap(commentKey);
  const current = Boolean(likesMap?.[commentId]?.[String(userId || "guest")]);
  const next = !current;

  setLikeState(commentKey, commentId, userId, next);

  const updated = comments.map((item) => {
    if (item.id !== commentId) return item;
    const likes = Math.max(0, Number(item.likes || 0) + (next ? 1 : -1));
    return { ...item, likes };
  });

  setComments(commentKey, updated);
  return updated.find((item) => item.id === commentId) || null;
}

function toggleReaction({ commentKey, commentId, userId, emoji }) {
  const normalizedEmoji = String(emoji || "").trim();
  const normalizedUserId = String(userId || "guest").trim();
  if (!normalizedEmoji) throw new Error("emoji_required");

  const reactionMap = getReactionsMap(commentKey);
  const current = Boolean(reactionMap?.[commentId]?.[normalizedEmoji]?.[normalizedUserId]);
  const next = !current;
  setReactionState(commentKey, commentId, normalizedEmoji, normalizedUserId, next);
  return { commentId, emoji: normalizedEmoji, active: next };
}

function updateComment({ commentKey, commentId, userId, text }) {
  const cleanText = sanitizeText(text);
  if (!cleanText) throw new Error("text_required");
  const comments = getComments(commentKey);
  let found = null;
  const updated = comments.map((item) => {
    if (item.id !== commentId) return item;
    if (String(item.userId || "") !== String(userId || "")) {
      throw new Error("forbidden");
    }
    found = { ...item, text: cleanText, editedAt: Date.now() };
    return found;
  });
  if (!found) throw new Error("comment_not_found");
  setComments(commentKey, updated);
  return found;
}

function deleteComment({ commentKey, commentId, userId }) {
  const comments = getComments(commentKey);
  const target = comments.find((item) => item.id === commentId);
  if (!target) throw new Error("comment_not_found");
  if (String(target.userId || "") !== String(userId || "")) throw new Error("forbidden");
  const updated = comments.filter((item) => item.id !== commentId);
  setComments(commentKey, updated);
  return true;
}

module.exports = {
  listComments,
  createComment,
  toggleLike,
  toggleReaction,
  updateComment,
  deleteComment
};
