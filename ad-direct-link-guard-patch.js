'use strict';

const RUNTIME = 'CC8.3.21-ADS-DIRECT-LINK-GUARD';

function clean(value) { return String(value || '').trim(); }
function hasScheme(value) { return /^https?:\/\//i.test(clean(value)); }
function normalizeDirectUrl(value = '') {
  const raw = clean(value);
  if (!raw) return '';
  const withScheme = /^max\.ru\//i.test(raw) ? `https://${raw}` : raw;
  if (!hasScheme(withScheme)) return '';
  if (/^https?:\/\/max\.ru\/channel\/-?\d+\/?$/i.test(withScheme)) return '';
  if (/^https?:\/\/max\.ru\/(your_channel|channel_name)\/?$/i.test(withScheme)) return '';
  return withScheme;
}
function usernameUrl(channel = {}) {
  const username = clean(channel.username || channel.userName || channel.slug || channel.handle || channel.alias || '').replace(/^@/, '');
  if (!username || /^-?\d{6,}$/.test(username) || /^your_channel$/i.test(username)) return '';
  return `https://max.ru/${encodeURIComponent(username)}`;
}
function install() {
  const store = require('./store');
  const svc = require('./services/adCampaignService');
  if (svc.__adminkitDirectLinkGuardInstalled) return { ok: true, already: true, runtimeVersion: RUNTIME };
  const originalCreateCampaign = svc.createCampaign;
  svc.normalizeDirectUrl = normalizeDirectUrl;
  svc.targetUrlForChannel = function targetUrlForChannel(channel = {}) {
    return normalizeDirectUrl(channel.link || channel.url || channel.inviteLink || channel.joinUrl || channel.maxUrl || channel.publicLink || channel.channelUrl || '') || usernameUrl(channel);
  };
  svc.campaignUrl = function campaignUrl(campaign = {}) {
    return normalizeDirectUrl(campaign.targetUrl || campaign.url || '');
  };
  svc.createCampaign = function createCampaignGuarded(input = {}) {
    const channelId = clean(input.channelId);
    const channel = store.getChannelsList().find((item) => clean(item.channelId) === channelId) || { channelId };
    const direct = normalizeDirectUrl(input.targetUrl || '') || svc.targetUrlForChannel(channel);
    if (!direct) throw new Error('direct_channel_url_required');
    return originalCreateCampaign({ ...input, targetUrl: direct, runtimeVersion: RUNTIME });
  };
  const originalSelftest = svc.selftest;
  svc.selftest = function selftest(config = {}) {
    const base = originalSelftest ? originalSelftest(config) : { ok: true };
    const campaigns = svc.listCampaigns('').map((c) => ({ id: c.id, slug: c.slug, name: c.name, source: c.source, channelTitle: c.channelTitle, url: svc.campaignUrl(c) || null }));
    const channels = store.getChannelsList();
    const channelsWithDirectUrl = channels.filter((ch) => Boolean(svc.targetUrlForChannel(ch))).length;
    return { ...base, runtimeVersion: RUNTIME, campaigns, registeredChannels: channels.length, channelsWithDirectUrl, invalidCampaignUrls: campaigns.filter((c) => !c.url).length, needsChannelUrlPrompt: channels.length > channelsWithDirectUrl, noInventedChannelIdLinks: true };
  };
  svc.__adminkitDirectLinkGuardInstalled = true;
  return { ok: true, runtimeVersion: RUNTIME };
}

module.exports = { RUNTIME, install, normalizeDirectUrl };
