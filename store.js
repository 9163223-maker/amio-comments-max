const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const STORE_JSON_SPACING = String(process.env.STORE_PRETTY_JSON || "").trim() === "1" ? 2 : 0;
const MAX_STORED_INLINE_STRING = 4096;

function stringifyStorePayload(value) {
  return JSON.stringify(value, null, STORE_JSON_SPACING || undefined);
}

function writeStoreFile(value) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, stringifyStorePayload(value), "utf8");
}

function isInlineDataString(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^data:/i.test(raw)) return true;
  return raw.length > MAX_STORED_INLINE_STRING && /^[A-Za-z0-9+/=]+$/.test(raw.slice(0, Math.min(raw.length, 256)));
}

function sanitizePayloadValue(value, stats) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isInlineDataString(raw)) {
    stats.changed = true;
    stats.removedInlinePayloads = (stats.removedInlinePayloads || 0) + 1;
    return "";
  }
  return raw.slice(0, MAX_STORED_INLINE_STRING);
}

function sanitizeStoredAttachment(input, stats) {
  const source = input && typeof input === "object" ? input : {};
  if (!source || typeof source !== "object") {
    stats.changed = true;
    return null;
  }
  if (source.dataUrl || source.base64 || source.previewData || source.localUrl) {
    stats.changed = true;
    stats.removedInlineAttachments = (stats.removedInlineAttachments || 0) + 1;
  }
  const payloadSource = source.payload && typeof source.payload === "object" ? source.payload : {};
  const payload = {};
  ["token", "url", "download_url", "link", "file_id", "image_id", "photo_id", "video_id", "audio_id", "document_id"].forEach((key) => {
    const cleaned = sanitizePayloadValue(payloadSource[key], stats);
    if (cleaned) payload[key] = cleaned;
  });
  // MAX image upload can return nested payload.photos, not a flat URL.
  // Preserve only short ids/tokens so rendering can stay native without storing base64.
  if (payloadSource.photos && typeof payloadSource.photos === "object") {
    const photos = {};
    Object.entries(payloadSource.photos).slice(0, 8).forEach(([key, value]) => {
      const cleanedKey = String(key || "").slice(0, 120);
      const cleanedValue = sanitizePayloadValue(value, stats);
      if (cleanedKey && cleanedValue) photos[cleanedKey] = cleanedValue;
    });
    if (Object.keys(photos).length) payload.photos = photos;
  }
  const previewUrl = sanitizePayloadValue(source.previewUrl || source.preview_url || source.localPreviewUrl || "", stats);
  const posterUrl = sanitizePayloadValue(source.posterUrl || source.poster_url || "", stats);
  const url = sanitizePayloadValue(source.url || source.download_url || source.link || payload.url || payload.download_url || payload.link || "", stats);
  const rawType = String(source.type || "file").trim().toLowerCase();
  const type = ["image", "video", "audio", "file"].includes(rawType) ? rawType : "file";
  const fallbackId = String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
  const id = String(source.id || payload.token || payload.file_id || payload.image_id || payload.photo_id || fallbackId).slice(0, 180);
  const item = {
    id,
    type,
    name: String(source.name || source.fileName || source.filename || "Вложение").slice(0, 180),
    mime: String(source.mime || source.mimeType || "").slice(0, 120),
    size: Number(source.size || 0) || 0,
    url,
    previewUrl,
    posterUrl,
    payload,
    native: Boolean(source.native || Object.keys(payload).length)
  };
  if (!item.url && !item.previewUrl && !item.posterUrl && !Object.keys(item.payload).length && !item.name) return null;
  return item;
}

function cleanupStoreForRuntime(value) {
  const stats = { changed: false };
  const comments = value && typeof value === "object" && value.comments && typeof value.comments === "object" ? value.comments : {};
  Object.keys(comments).forEach((key) => {
    const list = Array.isArray(comments[key]) ? comments[key] : [];
    list.forEach((comment) => {
      if (!comment || typeof comment !== "object") return;
      if (comment.dataUrl || comment.base64) {
        delete comment.dataUrl;
        delete comment.base64;
        stats.changed = true;
      }
      if (Array.isArray(comment.attachments)) {
        const clean = comment.attachments.map((item) => sanitizeStoredAttachment(item, stats)).filter(Boolean);
        if (clean.length !== comment.attachments.length) stats.changed = true;
        comment.attachments = clean;
      }
    });
  });
  const reactions = value && typeof value === "object" && value.reactions && typeof value.reactions === "object" ? value.reactions : {};
  Object.keys(reactions).forEach((commentKey) => {
    const byComment = reactions[commentKey] || {};
    Object.keys(byComment).forEach((commentId) => {
      const byEmoji = byComment[commentId] || {};
      Object.keys(byEmoji).forEach((emoji) => {
        const cleanEmoji = String(emoji || "").trim();
        const byUser = byEmoji[emoji] || {};
        const hasActive = Object.values(byUser).some(Boolean);
        if (!cleanEmoji || !hasActive) {
          delete byEmoji[emoji];
          stats.changed = true;
          stats.removedEmptyReactions = (stats.removedEmptyReactions || 0) + 1;
        }
      });
    });
  });
  if (Array.isArray(value?.moderation?.logs) && value.moderation.logs.length > 500) {
    value.moderation.logs = value.moderation.logs.slice(-500);
    stats.changed = true;
  }
  return stats;
}


function createEmptyStore() {
  return {
    posts: {},
    comments: {},
    channels: {},
    setupState: {},
    likes: {},
    reactions: {},
    handoffs: {},
    moderation: {
      byChannel: {},
      logs: []
    },
    growth: {
      byChannel: {},
      clicks: [],
      pollVotes: [],
      memberSnapshots: {}
    },
    gifts: {
      campaigns: {},
      claims: {},
      settings: {
        uploadLimits: {
          enabled: true,
          maxFiles: 1,
          maxBytes: 50 * 1024 * 1024,
          allowedTypes: ["file", "image", "video", "audio"],
          allowedExtensions: []
        }
      }
    }
  };
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    writeStoreFile(createEmptyStore());
  }
}

function normalizeStoreShape(parsed) {
  const empty = createEmptyStore();
  return {
    posts: parsed.posts || empty.posts,
    comments: parsed.comments || empty.comments,
    channels: parsed.channels || empty.channels,
    setupState: parsed.setupState || empty.setupState,
    likes: parsed.likes || empty.likes,
    reactions: parsed.reactions || empty.reactions,
    handoffs: parsed.handoffs || empty.handoffs,
    moderation: {
      byChannel: parsed.moderation?.byChannel || {},
      logs: Array.isArray(parsed.moderation?.logs) ? parsed.moderation.logs : []
    },
    growth: {
      byChannel: parsed.growth?.byChannel || {},
      clicks: Array.isArray(parsed.growth?.clicks) ? parsed.growth.clicks : [],
      pollVotes: Array.isArray(parsed.growth?.pollVotes) ? parsed.growth.pollVotes : [],
      memberSnapshots: parsed.growth?.memberSnapshots && typeof parsed.growth.memberSnapshots === "object" ? parsed.growth.memberSnapshots : {}
    },
    gifts: {
      campaigns: parsed.gifts?.campaigns || empty.gifts.campaigns,
      claims: parsed.gifts?.claims || empty.gifts.claims,
      settings: {
        ...(empty.gifts.settings || {}),
        ...(parsed.gifts?.settings || {}),
        uploadLimits: {
          ...(empty.gifts.settings?.uploadLimits || {}),
          ...(parsed.gifts?.settings?.uploadLimits || {})
        }
      }
    }
  };
}

function loadStore() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeStoreShape(parsed);
    const cleanup = cleanupStoreForRuntime(normalized);
    if (cleanup.changed) writeStoreFile(normalized);
    return normalized;
  } catch {
    return createEmptyStore();
  }
}

const store = loadStore();

function persist() {
  ensureDataFile();
  writeStoreFile(store);
}

function saveStore(nextStore) {
  if (nextStore && typeof nextStore === "object") {
    const normalized = normalizeStoreShape(nextStore);
    Object.assign(store, normalized);
  }

  persist();
  return store;
}

function normalizeKey(value) {
  return String(value || "")
    .replace(/^:+/, "")
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

function safeDecode(value) {
  let current = String(value || "");
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function extractLookupCandidates(value) {
  const raw = normalizeKey(value);
  if (!raw) return [];

  const set = new Set();
  const decoded = normalizeKey(safeDecode(raw));
  const add = (item) => {
    const normalized = normalizeKey(item);
    if (normalized) set.add(normalized);
  };

  add(raw);
  add(decoded);

  const variants = [raw, decoded];

  for (const variant of variants) {
    if (!variant) continue;

    const trimmedUrl = variant.replace(/^[^?]*\?/, "");
    if (trimmedUrl && trimmedUrl !== variant) {
      try {
        const params = new URLSearchParams(trimmedUrl);
        add(params.get("startapp"));
        add(params.get("postId"));
        add(params.get("commentKey"));
        add(params.get("start_param"));
        add(params.get("handoff"));
      } catch {}
    }

    if (variant.includes("?")) {
      try {
        const params = new URLSearchParams(variant.split("?")[1] || "");
        add(params.get("startapp"));
        add(params.get("postId"));
        add(params.get("commentKey"));
        add(params.get("start_param"));
        add(params.get("handoff"));
      } catch {}
    }

    if (variant.includes("#")) {
      const hash = variant.split("#")[1] || "";
      add(hash);
      if (hash.includes("?")) {
        try {
          const params = new URLSearchParams(hash.split("?")[1] || "");
          add(params.get("startapp"));
          add(params.get("postId"));
          add(params.get("commentKey"));
          add(params.get("start_param"));
          add(params.get("handoff"));
        } catch {}
      }
    }

    const explicitKey = variant.match(/-?\d+:-?\d+/g) || [];
    explicitKey.forEach(add);

    const handoffMatches = [...variant.matchAll(/(?:^|[^\w-])(h_[A-Za-z0-9_-]{6,})(?:$|[^\w-])/g)];
    handoffMatches.forEach((match) => add(match[1]));

    const longNumbers = variant.match(/-?\d{8,}/g) || [];
    longNumbers.forEach(add);
  }

  return [...set];
}

function normalizeHandoffToken(value) {
  return String(value || "")
    .trim()
    .replace(/^handoff[:=_-]?/i, "")
    .replace(/^h_+/i, "")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

function makeHandoffToken(seed = "") {
  const normalizedSeed = String(seed || "").replace(/[^A-Za-z0-9]/g, "").slice(-12);
  const randomPart = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `h_${(normalizedSeed + randomPart).slice(0, 48)}`;
}

function saveHandoff(token, data) {
  const normalized = normalizeHandoffToken(token);
  if (!normalized) return "";

  const key = `h_${normalized}`;
  store.handoffs[key] = {
    ...(store.handoffs[key] || {}),
    ...data,
    token: key,
    updatedAt: Date.now()
  };
  persist();
  return key;
}

function getHandoff(token) {
  const normalized = normalizeHandoffToken(token);
  if (!normalized) return null;
  return store.handoffs[`h_${normalized}`] || null;
}

function resolveCommentKeyFromHandoff(token) {
  const handoff = getHandoff(token);
  return handoff?.commentKey || "";
}

function makeCommentKey(channelId, postId) {
  return `${String(channelId || "").trim()}:${String(postId || "").trim()}`;
}

function savePost(commentKey, post) {
  const key = normalizeKey(commentKey);
  if (!key) return null;

  store.posts[key] = {
    ...(store.posts[key] || {}),
    ...post,
    commentKey: key,
    updatedAt: Date.now()
  };

  if (!store.comments[key]) store.comments[key] = [];
  if (!store.likes[key]) store.likes[key] = {};
  if (!store.reactions[key]) store.reactions[key] = {};

  const handoffToken = String(store.posts[key]?.handoffToken || "").trim();
  if (handoffToken) {
    saveHandoff(handoffToken, {
      commentKey: key,
      postId: String(store.posts[key]?.postId || ""),
      channelId: String(store.posts[key]?.channelId || ""),
      messageId: String(store.posts[key]?.messageId || "")
    });
  } else {
    persist();
  }
  return store.posts[key];
}

function getPost(commentKey) {
  return store.posts[normalizeKey(commentKey)] || null;
}

function getPostsList() {
  return Object.values(store.posts).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}


function listPostsByChannel(channelId = "", limit = 100) {
  const normalizedChannelId = String(channelId || "").trim();
  return getPostsList()
    .filter((post) => {
      if (normalizedChannelId && String(post.channelId || "") !== normalizedChannelId) return false;
      return true;
    })
    .slice(0, Math.max(1, Math.min(Number(limit || 100), 500)));
}

function savePostVersion(commentKey, entry = {}) {
  const key = normalizeKey(commentKey);
  if (!key || !store.posts[key]) return null;
  if (!Array.isArray(store.posts[key].versions)) store.posts[key].versions = [];
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    commentKey: key,
    createdAt: Date.now(),
    versionNo: store.posts[key].versions.length + 1,
    ...entry
  };
  store.posts[key].versions.unshift(item);
  store.posts[key].versions = store.posts[key].versions.slice(0, 50);
  persist();
  return item;
}

function listPostVersions(commentKey = "") {
  const key = normalizeKey(commentKey);
  const post = store.posts[key];
  if (!post || !Array.isArray(post.versions)) return [];
  return [...post.versions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function findPostKeyByPostId(postId) {
  const normalized = String(postId || "").trim();
  if (!normalized) return null;

  for (const key of Object.keys(store.posts)) {
    if (String(store.posts[key]?.postId || "") === normalized) {
      return key;
    }
  }

  return null;
}

function findPostByAnyId(value) {
  const candidates = extractLookupCandidates(value);

  for (const candidate of candidates) {
    if (store.posts[candidate]) return store.posts[candidate];

    const handoffKey = resolveCommentKeyFromHandoff(candidate);
    if (handoffKey && store.posts[handoffKey]) return store.posts[handoffKey] || null;

    const byPostIdKey = findPostKeyByPostId(candidate);
    if (byPostIdKey) return store.posts[byPostIdKey] || null;
  }

  return null;
}

function findPostByChannelAndPost(channelId, postId) {
  const key = makeCommentKey(channelId, postId);
  return getPost(key);
}

function getComments(commentKey) {
  return store.comments[normalizeKey(commentKey)] || [];
}

function addComment(commentKey, comment) {
  const key = normalizeKey(commentKey);
  if (!key) return null;

  if (!store.comments[key]) store.comments[key] = [];

  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    likes: 0,
    createdAt: Date.now(),
    ...comment
  };

  store.comments[key].push(item);
  persist();
  return item;
}

function setComments(commentKey, comments) {
  store.comments[normalizeKey(commentKey)] = Array.isArray(comments) ? comments : [];
  persist();
  return store.comments[normalizeKey(commentKey)];
}

function saveChannel(channelId, data) {
  const key = String(channelId || "").trim();
  if (!key) return null;

  store.channels[key] = {
    ...(store.channels[key] || {}),
    ...data,
    channelId: key,
    updatedAt: Date.now()
  };

  persist();
  return store.channels[key];
}

function getChannelsList() {
  return Object.values(store.channels).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function setSetupState(userId, state) {
  const key = String(userId || "").trim();
  if (!key) return null;

  store.setupState[key] = {
    ...(store.setupState[key] || {}),
    ...state,
    updatedAt: Date.now()
  };

  persist();
  return store.setupState[key];
}

function getSetupState(userId) {
  return store.setupState[String(userId || "").trim()] || null;
}

function clearSetupState(userId) {
  delete store.setupState[String(userId || "").trim()];
  persist();
}

function getLikesMap(commentKey) {
  return store.likes[normalizeKey(commentKey)] || {};
}

function setLikeState(commentKey, commentId, userId, value) {
  const key = normalizeKey(commentKey);
  if (!store.likes[key]) store.likes[key] = {};
  if (!store.likes[key][commentId]) store.likes[key][commentId] = {};

  store.likes[key][commentId][String(userId || "guest")] = Boolean(value);
  persist();
  return store.likes[key][commentId];
}

function getReactionsMap(commentKey) {
  return store.reactions[normalizeKey(commentKey)] || {};
}

function setReactionState(commentKey, commentId, emoji, userId, value) {
  const key = normalizeKey(commentKey);
  const normalizedEmoji = String(emoji || "").trim();
  const normalizedUserId = String(userId || "guest").trim();
  if (!key || !commentId || !normalizedEmoji || !normalizedUserId) return {};
  if (!store.reactions[key]) store.reactions[key] = {};
  if (!store.reactions[key][commentId]) store.reactions[key][commentId] = {};
  if (!store.reactions[key][commentId][normalizedEmoji]) store.reactions[key][commentId][normalizedEmoji] = {};
  store.reactions[key][commentId][normalizedEmoji][normalizedUserId] = Boolean(value);
  persist();
  return store.reactions[key][commentId];
}



function saveChannelMemberSnapshot(channelId, snapshot = {}) {
  const key = String(channelId || "").trim();
  if (!key) return null;
  if (!store.growth) store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
  if (!store.growth.memberSnapshots || typeof store.growth.memberSnapshots !== "object") store.growth.memberSnapshots = {};
  if (!Array.isArray(store.growth.memberSnapshots[key])) store.growth.memberSnapshots[key] = [];

  const memberIds = Array.isArray(snapshot.memberIds)
    ? [...new Set(snapshot.memberIds.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
  const item = {
    channelId: key,
    capturedAt: Number(snapshot.capturedAt || Date.now()) || Date.now(),
    memberCount: Number.isFinite(Number(snapshot.memberCount)) ? Number(snapshot.memberCount) : memberIds.length,
    memberIds,
    source: String(snapshot.source || "api").trim() || "api"
  };

  store.growth.memberSnapshots[key].push(item);
  store.growth.memberSnapshots[key] = store.growth.memberSnapshots[key]
    .sort((a, b) => (a.capturedAt || 0) - (b.capturedAt || 0))
    .slice(-96);
  persist();
  return item;
}

function listChannelMemberSnapshots(channelId = "") {
  const key = String(channelId || "").trim();
  if (!key) return [];
  const items = store.growth?.memberSnapshots?.[key];
  return Array.isArray(items) ? [...items].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)) : [];
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  }
  return [...new Set(String(value || "")
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean))];
}

function normalizeGiftAttachment(input) {
  const source = input && typeof input === "object" ? input : {};
  const type = String(source.type || "").trim().toLowerCase();
  const payload = source.payload && typeof source.payload === "object" ? source.payload : {};
  const token = String(
    source.token ||
      payload.token ||
      payload.file_token ||
      payload.video_token ||
      payload.audio_token ||
      ""
  ).trim();

  if (!type) return null;
  if (!token && Object.keys(payload).length === 0) return null;

  const fileName = String(
    source.fileName ||
      source.filename ||
      source.name ||
      payload.file_name ||
      payload.filename ||
      payload.name ||
      ""
  ).trim();

  const size = Number(
    source.size ||
      payload.size ||
      payload.file_size ||
      0
  ) || 0;

  const mimeType = String(
    source.mimeType ||
      source.mime ||
      payload.mime_type ||
      payload.mime ||
      ""
  ).trim();

  return {
    type,
    payload: Object.keys(payload).length ? payload : { token },
    token,
    fileName,
    size,
    mimeType,
    uploadedAt: Number(source.uploadedAt || Date.now())
  };
}

function normalizeGiftUploadLimits(input) {
  const source = input && typeof input === "object" ? input : {};
  const defaults = createEmptyStore().gifts.settings.uploadLimits;
  return {
    enabled: source.enabled !== false,
    maxFiles: normalizePositiveInt(source.maxFiles, defaults.maxFiles),
    maxBytes: normalizePositiveInt(source.maxBytes, defaults.maxBytes),
    allowedTypes: normalizeStringList(source.allowedTypes || defaults.allowedTypes),
    allowedExtensions: normalizeStringList(source.allowedExtensions || [])
  };
}

function getGiftSettings() {
  if (!store.gifts.settings) store.gifts.settings = { uploadLimits: normalizeGiftUploadLimits() };
  if (!store.gifts.settings.uploadLimits) {
    store.gifts.settings.uploadLimits = normalizeGiftUploadLimits();
  }
  return {
    uploadLimits: normalizeGiftUploadLimits(store.gifts.settings.uploadLimits)
  };
}

function saveGiftSettings(nextSettings = {}) {
  const current = getGiftSettings();
  store.gifts.settings = {
    ...current,
    ...nextSettings,
    uploadLimits: normalizeGiftUploadLimits({
      ...(current.uploadLimits || {}),
      ...(nextSettings.uploadLimits || {})
    })
  };
  persist();
  return getGiftSettings();
}

function normalizeGiftCampaign(input) {
  const source = input && typeof input === "object" ? input : {};
  const id = normalizeKey(source.id || source.campaignId || `gift_${Date.now().toString(36)}`);
  const postIdsSource = Array.isArray(source.postIds)
    ? source.postIds
    : String(source.postIds || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    id,
    title: String(source.title || "Новый подарок").trim(),
    description: String(source.description || "").trim(),
    enabled: source.enabled !== false,
    channelId: String(source.channelId || "").trim(),
    requiredChatId: String(source.requiredChatId || source.channelId || "").trim(),
    postIds: [...new Set(postIdsSource.map((item) => String(item || "").trim()).filter(Boolean))],
    commentKey: String(source.commentKey || "").trim(),
    subscribeUrl: String(source.subscribeUrl || "").trim(),
    giftButtonText: String(source.giftButtonText || "🎁 Получить подарок").trim(),
    subscribeButtonText: String(source.subscribeButtonText || "🔔 Подписаться").trim(),
    giftMessage: String(source.giftMessage || "Спасибо за подписку! Забирайте подарок ниже.").trim(),
    successNotification: String(source.successNotification || "Подарок отправлен в личные сообщения").trim(),
    alreadyClaimedNotification: String(source.alreadyClaimedNotification || "Подарок уже был отправлен ранее").trim(),
    notSubscribedNotification: String(source.notSubscribedNotification || "Сначала подпишитесь на канал, затем нажмите кнопку ещё раз").trim(),
    dmDeliveryFallbackNotification: String(source.dmDeliveryFallbackNotification || "Не удалось отправить подарок в личные сообщения. Откройте бота и нажмите Старт, затем нажмите кнопку ещё раз.").trim(),
    dmButtonText: String(source.dmButtonText || "Открыть подарок").trim(),
    giftUrl: String(source.giftUrl || "").trim(),
    giftAttachment: normalizeGiftAttachment(source.giftAttachment),
    leadMagnetCode: String(source.leadMagnetCode || "").trim(),
    onlyOnce: source.onlyOnce !== false,
    deliverToDm: source.deliverToDm !== false,
    createdAt: Number(source.createdAt || Date.now()),
    updatedAt: Date.now()
  };
}

function listGiftCampaigns() {
  return Object.values(store.gifts.campaigns || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function getGiftCampaign(campaignId) {
  return store.gifts.campaigns[normalizeKey(campaignId)] || null;
}

function saveGiftCampaign(campaignInput) {
  const campaign = normalizeGiftCampaign({
    ...(getGiftCampaign(campaignInput?.id || campaignInput?.campaignId) || {}),
    ...campaignInput
  });

  if (!store.gifts.campaigns) store.gifts.campaigns = {};
  store.gifts.campaigns[campaign.id] = campaign;
  persist();
  return campaign;
}

function deleteGiftCampaign(campaignId) {
  const normalizedId = normalizeKey(campaignId);
  if (!normalizedId) return null;
  const existing = getGiftCampaign(normalizedId);
  if (!existing) return null;
  if (!store.gifts.campaigns) store.gifts.campaigns = {};
  delete store.gifts.campaigns[normalizedId];
  if (store.gifts.claims) {
    Object.keys(store.gifts.claims).forEach((key) => {
      if (String(key || '').startsWith(`${normalizedId}:`)) delete store.gifts.claims[key];
    });
  }
  persist();
  return existing;
}

function findGiftCampaignForPost({ channelId, postId, commentKey } = {}) {
  const normalizedChannelId = String(channelId || "").trim();
  const normalizedPostId = String(postId || "").trim();
  const normalizedCommentKey = normalizeKey(commentKey || "");
  const campaigns = listGiftCampaigns();

  return (
    campaigns.find((campaign) => {
      if (!campaign?.enabled) return false;
      const campaignChannelIds = [campaign.channelId, campaign.requiredChatId].map((item) => String(item || "").trim()).filter(Boolean);
      const channelMatches = !normalizedChannelId || campaignChannelIds.length === 0 || campaignChannelIds.includes(normalizedChannelId);
      const postMatches = normalizedPostId && Array.isArray(campaign.postIds) && campaign.postIds.map((item) => String(item || "").trim()).includes(normalizedPostId);
      const commentMatches = normalizedCommentKey && normalizeKey(campaign.commentKey || "") === normalizedCommentKey;
      if (commentMatches) return true;
      if (postMatches && channelMatches) return true;
      // Legacy fallback: old builds sometimes saved a post id without a reliable channel id.
      if (postMatches && !campaignChannelIds.length) return true;
      return false;
    }) || null
  );
}

function getGiftClaimKey(campaignId, userId) {
  return `${normalizeKey(campaignId)}:${String(userId || "").trim()}`;
}

function getGiftClaim(campaignId, userId) {
  return store.gifts.claims[getGiftClaimKey(campaignId, userId)] || null;
}

function saveGiftClaim(campaignId, userId, claimData) {
  if (!store.gifts.claims) store.gifts.claims = {};
  const key = getGiftClaimKey(campaignId, userId);
  store.gifts.claims[key] = {
    ...(store.gifts.claims[key] || {}),
    campaignId: normalizeKey(campaignId),
    userId: String(userId || "").trim(),
    ...claimData,
    updatedAt: Date.now()
  };
  persist();
  return store.gifts.claims[key];
}

function listGiftClaims(campaignId = "") {
  const normalizedCampaignId = normalizeKey(campaignId);
  const values = Object.values(store.gifts.claims || {});
  if (!normalizedCampaignId) return values.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return values
    .filter((item) => String(item.campaignId || "") === normalizedCampaignId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function getLatestPost() {
  return getPostsList()[0] || null;
}


function getChannelIdFromCommentKey(commentKey) {
  const normalized = normalizeKey(commentKey);
  if (!normalized || !normalized.includes(":")) return "";
  return normalized.split(":")[0] || "";
}

function getDefaultModerationSettings(channelId = "") {
  return {
    channelId: String(channelId || "").trim(),
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
    minTextLengthForCapsCheck: 8,
    maxUppercaseRatio: 0.75,
    customBlocklist: [],
    regexRules: [],
    whitelistUsers: [],
    shadowBanUsers: [],
    notes: "",
    updatedAt: 0
  };
}

function sanitizeArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 500);
}

function getModerationSettings(channelId = "") {
  const key = String(channelId || "").trim();
  const defaults = getDefaultModerationSettings(key);
  const current = store.moderation?.byChannel?.[key] || {};
  return {
    ...defaults,
    ...current,
    customBlocklist: sanitizeArray(current.customBlocklist || defaults.customBlocklist),
    regexRules: sanitizeArray(current.regexRules || defaults.regexRules),
    whitelistUsers: sanitizeArray(current.whitelistUsers || defaults.whitelistUsers),
    shadowBanUsers: sanitizeArray(current.shadowBanUsers || defaults.shadowBanUsers)
  };
}

function saveModerationSettings(channelId = "", settings = {}) {
  const key = String(channelId || "").trim();
  if (!key) return null;
  if (!store.moderation) store.moderation = { byChannel: {}, logs: [] };
  const current = getModerationSettings(key);
  const merged = {
    ...current,
    ...settings,
    channelId: key,
    customBlocklist: sanitizeArray(settings.customBlocklist ?? current.customBlocklist),
    regexRules: sanitizeArray(settings.regexRules ?? current.regexRules),
    whitelistUsers: sanitizeArray(settings.whitelistUsers ?? current.whitelistUsers),
    shadowBanUsers: sanitizeArray(settings.shadowBanUsers ?? current.shadowBanUsers),
    updatedAt: Date.now()
  };
  store.moderation.byChannel[key] = merged;
  persist();
  return merged;
}

function addModerationLog(entry = {}) {
  if (!store.moderation) store.moderation = { byChannel: {}, logs: [] };
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...entry
  };
  store.moderation.logs.unshift(item);
  store.moderation.logs = store.moderation.logs.slice(0, 1000);
  persist();
  return item;
}


function getModerationLog(logId = "") {
  const normalizedId = String(logId || "").trim();
  if (!normalizedId) return null;
  return (store.moderation?.logs || []).find((item) => String(item.id || "") === normalizedId) || null;
}

function updateModerationLog(logId = "", patch = {}) {
  const normalizedId = String(logId || "").trim();
  if (!normalizedId) return null;
  if (!store.moderation) store.moderation = { byChannel: {}, logs: [] };
  const index = (store.moderation.logs || []).findIndex((item) => String(item.id || "") === normalizedId);
  if (index < 0) return null;
  store.moderation.logs[index] = {
    ...store.moderation.logs[index],
    ...patch,
    id: store.moderation.logs[index].id,
    updatedAt: Date.now()
  };
  persist();
  return store.moderation.logs[index];
}

function listModerationLogs({ channelId = "", commentKey = "", limit = 100 } = {}) {
  const normalizedChannelId = String(channelId || "").trim();
  const normalizedCommentKey = normalizeKey(commentKey);
  return (store.moderation?.logs || [])
    .filter((item) => {
      if (normalizedChannelId && String(item.channelId || "") !== normalizedChannelId) return false;
      if (normalizedCommentKey && normalizeKey(item.commentKey) !== normalizedCommentKey) return false;
      return true;
    })
    .slice(0, Math.max(1, Math.min(Number(limit || 100), 500)));
}


function sanitizeGrowthButton(input = {}, index = 0) {
  const source = input && typeof input === "object" ? input : {};
  const text = String(source.text || "").trim();
  const url = String(source.url || "").trim();
  if (!text || !url) return null;
  const id = normalizeKey(source.id || `btn_${index + 1}`) || `btn_${index + 1}`;
  const postIds = Array.isArray(source.postIds)
    ? source.postIds
    : String(source.postIds || "").split(/[\n,]/g);
  return {
    id,
    text: text.slice(0, 64),
    url,
    enabled: source.enabled !== false,
    postIds: [...new Set(postIds.map((item) => String(item || "").trim()).filter(Boolean))],
    style: String(source.style || "primary").trim() || "primary"
  };
}

function sanitizeGrowthPoll(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const optionsInput = Array.isArray(source.options)
    ? source.options
    : String(source.options || "").split(/\r?\n|,/g).map((item) => ({ text: item }));
  const options = optionsInput
    .map((item, index) => {
      const text = String(item?.text || item || "").trim();
      if (!text) return null;
      return {
        id: normalizeKey(item?.id || `opt_${index + 1}`) || `opt_${index + 1}`,
        text: text.slice(0, 120)
      };
    })
    .filter(Boolean)
    .slice(0, 12);
  const postIds = Array.isArray(source.postIds)
    ? source.postIds
    : String(source.postIds || "").split(/[\n,]/g);
  return {
    id: normalizeKey(source.id || "poll_main") || "poll_main",
    enabled: Boolean(source.enabled),
    question: String(source.question || "").trim().slice(0, 300),
    options,
    postIds: [...new Set(postIds.map((item) => String(item || "").trim()).filter(Boolean))],
    allowRevote: Boolean(source.allowRevote)
  };
}

function getDefaultGrowthSettings(channelId = "") {
  return {
    channelId: String(channelId || "").trim(),
    planTier: "free",
    whiteLabelEnabled: false,
    agencyMode: false,
    agencyBrandName: "",
    brandName: "АдминКит",
    brandUrl: "",
    leadMagnetEnabled: true,
    leadMagnetText: "Подключить такие же комментарии в свой канал",
    leadMagnetUrl: "",
    keyboardLeadMagnetEnabled: true,
    trackedButtons: [],
    poll: sanitizeGrowthPoll({}),
    notes: "",
    updatedAt: 0
  };
}

function getGrowthSettings(channelId = "") {
  const key = String(channelId || "").trim();
  const defaults = getDefaultGrowthSettings(key);
  const current = store.growth?.byChannel?.[key] || {};
  return {
    ...defaults,
    ...current,
    trackedButtons: (Array.isArray(current.trackedButtons) ? current.trackedButtons : [])
      .map((item, index) => sanitizeGrowthButton(item, index))
      .filter(Boolean)
      .slice(0, 20),
    poll: sanitizeGrowthPoll(current.poll || defaults.poll)
  };
}

function saveGrowthSettings(channelId = "", settings = {}) {
  const key = String(channelId || "").trim();
  if (!key) return null;
  if (!store.growth) store.growth = { byChannel: {}, clicks: [], pollVotes: [] };
  const current = getGrowthSettings(key);
  const merged = {
    ...current,
    ...settings,
    channelId: key,
    planTier: String(settings.planTier || current.planTier || "free").trim() || "free",
    whiteLabelEnabled: Boolean(settings.whiteLabelEnabled),
    agencyMode: Boolean(settings.agencyMode),
    agencyBrandName: String(settings.agencyBrandName ?? current.agencyBrandName ?? "").trim(),
    brandName: String(settings.brandName ?? current.brandName ?? "АдминКит").trim() || "АдминКит",
    brandUrl: String(settings.brandUrl ?? current.brandUrl ?? "").trim(),
    leadMagnetEnabled: settings.leadMagnetEnabled !== undefined ? Boolean(settings.leadMagnetEnabled) : Boolean(current.leadMagnetEnabled),
    leadMagnetText: String(settings.leadMagnetText ?? current.leadMagnetText ?? "Подключить такие же комментарии в свой канал").trim() || "Подключить такие же комментарии в свой канал",
    leadMagnetUrl: String(settings.leadMagnetUrl ?? current.leadMagnetUrl ?? "").trim(),
    keyboardLeadMagnetEnabled: settings.keyboardLeadMagnetEnabled !== undefined ? Boolean(settings.keyboardLeadMagnetEnabled) : Boolean(current.keyboardLeadMagnetEnabled),
    trackedButtons: (Array.isArray(settings.trackedButtons) ? settings.trackedButtons : current.trackedButtons)
      .map((item, index) => sanitizeGrowthButton(item, index))
      .filter(Boolean)
      .slice(0, 20),
    poll: sanitizeGrowthPoll(settings.poll ?? current.poll),
    notes: String(settings.notes ?? current.notes ?? "").trim(),
    updatedAt: Date.now()
  };
  store.growth.byChannel[key] = merged;
  persist();
  return merged;
}

function addGrowthClick(entry = {}) {
  if (!store.growth) store.growth = { byChannel: {}, clicks: [], pollVotes: [] };
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    channelId: String(entry.channelId || "").trim(),
    buttonId: normalizeKey(entry.buttonId || ""),
    buttonText: String(entry.buttonText || "").trim(),
    targetUrl: String(entry.targetUrl || "").trim(),
    userId: String(entry.userId || "").trim(),
    commentKey: normalizeKey(entry.commentKey || ""),
    postId: String(entry.postId || "").trim(),
    source: String(entry.source || "button").trim() || "button",
    createdAt: Date.now()
  };
  store.growth.clicks.unshift(item);
  store.growth.clicks = store.growth.clicks.slice(0, 5000);
  persist();
  return item;
}

function listGrowthClicks({ channelId = "", limit = 100 } = {}) {
  const normalizedChannelId = String(channelId || "").trim();
  return (store.growth?.clicks || [])
    .filter((item) => {
      if (normalizedChannelId && String(item.channelId || "") !== normalizedChannelId) return false;
      return true;
    })
    .slice(0, Math.max(1, Math.min(Number(limit || 100), 500)));
}

function saveGrowthPollVote(entry = {}) {
  if (!store.growth) store.growth = { byChannel: {}, clicks: [], pollVotes: [] };
  const normalizedChannelId = String(entry.channelId || "").trim();
  const normalizedPollId = normalizeKey(entry.pollId || "poll_main");
  const normalizedUserId = String(entry.userId || "guest").trim() || "guest";
  const normalizedOptionId = normalizeKey(entry.optionId || "");
  const allowRevote = Boolean(entry.allowRevote);

  if (!normalizedChannelId || !normalizedOptionId) return null;

  const existingIndex = (store.growth.pollVotes || []).findIndex((item) =>
    String(item.channelId || "") === normalizedChannelId &&
    normalizeKey(item.pollId || "") === normalizedPollId &&
    String(item.userId || "") === normalizedUserId
  );

  if (existingIndex >= 0 && !allowRevote) {
    return store.growth.pollVotes[existingIndex];
  }

  const item = {
    id: existingIndex >= 0 ? store.growth.pollVotes[existingIndex].id : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    channelId: normalizedChannelId,
    pollId: normalizedPollId,
    optionId: normalizedOptionId,
    userId: normalizedUserId,
    commentKey: normalizeKey(entry.commentKey || ""),
    postId: String(entry.postId || "").trim(),
    createdAt: existingIndex >= 0 ? store.growth.pollVotes[existingIndex].createdAt : Date.now(),
    updatedAt: Date.now()
  };

  if (existingIndex >= 0) {
    store.growth.pollVotes[existingIndex] = item;
  } else {
    store.growth.pollVotes.push(item);
  }

  persist();
  return item;
}

function listGrowthPollVotes({ channelId = "", pollId = "" } = {}) {
  const normalizedChannelId = String(channelId || "").trim();
  const normalizedPollId = normalizeKey(pollId || "");
  return (store.growth?.pollVotes || []).filter((item) => {
    if (normalizedChannelId && String(item.channelId || "") !== normalizedChannelId) return false;
    if (normalizedPollId && normalizeKey(item.pollId || "") !== normalizedPollId) return false;
    return true;
  });
}

function getDebugSnapshot() {
  const snapshot = JSON.parse(JSON.stringify(store));
  for (const byComment of Object.values(snapshot.reactions || {})) {
    if (!byComment || typeof byComment !== "object") continue;
    for (const [commentId, byEmoji] of Object.entries(byComment)) {
      if (!byEmoji || typeof byEmoji !== "object") continue;
      for (const [emoji, byUser] of Object.entries(byEmoji)) {
        const normalizedEmoji = String(emoji || "").trim();
        const activeUsers = Object.entries(byUser || {}).filter(([, value]) => Boolean(value));
        if (!normalizedEmoji || !activeUsers.length) {
          delete byEmoji[emoji];
        }
      }
      if (!Object.keys(byEmoji).length) delete byComment[commentId];
    }
  }
  return {
    runtimeVersion: "SP27",
    generatedAt: Date.now(),
    ...snapshot
  };
}

module.exports = {
  saveChannelMemberSnapshot,
  listChannelMemberSnapshots,

  store,
  loadStore,
  saveStore,
  normalizeKey,
  extractLookupCandidates,
  makeCommentKey,
  savePost,
  getPost,
  getPostsList,
  listPostsByChannel,
  savePostVersion,
  listPostVersions,
  findPostKeyByPostId,
  findPostByAnyId,
  findPostByChannelAndPost,
  getComments,
  addComment,
  setComments,
  saveChannel,
  getChannelsList,
  getLatestPost,
  setSetupState,
  getSetupState,
  clearSetupState,
  getLikesMap,
  setLikeState,
  getReactionsMap,
  setReactionState,
  normalizeHandoffToken,
  makeHandoffToken,
  saveHandoff,
  getHandoff,
  resolveCommentKeyFromHandoff,
  listGiftCampaigns,
  getGiftCampaign,
  saveGiftCampaign,
  deleteGiftCampaign,
  findGiftCampaignForPost,
  getGiftClaim,
  saveGiftClaim,
  listGiftClaims,
  getGiftSettings,
  saveGiftSettings,
  normalizeGiftAttachment,
  normalizeGiftUploadLimits,
  getChannelIdFromCommentKey,
  getDefaultModerationSettings,
  getModerationSettings,
  saveModerationSettings,
  addModerationLog,
  listModerationLogs,
  getModerationLog,
  updateModerationLog,
  getDefaultGrowthSettings,
  getGrowthSettings,
  saveGrowthSettings,
  addGrowthClick,
  listGrowthClicks,
  saveGrowthPollVote,
  listGrowthPollVotes,
  getDebugSnapshot
};
