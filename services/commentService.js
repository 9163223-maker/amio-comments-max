const { execFileSync } = require("child_process");
const {
  getComments,
  addComment,
  getLikesMap,
  setLikeState,
  getReactionsMap,
  setReactionState,
  setComments,
  getModerationSettings,
  getPost,
  getChannelIdFromCommentKey
} = require("../store");

const DB_POLICY_SCRIPT = `
const { Pool } = require('pg');
const key = String(process.argv[1] || '').trim();
const url = String(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL || '').trim();
if (!key || !url) { console.log('null'); process.exit(0); }
const pool = new Pool({ connectionString: url, ssl: /sslmode=disable/i.test(url) ? false : { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 1800, idleTimeoutMillis: 1000 });
(async () => {
  const { rows } = await pool.query(
    'select p.channel_id as "channelId", p.post_id as "postId", p.comment_key as "commentKey", coalesce(s.comments_enabled,true) as "commentsEnabled", coalesce(r.enabled,false) as "moderationEnabled", coalesce(r.block_links,false) as "blockLinks", coalesce(r.block_invites,true) as "blockInvites", coalesce(r.custom_blocklist,\'[]\'::jsonb) as "customBlocklist" from ak_posts p left join ak_post_settings s on s.comment_key=p.comment_key left join lateral (select * from ak_moderation_rules r where r.channel_id=p.channel_id and r.scope_type=\'channel\' order by r.updated_at desc limit 1) r on true where p.comment_key=$1 order by p.updated_at desc limit 1',
    [key]
  );
  console.log(JSON.stringify(rows[0] || { commentsEnabled: true, moderationEnabled: false, customBlocklist: [] }));
  await pool.end();
})().catch(async () => { try { await pool.end(); } catch {} console.log('null'); });
`;

function sanitizeText(value) { return String(value || "").trim(); }
function normalizeDuplicateText(value = "") { return String(value || "").replace(/\s+/g, " ").trim(); }
function attachmentDuplicateFingerprint(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  return JSON.stringify(list.map((item) => ({
    id: String(item?.id || item?.uploadId || item?.clientUploadId || ""),
    type: String(item?.type || ""),
    url: String(item?.url || item?.previewUrl || item?.posterUrl || ""),
    name: String(item?.name || "")
  })));
}
function findRecentDuplicateComment({ commentKey = "", userId = "", text = "", attachments = [], windowMs = 8000 } = {}) {
  const key = String(commentKey || "").trim();
  if (!key) return null;
  const normalizedUserId = String(userId || "guest").trim() || "guest";
  const normalizedText = normalizeDuplicateText(text);
  const attachmentFp = attachmentDuplicateFingerprint(attachments);
  const now = Date.now();
  const comments = getComments(key);
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const item = comments[i] || {};
    if (now - Number(item.createdAt || 0) > windowMs) break;
    if (String(item.userId || "guest") !== normalizedUserId) continue;
    if (normalizeDuplicateText(item.text || "") !== normalizedText) continue;
    if (attachmentDuplicateFingerprint(item.attachments || []) !== attachmentFp) continue;
    return { ...item, deduped: true };
  }
  return null;
}
function stripLargeInlinePayload(value = "") { const raw = String(value || "").trim(); if (/^(data|blob):/i.test(raw)) return ""; return raw.slice(0, 4096); }
function sanitizeSmallImageDataUrl(value = "") {
  const raw = String(value || "").trim();
  const m = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!m) return "";
  const base64 = String(m[2] || "").replace(/\s+/g, "");
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (!approxBytes || approxBytes > 80 * 1024) return "";
  return `data:${m[1].toLowerCase()};base64,${base64}`;
}
function sanitizeAttachmentPayload(source = {}) {
  const payload = source.payload && typeof source.payload === "object" ? source.payload : null;
  const maxAttachment = source.maxAttachment && typeof source.maxAttachment === "object" ? source.maxAttachment : null;
  const normalized = {};
  const sourcePayload = payload || maxAttachment?.payload || {};
  ["token", "url", "download_url", "link", "file_id", "image_id", "photo_id", "video_id", "audio_id", "document_id"].forEach((key) => {
    if (sourcePayload?.[key] !== undefined && sourcePayload?.[key] !== null) normalized[key] = stripLargeInlinePayload(sourcePayload[key]);
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
    const incomingThumb = sanitizeSmallImageDataUrl(source.thumbDataUrl || source.thumb_data_url || "");
    const incomingPreview = sanitizeSmallImageDataUrl(source.previewDataUrl || source.preview_data_url || "");
    const incomingData = sanitizeSmallImageDataUrl(source.dataUrl || source.data_url || "");
    const thumbDataUrl = incomingThumb || incomingPreview || incomingData;
    const previewDataUrl = incomingPreview && incomingPreview !== thumbDataUrl ? incomingPreview : "";
    const dataUrl = incomingData && incomingData !== thumbDataUrl && incomingData !== previewDataUrl ? incomingData : "";
    const posterUrl = stripLargeInlinePayload(source.posterUrl || source.poster_url || "");
    const fallbackId = String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
    const rawUrl = stripLargeInlinePayload(source.rawUrl || source.raw_url || "");
    const uploadId = String(source.uploadId || source.clientUploadId || source.client_upload_id || "").slice(0, 180);
    const status = String(source.status || "").slice(0, 40);
    const processing = Boolean(source.processing) || status === "processing";
    const isPendingVideo = allowedType === "video" && processing && Boolean(uploadId || source.id || source.clientUploadId);
    const hasStableStoredSource = Boolean(url || previewUrl || posterUrl || rawUrl || dataUrl || previewDataUrl || thumbDataUrl || Object.keys(payload).length || isPendingVideo);
    if (!hasStableStoredSource) return null;
    const stableId = String(source.id || uploadId || payload.token || payload.file_id || payload.image_id || payload.photo_id || fallbackId);
    return {
      id: stableId, type: allowedType, name: String(source.name || "Вложение").slice(0, 180), mime: String(source.mime || source.mimeType || "").slice(0, 120), size: Number(source.size || 0) || 0,
      url, previewUrl, posterUrl, dataUrl, previewDataUrl, thumbDataUrl, payload, native: Boolean(source.native || Object.keys(payload).length), storage: String(source.storage || "").slice(0, 60), uploadId,
      clientUploadId: String(source.clientUploadId || source.client_upload_id || uploadId || "").slice(0, 180), rawUrl, processing, status, transcodeError: String(source.transcodeError || "").slice(0, 220)
    };
  }).filter(Boolean);
}
function toArray(value) { if (Array.isArray(value)) return value.map((x) => String(x || "").trim()).filter(Boolean); return String(value || "").split(/[\n,;]/g).map((x) => String(x || "").trim()).filter(Boolean); }
function resolveChannelId(commentKey = "") { const post = getPost(commentKey); if (post?.channelId) return String(post.channelId).trim(); return getChannelIdFromCommentKey(commentKey); }
function makePublicError(message, code, status = 403, data = null) { const error = new Error(message); error.status = status; error.code = code; error.publicMessage = message; if (data) error.data = data; return error; }
function readDbV3PolicySync(commentKey = "") {
  const key = String(commentKey || "").trim();
  const dbUrl = String(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL || "").trim();
  if (!key || !dbUrl) return null;
  try {
    const out = execFileSync(process.execPath, ["-e", DB_POLICY_SCRIPT, key], { env: process.env, timeout: 2800, maxBuffer: 96 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
    if (!out || out === "null") return null;
    const parsed = JSON.parse(out);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}
function checkCommentsEnabled(commentKey = "", dbPolicy = null) {
  const policy = dbPolicy || readDbV3PolicySync(commentKey);
  if (policy && policy.commentsEnabled === false) throw makePublicError("Комментарии к этому посту выключены.", "comments_disabled", 403, { source: "Postgres ak_post_settings" });
  const post = getPost(commentKey);
  if (post?.commentsDisabled === true || post?.commentsEnabled === false) throw makePublicError("Комментарии к этому посту выключены.", "comments_disabled", 403);
}
function countLinks(text) { return (String(text || "").match(/(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg|wa\.me|chat\.whatsapp\.com)/giu) || []).length; }
function checkModeration({ commentKey, userId, userName, text, dbPolicy = null }) {
  const channelId = resolveChannelId(commentKey);
  const policy = dbPolicy || readDbV3PolicySync(commentKey);
  const settings = policy?.moderationEnabled ? { enabled: true, applyPresetCommon: false, blockLinks: Boolean(policy.blockLinks), blockInvites: policy.blockInvites !== false, customBlocklist: policy.customBlocklist || [] } : getModerationSettings(channelId);
  if (!settings || settings.enabled === false) return { allowed: true, channelId, settings };
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
  const lowered = normalizedText.toLowerCase();
  const reasons = [];
  const matchedWords = [];
  if (settings.stopwordsEnabled !== false && settings.basicEnabled !== false) {
    const words = [...(settings.applyPresetCommon !== false ? toArray(settings.presetStopwords || []) : []), ...toArray(settings.customBlocklist || settings.stopwords || settings.moderationStopwords || [])];
    for (const word of words) { const w = String(word || "").trim().toLowerCase(); if (w && lowered.includes(w)) matchedWords.push(w); }
    if (matchedWords.length) reasons.push("stopwords_match");
  }
  if (settings.blockLinks && countLinks(normalizedText) > Number(settings.maxLinks || 0)) reasons.push("links_blocked");
  if (settings.blockInvites !== false && /(t\.me\/|telegram\.me\/|discord\.gg|chat\.whatsapp\.com|joinchat|invite)/iu.test(normalizedText)) reasons.push("invite_link");
  if (!reasons.length) return { allowed: true, channelId, settings };
  throw makePublicError("Комментарий не опубликован: сработала модерация.", "moderation_blocked", 403, { channelId, userId: String(userId || "guest"), userName: String(userName || "Гость"), reasons, matchedWords, source: policy?.moderationEnabled ? "Postgres ak_moderation_rules" : "store_fallback" });
}
function scheduleCommentButtonRefresh(commentKey = "") { const key = String(commentKey || "").trim(); if (!key) return; setImmediate(() => { try { const patcher = require("../db-v3-post-patcher"); if (patcher?.patchCommentsButtonByCommentKey) patcher.patchCommentsButtonByCommentKey(key).catch(() => {}); } catch {} }); }
function buildReplyPreview(allComments, replyToId) { if (!replyToId) return null; const parent = allComments.find((item) => item.id === replyToId); if (!parent) return null; return { id: parent.id, userId: String(parent.userId || ""), userName: String(parent.userName || "Гость"), text: String(parent.text || "").slice(0, 180) }; }
function enrichComments(commentKey, comments, currentUserId = "") {
  const likesMap = getLikesMap(commentKey);
  const reactionsMap = getReactionsMap(commentKey);
  const normalizedUserId = String(currentUserId || "").trim();
  const usersById = new Map();
  comments.forEach((item) => { const id = String(item.userId || "").trim(); if (!id || usersById.has(id)) return; usersById.set(id, { userId: id, userName: String(item.userName || "Гость"), avatarUrl: String(item.avatarUrl || "") }); });
  return comments.map((item) => {
    const reactionUsers = reactionsMap?.[item.id] || {};
    const reactionCounts = {}, ownReactions = [], reactionDetails = [];
    Object.entries(reactionUsers).forEach(([emoji, byUser]) => {
      const normalizedEmoji = String(emoji || "").trim();
      if (!normalizedEmoji) return;
      const users = Object.entries(byUser || {}).filter(([, isOn]) => Boolean(isOn)).map(([userId]) => String(userId));
      if (users.length) { reactionCounts[normalizedEmoji] = users.length; if (normalizedUserId && users.includes(normalizedUserId)) ownReactions.push(normalizedEmoji); reactionDetails.push({ emoji: normalizedEmoji, count: users.length, active: normalizedUserId ? users.includes(normalizedUserId) : false, users: users.slice(0, 3).map((userId) => usersById.get(userId) || { userId, userName: "", avatarUrl: "" }) }); }
    });
    return { ...item, likedByMe: normalizedUserId ? Boolean(likesMap?.[item.id]?.[normalizedUserId]) : false, reactionCounts, reactionDetails, ownReactions, replyTo: buildReplyPreview(comments, item.replyToId) };
  });
}
function listComments(commentKey, currentUserId = "") { const comments = [...getComments(commentKey)].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); return enrichComments(commentKey, comments, currentUserId); }
function createComment({ commentKey, userId, userName, text, avatarUrl, replyToId = "", attachments = [] }) {
  const cleanText = sanitizeText(text);
  const cleanAttachments = sanitizeAttachments(attachments);
  if (!cleanText && !cleanAttachments.length) throw new Error("text_or_attachment_required");
  const duplicate = findRecentDuplicateComment({ commentKey, userId, text: cleanText, attachments: cleanAttachments, windowMs: 8000 });
  if (duplicate) return duplicate;
  const dbPolicy = readDbV3PolicySync(commentKey);
  checkCommentsEnabled(commentKey, dbPolicy);
  checkModeration({ commentKey, userId, userName, text: cleanText, dbPolicy });
  const created = addComment(commentKey, { userId: String(userId || "guest"), userName: String(userName || "Гость"), avatarUrl: String(avatarUrl || ""), text: cleanText, attachments: cleanAttachments, replyToId: String(replyToId || "").trim(), editedAt: 0 });
  scheduleCommentButtonRefresh(commentKey);
  return created;
}
function toggleLike({ commentKey, commentId, userId }) {
  const comments = getComments(commentKey);
  const likesMap = getLikesMap(commentKey);
  const current = Boolean(likesMap?.[commentId]?.[String(userId || "guest")]);
  const next = !current;
  setLikeState(commentKey, commentId, userId, next);
  const updated = comments.map((item) => item.id !== commentId ? item : { ...item, likes: Math.max(0, Number(item.likes || 0) + (next ? 1 : -1)) });
  setComments(commentKey, updated);
  return updated.find((item) => item.id === commentId) || null;
}
function toggleReaction({ commentKey, commentId, userId, emoji }) { const normalizedEmoji = String(emoji || "").trim(); const normalizedUserId = String(userId || "guest").trim(); if (!normalizedEmoji) throw new Error("emoji_required"); const reactionMap = getReactionsMap(commentKey); const current = Boolean(reactionMap?.[commentId]?.[normalizedEmoji]?.[normalizedUserId]); const next = !current; setReactionState(commentKey, commentId, normalizedEmoji, normalizedUserId, next); return { commentId, emoji: normalizedEmoji, active: next }; }
function updateComment({ commentKey, commentId, userId, text }) {
  const cleanText = sanitizeText(text);
  if (!cleanText) throw new Error("text_required");
  const dbPolicy = readDbV3PolicySync(commentKey);
  checkCommentsEnabled(commentKey, dbPolicy);
  checkModeration({ commentKey, userId, text: cleanText, dbPolicy });
  const comments = getComments(commentKey);
  let found = null;
  const updated = comments.map((item) => { if (item.id !== commentId) return item; if (String(item.userId || "") !== String(userId || "")) throw new Error("forbidden"); found = { ...item, text: cleanText, editedAt: Date.now() }; return found; });
  if (!found) throw new Error("comment_not_found");
  setComments(commentKey, updated);
  return found;
}
function deleteComment({ commentKey, commentId, userId }) { const comments = getComments(commentKey); const target = comments.find((item) => item.id === commentId); if (!target) throw new Error("comment_not_found"); if (String(target.userId || "") !== String(userId || "")) throw new Error("forbidden"); setComments(commentKey, comments.filter((item) => item.id !== commentId)); scheduleCommentButtonRefresh(commentKey); return true; }
module.exports = { listComments, createComment, toggleLike, toggleReaction, updateComment, deleteComment };
