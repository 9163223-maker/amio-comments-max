const { getChannelsList, getPostsList, saveChannel } = require('../store');

const clean = (v) => String(v || '').trim();
const arr = (v) => Array.isArray(v) ? v : [];
const idOf = (x = {}) => clean(x.channelId || x.chatId || x.chat_id || x.id);
const typeOf = (x = {}) => clean(x.type || x.chatType || x.kind || x.recordType || x.sourceKind).toLowerCase();
const badTech = (v = '') => /^-?\d{6,}$/.test(clean(v)) || /^id\d{6,}$/i.test(clean(v));
const personal = (v = '') => { const s = clean(v); if (!s || /[\s_.-]/.test(s) || s.length > 24) return false; if (/club|клуб|канал|style|стиль|admin|админ|kit|кит|blog|блог/i.test(s)) return false; return /^[A-Za-zА-Яа-яЁё]+$/.test(s); };
function badNames() {
  const set = new Set();
  arr(getChannelsList()).forEach((x) => {
    [x.linkedByName, x.ownerName, x.senderName, x.userName, x.username, x.name].map(clean).filter(Boolean).forEach((n) => set.add(n.toLowerCase()));
    const id = idOf(x), t = typeOf(x), title = clean(x.title || x.channelTitle || x.channelName || x.chatTitle || x.name);
    if ((!id || !/^-/ .test(id) || ['user','dialog','dm','direct'].includes(t)) && title && !badTech(title)) set.add(title.toLowerCase());
  });
  return set;
}
function goodTitle(title = '') {
  const t = clean(title);
  if (!t || badTech(t) || personal(t)) return '';
  if (badNames().has(t.toLowerCase())) return '';
  return t;
}
function titleFromStored(channelId = '') {
  const id = clean(channelId);
  for (const x of arr(getChannelsList()).filter((item) => idOf(item) === id)) {
    for (const t of [x.resolvedChannelTitle, x.channelTitle, x.title, x.channelName, x.chatTitle]) {
      const ok = goodTitle(t);
      if (ok) return ok;
    }
  }
  return '';
}
function titleFromPost(post = {}) {
  return titleFromStored(post.channelId) || goodTitle(post.channelTitle || post.channelName || post.chatTitle || post.title) || 'Канал без названия';
}
function isRegistryChannel(x = {}) {
  const id = idOf(x), t = typeOf(x);
  if (!id || /^external_/i.test(id)) return false;
  if (['user','dialog','dm','direct'].includes(t)) return false;
  return x.isMaxChannel === true || x.isChannel === true || t === 'channel' || /^-/.test(id);
}
function owners(x = {}) { return { linkedByUserId: clean(x.linkedByUserId || x.ownerUserId || x.createdByUserId || x.updatedByUserId), ownerUserId: clean(x.ownerUserId || x.linkedByUserId || x.createdByUserId || x.updatedByUserId) }; }
function listChannels() {
  const map = new Map();
  arr(getChannelsList()).filter(isRegistryChannel).forEach((x) => {
    const id = idOf(x); if (!id || map.has(id)) return;
    const title = titleFromStored(id) || 'Канал без названия';
    map.set(id, { ...x, channelId: id, title, channelTitle: title, type: 'channel', chatType: 'channel', isMaxChannel: true, isChannel: true, ...owners(x), hasPosts: false });
  });
  arr(getPostsList()).filter((p) => clean(p && p.channelId)).forEach((p) => {
    const id = clean(p.channelId), old = map.get(id) || {};
    const title = titleFromPost(p);
    map.set(id, { ...old, channelId: id, title, channelTitle: title, type: 'channel', chatType: 'channel', isMaxChannel: true, isChannel: true, linkedByUserId: clean(old.linkedByUserId || p.linkedByUserId), ownerUserId: clean(old.ownerUserId || p.ownerUserId || p.linkedByUserId), hasPosts: true });
  });
  return Array.from(map.values()).slice(0, 30);
}
function listChannelsForAdmin(userId = '') {
  const uid = clean(userId);
  if (!uid) return listChannels();
  return listChannels().filter((x) => { const ids = [x.linkedByUserId, x.ownerUserId, x.createdByUserId, x.updatedByUserId].map(clean).filter(Boolean); return !ids.length || ids.includes(uid); });
}
function registerChannel(channelId, data = {}) {
  const id = clean(channelId); if (!id) return null;
  const title = goodTitle(data.resolvedChannelTitle || data.title || data.channelTitle);
  return saveChannel(id, { ...(data || {}), channelId: id, title, channelTitle: title, resolvedChannelTitle: title || clean(data.resolvedChannelTitle), type: 'channel', chatType: 'channel', isMaxChannel: true, isChannel: true });
}
module.exports = { listChannels, listChannelsForAdmin, registerChannel, titleFromStored };
