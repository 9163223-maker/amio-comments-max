const API_BASE_URL = "https://platform-api.max.ru";

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function appendQueryParams(url, query) {
  if (!query || typeof query !== "object") return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      });
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function maxApi(path, { token, method = "GET", query = null, body, timeoutMs = 9000 } = {}) {
  if (!token) {
    throw new Error("BOT_TOKEN is missing");
  }

  const url = new URL(`${API_BASE_URL}${path}`);
  appendQueryParams(url, query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 9000)));
  let response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: token,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`MAX API timeout ${method} ${path}`);
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await readJsonSafe(response);

  if (!response.ok) {
    const error = new Error(`MAX API ${response.status} ${method} ${path}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function getSubscriptions({ botToken }) {
  return maxApi("/subscriptions", { token: botToken, method: "GET" });
}

async function registerWebhook({ botToken, webhookUrl, secret }) {
  return maxApi("/subscriptions", {
    token: botToken,
    method: "POST",
    body: {
      url: webhookUrl,
      update_types: ["message_callback", "message_created", "bot_started"],
      ...(secret ? { secret } : {})
    }
  });
}

async function editMessage({ botToken, messageId, text, attachments, notify = false, format, link }) {
  if (!messageId) {
    throw new Error("messageId is required");
  }

  const body = { notify };
  if (text !== undefined) body.text = text;
  if (attachments !== undefined) body.attachments = attachments;
  if (format !== undefined) body.format = format;
  if (link !== undefined) body.link = link;

  return maxApi("/messages", {
    token: botToken,
    method: "PUT",
    query: { message_id: messageId },
    body
  });
}

async function sendMessage({ botToken, userId, chatId, text, attachments, format, link, notify = false }) {
  if (!userId && !chatId) {
    throw new Error("userId_or_chatId_required");
  }

  const body = { notify };
  if (text !== undefined) body.text = text;
  if (attachments !== undefined) body.attachments = attachments;
  if (format !== undefined) body.format = format;
  if (link !== undefined) body.link = link;
  if (link !== undefined) body.link = link;

  return maxApi("/messages", {
    token: botToken,
    method: "POST",
    query: {
      ...(userId ? { user_id: userId } : {}),
      ...(chatId ? { chat_id: chatId } : {})
    },
    body
  });
}


async function deleteMessage({ botToken, messageId, timeoutMs = 2500 }) {
  if (!messageId) throw new Error("messageId is required");
  const data = await maxApi("/messages", {
    token: botToken,
    method: "DELETE",
    query: { message_id: messageId },
    timeoutMs
  });
  if (data && Object.prototype.hasOwnProperty.call(data, "success") && data.success === false) {
    const error = new Error(data.message || `MAX API DELETE /messages returned success=false for ${messageId}`);
    error.data = data;
    throw error;
  }
  return data;
}

async function answerCallback({ botToken, callbackId, notification, message }) {
  if (!callbackId) {
    return { success: false, skipped: true, reason: "callback_id_missing" };
  }

  return maxApi("/answers", {
    token: botToken,
    method: "POST",
    query: { callback_id: callbackId },
    body: {
      ...(notification ? { notification } : {}),
      ...(message ? { message } : {})
    }
  });
}

async function getChatMembers({ botToken, chatId, userIds, marker, count }) {
  if (!chatId) throw new Error("chatId is required");
  return maxApi(`/chats/${encodeURIComponent(String(chatId))}/members`, {
    token: botToken,
    method: "GET",
    query: {
      ...(Array.isArray(userIds) && userIds.length ? { user_ids: userIds } : {}),
      ...(marker ? { marker } : {}),
      ...(count ? { count } : {})
    }
  });
}


async function getChat({ botToken, chatId }) {
  if (!chatId) throw new Error("chatId is required");
  return maxApi(`/chats/${encodeURIComponent(String(chatId))}`, {
    token: botToken,
    method: "GET"
  });
}

async function getBotChatMember({ botToken, chatId }) {
  if (!chatId) throw new Error("chatId is required");
  return maxApi(`/chats/${encodeURIComponent(String(chatId))}/members/me`, {
    token: botToken,
    method: "GET"
  });
}

async function getMessage({ botToken, messageId }) {
  if (!messageId) throw new Error("messageId is required");
  return maxApi(`/messages/${encodeURIComponent(String(messageId))}`, {
    token: botToken,
    method: "GET"
  });
}

async function createUpload({ botToken, type }) {
  const normalizedType = String(type || "file").trim().toLowerCase();
  return maxApi("/uploads", {
    token: botToken,
    method: "POST",
    query: { type: normalizedType }
  });
}

async function uploadBinaryToUrl({ uploadUrl, botToken, buffer, fileName, mimeType }) {
  if (!uploadUrl) throw new Error("upload_url_missing");
  if (!buffer || !buffer.length) throw new Error("upload_buffer_empty");

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
  form.append("data", blob, fileName || "upload.bin");

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...(botToken ? { Authorization: botToken } : {})
    },
    body: form
  });

  const data = await readJsonSafe(response);
  if (!response.ok) {
    const error = new Error(`MAX UPLOAD ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data || {};
}

function buildUploadAttachmentPayload({ uploadType, uploadInitResponse, uploadResponse }) {
  const normalizedType = String(uploadType || "file").trim().toLowerCase();
  const result = uploadResponse && typeof uploadResponse === "object" ? uploadResponse : {};
  const init = uploadInitResponse && typeof uploadInitResponse === "object" ? uploadInitResponse : {};

  if (result.token) return { type: normalizedType, payload: result };
  if ((normalizedType === "video" || normalizedType === "audio") && init.token) {
    return { type: normalizedType, payload: { token: init.token } };
  }
  if (Object.keys(result).length) return { type: normalizedType, payload: result };
  throw new Error("upload_payload_missing");
}


async function getAllChatMembers({ botToken, chatId, pageSize = 100, limit = 5000 } = {}) {
  const members = [];
  let marker = undefined;
  let guard = 0;
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 100), 100));
  const safeLimit = Math.max(1, Math.min(Number(limit || 5000), 20000));
  while (guard < 500 && members.length < safeLimit) {
    const data = await getChatMembers({ botToken, chatId, marker, count: safePageSize });
    const chunk = Array.isArray(data?.members) ? data.members : [];
    members.push(...chunk);
    const nextMarker = data?.marker;
    guard += 1;
    if (!nextMarker || !chunk.length) break;
    marker = nextMarker;
  }
  return members.slice(0, safeLimit);
}

function buildStartappPayload({ handoffToken, commentKey, postId, channelId } = {}) {
  const normalizedHandoff = String(handoffToken || "").trim();
  if (normalizedHandoff) return normalizedHandoff;

  const normalizedCommentKey = String(commentKey || "").trim();
  if (normalizedCommentKey) return `ck:${normalizedCommentKey}`;

  const normalizedChannelId = String(channelId || "").trim();
  const normalizedPostId = String(postId || "").trim();
  if (normalizedChannelId && normalizedPostId) return `cp:${normalizedChannelId}:${normalizedPostId}`;
  if (normalizedPostId) return `post:${normalizedPostId}`;
  return "";
}

function buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) {
  const normalizedPostId = String(postId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  const normalizedCommentKey = String(commentKey || "").trim();
  const normalizedAppBaseUrl = String(appBaseUrl || "").trim().replace(/\/$/, "");

  const normalizedHandoff = String(handoffToken || "").trim();
  const query = new URLSearchParams();
  const startapp = buildStartappPayload({ handoffToken: normalizedHandoff, commentKey: normalizedCommentKey, postId: normalizedPostId, channelId: normalizedChannelId });
  if (startapp) query.set("startapp", startapp);
  if (normalizedHandoff) query.set("handoff", normalizedHandoff);
  if (normalizedPostId) query.set("postId", normalizedPostId);
  if (normalizedChannelId) query.set("channelId", normalizedChannelId);
  if (normalizedCommentKey) query.set("commentKey", normalizedCommentKey);

  const queryString = query.toString();
  if (normalizedAppBaseUrl) {
    return `${normalizedAppBaseUrl}/app?${queryString}`;
  }

  const botDeepLink = buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken: normalizedHandoff, postId: normalizedPostId, channelId: normalizedChannelId, commentKey: normalizedCommentKey });
  return botDeepLink || `/app?${queryString}`;
}

function buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey }) {
  const normalizedBase = String(maxDeepLinkBase || "").trim().replace(/\/$/, "");
  const normalizedBotUsername = String(botUsername || "").trim().replace(/^@/, "");
  const startapp = buildStartappPayload({ handoffToken, commentKey, postId, channelId });

  if (!startapp) return "";

  const query = new URLSearchParams();
  query.set("startapp", startapp);
  const queryString = query.toString();

  if (normalizedBase) {
    return `${normalizedBase}?${queryString}`;
  }

  if (normalizedBotUsername) {
    return `https://max.ru/${normalizedBotUsername}?${queryString}`;
  }

  return "";
}

function buildCommentsButtonText(count = 0, suffix = "") {
  const total = Number(count || 0);
  const normalizedSuffix = String(suffix || "").trim();
  let text = "";
  if (total <= 0) text = "💬 Комментарии";
  else if (total === 1) text = "💬 1 комментарий";
  else if (total >= 2 && total <= 4) text = `💬 ${total} комментария`;
  else text = `💬 ${total} комментариев`;
  return normalizedSuffix ? `${text}${normalizedSuffix}` : text;
}

function buildGiftCallbackPayload({ campaignId, commentKey, channelId, postId }) {
  return JSON.stringify({
    action: "gift_claim",
    campaignId: String(campaignId || "").trim(),
    commentKey: String(commentKey || "").trim(),
    channelId: String(channelId || "").trim(),
    postId: String(postId || "").trim()
  });
}

function normalizeMaxUrl(url = "") {
  return String(url || "").trim().replace(/^https:\/\/web\.max\.ru\//i, "https://max.ru/");
}

function buildGiftKeyboardRows({ campaign, commentKey, channelId, postId }) {
  if (!campaign?.enabled) return [];

  const rows = [];
  if (campaign.showSubscribeButton === true && campaign.subscribeUrl) {
    rows.push([
      {
        type: "link",
        text: String(campaign.subscribeButtonText || "🔔 Подписаться").trim(),
        url: normalizeMaxUrl(campaign.subscribeUrl)
      }
    ]);
  }

  rows.push([
    {
      type: "callback",
      text: String(campaign.giftButtonText || "🎁 Получить подарок").trim(),
      payload: buildGiftCallbackPayload({
        campaignId: campaign.id,
        commentKey,
        channelId,
        postId
      })
    }
  ]);

  return rows;
}

function buildCommentsKeyboard({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, count = 0, extraRows = [], buttonSuffix = '', primaryButtonText = '', showPrimaryButton = true }) {
  const rows = [];

  if (showPrimaryButton) {
    const buttonText = String(primaryButtonText || "").trim() || buildCommentsButtonText(count, buttonSuffix);
    const appLink = buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey });
    const botLink = buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey });
    const launchLink = botLink || appLink || "";
    rows.push([
      {
        type: "link",
        text: buttonText,
        ...(launchLink ? { url: launchLink } : {})
      }
    ]);
  }

  const normalizedExtraRows = Array.isArray(extraRows) ? extraRows.filter((row) => Array.isArray(row) && row.length) : [];
  rows.push(...normalizedExtraRows);

  if (!rows.length) return [];

  return [
    {
      type: "inline_keyboard",
      payload: {
        buttons: rows
      }
    }
  ];
}

module.exports = {
  API_BASE_URL,
  maxApi,
  getSubscriptions,
  registerWebhook,
  editMessage,
  sendMessage,
  answerCallback,
  deleteMessage,
  getChatMembers,
  getAllChatMembers,
  getChat,
  getBotChatMember,
  getMessage,
  createUpload,
  uploadBinaryToUrl,
  buildUploadAttachmentPayload,
  buildMiniAppLaunchUrl,
  buildCommentsButtonText,
  buildCommentsKeyboard,
  buildBotStartLink,
  buildStartappPayload,
  buildGiftKeyboardRows
};
