'use strict';

const access = require('./clientAccessService');
const channelService = require('./channelService');

const EMPTY_CHANNEL_TEXT = 'У вас пока нет подключённых каналов.';

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function channelIdOf(channel = {}) { return clean(channel.channelId || channel.id || channel.chatId || channel.chat_id); }
function channelTitle(channel = {}) { return clean(channel.title || channel.channelTitle || channel.name || channel.channelName || channel.chatTitle || channelIdOf(channel) || 'Канал'); }
function uniqChannels(channels = []) {
  const map = new Map();
  for (const channel of arr(channels)) {
    const id = channelIdOf(channel);
    if (!id || map.has(id)) continue;
    map.set(id, { ...channel, channelId: id, title: channelTitle(channel), channelTitle: channelTitle(channel) });
  }
  return Array.from(map.values());
}

function clientVisibleChannels(maxUserId = '') {
  const uid = clean(maxUserId);
  if (!uid) return [];
  try { return uniqChannels(access.getClientChannels(uid)); } catch { return []; }
}

function clientVisibleChannelIds(maxUserId = '') {
  return new Set(clientVisibleChannels(maxUserId).map(channelIdOf).filter(Boolean));
}

function canUseClientChannel(maxUserId = '', channelId = '') {
  const id = clean(channelId);
  if (!id) return false;
  return clientVisibleChannelIds(maxUserId).has(id);
}

function deniedChannelScreen(menu, { id = 'tenant_safe_no_channels', title = '', rootAction = 'admin_section_main' } = {}) {
  const rows = [
    [menu.button('Подключить канал', 'admin_section_channels')],
    [menu.button('Как подключить', 'account_support')],
    [menu.button('🏠 Главное меню', rootAction || 'admin_section_main')]
  ];
  return {
    id,
    text: [title, '', EMPTY_CHANNEL_TEXT].filter(Boolean).join('\n'),
    attachments: menu.keyboard(rows)
  };
}

function adminVisibleStoredChannels(maxUserId = '') {
  if (!access.isAdmin(maxUserId)) return [];
  try { return uniqChannels(channelService.listChannels()); } catch { return []; }
}

module.exports = {
  EMPTY_CHANNEL_TEXT,
  clean,
  clientVisibleChannels,
  clientVisibleChannelIds,
  canUseClientChannel,
  deniedChannelScreen,
  adminVisibleStoredChannels,
  channelIdOf,
  channelTitle
};
