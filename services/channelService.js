const { getChannelsList, getPostsList, saveChannel } = require('../store');

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function idOf(item = {}) { return clean(item.channelId || item.chatId || item.chat_id || item.id); }
function looksTechnical(value = '') { return /^-?\d{6,}$/.test(clean(value)) || /^id\d{6,}$/i.test(clean(value)); }
function rawType(item = {}) { return clean(item.type || item.chatType || item.kind || item.recordType || item.sourceKind).toLowerCase(); }
function rawTitle(item = {}) { return clean(item.title || item.channelTitle || item.channelName || item.chatTitle || item.name); }
function globalLegacyAdminNames() {
  const names = new Set();
  arr(getChannelsList()).forEach((x) => {
    const id = idOf(x);
    const type = rawType(x);
    const explicitNameFields = [x.linkedByName, x.adminName, x.ownerName, x.senderName, x.userName, x.username, x.name].map(clean).filter(Boolean);
    explicitNameFields.forEach((name) => names.add(name.toLowerCase()));
    const title = rawTitle(x);
    const looksLikeProfile = !id || !/^-/.test(id) || ['user', 'dialog', 'dm', 'direct', 'private', 'admin'].includes(type);
    if (looksLikeProfile && title && !looksTechnical(title)) names.add(title.toLowerCase());
  });
  return names;
}
function adminNamesForChannel(channelId = '') {
  const id = clean(channelId);
  const names = globalLegacyAdminNames();
  arr(getChannelsList()).filter((x) => idOf(x) === id).forEach((x) => {
    [x.linkedByName, x.adminName, x.ownerName, x.senderName, x.userName, x.username, x.name].map(clean).filter(Boolean).forEach((name) => names.add(name.toLowerCase()));
  });
  return names;
}
function titleFromStored(channelId = '') {
  const id = clean(channelId);
  if (!id) return '';
  const badNames = adminNamesForChannel(id);
  const candidates = arr(getChannelsList())
    .filter((x) => idOf(x) === id)
    .flatMap((item) => [item.title, item.channelTitle, item.channelName, item.chatTitle])
    .map(clean)
    .filter(Boolean)
    .filter((title) => !looksTechnical(title))
    .filter((title) => !badNames.has(title.toLowerCase()));
  return candidates[0] || '';
}
function titleFromPost(post = {}) {
  const badNames = adminNamesForChannel(post.channelId);
  const direct = clean(post.channelTitle || post.channelName || post.chatTitle || post.title || '');
  if (direct && !looksTechnical(direct) && !badNames.has(direct.toLowerCase())) return direct;
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
      const title = titleFromPost(post);
      map.set(id, { channelId: id, title, channelTitle: title, type: 'channel', chatType: 'channel', isMaxChannel: true, isChannel: true, linkedByUserId: clean(post.linkedByUserId || ''), ownerUserId: clean(post.ownerUserId || post.linkedByUserId || '') });
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
  const badNames = adminNamesForChannel(id);
  const raw = clean(data.title || data.channelTitle || '');
  const title = raw && !looksTechnical(raw) && !badNames.has(raw.toLowerCase()) ? raw : '';
  return saveChannel(id, { ...(data || {}), channelId: id, title, channelTitle: title, type: 'channel', chatType: 'channel', isMaxChannel: true, isChannel: true });
}
module.exports = { listChannels, listChannelsForAdmin, registerChannel };
