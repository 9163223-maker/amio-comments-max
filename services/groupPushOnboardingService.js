'use strict';

const pairing = require('./pushPairingService');

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
    '🔔 Хотите получать уведомления этого чата на iPhone?',
    safeTitle ? `Чат: «${safeTitle}»` : '',
    '',
    'Нажмите кнопку ниже — бот отправит персональную ссылку подключения в личные сообщения.'
  ].filter((line, index) => line || index === 2).join('\n').trim();
}

function buildGroupInviteKeyboard() {
  return [{
    type: 'inline_keyboard',
    payload: {
      buttons: [[{
        type: 'callback',
        text: 'Включить уведомления',
        payload: ACTION_GROUP_PUSH_ENABLE
      }]]
    }
  }];
}

function isGroupPushEnablePayload(payload) {
  if (typeof payload === 'string') return clean(payload).split(':')[0] === ACTION_GROUP_PUSH_ENABLE;
  const action = clean(payload && (payload.action || payload.raw)).split(':')[0];
  return action === ACTION_GROUP_PUSH_ENABLE;
}

function createPersonalJoinUrl({ maxUserId, chatId, channelId = '', issuedByAdminId = '', ttlMinutes = DEFAULT_TTL_MINUTES, detectedBaseUrl = '' } = {}) {
  const base = publicBaseUrl(detectedBaseUrl);
  if (!base) {
    const error = new Error('public_base_url_required');
    error.code = 'public_base_url_required';
    throw error;
  }
  const token = pairing.createPairingToken({ maxUserId, chatId, channelId, issuedByAdminId, ttlMinutes });
  return `${base}/push/join?t=${encodeURIComponent(token)}`;
}

function buildPrivateJoinMessage({ chatTitle = '', joinUrl = '' } = {}) {
  const safeTitle = clean(chatTitle).slice(0, 120);
  return [
    `🔔 Подключение уведомлений для чата «${safeTitle}»`,
    '',
    '1. Откройте ссылку на iPhone.',
    '2. Добавьте АдминКИТ Push на экран Домой.',
    '3. Откройте и нажмите «Включить уведомления».',
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
  isGroupPushEnablePayload,
  createPersonalJoinUrl,
  buildPrivateJoinMessage,
  buildPrivateJoinKeyboard,
  publicBaseUrl
};
