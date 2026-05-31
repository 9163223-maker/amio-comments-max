'use strict';

const store = require('../store');
let channelService = null;
let titleResolver = null;
try { channelService = require('./channelService'); } catch { channelService = null; }
try { titleResolver = require('../channel-title-resolver-cc8340'); } catch { titleResolver = null; }

const RUNTIME = 'CC8.3.40-CHANNEL-TITLE-RESOLVER';
const MAX_CAMPAIGNS_PER_CHANNEL = 100;
const DEFAULT_INVITE_LINKS = {
  '-73175958664622': 'https://max.ru/join/PX4c-5eFcI3-eS6KB82BeLQpBZqLyDjOZH5ULje21Ew'
};

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function short(value = '', max = 64) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : s.slice(0, max - 1).trim() + '…'; }
function looksTechnical(value = '') { return /^-?\d{6,}$/.test(clean(value)) || /^id\d{6,}$/i.test(clean(value)); }
function looksPersonal(value = '') { const s = clean(value); if (!s || s.includes(' ') || s.includes('-') || s.includes('_') || s.includes('.') || s.length > 24) return false; if (/club|клуб|канал|style|стиль|admin|админ|kit|кит|blog|блог/i.test(s)) return false; return /^[A-Za-zА-Яа-яЁё]+$/.test(s); }
function goodTitle(value = '') { const s = clean(value); return Boolean(s && !looksTechnical(s) && !looksPersonal(s)); }
function channelTitleById(channelId = '') {
  const id = clean(channelId);
  if (!id) return '';
  const resolved = titleResolver && titleResolver.savedTitle ? titleResolver.savedTitle(id) : '';
  if (goodTitle(resolved)) return resolved;
  const list = channelService && channelService.listChannels ? channelService.listChannels() : [];
  const found = arr(list).find((ch) => clean(ch.channelId || ch.id || ch.chatId) === id) || {};
  const title = clean(found.resolvedChannelTitle || found.channelTitle || found.title || found.channelName || found.chatTitle || '');
  return goodTitle(title) ? title : '';
}

const RU = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
function slugify(value = '') { const source = clean(value).toLowerCase(); let out = ''; for (const ch of source) out += RU[ch] !== undefined ? RU[ch] : ch; out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-').slice(0, 56); return out || `camp-${Date.now().toString(36)}`; }
function publicBase(config = {}) { return clean(config.appBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, ''); }
function isUrl(value = '') { return /^https?:\/\//i.test(clean(value)); }
function normalizeDirectUrl(value = '') {
  const raw = clean(value);
  if (!raw) return '';
  const u = /^max\.ru\//i.test(raw) ? `https://${raw}` : raw;
  if (!/^https?:\/\//i.test(u)) return '';
  if (/max\.ru\/channel\/-?[0-9]+/i.test(u)) return '';
  if (/max\.ru\/(your_channel|channel_name)/i.test(u)) return '';
  return u;
}
function usernameUrl(channel = {}) { const username = clean(channel.username || channel.userName || channel.slug || channel.handle || channel.alias || '').replace(/^@/, ''); if (!username || /^-?\d{6,}$/.test(username) || /^your_channel$/i.test(username)) return ''; return `https://max.ru/${encodeURIComponent(username)}`; }
function defaultInviteUrl(channel = {}) { return normalizeDirectUrl(DEFAULT_INVITE_LINKS[clean(channel.channelId || channel.id || '')] || ''); }
function channelById(channelId = '') { const id = clean(channelId); return store.getChannelsList().find((item) => clean(item.channelId) === id) || { channelId: id }; }
function channelTitle(channel = {}) { const id = clean(channel.channelId || channel.id || ''); const fromRegistry = channelTitleById(id); if (fromRegistry) return fromRegistry; const title = clean(channel.resolvedChannelTitle || channel.title || channel.channelTitle || channel.name || channel.channelName || channel.chatTitle); return goodTitle(title) ? title : 'Канал без названия'; }
function campaignChannelTitle(campaign = {}, channel = {}) { return channelTitleById(campaign.channelId) || (goodTitle(campaign.channelTitle) ? clean(campaign.channelTitle) : '') || channelTitle(channel); }
function targetUrlForChannel(channel = {}) { return normalizeDirectUrl(channel.link || channel.url || channel.inviteLink || channel.joinUrl || channel.maxUrl || channel.publicLink || channel.channelUrl || '') || defaultInviteUrl(channel) || usernameUrl(channel); }
function getSettings(channelId = '') { return store.getGrowthSettings(channelId); }
function allChannelsForCampaigns() { const channels = store.getChannelsList(); const map = new Map(channels.map((ch) => [clean(ch.channelId), ch])); Object.keys(store.store?.growth?.byChannel || {}).forEach((channelId) => { if (!map.has(clean(channelId))) map.set(clean(channelId), { channelId, title: clean(channelId).startsWith('external_') ? 'Внешний канал' : '' }); }); return [...map.values()].filter((ch) => clean(ch.channelId)); }
function listCampaigns(channelId = '') { const id = clean(channelId); const channels = id ? [channelById(id)] : allChannelsForCampaigns(); return channels.flatMap((ch) => { const settings = getSettings(ch.channelId); return arr(settings.adCampaigns).map((item) => ({ ...item, channelTitle: campaignChannelTitle(item, ch), url: normalizeDirectUrl(item.targetUrl || item.url || '') })); }).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)); }
function getCampaignBySlug(slug = '') { const s = clean(slug).toLowerCase(); return s ? listCampaigns('').find((item) => clean(item.slug).toLowerCase() === s) || null : null; }
function uniqueSlug(baseSlug = '') { const used = new Set(listCampaigns('').map((item) => clean(item.slug).toLowerCase()).filter(Boolean)); let slug = slugify(baseSlug); if (!used.has(slug)) return slug; for (let i = 2; i < 200; i += 1) { const candidate = `${slug}-${i}`.slice(0, 64); if (!used.has(candidate)) return candidate; } return `${slug}-${Date.now().toString(36)}`.slice(0, 64); }
function createCampaign({ channelId = '', name = '', source = '', placement = '', ad = '', createdByUserId = '', targetUrl = '', channelTitleOverride = '', config = {} } = {}) { const id = clean(channelId); if (!id) throw new Error('channel_id_required'); const ch = channelById(id); const settings = getSettings(id); const finalName = short(name || 'Рекламная кампания', 96); const finalSource = short(source || 'Источник не указан', 96); const directUrl = normalizeDirectUrl(targetUrl) || targetUrlForChannel(ch); if (!directUrl) throw new Error('direct_channel_url_required'); const title = short(goodTitle(channelTitleOverride) ? channelTitleOverride : channelTitle(ch), 96); const slug = uniqueSlug(`${title} ${finalName} ${finalSource}`); const item = { id: `ad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, slug, channelId: id, channelTitle: title, name: finalName, source: finalSource, campaign: finalName, placement: short(placement || '', 96), ad: short(ad || '', 96), targetUrl: directUrl, trackingUrl: publicBase(config) ? `${publicBase(config)}/r/${encodeURIComponent(slug)}` : '', linkMode: 'direct_channel_link', createdByUserId: clean(createdByUserId), createdAt: Date.now(), updatedAt: Date.now(), enabled: true, runtimeVersion: RUNTIME }; const next = [item, ...arr(settings.adCampaigns).filter((old) => clean(old.id) !== item.id)].slice(0, MAX_CAMPAIGNS_PER_CHANNEL); store.saveGrowthSettings(id, { ...settings, adCampaigns: next }); return item; }
function campaignUrl(campaign = {}) { return normalizeDirectUrl(campaign.targetUrl || campaign.url || ''); }
function trackingUrl(campaign = {}, config = {}) { const base = publicBase(config); if (!base || !campaign || !campaign.slug) return ''; return `${base}/r/${encodeURIComponent(clean(campaign.slug))}`; }
function recordCampaignClick({ slug = '', userId = '', query = {}, config = {} } = {}) { const campaign = getCampaignBySlug(slug); if (!campaign || campaign.enabled === false) return { ok: false, reason: 'campaign_not_found' }; const targetUrl = normalizeDirectUrl(query.target || campaign.targetUrl || ''); if (!targetUrl) return { ok: false, reason: 'target_url_missing' }; const click = store.addGrowthClick({ channelId: campaign.channelId, buttonId: campaign.id, buttonText: campaign.name, targetUrl, userId: clean(userId || query.userId || query.uid || query.u || ''), source: 'campaign', campaign: campaign.name, ad: clean(query.ad || campaign.ad || ''), placement: clean(query.placement || campaign.placement || ''), ref: clean(query.ref || campaign.slug || ''), sourceRef: clean(query.sourceRef || campaign.source || ''), utmSource: clean(query.utm_source || campaign.source || ''), utmMedium: clean(query.utm_medium || 'campaign'), utmCampaign: clean(query.utm_campaign || campaign.name || ''), utmContent: clean(query.utm_content || campaign.ad || ''), utmTerm: clean(query.utm_term || '') }); return { ok: true, campaign, click, targetUrl }; }
function statsForCampaign(campaign = {}) { const clicks = arr(store.store?.growth?.clicks).filter((click) => clean(click.buttonId) === clean(campaign.id) || clean(click.ref) === clean(campaign.slug)); const uniqueClickers = new Set(clicks.map((click) => clean(click.userId)).filter(Boolean)); return { clicks: clicks.length, uniqueClickers: uniqueClickers.size, lastClickAt: clicks[0]?.createdAt || 0 }; }
function selftest(config = {}) { const campaigns = listCampaigns(''); const registeredChannels = store.getChannelsList().length; const channelsWithDirectUrl = store.getChannelsList().filter((ch) => isUrl(targetUrlForChannel(ch))).length; const invalidCampaignUrls = campaigns.filter((c) => !campaignUrl(c)).length; return { ok: true, runtimeVersion: RUNTIME, campaigns: campaigns.map((c) => ({ id: c.id, slug: c.slug, name: c.name, source: c.source, channelTitle: c.channelTitle, url: campaignUrl(c) || null })), registeredChannels, channelsWithDirectUrl, invalidCampaignUrls, inviteLinksSupported: true, defaultInviteConfigured: Boolean(DEFAULT_INVITE_LINKS['-73175958664622']), needsChannelUrlPrompt: registeredChannels > channelsWithDirectUrl, canBuildUrl: registeredChannels ? channelsWithDirectUrl === registeredChannels : true, linkMode: 'direct_channel_link_or_invite_link', channelPickerUsesRegisteredChannels: true, manualExternalChannelFallback: true, noInventedChannelIdLinks: true, previewSuppressedByUi: true, channelTitleResolver: Boolean(titleResolver) }; }

module.exports = { RUNTIME, slugify, listCampaigns, getCampaignBySlug, createCampaign, campaignUrl, trackingUrl, recordCampaignClick, statsForCampaign, channelTitle, targetUrlForChannel, normalizeDirectUrl, selftest };
