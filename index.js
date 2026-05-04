const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { getBuildInfo, BUILD_INFO } = require("./buildInfo");
const execFileAsync = promisify(execFile);

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
  updateModerationLog,
  addUploadDiagnostic,
  saveStore,
  store
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
const deferredVideoResults = new Map();

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

function makeHttpError(message, status = 400, data = null) {
  const error = new Error(message);
  error.status = status;
  if (data) error.data = data;
  return error;
}

function getMultipartBoundary(contentType = "") {
  const boundaryMatch = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return String(boundaryMatch?.[1] || boundaryMatch?.[2] || "").trim();
}

function buildUploadRequestDiagnostics(req, body = Buffer.alloc(0), multipartDiagnostics = {}) {
  const contentType = String(req.get("content-type") || "");
  const contentLength = String(req.get("content-length") || "");
  const boundary = getMultipartBoundary(contentType);
  const rawBodyLength = Buffer.isBuffer(body) ? body.length : 0;
  return {
    contentType: contentType.slice(0, 220),
    contentLength: contentLength.slice(0, 40),
    rawBodyLength,
    isMultipart: /multipart\/form-data/i.test(contentType),
    hasBoundary: Boolean(boundary),
    boundaryLength: boundary.length,
    fieldNames: Array.isArray(multipartDiagnostics.fieldNames) ? multipartDiagnostics.fieldNames.slice(0, 30) : [],
    fileFieldNames: Array.isArray(multipartDiagnostics.fileFieldNames) ? multipartDiagnostics.fileFieldNames.slice(0, 30) : [],
    fileCount: Number(multipartDiagnostics.fileCount || 0) || 0,
    partCount: Number(multipartDiagnostics.partCount || 0) || 0
  };
}

function parseMultipartBuffer(buffer, contentType = "") {
  const boundaryValue = getMultipartBoundary(contentType);
  if (!boundaryValue) throw makeHttpError("multipart_boundary_missing", 400, {
    contentType: String(contentType || "").slice(0, 220),
    contentLength: "",
    rawBodyLength: Buffer.isBuffer(buffer) ? buffer.length : 0,
    isMultipart: /multipart\/form-data/i.test(String(contentType || "")),
    hasBoundary: false,
    boundaryLength: 0,
    fieldNames: [],
    fileFieldNames: [],
    fileCount: 0,
    partCount: 0
  });
  const boundary = Buffer.from("--" + boundaryValue);
  const headerSep = Buffer.from("\r\n\r\n");
  const fields = {};
  const files = {};
  const diagnostics = { fieldNames: [], fileFieldNames: [], fileCount: 0, partCount: 0 };
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
      diagnostics.partCount += 1;
      if (filename) {
        diagnostics.fileCount += 1;
        diagnostics.fileFieldNames.push(name);
        files[name] = {
          buffer: body,
          fileName: filename,
          mimeType: headers["content-type"] || "application/octet-stream"
        };
      } else {
        diagnostics.fieldNames.push(name);
        fields[name] = body.toString("utf8");
      }
    }

    cursor = nextBoundary + boundary.length;
  }

  return { fields, files, diagnostics };
}

function normalizeCommentAttachmentUploadRequest(req) {
  const contentType = String(req.get("content-type") || "");
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const initialDiagnostics = buildUploadRequestDiagnostics(req, rawBody);

  if (/application\/json/i.test(contentType) && req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    const body = req.body || {};
    const buffer = decodeCommentUploadBody({ dataUrl: body.dataUrl || body.data_url || "", base64: body.base64 || "" });
    const fileName = String(body.fileName || body.filename || body.name || "attachment.bin").trim() || "attachment.bin";
    const mimeType = String(body.mimeType || body.mime || "application/octet-stream").trim() || "application/octet-stream";
    const uploadType = detectCommentAttachmentType({ explicitType: body.type || body.uploadType || "", mimeType, fileName });
    const diagnostics = {
      ...initialDiagnostics,
      contentType: contentType.slice(0, 220),
      rawBodyLength: buffer.length,
      isMultipart: false,
      hasBoundary: false,
      fieldNames: ["json:dataUrl"],
      fileFieldNames: ["json:dataUrl"],
      fileCount: 1,
      partCount: 1,
      fallbackReason: String(body.fallbackReason || req.get("x-upload-fallback") || "json_fallback").slice(0, 80)
    };
    return {
      commentKey: normalizeKey(body.commentKey || req.get("x-comment-key") || ""),
      clientUploadId: String(body.clientUploadId || body.client_upload_id || req.get("x-client-upload-id") || "").trim().slice(0, 120),
      fileName,
      mimeType,
      uploadType,
      buffer,
      size: Number(body.size || buffer.length || 0) || buffer.length,
      posterBuffer: tryDecodeOptionalDataUrl(body.posterDataUrl || body.poster_data_url || ""),
      posterMimeType: "image/jpeg",
      uploadDiagnostics: diagnostics
    };
  }

  if (!/multipart\/form-data/i.test(contentType)) {
    throw makeHttpError("upload_multipart_or_json_required", 415, initialDiagnostics);
  }
  if (!rawBody.length) {
    throw makeHttpError("upload_body_empty", 400, initialDiagnostics);
  }

  const parsed = parseMultipartBuffer(rawBody, contentType);
  const diagnostics = buildUploadRequestDiagnostics(req, rawBody, parsed.diagnostics || {});
  const fields = parsed.fields || {};
  const files = parsed.files || {};
  const file = files.file || Object.values(files)[0] || null;
  const poster = files.poster || null;

  if (!file?.buffer?.length) {
    throw makeHttpError("upload_file_required", 400, diagnostics);
  }

  const fileName = String(fields.fileName || fields.filename || fields.name || file.fileName || "attachment.bin").trim() || "attachment.bin";
  const mimeType = String(fields.mimeType || fields.mime || file.mimeType || "application/octet-stream").trim() || "application/octet-stream";
  const uploadType = detectCommentAttachmentType({ explicitType: fields.type || fields.uploadType || "", mimeType, fileName });

  return {
    commentKey: normalizeKey(fields.commentKey || req.get("x-comment-key") || ""),
    clientUploadId: String(fields.clientUploadId || fields.client_upload_id || req.get("x-client-upload-id") || "").trim().slice(0, 120),
    fileName,
    mimeType,
    uploadType,
    buffer: file.buffer,
    size: Number(fields.size || file.buffer.length || 0) || file.buffer.length,
    posterBuffer: poster?.buffer || null,
    posterMimeType: poster?.mimeType || "image/jpeg",
    uploadDiagnostics: diagnostics
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
// SP36: documents are not exposed through /public/comment-uploads.
// They are kept in a private runtime folder and served via a short internal download route.
const COMMENT_PRIVATE_FILE_DIR = path.join(__dirname, "data", "comment-files");
const COMMENT_PRIVATE_DOWNLOAD_PREFIX = "/api/comments/attachments/download";

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

function saveCommentAttachmentPrivateFile({ buffer, fileName, mimeType, uploadType, forcedExt = "" }) {
  if (!buffer || !buffer.length) return "";
  fs.mkdirSync(COMMENT_PRIVATE_FILE_DIR, { recursive: true });
  const ext = forcedExt || getSafeUploadExtension({ fileName, mimeType, uploadType });
  const id = Date.now() + "_" + crypto.randomBytes(10).toString("hex") + ext;
  const abs = path.join(COMMENT_PRIVATE_FILE_DIR, id);
  fs.writeFileSync(abs, buffer);
  return COMMENT_PRIVATE_DOWNLOAD_PREFIX + "/" + encodeURIComponent(id);
}

function getPrivateDownloadFilePath(id = "") {
  const clean = path.basename(String(id || "").split(/[?#]/)[0] || "");
  if (!clean || !/^[a-zA-Z0-9._-]+$/.test(clean)) return "";
  const target = path.join(COMMENT_PRIVATE_FILE_DIR, clean);
  const base = path.resolve(COMMENT_PRIVATE_FILE_DIR);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(base + path.sep)) return "";
  return resolved;
}

function safeUnlink(filePath = "") {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch {}
}

function safeRmDir(dirPath = "") {
  if (!dirPath) return;
  try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch {}
}

async function transcodeVideoForWeb({ buffer, fileName = "video.mov", mimeType = "video/quicktime" } = {}) {
  if (!buffer || !buffer.length) return null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adminkit-video-"));
  const inputExt = getSafeUploadExtension({ fileName, mimeType, uploadType: "video" }) || ".mov";
  const inputPath = path.join(tmpDir, "input" + inputExt);
  const outputPath = path.join(tmpDir, "output.mp4");
  const posterPath = path.join(tmpDir, "poster.jpg");
  const errors = [];
  async function runFfmpeg(args, timeout = 90000) {
    try {
      await execFileAsync("ffmpeg", args, { timeout, maxBuffer: 4 * 1024 * 1024 });
      return true;
    } catch (error) {
      errors.push(error?.stderr || error?.message || String(error));
      return false;
    }
  }
  try {
    fs.writeFileSync(inputPath, buffer);
    let ok = await runFfmpeg([
      "-y", "-hide_banner", "-loglevel", "error", "-err_detect", "ignore_err",
      "-i", inputPath, "-map", "0:v:0", "-map", "0:a?",
      "-vf", "scale='min(540,iw)':-2:force_original_aspect_ratio=decrease",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "64k", outputPath
    ]);
    if (!ok || !fs.existsSync(outputPath) || !fs.statSync(outputPath).size) {
      safeUnlink(outputPath);
      ok = await runFfmpeg([
        "-y", "-hide_banner", "-loglevel", "error", "-err_detect", "ignore_err",
        "-i", inputPath, "-an", "-vf", "scale='min(540,iw)':-2:force_original_aspect_ratio=decrease",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath
      ]);
    }
    if (!ok || !fs.existsSync(outputPath) || !fs.statSync(outputPath).size) {
      safeUnlink(outputPath);
      ok = await runFfmpeg([
        "-y", "-hide_banner", "-loglevel", "error", "-err_detect", "ignore_err",
        "-i", inputPath, "-an", "-vf", "scale='min(480,iw)':-2:force_original_aspect_ratio=decrease",
        "-c:v", "mpeg4", "-q:v", "7", "-movflags", "+faststart", outputPath
      ]);
    }
    try {
      const posterInput = fs.existsSync(outputPath) && fs.statSync(outputPath).size ? outputPath : inputPath;
      await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", "00:00:00.100", "-i", posterInput, "-frames:v", "1", "-vf", "scale=540:-2:force_original_aspect_ratio=decrease", posterPath], { timeout: 20000, maxBuffer: 1024 * 1024 });
    } catch {}
    if (!ok || !fs.existsSync(outputPath)) return { error: errors.filter(Boolean).slice(-2).join(" | ") || "video_transcode_failed", buffer: null, posterBuffer: fs.existsSync(posterPath) ? fs.readFileSync(posterPath) : null };
    const outBuffer = fs.readFileSync(outputPath);
    if (!outBuffer.length) return { error: errors.filter(Boolean).slice(-2).join(" | ") || "video_transcode_empty_output", buffer: null, posterBuffer: fs.existsSync(posterPath) ? fs.readFileSync(posterPath) : null };
    const base = String(fileName || "video").replace(/\.[^.]+$/, "") || "video";
    return { buffer: outBuffer, fileName: base + ".mp4", mimeType: "video/mp4", size: outBuffer.length, posterBuffer: fs.existsSync(posterPath) ? fs.readFileSync(posterPath) : null, posterMimeType: "image/jpeg", originalSize: buffer.length, transcoded: true };
  } catch (error) {
    return { error: [error?.message || "video_transcode_failed", ...errors].filter(Boolean).slice(-3).join(" | "), buffer: null, posterBuffer: fs.existsSync(posterPath) ? fs.readFileSync(posterPath) : null };
  } finally {
    safeUnlink(inputPath); safeUnlink(outputPath); safeUnlink(posterPath); safeRmDir(tmpDir);
  }
}

async function optimizeImageForWeb({ buffer, fileName = "image.jpg", mimeType = "image/jpeg" } = {}) {
  if (!buffer || !buffer.length) return null;
  if (buffer.length <= 360 * 1024 && /image\/(jpeg|jpg)/i.test(String(mimeType || ""))) {
    return { buffer, fileName: String(fileName || "image.jpg").replace(/\.[^.]+$/, "") + ".jpg", mimeType: "image/jpeg", size: buffer.length, optimized: false };
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adminkit-image-"));
  const inputExt = getSafeUploadExtension({ fileName, mimeType, uploadType: "image" }) || ".jpg";
  const inputPath = path.join(tmpDir, "input" + inputExt);
  const outputPath = path.join(tmpDir, "output.jpg");
  try {
    fs.writeFileSync(inputPath, buffer);
    await execFileAsync("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", inputPath,
      "-vf", "scale=1100:-2:force_original_aspect_ratio=decrease",
      "-frames:v", "1",
      "-q:v", "7",
      outputPath
    ], { timeout: 25000, maxBuffer: 1024 * 1024 });
    if (!fs.existsSync(outputPath)) return null;
    const outBuffer = fs.readFileSync(outputPath);
    if (!outBuffer.length) return null;
    const base = String(fileName || "image").replace(/\.[^.]+$/, "") || "image";
    return { buffer: outBuffer, fileName: base + ".jpg", mimeType: "image/jpeg", size: outBuffer.length, originalSize: buffer.length, optimized: true };
  } catch (error) {
    return { error: error?.message || "image_optimize_failed", buffer: null };
  } finally {
    safeUnlink(inputPath);
    safeUnlink(outputPath);
    safeRmDir(tmpDir);
  }
}


function updateStoredAttachmentAfterProcessing(uploadId = "", patch = {}) {
  const normalizedId = String(uploadId || "").trim();
  if (!normalizedId) return false;
  let changed = false;
  const commentsByKey = store.comments && typeof store.comments === "object" ? store.comments : {};
  Object.keys(commentsByKey).forEach((commentKey) => {
    const list = Array.isArray(commentsByKey[commentKey]) ? commentsByKey[commentKey] : [];
    list.forEach((comment) => {
      if (!comment || !Array.isArray(comment.attachments)) return;
      comment.attachments = comment.attachments.map((attachment) => {
        const match = String(attachment?.id || "") === normalizedId || String(attachment?.uploadId || "") === normalizedId || String(attachment?.clientUploadId || "") === normalizedId;
        if (!match) return attachment;
        changed = true;
        return {
          ...attachment,
          ...patch,
          id: attachment.id || normalizedId,
          uploadId: normalizedId,
          updatedAt: Date.now()
        };
      });
      if (changed) comment.updatedAt = Date.now();
    });
  });
  if (changed) {
    try { saveStore(); } catch (error) { console.warn("deferred media saveStore failed", error?.message || error); }
  }
  return changed;
}

function applyDeferredVideoResultsToComment(commentKey = "", commentId = "") {
  const key = normalizeKey(commentKey);
  const list = Array.isArray(store.comments?.[key]) ? store.comments[key] : [];
  let changed = false;
  list.forEach((comment) => {
    if (commentId && String(comment.id || "") !== String(commentId)) return;
    if (!Array.isArray(comment.attachments)) return;
    comment.attachments = comment.attachments.map((attachment) => {
      const id = String(attachment?.id || attachment?.uploadId || "");
      if (!id || !deferredVideoResults.has(id)) return attachment;
      changed = true;
      const patch = deferredVideoResults.get(id) || {};
      deferredVideoResults.delete(id);
      return { ...attachment, ...patch, id: attachment.id || id, uploadId: id, updatedAt: Date.now() };
    });
    if (changed) comment.updatedAt = Date.now();
  });
  if (changed) {
    try { saveStore(); } catch (error) { console.warn("apply deferred video result failed", error?.message || error); }
  }
  return changed;
}
function scheduleDeferredVideoTranscode({ parsed, uploadId, rawUrl = "", posterUrl = "" } = {}) {
  const id = String(uploadId || "").trim();
  if (!id || !parsed?.buffer?.length) return;
  const source = {
    ...parsed,
    buffer: Buffer.from(parsed.buffer),
    fileName: parsed.fileName || "video.mov",
    mimeType: parsed.mimeType || "video/quicktime"
  };
  setImmediate(async () => {
    logCommentUploadDiagnostic({
      stage: "video_transcode_deferred_started",
      commentKey: source.commentKey,
      type: "video",
      fileName: source.fileName,
      mime: source.mimeType,
      size: source.size,
      ok: undefined,
      mode: "ffmpeg_mp4_deferred",
      previewUrl: rawUrl,
      posterUrl
    });
    try {
      const transcoded = await transcodeVideoForWeb(source);
      if (!transcoded?.buffer?.length) {
        const error = transcoded?.error || "video_transcode_failed";
        const patch = {
          processing: false,
          status: "error",
          transcodeError: error,
          url: "",
          previewUrl: "",
          posterUrl: posterUrl || "",
          mime: source.mimeType,
          storage: "server_original_transcode_failed"
        };
        if (!updateStoredAttachmentAfterProcessing(id, patch)) deferredVideoResults.set(id, patch);
        logCommentUploadDiagnostic({
          stage: "video_transcode_deferred_failed",
          commentKey: source.commentKey,
          type: "video",
          fileName: source.fileName,
          mime: source.mimeType,
          size: source.size,
          ok: false,
          mode: "ffmpeg_mp4_deferred",
          error,
          previewUrl: rawUrl,
          posterUrl
        });
        return;
      }

      const mp4Url = saveCommentAttachmentPreview({
        buffer: transcoded.buffer,
        fileName: transcoded.fileName,
        mimeType: transcoded.mimeType,
        uploadType: "video",
        forcedExt: ".mp4"
      });
      let nextPosterUrl = posterUrl;
      if (!nextPosterUrl && transcoded.posterBuffer?.length) {
        nextPosterUrl = saveCommentAttachmentPreview({
          buffer: transcoded.posterBuffer,
          fileName: String(transcoded.fileName || "video.mp4").replace(/\.[^.]+$/, "") + "-poster.jpg",
          mimeType: transcoded.posterMimeType || "image/jpeg",
          uploadType: "image",
          forcedExt: ".jpg"
        });
      }
      const readyPatch = {
        url: mp4Url,
        previewUrl: mp4Url,
        posterUrl: nextPosterUrl,
        mime: "video/mp4",
        size: transcoded.size || 0,
        processing: false,
        status: "ready",
        storage: "server_public_mp4_deferred",
        transcodeError: ""
      };
      if (!updateStoredAttachmentAfterProcessing(id, readyPatch)) deferredVideoResults.set(id, readyPatch);
      logCommentUploadDiagnostic({
        stage: "video_transcode_deferred_ok",
        commentKey: source.commentKey,
        type: "video",
        fileName: transcoded.fileName,
        mime: "video/mp4",
        size: transcoded.size,
        ok: true,
        mode: "ffmpeg_mp4_deferred",
        previewUrl: mp4Url,
        posterUrl: nextPosterUrl,
        data: { originalSize: source.size, outputSize: transcoded.size }
      });
    } catch (error) {
      const message = error?.message || "video_transcode_exception";
      const errorPatch = {
        processing: false,
        status: "error",
        transcodeError: message,
        storage: "server_original_transcode_exception"
      };
      if (!updateStoredAttachmentAfterProcessing(id, errorPatch)) deferredVideoResults.set(id, errorPatch);
      logCommentUploadDiagnostic({
        stage: "video_transcode_deferred_exception",
        commentKey: source.commentKey,
        type: "video",
        fileName: source.fileName,
        mime: source.mimeType,
        size: source.size,
        ok: false,
        mode: "ffmpeg_mp4_deferred",
        error: message,
        previewUrl: rawUrl,
        posterUrl
      });
    }
  });
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

function logCommentUploadDiagnostic(entry = {}) {
  try {
    return addUploadDiagnostic({
      stage: entry.stage || 'unknown',
      commentKey: entry.commentKey || '',
      type: entry.type || '',
      fileName: entry.fileName || '',
      mime: entry.mime || '',
      size: entry.size || 0,
      ok: entry.ok,
      mode: entry.mode || '',
      previewUrl: entry.previewUrl || '',
      posterUrl: entry.posterUrl || '',
      error: entry.error || '',
      status: entry.status,
      data: entry.data
    });
  } catch (error) {
    console.warn('upload diagnostic failed', error?.message || error);
    return null;
  }
}

function removePublicUploadFileByUrl(publicUrl = "") {
  const raw = String(publicUrl || "").trim();
  if (!raw || !raw.startsWith("/public/comment-uploads/")) return false;
  const base = path.basename(raw.split(/[?#]/)[0] || "");
  if (!base) return false;
  const target = path.join(__dirname, "public", "comment-uploads", base);
  if (!target.startsWith(path.join(__dirname, "public", "comment-uploads"))) return false;
  try { if (fs.existsSync(target)) fs.unlinkSync(target); return true; } catch { return false; }
}

function scheduleDeferredMaxAttachmentSync(parsed, { previewUrl = '', posterUrl = '', uploadId = '' } = {}) {
  if (!config.botToken || !parsed?.buffer?.length) return;
  const safeParsed = {
    commentKey: parsed.commentKey,
    uploadType: parsed.uploadType,
    fileName: parsed.fileName,
    mimeType: parsed.mimeType,
    size: parsed.size,
    clientUploadId: parsed.clientUploadId || uploadId || '',
    uploadId: uploadId || parsed.clientUploadId || '',
    buffer: Buffer.from(parsed.buffer)
  };
  setTimeout(async () => {
    logCommentUploadDiagnostic({
      stage: 'max_sync_started',
      commentKey: safeParsed.commentKey,
      type: safeParsed.uploadType,
      fileName: safeParsed.fileName,
      mime: safeParsed.mimeType,
      size: safeParsed.size,
      mode: 'background',
      previewUrl,
      posterUrl
    });
    try {
      const uploadInitResponse = await createUpload({ botToken: config.botToken, type: safeParsed.uploadType });
      logCommentUploadDiagnostic({
        stage: 'max_upload_url_created',
        commentKey: safeParsed.commentKey,
        type: safeParsed.uploadType,
        fileName: safeParsed.fileName,
        mime: safeParsed.mimeType,
        size: safeParsed.size,
        ok: true,
        mode: 'background'
      });
      const uploadResponse = await uploadBinaryToUrl({
        uploadUrl: uploadInitResponse?.url,
        botToken: config.botToken,
        buffer: safeParsed.buffer,
        fileName: safeParsed.fileName,
        mimeType: safeParsed.mimeType
      });
      const uploadedAttachment = buildUploadAttachmentPayload({ uploadType: safeParsed.uploadType, uploadInitResponse, uploadResponse });
      const maxPatch = {
        payload: uploadedAttachment.payload || {},
        native: true,
        url: '',
        // Keep a private fallback route for files so the card stays tappable.
        // UI hides the URL and no longer shows “saved in MAX”.
        previewUrl: safeParsed.uploadType === 'file' ? previewUrl : previewUrl,
        downloadUrl: safeParsed.uploadType === 'file' ? previewUrl : '',
        posterUrl: safeParsed.uploadType === 'file' ? '' : posterUrl,
        storage: safeParsed.uploadType === 'file' ? 'max_native_storage_private_fallback' : 'max_native_storage',
        syncStatus: 'max_sync_ok',
        processing: false,
        status: 'ready',
        transcodeError: '',
        updatedAt: Date.now()
      };
      if (safeParsed.uploadId) updateStoredAttachmentAfterProcessing(safeParsed.uploadId, maxPatch);
      // SP36: do not remove private fallback files immediately; MAX payload has no direct open URL for mini-app UI.
      logCommentUploadDiagnostic({
        stage: 'max_sync_ok',
        commentKey: safeParsed.commentKey,
        type: safeParsed.uploadType,
        fileName: safeParsed.fileName,
        mime: safeParsed.mimeType,
        size: safeParsed.size,
        ok: true,
        mode: 'background',
        data: uploadedAttachment
      });
    } catch (error) {
      logCommentUploadDiagnostic({
        stage: 'max_sync_failed',
        commentKey: safeParsed.commentKey,
        type: safeParsed.uploadType,
        fileName: safeParsed.fileName,
        mime: safeParsed.mimeType,
        size: safeParsed.size,
        ok: false,
        mode: 'background',
        error: error?.message || 'max_upload_failed',
        status: error?.status,
        data: error?.data
      });
    }
  }, 25);
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
  res.json({ ok: true, service: "amio-comments-max", version: BUILD_INFO.runtimeVersion, ...getBuildInfo() });
});

app.get("/health", async (req, res) => {
  try {
    const subscriptions = config.botToken ? await getSubscriptions({ botToken: config.botToken }) : null;
    res.json({ ok: true, ...getBuildInfo(), subscriptions });
  } catch (error) {
    res.json({ ok: false, ...getBuildInfo(), error: error?.message || "health_failed", data: error?.data || null });
  }
});

function buildLiveDebugPayload() {
  const snapshot = getDebugSnapshot();
  const build = getBuildInfo();
  return {
    ok: true,
    service: "amio-comments-max",
    meta: build,
    mediaDiagnostics: {
      uploads: Array.isArray(snapshot.uploadDiagnostics) ? snapshot.uploadDiagnostics.slice(0, 120) : [],
      lastErrors: Array.isArray(snapshot.uploadDiagnostics) ? snapshot.uploadDiagnostics.filter((item) => item && item.ok === false).slice(0, 40) : []
    },
    store: snapshot,
    ...build
  };
}

app.get(["/debug", "/debug/store", "/debug/store-live"], (req, res) => {
  setNoCacheHeaders(res);
  res.type("application/json");
  res.json(buildLiveDebugPayload());
});

app.get("/debug/build", (req, res) => {
  setNoCacheHeaders(res);
  res.type("application/json");
  res.json({ ok: true, service: "amio-comments-max", meta: getBuildInfo(), ...getBuildInfo() });
});

function sanitizeDebugForGithub(value, depth = 0) {
  if (depth > 12) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 250).map((item) => sanitizeDebugForGithub(item, depth + 1));
  if (typeof value !== "object") {
    if (typeof value === "string") {
      const raw = value;
      if (/^(data|blob):/i.test(raw)) return "[inline-data-removed]";
      if (raw.length > 600) return raw.slice(0, 240) + `...[${raw.length} chars]`;
    }
    return value;
  }
  const out = {};
  const sensitiveKeys = /^(token|authorization|botToken|webhookSecret|secret|password|apiKey|accessToken|refreshToken)$/i;
  const bulkyKeys = /^(buffer|rawBody|body|base64|dataUrl|previewData|photos)$/i;
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveKeys.test(key)) { out[key] = "[redacted]"; continue; }
    if (bulkyKeys.test(key)) { out[key] = "[removed]"; continue; }
    if (/payload/i.test(key) && item && typeof item === "object") {
      out[key] = sanitizeDebugForGithub(item, depth + 1);
      if (out[key] && typeof out[key] === "object") {
        for (const payloadKey of Object.keys(out[key])) {
          if (/token|photos/i.test(payloadKey)) out[key][payloadKey] = "[redacted]";
        }
      }
      continue;
    }
    out[key] = sanitizeDebugForGithub(item, depth + 1);
  }
  return out;
}

function buildGithubDebugPayload({ lite = false } = {}) {
  const payload = buildLiveDebugPayload();
  const clean = sanitizeDebugForGithub(payload);
  if (!lite) return clean;
  return {
    ok: true,
    service: clean.service,
    meta: clean.meta,
    mediaDiagnostics: clean.mediaDiagnostics,
    channels: clean.store?.channels || clean.channels || {},
    postsCount: Object.keys(clean.store?.posts || clean.posts || {}).length,
    commentsCount: Object.values(clean.store?.comments || clean.comments || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
    generatedAt: Date.now()
  };
}

async function putGithubFile({ repo, branch, filePath, token, content, message }) {
  const normalizedRepo = String(repo || "").trim();
  const normalizedPath = String(filePath || "").trim().replace(/^\/+/, "");
  if (!normalizedRepo || !normalizedPath || !token) throw new Error("github_debug_config_missing");
  const apiBase = `https://api.github.com/repos/${normalizedRepo}/contents/${encodeURIComponent(normalizedPath).replace(/%2F/g, "/")}`;
  let sha = "";
  try {
    const existing = await fetch(`${apiBase}?ref=${encodeURIComponent(branch || "main")}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "adminkit-debug-export" }
    });
    if (existing.ok) {
      const data = await existing.json().catch(() => ({}));
      sha = String(data?.sha || "");
    }
  } catch {}
  const response = await fetch(apiBase, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "adminkit-debug-export" },
    body: JSON.stringify({
      message: message || `Update АдминКИТ debug ${BUILD_INFO.runtimeVersion}`,
      branch: branch || "main",
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(sha ? { sha } : {})
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`github_export_failed_${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function requireDebugExportAccess(req, res) {
  if (config.debugExportAllowPublic) return true;
  const expected = String(config.giftAdminToken || process.env.ADMIN_TOKEN || "").trim();
  if (!expected) return true;
  const provided = String(req.query?.token || req.headers["x-admin-token"] || "").trim();
  if (provided === expected) return true;
  res.status(403).json({ ok: false, error: "debug_export_token_required" });
  return false;
}

app.all("/debug/export", async (req, res) => {
  setNoCacheHeaders(res);
  res.type("application/json");
  if (!requireDebugExportAccess(req, res)) return;
  try {
    const fullPayload = buildGithubDebugPayload({ lite: false });
    const litePayload = buildGithubDebugPayload({ lite: true });
    const branch = config.githubDebugBranch || "main";
    const repo = config.githubDebugRepo;
    const fullPath = config.githubDebugPath || "debug/latest.json";
    const litePath = config.githubDebugLitePath || "debug/latest-lite.json";
    const full = await putGithubFile({
      repo,
      branch,
      filePath: fullPath,
      token: config.githubDebugToken,
      content: JSON.stringify(fullPayload, null, 2),
      message: `Update АдминКИТ debug ${BUILD_INFO.runtimeVersion}`
    });
    let lite = null;
    if (litePath && litePath !== fullPath) {
      lite = await putGithubFile({
        repo,
        branch,
        filePath: litePath,
        token: config.githubDebugToken,
        content: JSON.stringify(litePayload, null, 2),
        message: `Update АдминКИТ debug lite ${BUILD_INFO.runtimeVersion}`
      });
    }
    return res.json({ ok: true, repo, branch, path: fullPath, litePath, commit: full?.commit?.sha || "", liteCommit: lite?.commit?.sha || "" });
  } catch (error) {
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || "debug_export_failed", data: error?.data || null });
  }
});

app.get("/debug/store-raw", (req, res) => {
  setNoCacheHeaders(res);
  res.type("application/json");
  res.json({ ok: true, meta: getBuildInfo(), store });
});

app.get("/debug/ping", (req, res) => {
  setNoCacheHeaders(res);
  res.type("application/json");
  res.json({
    ok: true,
    service: "amio-comments-max",
    ...getBuildInfo()
  });
});


app.get("/api/diagnostics", (req, res) => {
  setNoCacheHeaders(res);
  const latestPost = getLatestPost();
  res.json({
    ok: true,
    ...getBuildInfo(),
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
  type: (req) => /multipart\/form-data/i.test(String(req.headers["content-type"] || "")),
  limit: String(Math.max(1, Number(config.postEditorMediaBodyLimitMb || 60))) + "mb"
}), async (req, res) => {
  let parsed = null;
  let requestDiagnostics = buildUploadRequestDiagnostics(req, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
  let previewUrl = "";
  let posterUrl = "";

  logCommentUploadDiagnostic({
    stage: "request_received",
    ok: undefined,
    mode: "multipart_or_json",
    data: requestDiagnostics
  });

  try {
    parsed = normalizeCommentAttachmentUploadRequest(req);
    requestDiagnostics = parsed.uploadDiagnostics || requestDiagnostics;

    logCommentUploadDiagnostic({
      stage: "request_parsed",
      commentKey: parsed.commentKey,
      type: parsed.uploadType,
      fileName: parsed.fileName,
      mime: parsed.mimeType,
      size: parsed.size,
      ok: true,
      mode: /application\/json/i.test(String(req.get("content-type") || "")) ? "json_fallback" : "multipart_formdata",
      data: requestDiagnostics
    });

    if (!parsed.commentKey) {
      logCommentUploadDiagnostic({
        stage: "request_rejected",
        ok: false,
        error: "commentKey_required",
        type: parsed.uploadType,
        fileName: parsed.fileName,
        mime: parsed.mimeType,
        size: parsed.size,
        data: requestDiagnostics
      });
      return res.status(400).json({ ok: false, error: "commentKey_required" });
    }

    const maxBytes = Math.max(1024 * 1024, Number(config.commentAttachmentMaxBytes || config.postEditorMediaMaxBytes || 32 * 1024 * 1024));
    if (parsed.size > maxBytes || parsed.buffer.length > maxBytes) {
      logCommentUploadDiagnostic({
        stage: "request_rejected",
        commentKey: parsed.commentKey,
        type: parsed.uploadType,
        fileName: parsed.fileName,
        mime: parsed.mimeType,
        size: parsed.size,
        ok: false,
        error: "comment_attachment_too_large",
        status: 413,
        data: requestDiagnostics
      });
      return res.status(413).json({ ok: false, error: "comment_attachment_too_large" });
    }

    // SP35: fast pipeline.
    // Images are already client-compressed, so do NOT block the request with ffmpeg.
    // Videos return immediately as poster + processing; MP4 transcode runs deferred and updates store.
    let publicBuffer = parsed.buffer;
    let publicFileName = parsed.fileName;
    let publicMimeType = parsed.mimeType;
    let publicSize = parsed.size;
    let publicPosterBuffer = parsed.posterBuffer;
    let publicPosterMimeType = parsed.posterMimeType || "image/jpeg";
    let isDeferredVideo = false;

    if (parsed.uploadType === "image") {
      publicMimeType = /image\//i.test(String(publicMimeType || "")) ? publicMimeType : "image/jpeg";
      publicFileName = String(publicFileName || "image.jpg").replace(/\.[^.]+$/, "") + (/jpe?g/i.test(publicMimeType) ? ".jpg" : getSafeUploadExtension({ fileName: publicFileName, mimeType: publicMimeType, uploadType: "image" }));
      logCommentUploadDiagnostic({
        stage: "image_fast_saved_without_server_ffmpeg",
        commentKey: parsed.commentKey,
        type: parsed.uploadType,
        fileName: publicFileName,
        mime: publicMimeType,
        size: publicSize,
        ok: true,
        mode: "client_compressed_fast_save",
        data: { reason: "client_already_compressed", noBlockingFfmpeg: true }
      });
    }

    if (parsed.uploadType === "video") {
      isDeferredVideo = true;
      const rawExt = getSafeUploadExtension({ fileName: parsed.fileName, mimeType: parsed.mimeType, uploadType: "video" }) || ".mov";
      publicFileName = String(parsed.fileName || "video").replace(/\.[^.]+$/, "") + rawExt;
      publicMimeType = parsed.mimeType || "video/quicktime";
      publicSize = parsed.size;
      logCommentUploadDiagnostic({
        stage: "video_deferred_accept_original",
        commentKey: parsed.commentKey,
        type: parsed.uploadType,
        fileName: publicFileName,
        mime: publicMimeType,
        size: publicSize,
        ok: true,
        mode: "poster_now_mp4_deferred",
        data: { requestReturnsBeforeTranscode: true }
      });
    }

    if (parsed.uploadType === "file") {
      previewUrl = saveCommentAttachmentPrivateFile({
        buffer: publicBuffer,
        fileName: publicFileName,
        mimeType: publicMimeType,
        uploadType: parsed.uploadType
      });
    } else {
      previewUrl = saveCommentAttachmentPreview({
        buffer: publicBuffer,
        fileName: publicFileName,
        mimeType: publicMimeType,
        uploadType: parsed.uploadType,
        forcedExt: isDeferredVideo ? getSafeUploadExtension({ fileName: publicFileName, mimeType: publicMimeType, uploadType: "video" }) : ""
      });
    }

    if (parsed.uploadType === "video" && publicPosterBuffer && publicPosterBuffer.length < 4 * 1024 * 1024) {
      const posterName = (String(publicFileName || "video").replace(/\.[^.]+$/, "") || "video") + "-poster.jpg";
      posterUrl = saveCommentAttachmentPreview({
        buffer: publicPosterBuffer,
        fileName: posterName,
        mimeType: publicPosterMimeType,
        uploadType: "image",
        forcedExt: ".jpg"
      });
    }

    const serverAttachment = makePublicCommentAttachment({
      uploadedAttachment: {},
      uploadType: parsed.uploadType,
      fileName: publicFileName,
      mimeType: publicMimeType,
      size: publicSize,
      previewUrl: isDeferredVideo ? "" : previewUrl,
      posterUrl
    });

    serverAttachment.clientUploadId = parsed.clientUploadId || "";
    serverAttachment.native = false;
    serverAttachment.localOnly = false;
    serverAttachment.storage = isDeferredVideo ? "server_original_processing" : "server_public";
    serverAttachment.syncStatus = parsed.uploadType === "image"
      ? "server_preview_only_no_max_sync"
      : (config.botToken ? "server_saved_max_sync_deferred" : "server_saved_bot_token_missing");

    if (isDeferredVideo) {
      serverAttachment.id = String(parsed.clientUploadId || serverAttachment.id || `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`);
      serverAttachment.uploadId = serverAttachment.id;
      serverAttachment.processing = true;
      serverAttachment.status = "processing";
      serverAttachment.rawUrl = previewUrl;
      serverAttachment.url = "";
      serverAttachment.previewUrl = "";
      scheduleDeferredVideoTranscode({ parsed, uploadId: serverAttachment.id, rawUrl: previewUrl, posterUrl });
    }

    logCommentUploadDiagnostic({
      stage: isDeferredVideo ? "server_video_processing_saved" : "server_preview_saved",
      commentKey: parsed.commentKey,
      type: parsed.uploadType,
      fileName: parsed.fileName,
      mime: parsed.mimeType,
      size: parsed.size,
      ok: true,
      mode: isDeferredVideo ? "poster_now_mp4_deferred" : "local_fast",
      previewUrl,
      posterUrl,
      data: requestDiagnostics
    });

    if (!isDeferredVideo && parsed.uploadType !== "image") {
      scheduleDeferredMaxAttachmentSync({
        ...parsed,
        buffer: publicBuffer,
        fileName: publicFileName,
        mimeType: publicMimeType,
        size: publicSize
      }, { previewUrl, posterUrl, uploadId: serverAttachment.id || serverAttachment.clientUploadId || parsed.clientUploadId || "" });
    }

    return res.json({
      ok: true,
      attachment: serverAttachment,
      maxAttachment: null,
      uploadMode: isDeferredVideo ? "poster_now_mp4_deferred" : "local_fast",
      warning: serverAttachment.syncStatus,
      diagnostics: { ...requestDiagnostics, clientUploadId: parsed.clientUploadId || "" }
    });
  } catch (error) {
    const data = error?.data || requestDiagnostics;
    logCommentUploadDiagnostic({
      stage: "request_failed",
      commentKey: parsed?.commentKey || "",
      type: parsed?.uploadType || "",
      fileName: parsed?.fileName || "",
      mime: parsed?.mimeType || "",
      size: parsed?.size || 0,
      ok: false,
      error: error?.message || "comment_attachment_upload_failed",
      status: error?.status || 400,
      data
    });
    return res.status(error?.status || 400).json({
      ok: false,
      error: error?.message || "comment_attachment_upload_failed",
      data
    });
  }
});


app.get("/api/comments/attachments/download/:fileId", (req, res) => {
  const fileId = String(req.params?.fileId || "").trim();
  const target = getPrivateDownloadFilePath(fileId);
  if (!target || !fs.existsSync(target)) {
    return res.status(404).send("file_not_found");
  }
  setNoCacheHeaders(res);
  return res.sendFile(target);
});

app.post("/api/comments/attachments/status", (req, res) => {
  const uploadId = String(req.body?.uploadId || req.body?.id || "").trim();
  const commentKey = normalizeKey(req.body?.commentKey || "");
  if (!uploadId) return res.status(400).json({ ok: false, error: "uploadId_required" });
  const status = String(req.body?.status || "error").trim() || "error";
  const processing = req.body?.processing === true ? true : false;
  const transcodeError = String(req.body?.transcodeError || req.body?.error || "").slice(0, 1000);
  const storage = String(req.body?.storage || "client_upload_failed").slice(0, 120);
  const patch = { processing, status, transcodeError, storage, updatedAt: Date.now() };
  const changed = updateStoredAttachmentAfterProcessing(uploadId, patch);
  logCommentUploadDiagnostic({
    stage: "client_video_status_update",
    commentKey,
    type: "video",
    ok: changed,
    mode: "client_background_upload",
    error: transcodeError,
    data: { uploadId, status, storage }
  });
  return res.json({ ok: true, changed, uploadId, status });
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

    logCommentUploadDiagnostic({
      stage: "comment_create_received",
      commentKey,
      type: Array.isArray(req.body?.attachments) && req.body.attachments.length ? "comment_with_attachments" : "comment_text",
      size: Array.isArray(req.body?.attachments) ? req.body.attachments.length : 0,
      ok: undefined,
      mode: "comment_create",
      data: {
        attachmentCount: Array.isArray(req.body?.attachments) ? req.body.attachments.length : 0,
        clientUploadIds: Array.isArray(req.body?.clientUploadIds) ? req.body.clientUploadIds.slice(0, 5) : []
      }
    });

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

    applyDeferredVideoResultsToComment(commentKey, comment.id);
    const refreshedComment = (store.comments?.[commentKey] || []).find((item) => item.id === comment.id) || comment;

    logCommentUploadDiagnostic({
      stage: "comment_create_saved",
      commentKey,
      type: refreshedComment.attachments?.length ? "comment_with_attachments" : "comment_text",
      size: Array.isArray(refreshedComment.attachments) ? refreshedComment.attachments.length : 0,
      ok: true,
      mode: "comment_create",
      data: { commentId: refreshedComment.id, attachmentCount: Array.isArray(refreshedComment.attachments) ? refreshedComment.attachments.length : 0 }
    });

    const patch = scheduleCommentCounterPatch(commentKey, "comment_create_updates_channel_button_count");

    return res.json({ ok: true, comment: refreshedComment, patch, moderation });
  } catch (error) {
    logCommentUploadDiagnostic({
      stage: "comment_create_failed",
      commentKey: normalizeKey(req.body?.commentKey || ""),
      type: Array.isArray(req.body?.attachments) && req.body.attachments.length ? "comment_with_attachments" : "comment_text",
      size: Array.isArray(req.body?.attachments) ? req.body.attachments.length : 0,
      ok: false,
      mode: "comment_create",
      error: error?.message || "comment_create_failed",
      data: { clientUploadIds: Array.isArray(req.body?.clientUploadIds) ? req.body.clientUploadIds.slice(0, 5) : [] }
    });
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
