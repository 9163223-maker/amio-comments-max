'use strict';

const DEFAULT_ICON = '/public/adminkit-push-icon-192.png';
const DEFAULT_BADGE = '/public/favicon-32.png';
const DEFAULT_URL = '/push';
const SERVICE_NAME = 'АдминКИТ PUSH';
const MAX_PREVIEW_LENGTH = 120;

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function cleanBody(value) { return String(value || '').replace(/\r/g, '').split('\n').map((line) => clean(line)).filter(Boolean).join('\n').trim(); }
function stripMarkup(value) {
  return clean(value)
    .replace(/<[^>]*>/g, '')
    .replace(/[*_`~#>\[\](){}]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:token|endpoint|auth|p256dh|device[ _-]?id|handoff|binding|api|debug)\b\s*[:=]?\s*\S*/gi, '')
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function truncate(value, limit = MAX_PREVIEW_LENGTH, preserveNewlines = false) {
  const text = preserveNewlines ? cleanBody(value) : clean(value);
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
function attachmentKind(attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const haystack = list.map((item) => clean(item && (item.type || item.mediaType || item.kind || item.mimeType || item.contentType || item.name))).join(' ').toLowerCase();
  if (/photo|image|picture|img|jpeg|jpg|png|gif|webp|фото/.test(haystack)) return 'photo';
  if (/video|mp4|mov|видео/.test(haystack)) return 'video';
  if (/voice|audio|ogg|opus|голос/.test(haystack)) return 'voice';
  if (/file|document|pdf|doc|zip|файл/.test(haystack)) return 'file';
  if (/sticker|стикер/.test(haystack)) return 'sticker';
  return list.length ? 'other' : '';
}
function attachmentLabel(attachments) {
  const kind = attachmentKind(attachments);
  if (kind === 'photo') return 'Фото';
  if (kind === 'file') return 'Файл';
  if (kind === 'video') return 'Видео';
  if (kind === 'voice') return 'Голосовое сообщение';
  return kind ? 'Сообщение' : '';
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
    title: truncate(clean(title), 80) || SERVICE_NAME,
    body: truncate(body, 160, true) || 'Новое сообщение',
    icon: DEFAULT_ICON,
    badge: DEFAULT_BADGE,
    timestamp: timestampOrNow(timestamp),
    tag: truncate(clean(tag), 140) || `adminkit:${Date.now()}`,
    data: { ...(data || {}), url: normalizeUrl(data && data.url) }
  };
}
function selectChatTitle(input = {}) {
  const candidates = [
    ['resolved_binding', input.resolvedChatTitle],
    ['stored_binding', input.storedChatTitle],
    ['max_event', input.chatTitle]
  ];
  for (const [source, value] of candidates) {
    const title = truncate(stripMarkup(value), 80);
    if (title) return { title, source };
  }
  return { title: 'Чат MAX', source: 'fallback' };
}
function groupMessageBody(input = {}) {
  const sender = truncate(stripMarkup(input.senderName), 48) || 'Участник';
  const text = truncate(stripMarkup(input.messageText), MAX_PREVIEW_LENGTH);
  const kind = attachmentKind(input.attachments);
  if (text) return { body: `${sender}: ${text}`, source: 'sender_text' };
  if (kind === 'photo') return { body: `${sender}: Фото`, source: 'sender_photo' };
  if (kind === 'file') return { body: `${sender}: Файл`, source: 'sender_file' };
  if (kind === 'video') return { body: `${sender}: Видео`, source: 'sender_video' };
  if (kind === 'voice') return { body: `${sender}: Голосовое сообщение`, source: 'sender_voice' };
  return { body: `${sender}: Новое сообщение`, source: 'sender_fallback' };
}
function buildGroupMessagePayload(input = {}) {
  const chatId = clean(input.chatId);
  const timestamp = timestampOrNow(input.timestamp);
  const title = selectChatTitle(input);
  const body = groupMessageBody(input);
  return basePayload({
    title: SERVICE_NAME,
    body: `${title.title}\n${body.body}`,
    timestamp,
    tag: `adminkit:chat:${safeTagPart(chatId)}:${safeTagPart(input.messageId || timestamp)}`,
    data: {
      source: 'max_group',
      chatId,
      messageId: clean(input.messageId),
      notificationTitleSource: title.source,
      notificationBodySource: body.source,
      url: `/push?chatId=${encodeURIComponent(chatId)}`
    }
  });
}
function buildChannelPostPayload(input = {}) {
  const targetId = clean(input.chatId || input.channelId);
  const timestamp = timestampOrNow(input.timestamp);
  const preview = previewText(input.postText, input.attachments, 'Медиа');
  const privateMode = /^(1|true|yes|on)$/i.test(clean(process.env.ADMINKIT_PUSH_PRIVATE_PREVIEWS));
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
    title: clean(input.title) || SERVICE_NAME,
    body: previewText(input.body, input.attachments, `Уведомление ${SERVICE_NAME}`),
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
module.exports = { SERVICE_NAME, DEFAULT_ICON, DEFAULT_BADGE, buildPushNotificationPayload, buildGroupMessagePayload, buildChannelPostPayload, buildAdminPayload, previewText, attachmentLabel, attachmentKind, stripMarkup, selectChatTitle, groupMessageBody };
