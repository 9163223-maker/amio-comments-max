'use strict';

const pairing = require('./pushPairingService');
const shortLinks = require('./shortLinkService');

const ACTION_GROUP_PUSH_ENABLE = 'group_push_enable';
const DEFAULT_TTL_MINUTES = 60;

function clean(value) {
  return String(value || '').trim();
}

function trimBaseUrl(value) {
  return clean(value).replace(/\/+$/, '');
}

function publicBaseUrl(detectedBaseUrl = '') {
  return trimBaseUrl(process.env.PUBLIC_BASE_URL || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || detectedBaseUrl);
}

function normalizeChatTitle(value) {
  const title = clean(value).replace(/\s+/g, ' ').slice(0, 120);
  if (!title || /^-?\d{5,}$/.test(title)) return '';
  return title;
}

function chatTitleFromSource(source = {}) {
  const body = source && typeof source.body === 'object' ? source.body : {};
  const candidates = [
    source?.recipient?.title,
    source?.recipient?.chat_title,
    source?.chat?.title,
    body?.recipient?.title,
    body?.recipient?.chat_title,
    body?.chat?.title,
    source?.title,
    source?.chatTitle
  ];
  for (const candidate of candidates) {
    const title = normalizeChatTitle(candidate);
    if (title) return title;
  }
  return '';
}

function chatTitleFromChat(chat = {}) {
  return normalizeChatTitle(chat?.title || chat?.chat_title || chat?.name);
}

async function resolveChatTitle({ message = {}, body = {}, chatId = '', storedTitle = '', botToken = '', api } = {}) {
  const embedded = chatTitleFromSource(message) || chatTitleFromSource({ body }) || normalizeChatTitle(storedTitle);
  if (embedded) return { chatTitle: embedded, titleMissing: false, source: 'update_or_registry' };
  if (clean(chatId) && clean(botToken) && api && typeof api.getChat === 'function') {
    try {
      const chat = await api.getChat({ botToken, chatId: clean(chatId) });
      const fetched = chatTitleFromChat(chat);
      if (fetched) return { chatTitle: fetched, titleMissing: false, source: 'max_api' };
    } catch {}
  }
  return { chatTitle: 'Чат MAX', titleMissing: true, source: 'fallback' };
}

function buildGroupInviteText(title = '', options = {}) {
  const kind = clean(options.kind || options.chatType).toLowerCase();
  const isChannel = kind === 'channel';
  return [
    isChannel ? '🔔 Уведомления этого MAX-канала' : '🔔 Уведомления для этого MAX-чата',
    '',
    'Получайте push-уведомления на iPhone/iPad через АдминКИТ PUSH.',
    '',
    'Нажмите кнопку ниже — бот отправит персональную ссылку в личные сообщения.'
  ].join('\n');
}

function buildGroupInviteKeyboard() {
  return [{
    type: 'inline_keyboard',
    payload: {
      buttons: [[{
        type: 'callback',
        text: '🔔 Подключить уведомления',
        payload: ACTION_GROUP_PUSH_ENABLE,
        action: ACTION_GROUP_PUSH_ENABLE
      }]]
    }
  }];
}

function isGroupPushCommandText(text) {
  const normalized = clean(text).replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return false;
  if (/^\/push(?:@[\w.:-]+)?(?:\s|$)/i.test(normalized)) return true;
  return new Set(['пуш', 'уведомления', 'включить уведомления']).has(normalized);
}

function isGroupPushEnablePayload(payload) {
  if (typeof payload === 'string') return clean(payload).split(':')[0] === ACTION_GROUP_PUSH_ENABLE;
  const action = clean(payload && (payload.action || payload.raw)).split(':')[0];
  return action === ACTION_GROUP_PUSH_ENABLE;
}

function createPersonalJoinUrl({ maxUserId, chatId, channelId = '', chatTitle = '', issuedByAdminId = '', ttlMinutes = DEFAULT_TTL_MINUTES, detectedBaseUrl = '' } = {}) {
  const base = publicBaseUrl(detectedBaseUrl);
  if (!base) {
    const error = new Error('public_base_url_required');
    error.code = 'public_base_url_required';
    throw error;
  }
  const resolvedTitle = normalizeChatTitle(chatTitle) || 'Чат MAX';
  const token = pairing.createPairingToken({ maxUserId, chatId, channelId, chatTitle: resolvedTitle, issuedByAdminId, ttlMinutes });
  return `${base}/push/join?t=${encodeURIComponent(token)}`;
}

async function createPersonalJoinLinkForMessage(options = {}) {
  const longUrl = createPersonalJoinUrl(options);
  return shortLinks.createShortUrlOrFallback(longUrl);
}

function buildPrivateJoinMessage({ chatTitle = '', joinUrl = '' } = {}) {
  const safeTitle = clean(chatTitle).slice(0, 120) || 'Чат MAX';
  return [
    `🔔 Уведомления для чата «${safeTitle}»`,
    'Откройте ссылку на iPhone/iPad и включите уведомления в АдминКИТ PUSH.',
    'Если АдминКИТ PUSH уже установлен, просто откройте ссылку, затем откройте приложение с экрана Домой и подключите этот чат.',
    '',
    clean(joinUrl)
  ].join('\n');
}
function buildPrivateJoinKeyboard(joinUrl = '') {
  const url = clean(joinUrl);
  if (!url) return undefined;
  return [{
    type: 'inline_keyboard',
    payload: { buttons: [[{ type: 'link', text: 'Открыть подключение', url }]] }
  }];
}

module.exports = {
  ACTION_GROUP_PUSH_ENABLE,
  DEFAULT_TTL_MINUTES,
  normalizeChatTitle,
  chatTitleFromSource,
  resolveChatTitle,
  buildGroupInviteText,
  buildGroupInviteKeyboard,
  isGroupPushCommandText,
  isGroupPushEnablePayload,
  createPersonalJoinUrl,
  createPersonalJoinLinkForMessage,
  buildPrivateJoinMessage,
  buildPrivateJoinKeyboard,
  publicBaseUrl
};
