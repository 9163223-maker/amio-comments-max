function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseList(value, fallback = []) {
  if (value === undefined || value === null || value === "") return [...fallback];
  return [...new Set(String(value)
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean))];
}

const port = process.env.PORT || 3000;
const appBaseUrl = String(process.env.APP_BASE_URL || "").replace(/\/$/, "");
const botToken = process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN || "";
const botUsername = String(
  process.env.BOT_USERNAME ||
    process.env.MAX_BOT_USERNAME ||
    process.env.BOT_NAME ||
    process.env.MAX_BOT_NAME ||
    ""
)
  .trim()
  .replace(/^@/, "");
const webhookPath = process.env.WEBHOOK_PATH || process.env.MAX_WEBHOOK_PATH || "/webhook/max";
const webhookSecret = process.env.WEBHOOK_SECRET || "";
const maxDeepLinkBase = String(
  process.env.MAX_DEEP_LINK_BASE ||
    process.env.BOT_DEEP_LINK_BASE ||
    (botUsername ? `https://max.ru/${botUsername}` : "")
).replace(/\/$/, "");
const debugLogs = String(process.env.DEBUG_LOGS || "").trim() === "1";
const giftAdminToken = String(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "").trim();
const githubDebugToken = String(process.env.GITHUB_DEBUG_TOKEN || "").trim();
const githubDebugRepo = String(process.env.GITHUB_DEBUG_REPO || "").trim();
const githubDebugBranch = String(process.env.GITHUB_DEBUG_BRANCH || "main").trim() || "main";
const githubDebugPath = String(process.env.GITHUB_DEBUG_PATH || "debug/latest.json").trim() || "debug/latest.json";
const githubDebugLitePath = String(process.env.GITHUB_DEBUG_LITE_PATH || "debug/latest-lite.json").trim() || "debug/latest-lite.json";
const debugExportAllowPublic = parseBoolean(process.env.DEBUG_EXPORT_ALLOW_PUBLIC, false);

const aiModerationUrl = String(process.env.AI_MODERATION_URL || process.env.AI_MODERATION_ENDPOINT || "").trim();
const aiModerationApiKey = String(process.env.AI_MODERATION_API_KEY || "").trim();
const aiModerationModel = String(process.env.AI_MODERATION_MODEL || "").trim();
const aiModerationTimeoutMs = Number(process.env.AI_MODERATION_TIMEOUT_MS || 12000);
const aiModerationFailClosed = parseBoolean(process.env.AI_MODERATION_FAIL_CLOSED, false);
const moderationAdminToken = String(process.env.MODERATION_ADMIN_TOKEN || process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "").trim();
const growthDefaultBrandName = String(process.env.GROWTH_DEFAULT_BRAND_NAME || "Amio").trim() || "Amio";
const growthDefaultLeadMagnetUrl = String(process.env.GROWTH_DEFAULT_LEAD_MAGNET_URL || "").trim();
const growthDefaultAgencyBrandName = String(process.env.GROWTH_DEFAULT_AGENCY_BRAND_NAME || "").trim();
const postEditWindowHours = Number(process.env.POST_EDIT_WINDOW_HOURS || 24);
const postEditorMediaBodyLimitMb = parsePositiveInt(process.env.POST_EDITOR_MEDIA_BODY_LIMIT_MB, 60);
const postEditorMediaMaxBytes = parsePositiveInt(process.env.POST_EDITOR_MEDIA_MAX_BYTES, 32 * 1024 * 1024);
const postEditorMediaPatchRetryCount = parsePositiveInt(process.env.POST_EDITOR_MEDIA_PATCH_RETRY_COUNT, 4);
const postEditorMediaPatchRetryBaseMs = parsePositiveInt(process.env.POST_EDITOR_MEDIA_PATCH_RETRY_BASE_MS, 1200);

// Скоростной режим меню включён по умолчанию: меню должно отвечать сразу,
// а очистка старых сообщений и live-проверки каналов не должны блокировать UI.
const fastMenuMode = parseBoolean(process.env.FAST_MENU_MODE, true);
const liveChannelChecks = parseBoolean(process.env.LIVE_CHANNEL_CHECKS, false);
const menuDeleteTimeoutMs = parsePositiveInt(process.env.MENU_DELETE_TIMEOUT_MS, 1800);
const commentCounterRepatchEnabled = parseBoolean(process.env.COMMENT_COUNTER_REPATCH_ENABLED, true);
const commentCounterPatchDebounceMs = parsePositiveInt(process.env.COMMENT_COUNTER_PATCH_DEBOUNCE_MS, 650);

const giftUploadDefaults = {
  enabled: parseBoolean(process.env.GIFT_UPLOAD_ENABLED, true),
  maxFiles: parsePositiveInt(process.env.GIFT_UPLOAD_MAX_FILES, 1),
  maxBytes: parsePositiveInt(process.env.GIFT_UPLOAD_MAX_BYTES, 50 * 1024 * 1024),
  allowedTypes: parseList(process.env.GIFT_UPLOAD_ALLOWED_TYPES, ["file", "image", "video", "audio"]),
  allowedExtensions: parseList(process.env.GIFT_UPLOAD_ALLOWED_EXTENSIONS, [])
};

module.exports = {
  port,
  appBaseUrl,
  botToken,
  botUsername,
  webhookPath,
  webhookSecret,
  maxDeepLinkBase,
  debugLogs,
  giftAdminToken,
  githubDebugToken,
  githubDebugRepo,
  githubDebugBranch,
  githubDebugPath,
  githubDebugLitePath,
  debugExportAllowPublic,
  giftUploadDefaults,
  aiModerationUrl,
  aiModerationApiKey,
  aiModerationModel,
  aiModerationTimeoutMs,
  aiModerationFailClosed,
  moderationAdminToken,
  growthDefaultBrandName,
  growthDefaultLeadMagnetUrl,
  growthDefaultAgencyBrandName,
  postEditWindowHours,
  postEditorMediaBodyLimitMb,
  postEditorMediaMaxBytes,
  postEditorMediaPatchRetryCount,
  postEditorMediaPatchRetryBaseMs,
  fastMenuMode,
  liveChannelChecks,
  menuDeleteTimeoutMs,
  commentCounterRepatchEnabled,
  commentCounterPatchDebounceMs
};
