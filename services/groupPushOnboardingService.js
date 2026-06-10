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

function buildGroupInviteText(title = '') {
  const safeTitle = clean(title).slice(0, 120);
  return [
    'Включите уведомления этого чата на iPhone. Нажмите кнопку — бот отправит персональную ссылку в личные сообщения.',
    safeTitle ? `Чат: «${safeTitle}»` : '',
    'Если кнопка недоступна, можно написать /push в этом чате — бот всё равно отправит ссылку только в личку.'
  ].filter(Boolean).join('\n').trim();
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
  const token = pairing.createPairingToken({ maxUserId, chatId, channelId, chatTitle, issuedByAdminId, ttlMinutes });
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
    'Если АдминКИТ PUSH уже установлен, просто откройте ссылку и нажмите «Включить уведомления».',
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
