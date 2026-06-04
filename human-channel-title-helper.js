'use strict';

const store = require('./store');
const clientAccessService = require('./services/clientAccessService');

const UNTITLED_CHANNEL = 'Канал без названия';

function clean(value) { return String(value || '').trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function looksTechnicalId(value = '') { const text = clean(value); return /^-?\d{6,}$/.test(text) || /^id\d{6,}$/i.test(text); }
function looksInternalLabel(value = '') { return /\b(?:selftest|debug|test|legacy)\b/i.test(clean(value)); }
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
function accessChannelMap(userId = '') {
  const map = new Map();
  array(safe(() => clientAccessService.getClientChannels(userId), [])).forEach((channel) => {
    const id = clean(channel.channelId || channel.id || channel.chatId);
    if (id) map.set(id, { ...channel, channelId: id });
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
function hasInternalChannelLabel(channel = {}) {
  const id = clean(channel.channelId || channel.id || channel.chatId);
  return looksInternalLabel(id) || looksInternalLabel(humanCandidate(channel)) || looksInternalLabel(humanCandidate(storedChannel(id) || {}));
}
function listTenantVisibleChannels(userId = '') {
  return Array.from(accessChannelMap(userId).values())
    .filter((channel) => !hasInternalChannelLabel(channel))
    .map((channel) => {
      const channelId = clean(channel.channelId || channel.id || channel.chatId);
      const title = resolveHumanChannelTitle(channelId, userId, channel);
      return { ...channel, channelId, title };
    })
    .filter((channel) => channel.channelId && !looksInternalLabel(channel.title));
}

module.exports = { UNTITLED_CHANNEL, resolveHumanChannelTitle, listTenantVisibleChannels, looksTechnicalId, looksInternalLabel, safeHumanTitle };
