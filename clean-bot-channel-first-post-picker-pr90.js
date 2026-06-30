'use strict';

// PR258 audit hardening: keep the active RootSectionDispatcher v2 legacy wrapper
// on the same strict channel/chat predicate used by channel-post-picker-core.
// The preserved legacy implementation is loaded only after clientAccessService is
// patched, so post-scoped wrapper paths cannot receive chat-like records as
// channel targets.
const channelPickerCore = require('./channel-post-picker-core');
const clientAccessService = require('./services/clientAccessService');

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function destinationTypeOf(record = {}) {
  return clean(record.type || record.chatType || record.chat_type || record.kind || record.sourceType || record.source_type || record.destinationType || record.destination_type || '').toLowerCase();
}
function explicitChannelIdOf(record = {}) {
  return clean(record.channelId || record.channel_id || record.channel?.id || record.channel?.channelId || '');
}
function chatIdOf(record = {}) {
  return clean(record.chatId || record.chat_id || record.chat?.id || record.chat?.chatId || '');
}
function normalizedChannelId(record = {}) {
  const explicit = explicitChannelIdOf(record);
  if (explicit) return explicit;
  const generic = clean(record.id || '');
  if (generic) return generic;
  const chatId = chatIdOf(record);
  const type = destinationTypeOf(record);
  return chatId && (record.isChannel === true || /\bchannel\b/.test(type)) ? chatId : '';
}
function strictClientChannelsForUser(maxUserId = '', rawChannels = []) {
  const userId = clean(maxUserId);
  const seen = new Set();
  const out = [];
  for (const raw of arr(rawChannels)) {
    if (!raw || typeof raw !== 'object') continue;
    if (channelPickerCore.isChatLikeRecord(raw)) continue;
    if (!channelPickerCore.isKnownChannelRecord(raw, userId)) continue;
    const channelId = normalizedChannelId(raw);
    if (!channelId || seen.has(channelId)) continue;
    seen.add(channelId);
    out.push({ ...raw, channelId, type: 'channel', isChannel: true, isChat: false });
  }
  return out;
}
function installStrictChannelAccessPatch() {
  const current = clientAccessService.getClientChannels;
  if (current && current.__adminkitChannelFirstStrict === true) return current;
  const rawGetClientChannels = typeof current === 'function' ? current : () => [];
  function getClientChannelsStrict(maxUserId) {
    const rawChannels = rawGetClientChannels.apply(this, arguments);
    return strictClientChannelsForUser(maxUserId, rawChannels);
  }
  getClientChannelsStrict.__adminkitChannelFirstStrict = true;
  getClientChannelsStrict.__adminkitOriginalGetClientChannels = rawGetClientChannels;
  clientAccessService.getClientChannels = getClientChannelsStrict;
  return getClientChannelsStrict;
}

installStrictChannelAccessPatch();

const legacy = require('./clean-bot-channel-first-post-picker-pr90-legacy');

module.exports = {
  ...legacy,
  _private: {
    ...(legacy._private || {}),
    installStrictChannelAccessPatch,
    strictClientChannelsForUser,
    normalizedChannelId,
  }
};
