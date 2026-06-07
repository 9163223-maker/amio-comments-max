'use strict';

const DEFAULT_ICON = '/public/adminkit-push-icon-192.png';
const DEFAULT_BADGE = '/public/favicon-32.png';
const DEFAULT_URL = '/push';
const MAX_PREVIEW_LENGTH = 120;

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function privatePreviewsEnabled() { return /^(1|true|yes|on)$/i.test(clean(process.env.ADMINKIT_PUSH_PRIVATE_PREVIEWS)); }
function stripMarkup(value) { return clean(value).replace(/<[^>]*>/g, '').replace(/[*_`~#>\[\](){}]/g, '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim(); }
function truncate(value, limit = MAX_PREVIEW_LENGTH) {
  const text = clean(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}
function normalizeUrl(url) {
  const text = clean(url);
  if (!text) return DEFAULT_URL;
  if (text.startsWith('/')) return text.slice(0, 300);
  try {
    const parsed = new URL(text);
    return `${parsed.pathname || '/push'}${parsed.search || ''}${parsed.hash || ''}`.slice(0, 300) || DEFAULT_URL;
  } catch { return DEFAULT_URL; }
}
function attachmentLabel(attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const haystack = list.map((item) => clean(item && (item.type || item.mediaType || item.kind || item.mimeType || item.contentType || item.name))).join(' ').toLowerCase();
  if (/photo|image|picture|img|jpeg|jpg|png|gif|webp|фото/.test(haystack)) return 'Фото';
  if (/video|mp4|mov|видео/.test(haystack)) return 'Видео';
  if (/voice|audio|ogg|opus|голос/.test(haystack)) return 'Голосовое сообщение';
  if (/file|document|pdf|doc|zip|файл/.test(haystack)) return 'Файл';
  return list.length ? 'Медиа' : '';
}
function previewText(text, attachments, fallback = 'Новое сообщение') {
  return truncate(stripMarkup(text) || attachmentLabel(attachments) || fallback);
}
function timestampOrNow(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : Date.now();
}
function safeTagPart(value) { return clean(value).replace(/[^\w.:-]+/g, '_').slice(0, 80) || 'unknown'; }
function basePayload({ title, body, tag, timestamp, data }) {
  return {
    title: truncate(clean(title), 80) || 'АдминКИТ Push',
    body: truncate(clean(body), 160) || 'Новое сообщение',
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    timestamp: timestampOrNow(timestamp),
    tag: truncate(clean(tag), 140) || `adminkit:${Date.now()}`,
    data: { ...(data || {}), url: normalizeUrl(data && data.url) }
  };
}
function buildGroupMessagePayload(input = {}) {
  const chatId = clean(input.chatId);
  const timestamp = timestampOrNow(input.timestamp);
  const preview = previewText(input.messageText, input.attachments, 'Новое сообщение');
  const sender = truncate(stripMarkup(input.senderName), 48);
  const privateMode = privatePreviewsEnabled();
  return basePayload({
    title: clean(input.chatTitle) || 'MAX чат',
    body: privateMode ? 'Новое сообщение' : (sender ? `${sender}: ${preview}` : `Новое сообщение: ${preview}`),
    timestamp,
    tag: `adminkit:chat:${safeTagPart(chatId)}:${safeTagPart(input.messageId || timestamp)}`,
    data: { source: 'max_group', chatId, messageId: clean(input.messageId), url: `/push?chatId=${encodeURIComponent(chatId)}` }
  });
}
function buildChannelPostPayload(input = {}) {
  const targetId = clean(input.chatId || input.channelId);
  const timestamp = timestampOrNow(input.timestamp);
  const preview = previewText(input.postText, input.attachments, 'Медиа');
  const privateMode = privatePreviewsEnabled();
  return basePayload({
    title: clean(input.channelTitle) || 'MAX канал',
    body: privateMode ? 'Новый пост' : `Новый пост: ${preview}`,
    timestamp,
    tag: `adminkit:post:${safeTagPart(targetId)}:${safeTagPart(input.postId || timestamp)}`,
    data: { source: 'max_channel', chatId: clean(input.chatId), channelId: clean(input.channelId), postId: clean(input.postId), url: `/push?chatId=${encodeURIComponent(targetId)}` }
  });
}
function buildAdminPayload(input = {}) {
  const timestamp = timestampOrNow(input.timestamp);
  return basePayload({
    title: clean(input.title) || 'АдминКИТ Push',
    body: previewText(input.body, input.attachments, 'Уведомление АдминКИТ Push'),
    timestamp,
    tag: clean(input.tag) || `adminkit:admin:${safeTagPart(input.messageId || timestamp)}`,
    data: { source: 'admin', url: normalizeUrl(input.url) }
  });
}
function buildPushNotificationPayload(input = {}) {
  const source = clean(input.source);
  if (source === 'max_group') return buildGroupMessagePayload(input);
  if (source === 'max_channel') return buildChannelPostPayload(input);
  return buildAdminPayload(input);
}
module.exports = { DEFAULT_ICON, DEFAULT_BADGE, buildPushNotificationPayload, buildGroupMessagePayload, buildChannelPostPayload, buildAdminPayload, previewText, attachmentLabel, stripMarkup };
