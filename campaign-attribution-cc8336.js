'use strict';

const RUNTIME = 'CC8.3.36-CAMPAIGN-ATTRIBUTION';

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function n(value) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }
function short(value = '', max = 64) {
  const s = clean(value).replace(/\s+/g, ' ');
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trim() + '…';
}
function isJoinLike(kind = '') {
  const k = clean(kind).toLowerCase();
  return ['user_added', 'member_added', 'chat_member_added', 'channel_member_added'].includes(k) || (k.includes('user') && k.includes('added')) || (k.includes('member') && k.includes('added'));
}
function isLeaveLike(kind = '') {
  const k = clean(kind).toLowerCase();
  return ['user_removed', 'member_removed', 'chat_member_removed', 'channel_member_removed'].includes(k) || (k.includes('user') && k.includes('removed')) || (k.includes('member') && k.includes('removed'));
}
function find(value, predicate, depth = 6, seen = new Set()) {
  if (!value || depth < 0 || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (predicate(value)) return value;
  for (const item of (Array.isArray(value) ? value : Object.values(value))) {
    const found = find(item, predicate, depth - 1, seen);
    if (found) return found;
  }
  return null;
}
function firstValue(value, keys = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return '';
  seen.add(value);
  const wanted = new Set((Array.isArray(keys) ? keys : [keys]).map((key) => clean(key).toLowerCase()));
  for (const [key, raw] of Object.entries(value)) {
    if (wanted.has(clean(key).toLowerCase())) {
      const normalized = clean(raw);
      if (normalized && normalized !== '[object Object]') return normalized;
    }
  }
  for (const raw of Object.values(value)) {
    const found = firstValue(raw, keys, seen);
    if (found) return found;
  }
  return '';
}
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
function channelIdFromUpdate(update = {}) {
  return clean(firstValue(update, ['chat_id', 'chatId', 'channel_id', 'channelId'])) || clean(find(update, (x) => x && typeof x === 'object' && (x.chat_id || x.chatId || x.channel_id || x.channelId), 7)?.chat_id || '');
}
function userObject(update = {}) {
  return find(update, (x) => x && typeof x === 'object' && (x.user_id || x.userId || x.id) && (x.name || x.username || x.first_name || x.firstName || x.last_name || x.lastName), 7) || {};
}
function userIdFromUpdate(update = {}) {
  const user = userObject(update);
  return clean(user.user_id || user.userId || user.id) || clean(firstValue(update, ['user_id', 'userId', 'member_id', 'memberId']));
}
function findRecentCampaignClick(store, channelId = '', userId = '', at = Date.now(), windowMs = 7 * 24 * 60 * 60 * 1000) {
  const channel = clean(channelId);
  const uid = clean(userId);
  const start = n(at) - windowMs;
  const clicks = arr(store.store?.growth?.clicks)
    .filter((click) => clean(click.channelId) === channel)
    .filter((click) => clean(click.source) === 'campaign' || clean(click.ref) || clean(click.campaign))
    .filter((click) => n(click.createdAt) >= start && n(click.createdAt) <= n(at) + 5 * 60 * 1000)
    .sort((a, b) => n(b.createdAt) - n(a.createdAt));
  if (uid) {
    const exact = clicks.find((click) => clean(click.userId) === uid);
    if (exact) return { click: exact, status: 'confirmed' };
  }
  return clicks[0] ? { click: clicks[0], status: 'probable' } : { click: null, status: 'unknown' };
}
function saveAudienceEventFromUpdate(store, growth, update = {}, audit = () => {}) {
  const kind = updateType(update);
  const type = isJoinLike(kind) ? 'user_added' : (isLeaveLike(kind) ? 'user_removed' : '');
  if (!type) return null;
  const channelId = channelIdFromUpdate(update);
  const user = userObject(update);
  const userId = userIdFromUpdate(update);
  if (!channelId || !userId) {
    audit('campaign_attribution.audience_event_skipped', { updateType: kind, channelId, userId, runtimeVersion: RUNTIME });
    return null;
  }
  const createdAt = Date.now();
  let attribution = { status: type === 'user_added' ? 'unknown' : 'not_applicable', source: type === 'user_added' ? 'Источник неизвестен' : '' };
  if (type === 'user_added') {
    const match = findRecentCampaignClick(store, channelId, userId, createdAt);
    if (match.click) {
      attribution = {
        status: match.status,
        source: short(clean(match.click.campaign || match.click.sourceRef || match.click.ref || match.click.utmCampaign || match.click.utm_campaign || match.click.utmSource || match.click.utm_source || 'Рекламная кампания'), 48),
        campaign: clean(match.click.campaign || match.click.utmCampaign || match.click.utm_campaign || ''),
        ad: clean(match.click.ad || match.click.utmContent || match.click.utm_content || ''),
        placement: clean(match.click.placement || ''),
        ref: clean(match.click.ref || ''),
        sourceRef: clean(match.click.sourceRef || ''),
        clickId: clean(match.click.id || ''),
        clickedAt: n(match.click.createdAt)
      };
    }
  }
  const event = growth.saveAudienceEvent(channelId, {
    type,
    userId,
    username: clean(user.username || ''),
    firstName: clean(user.first_name || user.firstName || ''),
    lastName: clean(user.last_name || user.lastName || ''),
    name: clean(user.name || ''),
    profile: user,
    source: `webhook_${kind || type}`,
    createdAt,
    attribution
  });
  audit('campaign_attribution.audience_event_saved', { updateType: kind, type, channelId, userId, attributionStatus: attribution.status, campaign: attribution.campaign || attribution.source, runtimeVersion: RUNTIME });
  return event;
}
function campaignAudienceStats(store, campaign = {}) {
  const channelId = clean(campaign.channelId);
  const slug = clean(campaign.slug);
  const campaignName = clean(campaign.name || campaign.campaign);
  if (!channelId) return { confirmedSubscribers: 0, probableSubscribers: 0, unknownSubscribers: 0, totalSubscribers: 0, recentSubscribers: [], lastSubscriberAt: 0 };
  const channel = arr(store.getChannelsList ? store.getChannelsList() : []).find((item) => clean(item.channelId) === channelId) || {};
  const events = arr(channel.audienceEvents).filter((event) => clean(event.type) === 'user_added');
  const matched = events.filter((event) => {
    const a = event.attribution || {};
    return clean(a.ref) === slug || clean(a.campaign) === campaignName || clean(a.source) === campaignName || clean(a.sourceRef) === clean(campaign.source);
  });
  const confirmed = matched.filter((event) => clean(event.attribution?.status) === 'confirmed');
  const probable = matched.filter((event) => clean(event.attribution?.status) === 'probable');
  return {
    confirmedSubscribers: confirmed.length,
    probableSubscribers: probable.length,
    unknownSubscribers: Math.max(0, events.length - matched.length),
    totalSubscribers: matched.length,
    recentSubscribers: matched.sort((a, b) => n(b.createdAt) - n(a.createdAt)).slice(0, 5),
    lastSubscriberAt: matched.sort((a, b) => n(b.createdAt) - n(a.createdAt))[0]?.createdAt || 0
  };
}
function campaignByPayload(ads, payload = {}) {
  const slug = clean(payload.slug);
  const campaignId = clean(payload.campaignId);
  if (slug && ads.getCampaignBySlug) return ads.getCampaignBySlug(slug);
  return ads.listCampaigns('').find((item) => clean(item.id) === campaignId || clean(item.slug) === slug) || null;
}
function subscriberLines(stats = {}) {
  const confirmed = n(stats.confirmedSubscribers);
  const probable = n(stats.probableSubscribers);
  const total = confirmed + probable;
  const clicks = n(stats.clicks);
  const conversion = clicks ? `${Math.round((total / clicks) * 100)}%` : '—';
  return [
    `Подписки подтверждённые: ${confirmed}`,
    `Подписки вероятные: ${probable}`,
    `Подписки всего: ${total}`,
    `Конверсия подписки: ${conversion}`,
    stats.lastSubscriberAt ? `Последняя подписка: ${new Date(stats.lastSubscriberAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''
  ].filter(Boolean);
}
function addSubscriberStatsToScreen(screen, stats = {}) {
  if (!screen || !screen.text || screen.text.includes('Подписки вероятные:')) return screen;
  const extra = ['', 'Подписки по кампании:', ...subscriberLines(stats), '', 'Примечание: если MAX не отдаёт referrer/userId клика, подписка считается вероятной по последнему клику кампании в этом канале.'];
  screen.text += '\n' + extra.join('\n');
  return screen;
}
function install() {
  const ads = require('./services/adCampaignService');
  const statsFlow = require('./stats-flow-cc8');
  const store = require('./store');
  if (ads.__adminkitCampaignAttributionInstalled) return { ok: true, already: true, runtimeVersion: RUNTIME };
  const oldStats = ads.statsForCampaign;
  const oldSelftest = ads.selftest;
  const oldScreen = statsFlow.screenForPayload;
  ads.statsForCampaign = function statsForCampaignWithAudience(campaign = {}) {
    const base = oldStats ? oldStats(campaign) : { clicks: 0, uniqueClickers: 0, lastClickAt: 0 };
    return { ...base, ...campaignAudienceStats(store, campaign) };
  };
  ads.selftest = function selftestWithCampaignAttribution(config = {}) {
    const base = oldSelftest ? oldSelftest(config) : { ok: true };
    return { ...base, runtimeVersion: RUNTIME, campaignAttributionSupported: true, audienceEvents: arr(store.getChannelsList()).reduce((sum, ch) => sum + arr(ch.audienceEvents).length, 0), attributionModel: 'confirmed_by_same_user_click_or_probable_by_recent_channel_click' };
  };
  statsFlow.screenForPayload = async function screenForPayloadWithCampaignAttribution(menu, payload = {}, ctx = {}) {
    const screen = await oldScreen(menu, payload, ctx);
    const action = clean(payload.action);
    if (action === 'admin_stats_campaign_view' || action === 'admin_stats_campaign_copy') {
      const campaign = campaignByPayload(ads, payload);
      if (campaign) addSubscriberStatsToScreen(screen, ads.statsForCampaign(campaign));
    }
    return screen;
  };
  ads.__adminkitCampaignAttributionInstalled = true;
  return { ok: true, runtimeVersion: RUNTIME, campaignAttributionSupported: true, campaignScreensShowSubscribers: true };
}

module.exports = { RUNTIME, install, saveAudienceEventFromUpdate, campaignAudienceStats };
