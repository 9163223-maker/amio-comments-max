const crypto = require("crypto");
const config = require("../config");
const stickerPackService = require("./stickerPackService");
const {
  getModerationSettings,
  addModerationLog,
  getPost,
  getChannelIdFromCommentKey
} = require("../store");

const DEFAULT_STICKER_PACK_ID = stickerPackService.DEFAULT_PACK_ID || "adminkit_whales_v1";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fromCodes(codes) {
  return String.fromCharCode(...codes);
}

const PRESET_COMMON_STOPWORDS = [
  "казино",
  "ставки",
  "букмекер",
  "беттинг",
  "1win",
  "winline",
  "вип ставка",
  "заработок без вложений",
  "быстрый заработок",
  "crypto signal",
  "криптосигнал",
  "t.me/",
  "telegram.me/",
  "discord.gg",
  "chat.whatsapp.com",
  "joinchat",
  fromCodes([0x76, 0x69, 0x61, 0x67, 0x72, 0x61]),
  fromCodes([0x65, 0x73, 0x63, 0x6f, 0x72, 0x74]),
  fromCodes([0x6f, 0x6e, 0x6c, 0x79, 0x66, 0x61, 0x6e, 0x73]),
  "18+",
  `${fromCodes([0x0441, 0x0435, 0x043a, 0x0441])} чат`
];

const BASIC_ABUSE_STEMS = [
  [0x0435, 0x0431],
  [0x0451, 0x0431],
  [0x043f, 0x0438, 0x0437, 0x0434],
  [0x0431, 0x043b, 0x044f],
  [0x0445, 0x0443, 0x0439],
  [0x0441, 0x0443, 0x043a],
  [0x043c, 0x0443, 0x0434, 0x0430, 0x043a],
  [0x043c, 0x0440, 0x0430, 0x0437],
  [0x0448, 0x043b, 0x044e, 0x0445],
  [0x0434, 0x043e, 0x043b, 0x0431, 0x043e],
  [0x043f, 0x0438, 0x0434, 0x043e, 0x0440]
].map(fromCodes);

const PRESET_COMMON_REGEX = [
  new RegExp(`(?:^|\\b)(?:${BASIC_ABUSE_STEMS.map(escapeRegex).join("|")})`, "iu"),
  /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg|wa\.me|chat\.whatsapp\.com)/iu
];

function stickerApprovalSecret() {
  return normalizeText(config.moderationAdminToken || config.giftAdminToken || config.botToken || process.env.WEBHOOK_SECRET || process.env.GITHUB_DEBUG_TOKEN || "");
}

function signQueuedStickerApproval({ commentKey = "", userId = "", replyToId = "", packId = "", stickerId = "", moderationText = "" } = {}) {
  const secret = stickerApprovalSecret();
  if (!secret) return "";
  const payload = [
    "adminkitQueuedSticker:v1",
    String(commentKey || "").trim(),
    normalizeText(userId || "guest") || "guest",
    normalizeText(replyToId || ""),
    normalizeText(packId || DEFAULT_STICKER_PACK_ID),
    normalizeText(stickerId || ""),
    normalizeText(moderationText || "")
  ].join("\n");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function isQueuedStickerAttachment(item) {
  if (!item || typeof item !== "object") return false;
  const type = normalizeText(item.commentType || item.type).toLowerCase();
  return item.adminkitQueuedSticker === true && type === "sticker";
}

function resolveStickerModerationText(text = "", attachments = []) {
  const source = (Array.isArray(attachments) ? attachments : []).find(isQueuedStickerAttachment);
  if (!source) return normalizeText(text);
  const stickerId = normalizeText(source.stickerId || source.id || "");
  return stickerId ? `Стикер ${stickerId}` : normalizeText(text);
}

function withSignedStickerApprovalMetadata(attachments = [], context = {}) {
  const list = Array.isArray(attachments) ? attachments : [];
  return list.map((item) => {
    if (!isQueuedStickerAttachment(item)) return item;
    const packId = normalizeText(item.packId || DEFAULT_STICKER_PACK_ID);
    const stickerId = normalizeText(item.stickerId || item.id || "");
    if (!packId || !stickerId) return item;
    const moderationText = normalizeText(context.moderationText || `Стикер ${stickerId}`);
    const approvalToken = signQueuedStickerApproval({
      commentKey: context.commentKey,
      userId: context.userId,
      replyToId: context.replyToId,
      packId,
      stickerId,
      moderationText
    });
    if (!approvalToken) return item;
    return {
      ...item,
      type: "sticker",
      commentType: "sticker",
      adminkitQueuedSticker: true,
      approvalContext: "moderation_queue_v1",
      packId,
      stickerId,
      displayText: "Стикер",
      moderationText,
      approvalToken
    };
  });
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value.split(/[\n,;]/g).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function countLinks(text) {
  return (text.match(/(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg|wa\.me|chat\.whatsapp\.com)/giu) || []).length;
}

function maxRepeatedChars(text) {
  const matches = [...String(text || "").matchAll(/(.)\1{1,}/g)];
  return matches.reduce((acc, match) => Math.max(acc, String(match[0] || "").length), 1);
}

function uppercaseRatio(text) {
  const letters = Array.from(String(text || "")).filter((char) => /\p{L}/u.test(char));
  if (!letters.length) return 0;
  const upper = letters.filter((char) => char !== char.toLowerCase() && char === char.toUpperCase()).length;
  return upper / letters.length;
}

function resolveChannelId({ channelId = "", commentKey = "" } = {}) {
  if (channelId) return String(channelId).trim();
  const post = getPost(commentKey);
  if (post?.channelId) return String(post.channelId).trim();
  return getChannelIdFromCommentKey(commentKey);
}

function resolvePresetWords(settings) {
  const custom = toArray(settings.customBlocklist);
  return settings.applyPresetCommon ? [...PRESET_COMMON_STOPWORDS, ...custom] : custom;
}

function runBasicChecks({ text, settings }) {
  const normalizedText = normalizeText(text);
  const lowered = normalizedText.toLowerCase();
  const reasons = [];
  const matchedWords = [];
  const matchedRegex = [];

  const allWords = resolvePresetWords(settings);
  for (const word of allWords) {
    const normalizedWord = String(word || "").trim().toLowerCase();
    if (!normalizedWord) continue;
    if (lowered.includes(normalizedWord)) {
      matchedWords.push(normalizedWord);
    }
  }

  if (matchedWords.length) reasons.push("stopwords_match");

  const regexRules = [];
  if (settings.applyPresetCommon) regexRules.push(...PRESET_COMMON_REGEX);
  for (const pattern of toArray(settings.regexRules)) {
    try { regexRules.push(new RegExp(pattern, "iu")); } catch {}
  }

  for (const pattern of regexRules) {
    if (pattern.test(normalizedText)) matchedRegex.push(String(pattern));
  }

  if (matchedRegex.length) reasons.push("regex_match");

  const links = countLinks(normalizedText);
  if (settings.blockLinks && links > Number(settings.maxLinks || 0)) reasons.push("too_many_links");

  if (settings.blockInvites) {
    if (/(t\.me\/|telegram\.me\/|discord\.gg|chat\.whatsapp\.com|joinchat|invite)/iu.test(normalizedText)) reasons.push("invite_link");
  }

  const repeated = maxRepeatedChars(normalizedText);
  if (repeated >= Number(settings.maxRepeatedChars || 6)) reasons.push("spam_repeated_chars");

  if (normalizedText.length >= Number(settings.minTextLengthForCapsCheck || 8)) {
    const ratio = uppercaseRatio(normalizedText);
    if (ratio >= Number(settings.maxUppercaseRatio || 0.75)) reasons.push("caps_lock_spam");
  }

  return {
    blocked: reasons.length > 0,
    reasons: [...new Set(reasons)],
    matchedWords: [...new Set(matchedWords)],
    matchedRegex: [...new Set(matchedRegex)],
    links,
    repeatedChars: repeated,
    uppercaseRatio: uppercaseRatio(normalizedText)
  };
}

async function callAiModeration({ text, userId, userName, channelId, commentKey, replyToId, settings, config }) {
  if (!settings.aiEnabled || !config.aiModerationUrl) {
    return { enabled: false, allow: true, action: "allow", labels: [], reason: "ai_disabled" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(config.aiModerationTimeoutMs || 12000)));
  try {
    const response = await fetch(config.aiModerationUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.aiModerationApiKey ? { Authorization: `Bearer ${config.aiModerationApiKey}` } : {})
      },
      body: JSON.stringify({ text, userId, userName, channelId, commentKey, replyToId, model: config.aiModerationModel || "", settings })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `ai_http_${response.status}`);

    const allow = data.allow ?? data.allowed ?? data.approved ?? (String(data.action || "allow") === "allow");
    const action = String(data.action || (allow ? "allow" : settings.action || "reject")).trim() || "allow";
    const labels = Array.isArray(data.labels) ? data.labels : Array.isArray(data.categories) ? data.categories : [];

    return { enabled: true, allow: Boolean(allow), action, reason: String(data.reason || data.message || ""), labels, confidence: Number(data.confidence || 0) || 0, raw: data };
  } catch (error) {
    if (config.aiModerationFailClosed) {
      return { enabled: true, allow: false, action: settings.action || "reject", reason: `ai_error:${error?.message || "unknown"}`, labels: ["ai_error"], confidence: 0, raw: null };
    }
    return { enabled: true, allow: true, action: "allow", reason: `ai_bypassed:${error?.message || "unknown"}`, labels: ["ai_bypass"], confidence: 0, raw: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function moderateComment({ commentKey = "", channelId = "", userId = "guest", userName = "Гость", text = "", replyToId = "", avatarUrl = "", attachments = [], sourceType = "create", commentId = "", config }) {
  const resolvedChannelId = resolveChannelId({ channelId, commentKey });
  const settings = getModerationSettings(resolvedChannelId);
  const normalizedUserId = String(userId || "guest").trim();
  const normalizedReplyToId = String(replyToId || "").trim();
  const normalizedText = resolveStickerModerationText(text, attachments);
  const moderationAttachments = withSignedStickerApprovalMetadata(attachments, { commentKey, userId: normalizedUserId, replyToId: normalizedReplyToId, moderationText: normalizedText });

  if (!settings.enabled) {
    return { allowed: true, action: "allow", mode: "off", channelId: resolvedChannelId, settings, reasons: [] };
  }

  if (settings.whitelistUsers.includes(normalizedUserId)) {
    return { allowed: true, action: "allow", mode: "whitelist", channelId: resolvedChannelId, settings, reasons: [] };
  }

  if (settings.shadowBanUsers.includes(normalizedUserId)) {
    const result = { allowed: false, action: settings.action || "reject", mode: "shadow_ban", channelId: resolvedChannelId, settings, reasons: ["shadow_ban_user"], matchedWords: [], matchedRegex: [] };
    addModerationLog({ channelId: resolvedChannelId, commentKey, userId: normalizedUserId, userName, text: normalizedText, avatarUrl, attachments: moderationAttachments, replyToId: normalizedReplyToId, sourceType, commentId: String(commentId || "").trim(), decision: result.action === "queue" ? "queued" : "blocked", mode: result.mode, action: result.action, reasons: result.reasons, matchedWords: [], matchedRegex: [] });
    return result;
  }

  let basic = { blocked: false, reasons: [], matchedWords: [], matchedRegex: [], links: 0, repeatedChars: 1, uppercaseRatio: 0 };
  if (settings.basicEnabled) {
    basic = runBasicChecks({ text: normalizedText, settings });
    if (basic.blocked) {
      const result = { allowed: false, action: settings.action || "reject", mode: "basic", channelId: resolvedChannelId, settings, reasons: basic.reasons, matchedWords: basic.matchedWords, matchedRegex: basic.matchedRegex, metrics: { links: basic.links, repeatedChars: basic.repeatedChars, uppercaseRatio: basic.uppercaseRatio } };
      addModerationLog({ channelId: resolvedChannelId, commentKey, userId: normalizedUserId, userName, text: normalizedText, avatarUrl, attachments: moderationAttachments, replyToId: normalizedReplyToId, sourceType, commentId: String(commentId || "").trim(), decision: result.action === "queue" ? "queued" : "blocked", mode: result.mode, action: result.action, reasons: result.reasons, matchedWords: result.matchedWords, matchedRegex: result.matchedRegex, metrics: result.metrics });
      return result;
    }
  }

  const ai = await callAiModeration({ text: normalizedText, userId: normalizedUserId, userName, channelId: resolvedChannelId, commentKey, replyToId: normalizedReplyToId, settings, config });
  if (!ai.allow) {
    const result = { allowed: false, action: ai.action || settings.action || "reject", mode: "ai", channelId: resolvedChannelId, settings, reasons: [ai.reason || "ai_blocked"].filter(Boolean), labels: ai.labels || [], confidence: ai.confidence || 0, matchedWords: basic.matchedWords, matchedRegex: basic.matchedRegex };
    addModerationLog({ channelId: resolvedChannelId, commentKey, userId: normalizedUserId, userName, text: normalizedText, avatarUrl, attachments: moderationAttachments, replyToId: normalizedReplyToId, sourceType, commentId: String(commentId || "").trim(), decision: result.action === "queue" ? "queued" : "blocked", mode: result.mode, action: result.action, reasons: result.reasons, labels: result.labels, confidence: result.confidence, matchedWords: result.matchedWords, matchedRegex: result.matchedRegex });
    return result;
  }

  addModerationLog({ channelId: resolvedChannelId, commentKey, userId: normalizedUserId, userName, text: normalizedText, avatarUrl, attachments: moderationAttachments, replyToId: normalizedReplyToId, sourceType, commentId: String(commentId || "").trim(), decision: "allowed", mode: settings.aiEnabled ? "basic+ai" : "basic", action: "allow", reasons: [], labels: ai.labels || [], confidence: ai.confidence || 0, matchedWords: basic.matchedWords, matchedRegex: basic.matchedRegex });

  return { allowed: true, action: "allow", mode: settings.aiEnabled ? "basic+ai" : "basic", channelId: resolvedChannelId, settings, reasons: [], labels: ai.labels || [], confidence: ai.confidence || 0, matchedWords: basic.matchedWords, matchedRegex: basic.matchedRegex };
}

module.exports = {
  PRESET_COMMON_STOPWORDS,
  moderateComment
};
