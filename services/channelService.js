const { getChannelsList, getPostsList, saveChannel } = require('../store');

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function idOf(item = {}) { return clean(item.channelId || item.chatId || item.chat_id || item.id); }
function looksTechnical(value = '') { return /^-?\d{6,}$/.test(clean(value)) || /^id\d{6,}$/i.test(clean(value)); }
function titleFromStored(channelId = '') {
  const id = clean(channelId);
  if (!id) return '';
  const item = arr(getChannelsList()).find((x) => idOf(x) === id) || {};
  const title = clean(item.title || item.channelTitle || item.channelName || item.chatTitle || '');
  const linked = clean(item.linkedByName || item.adminName || item.ownerName || item.senderName || '');
  if (!title || looksTechnical(title)) return '';
  if (linked && title.toLowerCase() === linked.toLowerCase()) return '';
  return title;
}
function titleFromPost(post = {}) {
  const direct = clean(post.channelTitle || post.channelName || post.chatTitle || post.title || '');
  if (direct && !looksTechnical(direct)) return direct;
  return titleFromStored(post.channelId) || 'Канал без названия';
}
function listChannels() {
  const map = new Map();
  arr(getPostsList())
    .filter((post) => clean(post && post.channelId))
    .sort((a, b) => Number(b.updatedAt || b.createdAt || b.ts || 0) - Number(a.updatedAt || a.createdAt || a.ts || 0))
    .forEach((post) => {
      const id = clean(post.channelId);
      if (!id || map.has(id)) return;
      map.set(id, { channelId: id, title: titleFromPost(post), channelTitle: titleFromPost(post), type: 'channel', chatType: 'channel', isMaxChannel: true, isChannel: true, linkedByUserId: clean(post.linkedByUserId || ''), ownerUserId: clean(post.ownerUserId || post.linkedByUserId || '') });
    });
  return Array.from(map.values()).slice(0, 20);
}
function listChannelsForAdmin(userId = '') {
  const uid = clean(userId);
  if (!uid) return listChannels();
  return listChannels().filter((item) => {
    const owners = [item.linkedByUserId, item.ownerUserId, item.createdByUserId, item.updatedByUserId].map(clean).filter(Boolean);
    return !owners.length || owners.includes(uid);
  });
}
function registerChannel(channelId, data = {}) {
  const id = clean(channelId);
  if (!id) return null;
  const title = clean(data.title || data.channelTitle || '');
  return saveChannel(id, { ...(data || {}), channelId: id, title, channelTitle: title, type: 'channel', chatType: 'channel', isMaxChannel: true, isChannel: true });
}
module.exports = { listChannels, listChannelsForAdmin, registerChannel };
