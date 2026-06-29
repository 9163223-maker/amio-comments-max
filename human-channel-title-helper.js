'use strict';

const store = require('./store');
const clientAccessService = require('./services/clientAccessService');

const UNTITLED_CHANNEL = 'Канал без названия';

function clean(value) { return String(value || '').trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function looksTechnicalId(value = '') { const text = clean(value); return /^-?\d{6,}$/.test(text) || /^id\d{6,}$/i.test(text); }
function looksInternalLabel(value = '') { return /(^|[^A-Za-z0-9А-Яа-яЁё])(?:selftest|debug|test|legacy|global|internal)(?:[^A-Za-z0-9А-Яа-яЁё]|$)/i.test(clean(value)); }
function humanCandidate(source = {}) { return clean(source.title || source.channelTitle || source.name || source.channelName || source.chatTitle || source.chat_title || ''); }
function safeHumanTitle(value = '') {
  const title = clean(value);
  if (!title || looksTechnicalId(title) || looksInternalLabel(title)) return '';
  return title;
}
function storedChannel(channelId = '') {
  const id = clean(channelId);
  if (!id) return null;
  return safe(() => array(store.getChannelsList()).find((item) => clean(item.channelId || item.id || item.chatId) === id), null) || null;
}
function destinationType(channel = {}) { return clean(channel.type || channel.chatType || channel.chat_type || channel.kind || channel.sourceType || channel.source_type).toLowerCase(); }
function rawExplicitChannelId(channel = {}) { return clean(channel.channelId || channel.channel_id || channel.channel?.id || channel.channel?.channelId || ''); }
function rawChatId(channel = {}) { return clean(channel.chatId || channel.chat_id || channel.chat?.id || channel.chat?.chatId || ''); }
function explicitChannelId(channel = {}) { return rawExplicitChannelId(channel); }
function accessChannelMap(userId = '') {
  const map = new Map();
  array(safe(() => clientAccessService.getClientChannels(userId), [])).forEach((channel) => {
    const explicitId = rawExplicitChannelId(channel);
    const genericId = clean(channel.id || '');
    const chatId = rawChatId(channel);
    const type = destinationType(channel);
    const id = explicitId || genericId || (chatId && (channel.isChannel === true || /\bchannel\b/.test(type)) ? chatId : '');
    if (id) map.set(id, { ...channel, channelId: id, __rawChatIdOnly: Boolean(chatId && !explicitId && !genericId) });
  });
  return map;
}
function resolveHumanChannelTitle(channelId = '', userId = '', fallbackSource = {}) {
  const id = clean(channelId || fallbackSource.channelId || fallbackSource.requiredChatId || fallbackSource.id || '');
  const fromAccess = id ? humanCandidate(accessChannelMap(userId).get(id) || {}) : '';
  const accessTitle = safeHumanTitle(fromAccess);
  if (accessTitle) return accessTitle;
  const explicit = safeHumanTitle(humanCandidate(fallbackSource));
  if (explicit) return explicit;
  const fromStore = id ? safeHumanTitle(humanCandidate(storedChannel(id) || {})) : '';
  if (fromStore) return fromStore;
  return UNTITLED_CHANNEL;
}
function isIntentionalUserTestTitle(value = '') { return /(^|[^А-Яа-яЁё])(?:ак[\s-]*тест|тест[А-Яа-яЁё\d\s-]*)(?:[^А-Яа-яЁё]|$)/i.test(clean(value)); }
function hasInternalChannelLabel(channel = {}) {
  const id = clean(channel.channelId || channel.id || channel.chatId);
  const human = [humanCandidate(channel), humanCandidate(storedChannel(id) || {})].join(' ');
  if (looksInternalLabel(human) && !isIntentionalUserTestTitle(human)) return true;
  if (looksInternalLabel(id) && (!safeHumanTitle(human) || looksInternalLabel(human))) return true;
  return false;
}
function looksLikeChatRecord(channel = {}) {
  const type = destinationType(channel);
  if (channel.isChat === true) return true;
  if (/\b(?:chat|group|supergroup|dialog|im)\b/.test(type) && !/\bchannel\b/.test(type)) return true;
  if (channel.__rawChatIdOnly && channel.isChannel !== true && !/\bchannel\b/.test(type)) return true;
  if (rawChatId(channel) && !explicitChannelId(channel) && channel.isChannel !== true && !/\bchannel\b/.test(type)) return true;
  return false;
}
function looksLikeChannelRecord(channel = {}) {
  const type = destinationType(channel);
  if (looksLikeChatRecord(channel)) return false;
  return channel.isChannel === true || explicitChannelId(channel) || (/\bchannel\b/.test(type) && !/\b(?:chat|group|dialog|im)\b/.test(type));
}
function listTenantVisibleChannels(userId = '') {
  return Array.from(accessChannelMap(userId).values())
    .filter((channel) => looksLikeChannelRecord(channel))
    .filter((channel) => !hasInternalChannelLabel(channel))
    .map((channel) => {
      const channelId = clean(channel.channelId || channel.id || channel.chatId);
      const title = resolveHumanChannelTitle(channelId, userId, channel);
      return { ...channel, channelId, title };
    })
    .filter((channel) => channel.channelId && !looksInternalLabel(channel.title));
}

module.exports = { UNTITLED_CHANNEL, resolveHumanChannelTitle, listTenantVisibleChannels, looksTechnicalId, looksInternalLabel, safeHumanTitle, isIntentionalUserTestTitle, looksLikeChatRecord, looksLikeChannelRecord };
