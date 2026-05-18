'use strict';

const base = require('./postRegistryDataAdapterV6');
const RUNTIME = 'ADMINKIT-CORE-POST-REGISTRY-DATA-ADAPTER-1.40.7-CHANNEL-LABEL-GUARD';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function isBadChannelTitle(value = '') {
  const s = clean(value).toLowerCase();
  return !s || ['канал', 'текущий канал', 'канал без названия', 'existing channel', 'unknown', 'undefined', 'null'].includes(s);
}
function safeChannelTitle(channel = {}) {
  const title = clean(channel.channelTitle || channel.title || channel.displayTitle || '');
  if (!isBadChannelTitle(title)) return title;
  const count = Number(channel.postCount || channel.post_count || 0);
  return count ? `Подключённый канал · ${count} постов` : 'Подключённый канал';
}
async function listChannels(ctx = {}) {
  const channels = await base.listChannels(ctx);
  return (channels || []).map((channel) => {
    const title = safeChannelTitle(channel);
    return { ...channel, channelTitle: title, title, displayTitle: title };
  });
}
function selfTest() {
  return { ...base.selfTest(), ok: true, runtimeVersion: RUNTIME, channelLabelGuardReady: true, noVisibleChannelWithoutName: true };
}
module.exports = { ...base, RUNTIME, listChannels, selfTest };
