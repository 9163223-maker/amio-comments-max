const API_BASE_URL = "https://platform-api.max.ru";
let botAudit = null;
function audit() {
  if (botAudit !== null) return botAudit;
  try { botAudit = require('../admin-bot-audit-trace'); } catch { botAudit = false; }
  return botAudit;
}
function auditLog(type, payload) { try { const a = audit(); if (a && a.log) a.log(type, payload); } catch {} }
function previewText(value = "", max = 140) { const s = String(value || "").trim().replace(/\s+/g, " "); return s.length <= max ? s : s.slice(0, max) + "…"; }
function querySummary(query) { const out = {}; if (!query || typeof query !== "object") return out; Object.entries(query).forEach(([k, v]) => { if (v === undefined || v === null || v === "") return; out[k] = Array.isArray(v) ? `array:${v.length}` : String(v); }); return out; }
function bodySummary(body) {
  if (!body || typeof body !== "object") return {};
  return {
    hasText: body.text !== undefined,
    textPreview: body.text !== undefined ? previewText(body.text) : undefined,
    attachmentCount: Array.isArray(body.attachments) ? body.attachments.length : 0,
    attachmentTypes: Array.isArray(body.attachments) ? body.attachments.map((item) => item && item.type).filter(Boolean).slice(0, 12) : [],
    hasLink: body.link !== undefined,
    hasFormat: body.format !== undefined,
    notify: body.notify
  };
}

// CC7.4.1
// Product rule: comments button must never use a visible external code.run /app URL.
// Native open_app stays primary. Payload is deterministic and short: cp_<channelId>_<postId>.
// Legacy h_ handoff is fallback only, because in-memory handoff may disappear after redeploy.
const USE_OPEN_APP_BUTTON = String(process.env.ADMINKIT_USE_OPEN_APP_BUTTON || "1").trim() !== "0";
const MAX_STARTAPP_PAYLOAD_BYTES = 512;
const CHAT_INFO_TIMEOUT_MS = Number(process.env.ADMINKIT_CHAT_INFO_TIMEOUT_MS || 350) || 350;
const WEBHOOK_UPDATE_TYPES = ["message_callback", "message_created", "bot_started", "bot_stopped", "bot_added", "bot_removed", "chat_title_changed", "user_added", "user_removed", "dialog_cleared", "dialog_removed"];

async function readJsonSafe(response) {
  try { return await response.json(); } catch { return null; }
}

function appendQueryParams(url, query) {
  if (!query || typeof query !== "object") return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") url.searchParams.append(key, String(item));
      });
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

async function maxApi(path, { token, method = "GET", query = null, body, timeoutMs = 9000 } = {}) {
  if (!token) throw new Error("BOT_TOKEN is missing");
  const url = new URL(`${API_BASE_URL}${path}`);
  appendQueryParams(url, query);
  const startedAt = Date.now();
  auditLog('max_api.request', { method, path, query: querySummary(query), body: bodySummary(body) });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(100, Number(timeoutMs || 9000)));
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
      auditLog('max_api.timeout', { method, path, ms: Date.now() - startedAt });
      const timeoutError = new Error(`MAX API timeout ${method} ${path}`);
      timeoutError.status = 408;
      throw timeoutError;
    }
    auditLog('max_api.network_error', { method, path, ms: Date.now() - startedAt, error: error && error.message || String(error) });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const data = await readJsonSafe(response);
  auditLog(response.ok ? 'max_api.response' : 'max_api.error', { method, path, status: response.status, ok: response.ok, ms: Date.now() - startedAt, responseKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 20) : [] });
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
      update_types: WEBHOOK_UPDATE_TYPES,
      ...(secret ? { secret } : {})
    }
  });
}

async function editMessage({ botToken, messageId, text, attachments, notify = false, format, link }) {
  if (!messageId) throw new Error("messageId is required");
  auditLog('bot_action.edit_message.intent', { messageId, textPreview: previewText(text), attachmentCount: Array.isArray(attachments) ? attachments.length : 0, attachmentTypes: Array.isArray(attachments) ? attachments.map((item) => item && item.type).filter(Boolean) : [], notify });
  const body = { notify };
  if (text !== undefined) body.text = text;
  if (attachments !== undefined) body.attachments = attachments;
  if (format !== undefined) body.format = format;
  if (link !== undefined) body.link = link;
  return maxApi("/messages", { token: botToken, method: "PUT", query: { message_id: messageId }, body });
}

async function sendMessage({ botToken, userId, chatId, text, attachments, format, link, notify = false }) {
  if (!userId && !chatId) throw new Error("userId_or_chatId_required");
  auditLog('bot_action.send_message.intent', { userId, chatId, textPreview: previewText(text), attachmentCount: Array.isArray(attachments) ? attachments.length : 0, attachmentTypes: Array.isArray(attachments) ? attachments.map((item) => item && item.type).filter(Boolean) : [], notify });
  const body = { notify };
  if (text !== undefined) body.text = text;
  if (attachments !== undefined) body.attachments = attachments;
  if (format !== undefined) body.format = format;
  if (link !== undefined) body.link = link;
  return maxApi("/messages", {
    token: botToken,
    method: "POST",
    query: { ...(userId ? { user_id: userId } : {}), ...(chatId ? { chat_id: chatId } : {}) },
    body
  });
}

async function deleteMessage({ botToken, messageId, timeoutMs = 2500 }) {
  if (!messageId) throw new Error("messageId is required");
  auditLog('bot_action.delete_message.intent', { messageId, timeoutMs });
  const data = await maxApi("/messages", { token: botToken, method: "DELETE", query: { message_id: messageId }, timeoutMs });
  if (data && Object.prototype.hasOwnProperty.call(data, "success") && data.success === false) {
    const error = new Error(data.message || `MAX API DELETE /messages returned success=false for ${messageId}`);
    error.data = data;
    throw error;
  }
  return data;
}

async function answerCallback({ botToken, callbackId, notification, message }) {
  if (!callbackId) return { success: false, skipped: true, reason: "callback_id_missing" };
  auditLog('bot_action.answer_callback.intent', { callbackId, hasNotification: Boolean(notification), hasMessage: Boolean(message) });
  return maxApi("/answers", {
    token: botToken,
    method: "POST",
    query: { callback_id: callbackId },
    body: { ...(notification ? { notification } : {}), ...(message ? { message } : {}) }
  });
}

async function getChatMembers({ botToken, chatId, userIds, marker, count }) {
  if (!chatId) throw new Error("chatId is required");
  return maxApi(`/chats/${encodeURIComponent(String(chatId))}/members`, {
    token: botToken,
    method: "GET",
    query: { ...(Array.isArray(userIds) && userIds.length ? { user_ids: userIds } : {}), ...(marker ? { marker } : {}), ...(count ? { count } : {}) }
  });
}

async function getChat({ botToken, chatId, timeoutMs = CHAT_INFO_TIMEOUT_MS }) {
  if (!chatId) throw new Error("chatId is required");
  return maxApi(`/chats/${encodeURIComponent(String(chatId))}`, { token: botToken, method: "GET", timeoutMs });
}

async function getBotChatMember({ botToken, chatId }) {
  if (!chatId) throw new Error("chatId is required");
  return maxApi(`/chats/${encodeURIComponent(String(chatId))}/members/me`, { token: botToken, method: "GET" });
}

async function getMessage({ botToken, messageId }) {
  if (!messageId) throw new Error("messageId is required");
  return maxApi(`/messages/${encodeURIComponent(String(messageId))}`, { token: botToken, method: "GET" });
}

async function createUpload({ botToken, type }) {
  return maxApi("/uploads", { token: botToken, method: "POST", query: { type: String(type || "file").trim().toLowerCase() } });
}

async function uploadBinaryToUrl({ uploadUrl, botToken, buffer, fileName, mimeType }) {
  if (!uploadUrl) throw new Error("upload_url_missing");
  if (!buffer || !buffer.length) throw new Error("upload_buffer_empty");
  auditLog('max_upload.request', { uploadType: mimeType, fileName, size: buffer.length });
  const startedAt = Date.now();
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
  form.append("data", blob, fileName || "upload.bin");
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { ...(botToken ? { Authorization: botToken } : {}) },
    body: form
  });
  const data = await readJsonSafe(response);
  auditLog(response.ok ? 'max_upload.response' : 'max_upload.error', { status: response.status, ok: response.ok, ms: Date.now() - startedAt, responseKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 20) : [] });
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
  if ((normalizedType === "video" || normalizedType === "audio") && init.token) return { type: normalizedType, payload: { token: init.token } };
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

function cleanStartappPayload(value = "") {
  return String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, MAX_STARTAPP_PAYLOAD_BYTES);
}

function buildStableOpenPayload({ commentKey, postId, channelId, messageId } = {}) {
  const normalizedChannelId = cleanStartappPayload(channelId);
  const normalizedPostId = cleanStartappPayload(postId || messageId);
  if (normalizedChannelId && normalizedPostId) return cleanStartappPayload(`cp_${normalizedChannelId}_${normalizedPostId}`);
  const normalizedCommentKey = cleanStartappPayload(commentKey);
  if (normalizedCommentKey) return cleanStartappPayload(`ck_${normalizedCommentKey}`);
  return "";
}

function buildStartappPayload({ handoffToken, commentKey, postId, channelId, messageId } = {}) {
  // CC7.4.1: deterministic compact post identity wins. Legacy h_ is fallback only.
  const stable = buildStableOpenPayload({ commentKey, postId, channelId, messageId });
  if (stable) return stable;
  const normalizedHandoff = cleanStartappPayload(handoffToken);
  return normalizedHandoff || "";
}

function normalizeBotUsername({ botUsername = "", maxDeepLinkBase = "" } = {}) {
  const direct = String(botUsername || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/max\.ru\//i, "")
    .replace(/[/?#].*$/, "");
  if (direct) return direct;
  return String(maxDeepLinkBase || "")
    .trim()
    .replace(/^https?:\/\/max\.ru\//i, "")
    .replace(/[/?#].*$/, "");
}

function buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId }) {
  const bot = normalizeBotUsername({ botUsername, maxDeepLinkBase });
  const startapp = buildStartappPayload({ handoffToken, commentKey, postId, channelId, messageId });
  if (!bot || !startapp) return "";
  const query = new URLSearchParams();
  query.set("startapp", startapp);
  return `https://max.ru/${bot}?${query.toString()}`;
}

function buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId }) {
  const normalizedPostId = String(postId || "").trim();
  const normalizedChannelId = String(channelId || "").trim();
  const normalizedCommentKey = String(commentKey || "").trim();
  const normalizedAppBaseUrl = String(appBaseUrl || "").trim().replace(/\/$/, "");
  const normalizedHandoff = String(handoffToken || "").trim();
  const query = new URLSearchParams();
  const startapp = buildStartappPayload({ handoffToken: normalizedHandoff, commentKey: normalizedCommentKey, postId: normalizedPostId, channelId: normalizedChannelId, messageId });
  if (startapp) query.set("startapp", startapp);
  if (normalizedHandoff) query.set("handoff", normalizedHandoff);
  if (normalizedPostId) query.set("postId", normalizedPostId);
  if (normalizedChannelId) query.set("channelId", normalizedChannelId);
  if (normalizedCommentKey) query.set("commentKey", normalizedCommentKey);
  const queryString = query.toString();
  if (normalizedAppBaseUrl) return `${normalizedAppBaseUrl}/app?${queryString}`;
  return buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken: normalizedHandoff, postId: normalizedPostId, channelId: normalizedChannelId, commentKey: normalizedCommentKey, messageId }) || `/app?${queryString}`;
}

function buildOpenAppButton({ text, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId }) {
  if (!USE_OPEN_APP_BUTTON) return null;
  const webApp = normalizeBotUsername({ botUsername, maxDeepLinkBase });
  const payload = buildStartappPayload({ handoffToken, commentKey, postId, channelId, messageId });
  if (!webApp || !payload) return null;
  return { type: "open_app", text: String(text || "💬 Комментарии").trim(), web_app: webApp, payload };
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
    rows.push([{ type: "link", text: String(campaign.subscribeButtonText || "🔔 Подписаться").trim(), url: normalizeMaxUrl(campaign.subscribeUrl) }]);
  }
  rows.push([{ type: "callback", text: String(campaign.giftButtonText || "🎁 Получить подарок").trim(), payload: buildGiftCallbackPayload({ campaignId: campaign.id, commentKey, channelId, postId }) }]);
  return rows;
}

function buildCommentsKeyboard({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, count = 0, extraRows = [], buttonSuffix = '', primaryButtonText = '', showPrimaryButton = true, messageId = '' }) {
  const rows = [];
  if (showPrimaryButton) {
    const buttonText = String(primaryButtonText || "").trim() || buildCommentsButtonText(count, buttonSuffix);
    const openAppButton = buildOpenAppButton({ text: buttonText, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId });
    if (openAppButton) {
      rows.push([openAppButton]);
    } else {
      const internalMaxLink = buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId });
      if (internalMaxLink) {
        rows.push([{ type: "link", text: buttonText, url: internalMaxLink }]);
      } else {
        rows.push([{ type: "callback", text: buttonText, payload: JSON.stringify({ action: "open_comments", commentKey, channelId, postId }) }]);
      }
    }
  }
  const normalizedExtraRows = Array.isArray(extraRows) ? extraRows.filter((row) => Array.isArray(row) && row.length) : [];
  rows.push(...normalizedExtraRows);
  if (!rows.length) return [];
  return [{ type: "inline_keyboard", payload: { buttons: rows } }];
}

module.exports = {
  API_BASE_URL,
  WEBHOOK_UPDATE_TYPES,
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
  buildStableOpenPayload,
  buildOpenAppButton,
  buildGiftKeyboardRows
};
