'use strict';

const postArchive = require('./postgres-post-archive');
const store = require('./store');
const channelService = require('./services/channelService');
const giftService = require('./services/giftService');
const growthService = require('./services/growthService');

const RUNTIME = 'CC8.0.7-STATS-LIVE-FAST-ADAPTER';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_POST_BUTTONS = 8;
let lastRefreshState = { status: 'idle', startedAt: 0, finishedAt: 0, ok: 0, errors: 0, channels: 0, lastError: '' };

function clean(value) { return String(value || '').trim(); }
function n(value) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }
function short(value, max = 64) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : s.slice(0, max - 1).trim() + '…'; }
function array(value) { return Array.isArray(value) ? value : []; }
function now() { return Date.now(); }
function safeCall(fn, fallback) { try { return fn(); } catch { return fallback; } }
function safeAsync(fn) { setImmediate(() => Promise.resolve().then(fn).catch(() => {})); }

async function cachedCounts() {
  try {
    const status = await postArchive.status();
    const counts = status && status.counts || {};
    return {
      ok: Boolean(status && status.ok),
      configured: Boolean(status && status.configured),
      lastError: clean(status && status.lastError),
      counts: { channels: n(counts.channels), posts: n(counts.posts), snapshots: n(counts.snapshots), archive: n(counts.archive) }
    };
  } catch (error) {
    return { ok: false, configured: postArchive.isConfigured ? postArchive.isConfigured() : false, lastError: clean(error && error.message || error), counts: { channels: 0, posts: 0, snapshots: 0, archive: 0 } };
  }
}

function button(menu, text, action, extra) { return menu.button(text, action, extra || {}); }
function footer(menu) { return [[button(menu, '📊 В начало статистики', 'admin_section_stats')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]; }
function screen(menu, id, title, lines, rows) { return { id, text: [title, '', ...(lines || [])].filter(Boolean).join('\n'), attachments: menu.keyboard(rows || footer(menu)) }; }
function statusLine(data) {
  if (data.ok) return 'Источник: быстрый Postgres/cache. Live-обновление запускается отдельным быстрым адаптером.';
  if (!data.configured) return 'Источник: Postgres не настроен для статистики.';
  return 'Источник: Postgres/cache. Последняя ошибка: ' + (data.lastError || 'unknown');
}

function allChannels() { return safeCall(() => array(channelService.listChannels()), []); }
function channelTitle(item) { return clean(item && (item.title || item.channelTitle || item.name || item.chatTitle || item.channelName)) || clean(item && item.channelId) || 'Канал'; }
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
function allPosts() { return safeCall(() => array(store.getPostsList()), []); }
function postsForUser(userId = '') { const ids = visibleChannelIds(userId); const posts = allPosts(); return ids.size ? posts.filter((post) => ids.has(clean(post && post.channelId))) : posts; }
function commentsForPost(post) { return safeCall(() => array(store.getComments(clean(post && post.commentKey))), []); }
function reactionsForKey(commentKey) {
  const map = safeCall(() => store.getReactionsMap(clean(commentKey)), {}) || {};
  let count = 0;
  Object.values(map).forEach((byEmoji) => Object.values(byEmoji || {}).forEach((byUser) => Object.values(byUser || {}).forEach((on) => { if (on) count += 1; })));
  return count;
}
function postViews(post) {
  const candidates = [post && post.views, post && post.viewCount, post && post.viewsCount, post && post.stats && post.stats.views, post && post.originalViews, post && post.sourceStats && post.sourceStats.views];
  for (const value of candidates) { const num = n(value); if (num > 0) return num; }
  return 0;
}
function customButtonCount(post) { const rows = array(post && post.customKeyboard && post.customKeyboard.rows); return rows.reduce((sum, row) => sum + array(row && row.buttons).length, 0); }
function giftsForChannels(ids) { const campaigns = safeCall(() => array(giftService.listGiftCampaigns()), []); return ids && ids.size ? campaigns.filter((item) => ids.has(clean(item.channelId || item.requiredChatId))) : campaigns; }
function clicksForChannels(ids) { const clicks = safeCall(() => array(growthService.listGrowthClicks({ limit: 5000 })), []); return ids && ids.size ? clicks.filter((item) => ids.has(clean(item.channelId))) : clicks; }
function pollVotesForChannels(ids) {
  const values = [];
  const channels = ids && ids.size ? Array.from(ids) : [''];
  channels.forEach((channelId) => { values.push(...safeCall(() => array(growthService.listGrowthPollVotes(channelId ? { channelId } : {})), [])); });
  return values;
}
function snapshotList(channelId) { return safeCall(() => array(store.listChannelMemberSnapshots(channelId)), []).sort((a, b) => n(b.capturedAt) - n(a.capturedAt)); }
function closestSnapshot(channelId, targetTs) {
  let best = null; let delta = Infinity;
  snapshotList(channelId).forEach((item) => { const ts = n(item.capturedAt); if (!ts) return; const d = Math.abs(ts - targetTs); if (d < delta) { best = item; delta = d; } });
  return best;
}
function audienceDelta(userId = '', days = 1) {
  const ids = Array.from(visibleChannelIds(userId));
  const ts = now();
  let currentTotal = 0; let previousTotal = 0; let withCurrent = 0; let withPrevious = 0;
  ids.forEach((channelId) => {
    const current = snapshotList(channelId)[0] || null;
    const previous = closestSnapshot(channelId, ts - days * DAY_MS);
    if (current && current.memberCount !== undefined) { currentTotal += n(current.memberCount); withCurrent += 1; }
    if (previous && previous.memberCount !== undefined && String(previous.capturedAt) !== String(current && current.capturedAt)) { previousTotal += n(previous.memberCount); withPrevious += 1; }
  });
  return { days, channels: ids.length, withCurrent, withPrevious, currentTotal, previousTotal, delta: withCurrent && withPrevious ? currentTotal - previousTotal : null };
}
function collectStats(userId = '') {
  const posts = postsForUser(userId);
  const channelIds = visibleChannelIds(userId);
  const comments = posts.flatMap((post) => commentsForPost(post));
  const weekAgo = now() - 7 * DAY_MS;
  const commentsWeek = comments.filter((item) => n(item.createdAt) >= weekAgo);
  const reactions = posts.reduce((sum, post) => sum + reactionsForKey(post && post.commentKey), 0);
  const views = posts.reduce((sum, post) => sum + postViews(post), 0);
  const buttons = posts.reduce((sum, post) => sum + customButtonCount(post), 0);
  const gifts = giftsForChannels(channelIds);
  const clicks = clicksForChannels(channelIds);
  const votes = pollVotesForChannels(channelIds);
  const uniqueCommenters = new Set(comments.map((item) => clean(item && (item.userId || item.userName))).filter(Boolean));
  const uniqueClickers = new Set(clicks.map((item) => clean(item && item.userId)).filter(Boolean));
  return { channelIds, posts, comments, commentsWeek, reactions, views, buttons, gifts, clicks, votes, uniqueCommenters, uniqueClickers };
}
function postScore(post) { return commentsForPost(post).length * 5 + reactionsForKey(post && post.commentKey) * 2 + customButtonCount(post) + postViews(post); }
function postTitle(post) { return short(post && (post.originalText || post.postText || post.text || post.caption || post.postId || post.messageId || post.commentKey), 56); }
function recentPosts(userId = '') { return postsForUser(userId).slice().sort((a, b) => n(b.updatedAt || b.createdAt || b.ts) - n(a.updatedAt || a.createdAt || a.ts)).slice(0, MAX_POST_BUTTONS); }
function analyticsForPost(commentKey) { return safeCall(() => growthService.buildPostAnalytics(clean(commentKey)), null); }
function postByKey(commentKey) { return safeCall(() => store.getPost(clean(commentKey)), null); }

function homeRows(menu) {
  return [
    [button(menu, '📊 Общая статистика канала', 'admin_stats_overview_cache')],
    [button(menu, '👥 Подписчики сегодня', 'admin_stats_subscribers_day'), button(menu, '👥 7 дней', 'admin_stats_subscribers_7')],
    [button(menu, '👥 14 дней', 'admin_stats_subscribers_14'), button(menu, '👥 30 дней', 'admin_stats_subscribers_30')],
    [button(menu, '📈 Динамика подписчиков', 'admin_stats_subscribers_trend')],
    [button(menu, '📝 Статистика постов', 'admin_stats_posts_cache'), button(menu, '👁 Просмотры', 'admin_stats_views_cache')],
    [button(menu, '💬 Комментарии', 'admin_stats_comments_cache'), button(menu, '😊 Реакции', 'admin_stats_reactions_cache')],
    [button(menu, '🗳 Опросы', 'admin_stats_polls_cache'), button(menu, '🎁 Подарки', 'admin_stats_gifts_cache')],
    [button(menu, '🔘 CTA-кнопки', 'admin_stats_buttons_cache'), button(menu, '🗄 Архив', 'admin_stats_archive_cache')],
    [button(menu, '📌 Статистика выбранного поста', 'admin_stats_post')],
    [button(menu, '📺 Выбрать канал/пост', 'comments_select_post', { source: 'stats' })],
    [button(menu, '🔄 Обновить live-данные', 'admin_stats_refresh')],
    [button(menu, '🏠 Главное меню', 'admin_section_main')]
  ];
}
async function home(menu, ctx = {}) {
  const data = await cachedCounts();
  const c = data.counts;
  const stats = collectStats(ctx.userId);
  return screen(menu, 'stats_clean_home', '📊 Статистика', [
    'Feature parity сохранён: быстрые cache/Postgres-сводки плюс рабочий live-refresh адаптер.',
    '', 'Кэш / Postgres сейчас:',
    '• каналов: ' + c.channels,
    '• постов: ' + c.posts,
    '• снимков постов: ' + c.snapshots,
    '• архивных записей: ' + c.archive,
    '', 'Активность в памяти бота:',
    '• комментариев: ' + stats.comments.length,
    '• реакций: ' + stats.reactions,
    '• голосов в опросах: ' + stats.votes.length,
    '• подарков: ' + stats.gifts.length,
    '• CTA-кликов: ' + stats.clicks.length,
    '', statusLine(data)
  ], homeRows(menu));
}
function statRows(menu) { return [[button(menu, '🔄 Обновить этот экран', 'admin_section_stats')], ...footer(menu)]; }
async function overview(menu, ctx) { const s = collectStats(ctx.userId); return screen(menu, 'stats_overview_cache', '📊 Общая статистика канала', ['Каналов в доступе: ' + s.channelIds.size, 'Постов: ' + s.posts.length, 'Комментариев: ' + s.comments.length, 'Комментариев за 7 дней: ' + s.commentsWeek.length, 'Участников обсуждений: ' + s.uniqueCommenters.size, 'Реакций: ' + s.reactions, 'Подарков / лид-магнитов: ' + s.gifts.length, 'CTA-кликов: ' + s.clicks.length, 'Уникальных кликеров: ' + s.uniqueClickers.size, 'Голосов в опросах: ' + s.votes.length], statRows(menu)); }
async function subscribers(menu, ctx, days) { const d = audienceDelta(ctx.userId, days); const lines = ['Каналов в расчёте: ' + d.channels, 'Каналов со свежим снимком: ' + d.withCurrent, 'Каналов со снимком за период: ' + d.withPrevious, 'Подписчиков сейчас: ' + (d.withCurrent ? d.currentTotal : 'пока нет данных'), `Изменение за ${days} ${days === 1 ? 'день' : 'дней'}: ` + (d.delta === null ? 'нужен второй снимок' : (d.delta > 0 ? '+' + d.delta : String(d.delta)))]; return screen(menu, `stats_subscribers_${days}`, days === 1 ? '👥 Подписчики сегодня' : `👥 Подписчики за ${days} дней`, lines, [[button(menu, '🔄 Обновить live-данные', 'admin_stats_refresh')], ...footer(menu)]); }
async function trend(menu, ctx) { const d1 = audienceDelta(ctx.userId, 1), d7 = audienceDelta(ctx.userId, 7), d14 = audienceDelta(ctx.userId, 14), d30 = audienceDelta(ctx.userId, 30); const fmt = (d) => d.delta === null ? 'нужен снимок' : (d.delta > 0 ? '+' + d.delta : String(d.delta)); return screen(menu, 'stats_subscribers_trend', '📈 Динамика подписчиков', ['Сейчас: ' + (d1.withCurrent ? d1.currentTotal : 'пока нет данных'), 'За день: ' + fmt(d1), 'За 7 дней: ' + fmt(d7), 'За 14 дней: ' + fmt(d14), 'За 30 дней: ' + fmt(d30), '', 'Live-обновление запускается отдельным быстрым адаптером и не блокирует экран.'], [[button(menu, '🔄 Обновить live-данные', 'admin_stats_refresh')], ...footer(menu)]); }
async function posts(menu, ctx) { const s = collectStats(ctx.userId); return screen(menu, 'stats_posts_cache', '📝 Статистика постов', ['Постов в памяти бота: ' + s.posts.length, 'Постов с комментариями: ' + s.posts.filter((p) => commentsForPost(p).length > 0).length, 'Суммарные просмотры из доступных полей: ' + s.views, 'Дополнительных CTA-кнопок: ' + s.buttons, '', 'Для статистики конкретного поста нажмите кнопку ниже.'], [[button(menu, '📌 Выбрать пост для статистики', 'admin_stats_post')], [button(menu, '📺 Выбрать канал/пост', 'comments_select_post', { source: 'stats' })], ...footer(menu)]); }
async function views(menu, ctx) { const s = collectStats(ctx.userId); const top = s.posts.map((p) => ({ p, views: postViews(p) })).sort((a, b) => b.views - a.views).slice(0, 5); const lines = ['Суммарные просмотры из сохранённых полей: ' + s.views, '', 'Топ постов по просмотрам:']; top.forEach((item, i) => lines.push(`${i + 1}. ${item.views} · ${postTitle(item.p)}`)); if (!top.length) lines.push('Пока нет сохранённых постов.'); return screen(menu, 'stats_views_cache', '👁 Просмотры постов', lines, footer(menu)); }
async function comments(menu, ctx) { const s = collectStats(ctx.userId); return screen(menu, 'stats_comments_cache', '💬 Комментарии', ['Комментариев всего: ' + s.comments.length, 'Комментариев за 7 дней: ' + s.commentsWeek.length, 'Участников обсуждений: ' + s.uniqueCommenters.size, 'Постов с комментариями: ' + s.posts.filter((p) => commentsForPost(p).length > 0).length], footer(menu)); }
async function reactions(menu, ctx) { const s = collectStats(ctx.userId); return screen(menu, 'stats_reactions_cache', '😊 Реакции', ['Активных реакций на комментарии: ' + s.reactions, 'Постов в расчёте: ' + s.posts.length], footer(menu)); }
async function polls(menu, ctx) { const s = collectStats(ctx.userId); return screen(menu, 'stats_polls_cache', '🗳 Опросы', ['Голосов в опросах: ' + s.votes.length, 'Каналов в расчёте: ' + s.channelIds.size], footer(menu)); }
async function gifts(menu, ctx) { const s = collectStats(ctx.userId); return screen(menu, 'stats_gifts_cache', '🎁 Подарки / лид-магниты', ['Кампаний подарков: ' + s.gifts.length, 'Каналов в расчёте: ' + s.channelIds.size], footer(menu)); }
async function buttonsCache(menu, ctx) { const s = collectStats(ctx.userId); return screen(menu, 'stats_buttons_cache', '🔘 CTA-кнопки', ['Дополнительных CTA-кнопок под постами: ' + s.buttons, 'Кликов по кнопкам: ' + s.clicks.length, 'Уникальных кликеров: ' + s.uniqueClickers.size], footer(menu)); }
async function archiveCache(menu) { const data = await cachedCounts(); const c = data.counts; return screen(menu, 'stats_archive_cache', '🗄 Архив', ['Постов в Postgres-архиве: ' + c.posts, 'Снимков постов: ' + c.snapshots, 'Архивных записей: ' + c.archive, '', statusLine(data)], footer(menu)); }

async function postStats(menu, payload, ctx) {
  const key = clean(payload.commentKey || payload.key || '');
  if (key) {
    const analytics = analyticsForPost(key);
    const post = postByKey(key) || {};
    if (!analytics) return screen(menu, 'stats_post_not_found', '📌 Статистика выбранного поста', ['Пост не найден в кэше/store.', 'commentKey: ' + short(key, 80)], [[button(menu, '📌 Выбрать другой пост', 'admin_stats_post')], ...footer(menu)]);
    const t = analytics.totals || {};
    return screen(menu, 'stats_post_detail', '📌 Статистика выбранного поста', [
      'Пост: ' + short(analytics.title || postTitle(post), 120),
      'Post ID: ' + short(analytics.postId || post.postId, 80),
      'Канал: ' + short(analytics.channelId || post.channelId, 80),
      '',
      'Комментарии: ' + n(t.comments),
      'Участники: ' + n(t.participants),
      'Ответы: ' + n(t.replies),
      'Реакции: ' + n(t.reactions),
      'CTA-клики: ' + n(t.clicks),
      'Голоса в опросах: ' + n(t.pollVotes),
      'Подарки: ' + n(analytics.gifts),
      '',
      'Источник: быстрый store/cache без тяжёлого legacy.'
    ], [[button(menu, '📌 Выбрать другой пост', 'admin_stats_post')], [button(menu, '📝 К статистике постов', 'admin_stats_posts_cache')], ...footer(menu)]);
  }
  const posts = recentPosts(ctx.userId);
  const rows = posts.map((post, i) => [button(menu, `${i + 1}. ${postTitle(post)}`, 'admin_stats_post', { commentKey: clean(post.commentKey) })]);
  if (!rows.length) rows.push([button(menu, 'Пока нет постов в памяти', 'admin_stats_posts_cache')]);
  rows.push([button(menu, '📺 Выбрать канал/пост', 'comments_select_post', { source: 'stats' })]);
  rows.push(...footer(menu));
  const lines = ['Выберите пост из последних сохранённых. Это быстрый Clean Core список из store/cache.', ''];
  posts.forEach((post, i) => lines.push(`${i + 1}. score ${postScore(post)} · ${postTitle(post)}`));
  if (!posts.length) lines.push('Пока нет сохранённых постов.');
  return screen(menu, 'stats_post_picker', '📌 Статистика выбранного поста', lines, rows);
}

async function runRefresh(ctx = {}) {
  const config = ctx.config || {};
  const channels = visibleChannels(ctx.userId).slice(0, 12);
  lastRefreshState = { status: 'running', startedAt: now(), finishedAt: 0, ok: 0, errors: 0, channels: channels.length, lastError: '' };
  for (const channel of channels) {
    const channelId = clean(channel && channel.channelId);
    if (!channelId) continue;
    try {
      await growthService.captureChannelAudienceSnapshot({ channelId, config, includeMembers: false });
      lastRefreshState.ok += 1;
    } catch (error) {
      lastRefreshState.errors += 1;
      lastRefreshState.lastError = clean(error && error.message || error).slice(0, 180);
    }
  }
  lastRefreshState.status = 'done';
  lastRefreshState.finishedAt = now();
}
async function refresh(menu, ctx = {}) {
  const channels = visibleChannels(ctx.userId);
  if (!channels.length) return screen(menu, 'stats_refresh_no_channels', '🔄 Обновить live-данные', ['Каналы не найдены. Сначала подключите канал.', '', 'Функция не удалена: после подключения канала live-refresh снова будет работать.'], [[button(menu, '📺 Подключение канала', 'admin_section_channels')], ...footer(menu)]);
  safeAsync(() => runRefresh(ctx));
  const prev = lastRefreshState || {};
  const lines = [
    'Live-обновление запущено быстрым адаптером и не блокирует интерфейс.',
    'MAX API будет опрошен в фоне: берём быстрый snapshot чата без полного списка участников.',
    '',
    'Каналов в очереди: ' + channels.length,
    'Предыдущее состояние: ' + (prev.status || 'idle'),
    prev.finishedAt ? 'Последнее завершение: ' + new Date(prev.finishedAt).toISOString() : '',
    prev.ok || prev.errors ? `Последний результат: ok ${prev.ok || 0}, errors ${prev.errors || 0}` : '',
    prev.lastError ? 'Последняя ошибка: ' + prev.lastError : ''
  ].filter(Boolean);
  return screen(menu, 'stats_refresh_started', '🔄 Обновить live-данные', lines, [[button(menu, '📈 Динамика подписчиков', 'admin_stats_subscribers_trend')], [button(menu, '🔄 Проверить результат', 'admin_stats_refresh_status')], ...footer(menu)]);
}
async function refreshStatus(menu) {
  const st = lastRefreshState || {};
  return screen(menu, 'stats_refresh_status', '🔄 Статус live-обновления', [
    'Статус: ' + (st.status || 'idle'),
    'Каналов: ' + n(st.channels),
    'Успешно: ' + n(st.ok),
    'Ошибок: ' + n(st.errors),
    st.startedAt ? 'Старт: ' + new Date(st.startedAt).toISOString() : '',
    st.finishedAt ? 'Финиш: ' + new Date(st.finishedAt).toISOString() : '',
    st.lastError ? 'Последняя ошибка: ' + st.lastError : '',
    '',
    'Данные читаются из cache/Postgres на следующих экранах статистики.'
  ].filter(Boolean), [[button(menu, '📈 Динамика подписчиков', 'admin_stats_subscribers_trend')], [button(menu, '🔄 Запустить ещё раз', 'admin_stats_refresh')], ...footer(menu)]);
}

async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = clean(payload.action);
  if (action === 'admin_section_stats') return home(menu, ctx);
  if (action === 'admin_stats_overview_cache') return overview(menu, ctx);
  if (action === 'admin_stats_subscribers_day') return subscribers(menu, ctx, 1);
  if (action === 'admin_stats_subscribers_7') return subscribers(menu, ctx, 7);
  if (action === 'admin_stats_subscribers_14') return subscribers(menu, ctx, 14);
  if (action === 'admin_stats_subscribers_30') return subscribers(menu, ctx, 30);
  if (action === 'admin_stats_subscribers_trend') return trend(menu, ctx);
  if (action === 'admin_stats_posts_cache') return posts(menu, ctx);
  if (action === 'admin_stats_views_cache') return views(menu, ctx);
  if (action === 'admin_stats_comments_cache') return comments(menu, ctx);
  if (action === 'admin_stats_reactions_cache') return reactions(menu, ctx);
  if (action === 'admin_stats_polls_cache') return polls(menu, ctx);
  if (action === 'admin_stats_gifts_cache') return gifts(menu, ctx);
  if (action === 'admin_stats_buttons_cache') return buttonsCache(menu, ctx);
  if (action === 'admin_stats_archive_cache') return archiveCache(menu, ctx);
  if (action === 'admin_stats_post') return postStats(menu, payload, ctx);
  if (action === 'admin_stats_refresh') return refresh(menu, ctx);
  if (action === 'admin_stats_refresh_status') return refreshStatus(menu, ctx);
  return null;
}

module.exports = { RUNTIME, screenForPayload, cachedCounts, collectStats, audienceDelta, runRefresh, analyticsForPost };
