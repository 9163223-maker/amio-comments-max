'use strict';

const storeApi = require('./store');
const channelService = require('./services/channelService');
const giftService = require('./services/giftService');
const growthService = require('./services/growthService');

const RUNTIME = 'CC8.3.14-STATS-MONITORING-LIVE';
const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function n(value) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function short(value = '', max = 80) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trim()}…`; }
function looksTechnicalId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^id\d{6,}$/i.test(s); }
function ruTime(ts = 0) { if (!ts) return ''; try { return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
function since(ts = 0) { const diff = Date.now() - n(ts); if (!ts || diff < 0) return ''; if (diff < 90 * 1000) return 'только что'; if (diff < 60 * 60 * 1000) return `${Math.round(diff / 60000)} мин назад`; if (diff < 36 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} ч назад`; return ruTime(ts); }
function pct(part, total) { const p = n(part), t = n(total); if (!t) return '0%'; return `${Math.round((p / t) * 100)}%`; }

function channelTitle(item = {}) {
  const title = clean(item.title || item.channelTitle || item.name || item.chatTitle || item.channelName);
  return title && !looksTechnicalId(title) ? title : 'Канал без названия';
}
function allChannels() { return safe(() => arr(channelService.listChannels()), []); }
function visibleChannels(userId = '') {
  const uid = clean(userId);
  const channels = allChannels().filter((item) => clean(item && item.channelId));
  const seen = new Set();
  const deduped = channels.filter((item) => {
    const key = clean(item.channelId) + '|' + channelTitle(item).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const mine = uid ? deduped.filter((item) => clean(item.linkedByUserId) === uid) : [];
  return mine.length ? mine : deduped;
}
function visibleChannelIds(userId = '') { return new Set(visibleChannels(userId).map((item) => clean(item.channelId)).filter(Boolean)); }
function allPosts() { return safe(() => arr(storeApi.getPostsList()), []); }
function postsForUser(userId = '') { const ids = visibleChannelIds(userId); const posts = allPosts(); return ids.size ? posts.filter((post) => ids.has(clean(post && post.channelId))) : posts; }
function commentsForPost(post) { return safe(() => arr(storeApi.getComments(clean(post && post.commentKey))), []); }
function reactionCount(commentKey) {
  const map = safe(() => storeApi.getReactionsMap(clean(commentKey)), {}) || {};
  let count = 0;
  Object.values(map).forEach((byComment) => Object.values(byComment || {}).forEach((byEmoji) => Object.values(byEmoji || {}).forEach((on) => { if (on) count += 1; })));
  return count;
}
function postTitle(post = {}) {
  const text = clean(post.originalText || post.postText || post.text || post.caption || '');
  if (text) return short(text, 80);
  const media = arr(post.sourceAttachments || post.attachments).filter((item) => clean(item && item.type).toLowerCase() !== 'inline_keyboard');
  return media.length ? 'Пост с медиа' : 'Пост без текста';
}
function postViews(post = {}) {
  const values = [post.views, post.viewCount, post.viewsCount, post.stats && post.stats.views, post.originalViews, post.sourceStats && post.sourceStats.views];
  for (const value of values) { const num = n(value); if (num > 0) return num; }
  return 0;
}
function customButtonCount(post = {}) {
  const rows = arr(post.customKeyboard && post.customKeyboard.rows);
  return rows.reduce((sum, row) => sum + arr(row && row.buttons).length, 0);
}
function rawClicks() { return arr(storeApi.store && storeApi.store.growth && storeApi.store.growth.clicks); }
function clicksForChannels(ids) { const clicks = rawClicks(); return ids && ids.size ? clicks.filter((item) => ids.has(clean(item.channelId))) : clicks; }
function votesForChannels(ids) { const votes = arr(storeApi.store && storeApi.store.growth && storeApi.store.growth.pollVotes); return ids && ids.size ? votes.filter((item) => ids.has(clean(item.channelId))) : votes; }
function giftsForChannels(ids) { const campaigns = safe(() => arr(giftService.listGiftCampaigns()), []); return ids && ids.size ? campaigns.filter((item) => ids.has(clean(item.channelId || item.requiredChatId))) : campaigns; }
function claimsForCampaigns(campaigns = []) { const ids = new Set(campaigns.map((item) => clean(item.id)).filter(Boolean)); return safe(() => arr(giftService.listGiftClaims()), []).filter((claim) => !ids.size || ids.has(clean(claim.campaignId))); }
function snapshots(channelId = '') { return safe(() => arr(storeApi.listChannelMemberSnapshots(channelId)), []).sort((a, b) => n(b.capturedAt) - n(a.capturedAt)); }
function closestSnapshot(channelId = '', targetTs = 0) { let best = null; let delta = Infinity; snapshots(channelId).forEach((item) => { const ts = n(item.capturedAt); if (!ts) return; const d = Math.abs(ts - targetTs); if (d < delta) { best = item; delta = d; } }); return best; }
function audienceDeltaForChannels(channelIds = [], days = 1) {
  const ts = Date.now();
  let currentTotal = 0, previousTotal = 0, withCurrent = 0, withPrevious = 0, exactChannels = 0, joinedExact = 0, leftExact = 0;
  const joinedIds = new Set();
  const previousIds = new Set();
  const currentIds = new Set();
  channelIds.forEach((channelId) => {
    const current = snapshots(channelId)[0] || null;
    const previous = closestSnapshot(channelId, ts - days * DAY_MS);
    if (current && current.memberCount !== undefined) { currentTotal += n(current.memberCount); withCurrent += 1; }
    if (previous && previous.memberCount !== undefined && String(previous.capturedAt) !== String(current && current.capturedAt)) { previousTotal += n(previous.memberCount); withPrevious += 1; }
    const cids = new Set(arr(current && current.memberIds).map(clean).filter(Boolean));
    const pids = new Set(arr(previous && previous.memberIds).map(clean).filter(Boolean));
    cids.forEach((id) => currentIds.add(id));
    pids.forEach((id) => previousIds.add(id));
    if (cids.size && pids.size) {
      exactChannels += 1;
      cids.forEach((id) => { if (!pids.has(id)) { joinedExact += 1; joinedIds.add(id); } });
      pids.forEach((id) => { if (!cids.has(id)) leftExact += 1; });
    }
  });
  return { days, channels: channelIds.length, withCurrent, withPrevious, currentTotal, previousTotal, delta: withCurrent && withPrevious ? currentTotal - previousTotal : null, exactChannels, joinedExact, leftExact, joinedIds, previousIds, currentIds };
}
function sourceLabel(click = {}) {
  return short(clean(click.campaign || click.sourceRef || click.ref || click.utm_campaign || click.utm_source || click.source || click.buttonText || click.buttonId || 'Источник не указан'), 42);
}
function buildAttribution({ userId = '', days = 30 } = {}) {
  const ids = visibleChannelIds(userId);
  const channels = Array.from(ids);
  const d1 = audienceDeltaForChannels(channels, 1);
  const d7 = audienceDeltaForChannels(channels, 7);
  const d30 = audienceDeltaForChannels(channels, 30);
  const clicks = clicksForChannels(ids);
  const fromTs = Date.now() - Math.max(1, days) * DAY_MS;
  const recentClicks = clicks.filter((item) => n(item.createdAt) >= fromTs);
  const exactJoined = d30.joinedIds;
  const currentIds = d30.currentIds;
  const hasExact = d30.exactChannels > 0;
  const bySource = new Map();
  const seenConfirmed = new Set();
  const seenCurrent = new Set();
  const seenClickers = new Set();
  recentClicks.forEach((click) => {
    const src = sourceLabel(click);
    const item = bySource.get(src) || { source: src, clicks: 0, uniqueClickers: 0, confirmedSubscribers: 0, probableSubscribers: 0, lastAt: 0, examples: [] };
    item.clicks += 1;
    item.lastAt = Math.max(item.lastAt, n(click.createdAt));
    if (item.examples.length < 3 && clean(click.buttonText)) item.examples.push(short(click.buttonText, 32));
    const uid = clean(click.userId);
    if (uid) {
      const ck = `${src}|${uid}`;
      if (!seenClickers.has(ck)) { item.uniqueClickers += 1; seenClickers.add(ck); }
      if (exactJoined.has(uid) && !seenConfirmed.has(ck)) { item.confirmedSubscribers += 1; seenConfirmed.add(ck); }
      else if (!hasExact && currentIds.has(uid) && !seenCurrent.has(ck)) { item.probableSubscribers += 1; seenCurrent.add(ck); }
    }
    bySource.set(src, item);
  });
  const sources = Array.from(bySource.values()).sort((a, b) => (b.confirmedSubscribers + b.probableSubscribers) - (a.confirmedSubscribers + a.probableSubscribers) || b.clicks - a.clicks).slice(0, 8);
  const confirmedTotal = sources.reduce((sum, item) => sum + item.confirmedSubscribers, 0);
  const probableTotal = sources.reduce((sum, item) => sum + item.probableSubscribers, 0);
  const positiveDelta = Math.max(0, n(d30.delta));
  const unknown = positiveDelta ? Math.max(0, positiveDelta - confirmedTotal - probableTotal) : 0;
  return { channels: ids.size, d1, d7, d30, clicks: recentClicks.length, sources, confirmedTotal, probableTotal, unknown, hasExact, hasCurrentMembers: currentIds.size > 0 };
}
function buildMonitoringSnapshot({ userId = '' } = {}) {
  const ids = visibleChannelIds(userId);
  const channelIds = Array.from(ids);
  const channels = visibleChannels(userId);
  const posts = postsForUser(userId);
  const comments = posts.flatMap((post) => commentsForPost(post).map((comment) => ({ ...comment, commentKey: post.commentKey, postTitle: postTitle(post), channelId: post.channelId })));
  const dayAgo = Date.now() - DAY_MS;
  const weekAgo = Date.now() - 7 * DAY_MS;
  const comments24h = comments.filter((item) => n(item.createdAt) >= dayAgo);
  const comments7d = comments.filter((item) => n(item.createdAt) >= weekAgo);
  const reactions = posts.reduce((sum, post) => sum + reactionCount(post.commentKey), 0);
  const clicks = clicksForChannels(ids);
  const clicks24h = clicks.filter((item) => n(item.createdAt) >= dayAgo);
  const votes = votesForChannels(ids);
  const gifts = giftsForChannels(ids);
  const claims = claimsForCampaigns(gifts);
  const views = posts.reduce((sum, post) => sum + postViews(post), 0);
  const buttons = posts.reduce((sum, post) => sum + customButtonCount(post), 0);
  const participants = new Set(comments.map((item) => clean(item.userId || item.userName)).filter(Boolean));
  const clickers = new Set(clicks.map((item) => clean(item.userId)).filter(Boolean));
  const topPosts = posts.map((post) => {
    const postComments = commentsForPost(post);
    const postClicks = clicks.filter((item) => clean(item.commentKey) === clean(post.commentKey) || clean(item.postId) === clean(post.postId));
    const postVotes = votes.filter((item) => clean(item.commentKey) === clean(post.commentKey) || clean(item.postId) === clean(post.postId));
    const score = postComments.length * 5 + postClicks.length * 3 + postVotes.length * 2 + reactionCount(post.commentKey);
    return { post, title: postTitle(post), comments: postComments.length, clicks: postClicks.length, votes: postVotes.length, reactions: reactionCount(post.commentKey), views: postViews(post), score };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
  const sourceStats = buildAttribution({ userId, days: 30 });
  const d1 = sourceStats.d1;
  const d7 = sourceStats.d7;
  const d30 = sourceStats.d30;
  return { generatedAt: Date.now(), channels, channelIds, counts: { channels: channels.length || channelIds.length, subscribers: d1.withCurrent ? d1.currentTotal : null, subscriberDelta1d: d1.delta, subscriberDelta7d: d7.delta, subscriberDelta30d: d30.delta, posts: posts.length, comments: comments.length, comments24h: comments24h.length, comments7d: comments7d.length, participants: participants.size, reactions, views, buttons, clicks: clicks.length, clicks24h: clicks24h.length, clickers: clickers.size, votes: votes.length, gifts: gifts.length, giftClaims: claims.length }, posts, comments, clicks, votes, gifts, claims, topPosts, attribution: sourceStats, dataQuality: { subscriberSnapshots: channelIds.reduce((sum, id) => sum + snapshots(id).length, 0), hasExactMemberSets: sourceStats.hasExact, hasCurrentMembers: sourceStats.hasCurrentMembers, viewsReliable: views > 0, hasClicks: clicks.length > 0, hasGiftClaims: claims.length > 0 } };
}
function selftest() {
  const snap = buildMonitoringSnapshot({ userId: '' });
  return { ok: true, runtimeVersion: RUNTIME, generatedAt: Date.now(), checks: { snapshotBuilt: Boolean(snap && snap.counts), countsNumeric: Object.values(snap.counts).every((value) => value === null || Number.isFinite(Number(value))), attributionBuilt: Boolean(snap.attribution), noTechnicalIdsInChannels: snap.channels.every((item) => !looksTechnicalId(channelTitle(item))) }, counts: snap.counts, dataQuality: snap.dataQuality, attribution: { sources: snap.attribution.sources.length, confirmedTotal: snap.attribution.confirmedTotal, probableTotal: snap.attribution.probableTotal, unknown: snap.attribution.unknown } };
}
module.exports = { RUNTIME, buildMonitoringSnapshot, buildAttribution, selftest, since, ruTime, pct, short };
