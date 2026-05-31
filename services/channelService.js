const { getChannelsList, getPostsList, saveChannel } = require('../store');

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function idOf(item = {}) { return clean(item.channelId || item.chatId || item.chat_id || item.id); }
function titleOf(item = {}) { return clean(item.title || item.channelTitle || item.channelName || item.chatTitle || item.name); }
function typeOf(item = {}) { return clean(item.type || item.chatType || item.kind).toLowerCase(); }
function postChannelIds() { return new Set(arr(getPostsList()).map((post) => clean(post && post.channelId)).filter(Boolean)); }
function isRealChannel(item = {}, known = postChannelIds()) {
  const id = idOf(item);
  if (!id || /^external_/i.test(id)) return false;
  const type = typeOf(item);
  if (['user', 'dialog', 'dm', 'direct', 'private', 'admin'].includes(type)) return false;
  if (item.isMaxChannel === true || item.isChannel === true || type === 'channel') return true;
  if (/^-/.test(id)) return true;
  if (known.has(id)) return true;
  return false;
}
function listChannels() {
  const known = postChannelIds();
  const seen = new Set();
  return getChannelsList()
    .filter((item) => isRealChannel(item, known))
    .filter((item) => {
      const id = idOf(item);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
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
  return saveChannel(id, {
    ...(data || {}),
    channelId: id,
    title: titleOf(data),
    channelTitle: titleOf(data),
    type: 'channel',
    chatType: 'channel',
    isMaxChannel: true,
    isChannel: true
  });
}
module.exports = { listChannels, listChannelsForAdmin, registerChannel, isRealChannel };
