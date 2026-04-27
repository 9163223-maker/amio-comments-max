const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const config = require("./config");
const { registerWebhook, getSubscriptions, createUpload, uploadBinaryToUrl, buildUploadAttachmentPayload } = require("./services/maxApi");
const botModule = require("./bot");
const {
  getDebugSnapshot,
  findPostByAnyId,
  findPostByChannelAndPost,
  normalizeKey,
  getPost,
  getLatestPost,
  normalizeHandoffToken,
  resolveCommentKeyFromHandoff,
  getPostsList,
  getChannelIdFromCommentKey,
  getModerationSettings,
  saveModerationSettings,
  listModerationLogs,
  getDefaultModerationSettings,
  getDefaultGrowthSettings,
  getGrowthSettings,
  saveGrowthSettings,
  listGrowthClicks,
  listPostsByChannel,
  getModerationLog,
  updateModerationLog
} = require("./store");
const {
  listComments,
  createComment,
  toggleLike,
  toggleReaction,
  updateComment,
  deleteComment
} = require("./services/commentService");
const { buildSetupHint } = require("./services/setupText");
const { patchStoredPost } = require("./services/postPatcher");
const { PRESET_COMMON_STOPWORDS, moderateComment } = require("./services/moderationService");
const {
  listGiftCampaigns,
  getGiftCampaign,
  saveGiftCampaign,
  listGiftClaims,
  findGiftCampaignForPost,
  claimGift,
  verifySubscription,
  getMembershipDiagnostics,
  getGiftSettings
} = require("./services/giftService");
const {
  buildAnalyticsSummary,
  buildPostAnalytics,
  getPublicGrowthData,
  recordGrowthClick,
  voteInPoll
} = require("./services/growthService");
const { listChannelAlerts } = require("./services/alertsService");
const { listChannels } = require("./services/channelService");
const { listAdminPosts, buildPostAdminCard, editPostText, savePostKeyboard, replacePostMedia, rollbackPostVersion, listPostVersions } = require("./services/postEditorService");

const app = express();

function setNoCacheHeaders(res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store"
  });
}


app.use(express.json({ limit: `${Math.max(1, Number(config.postEditorMediaBodyLimitMb || 60))}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${Math.max(1, Number(config.postEditorMediaBodyLimitMb || 60))}mb` }));
app.use("/public", express.static(path.join(__dirname, "public")));

function requireGiftAdmin(req, res, next) {
  if (!config.giftAdminToken) return next();

  const bearer = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const token =
    String(req.get("x-admin-token") || "").trim() ||
    bearer ||
    String(req.query?.adminToken || "").trim() ||
    String(req.body?.adminToken || "").trim();

  if (token !== config.giftAdminToken) {
    return res.status(403).json({ ok: false, error: "admin_forbidden" });
  }
  return next();
}



function detectCommentAttachmentType({ explicitType = "", mimeType = "", fileName = "" } = {}) {
  const explicit = String(explicitType || "").trim().toLowerCase();
  if (["image", "video", "audio", "file"].includes(explicit)) return explicit;
  const mime = String(mimeType || "").trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const name = String(fileName || "").trim().toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(name)) return "image";
  if (/\.(mp4|mov|webm|m4v)$/i.test(name)) return "video";
  if (/\.(mp3|m4a|wav|ogg|aac)$/i.test(name)) return "audio";
  return "file";
}

function decodeCommentUploadBody({ dataUrl = "", base64 = "" } = {}) {
  const raw = String(base64 || dataUrl || "").trim();
  if (!raw) throw new Error("upload_data_required");
  const cleaned = raw.includes(",") ? raw.split(",").slice(1).join(",") : raw;
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) throw new Error("upload_data_empty");
  return buffer;
}

function tryDecodeOptionalDataUrl(value = "") {
  const raw = String(value || "").trim();
  if (!/^data:/i.test(raw)) return null;
  try {
    const cleaned = raw.includes(",") ? raw.split(",").slice(1).join(",") : raw;
    const buffer = Buffer.from(cleaned, "base64");
    return buffer && buffer.length ? buffer : null;
  } catch {
    return null;
  }
}


function parseMultipartContentDisposition(value = "") {
  const result = {};
  String(value || "").split(";").forEach((part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    if (!key || !rest.length) return;
    let val = rest.join("=").trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    result[key] = val;
  });
  return result;
}

function parseMultipartBuffer(buffer, contentType = "") {
  const boundaryMatch = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("multipart_boundary_missing");
  const boundary = Buffer.from("--" + String(boundaryMatch[1] || boundaryMatch[2] || "").trim());
  const headerSep = Buffer.from("\r\n\r\n");
  const fields = {};
  const files = {};
  let cursor = 0;
  while (cursor < buffer.length) {
    const boundaryStart = buffer.indexOf(boundary, cursor);
    if (boundaryStart < 0) break;
    let partStart = boundaryStart + boundary.length;
    if (buffer[partStart] === 45 && buffer[partStart + 1] === 45) break;
    if (buffer[partStart] === 13 && buffer[partStart + 1] === 10) partStart += 2;
    const headerEnd = buffer.indexOf(headerSep, partStart);
    if (headerEnd < 0) break;
    const bodyStart = headerEnd + headerSep.length;
    const nextBoundary = buffer.indexOf(boundary, bodyStart);
    if (nextBoundary < 0) break;
    let bodyEnd = nextBoundary;
    if (bodyEnd >= 2 && buffer[bodyEnd - 2] === 13 && buffer[bodyEnd - 1] === 10) bodyEnd -= 2;
    const rawHeaders = buffer.slice(partStart, headerEnd).toString("utf8");
    const headers = {};
    rawHeaders.split(/\r?\n/g).forEach((line) => {
      const idx = line.indexOf(":");
      if (idx <= 0) return;
      headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    });
    const disposition = parseMultipartContentDisposition(headers["content-disposition"] || "");
    const name = String(disposition.name || "").trim();
    const filename = String(disposition.filename || "").trim();
    const body = buffer.slice(bodyStart, bodyEnd);
    if (name) {
      if (filename) files[name] = { buffer: body, fileName: filename, mimeType: headers["content-type"] || "application/octet-stream" };
      else fields[name] = body.toString("utf8");
    }
    cursor = nextBoundary + boundary.length;
  }
  return { fields, files };
}

function normalizeCommentAttachmentUploadRequest(req) {
  const contentType = String(req.get("content-type") || "");
  let fields = {};
  let file = null;
  let poster = null;

  if (Buffer.isBuffer(req.body)) {
    if (/multipart\/form-data/i.test(contentType)) {
      const parsed = parseMultipartBuffer(req.body, contentType);
      fields = parsed.fields || {};
      file = parsed.files?.file || Object.values(parsed.files || {})[0] || null;
      poster = parsed.files?.poster || null;
    } else {
      fields = {
        commentKey: req.get("x-comment-key") || req.query?.commentKey || "",
        type: req.get("x-upload-type") || req.query?.type || "",
        fileName: req.get("x-file-name") || req.query?.fileName || "attachment.bin",
        mimeType: req.get("x-mime-type") || contentType || "application/octet-stream",
        size: req.get("x-file-size") || String(req.body.length || 0)
      };
      file = { buffer: req.body, fileName: fields.fileName, mimeType: fields.mimeType };
    }
  } else {
    fields = req.body || {};
    const buffer = decodeCommentUploadBody({ dataUrl: fields.dataUrl || "", base64: fields.base64 || "" });
    file = {
      buffer,
      fileName: fields.fileName || fields.filename || fields.name || "attachment.bin",
      mimeType: fields.mimeType || fields.mime || "application/octet-stream"
    };
    const posterBuffer = tryDecodeOptionalDataUrl(fields.posterDataUrl || fields.posterUrl || "");
    if (posterBuffer) poster = { buffer: posterBuffer, fileName: "video-poster.jpg", mimeType: "image/jpeg" };
  }

  if (!file?.buffer?.length) throw new Error("upload_file_required");
  const fileName = String(fields.fileName || fields.filename || fields.name || file.fileName || "attachment.bin").trim() || "attachment.bin";
  const mimeType = String(fields.mimeType || fields.mime || file.mimeType || "application/octet-stream").trim() || "application/octet-stream";
  const uploadType = detectCommentAttachmentType({ explicitType: fields.type || fields.uploadType || "", mimeType, fileName });
  return {
    commentKey: normalizeKey(fields.commentKey || req.get("x-comment-key") || ""),
    fileName,
    mimeType,
    uploadType,
    buffer: file.buffer,
    size: Number(fields.size || file.buffer.length || 0) || file.buffer.length,
    posterBuffer: poster?.buffer || null,
    posterMimeType: poster?.mimeType || "image/jpeg"
  };
}

function getAttachmentPublicUrl(attachment = {}) {
  const payload = attachment?.payload && typeof attachment.payload === "object" ? attachment.payload : {};
  return String(
    payload.url ||
    payload.download_url ||
    payload.link ||
    attachment.url ||
    attachment.download_url ||
    attachment.link ||
    ""
  ).trim();
}

const COMMENT_UPLOAD_DIR = path.join(__dirname, "public", "comment-uploads");
const COMMENT_UPLOAD_URL_PREFIX = "/public/comment-uploads";

function getSafeUploadExtension({ fileName = "", mimeType = "", uploadType = "file" } = {}) {
  const nameExt = path.extname(String(fileName || "")).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12);
  if (nameExt && /^\.[a-z0-9]{1,10}$/.test(nameExt)) return nameExt;
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("quicktime")) return ".mov";
  if (mime.includes("mpeg")) return ".mp3";
  if (mime.includes("pdf")) return ".pdf";
  if (String(uploadType || "") === "image") return ".jpg";
  return ".bin";
}

function saveCommentAttachmentPreview({ buffer, fileName, mimeType, uploadType, forcedExt = "" }) {
  if (!buffer || !buffer.length) return "";
  fs.mkdirSync(COMMENT_UPLOAD_DIR, { recursive: true });
  const ext = forcedExt || getSafeUploadExtension({ fileName, mimeType, uploadType });
  const id = Date.now() + "_" + crypto.randomBytes(6).toString("hex") + ext;
  const abs = path.join(COMMENT_UPLOAD_DIR, id);
  fs.writeFileSync(abs, buffer);
  return COMMENT_UPLOAD_URL_PREFIX + "/" + encodeURIComponent(id);
}

function makePublicCommentAttachment({ uploadedAttachment, uploadType, fileName, mimeType, size, previewUrl = "", posterUrl = "" }) {
  const payload = uploadedAttachment?.payload && typeof uploadedAttachment.payload === "object" ? uploadedAttachment.payload : {};
  return {
    id: String(payload.token || payload.file_id || payload.image_id || payload.photo_id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    type: uploadType,
    name: String(fileName || "Вложение").slice(0, 180),
    mime: String(mimeType || "application/octet-stream").slice(0, 120),
    size: Number(size || 0) || 0,
    url: getAttachmentPublicUrl(uploadedAttachment),
    previewUrl: String(previewUrl || "").slice(0, 4096),
    posterUrl: String(posterUrl || "").slice(0, 4096),
    payload,
    native: true
  };
}

function parseTextList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveChannelIdFromRequest({ body = {}, query = {} } = {}) {
  const explicit = String(body.channelId || query.channelId || "").trim();
  if (explicit) return explicit;
  const commentKey = normalizeKey(body.commentKey || query.commentKey || "");
  if (commentKey) {
    const post = getPost(commentKey);
    if (post?.channelId) return String(post.channelId).trim();
    const parsed = getChannelIdFromCommentKey(commentKey);
    if (parsed) return parsed;
  }
  return "";
}

const commentCounterPatchTimers = new Map();

function scheduleCommentCounterPatch(commentKey, reason = "comment_count_changed") {
  const normalized = normalizeKey(commentKey || "");
  if (!normalized || !config.commentCounterRepatchEnabled) {
    return { scheduled: false, reason: "disabled_or_missing_comment_key" };
  }
  if (!getPost(normalized)) {
    return { scheduled: false, reason: "post_not_found" };
  }
  const previous = commentCounterPatchTimers.get(normalized);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(async () => {
    commentCounterPatchTimers.delete(normalized);
    try {
      await patchStoredPost({
        botToken: config.botToken,
        appBaseUrl: config.appBaseUrl,
        botUsername: config.botUsername,
        maxDeepLinkBase: config.maxDeepLinkBase,
        commentKey: normalized
      });
    } catch (error) {
      console.error("comment counter patch failed", normalized, reason, error?.message || error);
    }
  }, Math.max(100, Number(config.commentCounterPatchDebounceMs || 650)));
  commentCounterPatchTimers.set(normalized, timer);
  return { scheduled: true, reason };
}

async function repatchPostsForCampaign(campaign) {
  const posts = getPostsList().filter((post) => {
    if (!campaign?.channelId) return false;
    if (String(post.channelId || "") !== String(campaign.channelId || "")) return false;
    if (Array.isArray(campaign.postIds) && campaign.postIds.length > 0) {
      return campaign.postIds.includes(String(post.postId || ""));
    }
    return true;
  });

  const results = [];
  for (const post of posts) {
    const result = await patchStoredPost({
      botToken: config.botToken,
      appBaseUrl: config.appBaseUrl,
      botUsername: config.botUsername,
      maxDeepLinkBase: config.maxDeepLinkBase,
      commentKey: post.commentKey
    });
    results.push({ commentKey: post.commentKey, ok: result.ok, skipped: result.skipped || false, error: result.error || null });
  }
  return results;
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "amio-comments-max", version: "SP27" });
});

app.get("/health", async (req, res) => {
  try {
    const subscriptions = config.botToken ? await getSubscriptions({ botToken: config.botToken }) : null;
    res.json({ ok: true, subscriptions });
  } catch (error) {
    res.json({ ok: false, error: error?.message || "health_failed", data: error?.data || null });
  }
});

app.get(["/debug/store", "/debug/store-live"], (req, res) => {
  setNoCacheHeaders(res);
  res.json(getDebugSnapshot());
});

app.get("/api/diagnostics", (req, res) => {
  setNoCacheHeaders(res);
  const latestPost = getLatestPost();
  res.json({
    ok: true,
    runtimeVersion: getDebugSnapshot().runtimeVersion,
    generatedAt: Date.now(),
    requestQuery: req.query || {},
    latestPost: latestPost
      ? {
          commentKey: latestPost.commentKey || "",
          postId: latestPost.postId || "",
          messageId: latestPost.messageId || "",
          originalText: latestPost.originalText || latestPost.postText || "",
          giftCampaignId: latestPost.giftCampaignId || ""
        }
      : null,
    channels: getDebugSnapshot().channels || {},
    moderationChannels: getDebugSnapshot().moderation?.byChannel || {},
    gifts: listGiftCampaigns(),
    giftSettings: getGiftSettings()
  });
});

app.get("/debug/setup", (req, res) => {
  res.type("text/plain").send(buildSetupHint(config.maxDeepLinkBase || config.appBaseUrl));
});

app.get(["/mini-app", "/app"], (req, res) => {
  res.sendFile(path.join(__dirname, "mini-app.html"));
});

app.get("/moderation", (req, res) => {
  res.sendFile(path.join(__dirname, "moderation.html"));
});

app.get("/posts", (req, res) => {
  res.sendFile(path.join(__dirname, "posts.html"));
});

app.get(["/dashboard", "/analytics"], (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.get("/fallback", (req, res) => {
  res.sendFile(path.join(__dirname, "fallback.html"));
});


app.get("/api/moderation/presets", requireGiftAdmin, (req, res) => {
  res.json({
    ok: true,
    presets: {
      commonStopwords: PRESET_COMMON_STOPWORDS,
      tariffPresets: {
        basic: {
          tariffPreset: "basic",
          enabled: true,
          basicEnabled: true,
          aiEnabled: false,
          action: "reject",
          applyPresetCommon: true,
          blockInvites: true,
          blockLinks: false,
          maxLinks: 2,
          maxRepeatedChars: 6,
          maxUppercaseRatio: 0.75
        },
        premium_ai: {
          tariffPreset: "premium_ai",
          enabled: true,
          basicEnabled: true,
          aiEnabled: true,
          action: "reject",
          applyPresetCommon: true,
          blockInvites: true,
          blockLinks: true,
          maxLinks: 1,
          maxRepeatedChars: 5,
          maxUppercaseRatio: 0.7
        }
      }
    }
  });
});

app.get("/api/moderation/settings", requireGiftAdmin, (req, res) => {
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  if (!channelId) {
    return res.json({ ok: true, channelId: "", settings: getDefaultModerationSettings("") });
  }
  return res.json({ ok: true, channelId, settings: getModerationSettings(channelId) });
});

app.post("/api/moderation/settings", requireGiftAdmin, (req, res) => {
  try {
    const channelId = resolveChannelIdFromRequest({ body: req.body });
    if (!channelId) {
      return res.status(400).json({ ok: false, error: "channelId_required" });
    }

    const payload = {
      tariffPreset: String(req.body?.tariffPreset || "basic").trim() || "basic",
      enabled: Boolean(req.body?.enabled),
      basicEnabled: Boolean(req.body?.basicEnabled),
      aiEnabled: Boolean(req.body?.aiEnabled),
      action: String(req.body?.action || "reject").trim() || "reject",
      applyPresetCommon: Boolean(req.body?.applyPresetCommon),
      blockInvites: Boolean(req.body?.blockInvites),
      blockLinks: Boolean(req.body?.blockLinks),
      maxLinks: Number(req.body?.maxLinks || 0),
      maxRepeatedChars: Number(req.body?.maxRepeatedChars || 6),
      minTextLengthForCapsCheck: Number(req.body?.minTextLengthForCapsCheck || 8),
      maxUppercaseRatio: Number(req.body?.maxUppercaseRatio || 0.75),
      customBlocklist: parseTextList(req.body?.customBlocklist),
      regexRules: parseTextList(req.body?.regexRules),
      whitelistUsers: parseTextList(req.body?.whitelistUsers),
      shadowBanUsers: parseTextList(req.body?.shadowBanUsers),
      notes: String(req.body?.notes || "")
    };

    const settings = saveModerationSettings(channelId, payload);
    return res.json({ ok: true, channelId, settings });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "moderation_settings_save_failed" });
  }
});

app.get("/api/moderation/logs", requireGiftAdmin, (req, res) => {
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  const commentKey = normalizeKey(req.query.commentKey || "");
  const limit = Number(req.query.limit || 100);
  return res.json({ ok: true, channelId, commentKey, logs: listModerationLogs({ channelId, commentKey, limit }) });
});

app.get("/api/growth/settings", requireGiftAdmin, (req, res) => {
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  if (!channelId) {
    return res.json({ ok: true, channelId: "", settings: getDefaultGrowthSettings("") });
  }
  return res.json({ ok: true, channelId, settings: getGrowthSettings(channelId) });
});

app.post("/api/growth/settings", requireGiftAdmin, async (req, res) => {
  try {
    const channelId = resolveChannelIdFromRequest({ body: req.body });
    if (!channelId) {
      return res.status(400).json({ ok: false, error: "channelId_required" });
    }

    const payload = {
      planTier: String(req.body?.planTier || "free").trim() || "free",
      brandName: String(req.body?.brandName || config.growthDefaultBrandName || "АдминКит").trim() || "АдминКит",
      whiteLabelEnabled: Boolean(req.body?.whiteLabelEnabled),
      agencyMode: Boolean(req.body?.agencyMode),
      agencyBrandName: String(req.body?.agencyBrandName || config.growthDefaultAgencyBrandName || "").trim(),
      brandUrl: String(req.body?.brandUrl || "").trim(),
      leadMagnetEnabled: req.body?.leadMagnetEnabled !== false,
      leadMagnetText: String(req.body?.leadMagnetText || "Подключить такие же комментарии в свой канал").trim(),
      leadMagnetUrl: String(req.body?.leadMagnetUrl || config.growthDefaultLeadMagnetUrl || "").trim(),
      keyboardLeadMagnetEnabled: req.body?.keyboardLeadMagnetEnabled !== false,
      trackedButtons: Array.isArray(req.body?.trackedButtons) ? req.body.trackedButtons : [],
      poll: req.body?.poll || {},
      notes: String(req.body?.notes || "").trim()
    };

    const settings = saveGrowthSettings(channelId, payload);

    const repatchResults = [];
    const channelPosts = getPostsList().filter((post) => String(post.channelId || "") === channelId);
    for (const post of channelPosts) {
      const result = await patchStoredPost({
        botToken: config.botToken,
        appBaseUrl: config.appBaseUrl,
        botUsername: config.botUsername,
        maxDeepLinkBase: config.maxDeepLinkBase,
        commentKey: post.commentKey
      });
      repatchResults.push({ commentKey: post.commentKey, ok: result.ok, skipped: result.skipped || false });
    }

    return res.json({ ok: true, channelId, settings, repatchResults });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "growth_settings_save_failed" });
  }
});

app.get("/api/channels", requireGiftAdmin, (req, res) => {
  try {
    const channels = listChannels().map((item) => ({
      channelId: String(item.channelId || '').trim(),
      title: String(item.title || item.channelTitle || item.name || item.channelId || '').trim(),
      updatedAt: item.updatedAt || 0
    })).filter((item) => item.channelId);
    return res.json({ ok: true, channels });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'channels_list_failed' });
  }
});

app.get("/api/analytics/summary", requireGiftAdmin, async (req, res) => {
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  return res.json({ ok: true, channelId, summary: await buildAnalyticsSummary(channelId, config) });
});

app.get("/api/analytics/post", requireGiftAdmin, (req, res) => {
  const commentKey = normalizeKey(req.query.commentKey || '');
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  const postId = String(req.query.postId || '').trim();
  const posts = listAdminPosts({ channelId, limit: 500, config });
  const post = posts.find((item) => (commentKey && item.commentKey === commentKey) || (postId && item.postId === postId));
  if (!post) return res.status(404).json({ ok: false, error: 'post_not_found' });
  const analytics = buildPostAnalytics(post.commentKey || '');
  if (!analytics) return res.status(404).json({ ok: false, error: 'post_not_found' });
  return res.json({ ok: true, post: analytics });
});

app.get("/api/alerts", requireGiftAdmin, (req, res) => {
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  const limit = Number(req.query.limit || 20);
  return res.json({ ok: true, channelId, alerts: listChannelAlerts({ channelId, config, limit }) });
});

app.get("/api/posts", requireGiftAdmin, (req, res) => {
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  const limit = Number(req.query.limit || 100);
  return res.json({ ok: true, channelId, posts: listAdminPosts({ channelId, limit, config }) });
});

app.get("/api/posts/item", requireGiftAdmin, (req, res) => {
  const commentKey = normalizeKey(req.query.commentKey || "");
  const post = commentKey ? getPost(commentKey) : null;
  if (!post) return res.status(404).json({ ok: false, error: "post_not_found" });
  return res.json({ ok: true, post: buildPostAdminCard(post, config) });
});

app.get("/api/posts/history", requireGiftAdmin, (req, res) => {
  const commentKey = normalizeKey(req.query.commentKey || "");
  if (!commentKey) return res.status(400).json({ ok: false, error: "commentKey_required" });
  return res.json({ ok: true, commentKey, versions: listPostVersions(commentKey) });
});

app.post("/api/posts/edit", requireGiftAdmin, async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    if (!commentKey) return res.status(400).json({ ok: false, error: "commentKey_required" });
    const result = await editPostText({
      commentKey,
      text: req.body?.text || "",
      actorId: String(req.body?.actorId || "").trim(),
      actorName: String(req.body?.actorName || "admin").trim(),
      config
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "post_edit_failed" });
  }
});

app.post("/api/posts/keyboard", requireGiftAdmin, async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    if (!commentKey) return res.status(400).json({ ok: false, error: "commentKey_required" });
    const result = await savePostKeyboard({
      commentKey,
      builder: {
        enabled: req.body?.enabled !== false,
        commentButtonText: req.body?.commentButtonText || "",
        rows: Array.isArray(req.body?.rows) ? req.body.rows : []
      },
      actorId: String(req.body?.actorId || "").trim(),
      actorName: String(req.body?.actorName || "admin").trim(),
      config
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "post_keyboard_save_failed" });
  }
});

app.post("/api/posts/media", requireGiftAdmin, async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    if (!commentKey) return res.status(400).json({ ok: false, error: "commentKey_required" });
    const result = await replacePostMedia({
      commentKey,
      upload: {
        type: req.body?.uploadType || req.body?.type || "",
        fileName: req.body?.fileName || req.body?.filename || "",
        mimeType: req.body?.mimeType || req.body?.mime || "",
        size: req.body?.size || 0,
        dataUrl: req.body?.dataUrl || "",
        base64: req.body?.base64 || ""
      },
      actorId: String(req.body?.actorId || "").trim(),
      actorName: String(req.body?.actorName || "admin").trim(),
      config
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "post_media_replace_failed" });
  }
});

app.post("/api/posts/rollback", requireGiftAdmin, async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    const versionId = String(req.body?.versionId || "").trim();
    if (!commentKey || !versionId) return res.status(400).json({ ok: false, error: "commentKey_and_versionId_required" });
    const result = await rollbackPostVersion({
      commentKey,
      versionId,
      actorId: String(req.body?.actorId || "").trim(),
      actorName: String(req.body?.actorName || "admin").trim(),
      config
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "post_rollback_failed" });
  }
});

app.get("/api/moderation/queue", requireGiftAdmin, (req, res) => {
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  const limit = Number(req.query.limit || 100);
  const logs = listModerationLogs({ channelId, limit: Math.max(limit, 200) })
    .filter((item) => item.decision === "queued" || (item.decision === "blocked" && item.action === "queue"))
    .slice(0, Math.max(1, Math.min(limit, 200)));
  return res.json({ ok: true, channelId, items: logs });
});

app.post("/api/moderation/resolve", requireGiftAdmin, async (req, res) => {
  try {
    const logId = String(req.body?.logId || "").trim();
    const resolution = String(req.body?.resolution || "").trim();
    if (!logId || !resolution) return res.status(400).json({ ok: false, error: "logId_and_resolution_required" });
    const log = getModerationLog(logId);
    if (!log) return res.status(404).json({ ok: false, error: "moderation_log_not_found" });

    let comment = null;
    if (resolution === "approve") {
      if (String(log.sourceType || "create") === "update" && log.commentId) {
        comment = updateComment({ commentKey: log.commentKey, commentId: log.commentId, userId: log.userId, text: log.text });
      } else {
        comment = createComment({
          commentKey: log.commentKey,
          userId: log.userId || "guest",
          userName: log.userName || "Гость",
          avatarUrl: log.avatarUrl || "",
          text: log.text || "",
          replyToId: log.replyToId || "",
          attachments: log.attachments || []
        });
      }
      // Не репатчим исходный пост при публикации комментария из очереди:
      // это сохраняет нативные реакции MAX на самом посте.
    }

    const updated = updateModerationLog(logId, {
      resolvedAt: Date.now(),
      resolvedBy: String(req.body?.actorName || req.body?.actorId || "admin").trim(),
      resolution
    });
    return res.json({ ok: true, item: updated, comment });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "moderation_resolve_failed" });
  }
});

app.get("/api/growth/clicks", requireGiftAdmin, (req, res) => {
  const channelId = resolveChannelIdFromRequest({ query: req.query });
  const limit = Number(req.query.limit || 100);
  return res.json({ ok: true, channelId, clicks: listGrowthClicks({ channelId, limit }) });
});

app.post("/api/poll/vote", async (req, res) => {
  try {
    const channelId = resolveChannelIdFromRequest({ body: req.body });
    const optionId = String(req.body?.optionId || "").trim();
    const postId = String(req.body?.postId || "").trim();
    const commentKey = normalizeKey(req.body?.commentKey || "");
    const userId = String(req.body?.userId || "guest").trim() || "guest";
    if (!channelId || !optionId) {
      return res.status(400).json({ ok: false, error: "channelId_and_optionId_required" });
    }
    const result = voteInPoll({ channelId, optionId, postId, commentKey, userId });
    return res.json({ ok: true, vote: result.vote, poll: getPublicGrowthData({ channelId, postId, commentKey, currentUserId: userId, config }).poll });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "poll_vote_failed" });
  }
});

app.get("/go/:channelId/:buttonId", (req, res) => {
  const channelId = String(req.params.channelId || "").trim();
  const buttonId = String(req.params.buttonId || "").trim();
  const postId = String(req.query.postId || "").trim();
  const commentKey = normalizeKey(req.query.commentKey || "");
  const userId = String(req.query.userId || "").trim();
  const source = String(req.query.source || "button").trim();
  const targetOverride = String(req.query.target || "").trim();
  const buttonTextOverride = String(req.query.buttonText || "").trim();

  const { targetUrl } = recordGrowthClick({
    channelId,
    buttonId,
    postId,
    commentKey,
    userId,
    config,
    source,
    buttonTextOverride,
    targetUrlOverride: targetOverride
  });

  const redirectUrl = targetOverride || targetUrl || config.maxDeepLinkBase || config.appBaseUrl || "/";
  return res.redirect(302, redirectUrl);
});

app.get("/api/post", (req, res) => {
  const commentKey = normalizeKey(req.query.commentKey || "");
  const startapp = normalizeKey(req.query.startapp || req.query.start_param || req.query.WebAppStartParam || req.query.postId || "");
  const handoff = normalizeHandoffToken(req.query.handoff || startapp || "");
  const channelId = String(req.query.channelId || "").trim();
  const postId = String(req.query.postId || "").trim();

  let post = null;

  if (commentKey) post = getPost(commentKey);
  if (!post && handoff) {
    const handoffCommentKey = resolveCommentKeyFromHandoff(handoff);
    if (handoffCommentKey) post = getPost(handoffCommentKey);
  }
  if (!post && channelId && postId) post = findPostByChannelAndPost(channelId, postId);
  if (!post && startapp) post = findPostByAnyId(startapp);

  if (!post) {
    return res.status(404).json({ ok: false, error: "post_not_found", requested: { commentKey, channelId, postId, startapp, handoff } });
  }

  const giftCampaign = findGiftCampaignForPost({ channelId: post.channelId, postId: post.postId });
  const growth = getPublicGrowthData({
    channelId: post.channelId,
    postId: post.postId,
    commentKey: post.commentKey,
    currentUserId: String(req.query.userId || "").trim(),
    config
  });
  return res.json({
    ok: true,
    post,
    fallbackUsed: false,
    growth,
    adminkitLink: config.maxDeepLinkBase ? `${String(config.maxDeepLinkBase).replace(/\/$/, "")}?start=menu` : "https://max.ru/id781310320690_bot?start=menu",
    giftCampaign: giftCampaign
      ? {
          id: giftCampaign.id,
          title: giftCampaign.title,
          description: giftCampaign.description,
          giftButtonText: giftCampaign.giftButtonText
        }
      : null
  });
});



app.post("/api/comments/attachments/upload", express.raw({
  type: (req) => !String(req.headers["content-type"] || "").toLowerCase().includes("application/json"),
  limit: String(Math.max(1, Number(config.postEditorMediaBodyLimitMb || 60))) + "mb"
}), async (req, res) => {
  let parsed = null;
  let previewUrl = "";
  let posterUrl = "";
  try {
    parsed = normalizeCommentAttachmentUploadRequest(req);
    if (!parsed.commentKey) return res.status(400).json({ ok: false, error: "commentKey_required" });

    const maxBytes = Math.max(1024 * 1024, Number(config.commentAttachmentMaxBytes || config.postEditorMediaMaxBytes || 32 * 1024 * 1024));
    if (parsed.size > maxBytes || parsed.buffer.length > maxBytes) return res.status(413).json({ ok: false, error: "comment_attachment_too_large" });

    // SP27: preview сохраняем до внешнего MAX-upload, чтобы медиа-комментарий не исчезал,
    // даже если MAX временно не принял файл или вернул attachment.not.ready.
    previewUrl = saveCommentAttachmentPreview({ buffer: parsed.buffer, fileName: parsed.fileName, mimeType: parsed.mimeType, uploadType: parsed.uploadType });
    if (parsed.uploadType === "video" && parsed.posterBuffer && parsed.posterBuffer.length < 3 * 1024 * 1024) {
      const posterName = (parsed.fileName.replace(/\.[^.]+$/, "") || "video") + "-poster.jpg";
      posterUrl = saveCommentAttachmentPreview({
        buffer: parsed.posterBuffer,
        fileName: posterName,
        mimeType: "image/jpeg",
        uploadType: "image",
        forcedExt: ".jpg"
      });
    }

    if (!config.botToken) {
      const attachment = makePublicCommentAttachment({ uploadedAttachment: {}, uploadType: parsed.uploadType, fileName: parsed.fileName, mimeType: parsed.mimeType, size: parsed.size, previewUrl, posterUrl });
      attachment.native = false;
      attachment.localOnly = true;
      attachment.uploadError = "bot_token_missing";
      return res.json({ ok: true, attachment, maxAttachment: null, uploadMode: "local_fallback", warning: "bot_token_missing" });
    }

    try {
      const uploadInitResponse = await createUpload({ botToken: config.botToken, type: parsed.uploadType });
      const uploadResponse = await uploadBinaryToUrl({
        uploadUrl: uploadInitResponse?.url,
        botToken: config.botToken,
        buffer: parsed.buffer,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType
      });
      const uploadedAttachment = buildUploadAttachmentPayload({ uploadType: parsed.uploadType, uploadInitResponse, uploadResponse });
      const attachment = makePublicCommentAttachment({
        uploadedAttachment,
        uploadType: parsed.uploadType,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        size: parsed.size,
        previewUrl,
        posterUrl
      });
      return res.json({ ok: true, attachment, maxAttachment: uploadedAttachment, uploadMode: Buffer.isBuffer(req.body) ? "binary" : "json_compat" });
    } catch (uploadError) {
      const attachment = makePublicCommentAttachment({ uploadedAttachment: {}, uploadType: parsed.uploadType, fileName: parsed.fileName, mimeType: parsed.mimeType, size: parsed.size, previewUrl, posterUrl });
      attachment.native = false;
      attachment.localOnly = true;
      attachment.uploadError = uploadError?.message || "max_upload_failed";
      return res.json({ ok: true, attachment, maxAttachment: null, uploadMode: "local_fallback", warning: attachment.uploadError, data: uploadError?.data || null });
    }
  } catch (error) {
    return res.status(error?.status || 400).json({ ok: false, error: error?.message || "comment_attachment_upload_failed", data: error?.data || null });
  }
});
app.get("/api/comments", (req, res) => {
  const commentKey = normalizeKey(req.query.commentKey || "");
  const currentUserId = String(req.query.userId || "").trim();
  if (!commentKey) {
    return res.status(400).json({ ok: false, error: "commentKey_required" });
  }

  const post = getPost(commentKey);
  const comments = listComments(commentKey, currentUserId);
  return res.json({ ok: true, post, comments, count: comments.length });
});

app.post("/api/comments", async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    if (!commentKey) {
      return res.status(400).json({ ok: false, error: "commentKey_required" });
    }

    const moderation = await moderateComment({
      commentKey,
      channelId: resolveChannelIdFromRequest({ body: req.body }),
      userId: req.body?.userId || "guest",
      userName: req.body?.userName || "Гость",
      text: req.body?.text || "",
      replyToId: req.body?.replyToId || "",
      avatarUrl: req.body?.avatarUrl || "",
      attachments: req.body?.attachments || [],
      sourceType: "create",
      config
    });

    if (!moderation.allowed) {
      return res.status(403).json({
        ok: false,
        error: "comment_blocked_by_moderation",
        moderation: {
          action: moderation.action,
          mode: moderation.mode,
          reasons: moderation.reasons,
          labels: moderation.labels || [],
          matchedWords: moderation.matchedWords || [],
          matchedRegex: moderation.matchedRegex || []
        }
      });
    }

    const comment = createComment({
      commentKey,
      userId: req.body?.userId || "guest",
      userName: req.body?.userName || "Гость",
      avatarUrl: req.body?.avatarUrl || "",
      text: req.body?.text || "",
      replyToId: req.body?.replyToId || "",
      attachments: req.body?.attachments || []
    });

    const patch = scheduleCommentCounterPatch(commentKey, "comment_create_updates_channel_button_count");

    return res.json({ ok: true, comment, patch, moderation });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "comment_create_failed" });
  }
});

app.post("/api/comments/like", async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    const commentId = String(req.body?.commentId || "").trim();
    const userId = String(req.body?.userId || "guest").trim();

    if (!commentKey || !commentId) {
      return res.status(400).json({ ok: false, error: "commentKey_and_commentId_required" });
    }

    const comment = toggleLike({ commentKey, commentId, userId });
    const patch = {
      ok: true,
      skipped: true,
      reason: "comment_like_does_not_repatch_channel_post_to_preserve_native_reactions"
    };

    return res.json({ ok: true, comment, patch });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "like_toggle_failed" });
  }
});

app.post("/api/comments/react", async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    const commentId = String(req.body?.commentId || "").trim();
    const userId = String(req.body?.userId || "guest").trim();
    const emoji = String(req.body?.emoji || "").trim();

    if (!commentKey || !commentId || !emoji) {
      return res.status(400).json({ ok: false, error: "commentKey_commentId_emoji_required" });
    }

    const result = toggleReaction({ commentKey, commentId, userId, emoji });
    const comment = listComments(commentKey, userId).find((item) => String(item.id || "") === String(commentId));
    return res.json({ ok: true, result, comment: comment || null });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "reaction_toggle_failed" });
  }
});

app.post("/api/comments/update", async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    const commentId = String(req.body?.commentId || "").trim();
    const userId = String(req.body?.userId || "guest").trim();
    const text = String(req.body?.text || "");

    if (!commentKey || !commentId) {
      return res.status(400).json({ ok: false, error: "commentKey_and_commentId_required" });
    }

    const moderation = await moderateComment({
      commentKey,
      channelId: resolveChannelIdFromRequest({ body: req.body }),
      userId,
      userName: req.body?.userName || "Гость",
      text,
      replyToId: req.body?.replyToId || "",
      sourceType: "update",
      commentId,
      config
    });

    if (!moderation.allowed) {
      return res.status(403).json({ ok: false, error: "comment_blocked_by_moderation", moderation });
    }

    const comment = updateComment({ commentKey, commentId, userId, text });
    return res.json({ ok: true, comment, moderation });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "comment_update_failed" });
  }
});

app.post("/api/comments/delete", async (req, res) => {
  try {
    const commentKey = normalizeKey(req.body?.commentKey || "");
    const commentId = String(req.body?.commentId || "").trim();
    const userId = String(req.body?.userId || "guest").trim();

    if (!commentKey || !commentId) {
      return res.status(400).json({ ok: false, error: "commentKey_and_commentId_required" });
    }

    await deleteComment({ commentKey, commentId, userId });
    const patch = scheduleCommentCounterPatch(commentKey, "comment_delete_updates_channel_button_count");
    return res.json({ ok: true, patch });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "comment_delete_failed" });
  }
});

app.get("/api/gifts/campaigns", (req, res) => {
  return res.json({ ok: true, campaigns: listGiftCampaigns() });
});

app.get("/api/gifts/claims", requireGiftAdmin, (req, res) => {
  const campaignId = normalizeKey(req.query.campaignId || "");
  return res.json({ ok: true, claims: listGiftClaims(campaignId) });
});

app.post("/api/gifts/campaigns/upsert", requireGiftAdmin, async (req, res) => {
  try {
    const previousCampaign = getGiftCampaign(req.body?.id || req.body?.campaignId || "");
    const campaign = saveGiftCampaign(req.body || {});
    const repatchResults = [
      ...(previousCampaign && previousCampaign.channelId && previousCampaign.channelId !== campaign.channelId ? await repatchPostsForCampaign(previousCampaign) : []),
      ...await repatchPostsForCampaign(campaign)
    ];
    return res.json({ ok: true, campaign, repatchResults });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "gift_campaign_upsert_failed" });
  }
});

app.post("/api/gifts/claim", async (req, res) => {
  try {
    const result = await claimGift({
      botToken: config.botToken,
      campaignId: String(req.body?.campaignId || "").trim(),
      userId: String(req.body?.userId || "").trim(),
      userName: String(req.body?.userName || "").trim(),
      callbackId: String(req.body?.callbackId || "").trim()
    });
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "gift_claim_failed", data: error?.data || null });
  }
});

app.post("/api/gifts/check", async (req, res) => {
  try {
    const result = await verifySubscription({
      botToken: config.botToken,
      chatId: String(req.body?.chatId || "").trim(),
      userId: String(req.body?.userId || "").trim()
    });
    const diagnostics = await getMembershipDiagnostics({
      botToken: config.botToken,
      chatId: String(req.body?.chatId || "").trim()
    });
    return res.json({ ok: true, result, diagnostics });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || "gift_check_failed", data: error?.data || null });
  }
});

app.post(config.webhookPath, async (req, res) => botModule.handleWebhook(req, res, config));

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

const port = Number(config.port || 3000);

app.listen(port, async () => {
  console.log(`Server started on port ${port}`);
  console.log("APP_BASE_URL:", config.appBaseUrl);
  console.log("WEBHOOK_PATH:", config.webhookPath);
  console.log("BOT_USERNAME:", config.botUsername);
  console.log("MAX_DEEP_LINK_BASE:", config.maxDeepLinkBase);

  try {
    const webhookUrl = `${config.appBaseUrl}${config.webhookPath}`;
    const result = await registerWebhook({
      botToken: config.botToken,
      webhookUrl,
      secret: config.webhookSecret
    });

    console.log("Webhook subscription result:", JSON.stringify(result));
    console.log("Webhook endpoint:", webhookUrl);
  } catch (error) {
    console.error("Webhook registration failed:", error?.message || error);
    if (error?.data) {
      console.error("Webhook registration error data:", JSON.stringify(error.data));
    }
  }
});
