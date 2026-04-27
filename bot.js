const fs = require("fs");
const path = require("path");
const { tryPatchChannelPost, patchStoredPost } = require("./services/postPatcher");
const { editPostText, savePostKeyboard, setPostCommentsEnabled } = require("./services/postEditorService");
const {
  claimGift,
  listGiftCampaigns,
  getGiftCampaign,
  saveGiftCampaign,
  deleteGiftCampaign,
  getGiftSettings,
  saveGiftSettings,
  findGiftCampaignForPost
} = require("./services/giftService");
const { sendMessage, editMessage, deleteMessage, answerCallback, getBotChatMember, getChat, createUpload, uploadBinaryToUrl, buildUploadAttachmentPayload } = require("./services/maxApi");
const { safeJson } = require("./services/helpers");
const {
  getSetupState,
  setSetupState,
  clearSetupState,
  getPostsList,
  normalizeKey,
  getPost,
  savePost,
  getModerationSettings,
  saveModerationSettings,
  getComments,
  getReactionsMap,
  listChannelMemberSnapshots
} = require("./store");
const { listChannels, registerChannel } = require("./services/channelService");
const { listGrowthClicks, listGrowthPollVotes, buildAnalyticsSummary, captureChannelAudienceSnapshot } = require("./services/growthService");

const GIFT_WIZARD_STEPS = [
  {
    key: "giftAsset",
    prompt: "Пришлите файл подарка ИЛИ вставьте ссылку на подарок.",
    required: true,
    transform: (value) => String(value || "").trim()
  },
  {
    key: "giftMessage",
    prompt: "При желании пришлите текст для получателя. Можно отправить - и оставить текст по умолчанию.",
    required: false,
    transform: (value) => {
      const raw = String(value || "").trim();
      if (!raw || raw === "-" || /^skip$/i.test(raw)) return "";
      return raw;
    }
  }
];

const CALLBACK_DEDUPE_TTL_MS = 8000;
const CALLBACK_ACTION_TTL_MS = 2500;
const MENU_DEDUPE_TTL_MS = 2500;
const processedCallbacks = new Map();
const processedCallbackActions = new Map();
const recentMenus = new Map();

const ADMINKIT_MENU_LOGO_PATH = path.join(__dirname, "public", "adminkit_chat_logo.png");
let cachedAdminKitMenuLogoAttachment = null;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

async function getAdminKitMenuLogoAttachment(config = {}) {
  if (cachedAdminKitMenuLogoAttachment) return cloneJson(cachedAdminKitMenuLogoAttachment);
  if (!config?.botToken || !fs.existsSync(ADMINKIT_MENU_LOGO_PATH)) return null;
  try {
    const buffer = fs.readFileSync(ADMINKIT_MENU_LOGO_PATH);
    const uploadInitResponse = await createUpload({ botToken: config.botToken, type: "image" });
    const uploadResponse = await uploadBinaryToUrl({
      uploadUrl: uploadInitResponse?.url,
      botToken: config.botToken,
      buffer,
      fileName: "adminkit_chat_logo.png",
      mimeType: "image/png"
    });
    cachedAdminKitMenuLogoAttachment = buildUploadAttachmentPayload({
      uploadType: "image",
      uploadInitResponse,
      uploadResponse
    });
    return cloneJson(cachedAdminKitMenuLogoAttachment);
  } catch (error) {
    logVerbose(config, "ADMIN MENU LOGO UPLOAD FAILED", {
      error: error?.message || String(error),
      data: error?.data || null
    });
    return null;
  }
}

async function buildAdminMainMenuAttachments(config = null) {
  const keyboard = buildAdminSectionsKeyboard(config);
  const logoAttachment = await getAdminKitMenuLogoAttachment(config || {});
  return logoAttachment ? [logoAttachment, ...keyboard] : keyboard;
}


function pruneDedupeMap(map, ttlMs) {
  const now = Date.now();
  for (const [key, ts] of map.entries()) {
    if ((now - Number(ts || 0)) > ttlMs) map.delete(key);
  }
}

function markCallbackSeen(callbackId, actionKey = '') {
  pruneDedupeMap(processedCallbacks, CALLBACK_DEDUPE_TTL_MS);
  pruneDedupeMap(processedCallbackActions, CALLBACK_ACTION_TTL_MS);
  const now = Date.now();
  if (callbackId) processedCallbacks.set(String(callbackId), now);
  if (actionKey) processedCallbackActions.set(String(actionKey), now);
}

function isDuplicateCallback(callbackId, actionKey = '') {
  pruneDedupeMap(processedCallbacks, CALLBACK_DEDUPE_TTL_MS);
  pruneDedupeMap(processedCallbackActions, CALLBACK_ACTION_TTL_MS);
  if (callbackId && processedCallbacks.has(String(callbackId))) return true;
  if (actionKey && processedCallbackActions.has(String(actionKey))) return true;
  return false;
}

function shouldSkipMenuForUser(userId) {
  const key = String(userId || '').trim();
  if (!key) return false;
  pruneDedupeMap(recentMenus, MENU_DEDUPE_TTL_MS);
  return recentMenus.has(key);
}

function markMenuShownForUser(userId) {
  const key = String(userId || '').trim();
  if (!key) return;
  pruneDedupeMap(recentMenus, MENU_DEDUPE_TTL_MS);
  recentMenus.set(key, Date.now());
}

function buildDefaultSubscribeUrl(channelId = '') {
  const normalized = String(channelId || '').trim();
  if (!normalized) return '';
  return `https://max.ru/${normalized}`;
}

function normalizeNativeReactionSummary(value) {
  const result = [];
  const push = (emoji, count) => {
    const normalizedEmoji = String(emoji || '').trim();
    const total = Number(count || 0);
    if (!normalizedEmoji || !Number.isFinite(total) || total <= 0) return;
    const existing = result.find((item) => item.emoji === normalizedEmoji);
    if (existing) existing.count += total;
    else result.push({ emoji: normalizedEmoji, count: total });
  };
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      push(item.emoji || item.reaction || item.type || item.text || item.name, item.count || item.value || item.total || 1);
    });
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, raw]) => {
      if (typeof raw === 'number' || typeof raw === 'boolean') push(key, raw === true ? 1 : raw);
      else if (raw && typeof raw === 'object') push(raw.emoji || raw.reaction || key, raw.count || raw.value || raw.total || Object.values(raw).filter(Boolean).length || 0);
    });
  }
  return result.slice(0, 8);
}

function extractNativeReactionSummary(message) {
  const body = getMessageBody(message) || {};
  const candidates = [
    body.reactions,
    body.reaction_counts,
    body.reactionCounts,
    body.likes,
    body.like_counts,
    body.stats?.reactions,
    body.stats?.likes,
    message?.reactions,
    message?.reaction_counts,
    message?.reactionCounts,
    message?.likes,
    message?.stats?.reactions,
    message?.stats?.likes,
    body?.link?.message?.reactions,
    body?.link?.message?.reaction_counts,
    body?.forward?.message?.reactions,
    body?.forward?.message?.reaction_counts
  ];
  for (const candidate of candidates) {
    const normalized = normalizeNativeReactionSummary(candidate);
    if (normalized.length) return normalized;
  }
  return [];
}

function extractChannelTitle(message) {
  const body = getMessageBody(message);
  const candidates = [
    body?.link?.chat_title,
    body?.link?.chat?.title,
    body?.forward?.chat_title,
    body?.forward?.chat?.title,
    body?.link?.message?.chat_title,
    body?.link?.message?.chat?.title,
    body?.forward?.message?.chat_title,
    body?.forward?.message?.chat?.title,
    message?.link?.chat_title,
    message?.link?.chat?.title,
    message?.forward?.chat_title,
    message?.forward?.chat?.title,
    message?.recipient?.chat_title,
    message?.recipient?.title,
    message?.chat?.title
  ];
  for (const item of candidates) {
    const value = String(item || '').trim();
    if (value) return value;
  }
  return '';
}

function getChannelDisplayName(item = {}) {
  return String(
    item?.title ||
    item?.channelTitle ||
    item?.name ||
    item?.chatTitle ||
    item?.channelName ||
    ''
  ).trim();
}

function normalizeChannelTitleForDedupe(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function dedupeChannelsByIdAndTitle(items = []) {
  const result = [];
  const seenIds = new Set();
  const seenTitles = new Set();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const id = String(item.channelId || '').trim();
    const titleKey = normalizeChannelTitleForDedupe(getChannelDisplayName(item));
    if (id && seenIds.has(id)) continue;
    if (titleKey && seenTitles.has(titleKey)) continue;
    if (id) seenIds.add(id);
    if (titleKey) seenTitles.add(titleKey);
    result.push(item);
  }
  return result;
}

function getVisibleStoredChannelsForUser(userId = '') {
  const key = String(userId || '').trim();
  const all = dedupeChannelsByIdAndTitle(listChannels());
  const mine = key ? dedupeChannelsByIdAndTitle(all.filter((item) => String(item?.linkedByUserId || '').trim() === key)) : [];
  return mine.length ? mine : all;
}

async function enrichChannelTitle(config, item = {}) {
  const currentTitle = getChannelDisplayName(item);
  if (currentTitle) return { ...item, title: currentTitle };
  try {
    const chat = await getChat({ botToken: config?.botToken, chatId: item?.channelId });
    const fetchedTitle = String(chat?.title || chat?.name || '').trim();
    if (fetchedTitle) {
      registerChannel(item?.channelId, { title: fetchedTitle });
      return { ...item, title: fetchedTitle };
    }
  } catch {}
  return item;
}
async function getVisibleChannelsForUser(config, userId) {
  const unique = getVisibleStoredChannelsForUser(userId).slice(0, 20);

  // Быстрый путь по умолчанию: не делаем live-запросы к MAX API при каждом открытии меню.
  // Иначе раздел «Ваши каналы» ждёт getChat/getBotChatMember по каждому каналу и может
  // открываться 4–8 секунд. Live-проверки можно включить env LIVE_CHANNEL_CHECKS=1.
  if (!config?.liveChannelChecks) {
    return unique.map((item) => ({
      ...item,
      title: getChannelDisplayName(item) || String(item?.channelId || 'Канал'),
      botAccess: item?.botAccess !== false
    }));
  }

  const prepared = [];
  for (const item of unique) {
    let nextItem = { ...item };
    try {
      await getBotChatMember({ botToken: config.botToken, chatId: item.channelId });
      nextItem = { ...nextItem, botAccess: true };
    } catch {
      nextItem = { ...nextItem, botAccess: false };
    }
    try {
      nextItem = await enrichChannelTitle(config, nextItem);
    } catch {}
    prepared.push(nextItem);
  }
  return prepared;
}

function findStoredChannel(channelId) {
  const key = String(channelId || '').trim();
  if (!key) return null;
  return listChannels().find((item) => String(item?.channelId || '').trim() === key) || null;
}

function getReadableChannelName(channelId, fallback = 'Название канала пока недоступно') {
  const item = findStoredChannel(channelId);
  return getChannelDisplayName(item) || String(fallback || '').trim() || 'Название канала пока недоступно';
}

function getTargetChannelName(targetPost = null, fallback = 'Название канала пока недоступно') {
  const direct = String(targetPost?.channelTitle || targetPost?.title || '').trim();
  if (direct) return direct;
  return getReadableChannelName(targetPost?.channelId, fallback);
}

function getSingleVisibleChannel(userId = '') {
  const unique = getVisibleStoredChannelsForUser(userId).filter((item) => String(item?.channelId || '').trim());
  return unique.length === 1 ? unique[0] : null;
}

function countActiveReactionsForCommentKey(commentKey = '') {
  const map = getReactionsMap(commentKey);
  let count = 0;
  Object.values(map || {}).forEach((byEmoji) => {
    Object.values(byEmoji || {}).forEach((byUser) => {
      Object.values(byUser || {}).forEach((isOn) => {
        if (isOn) count += 1;
      });
    });
  });
  return count;
}

function formatSignedNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '—';
  if (n > 0) return `+${n}`;
  return String(n);
}

function formatAdminTime(ts = Date.now()) {
  const d = new Date(Number(ts || Date.now()));
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


function getAudienceSnapshotClosestTo(channelId = '', targetTs = 0) {
  const snapshots = listChannelMemberSnapshots(channelId);
  if (!snapshots.length) return null;
  let best = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  snapshots.forEach((item) => {
    const capturedAt = Number(item?.capturedAt || 0);
    if (!capturedAt) return;
    const delta = Math.abs(capturedAt - Number(targetTs || 0));
    if (delta < bestDelta) {
      best = item;
      bestDelta = delta;
    }
  });
  return best;
}

function buildAudienceDeltaLine(channelId = '', days = 1, currentSnapshot = null, nowTs = Date.now()) {
  const current = currentSnapshot || listChannelMemberSnapshots(channelId)[0] || null;
  if (!current?.capturedAt) return `За ${days} ${declineRussianDays(days)}: пока нет данных`;
  const previous = getAudienceSnapshotClosestTo(channelId, nowTs - (days * 24 * 60 * 60 * 1000));
  if (!previous?.capturedAt || String(previous.capturedAt) === String(current.capturedAt)) {
    return `За ${days} ${declineRussianDays(days)}: нужен снимок за прошлый период`;
  }
  const net = Number(current.memberCount || 0) - Number(previous.memberCount || 0);
  return `За ${days} ${declineRussianDays(days)}: ${formatSignedNumber(net)}`;
}

function declineRussianDays(days = 0) {
  const value = Math.abs(Number(days || 0));
  if (value === 1) return 'день';
  if (value >= 2 && value <= 4) return 'дня';
  return 'дней';
}

function formatAudienceTrendLines(analytics = null, channelId = '') {
  const audience = analytics?.audience || null;
  const current = audience?.current || listChannelMemberSnapshots(channelId)[0] || null;
  const channelInfo = analytics?.channelInfo || null;
  const memberCount = channelInfo?.memberCount ?? current?.memberCount ?? null;
  const lines = [];

  if (memberCount !== null && memberCount !== undefined && !Number.isNaN(Number(memberCount))) {
    lines.push(`Подписчиков сейчас: ${Number(memberCount)}`);
  } else {
    lines.push('Подписчиков сейчас: пока нет данных');
  }

  if (audience?.delta24h) {
    const delta = audience.delta24h;
    lines.push(`За 24 часа: ${formatSignedNumber(delta.net)}`);
    if (delta.hasExactSets) {
      lines.push(`Пришло за 24 часа: ${delta.joined}`);
      lines.push(`Ушло за 24 часа: ${delta.left}`);
    }
  } else if (current?.capturedAt) {
    lines.push('За 24 часа: нужен второй снимок');
  } else {
    lines.push('За 24 часа: нажмите «🔄 Обновить»');
  }

  lines.push(buildAudienceDeltaLine(channelId, 7, current));
  lines.push(buildAudienceDeltaLine(channelId, 14, current));
  lines.push(buildAudienceDeltaLine(channelId, 30, current));

  return lines;
}

function buildChannelStatsText({ targetPost = null, userId = '', analytics = null } = {}) {
  const fallbackChannel = !targetPost?.channelId ? getSingleVisibleChannel(userId) : null;
  const channelId = String(targetPost?.channelId || fallbackChannel?.channelId || '').trim();
  const channelTitle = getTargetChannelName(targetPost || fallbackChannel || null);
  if (!channelId) {
    return [
      'Статистика канала',
      '',
      'Канал пока не определён.',
      'Если у вас один авторизованный канал, он подставится автоматически.',
      'Если каналов несколько — сначала выберите или перешлите пост нужного канала.'
    ].join('\n');
  }

  const posts = getPostsList().filter((item) => String(item?.channelId || '').trim() === channelId);
  const commentKeys = posts.map((item) => String(item?.commentKey || '').trim()).filter(Boolean);
  const comments = commentKeys.flatMap((commentKey) => getComments(commentKey));
  const now = Date.now();
  const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
  const commentsWeek = comments.filter((item) => Number(item?.createdAt || 0) >= weekAgo);
  const reactions = commentKeys.reduce((sum, commentKey) => sum + countActiveReactionsForCommentKey(commentKey), 0);
  const gifts = listGiftCampaigns().filter((item) => String(item?.channelId || '').trim() === channelId);
  const clicks = listGrowthClicks({ channelId, limit: 5000 });
  const pollVotes = listGrowthPollVotes({ channelId });
  const uniqueCommenters = new Set(comments.map((item) => String(item?.userId || item?.userName || '').trim()).filter(Boolean));
  const uniqueClickers = new Set(clicks.map((item) => String(item?.userId || '').trim()).filter(Boolean));
  const postsWithComments = posts.filter((item) => getComments(item.commentKey || '').length > 0).length;
  const topPost = posts
    .map((item) => ({ item, comments: getComments(item.commentKey || '').length, reactions: countActiveReactionsForCommentKey(item.commentKey || '') }))
    .sort((a, b) => (b.comments + b.reactions) - (a.comments + a.reactions))[0] || null;

  const lines = [
    'Статистика канала',
    analytics?.generatedAt ? `Обновлено: ${formatAdminTime(analytics.generatedAt)}` : '',
    '',
    `Канал: ${channelTitle}`,
    '',
    ...formatAudienceTrendLines(analytics, channelId),
    '',
    'Активность:',
    `Постов в памяти бота: ${posts.length}`,
    `Постов с обсуждением: ${postsWithComments}`,
    `Комментариев всего: ${comments.length}`,
    `Комментариев за 7 дней: ${commentsWeek.length}`,
    `Участников обсуждений: ${uniqueCommenters.size}`,
    `Реакций: ${reactions}`,
    `Подарков и лид-магнитов: ${gifts.length}`,
    `Кликов по кнопкам: ${clicks.length}`,
    `Уникальных кликеров: ${uniqueClickers.size}`,
    `Голосов в опросах: ${pollVotes.length}`
  ];

  if (topPost?.item) {
    lines.push('', `Самый активный пост: ${getGiftPostPreview(topPost.item)} · ${topPost.comments} комм. · ${topPost.reactions} реакц.`);
  }

  return lines.filter((line) => line !== '').join('\n');
}

function resolveStatsPost(targetPost = null, userId = '') {
  if (targetPost?.commentKey) return getPost(targetPost.commentKey) || targetPost;
  const single = getSingleVisibleChannel(userId);
  if (!single?.channelId) return null;
  return getPostsList().find((item) => String(item?.channelId || '').trim() === String(single.channelId).trim()) || null;
}

function buildCurrentPostStatsText({ targetPost = null, userId = '' } = {}) {
  const post = resolveStatsPost(targetPost, userId);
  if (!post?.commentKey) {
    return [
      'Статистика поста',
      '',
      'Пост пока не выбран.',
      'Перешлите нужный пост боту или выберите его из последних постов.'
    ].join('\n');
  }
  const comments = getComments(post.commentKey || '');
  const reactions = countActiveReactionsForCommentKey(post.commentKey || '');
  const replies = comments.filter((item) => String(item?.replyToId || '').trim()).length;
  const uniqueCommenters = new Set(comments.map((item) => String(item?.userId || item?.userName || '').trim()).filter(Boolean));
  const gifts = listGiftCampaigns().filter((item) => String(item?.channelId || '').trim() === String(post.channelId || '').trim() && Array.isArray(item?.postIds) && item.postIds.includes(String(post.postId || '').trim()));
  const clicks = listGrowthClicks({ channelId: post.channelId, limit: 5000 }).filter((item) => String(item?.postId || '').trim() === String(post.postId || '').trim() || String(item?.commentKey || '').trim() === String(post.commentKey || '').trim());
  return [
    'Статистика поста',
    '',
    `Канал: ${getTargetChannelName(post)}`,
    `Пост: ${getGiftPostPreview(post)}`,
    `Комментариев: ${comments.length}`,
    `Ответов в тредах: ${replies}`,
    `Участников: ${uniqueCommenters.size}`,
    `Реакций на комментарии: ${reactions}`,
    `Подарков, привязанных к посту: ${gifts.length}`,
    `Кликов по кнопкам этого поста: ${clicks.length}`
  ].join('\n');
}


async function buildChannelStatsTextLive({ targetPost = null, userId = '', config = null, mode = 'channel' } = {}) {
  const fallbackChannel = !targetPost?.channelId ? getSingleVisibleChannel(userId) : null;
  const channelId = String(targetPost?.channelId || fallbackChannel?.channelId || '').trim();
  if (!channelId) return buildChannelStatsText({ targetPost, userId });
  try {
    // Для меню статистики не блокируем callback полным списком участников.
    // Базовое число подписчиков берётся из текущих данных канала.
    await captureChannelAudienceSnapshot({ channelId, config, includeMembers: false });
  } catch (error) {
    console.error('STATS SNAPSHOT FAILED:', error?.message || error, error?.data || '');
  }
  let analytics = null;
  try {
    analytics = await buildAnalyticsSummary(channelId, config || {});
    analytics.generatedAt = Date.now();
    analytics.mode = mode;
  } catch (error) {
    console.error('STATS BUILD FAILED:', error?.message || error, error?.data || '');
  }
  return buildChannelStatsText({ targetPost, userId, analytics });
}

function getActiveTargetPost(userId = '') {
  return getCommentTargetPost(userId) || getGiftTargetPost(userId) || null;
}

function getGiftPostPreview(targetPost = null, fallback = 'Пост без текста') {
  const preview = String(targetPost?.originalText || '').replace(/\s+/g, ' ').trim();
  return preview ? truncateText(preview, 72) : String(fallback || 'Пост без текста');
}

function buildPostEditPrompt(targetPost = null) {
  const storedPost = targetPost?.commentKey ? getPost(targetPost.commentKey) : null;
  const currentText = String(storedPost?.originalText || targetPost?.originalText || '').trim();
  const attachmentCount = Array.isArray(storedPost?.sourceAttachments) ? storedPost.sourceAttachments.length : 0;
  const previewLimit = 2800;
  const visibleText = currentText ? currentText.slice(0, previewLimit) : '';
  const wasTrimmed = currentText.length > previewLimit;
  const lines = [
    'Пришлите новый текст поста.',
    'Поле ввода MAX нельзя предзаполнить из бота, поэтому ниже показан текущий текст для копирования и правок.',
    'Медиа и текущее форматирование поста сохранятся автоматически, если вы просто отправите новый текст.'
  ];
  if (attachmentCount > 0) lines.push(`Медиа в посте: ${attachmentCount}. Они будут сохранены.`);
  if (visibleText) {
    lines.push('', 'Текущий текст поста:', visibleText);
    if (wasTrimmed) lines.push('', 'Текст выше укорочен для удобства. Если пост длинный, можно редактировать его частями.');
  }
  return lines.join('\n');
}

function buildGiftFlowGuidance(flow = null, config = null, options = {}) {
  const draft = flow?.draft || {};
  if (flow?.awaitingConfirmation) {
    return buildGiftCampaignPreview(normalizeGiftDraft(flow), options);
  }
  return buildGiftWizardPrompt(flow?.stepIndex || 0, draft, config);
}

function logInfo(config, label, payload) {
  if (config?.debugLogs) {
    console.log(`${label}:`, safeJson(payload));
  } else {
    console.log(`${label}:`, safeJson(payload));
  }
}

function logVerbose(config, label, payload) {
  if (config?.debugLogs) {
    console.log(`${label}:`, safeJson(payload));
  }
}

function getMessage(update) {
  return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || null;
}

function getCallback(update) {
  return update?.callback || update?.data?.callback || update?.message?.callback || null;
}

function getMessageBody(message) {
  return message?.body || {};
}

function getSenderUserId(message) {
  return String(
    message?.__senderUserId ||
      message?.sender?.user_id ||
      message?.sender?.id ||
      message?.user_id ||
      message?.from?.id ||
      ""
  ).trim();
}

function getSenderFirstName(message) {
  return String(
    message?.__senderFirstName ||
      message?.sender?.first_name ||
      message?.sender?.name ||
      message?.first_name ||
      message?.from?.first_name ||
      "Пользователь"
  ).trim();
}

function getCallbackUserId(update, callback) {
  return String(
    callback?.user?.user_id ||
      callback?.user?.id ||
      callback?.sender?.user_id ||
      callback?.sender?.id ||
      update?.user?.user_id ||
      update?.user?.id ||
      update?.sender?.user_id ||
      update?.sender?.id ||
      ""
  ).trim();
}

function getCallbackUserName(update, callback) {
  return String(
    callback?.user?.first_name ||
      callback?.user?.name ||
      callback?.sender?.first_name ||
      callback?.sender?.name ||
      update?.user?.first_name ||
      update?.user?.name ||
      update?.sender?.first_name ||
      update?.sender?.name ||
      "Пользователь"
  ).trim();
}

function getRecipientChatId(message) {
  return String(
    message?.recipient?.chat_id ||
      message?.recipient?.id ||
      message?.chat_id ||
      message?.chat?.id ||
      ""
  ).trim();
}

function getRecipientChatType(message) {
  return String(
    message?.recipient?.chat_type ||
      message?.recipient?.type ||
      message?.chat_type ||
      message?.chat?.type ||
      ""
  )
    .trim()
    .toLowerCase();
}

function getMessageText(message) {
  return String(getMessageBody(message)?.text || message?.text || message?.message?.text || "");
}

function getMessageId(message) {
  return String(
    getMessageBody(message)?.mid ||
      getMessageBody(message)?.message_id ||
      message?.message_id ||
      message?.id ||
      ""
  ).trim();
}

function getMessageIdCandidates(message) {
  const body = getMessageBody(message);
  const nested = body?.message || message?.message || {};
  const candidates = [
    body?.mid,
    body?.message_id,
    body?.messageId,
    body?.id,
    message?.mid,
    message?.message_id,
    message?.messageId,
    message?.id,
    nested?.mid,
    nested?.message_id,
    nested?.messageId,
    nested?.id
  ];
  const result = [];
  const seen = new Set();
  candidates.forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function getPostId(message) {
  return String(
    getMessageBody(message)?.seq ||
      message?.seq ||
      message?.post_id ||
      getMessageBody(message)?.post_id ||
      getMessageBody(message)?.link?.message?.seq ||
      message?.link?.message?.seq ||
      ""
  ).trim();
}

function getOriginalForwardedMessageId(message) {
  return String(
    getMessageBody(message)?.link?.message?.mid ||
      message?.link?.message?.mid ||
      getMessageBody(message)?.forward?.message?.mid ||
      message?.forward?.message?.mid ||
      ""
  ).trim();
}

function collectAttachmentLikeItems(source = null) {
  const items = [];
  const pushItem = (value, forcedType = '') => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => pushItem(entry, forcedType));
      return;
    }
    if (typeof value !== 'object') return;
    const normalizedType = String(forcedType || value.type || value.kind || value.attachment_type || '').trim().toLowerCase();
    const payload = value?.payload && typeof value.payload === 'object' ? value.payload : value;
    const looksLikeAttachment = Boolean(
      normalizedType ||
      value?.token ||
      payload?.token ||
      payload?.url ||
      payload?.file_id ||
      payload?.photo_id ||
      payload?.image_id ||
      payload?.video_id ||
      payload?.audio_id ||
      payload?.document_id ||
      payload?.file_name ||
      payload?.filename ||
      payload?.mime_type ||
      payload?.content_type
    );
    if (!looksLikeAttachment) return;
    if (value?.type || value?.kind || value?.attachment_type) {
      items.push(value);
      return;
    }
    items.push({ type: normalizedType || 'file', payload });
  };

  if (!source || typeof source !== 'object') return items;
  if (Array.isArray(source.attachments)) {
    source.attachments.forEach((entry) => pushItem(entry));
  }
  const mediaKeys = ['photo', 'image', 'picture', 'document', 'file', 'video', 'audio', 'voice'];
  for (const key of mediaKeys) {
    pushItem(source[key], key);
  }
  return items;
}

function getMessageAttachments(message) {
  const body = getMessageBody(message);
  const pools = [
    ...collectAttachmentLikeItems(body),
    ...collectAttachmentLikeItems(message),
    ...collectAttachmentLikeItems(message?.message)
  ];
  const serialized = new Set();
  return pools.filter((item) => {
    const marker = JSON.stringify(item);
    if (serialized.has(marker)) return false;
    serialized.add(marker);
    return true;
  });
}

function getForwardedMessageAttachments(message) {
  const body = getMessageBody(message);
  const nested = body?.link?.message || body?.forward?.message || {};
  return Array.isArray(nested?.attachments) ? nested.attachments : [];
}

function cloneObject(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null;
}

function getMessageLink(message) {
  return cloneObject(getMessageBody(message)?.link || message?.link || null);
}

function getForwardedMessageLink(message) {
  const body = getMessageBody(message);
  const nested = body?.link?.message || body?.forward?.message || {};
  return cloneObject(nested?.link || null);
}

function getMessageFormat(message) {
  const body = getMessageBody(message);
  return body?.format !== undefined ? body.format : message?.format;
}

function getForwardedMessageFormat(message) {
  const body = getMessageBody(message);
  const nested = body?.link?.message || body?.forward?.message || {};
  return nested?.format;
}

function isForwardedChannelPost(message) {
  const forwardedChatId = String(
    getMessageBody(message)?.link?.chat_id ||
      message?.link?.chat_id ||
      getMessageBody(message)?.forward?.chat_id ||
      message?.forward?.chat_id ||
      ""
  ).trim();

  const postId = getPostId(message);
  return Boolean(postId && forwardedChatId);
}

function extractForwardedChannelId(message) {
  return String(
    getMessageBody(message)?.link?.chat_id ||
      message?.link?.chat_id ||
      getMessageBody(message)?.forward?.chat_id ||
      message?.forward?.chat_id ||
      ""
  ).trim();
}

function isDirectChannelPost(message) {
  return getRecipientChatType(message) === "channel" && Boolean(getRecipientChatId(message) && getPostId(message));
}

function hasCommentsKeyboard(message) {
  const attachments = getMessageAttachments(message);
  return attachments.some((item) => item?.type === "inline_keyboard" && JSON.stringify(item).includes("Комментар"));
}

function parseCallbackPayload(callback) {
  const raw = String(
    callback?.payload || callback?.data || callback?.value || callback?.callback_data || ""
  ).trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function getUserSetupState(userId) {
  return getSetupState(userId) || {};
}

function getLatestBotMessageId(userId) {
  return String(getUserSetupState(userId)?.latestBotMessageId || '').trim();
}

function setLatestBotMessageId(userId, messageId) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedUserId || !normalizedMessageId) return null;
  return setSetupState(normalizedUserId, { latestBotMessageId: normalizedMessageId });
}

function getTrackedAdminMessageIds(userId) {
  const state = getUserSetupState(userId) || {};
  const raw = Array.isArray(state.adminMessageIds) ? state.adminMessageIds : [];
  const ids = [];
  const seen = new Set();
  const push = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    ids.push(normalized);
  };
  raw.forEach(push);
  push(state.latestBotMessageId);
  push(state?.giftFlow?.anchorMessageId);
  push(state?.commentAdminFlow?.anchorMessageId);
  return ids;
}

function setTrackedAdminMessageIds(userId, ids = []) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  const next = [];
  const seen = new Set();
  (Array.isArray(ids) ? ids : []).forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return setSetupState(normalizedUserId, { adminMessageIds: next.slice(-12) });
}

function getTrackedAdminUserMessageIds(userId) {
  const state = getUserSetupState(userId) || {};
  return Array.isArray(state?.adminUserMessageIds) ? state.adminUserMessageIds : [];
}

function rememberAdminUserMessageIds(userId, messageIds = []) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [];
  const previous = getTrackedAdminUserMessageIds(normalizedUserId);
  const seen = new Set();
  const values = [...previous, ...(Array.isArray(messageIds) ? messageIds : [messageIds])]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(-80);
  setSetupState(normalizedUserId, { adminUserMessageIds: values });
  return values;
}

function clearTrackedAdminUserMessageIds(userId) {
  return removeSetupStateKeys(userId, ['adminUserMessageIds']);
}


function getPendingDeleteMessageIds(userId) {
  const state = getUserSetupState(userId) || {};
  const raw = Array.isArray(state.pendingDeleteMessageIds) ? state.pendingDeleteMessageIds : [];
  return raw.map((value) => String(value || '').trim()).filter(Boolean);
}

function queuePendingDeleteMessageIds(userId, ids = []) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  const seen = new Set();
  const next = [];
  [...getPendingDeleteMessageIds(normalizedUserId), ...(Array.isArray(ids) ? ids : [])].forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return setSetupState(normalizedUserId, { pendingDeleteMessageIds: next.slice(-50) });
}

function clearPendingDeleteMessageIds(userId) {
  const state = getUserSetupState(userId);
  if (!state || Object.keys(state).length === 0) return null;
  const nextState = { ...state };
  delete nextState.pendingDeleteMessageIds;
  delete nextState.updatedAt;
  clearSetupState(userId);
  if (Object.keys(nextState).length) setSetupState(userId, nextState);
  return true;
}

async function flushPendingDeleteMessageIds(config, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [];
  const pending = getPendingDeleteMessageIds(normalizedUserId);
  if (!pending.length) return [];
  const failedIds = [];
  for (const messageId of pending) {
    try {
      await deleteMessage({ botToken: config.botToken, messageId, timeoutMs: config.menuDeleteTimeoutMs || 1800 });
    } catch {
      failedIds.push(messageId);
    }
  }
  if (failedIds.length) {
    setSetupState(normalizedUserId, { pendingDeleteMessageIds: failedIds.slice(-50) });
  } else {
    clearPendingDeleteMessageIds(normalizedUserId);
  }
  return failedIds;
}

async function finalizeActiveAdminMessage({ config, userId, activeMessageId = '', deleteIds = [] }) {
  const normalizedUserId = String(userId || '').trim();
  const keepId = String(activeMessageId || '').trim();
  if (!normalizedUserId) return null;

  const seen = new Set();
  const candidates = [];
  const push = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized === keepId || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  getTrackedAdminMessageIds(normalizedUserId).forEach(push);
  (Array.isArray(deleteIds) ? deleteIds : []).forEach(push);

  if (candidates.length) {
    setTimeout(async () => {
      const failedIds = await deleteStoredMessageIds(config, candidates);
      if (failedIds.length) queuePendingDeleteMessageIds(normalizedUserId, failedIds);
    }, 0);
  }

  if (keepId) {
    setLatestBotMessageId(normalizedUserId, keepId);
    setTrackedAdminMessageIds(normalizedUserId, [keepId]);
  } else {
    setTrackedAdminMessageIds(normalizedUserId, []);
  }
  return keepId || null;
}

function isPermanentDeleteDenied(error) {
  const code = String(error?.data?.data?.code || error?.data?.code || '').toLowerCase();
  const status = String(error?.data?.status || error?.status || '').trim();
  const message = String(error?.data?.data?.message || error?.data?.message || error?.message || '').toLowerCase();
  return status === '403' || code === 'access_denied' || message.includes('insufficient permissions') || message.includes('access_denied');
}

async function deleteIncomingUserMessageIfPossible(config, message) {
  if (!message || message.__fromCallback) return false;
  const userId = getSenderUserId(message);
  const ids = getMessageIdCandidates(message);
  if (!ids.length) return false;
  let deletedAny = false;
  const failedIds = [];
  for (const messageId of ids) {
    try {
      const result = await deleteMessage({ botToken: config.botToken, messageId, timeoutMs: config.menuDeleteTimeoutMs || 1800 });
      logVerbose(config, 'DELETE INCOMING OK', { userId, messageId, result });
      deletedAny = true;
    } catch (error) {
      logVerbose(config, 'DELETE INCOMING FAILED', { userId, messageId, error: error?.message || String(error), data: error?.data || null });
      if (!isPermanentDeleteDenied(error)) failedIds.push(messageId);
    }
  }
  if (failedIds.length && userId) queuePendingDeleteMessageIds(userId, failedIds);
  return deletedAny;
}

function rememberFlowCleanupMessageIds(flow = null, messageIds = []) {
  const values = Array.isArray(messageIds) ? messageIds : [messageIds];
  const normalizedValues = values.map((value) => String(value || '').trim()).filter(Boolean);
  if (!flow || !normalizedValues.length) return flow;
  const raw = Array.isArray(flow.cleanupMessageIds) ? flow.cleanupMessageIds : [];
  const ids = [];
  const seen = new Set();
  [...raw, ...normalizedValues].forEach((value) => {
    const current = String(value || '').trim();
    if (!current || seen.has(current)) return;
    seen.add(current);
    ids.push(current);
  });
  return { ...flow, cleanupMessageIds: ids.slice(-20) };
}

function rememberFlowCleanupMessageId(flow = null, messageId = '') {
  return rememberFlowCleanupMessageIds(flow, [messageId]);
}

async function deleteStoredMessageIds(config, ids = []) {
  const seen = new Set();
  const failedIds = [];
  for (const value of (Array.isArray(ids) ? ids : [])) {
    const messageId = String(value || '').trim();
    if (!messageId || seen.has(messageId)) continue;
    seen.add(messageId);
    try {
      const result = await deleteMessage({ botToken: config.botToken, messageId, timeoutMs: config.menuDeleteTimeoutMs || 1800 });
      logVerbose(config, 'DELETE STORED OK', { messageId, result });
    } catch (error) {
      logVerbose(config, 'DELETE STORED FAILED', { messageId, error: error?.message || String(error), data: error?.data || null });
      if (!isPermanentDeleteDenied(error)) failedIds.push(messageId);
    }
  }
  return failedIds;
}

async function cleanupGiftFlowArtifacts(config, flow = null, userId = '') {
  const ids = [
    ...(Array.isArray(flow?.cleanupMessageIds) ? flow.cleanupMessageIds : []),
    flow?.anchorMessageId,
    getLatestBotMessageId(userId),
    ...getTrackedAdminMessageIds(userId)
  ];
  const failedIds = await deleteStoredMessageIds(config, ids);
  if (failedIds.length && userId) queuePendingDeleteMessageIds(userId, failedIds);
  return failedIds;
}

async function cleanupCommentFlowArtifacts(config, flow = null, userId = '') {
  const ids = [
    ...(Array.isArray(flow?.cleanupMessageIds) ? flow.cleanupMessageIds : []),
    flow?.anchorMessageId,
    getLatestBotMessageId(userId),
    ...getTrackedAdminMessageIds(userId)
  ];
  const failedIds = await deleteStoredMessageIds(config, ids);
  if (failedIds.length && userId) queuePendingDeleteMessageIds(userId, failedIds);
  return failedIds;
}

async function cleanupAdminWorkspaceOnMainMenu(config, userId = '', { includeUserMessages = false } = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [];
  const state = getUserSetupState(normalizedUserId) || {};
  const ids = [
    ...(Array.isArray(state?.giftFlow?.cleanupMessageIds) ? state.giftFlow.cleanupMessageIds : []),
    state?.giftFlow?.anchorMessageId,
    ...(Array.isArray(state?.commentAdminFlow?.cleanupMessageIds) ? state.commentAdminFlow.cleanupMessageIds : []),
    state?.commentAdminFlow?.anchorMessageId,
    ...(Array.isArray(state?.adminMessageIds) ? state.adminMessageIds : []),
    state?.latestBotMessageId,
    ...(Array.isArray(state?.pendingDeleteMessageIds) ? state.pendingDeleteMessageIds : []),
    ...(includeUserMessages && Array.isArray(state?.adminUserMessageIds) ? state.adminUserMessageIds : [])
  ];
  const failedIds = await deleteStoredMessageIds(config, ids);
  clearAllAdminFlows(normalizedUserId, { keepTargets: true });
  setTrackedAdminMessageIds(normalizedUserId, failedIds);
  if (failedIds.length) setSetupState(normalizedUserId, { pendingDeleteMessageIds: failedIds.slice(-50) });
  else clearPendingDeleteMessageIds(normalizedUserId);
  if (includeUserMessages) clearTrackedAdminUserMessageIds(normalizedUserId);
  return failedIds;
}

function getAdminUiState(userId) {
  return getUserSetupState(userId)?.adminUi || {};
}

function setAdminUiState(userId, state = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  const previous = getAdminUiState(normalizedUserId);
  return setSetupState(normalizedUserId, { adminUi: { ...previous, ...state } });
}

function rememberAdminScreen(userId, { section = '', backAction = 'admin_section_main', rootAction = 'admin_section_main', selectMode = '' } = {}) {
  return setAdminUiState(userId, {
    section: String(section || '').trim(),
    backAction: String(backAction || 'admin_section_main').trim(),
    rootAction: String(rootAction || 'admin_section_main').trim(),
    selectMode: String(selectMode || '').trim()
  });
}

function getAdminSectionActionFromSource(source = '') {
  const normalized = String(source || '').trim().toLowerCase();
  if (normalized === 'posts') return 'admin_section_posts';
  if (normalized === 'buttons') return 'admin_section_buttons';
  if (normalized === 'stats') return 'admin_section_stats';
  if (normalized === 'gifts') return 'admin_section_gifts';
  return 'admin_section_comments';
}

function getAdminSelectMode(userId) {
  return String(getAdminUiState(userId)?.selectMode || '').trim().toLowerCase();
}

function findFirstMessageIdDeep(value, seen = new Set()) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^mid./i.test(trimmed) ? trimmed : '';
  }
  if (typeof value !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);

  const directKeys = ['mid', 'message_id', 'messageId', 'id'];
  for (const key of directKeys) {
    const candidate = String(value?.[key] || '').trim();
    if (candidate && (/^mid./i.test(candidate) || key !== 'id')) return candidate;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstMessageIdDeep(item, seen);
      if (found) return found;
    }
    return '';
  }

  for (const key of Object.keys(value)) {
    const found = findFirstMessageIdDeep(value[key], seen);
    if (found) return found;
  }
  return '';
}

function extractSentMessageId(result) {
  return String(
    result?.message_id ||
    result?.messageId ||
    result?.mid ||
    result?.body?.mid ||
    result?.body?.message_id ||
    result?.message?.body?.mid ||
    result?.message?.message_id ||
    result?.message?.messageId ||
    result?.message?.mid ||
    result?.data?.message?.body?.mid ||
    result?.data?.message_id ||
    result?.data?.mid ||
    findFirstMessageIdDeep(result) ||
    ''
  ).trim();
}

function isGiftAdminAuthorized(config, userId) {
  return true;
}

function removeSetupStateKeys(userId, keys = []) {
  const state = getUserSetupState(userId);
  if (!state || Object.keys(state).length === 0) {
    clearSetupState(userId);
    return null;
  }
  const nextState = { ...state };
  const keyList = Array.isArray(keys) ? keys : [keys];
  keyList.forEach((key) => {
    if (key) delete nextState[key];
  });
  delete nextState.updatedAt;
  const hasMeaningfulState = Object.entries(nextState).some(([key, value]) => key !== 'updatedAt' && value !== undefined && value !== null);
  clearSetupState(userId);
  if (hasMeaningfulState) return setSetupState(userId, nextState);
  return null;
}

function getActiveAdminFlowKind(userId) {
  return String(getUserSetupState(userId)?.activeAdminFlowKind || '').trim();
}

function setActiveAdminFlowKind(userId, kind = '') {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  const normalizedKind = String(kind || '').trim();
  if (!normalizedKind) return removeSetupStateKeys(normalizedUserId, ['activeAdminFlowKind']);
  return setSetupState(normalizedUserId, { activeAdminFlowKind: normalizedKind });
}

function clearActiveAdminFlowKind(userId) {
  return removeSetupStateKeys(userId, ['activeAdminFlowKind']);
}

function clearAllAdminFlows(userId, options = {}) {
  const keepTargets = options?.keepTargets !== false;
  const keys = ['giftFlow', 'commentAdminFlow', 'activeAdminFlowKind'];
  if (!keepTargets) keys.push('giftTargetPost', 'commentTargetPost');
  return removeSetupStateKeys(userId, keys);
}

function clearGiftFlow(userId) {
  const hadGiftKind = getActiveAdminFlowKind(userId) === 'gift';
  const result = removeSetupStateKeys(userId, ['giftFlow']);
  if (hadGiftKind) clearActiveAdminFlowKind(userId);
  return result;
}

function setGiftFlow(userId, giftFlow) {
  if (!giftFlow) return clearGiftFlow(userId);
  removeSetupStateKeys(userId, ['commentAdminFlow']);
  setActiveAdminFlowKind(userId, 'gift');
  return setSetupState(userId, { giftFlow });
}

function getGiftFlow(userId) {
  return getUserSetupState(userId)?.giftFlow || null;
}

function getGiftFlowAnchorMessageId(flow = null, userId = '') {
  const explicit = String(flow?.anchorMessageId || '').trim();
  if (explicit) return explicit;
  return String(getLatestBotMessageId(userId) || '').trim();
}

async function upsertGiftFlowMessage({ config, message, flow = null, text, attachments, editCurrent = false }) {
  const userId = getSenderUserId(message);
  const anchorMessageId = getGiftFlowAnchorMessageId(flow, userId);
  const result = await upsertBotMessage({
    config,
    message,
    text,
    attachments,
    editCurrent,
    preferredMessageIds: anchorMessageId ? [anchorMessageId] : []
  });
  const sentMessageId = String(extractSentMessageId(result) || '').trim();
  const resolvedMessageId = String(sentMessageId || getLatestBotMessageId(userId) || anchorMessageId || getMessageId(message) || '').trim();
  if (flow && resolvedMessageId) setGiftFlow(userId, { ...flow, anchorMessageId: resolvedMessageId });
  return result;
}

function getGiftTargetPost(userId) {
  return getUserSetupState(userId)?.giftTargetPost || null;
}

function setGiftTargetPost(userId, giftTargetPost) {
  return setSetupState(userId, { giftTargetPost });
}

function clearGiftTargetPost(userId) {
  return removeSetupStateKeys(userId, ['giftTargetPost']);
}

function getCommentAdminFlow(userId) {
  return getUserSetupState(userId)?.commentAdminFlow || null;
}

function setCommentAdminFlow(userId, commentAdminFlow) {
  if (!commentAdminFlow) return clearCommentAdminFlow(userId);
  removeSetupStateKeys(userId, ['giftFlow']);
  setActiveAdminFlowKind(userId, 'comment');
  return setSetupState(userId, { commentAdminFlow });
}

function clearCommentAdminFlow(userId) {
  const hadCommentKind = getActiveAdminFlowKind(userId) === 'comment';
  const result = removeSetupStateKeys(userId, ['commentAdminFlow']);
  if (hadCommentKind) clearActiveAdminFlowKind(userId);
  return result;
}

function getCommentTargetPost(userId) {
  return getUserSetupState(userId)?.commentTargetPost || null;
}

function setCommentTargetPost(userId, commentTargetPost) {
  return setSetupState(userId, { commentTargetPost });
}

function clearCommentTargetPost(userId) {
  return removeSetupStateKeys(userId, ['commentTargetPost']);
}

function buildCommentTargetPostRecord({ channelId, channelTitle, postId, messageId, commentKey, originalText, linkedAt = Date.now() } = {}) {
  return {
    channelId: String(channelId || '').trim(),
    channelTitle: String(channelTitle || '').trim(),
    postId: String(postId || '').trim(),
    messageId: String(messageId || '').trim(),
    commentKey: String(commentKey || '').trim(),
    originalText: String(originalText || '').trim(),
    linkedAt: Number(linkedAt || Date.now())
  };
}

function describeCommentTargetPost(targetPost = null) {
  if (!targetPost?.channelId || !targetPost?.postId) return 'Пост не выбран.';
  return `Пост: ${getGiftPostPreview(targetPost)}`;
}

function buildDefaultCommentButtonText() {
  return '💬 Комментарии';
}

function buildGiftTargetPostRecord({ channelId, channelTitle, postId, messageId, commentKey, originalText, linkedAt = Date.now() } = {}) {
  return {
    channelId: String(channelId || '').trim(),
    channelTitle: String(channelTitle || '').trim(),
    postId: String(postId || '').trim(),
    messageId: String(messageId || '').trim(),
    commentKey: String(commentKey || '').trim(),
    originalText: String(originalText || '').trim(),
    linkedAt: Number(linkedAt || Date.now())
  };
}

function describeGiftTargetPost(targetPost = null) {
  if (!targetPost?.channelId || !targetPost?.postId) return 'пост не выбран';
  const preview = String(targetPost.originalText || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return preview ? `Пост: ${preview}${preview.length >= 80 ? '…' : ''}` : 'Пост выбран';
}

function applyGiftTargetToDraft(flow, targetPost) {
  if (!flow || !targetPost?.channelId || !targetPost?.postId) return flow;
  const currentDraft = flow.draft || {};
  const subscribeUrl = String(currentDraft.subscribeUrl || '').trim() || buildDefaultSubscribeUrl(targetPost.channelId);
  return {
    ...flow,
    draft: {
      ...currentDraft,
      channelId: String(targetPost.channelId || '').trim(),
      requiredChatId: String(targetPost.channelId || '').trim(),
      postIds: [String(targetPost.postId || '').trim()],
      commentKey: String(targetPost.commentKey || '').trim(),
      subscribeUrl,
      subscribeUrlAutoFilled: Boolean(subscribeUrl)
    }
  };
}

function isGiftStepFilled(stepKey, draft = {}) {
  if (stepKey === 'giftAsset') {
    return Boolean(draft?.giftUrl || draft?.giftAttachment);
  }
  const value = draft?.[stepKey];
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(String(value || '').trim());
}

function getResolvedGiftStepIndex(stepIndex, draft = {}) {
  let index = Number(stepIndex || 0);
  while (index < GIFT_WIZARD_STEPS.length) {
    const step = GIFT_WIZARD_STEPS[index];
    if (!step) break;
    if (!isGiftStepFilled(step.key, draft)) break;
    index += 1;
  }
  return index;
}

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  const rounded = current >= 10 ? Math.round(current) : Math.round(current * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

function getGiftUploadLimits(config) {
  const stored = getGiftSettings()?.uploadLimits || {};
  const defaults = config?.giftUploadDefaults || {};
  const allowedTypes = Array.isArray(stored.allowedTypes) && stored.allowedTypes.length
    ? stored.allowedTypes
    : Array.isArray(defaults.allowedTypes) && defaults.allowedTypes.length
      ? defaults.allowedTypes
      : ["file", "image", "video", "audio"];
  const allowedExtensions = Array.isArray(stored.allowedExtensions)
    ? stored.allowedExtensions
    : Array.isArray(defaults.allowedExtensions)
      ? defaults.allowedExtensions
      : [];

  return {
    enabled: stored.enabled !== undefined ? stored.enabled !== false : defaults.enabled !== false,
    maxFiles: Number(stored.maxFiles || defaults.maxFiles || 1),
    maxBytes: Number(stored.maxBytes || defaults.maxBytes || (50 * 1024 * 1024)),
    allowedTypes: [...new Set(allowedTypes.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))],
    allowedExtensions: [...new Set(allowedExtensions.map((item) => String(item || "").trim().toLowerCase().replace(/^\./, "")).filter(Boolean))]
  };
}

function buildGiftLimitsSummary(config) {
  const limits = getGiftUploadLimits(config);
  return [
    `• Загрузка файлов: ${limits.enabled ? "включена" : "выключена"}`,
    `• Макс. файлов за раз: ${limits.maxFiles}`,
    `• Макс. размер файла: ${formatBytes(limits.maxBytes)}`,
    `• Разрешённые типы: ${limits.allowedTypes.length ? limits.allowedTypes.join(", ") : "любые"}`,
    `• Разрешённые расширения: ${limits.allowedExtensions.length ? limits.allowedExtensions.join(", ") : "любые"}`
  ].join("\n");
}

function getAttachmentFileName(attachment = {}) {
  const payload = attachment?.payload && typeof attachment.payload === "object" ? attachment.payload : {};
  return String(
    attachment.fileName ||
      attachment.filename ||
      attachment.name ||
      payload.file_name ||
      payload.filename ||
      payload.name ||
      payload.title ||
      ""
  ).trim();
}

function getAttachmentMimeType(attachment = {}) {
  const payload = attachment?.payload && typeof attachment.payload === "object" ? attachment.payload : {};
  return String(
    attachment.mimeType ||
      attachment.mime ||
      attachment.content_type ||
      payload.mime_type ||
      payload.mime ||
      payload.content_type ||
      ""
  ).trim();
}

function getAttachmentSize(attachment = {}) {
  const payload = attachment?.payload && typeof attachment.payload === "object" ? attachment.payload : {};
  return Number(
    attachment.size ||
      attachment.file_size ||
      payload.size ||
      payload.file_size ||
      0
  ) || 0;
}

function getAttachmentToken(attachment = {}) {
  const payload = attachment?.payload && typeof attachment.payload === "object" ? attachment.payload : {};
  return String(
    attachment.token ||
      payload.token ||
      payload.file_token ||
      payload.video_token ||
      payload.audio_token ||
      payload.photo_token ||
      payload.image_token ||
      payload.document_token ||
      payload.media_token ||
      payload.file_id ||
      payload.photo_id ||
      payload.image_id ||
      ""
  ).trim();
}

function getAttachmentExtension(attachment = {}) {
  const fileName = getAttachmentFileName(attachment);
  const parts = fileName.split(".");
  if (parts.length < 2) return "";
  return String(parts.pop() || "").trim().toLowerCase();
}

function describeGiftAttachment(attachment = {}) {
  const type = String(attachment?.type || "").trim().toLowerCase();
  const fileName = getAttachmentFileName(attachment) || "без имени";
  const ext = getAttachmentExtension(attachment);
  const mimeType = getAttachmentMimeType(attachment);
  const size = getAttachmentSize(attachment);
  const meta = [
    type ? `тип: ${type}` : "",
    ext ? `.${ext}` : "",
    size ? formatBytes(size) : "",
    mimeType || ""
  ].filter(Boolean).join(", ");
  return meta ? `${fileName} (${meta})` : fileName;
}

function getGiftAssetAttachmentCandidates(message) {
  const attachments = getMessageAttachments(message);
  const typeMap = {
    file: "file",
    document: "file",
    image: "image",
    photo: "image",
    picture: "image",
    video: "video",
    movie: "video",
    audio: "audio",
    voice: "audio"
  };
  return attachments
    .map((item) => {
      const rawType = String(item?.type || item?.kind || item?.attachment_type || "").trim().toLowerCase();
      const normalizedType = typeMap[rawType] || rawType;
      const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
      return {
        type: normalizedType,
        rawType,
        payload,
        token: getAttachmentToken(item),
        fileName: getAttachmentFileName(item),
        size: getAttachmentSize(item),
        mimeType: getAttachmentMimeType(item),
        original: item
      };
    })
    .filter((item) => ["file", "image", "video", "audio"].includes(item.type))
    .filter((item) => item.type && (item.token || Object.keys(item.payload || {}).length || Object.keys(item.original || {}).length));
}

function validateGiftAttachment(candidate, config) {
  const limits = getGiftUploadLimits(config);
  if (!limits.enabled) {
    return { ok: false, error: "Загрузка файлов для подарков сейчас отключена" };
  }

  if (!candidate?.type) {
    return { ok: false, error: "Бот не распознал тип вложения" };
  }

  if (limits.allowedTypes.length && !limits.allowedTypes.includes(candidate.type)) {
    return { ok: false, error: `Тип вложения ${candidate.type} сейчас запрещён. Разрешены: ${limits.allowedTypes.join(", ")}` };
  }

  if (limits.maxBytes > 0 && Number(candidate.size || 0) > limits.maxBytes) {
    return { ok: false, error: `Файл слишком большой. Максимум: ${formatBytes(limits.maxBytes)}` };
  }

  const extension = getAttachmentExtension(candidate);
  if (limits.allowedExtensions.length && extension && !limits.allowedExtensions.includes(extension)) {
    return { ok: false, error: `Расширение .${extension} сейчас запрещено. Разрешены: ${limits.allowedExtensions.join(", ")}` };
  }

  if (limits.allowedExtensions.length && !extension) {
    return { ok: false, error: "Не удалось определить расширение файла. Загрузите файл с именем и расширением." };
  }

  return { ok: true, limits };
}

function formatGiftDraftValue(stepKey, value) {
  if (!value) return "";
  if (stepKey === "postIds") {
    return Array.isArray(value) && value.length ? value.join(", ") : "*";
  }
  if (stepKey === "giftAsset") {
    if (value?.giftAttachment) return describeGiftAttachment(value.giftAttachment);
    if (value?.giftUrl) return String(value.giftUrl || "");
    return "";
  }
  if (stepKey === "giftMessage") {
    return String(value || "");
  }
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function buildGiftWizardPrompt(stepIndex, draft = {}, config = null) {
  const step = GIFT_WIZARD_STEPS[stepIndex];
  if (!step) return "";

  let currentValue = draft?.[step.key];
  if (step.key === "giftAsset") {
    currentValue = {
      giftUrl: draft?.giftUrl || "",
      giftAttachment: draft?.giftAttachment || null
    };
  }

  const stepLabel = step.key === 'giftAsset' ? 'Шаг 2/4.' : 'Шаг 3/4.';
  const formattedValue = formatGiftDraftValue(step.key, currentValue);
  const hint = formattedValue && step.key === 'giftMessage' ? `\nТекущее значение: ${formattedValue}` : "";
  const commonHelp = step.key === 'giftMessage'
    ? "\nМожно отправить текст для получателя или нажать «Пропустить текст» кнопкой ниже."
    : "\nПосле загрузки бот сам перейдёт к следующему шагу.";
  return `${stepLabel} ${step.prompt}${hint}${commonHelp}`;
}


function normalizeGiftDraft(flow) {
  const draft = flow?.draft || {};
  return {
    id: String(draft.id || "").trim(),
    title: String(draft.title || "").trim(),
    channelId: String(draft.channelId || "").trim(),
    requiredChatId: String(draft.requiredChatId || draft.channelId || "").trim(),
    postIds: Array.isArray(draft.postIds) ? draft.postIds : [],
    commentKey: String(draft.commentKey || '').trim(),
    subscribeUrl: String(draft.subscribeUrl || "").trim(),
    giftUrl: String(draft.giftUrl || "").trim(),
    giftAttachment: draft.giftAttachment || null,
    giftMessage: String(draft.giftMessage || "").trim(),
    deliverToDm: true
  };
}

function buildGiftCampaignPreview(campaign, options = {}) {
  const fallbackTargetPost = options?.targetPost || null;
  const fallbackTitle = String(options?.channelTitle || fallbackTargetPost?.channelTitle || '').trim();
  const channelName = getTargetChannelName(
    fallbackTargetPost || { channelId: campaign.requiredChatId || campaign.channelId, channelTitle: fallbackTitle },
    fallbackTitle || 'Название канала пока недоступно'
  );
  const title = String(campaign.title || '').trim() || `Подарок к посту (${getGiftPostPreview({ originalText: '', postId: campaign.postIds?.[0] || '' })})`;
  return [
    'Шаг 4/4. Проверьте подарок и нажмите «Сохранить».',
    '',
    `Канал: ${channelName}`,
    `Подарок: ${title}`,
    'Выдача: только в личные сообщения после проверки подписки',
    `Сообщение получателю: ${campaign.giftMessage || 'по умолчанию'}`
  ].join("\n");
}


async function replyToUser({ config, message, text, attachments }) {
  const chatId = getRecipientChatId(message);
  const userId = getSenderUserId(message);
  if (!chatId && !userId) return null;
  const result = await sendMessage({
    botToken: config.botToken,
    ...(chatId ? { chatId } : { userId }),
    text,
    ...(attachments !== undefined ? { attachments } : {}),
    notify: false
  });
  const sentMessageId = extractSentMessageId(result);
  if (userId && sentMessageId) setLatestBotMessageId(userId, sentMessageId);
  return result;
}

async function replyFreshBotMessage({ config, message, text, attachments }) {
  return replyToUser({ config, message, text, attachments });
}

async function sendFreshGiftFlowMessage({ config, message, previousFlow = null, nextFlow = null, text, attachments }) {
  const userId = getSenderUserId(message);
  const previousAnchorId = getGiftFlowAnchorMessageId(previousFlow, userId);
  const trackedIds = getTrackedAdminMessageIds(userId);
  const cleanupFlow = rememberFlowCleanupMessageIds(nextFlow, [previousAnchorId, ...trackedIds]);
  const result = await replyFreshBotMessage({ config, message, text, attachments });
  const sentMessageId = String(extractSentMessageId(result) || '').trim();
  if (userId && cleanupFlow && sentMessageId) {
    setGiftFlow(userId, { ...cleanupFlow, anchorMessageId: sentMessageId });
  }
  await finalizeActiveAdminMessage({ config, userId, activeMessageId: sentMessageId, deleteIds: [previousAnchorId, ...trackedIds].filter(Boolean) });
  return result;
}

function getCommentFlowAnchorMessageId(flow = null, userId = '') {
  const explicit = String(flow?.anchorMessageId || '').trim();
  if (explicit) return explicit;
  return String(getLatestBotMessageId(userId) || '').trim();
}

async function sendFreshCommentFlowMessage({ config, message, previousFlow = null, nextFlow = null, text, attachments }) {
  const userId = getSenderUserId(message);
  const previousAnchorId = getCommentFlowAnchorMessageId(previousFlow, userId);
  const trackedIds = getTrackedAdminMessageIds(userId);
  const cleanupFlow = rememberFlowCleanupMessageIds(nextFlow, [previousAnchorId, ...trackedIds]);
  const result = await replyFreshBotMessage({ config, message, text, attachments });
  const sentMessageId = String(extractSentMessageId(result) || '').trim();
  if (userId && cleanupFlow && sentMessageId) {
    setCommentAdminFlow(userId, { ...cleanupFlow, anchorMessageId: sentMessageId });
  }
  await finalizeActiveAdminMessage({ config, userId, activeMessageId: sentMessageId, deleteIds: [previousAnchorId, ...trackedIds].filter(Boolean) });
  return result;
}

async function sendFreshAdminMessage({ config, message, text, attachments }) {
  const userId = getSenderUserId(message);
  const previousMessageId = String(getLatestBotMessageId(userId) || '').trim();
  const trackedIds = getTrackedAdminMessageIds(userId);
  const result = await replyFreshBotMessage({ config, message, text, attachments });
  const sentMessageId = String(extractSentMessageId(result) || '').trim();
  await finalizeActiveAdminMessage({ config, userId, activeMessageId: sentMessageId, deleteIds: [previousMessageId, ...trackedIds].filter(Boolean) });
  return result;
}


async function upsertBotMessage({ config, message, text, attachments, editCurrent = false, preferredMessageIds = [] }) {
  const userId = getSenderUserId(message);
  const latestMessageId = getLatestBotMessageId(userId);
  const currentMessageId = getMessageId(message);
  const candidateIds = [];
  const seenMessageIds = new Set();
  const pushCandidate = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seenMessageIds.has(normalized)) return;
    seenMessageIds.add(normalized);
    candidateIds.push(normalized);
  };
  if (editCurrent && currentMessageId) pushCandidate(currentMessageId);
  (Array.isArray(preferredMessageIds) ? preferredMessageIds : []).forEach(pushCandidate);
  if (latestMessageId) pushCandidate(latestMessageId);

  const shouldReplaceFromBottom = Boolean(
    editCurrent ||
    message?.__fromCallback ||
    candidateIds.length ||
    (currentMessageId && latestMessageId && String(currentMessageId) !== String(latestMessageId))
  );

  if (shouldReplaceFromBottom) {
    const editTargetId = String(candidateIds[0] || currentMessageId || latestMessageId || '').trim();

    // Для callback-меню сначала редактируем текущее сообщение бота.
    // Это убирает задвоение меню: MAX сейчас не даёт надёжного DELETE /messages,
    // поэтому стратегия "отправить новое и удалить старое" оставляет старые меню в чате.
    if (editTargetId) {
      try {
        const result = await editMessage({
          botToken: config.botToken,
          messageId: editTargetId,
          text,
          attachments,
          notify: false
        });
        await finalizeActiveAdminMessage({
          config,
          userId,
          activeMessageId: editTargetId,
          deleteIds: []
        });
        return result;
      } catch (error) {
        logVerbose(config, 'UPSERT EDIT FAILED, FALLBACK TO FRESH MESSAGE', {
          messageId: editTargetId,
          error: error?.message || String(error),
          data: error?.data || null
        });
      }
    }

    const result = await replyFreshBotMessage({ config, message, text, attachments });
    const sentMessageId = String(extractSentMessageId(result) || '').trim();
    await finalizeActiveAdminMessage({ config, userId, activeMessageId: sentMessageId, deleteIds: [] });
    return result;
  }

  const result = await replyToUser({ config, message, text, attachments });
  const sentMessageId = String(extractSentMessageId(result) || '').trim();
  await finalizeActiveAdminMessage({ config, userId, activeMessageId: sentMessageId, deleteIds: [] });
  return result;
}

async function acknowledgeCallbackSilently(config, callbackId) {
  if (!callbackId) return null;
  try {
    return await answerCallback({ botToken: config.botToken, callbackId });
  } catch {
    return null;
  }
}

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function normalizePossibleUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isLikelyUrl(raw)) return raw;
  const match = raw.match(/https?:\/\/\S+/i);
  if (match) return String(match[0] || '').trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(raw)) return `https://${raw.replace(/^\/+/, '')}`;
  return '';
}

function findFirstUrlDeep(value, seen = new Set()) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (isLikelyUrl(normalized)) return normalized;
    const match = normalized.match(/https?:\/\/\S+/i);
    return match ? String(match[0] || '').trim() : '';
  }
  if (typeof value !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstUrlDeep(item, seen);
      if (found) return found;
    }
    return '';
  }
  for (const key of Object.keys(value)) {
    const found = findFirstUrlDeep(value[key], seen);
    if (found) return found;
  }
  return '';
}

function messageContainsUrlOrPreview(message) {
  return Boolean(extractUrlFromMessage(message) || findFirstUrlDeep(getMessageLink(message) || null) || findFirstUrlDeep(getMessageAttachments(message)) || findFirstUrlDeep(message));
}

function extractUrlFromMessage(message) {
  const directText = String(getMessageText(message) || '').trim();
  const link = getMessageLink(message) || {};
  const pools = [
    directText,
    link?.url,
    link?.href,
    link?.target,
    link?.text,
    message?.url,
    message?.href,
    message?.target,
    message?.caption,
    message?.title,
    findFirstUrlDeep(link),
    findFirstUrlDeep(getMessageAttachments(message)),
    findFirstUrlDeep(message)
  ];
  for (const value of pools) {
    const normalized = normalizePossibleUrl(value);
    if (normalized) return normalized;
  }
  return normalizePossibleUrl(directText);
}

function parseCommand(text) {
  const raw = String(text || "").trim();
  const [command, ...rest] = raw.split(/\s+/);
  return {
    raw,
    command: String(command || "").toLowerCase(),
    argsText: rest.join(" ").trim(),
    args: rest
  };
}

function truncateText(value = "", maxLength = 64) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function buildAdminPageUrl(pathName = "", token = "", config = null) {
  const base = String(config?.appBaseUrl || "").trim().replace(/\/$/, "");
  if (!base || !pathName) return "";
  const path = String(pathName || "").trim().replace(/^\//, "");
  const url = new URL(`${base}/${path}`);
  if (token) url.searchParams.set('adminToken', token);
  return url.toString();
}

function getRecentGiftPosts(limit = 6, page = 0, options = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 6), 10));
  const safePage = Math.max(0, Number(page || 0));
  const requestedChannelId = String(options?.channelId || '').trim();
  const userId = String(options?.userId || '').trim();
  const singleChannel = requestedChannelId ? null : getSingleVisibleChannel(userId);
  const filterChannelId = requestedChannelId || String(singleChannel?.channelId || '').trim();
  const seen = new Set();
  const posts = getPostsList()
    .filter((post) => post?.channelId && post?.postId)
    .filter((post) => !filterChannelId || String(post.channelId || '').trim() === filterChannelId)
    .filter((post) => {
      const channel = String(post.channelId || '').trim();
      const idKey = [channel, String(post.postId || '').trim()].join(':post:');
      const msgKey = String(post.messageId || '').trim() ? [channel, String(post.messageId || '').trim()].join(':msg:') : '';
      const keys = [idKey, msgKey].filter(Boolean);
      if (keys.some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    });
  const start = safePage * safeLimit;
  return {
    items: posts.slice(start, start + safeLimit),
    total: posts.length,
    page: safePage,
    hasPrev: safePage > 0,
    hasNext: start + safeLimit < posts.length
  };
}

function buildRecentPostsKeyboard(page = 0, options = {}) {
  const recent = getRecentGiftPosts(6, page, options);
  let buttons = recent.items.map((post, index) => [{
    type: 'callback',
    text: truncateText(`${index + 1 + (recent.page * 6)}. ${post.originalText || post.postId || 'Пост без текста'}`, 56),
    payload: buildAdminCallbackPayload('gift_admin_select_post', { commentKey: post.commentKey || '' })
  }]);

  const navRow = [];
  if (recent.hasPrev) {
    navRow.push({ type: 'callback', text: '⬅️ Назад', payload: buildAdminCallbackPayload('gift_admin_recent_posts', { page: recent.page - 1 }) });
  }
  if (recent.hasNext) {
    navRow.push({ type: 'callback', text: 'Вперёд ➡️', payload: buildAdminCallbackPayload('gift_admin_recent_posts', { page: recent.page + 1 }) });
  }
  if (navRow.length) buttons.push(navRow);

  buttons = appendAdminFooterRows(buttons, { backAction: 'admin_section_gifts', rootAction: 'admin_section_gifts' });
  return [{ type: 'inline_keyboard', payload: { buttons } }];
}

function buildRecentCommentPostsKeyboard(page = 0, options = {}) {
  const recent = getRecentGiftPosts(6, page, options);
  const source = String(options?.source || 'comments').trim().toLowerCase();
  const rootAction = getAdminSectionActionFromSource(source);
  let buttons = recent.items.map((post, index) => [{
    type: 'callback',
    text: truncateText(`${index + 1 + (recent.page * 6)}. ${post.originalText || post.postId || 'Пост без текста'}`, 56),
    payload: buildAdminCallbackPayload('comments_pick_post', { commentKey: post.commentKey || '', source })
  }]);

  const navRow = [];
  if (recent.hasPrev) {
    navRow.push({ type: 'callback', text: '⬅️ Назад', payload: buildAdminCallbackPayload('comments_select_post', { page: recent.page - 1, source }) });
  }
  if (recent.hasNext) {
    navRow.push({ type: 'callback', text: 'Вперёд ➡️', payload: buildAdminCallbackPayload('comments_select_post', { page: recent.page + 1, source }) });
  }
  if (navRow.length) buttons.push(navRow);

  buttons = appendAdminFooterRows(buttons, { backAction: rootAction, rootAction });
  return [{ type: 'inline_keyboard', payload: { buttons } }];
}

function buildGiftWebLinksRow(config) {
  const postsUrl = buildAdminPageUrl('posts', config?.giftAdminToken || '', config);
  const moderationUrl = buildAdminPageUrl('moderation', config?.moderationAdminToken || config?.giftAdminToken || '', config);
  const analyticsUrl = buildAdminPageUrl('analytics', config?.giftAdminToken || '', config);
  const rows = [];
  if (postsUrl || moderationUrl) {
    rows.push([
      ...(postsUrl ? [{ type: 'link', text: '📝 Посты / CTA', url: postsUrl }] : []),
      ...(moderationUrl ? [{ type: 'link', text: '🛡️ Модерация', url: moderationUrl }] : [])
    ]);
  }
  if (analyticsUrl) {
    rows.push([{ type: 'link', text: '📊 Аналитика', url: analyticsUrl }]);
  }
  return rows.filter((row) => row.length);
}

function buildAdminCallbackPayload(action, extra = {}) {
  return JSON.stringify({
    action: String(action || '').trim(),
    ...extra
  });
}

function getAdminActionLabel(action = '') {
  const map = {
    admin_section_main: '🔁 Начало',
    admin_section_comments: '💬 Комменты',
    admin_section_gifts: '🎁 Подарки',
    admin_section_posts: '✏️ Посты',
    admin_section_buttons: '🧩 Кнопки',
    admin_section_stats: '📊 Статы',
    admin_section_channels: '📺 Каналы',
    admin_section_info: 'ℹ️ Info',
    admin_section_help: '❓ Help'
  };
  return map[String(action || '').trim()] || '🔁 Раздел';
}

function appendAdminFooterRows(rows = [], { backAction = 'admin_section_main', rootAction = 'admin_section_main' } = {}) {
  const next = Array.isArray(rows) ? rows.slice() : [];
  next.push([{ type: 'callback', text: getAdminActionLabel(rootAction), payload: buildAdminCallbackPayload(rootAction) }]);
  next.push([{ type: 'callback', text: '⬅️ Назад', payload: buildAdminCallbackPayload(backAction || 'admin_section_main') }]);
  next.push([{ type: 'callback', text: '🏠 Меню', payload: buildAdminCallbackPayload('admin_section_main') }]);
  return next;
}


function buildAdminSectionsKeyboard(config = null) {
  return [{
    type: 'inline_keyboard',
    payload: {
      buttons: [
        [{ type: 'callback', text: '💬 Комментарии', payload: buildAdminCallbackPayload('admin_section_comments') }],
        [{ type: 'callback', text: '🎁 Подарки и лид-магниты', payload: buildAdminCallbackPayload('admin_section_gifts') }],
        [{ type: 'callback', text: '✏️ Редактирование постов', payload: buildAdminCallbackPayload('admin_section_posts') }],
        [{ type: 'callback', text: '🧩 Пользовательские кнопки', payload: buildAdminCallbackPayload('admin_section_buttons') }],
        [{ type: 'callback', text: '📊 Статистика', payload: buildAdminCallbackPayload('admin_section_stats') }],
        [{ type: 'callback', text: '📺 Ваши каналы', payload: buildAdminCallbackPayload('admin_section_channels') }],
        [{ type: 'callback', text: '✅ Подключить канал', payload: buildAdminCallbackPayload('admin_bind_channel') }],
        [{ type: 'callback', text: 'ℹ️ Информация', payload: buildAdminCallbackPayload('admin_section_info') }],
        [{ type: 'callback', text: '❓ Помощь', payload: buildAdminCallbackPayload('admin_section_help') }]
      ]
    }
  }];
}


function buildGiftMainMenuKeyboard(config = null, options = {}) {
  const flow = options?.flow || null;
  const targetPost = options?.targetPost || null;
  const hasTarget = Boolean(targetPost?.channelId && targetPost?.postId);
  const existingCampaign = getExistingGiftCampaignForTarget(targetPost);
  let rows = [];

  if (flow?.awaitingConfirmation) {
    rows.push([{ type: 'callback', text: '✅ Сохранить', payload: buildAdminCallbackPayload('gift_admin_save') }]);
    rows.push([{ type: 'callback', text: '❌ Отменить', payload: buildAdminCallbackPayload('gift_admin_cancel') }]);
    rows.push([{ type: 'callback', text: '🧾 Текущий подарок', payload: buildAdminCallbackPayload('gift_admin_show_current') }]);
  } else if (flow) {
    const stepNumber = Number(flow.stepIndex || 0) + 2;
    if (stepNumber === 3) {
      rows.push([{ type: 'callback', text: '⏭ Пропустить текст', payload: buildAdminCallbackPayload('gift_admin_skip_message') }]);
    }
    rows.push([{ type: 'callback', text: '🧾 Текущий подарок', payload: buildAdminCallbackPayload('gift_admin_show_current') }]);
    rows.push([{ type: 'callback', text: '❌ Отменить', payload: buildAdminCallbackPayload('gift_admin_cancel') }]);
  } else if (hasTarget && existingCampaign) {
    rows.push([{ type: 'callback', text: '🔁 Заменить подарок', payload: buildAdminCallbackPayload('gift_admin_replace_existing') }]);
    rows.push([{ type: 'callback', text: '🗑 Удалить подарок', payload: buildAdminCallbackPayload('gift_admin_delete_existing') }]);
    rows.push([{ type: 'callback', text: '📌 Выбрать другой пост', payload: buildAdminCallbackPayload('gift_admin_recent_posts', { page: 0 }) }]);
    rows.push([{ type: 'callback', text: '🧾 Текущий подарок', payload: buildAdminCallbackPayload('gift_admin_show_current') }]);
  } else if (hasTarget) {
    rows.push([{ type: 'callback', text: '🎁 Создать подарок', payload: buildAdminCallbackPayload('gift_admin_start_create') }]);
    rows.push([{ type: 'callback', text: '📌 Выбрать другой пост', payload: buildAdminCallbackPayload('gift_admin_recent_posts', { page: 0 }) }]);
    rows.push([{ type: 'callback', text: '🧾 Текущий подарок', payload: buildAdminCallbackPayload('gift_admin_show_current') }]);
  } else {
    rows.push([{ type: 'callback', text: '📌 Выбрать пост для подарка', payload: buildAdminCallbackPayload('gift_admin_recent_posts', { page: 0 }) }]);
    rows.push([{ type: 'callback', text: '🧾 Текущий подарок', payload: buildAdminCallbackPayload('gift_admin_show_current') }]);
  }

  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_main', rootAction: 'admin_section_gifts' });
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}


function buildCommentsSectionKeyboard(config = null, targetPost = null) {
  const freshTargetPost = getFreshTargetPost(targetPost);
  const commentsEnabled = !Boolean(freshTargetPost?.commentsDisabled);
  let rows = [
    [{ type: 'callback', text: '⚡ Для новых постов', payload: buildAdminCallbackPayload('comments_enable_new') }],
    [{ type: 'callback', text: '📌 К старому посту', payload: buildAdminCallbackPayload('comments_old_post') }]
  ];

  if (freshTargetPost?.commentKey) {
    rows.push([{ type: 'callback', text: commentsEnabled ? '🗑 Убрать комментарии у поста' : '↩️ Вернуть комментарии у поста', payload: buildAdminCallbackPayload('comments_toggle_post_comments', { enabled: commentsEnabled ? '0' : '1' }) }]);
    rows.push([{ type: 'callback', text: '📌 Выбрать другой пост', payload: buildAdminCallbackPayload('comments_select_post', { source: 'comments' }) }]);
  } else {
    rows.push([{ type: 'callback', text: '📌 Выбрать пост для настройки', payload: buildAdminCallbackPayload('comments_select_post', { source: 'comments' }) }]);
  }

  rows.push([{ type: 'callback', text: '🛡️ Модерация', payload: buildAdminCallbackPayload('comments_moderation') }]);
  rows.push([{ type: 'callback', text: '👀 Пример работы', payload: buildAdminCallbackPayload('comments_example') }]);
  rows.push([{ type: 'callback', text: '📺 Ваши каналы', payload: buildAdminCallbackPayload('admin_section_channels') }]);
  rows.push([{ type: 'callback', text: '❓ Помощь', payload: buildAdminCallbackPayload('admin_section_help') }]);

  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_main', rootAction: 'admin_section_comments' });
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

function buildPostsSectionText(targetPost = null) {
  const freshTargetPost = getFreshTargetPost(targetPost);
  const channelName = getTargetChannelName(freshTargetPost);
  if (!freshTargetPost?.commentKey) {
    return [
      'Редактирование постов',
      '',
      'Сначала выберите или перешлите пост из канала.',
      'После этого здесь можно будет изменить текст выбранного поста прямо внутри MAX и управлять кнопкой комментариев.'
    ].join('\n');
  }
  const commentsEnabled = !Boolean(freshTargetPost?.commentsDisabled);
  return [
    'Редактирование постов',
    '',
    `Канал: ${channelName}`,
    `Пост: ${getGiftPostPreview(freshTargetPost)}`,
    `Комментарии: ${commentsEnabled ? 'включены' : 'выключены'}`,
    '',
    'Выберите действие кнопками ниже.'
  ].join('\n');
}

function buildPostsSectionKeyboard(targetPost = null) {
  const freshTargetPost = getFreshTargetPost(targetPost);
  const commentsEnabled = !Boolean(freshTargetPost?.commentsDisabled);
  let rows = [[{ type: 'callback', text: '📌 Выбрать пост', payload: buildAdminCallbackPayload('comments_select_post', { source: 'posts' }) }]];
  if (freshTargetPost?.commentKey) {
    rows.push([{ type: 'callback', text: '✏️ Изменить текст поста', payload: buildAdminCallbackPayload('comments_edit_text') }]);
    rows.push([{ type: 'callback', text: commentsEnabled ? '🗑 Убрать комментарии' : '↩️ Вернуть комментарии', payload: buildAdminCallbackPayload('comments_toggle_post_comments', { enabled: commentsEnabled ? '0' : '1' }) }]);
  }
  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_main', rootAction: 'admin_section_posts' });
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

function buildButtonsSectionText(targetPost = null) {
  if (!targetPost?.commentKey) {
    return [
      'Пользовательские кнопки',
      '',
      'Сначала выберите или перешлите пост.',
      'После этого можно добавить одну или несколько кнопок под выбранным постом.'
    ].join('\n');
  }
  const channelName = getTargetChannelName(targetPost);
  const buttons = flattenCustomButtons(targetPost);
  const lines = [
    'Пользовательские кнопки',
    '',
    `Канал: ${channelName}`,
    `Пост: ${getGiftPostPreview(targetPost)}`,
    ''
  ];
  if (!buttons.length) {
    lines.push('Под постом пока нет дополнительных кнопок.');
  } else {
    lines.push('Текущие кнопки:');
    buttons.forEach((button, index) => lines.push(`${index + 1}. ${truncateText(button.text || 'Кнопка', 32)}`));
  }
  lines.push('');
  lines.push('Выберите действие кнопками ниже.');
  return lines.join('\n');
}

function buildStatsSectionText(targetPost = null, userId = '') {
  return buildChannelStatsText({ targetPost, userId });
}

function buildStatsSectionKeyboard(targetPost = null, userId = '') {
  const hasPost = Boolean(resolveStatsPost(targetPost, userId)?.commentKey);
  let rows = [
      [{ type: 'callback', text: '🔄 Обновить', payload: buildAdminCallbackPayload('admin_stats_refresh') }],
      [{ type: 'callback', text: '👥 Подписчики', payload: buildAdminCallbackPayload('admin_stats_subscribers') }],
      [{ type: 'callback', text: hasPost ? '🧾 Пост' : '📌 Выбрать пост', payload: buildAdminCallbackPayload(hasPost ? 'admin_stats_post' : 'comments_select_post', hasPost ? {} : { source: 'stats' }) }]
  ];
  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_main', rootAction: 'admin_section_stats' });
  return [{
    type: 'inline_keyboard',
    payload: { buttons: rows }
  }];
}

function buildCommentsOverviewText(targetPost = null) {
  const freshTargetPost = getFreshTargetPost(targetPost);
  const lines = [
    'Раздел «Комментарии».',
    '',
    'Здесь можно включать обсуждения под постами, добавлять комментарии к старым публикациям и убирать кнопку комментариев у конкретного поста.'
  ];

  if (freshTargetPost?.commentKey) {
    lines.push('');
    lines.push(`Выбранный пост: ${getGiftPostPreview(freshTargetPost)}`);
    lines.push(`Комментарии: ${!Boolean(freshTargetPost.commentsDisabled) ? 'включены' : 'выключены'}`);
  } else {
    lines.push('');
    lines.push('Пост пока не выбран. Выберите пост из списка или перешлите публикацию боту.');
  }

  lines.push('');
  lines.push('Выберите действие кнопками ниже.');
  return lines.join('\n');
}

function buildCommentsEnableNewText() {
  return [
    'Комментарии для новых постов',
    '',
    '1. Добавьте бота в канал как администратора.',
    '2. Убедитесь в разделе «Ваши каналы», что канал появился в списке.',
    '3. Публикуйте новый пост — бот автоматически прикрепит кнопку комментариев.',
    '',
    'Это самый быстрый режим запуска.'
  ].join('\n');
}

function buildCommentsOldPostText() {
  return [
    'Комментарии к старому посту',
    '',
    '1. Перешлите боту нужный пост из вашего канала.',
    '2. Бот определит пост и привяжет к нему комментарии.',
    '3. После этого можно проверить пост в канале.',
    '',
    'Это удобно, если пост уже опубликован.'
  ].join('\n');
}

function buildCommentsEditPostText(config = null) {
  return [
    'Редактирование поста',
    '',
    '1. Перешлите боту нужный пост из канала.',
    '2. После этого можно изменить текст поста прямо внутри MAX.',
    '3. Кнопка комментариев, медиа и ссылка в посте сохраняются.'
  ].join('\n');
}

function buildCommentsExampleText() {
  return [
    'Пример логики комментариев',
    '',
    '• читатель нажимает кнопку комментариев под постом;',
    '• открывается обсуждение именно этого поста;',
    '• администратор видит активность и может поддержать обсуждение;',
    '• при необходимости комментарии можно включать и для старых публикаций.'
  ].join('\n');
}

function buildCommentsSettingsText(config = null) {
  return [
    'Настройки комментариев',
    '',
    'Здесь можно включать и выключать основные правила прямо внутри MAX:',
    '• фильтр нежелательных слов;',
    '• блокировку ссылок;',
    '• защиту от приглашений;',
    '• AI-проверку комментариев.'
  ].join('\n');
}

function buildCommentsHowItWorksText() {
  return [
    'Как это работает',
    '',
    '1. Бот связывает пост канала с отдельным ключом обсуждения.',
    '2. Под постом появляется кнопка комментариев.',
    '3. Читатель открывает обсуждение именно этого поста.',
    '4. При повторном редактировании поста кнопка комментариев сохраняется.'
  ].join('\n');
}


function buildCommentsPostAdminText(targetPost = null) {
  const channelName = getTargetChannelName(targetPost);
  if (!targetPost?.commentKey) {
    return [
      'Редактирование поста',
      '',
      'Перешлите боту нужный пост из канала.',
      'После этого здесь можно будет изменить текст поста.'
    ].join('\n');
  }
  return [
    'Редактирование поста',
    '',
    `Канал: ${channelName}`,
    '',
    'Выберите действие кнопками ниже.'
  ].join('\n');
}

function buildCommentsPostAdminKeyboard(targetPost = null) {
  const hasTarget = Boolean(targetPost?.commentKey);
  let rows = [[{ type: 'callback', text: '📌 Выбрать пост', payload: buildAdminCallbackPayload('comments_select_post', { source: 'posts' }) }]];
  if (hasTarget) rows.push([{ type: 'callback', text: '✏️ Изменить текст', payload: buildAdminCallbackPayload('comments_edit_text') }]);
  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_posts', rootAction: 'admin_section_posts' });
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}


function normalizeButtonKey(text = '', url = '') {
  return `${String(text || '').replace(/\s+/g, ' ').trim().toLowerCase()}|${String(url || '').trim()}`;
}

function unwrapTrackedButtonUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const target = parsed.searchParams.get('target');
    if (target && /^https?:\/\//i.test(target)) return target.trim();
  } catch {}
  return raw;
}

function isSystemPostButton(text = '', url = '') {
  const label = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const link = String(url || '').trim().toLowerCase();
  if (!label) return true;
  if (label.includes('коммент') || label.includes('получить подарок')) return true;
  if (label.includes('подарок') && !label.includes('спорт') && !label.includes('нажим')) return true;
  if (link.includes('startapp=') && label.includes('коммент')) return true;
  return false;
}

function extractCustomButtonsFromPatchedAttachments(post = {}) {
  const attachments = [
    ...(Array.isArray(post?.patchedAttachments) ? post.patchedAttachments : []),
    ...(Array.isArray(post?.lastPatchedAttachments) ? post.lastPatchedAttachments : []),
    ...(Array.isArray(post?.attachments) ? post.attachments : [])
  ];
  const result = [];
  for (const attachment of attachments) {
    if (String(attachment?.type || '').trim() !== 'inline_keyboard') continue;
    const rows = Array.isArray(attachment?.payload?.buttons) ? attachment.payload.buttons : [];
    for (const row of rows) {
      for (const button of (Array.isArray(row) ? row : [])) {
        const text = String(button?.text || '').trim();
        const rawUrl = String(button?.url || button?.payload?.url || '').trim();
        const url = unwrapTrackedButtonUrl(rawUrl);
        if (!text || !url || isSystemPostButton(text, url)) continue;
        result.push({ text, url, type: 'link' });
      }
    }
  }
  return result;
}

function getCanonicalCustomKeyboardBuilder(post = {}) {
  const source = post?.customKeyboard && typeof post.customKeyboard === 'object' ? post.customKeyboard : {};
  const rows = Array.isArray(source.rows) ? JSON.parse(JSON.stringify(source.rows)) : [];
  const seen = new Set();
  rows.forEach((row) => {
    (Array.isArray(row?.buttons) ? row.buttons : []).forEach((button) => {
      const text = String(button?.text || '').trim();
      const url = unwrapTrackedButtonUrl(button?.url || '');
      if (text && url) seen.add(normalizeButtonKey(text, url));
    });
  });
  extractCustomButtonsFromPatchedAttachments(post).forEach((button) => {
    const key = normalizeButtonKey(button.text, button.url);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push({ buttons: [{ text: button.text, url: button.url, type: button.type || 'link' }] });
  });
  return { ...source, rows };
}

function flattenCustomButtons(targetPost = null) {
  const currentPost = targetPost?.commentKey ? getPost(targetPost.commentKey) || {} : {};
  const builder = getCanonicalCustomKeyboardBuilder(currentPost);
  const rows = Array.isArray(builder?.rows) ? builder.rows : [];
  const flat = [];
  rows.forEach((row, rowIndex) => {
    const buttons = Array.isArray(row?.buttons) ? row.buttons : [];
    buttons.forEach((button, buttonIndex) => {
      const text = String(button?.text || 'Кнопка').trim();
      const url = unwrapTrackedButtonUrl(button?.url || '');
      if (!text || !url) return;
      flat.push({ rowIndex, buttonIndex, text, url });
    });
  });
  return flat;
}

function getFreshTargetPost(targetPost = null) {
  if (!targetPost?.commentKey) return targetPost || null;
  const stored = getPost(targetPost.commentKey) || {};
  return { ...(targetPost || {}), ...(stored || {}) };
}

function buildCommentsButtonsAdminText(targetPost = null) {
  const freshTargetPost = getFreshTargetPost(targetPost);
  if (!freshTargetPost?.commentKey) {
    return ['Пользовательские кнопки', '', 'Сначала выберите или перешлите пост.'].join('\n');
  }
  const buttons = flattenCustomButtons(freshTargetPost);
  const lines = ['Пользовательские кнопки', ''];
  if (!buttons.length) {
    lines.push('Дополнительных кнопок пока нет.');
    lines.push('');
    lines.push('Шаг 1/3. Нажмите «Добавить».');
    lines.push('Шаг 2/3. Пришлите текст кнопки.');
    lines.push('Шаг 3/3. Пришлите ссылку и сохраните кнопку.');
  } else {
    lines.push('Текущие кнопки под постом:');
    buttons.forEach((button, index) => lines.push(`${index + 1}. ${button.text || 'Кнопка'}`));
    lines.push('');
    lines.push('Нажмите название кнопки, чтобы изменить её. Под каждой кнопкой есть отдельное удаление.');
  }
  lines.push('');
  lines.push('Выберите действие кнопками ниже.');
  return lines.join('\n');
}

function buildCommentsButtonsAdminKeyboard(targetPost = null) {
  const freshTargetPost = getFreshTargetPost(targetPost);
  const hasTarget = Boolean(freshTargetPost?.commentKey);
  let rows = [];
  if (hasTarget) {
    rows.push([
      { type: 'callback', text: '➕ Добавить', payload: buildAdminCallbackPayload('comments_add_button') },
      { type: 'callback', text: '📌 Пост', payload: buildAdminCallbackPayload('comments_select_post', { source: 'buttons' }) }
    ]);
    const buttons = flattenCustomButtons(freshTargetPost);
    buttons.slice(0, 8).forEach((button, index) => {
      const label = truncateText(button.text || `Кнопка ${index + 1}`, 42);
      rows.push([{ type: 'callback', text: `✏️ ${label}`, payload: buildAdminCallbackPayload('comments_edit_button', { rowIndex: button.rowIndex, buttonIndex: button.buttonIndex }) }]);
      rows.push([{ type: 'callback', text: `🗑 Удалить ${index + 1}`, payload: buildAdminCallbackPayload('comments_delete_button', { rowIndex: button.rowIndex, buttonIndex: button.buttonIndex }) }]);
    });
  } else {
    rows.push([{ type: 'callback', text: '📌 Выбрать пост', payload: buildAdminCallbackPayload('comments_select_post', { source: 'buttons' }) }]);
  }
  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_buttons', rootAction: 'admin_section_buttons' });
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

function buildChannelsSectionKeyboard(config = null) {
  let rows = [
    [{ type: 'callback', text: '✅ Подключить канал', payload: buildAdminCallbackPayload('admin_bind_channel') }]
  ];
  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_main', rootAction: 'admin_section_channels' });
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

function buildCommentsButtonSavedKeyboard(targetPost = null, savedButton = null) {
  return buildCommentsButtonsAdminKeyboard(targetPost);
}

function buildModerationMenuText(channelId = '') {
  const settings = getModerationSettings(channelId);
  const channelName = getReadableChannelName(channelId);
  return [
    'Фильтр комментариев',
    '',
    `Канал: ${channelName}`,
    `Фильтр: ${settings.enabled ? 'включён' : 'выключен'}`,
    `Ссылки: ${settings.blockLinks ? 'блокируются' : 'разрешены'}`,
    `Приглашения: ${settings.blockInvites ? 'блокируются' : 'разрешены'}`,
    `AI-проверка: ${settings.aiEnabled ? 'включена' : 'выключена'}`,
    '',
    'Настройки применяются к комментариям этого канала.'
  ].join('\n');
}

function buildModerationMenuKeyboard(channelId = '') {
  const settings = getModerationSettings(channelId);
  return [{
    type: 'inline_keyboard',
    payload: {
      buttons: [
        [
          { type: 'callback', text: settings.enabled ? '⏸ Выключить фильтр' : '▶️ Включить фильтр', payload: buildAdminCallbackPayload('comments_toggle_moderation', { channelId, field: 'enabled' }) },
          { type: 'callback', text: settings.blockLinks ? '🔗 Ссылки: выкл.' : '🔗 Ссылки: вкл.', payload: buildAdminCallbackPayload('comments_toggle_moderation', { channelId, field: 'blockLinks' }) }
        ],
        [
          { type: 'callback', text: settings.blockInvites ? '✉️ Приглашения: выкл.' : '✉️ Приглашения: вкл.', payload: buildAdminCallbackPayload('comments_toggle_moderation', { channelId, field: 'blockInvites' }) },
          { type: 'callback', text: settings.aiEnabled ? '🤖 AI: вкл.' : '🤖 AI: выкл.', payload: buildAdminCallbackPayload('comments_toggle_moderation', { channelId, field: 'aiEnabled' }) }
        ],
        [
          { type: 'callback', text: '🏠 К комментариям', payload: buildAdminCallbackPayload('admin_section_comments') }
        ]
      ]
    }
  }];
}

function buildInfoSectionKeyboard() {
  let rows = [];
  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_main', rootAction: 'admin_section_info' });
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

function buildHelpSectionKeyboard() {
  let rows = [
    [{ type: 'callback', text: '📺 Ваши каналы', payload: buildAdminCallbackPayload('admin_section_channels') }]
  ];
  rows = appendAdminFooterRows(rows, { backAction: 'admin_section_main', rootAction: 'admin_section_help' });
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

function buildAdminMenuText({ userName = '' } = {}) {
  return [
    `Привет, ${userName || 'администратор'}!`,
    'АдминКит — система управления MAX.',
    'Выберите нужный раздел.'
  ].join('\n');
}

function buildInfoText() {
  return [
    'Информация',
    '',
    'Комментарии нужны, чтобы под постами было живое обсуждение. Это помогает удерживать внимание и возвращать читателей к публикациям.',
    '',
    'Подарок за подписку нужен, чтобы человеку было проще принять решение подписаться на канал и получить бонус.',
    '',
    'Мини-версия бота специально упрощена: только комментарии и подарки, без лишних разделов и сложных настроек.'
  ].join('\n');
}

function buildBindChannelText() {
  return [
    'Подключение канала',
    '',
    '1. Добавьте бота в канал как администратора.',
    '2. Перешлите боту любой пост из этого канала.',
    '3. Бот подключит канал и покажет его в разделе «Ваши каналы».',
    '',
    'После этого можно пользоваться всеми разделами меню.'
  ].join('\n');
}

function buildHelpText() {
  return [
    'Помощь',
    '',
    'Комментарии:',
    '1. Добавьте бота в канал с нужными правами.',
    '2. Опубликуйте новый пост или перешлите пост боту.',
    '3. Бот прикрепит кнопку комментариев к посту.',
    '',
    'Подарки:',
    '1. Откройте раздел «Подарки».',
    '2. Выберите пост из списка последних постов или перешлите его боту.',
    '3. Нажмите «Создать подарок».',
    '4. Пришлите файл подарка или вставьте ссылку на подарок.',
    '5. При желании добавьте текст для получателя или пропустите этот шаг.',
    '6. На последнем шаге нажмите «Сохранить».',
    '',
    'Выдача подарка всегда идёт в личные сообщения после проверки подписки на канал.'
  ].join('\n');
}

function buildSectionIntro(section, { userName = '', targetPost = null } = {}) {
  if (section === 'gifts') {
    const lines = [];
    if (targetPost?.channelId && targetPost?.postId) {
      lines.push('Раздел «Подарки и лид-магниты».');
      lines.push(`Канал: ${getTargetChannelName(targetPost)}`);
      lines.push(`Пост: ${getGiftPostPreview(targetPost)}`);
      lines.push('Нажмите «Создать подарок», чтобы открыть мастер.');
    } else {
      lines.push('Раздел «Подарки и лид-магниты».');
      lines.push('Сначала выберите или перешлите пост из канала.');
    }
    return lines.join('\n');
  }
  if (section === 'comments') return buildCommentsOverviewText(targetPost);
  if (section === 'posts') return buildPostsSectionText(targetPost);
  if (section === 'buttons') return buildButtonsSectionText(targetPost);
  if (section === 'stats') return buildStatsSectionText(targetPost);
  if (section === 'info') return buildInfoText();
  if (section === 'help') return buildHelpText();
  return buildAdminMenuText({ userName });
}

async function sendAdminMainMenu({ config, message, note = '' }) {
  const userId = getSenderUserId(message);
  const text = [
    note ? String(note).trim() : '',
    buildAdminMenuText({ userName: getSenderFirstName(message) })
  ].filter(Boolean).join('\n\n');
  return replyToUser({
    config,
    message,
    text,
    attachments: await buildAdminMainMenuAttachments(config)
  });
}

async function sendSectionMenu({ section = 'main', config, message, note = '', editCurrent = false }) {
  const userId = getSenderUserId(message);
  const userName = getSenderFirstName(message);
  if (section === 'gifts') {
    clearCommentAdminFlow(userId);
    clearActiveAdminFlowKind(userId);
  } else if (['buttons', 'posts', 'comments', 'stats', 'main', 'channels', 'info', 'help'].includes(section)) {
    clearCommentAdminFlow(userId);
    clearGiftFlow(userId);
    clearActiveAdminFlowKind(userId);
  }
  const targetPost = getActiveTargetPost(userId);
  const currentFlow = getGiftFlow(userId);

  let attachments = await buildAdminMainMenuAttachments(config);
  let text = buildAdminMenuText({ userName });

  rememberAdminScreen(userId, { section, backAction: 'admin_section_main', rootAction: `admin_section_${section === 'main' ? 'main' : section}` });

  if (section === 'gifts') {
    attachments = buildGiftMainMenuKeyboard(config, { flow: currentFlow, targetPost });
    text = currentFlow ? buildGiftFlowGuidance(currentFlow, config, { targetPost }) : buildSectionIntro('gifts', { userName, targetPost });
  } else if (section === 'comments') {
    attachments = buildCommentsSectionKeyboard(config, targetPost);
    text = buildSectionIntro('comments', { userName, targetPost });
  } else if (section === 'posts') {
    attachments = buildPostsSectionKeyboard(targetPost);
    text = buildSectionIntro('posts', { userName, targetPost });
  } else if (section === 'buttons') {
    attachments = buildCommentsButtonsAdminKeyboard(targetPost);
    text = buildSectionIntro('buttons', { userName, targetPost });
  } else if (section === 'stats') {
    attachments = buildStatsSectionKeyboard(targetPost, userId);
    text = buildStatsSectionText(targetPost, userId);
  } else if (section === 'info') {
    attachments = buildInfoSectionKeyboard(config);
    text = buildSectionIntro('info', { userName, targetPost });
  } else if (section === 'help') {
    attachments = buildHelpSectionKeyboard(config);
    text = buildSectionIntro('help', { userName, targetPost });
  }

  const finalText = [note ? String(note).trim() : '', text].filter(Boolean).join('\n\n');
  // SP27: после пересылки старого поста это пользовательское сообщение, а не callback.
  // Меню раздела отправляем новым сообщением вниз, а не редактируем старое меню выше.
  if (!editCurrent && !message?.__fromCallback) {
    return sendFreshAdminMessage({ config, message, text: finalText, attachments });
  }
  return upsertBotMessage({
    config,
    message,
    text: finalText,
    attachments,
    editCurrent
  });
}

async function sendChannelsSection({ config, message, note = '', editCurrent = false }) {
  const userId = getSenderUserId(message);
  clearGiftFlow(userId);
  clearCommentAdminFlow(userId);
  clearActiveAdminFlowKind(userId);
  rememberAdminScreen(userId, { section: 'channels', backAction: 'admin_section_main', rootAction: 'admin_section_channels' });
  const channels = await getVisibleChannelsForUser(config, userId);
  const lines = [];
  if (note) lines.push(String(note).trim());
  if (!channels.length) {
    lines.push('У вас еще нет каналов. Добавьте бота в канал как администратора и перешлите любой пост из канала.');
  } else {
    lines.push('Ваши каналы:');
    channels.forEach((item, index) => {
      const title = getChannelDisplayName(item) || 'Канал';
      lines.push(`${index + 1}. ${title}`);
    });
  }
  return upsertBotMessage({
    config,
    message,
    text: lines.join('\n'),
    attachments: buildChannelsSectionKeyboard(config),
    editCurrent
  });
}

async function sendRecentPostsMenu({ config, message, page = 0, note = '', editCurrent = false }) {
  const userId = getSenderUserId(message);
  clearCommentAdminFlow(userId);
  clearActiveAdminFlowKind(userId);
  rememberAdminScreen(userId, { section: 'gifts_post_picker', backAction: 'admin_section_gifts', rootAction: 'admin_section_gifts', selectMode: 'gifts' });
  const recent = getRecentGiftPosts(6, page, { userId });
  const lines = [];
  if (note) lines.push(String(note).trim());
  if (!recent.items.length) {
    lines.push('Пока нет постов в памяти бота. Перешлите боту нужный пост из канала, и он появится здесь.');
  } else {
    lines.push('Выберите пост из последних сохранённых постов:');
    recent.items.forEach((post, index) => {
      lines.push(`• ${index + 1 + (recent.page * 6)}. ${truncateText(post.originalText || 'Пост без текста', 90)}`);
    });
  }
  return upsertBotMessage({
    config,
    message,
    text: lines.join('\n'),
    attachments: buildRecentPostsKeyboard(page, { userId }),
    editCurrent
  });
}

function buildGiftAdminActionsKeyboard(config = null, flow = null, targetPost = null) {
  return buildGiftMainMenuKeyboard(config, { flow, targetPost });
}

function buildGiftCampaignSummary(campaign = null) {
  if (!campaign?.id) return 'Подарок пока не создан';
  const channelName = getReadableChannelName(campaign.requiredChatId || campaign.channelId);
  return [
    `Канал: ${channelName}`,
    `Подарок: ${campaign.title || 'Подарок к посту'}`,
    'Выдача: только в личные сообщения после проверки подписки',
    `Сообщение получателю: ${campaign.giftMessage || 'по умолчанию'}`
  ].join('\n');
}

function getExistingGiftCampaignForTarget(targetPost = null) {
  if (!targetPost?.channelId || !targetPost?.postId) return null;
  return findGiftCampaignForPost({ channelId: targetPost.channelId, postId: targetPost.postId, commentKey: targetPost.commentKey });
}

async function repatchGiftTargetPost(targetPost = null, config = {}) {
  if (!targetPost?.commentKey) return { ok: false, skipped: true, reason: 'target_comment_key_missing' };
  return patchStoredPost({
    botToken: config.botToken,
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    commentKey: targetPost.commentKey
  });
}


function makeUniqueGiftCampaignId(base) {
  let candidate = normalizeKey(String(base || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_'));
  if (!candidate || candidate.length < 3) {
    candidate = `gift_${Date.now().toString(36)}`;
  }
  if (!getGiftCampaign(candidate)) return candidate;
  let index = 2;
  while (getGiftCampaign(`${candidate}_${index}`)) {
    index += 1;
  }
  return `${candidate}_${index}`;
}

function ensureGiftDraftIdentity(draft = {}, targetPost = null) {
  const nextDraft = { ...(draft || {}) };
  const normalizedPostId = String(targetPost?.postId || '').trim();
  const preview = getGiftPostPreview(targetPost, normalizedPostId || 'Пост');
  if (!nextDraft.id) {
    const suffix = normalizedPostId ? normalizedPostId.slice(-8) : Date.now().toString(36);
    nextDraft.id = makeUniqueGiftCampaignId(`gift_${suffix}`);
  }
  if (!nextDraft.title) {
    nextDraft.title = `Подарок к посту (${preview})`;
  }
  return nextDraft;
}


function buildQuickGiftFlowFromTarget(targetPost, currentFlow = null) {
  const draftWithTarget = applyGiftTargetToDraft(currentFlow || { draft: {} }, targetPost)?.draft || {};
  const draft = ensureGiftDraftIdentity(draftWithTarget, targetPost);
  const stepIndex = getResolvedGiftStepIndex(0, draft);
  return {
    type: 'gift_campaign_wizard',
    draft,
    stepIndex,
    awaitingConfirmation: stepIndex >= GIFT_WIZARD_STEPS.length,
    quickStart: true,
    targetBound: true
  };
}

async function sendGiftTargetMenu({ config, message, targetPost, note = '', includeCurrentCampaign = false }) {
  const lines = [];
  if (note) lines.push(String(note).trim());
  if (targetPost) {
    lines.push('Выбран пост:');
    lines.push(describeGiftTargetPost(targetPost));
  }
  if (!lines.length) {
    lines.push('Выберите действие ниже.');
  }
  return replyToUser({
    config,
    message,
    text: lines.join('\n'),
    attachments: buildGiftMainMenuKeyboard(config, { flow: getGiftFlow(getSenderUserId(message)), targetPost })
  });
}

async function repatchPostsForCampaign(campaign, config) {
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
    results.push(result);
  }
  return {
    total: posts.length,
    patched: results.filter((item) => item?.ok && !item?.skipped).length,
    skipped: results.filter((item) => item?.skipped).length,
    failed: results.filter((item) => !item?.ok).length
  };
}

async function handleGiftAdminCommand(message, config) {
  const userId = getSenderUserId(message);
  const userName = getSenderFirstName(message);
  const text = getMessageText(message).trim();
  const attachmentCandidates = getGiftAssetAttachmentCandidates(message);
  const rawAttachments = getMessageAttachments(message);
  const { command, argsText } = parseCommand(text);
  let flow = getGiftFlow(userId);

  logVerbose(config, "GIFT INPUT", {
    userId,
    text,
    hasFlow: Boolean(flow),
    flowStep: Number(flow?.stepIndex || 0),
    rawAttachments: rawAttachments.map((item) => ({
      type: String(item?.type || item?.kind || item?.attachment_type || '').trim(),
      token: String(getAttachmentToken(item) || '').trim(),
      fileName: String(getAttachmentFileName(item) || '').trim()
    })),
    attachmentCandidates: attachmentCandidates.map((item) => ({
      type: item.type,
      rawType: item.rawType,
      token: String(item.token || '').trim(),
      fileName: String(item.fileName || '').trim()
    }))
  });

  const helpText = [
    `Привет, ${userName || "администратор"}.`,
    "Основной сценарий теперь работает через кнопки.",
    "1. Откройте раздел «Подарки».",
    "2. Перешлите пост боту или выберите его из «Последних постов».",
    "3. Нажмите «Создать подарок» и загрузите файл.",
    "",
    "Текстовые команды остаются как запасной вариант:",
    "Авторизация не требуется",
    "/gift_new — быстрый старт мастера по выбранному посту",
    "/gift_save — сохранить текущий черновик",
    "/gift_cancel — отменить текущий черновик"
  ].join("\n");

  if (command === "/gift" || command === "/gift_help") {
    await sendSectionMenu({ config, message, section: 'gifts', note: helpText });
    return { ok: true, action: "gift_help" };
  }

  if (command === "/gift_login") {
    setSetupState(userId, { giftAdminAuthorized: true, giftAdminAuthorizedAt: Date.now() });
    await sendSectionMenu({ config, message, section: 'main', note: "Дополнительная авторизация не требуется." });
    return { ok: true, action: "gift_login_not_required" };
  }

  const needsAdmin = [
    "/gift_new",
    "/gift_create",
    "/gift_list",
    "/gift_show",
    "/gift_patch",
    "/gift_target",
    "/gift_target_clear",
    "/gift_save",
    "/gift_cancel",
    "/gift_skip",
    "/gift_limits",
    "/gift_limit_size",
    "/gift_limit_types",
    "/gift_limit_ext",
    "/gift_limit_files",
    "/gift_limit_on",
    "/gift_limit_off",
    "/gift_limit_reset"
  ].includes(command) || Boolean(flow);

  if (needsAdmin && !isGiftAdminAuthorized(config, userId)) {
    await replyToUser({
      config,
      message,
      text: "Дополнительная авторизация не требуется"
    });
    return { ok: true, action: "gift_admin_required" };
  }

  if (command === "/gift_target") {
    const targetPost = getActiveTargetPost(userId);
    if (targetPost) {
      await sendGiftTargetMenu({
        config,
        message,
        targetPost,
        note: 'Сейчас выбран этот пост для подарка.'
      });
    } else {
      await sendRecentPostsMenu({
        config,
        message,
        page: 0,
        note: 'Пост для подарка пока не выбран. Перешлите пост боту или выберите его из последних.'
      });
    }
    return { ok: true, action: "gift_target_show" };
  }

  if (command === "/gift_target_clear") {
    clearGiftTargetPost(userId);
    await sendRecentPostsMenu({
      config,
      message,
      page: 0,
      note: 'Выбранный пост сброшен. Выберите новый пост для подарка.'
    });
    return { ok: true, action: "gift_target_clear" };
  }

  if (command === "/gift_limits") {
    await replyToUser({
      config,
      message,
      text: ["Текущие ограничения на загрузку подарков:", buildGiftLimitsSummary(config)].join("\n"),
      attachments: buildGiftMainMenuKeyboard(config, { flow, targetPost: getGiftTargetPost(userId) })
    });
    return { ok: true, action: "gift_limits" };
  }

  if (command === "/gift_limit_on" || command === "/gift_limit_off") {
    const enabled = command === "/gift_limit_on";
    saveGiftSettings({ uploadLimits: { ...getGiftUploadLimits(config), enabled } });
    await replyToUser({
      config,
      message,
      text: [
        `Загрузка файлов ${enabled ? "включена" : "выключена"}.`,
        buildGiftLimitsSummary(config)
      ].join("\n")
    });
    return { ok: true, action: enabled ? "gift_limit_on" : "gift_limit_off" };
  }

  if (command === "/gift_limit_reset") {
    saveGiftSettings({ uploadLimits: { ...(config?.giftUploadDefaults || getGiftUploadLimits(config)) } });
    await replyToUser({
      config,
      message,
      text: ["Ограничения на загрузку сброшены к значениям по умолчанию:", buildGiftLimitsSummary(config)].join("\n")
    });
    return { ok: true, action: "gift_limit_reset" };
  }

  if (command === "/gift_limit_size") {
    const sizeMb = Number(String(argsText || "").replace(",", "."));
    if (!Number.isFinite(sizeMb) || sizeMb <= 0) {
      await replyToUser({ config, message, text: "Укажите размер в мегабайтах. Пример: /gift_limit_size 25" });
      return { ok: true, action: "gift_limit_size_invalid" };
    }
    saveGiftSettings({ uploadLimits: { ...getGiftUploadLimits(config), maxBytes: Math.round(sizeMb * 1024 * 1024) } });
    await replyToUser({
      config,
      message,
      text: ["Новый лимит размера файла сохранён:", buildGiftLimitsSummary(config)].join("\n")
    });
    return { ok: true, action: "gift_limit_size" };
  }

  if (command === "/gift_limit_files") {
    const maxFiles = Number(String(argsText || "").trim());
    if (!Number.isFinite(maxFiles) || maxFiles <= 0) {
      await replyToUser({ config, message, text: "Укажите количество файлов. Пример: /gift_limit_files 1" });
      return { ok: true, action: "gift_limit_files_invalid" };
    }
    saveGiftSettings({ uploadLimits: { ...getGiftUploadLimits(config), maxFiles: Math.floor(maxFiles) } });
    await replyToUser({
      config,
      message,
      text: ["Новый лимит количества файлов сохранён:", buildGiftLimitsSummary(config)].join("\n")
    });
    return { ok: true, action: "gift_limit_files" };
  }

  if (command === "/gift_limit_types") {
    const normalized = String(argsText || "").trim();
    const allowedTypes = !normalized || normalized === "*" || /^all$/i.test(normalized)
      ? []
      : normalized.split(",").map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
    saveGiftSettings({ uploadLimits: { ...getGiftUploadLimits(config), allowedTypes } });
    await replyToUser({
      config,
      message,
      text: ["Новый список типов сохранён:", buildGiftLimitsSummary(config)].join("\n")
    });
    return { ok: true, action: "gift_limit_types" };
  }

  if (command === "/gift_limit_ext") {
    const normalized = String(argsText || "").trim();
    const allowedExtensions = !normalized || normalized === "*" || /^all$/i.test(normalized)
      ? []
      : normalized.split(",").map((item) => String(item || "").trim().toLowerCase().replace(/^\./, "")).filter(Boolean);
    saveGiftSettings({ uploadLimits: { ...getGiftUploadLimits(config), allowedExtensions } });
    await replyToUser({
      config,
      message,
      text: ["Новый список расширений сохранён:", buildGiftLimitsSummary(config)].join("\n")
    });
    return { ok: true, action: "gift_limit_ext" };
  }

  if (command === "/gift_list") {
    const campaigns = listGiftCampaigns();
    if (!campaigns.length) {
      await replyToUser({ config, message, text: "Пока нет ни одного подарка. Сначала выберите пост и нажмите «Создать подарок».", attachments: buildGiftMainMenuKeyboard(config) });
      return { ok: true, action: "gift_list_empty" };
    }

    const lines = campaigns.slice(0, 20).map((item) => {
      const postsLabel = item.postIds?.length ? item.postIds.join(",") : "all";
      const deliveryLabel = item.giftAttachment ? `file:${getAttachmentFileName(item.giftAttachment) || item.giftAttachment.type}` : (item.giftUrl ? "link" : "none");
      return `• ${item.id} — ${item.title} | channelId=${item.channelId} | postIds=${postsLabel} | delivery=${deliveryLabel} | ${item.enabled ? "on" : "off"}`;
    });

    await replyToUser({ config, message, text: ["Список подарков:", ...lines].join("\n"), attachments: buildGiftMainMenuKeyboard(config) });
    return { ok: true, action: "gift_list" };
  }

  if (command === "/gift_show") {
    const campaignId = normalizeKey(argsText);
    if (!campaignId) {
      await replyToUser({ config, message, text: "Пришлите ID кампании: /gift_show spring_bonus" });
      return { ok: true, action: "gift_show_missing_id" };
    }
    const campaign = getGiftCampaign(campaignId);
    if (!campaign) {
      await replyToUser({ config, message, text: "Кампания не найдена" });
      return { ok: true, action: "gift_show_not_found" };
    }
    await replyToUser({ config, message, text: buildGiftCampaignPreview(campaign) });
    return { ok: true, action: "gift_show" };
  }

  if (command === "/gift_patch") {
    const campaignId = normalizeKey(argsText);
    if (!campaignId) {
      await replyToUser({ config, message, text: "Пришлите ID кампании: /gift_patch spring_bonus" });
      return { ok: true, action: "gift_patch_missing_id" };
    }
    const campaign = getGiftCampaign(campaignId);
    if (!campaign) {
      await replyToUser({ config, message, text: "Кампания не найдена" });
      return { ok: true, action: "gift_patch_not_found" };
    }
    const repatch = await repatchPostsForCampaign(campaign, config);
    await replyToUser({
      config,
      message,
      text: `Перепатчено постов: ${repatch.patched}. Пропущено: ${repatch.skipped}. Ошибок: ${repatch.failed}. Всего проверено: ${repatch.total}.`
    });
    return { ok: true, action: "gift_patch" };
  }

  if (command === "/gift_new" || command === "/gift_create") {
    const targetPost = getActiveTargetPost(userId);
    if (!targetPost?.channelId || !targetPost?.postId) {
      await sendRecentPostsMenu({
        config,
        message,
        page: 0,
        note: 'Сначала выберите пост для подарка. Можно переслать пост боту или выбрать его из списка.'
      });
      return { ok: true, action: "gift_new_without_target" };
    }

    const existingCampaign = findGiftCampaignForPost({ channelId: targetPost.channelId, postId: targetPost.postId, commentKey: targetPost.commentKey });
    if (existingCampaign) {
      await sendSectionMenu({
        config,
        message,
        section: 'gifts',
        note: ['Для этого поста уже сохранён подарок:', '', buildGiftCampaignSummary(existingCampaign)].join('\n'),
        editCurrent: true
      });
      return { ok: true, action: 'gift_new_existing_campaign' };
    }

    const seeded = buildQuickGiftFlowFromTarget(targetPost);
    if (argsText && String(argsText).trim()) {
      seeded.draft.title = String(argsText).trim();
      seeded.stepIndex = getResolvedGiftStepIndex(0, seeded.draft || {});
      seeded.awaitingConfirmation = seeded.stepIndex >= GIFT_WIZARD_STEPS.length;
    }
    const seededWithAnchor = { ...seeded, anchorMessageId: String(getMessageId(message) || getLatestBotMessageId(userId) || '').trim() };
    setGiftFlow(userId, seededWithAnchor);

    if (seededWithAnchor.awaitingConfirmation) {
      await upsertGiftFlowMessage({ config, message, flow: seededWithAnchor, text: buildGiftCampaignPreview(normalizeGiftDraft(seededWithAnchor), { targetPost }), attachments: buildGiftAdminActionsKeyboard(config, seededWithAnchor, targetPost), editCurrent: true });
    } else {
      await upsertGiftFlowMessage({
        config,
        message,
        text: [
          `Пост для подарка: ${getGiftPostPreview(targetPost)}.`,
          '',
          buildGiftWizardPrompt(seededWithAnchor.stepIndex, seededWithAnchor.draft, config)
        ].join('\n'),
        attachments: buildGiftAdminActionsKeyboard(config, seededWithAnchor, targetPost),
        editCurrent: true
      });
    }
    return { ok: true, action: "gift_new_started", stepIndex: seeded.stepIndex };
  }

  if (command === "/gift_cancel") {
    clearGiftFlow(userId);
    await replyToUser({ config, message, text: "Создание подарка отменено" });
    return { ok: true, action: "gift_cancel" };
  }

  if (!flow) {
    return { ok: true, skipped: true, reason: "no_gift_command" };
  }

  if (command === "/gift_skip") {
    const currentStep = GIFT_WIZARD_STEPS[flow.stepIndex];
    if (!currentStep || currentStep.required) {
      await upsertGiftFlowMessage({ config, message, flow, text: "Этот шаг нельзя пропустить", attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)), editCurrent: true });
      return { ok: true, action: "gift_skip_denied" };
    }

    const nextDraft = { ...(flow.draft || {}), [currentStep.key]: currentStep.transform ? currentStep.transform("") : "" };
    const nextFlow = {
      ...flow,
      draft: nextDraft,
      stepIndex: getResolvedGiftStepIndex(flow.stepIndex + 1, nextDraft)
    };

    if (nextFlow.stepIndex >= GIFT_WIZARD_STEPS.length) {
      nextFlow.awaitingConfirmation = true;
      setGiftFlow(userId, nextFlow);
      await upsertGiftFlowMessage({ config, message, flow: nextFlow, text: buildGiftCampaignPreview(normalizeGiftDraft(nextFlow), { targetPost: getGiftTargetPost(getSenderUserId(message)) }), attachments: buildGiftAdminActionsKeyboard(config, nextFlow, getGiftTargetPost(getSenderUserId(message))), editCurrent: true });
      return { ok: true, action: "gift_skip_to_confirm" };
    }

    setGiftFlow(userId, nextFlow);
    await upsertGiftFlowMessage({ config, message, flow: nextFlow, text: buildGiftWizardPrompt(nextFlow.stepIndex, nextFlow.draft, config), attachments: buildGiftAdminActionsKeyboard(config, nextFlow, getGiftTargetPost(userId)), editCurrent: true });
    return { ok: true, action: "gift_skip" };
  }

  if (command === "/gift_save" || (flow.awaitingConfirmation && ["сохранить", "save"].includes(text.toLowerCase()))) {
    if (!flow.awaitingConfirmation) {
      const currentStep = GIFT_WIZARD_STEPS[flow.stepIndex];
      if (currentStep?.key === 'giftMessage') {
        const nextFlow = { ...flow, draft: { ...(flow.draft || {}), giftMessage: '' }, awaitingConfirmation: true, stepIndex: GIFT_WIZARD_STEPS.length };
        setGiftFlow(userId, nextFlow);
        flow = nextFlow;
      } else {
        await upsertGiftFlowMessage({ config, message, flow, text: "Сейчас нечего сохранять. Сначала выберите пост и добавьте подарок.", attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)), editCurrent: true });
        return { ok: true, action: "gift_save_without_flow" };
      }
    }

    const campaignDraft = normalizeGiftDraft(flow);
    if (!campaignDraft.id || !campaignDraft.title || !campaignDraft.channelId || (!campaignDraft.giftUrl && !campaignDraft.giftAttachment)) {
      await upsertGiftFlowMessage({ config, message, flow, text: "Не все обязательные поля заполнены. Используйте /gift_cancel и начните заново.", attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)), editCurrent: true });
      return { ok: true, action: "gift_save_invalid_draft" };
    }

    const campaign = saveGiftCampaign(campaignDraft);
    const repatch = await repatchPostsForCampaign(campaign, config);
    clearGiftFlow(userId);

    await sendSectionMenu({
      config,
      message,
      section: 'gifts',
      note: `Подарок привязан к посту (${String(campaign.title || '').replace(/^Подарок к посту \(|\)$/g, '') || 'без названия'}).`,
      editCurrent: true
    });
    return { ok: true, action: "gift_saved", campaignId: campaign.id };
  }

  if (flow.awaitingConfirmation) {
    await upsertGiftFlowMessage({ config, message, flow, text: "Шаг 4/4. Проверьте подарок и нажмите «Сохранить».", attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)), editCurrent: true });
    return { ok: true, action: "gift_waiting_confirmation" };
  }

  const currentStep = GIFT_WIZARD_STEPS[flow.stepIndex];
  if (!currentStep) {
    clearGiftFlow(userId);
    await upsertGiftFlowMessage({ config, message, flow, text: "Состояние мастера сбилось. Запустите /gift_new заново.", attachments: buildGiftMainMenuKeyboard(config, { targetPost: getGiftTargetPost(userId) }), editCurrent: true });
    return { ok: true, action: "gift_flow_corrupted" };
  }

  if (currentStep.key === "giftAsset" && !attachmentCandidates.length && rawAttachments.length && !normalizedValue) {
    await upsertGiftFlowMessage({
      config,
      message,
      flow,
      text: "Не удалось распознать файл или ссылку как подарок. Пришлите подарок как документ/изображение или вставьте прямую ссылку на подарок.",
      attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)),
      editCurrent: true
    });
    return { ok: true, action: "gift_attachment_unrecognized_format", attachmentTypes: rawAttachments.map((item) => String(item?.type || item?.kind || item?.attachment_type || '').trim()).filter(Boolean) };
  }

  if (currentStep.key === "giftAsset" && attachmentCandidates.length) {
    const limits = getGiftUploadLimits(config);
    if (attachmentCandidates.length > limits.maxFiles) {
      await upsertGiftFlowMessage({
        config,
        message,
        flow,
        text: `Можно загрузить не более ${limits.maxFiles} файла(ов) за раз. Сейчас получено: ${attachmentCandidates.length}.`,
        attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)),
        editCurrent: true
      });
      return { ok: true, action: "gift_too_many_files" };
    }

    const candidate = attachmentCandidates[0];
    logVerbose(config, "GIFT ATTACHMENT RECEIVED", { userId, flowStep: flow?.stepIndex, candidate, rawAttachmentTypes: rawAttachments.map((item) => String(item?.type || item?.kind || item?.attachment_type || '').trim()) });
    const validation = validateGiftAttachment(candidate, config);
    if (!validation.ok) {
      await upsertGiftFlowMessage({
        config,
        message,
        flow,
        text: `${validation.error}
${buildGiftLimitsSummary(config)}`,
        attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(getSenderUserId(message))),
        editCurrent: true
      });
      return { ok: true, action: "gift_attachment_invalid" };
    }

    const nextDraft = {
      ...(flow.draft || {}),
      giftAttachment: candidate,
      giftUrl: ""
    };
    const nextStepIndex = getResolvedGiftStepIndex(flow.stepIndex + 1, nextDraft);
    const nextFlow = rememberFlowCleanupMessageIds({
      ...flow,
      draft: nextDraft,
      stepIndex: nextStepIndex,
      awaitingConfirmation: nextStepIndex >= GIFT_WIZARD_STEPS.length
    }, [...getMessageIdCandidates(message), getGiftFlowAnchorMessageId(flow, userId), getLatestBotMessageId(userId)]);
    setGiftFlow(userId, nextFlow);

    if (nextFlow.awaitingConfirmation) {
      await sendFreshGiftFlowMessage({
        config,
        message,
        previousFlow: flow,
        nextFlow,
        text: buildGiftCampaignPreview(normalizeGiftDraft(nextFlow), { targetPost: getGiftTargetPost(getSenderUserId(message)) }),
        attachments: buildGiftAdminActionsKeyboard(config, nextFlow, getGiftTargetPost(getSenderUserId(message)))
      });
      await deleteIncomingUserMessageIfPossible(config, message);
      return { ok: true, action: "gift_attachment_ready_to_save" };
    }

    await sendFreshGiftFlowMessage({
      config,
      message,
      previousFlow: flow,
      nextFlow,
      text: buildGiftWizardPrompt(nextStepIndex, nextDraft, config),
      attachments: buildGiftAdminActionsKeyboard(config, nextFlow, getGiftTargetPost(getSenderUserId(message)))
    });
    await deleteIncomingUserMessageIfPossible(config, message);
    return { ok: true, action: "gift_attachment_next_step", stepIndex: nextStepIndex };
  }

  const rawValue = text;
  const normalizedValue = currentStep.transform ? currentStep.transform(rawValue) : String(rawValue || "").trim();

  if (currentStep.required) {
    const empty = Array.isArray(normalizedValue) ? normalizedValue.length === 0 : !String(normalizedValue || "").trim();
    if (empty) {
      await upsertGiftFlowMessage({ config, message, flow, text: `Поле обязательно. ${buildGiftWizardPrompt(flow.stepIndex, flow.draft, config)}`, attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)), editCurrent: true });
      return { ok: true, action: "gift_step_required_retry" };
    }
  }

  if (currentStep.key === "subscribeUrl") {
    if (normalizedValue && !isLikelyUrl(normalizedValue)) {
      await upsertGiftFlowMessage({ config, message, flow, text: "Ожидается полная ссылка, начинающаяся с http:// или https://", attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)), editCurrent: true });
      return { ok: true, action: "gift_invalid_subscribe_url" };
    }
  }

  if (currentStep.key === "giftAsset") {
    if (!normalizedValue && !rawAttachments.length) {
      await upsertGiftFlowMessage({
        config,
        message,
        flow,
        text: [
          'Шаг 2/4. Бот пока не увидел вложение в этом сообщении.',
          'Попробуйте отправить подарок как документ или вставить прямую ссылку.',
          '',
          buildGiftWizardPrompt(flow.stepIndex, flow.draft, config)
        ].join('\n'),
        attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)),
        editCurrent: true
      });
      return { ok: true, action: "gift_asset_missing_in_message" };
    }
    if (!isLikelyUrl(normalizedValue)) {
      await upsertGiftFlowMessage({
        config,
        message,
        flow,
        text: "Ссылка не распознана как подходящая. Пришлите файл подарка или прямую ссылку, которая начинается с http:// или https://.",
        attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)),
        editCurrent: true
      });
      return { ok: true, action: "gift_invalid_asset_source" };
    }
  }

  if (currentStep.key === "id") {
    if (!normalizedValue || String(normalizedValue).length < 3) {
      await upsertGiftFlowMessage({ config, message, flow, text: "ID кампании должен быть не короче 3 символов и состоять из латиницы, цифр, - или _.", attachments: buildGiftAdminActionsKeyboard(config, flow, getGiftTargetPost(userId)), editCurrent: true });
      return { ok: true, action: "gift_invalid_id" };
    }
  }

  const nextDraft = { ...(flow.draft || {}) };
  if (currentStep.key === "giftAsset") {
    nextDraft.giftUrl = normalizedValue;
    nextDraft.giftAttachment = null;
  } else {
    nextDraft[currentStep.key] = normalizedValue;
  }

  const nextStepIndex = getResolvedGiftStepIndex(flow.stepIndex + 1, nextDraft);
  const nextFlow = rememberFlowCleanupMessageIds({
    ...flow,
    draft: nextDraft,
    stepIndex: nextStepIndex,
    awaitingConfirmation: nextStepIndex >= GIFT_WIZARD_STEPS.length
  }, [...getMessageIdCandidates(message), getGiftFlowAnchorMessageId(flow, userId), getLatestBotMessageId(userId)]);
  setGiftFlow(userId, nextFlow);

  if (nextFlow.awaitingConfirmation) {
    await sendFreshGiftFlowMessage({
      config,
      message,
      previousFlow: flow,
      nextFlow,
      text: buildGiftCampaignPreview(normalizeGiftDraft(nextFlow), { targetPost: getGiftTargetPost(getSenderUserId(message)) }),
      attachments: buildGiftAdminActionsKeyboard(config, nextFlow, getGiftTargetPost(getSenderUserId(message)))
    });
    await deleteIncomingUserMessageIfPossible(config, message);
    return { ok: true, action: "gift_flow_ready_to_save" };
  }

  await sendFreshGiftFlowMessage({
    config,
    message,
    previousFlow: flow,
    nextFlow,
    text: buildGiftWizardPrompt(nextStepIndex, nextDraft, config),
    attachments: buildGiftAdminActionsKeyboard(config, nextFlow, getGiftTargetPost(getSenderUserId(message)))
  });
  await deleteIncomingUserMessageIfPossible(config, message);
  return { ok: true, action: "gift_flow_next_step", stepIndex: nextStepIndex };
}


async function handleCommentAdminInput(message, config) {
  const userId = getSenderUserId(message);
  const userName = getSenderFirstName(message);
  const flow = getCommentAdminFlow(userId);
  if (!flow?.mode) return { ok: true, skipped: true, reason: 'no_comment_admin_flow' };

  const text = getMessageText(message).trim();
  const extractedUrl = extractUrlFromMessage(message).trim();
  const incomingMessageIds = getMessageIdCandidates(message);
  const incomingMessageId = String(incomingMessageIds[0] || '').trim();
  const targetPost = flow.targetPost || getCommentTargetPost(userId) || getGiftTargetPost(userId);
  if (!targetPost?.commentKey) {
    clearCommentAdminFlow(userId);
    await upsertBotMessage({ config, message, text: 'Сначала выберите или перешлите пост.', attachments: buildCommentsPostAdminKeyboard(null), editCurrent: true });
    return { ok: true, action: 'comment_admin_missing_post' };
  }

  if (flow.mode === 'edit_text') {
    if (!text) {
      await upsertBotMessage({ config, message, text: buildPostEditPrompt(targetPost), attachments: buildCommentsPostAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comment_admin_edit_text_retry' };
    }
    try {
      const nextLink = getMessageLink(message);
      const nextFormat = getMessageFormat(message);
      await editPostText({ commentKey: targetPost.commentKey, text, link: nextLink, format: nextFormat, actorId: userId, actorName: userName, config });
      await deleteIncomingUserMessageIfPossible(config, message);
      await cleanupCommentFlowArtifacts(config, rememberFlowCleanupMessageIds(flow, [...incomingMessageIds, getCommentFlowAnchorMessageId(flow, userId), getLatestBotMessageId(userId)]), userId);
      await flushPendingDeleteMessageIds(config, userId);
      clearCommentAdminFlow(userId);
      setCommentTargetPost(userId, { ...targetPost, originalText: text, originalLink: nextLink, originalFormat: nextFormat });
      setGiftTargetPost(userId, buildGiftTargetPostRecord({ ...targetPost, originalText: text }));
      const commentsEnabled = !Boolean((getPost(targetPost.commentKey) || {}).commentsDisabled);
      await sendFreshAdminMessage({ config, message, text: commentsEnabled ? 'Текст поста обновлён. Медиа, ссылка и кнопка комментариев сохранены.' : 'Текст поста обновлён. Медиа и ссылка сохранены. Комментарии для этого поста остаются выключенными.', attachments: buildCommentsPostAdminKeyboard({ ...targetPost, originalText: text }) });
      return { ok: true, action: 'comment_admin_edit_text_saved' };
    } catch (error) {
      await upsertBotMessage({ config, message, text: `Не удалось изменить текст поста: ${error?.message || 'ошибка'}`, attachments: buildCommentsPostAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comment_admin_edit_text_failed' };
    }
  }

  if (flow.mode === 'button_text') {
    const hasLinkPayload = messageContainsUrlOrPreview(message);
    if (!text && !hasLinkPayload) {
      await upsertBotMessage({ config, message, text: 'Шаг 1/3. Напишите текст дополнительной кнопки.', attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comment_admin_button_text_retry' };
    }
    if (hasLinkPayload || isLikelyUrl(extractedUrl)) {
      await upsertBotMessage({ config, message, text: 'Сначала пришлите текст кнопки, а уже следующим сообщением — ссылку для неё.', attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comment_admin_button_text_expected' };
    }
    const nextFlow = rememberFlowCleanupMessageIds({ ...flow, mode: 'button_url', targetPost, buttonDraft: { ...(flow.buttonDraft || {}), text, edit: Boolean(flow.buttonDraft?.edit), rowIndex: flow.buttonDraft?.rowIndex, buttonIndex: flow.buttonDraft?.buttonIndex } }, [...incomingMessageIds, getCommentFlowAnchorMessageId(flow, userId), getLatestBotMessageId(userId)]);
    await sendFreshCommentFlowMessage({ config, message, previousFlow: flow, nextFlow, text: `Шаг 2/3. Пришлите ссылку для кнопки «${text}».`, attachments: buildCommentsButtonsAdminKeyboard(targetPost) });
    await deleteIncomingUserMessageIfPossible(config, message);
    return { ok: true, action: 'comment_admin_button_await_url' };
  }

  if (flow.mode === 'button_url') {
    const urlText = String(extractedUrl || normalizePossibleUrl(getMessageText(message)) || findFirstUrlDeep(message) || '').trim();
    if (!/^https?:\/\//i.test(urlText)) {
      await upsertBotMessage({ config, message, text: 'Шаг 2/3. Пришлите полную ссылку, начинающуюся с http:// или https://', attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comment_admin_button_url_retry' };
    }
    try {
      const currentPost = getPost(targetPost.commentKey) || {};
      const currentBuilder = getCanonicalCustomKeyboardBuilder(currentPost);
      const rows = Array.isArray(currentBuilder.rows) ? JSON.parse(JSON.stringify(currentBuilder.rows)) : [];
      const buttonText = String(flow.buttonDraft?.text || 'Кнопка').trim();
      let savedButtonMeta = { text: buttonText, rowIndex: 0, buttonIndex: 0 };
      if (flow.buttonDraft?.edit && Number.isInteger(flow.buttonDraft?.rowIndex) && Number.isInteger(flow.buttonDraft?.buttonIndex) && rows[flow.buttonDraft.rowIndex]?.buttons?.[flow.buttonDraft.buttonIndex]) {
        rows[flow.buttonDraft.rowIndex].buttons[flow.buttonDraft.buttonIndex] = { ...rows[flow.buttonDraft.rowIndex].buttons[flow.buttonDraft.buttonIndex], text: buttonText, url: urlText, type: 'link' };
        savedButtonMeta = { text: buttonText, rowIndex: flow.buttonDraft.rowIndex, buttonIndex: flow.buttonDraft.buttonIndex };
      } else {
        rows.push({ buttons: [{ text: buttonText, url: urlText, type: 'link' }] });
        savedButtonMeta = { text: buttonText, rowIndex: rows.length - 1, buttonIndex: 0 };
      }
      const saveResult = await savePostKeyboard({ commentKey: targetPost.commentKey, builder: { ...currentBuilder, rows }, actorId: userId, actorName: userName, config });
      const freshTargetPost = getFreshTargetPost({ ...targetPost, ...(saveResult?.post || {}) });
      setCommentTargetPost(userId, freshTargetPost);
      setGiftTargetPost(userId, buildGiftTargetPostRecord(freshTargetPost));
      await deleteIncomingUserMessageIfPossible(config, message);
      const cleanupFlow = rememberFlowCleanupMessageIds(flow, [...incomingMessageIds, getCommentFlowAnchorMessageId(flow, userId), getLatestBotMessageId(userId), ...(getTrackedAdminMessageIds(userId) || [])]);
      await cleanupCommentFlowArtifacts(config, cleanupFlow, userId);
      await flushPendingDeleteMessageIds(config, userId);
      clearCommentAdminFlow(userId);
      const savedText = flow.buttonDraft?.edit ? 'Шаг 3/3. Кнопка обновлена.' : 'Шаг 3/3. Кнопка добавлена.';
      const allButtons = flattenCustomButtons(freshTargetPost);
      const buttonLines = allButtons.length ? `\n\nКнопки под постом:\n${allButtons.map((item, index) => `${index + 1}. ${item.text}`).join('\n')}` : '';
      const savedResult = await sendFreshAdminMessage({ config, message, text: `${savedText}
Текст: ${buttonText}
Ссылка: ${urlText}${buttonLines}`, attachments: buildCommentsButtonSavedKeyboard(freshTargetPost, savedButtonMeta) });
      const savedMessageId = String(extractSentMessageId(savedResult) || getLatestBotMessageId(userId) || '').trim();
      await finalizeActiveAdminMessage({ config, userId, activeMessageId: savedMessageId, deleteIds: [...(cleanupFlow.cleanupMessageIds || []), ...getTrackedAdminMessageIds(userId)] });
      await flushPendingDeleteMessageIds(config, userId);
      return { ok: true, action: 'comment_admin_button_saved' };
    } catch (error) {
      await upsertBotMessage({ config, message, text: `Не удалось сохранить кнопку: ${error?.message || 'ошибка'}`, attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comment_admin_button_failed' };
    }
  }

  if (flow.mode === 'button_edit_text') {
    if (!text) {
      await upsertBotMessage({ config, message, text: 'Шаг 1/3. Напишите новый текст кнопки.', attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comment_admin_button_edit_text_retry' };
    }
    const nextFlow = rememberFlowCleanupMessageIds({ ...flow, mode: 'button_url', targetPost, buttonDraft: { ...(flow.buttonDraft || {}), text, edit: true } }, [...incomingMessageIds, getCommentFlowAnchorMessageId(flow, userId), getLatestBotMessageId(userId)]);
    await sendFreshCommentFlowMessage({ config, message, previousFlow: flow, nextFlow, text: 'Шаг 2/3. Теперь пришлите новую ссылку для этой кнопки.', attachments: buildCommentsButtonsAdminKeyboard(targetPost) });
    await deleteIncomingUserMessageIfPossible(config, message);
    return { ok: true, action: 'comment_admin_button_edit_await_url' };
  }

  return { ok: true, skipped: true, reason: 'unsupported_comment_admin_flow' };
}

async function handleStart(message, config) {
  logInfo(config, "START", {
    userId: getSenderUserId(message),
    firstName: getSenderFirstName(message),
    recipientChatId: getRecipientChatId(message),
    recipientChatType: getRecipientChatType(message)
  });

  const userId = getSenderUserId(message);
  // Deep-link /start menu с посадочной страницы должен ВСЕГДА давать видимое меню.
  // После ручной очистки истории в MAX старый latestBotMessageId может редактироваться
  // на сервере, но не появляться у пользователя, поэтому здесь отправляем fresh-сообщение.
  if (shouldSkipMenuForUser(userId)) {
    return { ok: true, action: "start_menu_deduped", appBaseUrl: config.appBaseUrl };
  }
  const result = await replyFreshBotMessage({
    config,
    message,
    text: buildAdminMenuText({ userName: getSenderFirstName(message) }),
    attachments: await buildAdminMainMenuAttachments(config)
  });
  const sentMessageId = String(extractSentMessageId(result) || '').trim();
  if (sentMessageId) await finalizeActiveAdminMessage({ config, userId, activeMessageId: sentMessageId, deleteIds: [] });
  rememberAdminScreen(userId, { section: 'main', backAction: 'admin_section_main', rootAction: 'admin_section_main' });
  markMenuShownForUser(userId);
  return { ok: true, action: "start_menu_fresh_shown", appBaseUrl: config.appBaseUrl };
}

async function handleBotStarted(update, config) {
  const userId = String(
    update?.user?.user_id ||
    update?.user?.id ||
    update?.sender?.user_id ||
    update?.sender?.id ||
    update?.recipient?.user_id ||
    update?.recipient?.id ||
    ''
  ).trim();
  const userName = String(
    update?.user?.first_name ||
    update?.user?.name ||
    update?.sender?.first_name ||
    update?.sender?.name ||
    'администратор'
  ).trim();

  if (!userId) {
    return { ok: true, skipped: true, reason: 'bot_started_without_user' };
  }

  if (shouldSkipMenuForUser(userId)) {
    return { ok: true, action: 'bot_started_menu_deduped' };
  }

  // bot_started может прийти после ручной очистки истории. Не редактируем старый
  // latestBotMessageId: MAX может принять edit, но удалённое у пользователя сообщение
  // не появится снова. Поэтому отправляем новое видимое меню.
  const result = await sendMessage({
    botToken: config.botToken,
    userId,
    text: buildAdminMenuText({ userName }),
    attachments: await buildAdminMainMenuAttachments(config)
  });
  const sentMessageId = String(extractSentMessageId(result) || '').trim();
  if (sentMessageId) await finalizeActiveAdminMessage({ config, userId, activeMessageId: sentMessageId, deleteIds: [] });
  rememberAdminScreen(userId, { section: 'main', backAction: 'admin_section_main', rootAction: 'admin_section_main' });
  markMenuShownForUser(userId);
  return { ok: true, action: 'bot_started_menu_fresh_shown' };
}

async function handleForward(message, config) {
  const senderUserId = getSenderUserId(message);
  const senderFirstName = getSenderFirstName(message);

  const channelId = extractForwardedChannelId(message);
  const postId = getPostId(message);
  const originalMessageId = getOriginalForwardedMessageId(message);
  const postText = String(
    getMessageBody(message)?.link?.message?.text ||
      message?.link?.message?.text ||
      getMessageText(message) ||
      ""
  );
  const sourceAttachments = getForwardedMessageAttachments(message);
  const originalLink = getForwardedMessageLink(message);
  const originalFormat = getForwardedMessageFormat(message);
  let channelTitle = extractChannelTitle(message);

  logVerbose(config, "FORWARD PARSED", {
    senderUserId,
    senderFirstName,
    channelId,
    postId,
    originalMessageId,
    postText,
    sourceAttachmentsCount: sourceAttachments.length
  });

  if (!channelId || !postId) {
    return { ok: false, action: "forward_skipped", reason: "channelId_or_postId_missing" };
  }

  registerChannel(channelId, {
    title: channelTitle || undefined,
    linkedByUserId: senderUserId,
    linkedByName: senderFirstName
  });

  if (!channelTitle) {
    try {
      const chat = await getChat({ botToken: config.botToken, chatId: channelId });
      channelTitle = String(chat?.title || chat?.name || '').trim();
      if (channelTitle) {
        registerChannel(channelId, {
          title: channelTitle,
          linkedByUserId: senderUserId,
          linkedByName: senderFirstName
        });
      }
    } catch {}
  }

  const result = await tryPatchChannelPost({
    botToken: config.botToken,
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    channelId,
    postId,
    messageId: originalMessageId,
    originalText: postText,
    sourceAttachments,
    originalLink,
    originalFormat,
    nativeReactions: extractNativeReactionSummary(message),
    channelTitle,
    linkedByUserId: senderUserId,
    linkedByName: senderFirstName,
    autoMode: false
  });

  const targetPost = buildGiftTargetPostRecord({
    channelId,
    channelTitle,
    postId,
    messageId: originalMessageId,
    commentKey: result?.commentKey || '',
    originalText: postText
  });
  setGiftTargetPost(senderUserId, targetPost);
  setCommentTargetPost(senderUserId, buildCommentTargetPostRecord(targetPost));

  const activeFlow = getGiftFlow(senderUserId);
  if (activeFlow) {
    const nextFlow = applyGiftTargetToDraft(activeFlow, targetPost);
    nextFlow.stepIndex = getResolvedGiftStepIndex(nextFlow.stepIndex, nextFlow.draft || {});
    nextFlow.awaitingConfirmation = nextFlow.stepIndex >= GIFT_WIZARD_STEPS.length;
    setGiftFlow(senderUserId, nextFlow);

    await upsertGiftFlowMessage({
      config,
      message,
      flow: nextFlow,
      text: nextFlow.awaitingConfirmation
        ? buildGiftCampaignPreview(normalizeGiftDraft(nextFlow), { targetPost })
        : buildGiftFlowGuidance(nextFlow, config),
      attachments: buildGiftAdminActionsKeyboard(config, nextFlow, targetPost),
      editCurrent: true
    });
  } else {
    const title = getReadableChannelName(channelId, channelTitle || 'Канал');
    const currentSectionRaw = String(getAdminUiState(senderUserId)?.section || '').trim().toLowerCase();
    const selectMode = String(getAdminSelectMode(senderUserId) || '').trim().toLowerCase();
    const selectedSection = ['comments', 'posts', 'buttons', 'stats', 'gifts'].includes(currentSectionRaw)
      ? currentSectionRaw
      : (['comments', 'posts', 'buttons', 'stats', 'gifts'].includes(selectMode) ? selectMode : 'comments');
    const sectionNames = {
      comments: 'Комментарии',
      posts: 'Редактирование постов',
      buttons: 'Пользовательские кнопки',
      stats: 'Статистика',
      gifts: 'Подарки'
    };
    const note = [
      selectedSection === 'comments' ? 'Пост подключён к комментариям.' : 'Пост выбран.',
      `Раздел: ${sectionNames[selectedSection] || 'Комментарии'}`,
      `Канал: ${title}`,
      `Пост: ${getGiftPostPreview(targetPost)}`,
      '',
      selectedSection === 'posts'
        ? 'Меню редактирования поста сохранено. Можно менять текст или кнопку комментариев.'
        : selectedSection === 'buttons'
          ? 'Меню кнопок сохранено. Можно добавлять или менять пользовательские кнопки.'
          : selectedSection === 'stats'
            ? 'Открываю статистику выбранного поста.'
            : selectedSection === 'gifts'
              ? 'Открываю подарки для выбранного поста.'
              : 'Теперь под этим постом работает кнопка комментариев.'
    ].join('\n');
    rememberAdminScreen(senderUserId, { section: selectedSection, backAction: 'admin_section_main', rootAction: `admin_section_${selectedSection}`, selectMode: selectedSection });
    await sendSectionMenu({
      config,
      message,
      section: selectedSection,
      note,
      editCurrent: false, // SP27: forwarded user message cannot be edited reliably; send fresh section menu
    });
  }

  try {
    await deleteMessage({ botToken: config.botToken, messageId: getMessageId(message) });
  } catch {}

  logInfo(config, "FORWARD PATCH", {
    ok: result?.patchError ? false : true,
    commentKey: result?.commentKey,
    postId,
    channelId,
    patchError: result?.patchError || null,
    giftCampaignId: result?.giftCampaignId || ""
  });
  return { ok: true, action: "forward_processed", result, targetPost };
}

async function handleDirectChannelPost(message, config) {
  const channelId = getRecipientChatId(message);
  const postId = getPostId(message);
  const messageId = getMessageId(message);
  const postText = getMessageText(message);
  const sourceAttachments = getMessageAttachments(message);
  const originalLink = getMessageLink(message);
  const originalFormat = getMessageFormat(message);
  let channelTitle = extractChannelTitle(message);

  registerChannel(channelId, {
    title: channelTitle || undefined,
    linkedByUserId: getSenderUserId(message),
    linkedByName: getSenderFirstName(message)
  });

  if (!channelTitle) {
    try {
      const chat = await getChat({ botToken: config.botToken, chatId: channelId });
      channelTitle = String(chat?.title || chat?.name || '').trim();
      if (channelTitle) {
        registerChannel(channelId, {
          title: channelTitle,
          linkedByUserId: getSenderUserId(message),
          linkedByName: getSenderFirstName(message)
        });
      }
    } catch {}
  }

  const result = await tryPatchChannelPost({
    botToken: config.botToken,
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    channelId,
    postId,
    messageId,
    originalText: postText,
    sourceAttachments,
    originalLink,
    originalFormat,
    nativeReactions: extractNativeReactionSummary(message),
    channelTitle,
    linkedByUserId: getSenderUserId(message),
    linkedByName: getSenderFirstName(message),
    autoMode: true
  });

  logInfo(config, "CHANNEL PATCH", {
    ok: result?.patchError ? false : true,
    skipped: result?.skipped || false,
    commentKey: result?.commentKey,
    postId,
    channelId,
    messageId,
    patchError: result?.patchError || null,
    giftCampaignId: result?.giftCampaignId || ""
  });
  return { ok: true, action: "channel_post_processed", result };
}

async function handleMessageCallback(update, config) {
  const callback = getCallback(update);
  const payload = parseCallbackPayload(callback);
  const callbackId = String(callback?.callback_id || callback?.id || '').trim();
  const userId = getCallbackUserId(update, callback);
  const userName = getCallbackUserName(update, callback);
  const message = getMessage(update);
  if (callback && message && typeof message === 'object') {
    message.__fromCallback = true;
    message.__senderUserId = userId;
    message.__senderFirstName = userName;
  }

  const callbackMessageIdForDedupe = String(getMessageId(message) || '').trim();
  const actionKey = callbackId ? '' : [userId, payload?.action || '', payload?.commentKey || '', payload?.campaignId || '', payload?.page || '', callbackMessageIdForDedupe].join(':');
  if (isDuplicateCallback(callbackId, actionKey)) {
    logVerbose(config, 'CALLBACK DUPLICATE', { callbackId, actionKey, userId, payload });
    return { ok: true, skipped: true, reason: 'duplicate_callback', callbackId, actionKey };
  }
  markCallbackSeen(callbackId, actionKey);

  logVerbose(config, 'CALLBACK', {
    callbackId,
    userId,
    userName,
    payload
  });

  if (payload?.action === 'gift_claim') {
    const result = await claimGift({
      botToken: config.botToken,
      campaignId: String(payload.campaignId || '').trim(),
      userId,
      userName,
      callbackId
    });
    logInfo(config, 'GIFT CLAIM', {
      ok: result?.ok || false,
      status: result?.status || '',
      campaignId: payload.campaignId || '',
      userId
    });
    return { ok: true, action: 'gift_claim_processed', result };
  }

  const publicActions = new Set([
    'admin_section_main',
    'admin_section_gifts',
    'admin_section_comments',
    'admin_section_info',
    'admin_section_help',
    'admin_section_channels',
    'admin_section_posts',
    'admin_section_buttons',
    'admin_section_stats',
    'admin_stats_channel',
    'admin_stats_refresh',
    'admin_stats_subscribers',
    'admin_stats_post',
    'admin_bind_channel',
    'admin_clear_chat',
    'gift_admin_open_menu',
    'comments_enable_new',
    'comments_old_post',
    'comments_edit_post',
    'comments_manage_buttons',
    'comments_select_post',
    'comments_pick_post',
    'comments_edit_text',
    'comments_add_button',
    'comments_edit_button',
    'comments_delete_button',
    'comments_toggle_post_comments',
    'comments_moderation',
    'comments_toggle_moderation',
    'comments_example',
    'comments_settings',
    'comments_how_it_works'
  ]);

  if (publicActions.has(payload?.action)) {
    if (payload.action === 'admin_section_main' || payload.action === 'gift_admin_open_menu') {
      await acknowledgeCallbackSilently(config, callbackId);
      // Не удаляем текущее меню перед переходом назад: в MAX удаление/редактирование
      // может привести к пустому экрану. Просто редактируем текущую карточку в главное меню.
      if (message) await sendSectionMenu({ config, message, section: 'main', editCurrent: true });
      return { ok: true, action: 'admin_section_main' };
    }

    if (payload.action === 'admin_clear_chat') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        await upsertBotMessage({
          config,
          message,
          text: [
            'Очистка всего чата недоступна через Bot API MAX.',
            '',
            'Бот не может запустить клиентскую команду очистки истории от имени пользователя. Чтобы убрать историю полностью, используйте штатное меню MAX в самом чате.',
            '',
            buildAdminMenuText({ userName })
          ].join('\n'),
          attachments: await buildAdminMainMenuAttachments(config),
          editCurrent: true
        });
      }
      return { ok: true, action: 'admin_clear_chat_unavailable' };
    }

    if (payload.action === 'admin_section_gifts') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendSectionMenu({ config, message, section: 'gifts', editCurrent: true });
      return { ok: true, action: 'admin_section_gifts' };
    }

    if (payload.action === 'admin_section_comments') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendSectionMenu({ config, message, section: 'comments', editCurrent: true });
      return { ok: true, action: 'admin_section_comments' };
    }

    if (payload.action === 'admin_section_info') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendSectionMenu({ config, message, section: 'info', editCurrent: true });
      return { ok: true, action: 'admin_section_info' };
    }

    if (payload.action === 'admin_section_help') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendSectionMenu({ config, message, section: 'help', editCurrent: true });
      return { ok: true, action: 'admin_section_help' };
    }

    if (payload.action === 'admin_section_channels') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendChannelsSection({ config, message, editCurrent: true });
      return { ok: true, action: 'admin_section_channels' };
    }

    if (payload.action === 'admin_section_posts') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendSectionMenu({ config, message, section: 'posts', editCurrent: true });
      return { ok: true, action: 'admin_section_posts' };
    }

    if (payload.action === 'admin_section_buttons') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendSectionMenu({ config, message, section: 'buttons', editCurrent: true });
      return { ok: true, action: 'admin_section_buttons' };
    }

    if (payload.action === 'admin_section_stats') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendSectionMenu({ config, message, section: 'stats', editCurrent: true });
      return { ok: true, action: 'admin_section_stats' };
    }

    if (payload.action === 'admin_stats_channel' || payload.action === 'admin_stats_refresh' || payload.action === 'admin_stats_subscribers') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        await sendStatsMenuResponse({
          config,
          message,
          userId,
          mode: payload.action === 'admin_stats_subscribers' ? 'subscribers' : 'channel',
          editCurrent: true
        });
      }
      return { ok: true, action: payload.action };
    }

    if (payload.action === 'admin_stats_post') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      if (message) await upsertBotMessage({ config, message, text: buildCurrentPostStatsText({ targetPost, userId }), attachments: buildStatsSectionKeyboard(targetPost, userId), editCurrent: true });
      return { ok: true, action: 'admin_stats_post' };
    }

    if (payload.action === 'admin_bind_channel') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        await upsertBotMessage({
          config,
          message,
          text: buildBindChannelText(),
          attachments: buildAdminSectionsKeyboard(config),
          editCurrent: true
        });
      }
      return { ok: true, action: 'admin_bind_channel' };
    }

    if (payload.action === 'comments_enable_new') {
      await acknowledgeCallbackSilently(config, callbackId);
      rememberAdminScreen(userId, { section: 'comments', backAction: 'admin_section_main', rootAction: 'admin_section_comments' });
      if (message) {
        await upsertBotMessage({ config, message, text: buildCommentsEnableNewText(), attachments: buildCommentsSectionKeyboard(config, getCommentTargetPost(userId) || getGiftTargetPost(userId)), editCurrent: true });
      }
      return { ok: true, action: 'comments_enable_new' };
    }

    if (payload.action === 'comments_old_post') {
      await acknowledgeCallbackSilently(config, callbackId);
      rememberAdminScreen(userId, { section: 'comments', backAction: 'admin_section_main', rootAction: 'admin_section_comments' });
      if (message) {
        await upsertBotMessage({ config, message, text: buildCommentsOldPostText(), attachments: buildCommentsSectionKeyboard(config, getCommentTargetPost(userId) || getGiftTargetPost(userId)), editCurrent: true });
      }
      return { ok: true, action: 'comments_old_post' };
    }

    if (payload.action === 'comments_edit_post') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      if (message) {
        await upsertBotMessage({ config, message, text: buildPostsSectionText(targetPost), attachments: buildPostsSectionKeyboard(targetPost), editCurrent: true });
      }
      return { ok: true, action: 'comments_edit_post' };
    }

    if (payload.action === 'comments_manage_buttons') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      if (message) {
        await upsertBotMessage({ config, message, text: buildButtonsSectionText(targetPost), attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      }
      return { ok: true, action: payload.action };
    }

    if (payload.action === 'comments_edit_button') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      const rowIndex = Number(payload.rowIndex);
      const buttonIndex = Number(payload.buttonIndex);
      const targetButton = flattenCustomButtons(targetPost).find((item) => item.rowIndex === rowIndex && item.buttonIndex === buttonIndex);
      if (!targetPost?.commentKey || !targetButton) {
        if (message) await upsertBotMessage({ config, message, text: 'Не удалось найти кнопку для редактирования.', attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
        return { ok: true, action: 'comments_edit_button_missing' };
      }
      setCommentAdminFlow(userId, { mode: 'button_edit_text', targetPost, buttonDraft: { text: targetButton.text, rowIndex, buttonIndex, edit: true }, anchorMessageId: String(getMessageId(message) || getLatestBotMessageId(userId) || '').trim() });
      if (message) await upsertBotMessage({ config, message, text: `Новый текст для кнопки «${targetButton.text}».`, attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comments_edit_button' };
    }

    if (payload.action === 'comments_delete_button') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      if (!targetPost?.commentKey) {
        if (message) await upsertBotMessage({ config, message, text: 'Сначала выберите или перешлите пост.', attachments: buildCommentsButtonsAdminKeyboard(null), editCurrent: true });
        return { ok: true, action: 'comments_delete_button_without_post' };
      }
      try {
        const currentPost = getPost(targetPost.commentKey) || {};
        const currentBuilder = getCanonicalCustomKeyboardBuilder(currentPost);
        const rows = Array.isArray(currentBuilder.rows) ? JSON.parse(JSON.stringify(currentBuilder.rows)) : [];
        const rowIndex = Number(payload.rowIndex);
        const buttonIndex = Number(payload.buttonIndex);
        if (rows[rowIndex]?.buttons?.[buttonIndex]) {
          rows[rowIndex].buttons.splice(buttonIndex, 1);
          if (!rows[rowIndex].buttons.length) rows.splice(rowIndex, 1);
        }
        await savePostKeyboard({ commentKey: targetPost.commentKey, builder: { ...currentBuilder, rows }, actorId: userId, actorName: userName, config });
        if (message) await upsertBotMessage({ config, message, text: 'Кнопка удалена.', attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      } catch (error) {
        if (message) await upsertBotMessage({ config, message, text: `Не удалось удалить кнопку: ${error?.message || 'ошибка'}`, attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      }
      return { ok: true, action: 'comments_delete_button' };
    }

    if (payload.action === 'comments_select_post') {
      await acknowledgeCallbackSilently(config, callbackId);
      const page = Math.max(0, Number(payload.page || 0));
      const source = String(payload.source || getAdminSelectMode(userId) || 'comments').trim().toLowerCase();
      setAdminUiState(userId, { selectMode: source });
      if (message) {
        await upsertBotMessage({ config, message, text: 'Выберите пост из списка или просто перешлите его боту.', attachments: buildRecentCommentPostsKeyboard(page, { source, userId }), editCurrent: true });
      }
      return { ok: true, action: 'comments_select_post', page, source };
    }

    if (payload.action === 'comments_pick_post') {
      await acknowledgeCallbackSilently(config, callbackId);
      const selected = getPostsList().find((item) => normalizeKey(item.commentKey || '') === normalizeKey(payload.commentKey || '')) || null;
      const source = String(payload.source || getAdminSelectMode(userId) || 'comments').trim().toLowerCase();
      if (!selected?.commentKey) {
        if (message) {
          await upsertBotMessage({ config, message, text: 'Не удалось найти выбранный пост. Выберите другой.', attachments: buildRecentCommentPostsKeyboard(0, { source, userId }), editCurrent: true });
        }
        return { ok: true, action: 'comments_pick_post_missing' };
      }
      const targetPost = buildCommentTargetPostRecord({ channelId: selected.channelId, channelTitle: selected.channelTitle || getReadableChannelName(selected.channelId, ''), postId: selected.postId, messageId: selected.messageId, commentKey: selected.commentKey, originalText: selected.originalText || '' });
      setCommentTargetPost(userId, targetPost);
      setGiftTargetPost(userId, buildGiftTargetPostRecord(targetPost));
      if (message) {
        if (source === 'buttons') {
          await upsertBotMessage({ config, message, text: buildButtonsSectionText(targetPost), attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
        } else if (source === 'stats') {
          await upsertBotMessage({ config, message, text: buildCurrentPostStatsText({ targetPost, userId }), attachments: buildStatsSectionKeyboard(targetPost, userId), editCurrent: true });
        } else if (source === 'posts') {
          await upsertBotMessage({ config, message, text: buildPostsSectionText(targetPost), attachments: buildPostsSectionKeyboard(targetPost), editCurrent: true });
        } else {
          rememberAdminScreen(userId, { section: 'comments', backAction: 'admin_section_main', rootAction: 'admin_section_comments', selectMode: 'comments' });
          await upsertBotMessage({ config, message, text: buildSectionIntro('comments', { userName, targetPost }), attachments: buildCommentsSectionKeyboard(config, targetPost), editCurrent: true });
        }
      }
      return { ok: true, action: 'comments_pick_post', source };
    }

    if (payload.action === 'comments_edit_text') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      if (!targetPost?.commentKey) {
        if (message) await upsertBotMessage({ config, message, text: 'Сначала выберите или перешлите пост.', attachments: buildCommentsPostAdminKeyboard(null), editCurrent: true });
        return { ok: true, action: 'comments_edit_text_without_post' };
      }
      setCommentAdminFlow(userId, { mode: 'edit_text', targetPost, anchorMessageId: String(getMessageId(message) || getLatestBotMessageId(userId) || '').trim() });
      if (message) await upsertBotMessage({ config, message, text: buildPostEditPrompt(targetPost), attachments: buildCommentsPostAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comments_edit_text' };
    }

    if (payload.action === 'comments_toggle_post_comments') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      const currentSection = String(getAdminUiState(userId)?.section || '').trim();
      if (!targetPost?.commentKey) {
        if (message) {
          const inComments = currentSection === 'comments';
          await upsertBotMessage({
            config,
            message,
            text: 'Сначала выберите или перешлите пост.',
            attachments: inComments ? buildCommentsSectionKeyboard(config, null) : buildPostsSectionKeyboard(null),
            editCurrent: true
          });
        }
        return { ok: true, action: 'comments_toggle_post_comments_without_post' };
      }
      const enabled = String(payload.enabled || '').trim() === '1';
      try {
        await setPostCommentsEnabled({ commentKey: targetPost.commentKey, enabled, actorId: userId, actorName: userName, config });
        const freshTarget = getFreshTargetPost(targetPost);
        setCommentTargetPost(userId, freshTarget);
        setGiftTargetPost(userId, buildGiftTargetPostRecord(freshTarget));
        const successText = enabled ? 'Кнопка комментариев возвращена под выбранный пост.' : 'Кнопка комментариев убрана только у выбранного поста.';
        if (message) {
          if (currentSection === 'comments') {
            await upsertBotMessage({
              config,
              message,
              text: buildSectionIntro('comments', { userName, targetPost: freshTarget }) + '\n\n' + successText,
              attachments: buildCommentsSectionKeyboard(config, freshTarget),
              editCurrent: true
            });
          } else {
            await upsertBotMessage({
              config,
              message,
              text: buildPostsSectionText(freshTarget) + '\n\n' + successText,
              attachments: buildPostsSectionKeyboard(freshTarget),
              editCurrent: true
            });
          }
        }
      } catch (error) {
        if (message) await upsertBotMessage({ config, message, text: `Не удалось обновить пост: ${error?.message || 'ошибка'}`, attachments: currentSection === 'comments' ? buildCommentsSectionKeyboard(config, targetPost) : buildPostsSectionKeyboard(targetPost), editCurrent: true });
      }
      return { ok: true, action: 'comments_toggle_post_comments' };
    }

    if (payload.action === 'comments_add_button') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      if (!targetPost?.commentKey) {
        if (message) await upsertBotMessage({ config, message, text: 'Сначала выберите или перешлите пост.', attachments: buildCommentsPostAdminKeyboard(null), editCurrent: true });
        return { ok: true, action: 'comments_add_button_without_post' };
      }
      setCommentAdminFlow(userId, { mode: 'button_text', targetPost, buttonDraft: {}, anchorMessageId: String(getMessageId(message) || getLatestBotMessageId(userId) || '').trim() });
      if (message) await upsertBotMessage({ config, message, text: 'Шаг 1/3. Напишите текст дополнительной кнопки под постом.', attachments: buildCommentsButtonsAdminKeyboard(targetPost), editCurrent: true });
      return { ok: true, action: 'comments_add_button' };
    }

    if (payload.action === 'comments_clear_buttons') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      if (!targetPost?.commentKey) {
        if (message) await upsertBotMessage({ config, message, text: 'Сначала выберите или перешлите пост.', attachments: buildCommentsPostAdminKeyboard(null), editCurrent: true });
        return { ok: true, action: 'comments_clear_buttons_without_post' };
      }
      try {
        const currentPost = getPost(targetPost.commentKey) || {};
        const currentBuilder = getCanonicalCustomKeyboardBuilder(currentPost);
        await savePostKeyboard({ commentKey: targetPost.commentKey, builder: { ...currentBuilder, rows: [] }, actorId: userId, actorName: userName, config });
        if (message) await upsertBotMessage({ config, message, text: 'Дополнительные кнопки под постом убраны.', attachments: buildCommentsPostAdminKeyboard(targetPost), editCurrent: true });
      } catch (error) {
        if (message) await upsertBotMessage({ config, message, text: `Не удалось обновить пост: ${error?.message || 'ошибка'}`, attachments: buildCommentsPostAdminKeyboard(targetPost), editCurrent: true });
      }
      return { ok: true, action: 'comments_clear_buttons' };
    }

    if (payload.action === 'comments_moderation') {
      await acknowledgeCallbackSilently(config, callbackId);
      const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
      const channelId = String(payload.channelId || targetPost?.channelId || '').trim();
      if (!channelId) {
        if (message) await upsertBotMessage({ config, message, text: 'Сначала перешлите пост из канала, чтобы открыть фильтр именно для этого канала.', attachments: buildCommentsSectionKeyboard(config, getCommentTargetPost(userId) || getGiftTargetPost(userId)), editCurrent: true });
        return { ok: true, action: 'comments_moderation_without_channel' };
      }
      if (message) await upsertBotMessage({ config, message, text: buildModerationMenuText(channelId), attachments: buildModerationMenuKeyboard(channelId), editCurrent: true });
      return { ok: true, action: 'comments_moderation' };
    }

    if (payload.action === 'comments_toggle_moderation') {
      await acknowledgeCallbackSilently(config, callbackId);
      const channelId = String(payload.channelId || '').trim();
      const field = String(payload.field || '').trim();
      const current = getModerationSettings(channelId);
      if (channelId && ['enabled','blockLinks','blockInvites','aiEnabled'].includes(field)) {
        saveModerationSettings(channelId, { [field]: !Boolean(current[field]) });
      }
      if (message) await upsertBotMessage({ config, message, text: buildModerationMenuText(channelId), attachments: buildModerationMenuKeyboard(channelId), editCurrent: true });
      return { ok: true, action: 'comments_toggle_moderation' };
    }
    if (payload.action === 'comments_example') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        await upsertBotMessage({ config, message, text: buildCommentsExampleText(), attachments: buildCommentsSectionKeyboard(config, getCommentTargetPost(userId) || getGiftTargetPost(userId)), editCurrent: true });
      }
      return { ok: true, action: 'comments_example' };
    }

    if (payload.action === 'comments_settings') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        await upsertBotMessage({ config, message, text: buildCommentsSettingsText(config), attachments: buildCommentsSectionKeyboard(config, getCommentTargetPost(userId) || getGiftTargetPost(userId)), editCurrent: true });
      }
      return { ok: true, action: 'comments_settings' };
    }

    if (payload.action === 'comments_how_it_works') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        await upsertBotMessage({ config, message, text: buildCommentsHowItWorksText(), attachments: buildCommentsSectionKeyboard(config, getCommentTargetPost(userId) || getGiftTargetPost(userId)), editCurrent: true });
      }
      return { ok: true, action: 'comments_how_it_works' };
    }
  }

  const protectedActions = new Set([
    'gift_admin_recent_posts',
    'gift_admin_select_post',
    'gift_admin_list_campaigns',
    'gift_admin_start_create',
    'gift_admin_create_from_target',
    'gift_admin_pick_file',
    'gift_admin_show_current',
    'gift_admin_save',
    'gift_admin_cancel',
    'gift_admin_skip_message',
    'gift_admin_replace_existing',
    'gift_admin_delete_existing'
  ]);

  if (protectedActions.has(payload?.action)) {
    if (!isGiftAdminAuthorized(config, userId)) {
      await answerCallback({
        botToken: config.botToken,
        callbackId,
        notification: 'Открываю'
      });
      if (message) {
        await replyToUser({
          config,
          message,
          text: 'Дополнительная авторизация не требуется.',
          attachments: buildAdminSectionsKeyboard(config)
        });
      }
      return { ok: true, action: 'gift_admin_callback_denied' };
    }

    const targetPost = getGiftTargetPost(userId) || getCommentTargetPost(userId) || null;
    const currentFlow = getGiftFlow(userId);

    if (payload.action === 'gift_admin_recent_posts') {
      const page = Math.max(0, Number(payload.page || 0));
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) await sendRecentPostsMenu({ config, message, page, note: 'Выберите пост для подарка.', editCurrent: true });
      return { ok: true, action: 'gift_admin_recent_posts', page };
    }

    if (payload.action === 'gift_admin_select_post') {
      const selected = getPostsList().find((item) => normalizeKey(item.commentKey || '') === normalizeKey(payload.commentKey || '')) || null;
      if (!selected?.channelId || !selected?.postId) {
        await acknowledgeCallbackSilently(config, callbackId);
        if (message) await sendRecentPostsMenu({ config, message, page: 0, note: 'Не удалось найти выбранный пост. Попробуйте другой.', editCurrent: true });
        return { ok: true, action: 'gift_admin_select_post_missing' };
      }
      const nextTarget = buildGiftTargetPostRecord({
        channelId: selected.channelId,
        channelTitle: selected.channelTitle || getReadableChannelName(selected.channelId, ''),
        postId: selected.postId,
        messageId: selected.messageId,
        commentKey: selected.commentKey,
        originalText: selected.originalText || selected.postText || ''
      });
      setGiftTargetPost(userId, nextTarget);
      clearGiftFlow(userId);
      const existingCampaign = getExistingGiftCampaignForTarget(nextTarget);
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        if (existingCampaign) {
          await upsertBotMessage({
            config,
            message,
            text: ['Для этого поста уже сохранён подарок:', '', buildGiftCampaignSummary(existingCampaign)].join('\n'),
            attachments: buildGiftMainMenuKeyboard(config, { targetPost: nextTarget }),
            editCurrent: true
          });
        } else {
          const nextFlow = buildQuickGiftFlowFromTarget(nextTarget, currentFlow || null);
          setGiftFlow(userId, nextFlow);
          await upsertBotMessage({
            config,
            message,
            text: [
              'Пост для подарка выбран.',
              `Пост: ${getGiftPostPreview(nextTarget)}.`,
              '',
              buildGiftWizardPrompt(nextFlow.stepIndex, nextFlow.draft || {}, config)
            ].join('\n'),
            attachments: buildGiftMainMenuKeyboard(config, { flow: nextFlow, targetPost: nextTarget }),
            editCurrent: true
          });
        }
      }
      return { ok: true, action: 'gift_admin_select_post', commentKey: nextTarget.commentKey };
    }

    if (payload.action === 'gift_admin_start_create' || payload.action === 'gift_admin_create_from_target' || payload.action === 'gift_admin_pick_file') {
      if (!targetPost?.channelId || !targetPost?.postId) {
        await acknowledgeCallbackSilently(config, callbackId);
        if (message) await sendRecentPostsMenu({ config, message, page: 0, note: 'Сначала выберите пост для подарка.', editCurrent: true });
        return { ok: true, action: 'gift_admin_create_without_target' };
      }
      const existingCampaign = findGiftCampaignForPost({ channelId: targetPost.channelId, postId: targetPost.postId, commentKey: targetPost.commentKey });
      if (existingCampaign) {
        await acknowledgeCallbackSilently(config, callbackId);
        if (message) {
          await upsertBotMessage({
            config,
            message,
            text: ['Для этого поста уже сохранён подарок:', '', buildGiftCampaignSummary(existingCampaign)].join('\n'),
            attachments: buildGiftMainMenuKeyboard(config, { targetPost }),
            editCurrent: true
          });
        }
        return { ok: true, action: 'gift_admin_create_existing_campaign' };
      }
      const nextFlow = buildQuickGiftFlowFromTarget(targetPost, currentFlow || null);
      setGiftFlow(userId, nextFlow);
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        await upsertGiftFlowMessage({
          config,
          message,
          flow: nextFlow,
          text: [
            `Пост: ${getGiftPostPreview(targetPost)}`,
            '',
            buildGiftWizardPrompt(nextFlow.stepIndex, nextFlow.draft || {}, config)
          ].join('\n'),
          attachments: buildGiftMainMenuKeyboard(config, { flow: nextFlow, targetPost }),
          editCurrent: true
        });
      }
      return { ok: true, action: 'gift_admin_start_create' };
    }

    if (payload.action === 'gift_admin_replace_existing') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (!message || !targetPost?.channelId || !targetPost?.postId) {
        return { ok: true, action: 'gift_admin_replace_existing_without_target' };
      }
      const existingCampaign = getExistingGiftCampaignForTarget(targetPost);
      if (!existingCampaign) {
        await upsertBotMessage({ config, message, text: 'Для этого поста пока нет сохранённого подарка.', attachments: buildGiftMainMenuKeyboard(config, { targetPost }), editCurrent: true });
        return { ok: true, action: 'gift_admin_replace_existing_missing' };
      }
      const seededFlow = buildQuickGiftFlowFromTarget(targetPost, { draft: { ...existingCampaign } });
      seededFlow.stepIndex = 0;
      seededFlow.awaitingConfirmation = false;
      seededFlow.draft.giftAttachment = null;
      seededFlow.draft.giftUrl = '';
      setGiftFlow(userId, seededFlow);
      await upsertGiftFlowMessage({
        config,
        message,
        flow: seededFlow,
        text: ['Заменяем существующий подарок.', '', `Пост: ${getGiftPostPreview(targetPost)}.`, '', buildGiftWizardPrompt(seededFlow.stepIndex, seededFlow.draft || {}, config)].join('\n'),
        attachments: buildGiftMainMenuKeyboard(config, { flow: seededFlow, targetPost }),
        editCurrent: true
      });
      return { ok: true, action: 'gift_admin_replace_existing' };
    }

    if (payload.action === 'gift_admin_delete_existing') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (!message || !targetPost?.channelId || !targetPost?.postId) {
        return { ok: true, action: 'gift_admin_delete_existing_without_target' };
      }
      const existingCampaign = getExistingGiftCampaignForTarget(targetPost);
      if (!existingCampaign) {
        await upsertBotMessage({ config, message, text: 'Для этого поста пока нет сохранённого подарка.', attachments: buildGiftMainMenuKeyboard(config, { targetPost }), editCurrent: true });
        return { ok: true, action: 'gift_admin_delete_existing_missing' };
      }
      deleteGiftCampaign(existingCampaign.id);
      await repatchGiftTargetPost(targetPost, config);
      await sendSectionMenu({ config, message, section: 'gifts', note: 'Подарок удалён. Теперь для этого поста можно создать новый.', editCurrent: true });
      return { ok: true, action: 'gift_admin_delete_existing' };
    }

    if (payload.action === 'gift_admin_skip_message') {
      if (!currentFlow) {
        await acknowledgeCallbackSilently(config, callbackId);
        if (message) await sendSectionMenu({ config, message, section: 'gifts', note: 'Сначала выберите пост и добавьте подарок.', editCurrent: true });
        return { ok: true, action: 'gift_admin_skip_message_without_flow' };
      }
      const skippedFlow = rememberFlowCleanupMessageIds({ ...currentFlow, draft: { ...(currentFlow.draft || {}), giftMessage: '' }, awaitingConfirmation: true, stepIndex: GIFT_WIZARD_STEPS.length }, [...getMessageIdCandidates(message), getGiftFlowAnchorMessageId(currentFlow, userId), getLatestBotMessageId(userId)]);
      setGiftFlow(userId, skippedFlow);
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        await upsertBotMessage({
          config,
          message,
          text: buildGiftCampaignPreview(normalizeGiftDraft(skippedFlow), { targetPost }),
          attachments: buildGiftAdminActionsKeyboard(config, skippedFlow, targetPost),
          editCurrent: true
        });
      }
      return { ok: true, action: 'gift_admin_skip_message' };
    }

    if (payload.action === 'gift_admin_show_current') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (!message) return { ok: true, action: 'gift_admin_show_current_no_message' };
      if (currentFlow) {
        await upsertGiftFlowMessage({ config, message, flow: currentFlow, text: buildGiftFlowGuidance(currentFlow, config, { targetPost }), attachments: buildGiftMainMenuKeyboard(config, { flow: currentFlow, targetPost }), editCurrent: true });
        return { ok: true, action: 'gift_admin_show_current_flow' };
      }
      const activeCampaign = targetPost?.channelId && targetPost?.postId
        ? findGiftCampaignForPost({ channelId: targetPost.channelId, postId: targetPost.postId, commentKey: targetPost.commentKey })
        : null;
      if (activeCampaign) {
        await upsertBotMessage({
          config,
          message,
          text: ['Для выбранного поста уже сохранён подарок:', '', buildGiftCampaignSummary(activeCampaign)].join('\n'),
          attachments: buildGiftMainMenuKeyboard(config, { targetPost }),
          editCurrent: true
        });
        return { ok: true, action: 'gift_admin_show_current_campaign' };
      }
      await upsertBotMessage({
        config,
        message,
        text: targetPost ? 'Для выбранного поста ещё нет сохранённого подарка.' : 'Сначала выберите пост для подарка.',
        attachments: buildGiftMainMenuKeyboard(config, { targetPost }),
        editCurrent: true
      });
      return { ok: true, action: 'gift_admin_show_current_empty' };
    }

    if (payload.action === 'gift_admin_save') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (!message) return { ok: true, action: 'gift_admin_save_no_message' };
      if (!currentFlow) {
        await upsertBotMessage({ config, message, text: 'Сейчас нет черновика для сохранения.', attachments: buildGiftMainMenuKeyboard(config), editCurrent: true });
        return { ok: true, action: 'gift_admin_save_without_flow' };
      }
      const campaignDraft = normalizeGiftDraft(currentFlow);
      if (!campaignDraft.id || !campaignDraft.title || !campaignDraft.channelId || (!campaignDraft.giftUrl && !campaignDraft.giftAttachment)) {
        await upsertBotMessage({ config, message, text: 'Не все обязательные поля заполнены. Сначала выберите пост и добавьте подарок.', attachments: buildGiftMainMenuKeyboard(config), editCurrent: true });
        return { ok: true, action: 'gift_admin_save_invalid' };
      }
      const cleanupFlow = rememberFlowCleanupMessageIds(currentFlow, [...getMessageIdCandidates(message), getGiftFlowAnchorMessageId(currentFlow, userId), getLatestBotMessageId(userId), ...(getTrackedAdminMessageIds(userId) || [])]);
      const campaign = saveGiftCampaign(campaignDraft);
      const repatch = await repatchPostsForCampaign(campaign, config);
      await cleanupGiftFlowArtifacts(config, cleanupFlow, userId);
      await flushPendingDeleteMessageIds(config, userId);
      clearGiftFlow(userId);
      const menuResult = await sendSectionMenu({
        config,
        message,
        section: 'gifts',
        note: `Подарок привязан к посту (${String(campaign.title || '').replace(/^Подарок к посту \(|\)$/g, '') || 'без названия'}).`,
        editCurrent: true
      });
      const activeMessageId = String(extractSentMessageId(menuResult) || getLatestBotMessageId(userId) || '').trim();
      await finalizeActiveAdminMessage({ config, userId, activeMessageId, deleteIds: [...(cleanupFlow.cleanupMessageIds || []), ...getTrackedAdminMessageIds(userId)] });
      await flushPendingDeleteMessageIds(config, userId);
      return { ok: true, action: 'gift_admin_save' };
    }

    if (payload.action === 'gift_admin_cancel') {
      const cleanupFlow = rememberFlowCleanupMessageIds(currentFlow, [...getMessageIdCandidates(message), getGiftFlowAnchorMessageId(currentFlow, userId), getLatestBotMessageId(userId)]);
      await cleanupGiftFlowArtifacts(config, cleanupFlow, userId);
      await flushPendingDeleteMessageIds(config, userId);
      clearGiftFlow(userId);
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        const menuResult = await sendSectionMenu({ config, message, section: 'gifts', note: 'Черновик подарка очищен.', editCurrent: true });
        const activeMessageId = String(extractSentMessageId(menuResult) || getLatestBotMessageId(userId) || '').trim();
        await finalizeActiveAdminMessage({ config, userId, activeMessageId, deleteIds: [...(cleanupFlow.cleanupMessageIds || []), ...getTrackedAdminMessageIds(userId)] });
        await flushPendingDeleteMessageIds(config, userId);
      }
      return { ok: true, action: 'gift_admin_cancel' };
    }

    if (payload.action === 'gift_admin_list_campaigns') {
      await acknowledgeCallbackSilently(config, callbackId);
      if (message) {
        const campaigns = listGiftCampaigns();
        const lines = campaigns.length
          ? campaigns.slice(0, 20).map((item) => `• ${item.id} — ${item.title}`)
          : ['Пока нет сохранённых подарков.'];
        await upsertBotMessage({ config, message, text: ['Список подарков:', ...lines].join('\n'), attachments: buildGiftMainMenuKeyboard(config), editCurrent: true });
      }
      return { ok: true, action: 'gift_admin_list_campaigns' };
    }
  }

  return { ok: true, skipped: true, reason: 'unsupported_callback', payload };
}

async function sendStatsMenuResponse({ config, message, userId, mode = 'channel', editCurrent = true }) {
  const targetPost = getCommentTargetPost(userId) || getGiftTargetPost(userId);
  let text = '';
  try {
    text = await buildChannelStatsTextLive({ targetPost, userId, config, mode });
  } catch (error) {
    console.error('STATS CALLBACK FAILED:', error?.message || error, error?.data || '');
    text = [
      'Статистика канала',
      '',
      'Не удалось обновить статистику прямо сейчас.',
      'Попробуйте ещё раз через несколько секунд.'
    ].join('\n');
  }
  if (mode === 'subscribers') {
    text += '\n\nДинамика появится после накопления снимков за прошлые периоды.';
  }
  return upsertBotMessage({
    config,
    message,
    text,
    attachments: buildStatsSectionKeyboard(targetPost, userId),
    editCurrent
  });
}

async function handleWebhook(req, res, config) {
  try {
    if (config.webhookSecret) {
      const headerSecret = req.get("X-Max-Bot-Api-Secret") || "";
      if (headerSecret !== config.webhookSecret) {
        return res.status(403).json({ ok: false, error: "invalid_secret" });
      }
    }

    const update = req.body || {};
    const message = getMessage(update);
    const updateType = String(update?.update_type || update?.type || "").trim();

    logVerbose(config, "RAW UPDATE", update);

    if (updateType === "message_callback") {
      await handleMessageCallback(update, config);
      return res.status(200).json({ ok: true });
    }

    if (updateType === "bot_started") {
      await handleBotStarted(update, config);
      return res.status(200).json({ ok: true });
    }

    if (!message) {
      return res.status(200).json({ ok: true, skipped: true, reason: "no_message" });
    }

    if (updateType === "message_edited") {
      return res.status(200).json({ ok: true, skipped: true, reason: "message_edited_ignored" });
    }

    const senderUserId = getSenderUserId(message);
    if (senderUserId) rememberAdminUserMessageIds(senderUserId, getMessageIdCandidates(message));
    const text = getMessageText(message).trim();
    const lowered = text.toLowerCase();

    if (/^\/?start(?:\s|$)/i.test(lowered)) {
      await handleStart(message, config);
      return res.status(200).json({ ok: true });
    }

    const currentSection = getAdminUiState(senderUserId)?.section || '';
    const currentGiftFlow = getGiftFlow(senderUserId);
    const currentCommentFlow = getCommentAdminFlow(senderUserId);
    const activeFlowKind = getActiveAdminFlowKind(senderUserId);
    const currentSelectMode = getAdminSelectMode(senderUserId);

    // SP3.14.6.22: a forwarded channel post must stay a post-selection/edit target
    // even when the user is already inside Comments / Posts / Buttons / Stats / Gifts.
    // Otherwise the admin flow can treat the forwarded card as ordinary text and the menu disappears.
    if (isForwardedChannelPost(message) && (currentSection || currentSelectMode || activeFlowKind || currentGiftFlow || currentCommentFlow)) {
      await handleForward(message, config);
      return res.status(200).json({ ok: true });
    }

    // Active admin flows have priority over link previews / forwarded-post parsing.
    // MAX can wrap ordinary URLs into rich-preview payloads that look like links;
    // if we parse them as forwarded posts first, button step 2/3 gets stuck.
    if (text.startsWith('/gift')) {
      await handleGiftAdminCommand(message, config);
      return res.status(200).json({ ok: true });
    }

    if (activeFlowKind === 'gift') {
      if (currentCommentFlow) clearCommentAdminFlow(senderUserId);
      await handleGiftAdminCommand(message, config);
      return res.status(200).json({ ok: true });
    }

    if (activeFlowKind === 'comment') {
      if (currentGiftFlow) clearGiftFlow(senderUserId);
      await handleCommentAdminInput(message, config);
      return res.status(200).json({ ok: true });
    }

    if (currentGiftFlow && !currentCommentFlow) {
      setActiveAdminFlowKind(senderUserId, 'gift');
      await handleGiftAdminCommand(message, config);
      return res.status(200).json({ ok: true });
    }

    if (currentCommentFlow && !currentGiftFlow) {
      setActiveAdminFlowKind(senderUserId, 'comment');
      await handleCommentAdminInput(message, config);
      return res.status(200).json({ ok: true });
    }

    if (currentSection === 'gifts' && currentCommentFlow) {
      clearCommentAdminFlow(senderUserId);
    }

    if (['buttons', 'posts', 'comments', 'stats'].includes(currentSection) && currentGiftFlow) {
      clearGiftFlow(senderUserId);
    }

    if (isForwardedChannelPost(message)) {
      await handleForward(message, config);
      return res.status(200).json({ ok: true });
    }

    if (isDirectChannelPost(message)) {
      if (hasCommentsKeyboard(message)) {
        logVerbose(config, "CHANNEL SKIP", {
          reason: "already_has_keyboard",
          messageId: getMessageId(message),
          postId: getPostId(message)
        });
        return res.status(200).json({ ok: true, skipped: true, reason: "already_patched" });
      }
      await handleDirectChannelPost(message, config);
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: "unsupported_update",
      recipientChatType: getRecipientChatType(message)
    });
  } catch (error) {
    console.error("WEBHOOK ERROR:", error?.message || error, error?.data || "");
    return res.status(500).json({ ok: false, error: error?.message || "webhook_failed" });
  }
}

module.exports = {
  handleWebhook
};
