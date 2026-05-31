const { getChannelsList, getPostsList, saveChannel } = require('../store');

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function idOf(item = {}) { return clean(item.channelId || item.chatId || item.chat_id || item.id); }
function looksTechnical(value = '') { return /^-?\d{6,}$/.test(clean(value)) || /^id\d{6,}$/i.test(clean(value)); }
function rawType(item = {}) { return clean(item.type || item.chatType || item.kind || item.recordType || item.sourceKind).toLowerCase(); }
function rawTitle(item = {}) { return clean(item.title || item.channelTitle || item.channelName || item.chatTitle || item.name); }
function looksLikePersonalName(value = '') {
  const s = clean(value);
  if (!s || s.includes(' ') || s.includes('-') || s.includes('_') || s.includes('.') || s.length > 24) return false;
  if (/club|клуб|канал|style|стиль|admin|админ|kit|кит|blog|блог/i.test(s)) return false;
  return /^[A-Za-zА-Яа-яЁё]+$/.test(s);
}
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
function isBadChannelTitle(title = '', channelId = '') {
  const value = clean(title);
  if (!value || looksTechnical(value)) return true;
  const badNames = adminNamesForChannel(channelId);
  if (badNames.has(value.toLowerCase())) return true;
  if (looksLikePersonalName(value)) return true;
  return false;
}
function titleFromStored(channelId = '') {
  const id = clean(channelId);
  if (!id) return '';
  const candidates = arr(getChannelsList())
    .filter((x) => idOf(x) === id)
    .flatMap((item) => [item.title, item.channelTitle, item.channelName, item.chatTitle])
    .map(clean)
    .filter(Boolean)
    .filter((title) => !isBadChannelTitle(title, id));
  return candidates[0] || '';
}
function titleFromPost(post = {}) {
  const id = clean(post.channelId);
  const direct = clean(post.channelTitle || post.channelName || post.chatTitle || post.title || '');
  if (direct && !isBadChannelTitle(direct, id)) return direct;
  return titleFromStored(id) || 'Канал без названия';
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
  const raw = clean(data.title || data.channelTitle || '');
  const title = raw && !isBadChannelTitle(raw, id) ? raw : '';
  return saveChannel(id, { ...(data || {}), channelId: id, title, channelTitle: title, type: 'channel', chatType: 'channel', isMaxChannel: true, isChannel: true });
}
module.exports = { listChannels, listChannelsForAdmin, registerChannel };
