'use strict';

const assert = require('assert');
const fs = require('fs');
const store = require('../store');
const statsFlow = require('../stats-flow-cc8');
const svc = require('../services/statsProductPerfectPr226');
const producers = require('../services/statsEventProducersPr226');
const commentService = require('../services/commentService');

function btn(text, action, extra = {}) { return { text, action, ...extra }; }
const menu = { button: btn, link: (text, url) => ({ text, url, type: 'link' }), keyboard: (rows) => ({ rows }) };
const flat = (screen) => (screen.attachments?.rows || []).flat();
const labels = (screen) => flat(screen).map((button) => String(button.text || '').trim()).filter(Boolean);
function findPayload(screen, action) { const found = flat(screen).find((button) => button.action === action); assert(found, `payload ${action} missing`); return found; }
function noFake(screen) { assert(!/sampleCampaign|demo|здесь будет|Реклама вынесена в отдельный раздел/i.test(screen.text), `fake placeholder in ${screen.id}`); }
async function ui(action, ctx, payload = {}) { const screen = await statsFlow.screenForPayload(menu, { action, ...payload }, ctx); assert(screen && screen.id, `screen ${action}`); noFake(screen); return screen; }
function isoDaysAgo(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
function assertNoSensitive(text, label) { assert(!/token|authorization|cookie|secret|password|stack|bearer|trace/i.test(String(text)), `${label}: sensitive/debug text leaked`); }

(async () => {
  svc.resetStatsStateForTests();
  const suffix = Date.now().toString(36);
  const ctx = {
    userId: `owner_${suffix}`,
    ownerUserId: `owner_${suffix}`,
    tenantKey: `tenant_${suffix}`,
    targetKind: 'channel',
    targetId: `chan_${suffix}`,
    channelId: `chan_${suffix}`,
  };
  const postId = `post_${suffix}`;
  const commentKey = `${ctx.channelId}:${postId}`;

  store.saveChannel(ctx.channelId, { channelId: ctx.channelId, title: 'Канал PR226', ownerUserId: ctx.ownerUserId, tenantKey: ctx.tenantKey, type: 'channel', isChannel: true });
  store.savePost(commentKey, { commentKey, tenantKey: ctx.tenantKey, ownerUserId: ctx.ownerUserId, channelId: ctx.channelId, postId, originalText: 'PR226 product stats post' });

  const cleanRoot = await ui('admin_section_stats', { userId: ctx.userId, config: {} });
  assert.strictEqual(cleanRoot.id, 'stats_root_menu_pr229', 'STAT-001 clean root id');
  assert.deepStrictEqual(labels(cleanRoot), ['Обзор', 'По каналу', 'По посту', 'Рекламные ссылки', 'Источники', 'Обновить данные', 'Главное меню'], 'STAT-002 clean root labels');
  assert(!/Выберите канал или чат|Кнопки|Подарки|Комментарии|Реферал|Расходы|Воронка продаж/i.test(cleanRoot.text + labels(cleanRoot).join('\n')), 'STAT-003 clean root is not cluttered or chat-mixed');
  for (const button of flat(cleanRoot).filter((item) => !['admin_section_main', 'comments_select_post'].includes(item.action))) {
    const opened = await statsFlow.screenForPayload(menu, { action: button.action, source: 'stats', channelId: ctx.channelId, targetKind: 'channel', targetId: ctx.channelId, postId, commentKey }, ctx);
    assert(opened && opened.id, `STAT-004 root action opens ${button.action}`);
  }

  const resolved = svc.resolveStatsContext(ctx, { postId, commentKey });
  assert(resolved.tenantKey === ctx.tenantKey && resolved.channelId === ctx.channelId && resolved.postId === postId && resolved.commentKey === commentKey, 'STAT-005 context resolution');

  svc.persistStatsEvent({ eventType: 'member_joined', tenantKey: `other_${suffix}`, ownerUserId: 'other', channelId: 'foreign', confidence: 'exact' });
  assert.strictEqual(svc.loadStatsDataset(ctx, { period: 'all' }).growth.joined, 0, 'STAT-006 tenant isolation');

  svc.persistStatsEvent({ ...ctx, eventType: 'member_joined', userId: 'u1', confidence: 'unattributed' });
  svc.persistStatsEvent({ ...ctx, eventType: 'member_left', userId: 'u2' });
  let dataset = svc.loadStatsDataset(ctx, { period: 'all' });
  assert(dataset.growth.joined === 1 && dataset.growth.left === 1 && dataset.growth.net === 0, 'STAT-007 growth counters');
  const growth = await ui('admin_stats_growth', ctx);
  assert(growth.text.includes('Пришло: +1') && growth.text.includes('Без метки: 1'), 'STAT-008 growth screen wording');

  const link = svc.createTrackingLink(ctx, { source: 'blogger_a', campaign: 'camp_a', slug: `slug_${suffix}` });
  assert(link && link.source === 'blogger_a' && link.campaign === 'camp_a', 'STAT-009 tracking link created');
  svc.trackLinkClick(ctx, { linkId: link.linkId, userId: 'u3', source: 'blogger_a', campaign: 'camp_a' });
  svc.recordMemberJoined(ctx, { userId: 'u3' });
  assert(svc.loadStatsEvents(ctx, { eventType: 'tracking_link_clicked', period: 'all' }).length === 1, 'STAT-010 click stored');
  assert(svc.loadStatsEvents(ctx, { eventType: 'member_join_attributed', period: 'all' }).length === 1, 'STAT-011 attributed join stored');
  assert.strictEqual(svc.loadStatsDataset(ctx, { period: 'all', source: 'blogger_a' }).sources.clicks, 1, 'STAT-012 source filter');
  assert.strictEqual(svc.loadStatsDataset(ctx, { period: 'all', campaign: 'camp_a' }).sources.clicks, 1, 'STAT-013 campaign filter');
  assert.strictEqual(svc.loadStatsDataset(ctx, { period: 'all', linkId: link.linkId }).sources.clicks, 1, 'STAT-014 link filter');

  producers.recordCtaClick({ ...ctx, userId: 'u4', action: 'public_cta', kind: 'public_cta', buttonSource: 'published_post', buttonId: 'btn1', buttonText: 'Open', postId, commentKey });
  assert(!producers.recordCtaClick({ ...ctx, userId: 'admin', action: 'button_admin_save', buttonId: 'admin-btn', postId, commentKey }), 'STAT-015 admin button is not counted as public CTA');
  producers.recordGiftRequested({ ...ctx, userId: 'u5', campaignId: 'gift1', postId, commentKey });
  producers.recordGiftClaimed({ ...ctx, userId: 'u5', campaignId: 'gift1', delivered: true, postId, commentKey });
  producers.recordCommentCreated({ ...ctx, userId: 'u6', postId, commentKey });
  commentService.createComment({ commentKey, userId: 'u7', userName: 'Client', text: 'real comment' });

  dataset = svc.loadStatsDataset(ctx, { period: 'all', postId, commentKey });
  assert(dataset.sources.ctaClicks >= 1, 'STAT-016 CTA metric');
  assert(dataset.sources.giftRequests >= 1 && dataset.sources.giftClaims >= 1, 'STAT-017 gift metrics');
  assert(dataset.content.comments >= 1, 'STAT-018 comment/content metrics');
  assert(dataset.content.ctaClicks >= 1, 'STAT-019 post/content CTA metric');
  assert(dataset.content.giftClaims >= 1, 'STAT-020 post/content gift metric');

  const sourcesBeforeCosts = await ui('admin_stats_sources', ctx);
  assert(sourcesBeforeCosts.text.includes('Клики:') && sourcesBeforeCosts.text.includes('CPA не показываем'), 'STAT-021 sources wording without costs');
  const manualPayload = findPayload(sourcesBeforeCosts, 'admin_stats_manual_costs');
  const manualStart = await statsFlow.screenForPayload(menu, manualPayload, ctx);
  assert(manualStart.text.includes('Напишите источник'), 'STAT-022 manual cost starts');
  await statsFlow.handleTextInput(menu, { ...ctx, text: 'blogger_a / camp_a' });
  const manualSaved = await statsFlow.handleTextInput(menu, { ...ctx, text: '100' });
  assert(manualSaved.text.includes('проверен чтением'), 'STAT-023 manual cost saved');
  const sourcesAfterCosts = await ui('admin_stats_sources', ctx);
  assert(sourcesAfterCosts.text.includes('100 RUB') && sourcesAfterCosts.text.includes('CPA:'), 'STAT-024 sources show manual costs and CPA');

  const funnel = await ui('admin_stats_funnel', ctx);
  assert(funnel.text.includes('tracking click → joined → action'), 'STAT-025 funnel label');
  assert(/Точно:|Вероятно:|Недоступно:/.test(funnel.text), 'STAT-026 funnel quality wording');
  const content = await ui('admin_stats_content', ctx, { postId, commentKey });
  assert(content.text.includes('Комментарии:') && content.text.includes('CTA:') && content.text.includes('Подарки:'), 'STAT-027 content screen metrics');
  assert(content.text.includes('Просмотры недоступны'), 'STAT-028 unavailable post views wording');
  const postScreen = await ui('admin_stats_post', ctx, { postId, commentKey });
  assert(postScreen.text.includes('Статистика выбранного поста') && postScreen.text.includes('CTA-клики'), 'STAT-029 selected post stats screen');

  await svc.detectMaxPostStatCapabilities({ ...ctx, postId, commentKey, rawStat: { views: 42 } });
  const postDataset = svc.loadStatsDataset(ctx, { period: 'all', postId, commentKey });
  assert(postDataset.postStats.viewsAvailable && postDataset.postStats.snapshot.viewsCount === 42, 'STAT-030 post stat snapshot views');
  const other = { ...ctx, tenantKey: `other_post_${suffix}`, ownerUserId: `other_${suffix}`, channelId: `other_chan_${suffix}`, targetId: `other_chan_${suffix}`, postId: 'other_post', commentKey: 'other:post' };
  store.saveChannel(other.channelId, { channelId: other.channelId, ownerUserId: other.ownerUserId, tenantKey: other.tenantKey, title: 'Other channel' });
  store.savePost(other.commentKey, { commentKey: other.commentKey, tenantKey: other.tenantKey, ownerUserId: other.ownerUserId, channelId: other.channelId, postId: other.postId });
  await svc.detectMaxPostStatCapabilities({ ...other, rawStat: { views: 99 } });
  assert(!svc.loadStatsDataset(ctx, { period: 'all', postId: other.postId, commentKey: other.commentKey }).postStats.viewsAvailable, 'STAT-031 post stat tenant isolation');

  const quality = await ui('admin_stats_quality', ctx);
  assert(quality.text.includes('Точно:') && quality.text.includes('Вероятно:') && quality.text.includes('Снимки:') && quality.text.includes('Недоступно:'), 'STAT-032 quality screen sections');
  assert(quality.text.includes('MAX API'), 'STAT-033 data-quality API limitation wording');
  for (const action of ['admin_stats_growth', 'admin_stats_sources', 'admin_stats_funnel', 'admin_stats_content', 'admin_stats_quality']) {
    assert((await ui(action, ctx)).text.match(/Обновлено:|Нет свежих данных/), `STAT-034 freshness line for ${action}`);
  }

  const exportScreen = await ui('admin_stats_export', ctx);
  assert(exportScreen.text.includes('санитарный') && exportScreen.text.includes('Рост:'), 'STAT-035 export screen wording');
  assertNoSensitive(exportScreen.text, 'STAT-036 export screen');
  const exportJson = svc.sanitizedExport({
    growth: { counts: { joined: 7, nested: { actions: 3, token: 'x' } } },
    sources: { items: [{ clicks: 2, secret: 'bad' }] },
    funnel: { steps: { click: 2 } },
    content: { comments: 1 },
    postStats: { viewsAvailable: true },
    dataQuality: { exact: ['ok'] },
    authorization: 'bearer value',
    cookie: 'cookie value',
    stack: 'trace value',
  });
  const parsedExport = JSON.parse(exportJson);
  assert(parsedExport.growth.counts.joined === 7 && parsedExport.growth.counts.nested.actions === 3 && parsedExport.sources.items[0].clicks === 2, 'STAT-037 export keeps safe nested metrics');
  assertNoSensitive(exportJson, 'STAT-038 sanitized export');

  svc.resetStatsStateForTests();
  const periodCtx = { ...ctx, tenantKey: `period_${suffix}`, ownerUserId: `period_${suffix}`, userId: `period_${suffix}`, channelId: `period_chan_${suffix}`, targetId: `period_chan_${suffix}` };
  svc.persistStatsEvent({ ...periodCtx, eventType: 'member_joined', timestamp: isoDaysAgo(1) });
  svc.persistStatsEvent({ ...periodCtx, eventType: 'member_joined', timestamp: isoDaysAgo(3) });
  svc.persistStatsEvent({ ...periodCtx, eventType: 'member_joined', timestamp: isoDaysAgo(20) });
  svc.persistStatsEvent({ ...periodCtx, eventType: 'member_joined', timestamp: isoDaysAgo(40) });
  assert.strictEqual(svc.loadStatsDataset(periodCtx, { period: 'today' }).growth.joined, 0, 'STAT-039 today period');
  assert.strictEqual(svc.loadStatsDataset(periodCtx, { period: '7d' }).growth.joined, 2, 'STAT-040 seven day period');
  assert.strictEqual(svc.loadStatsDataset(periodCtx, { period: '30d' }).growth.joined, 3, 'STAT-041 thirty day period');
  assert.strictEqual(svc.loadStatsDataset(periodCtx, { period: 'all' }).growth.joined, 4, 'STAT-042 all period');

  const statsSource = fs.readFileSync('stats-flow-cc8.js', 'utf8');
  assert(statsSource.includes('loadStatsDataset') && !statsSource.includes('/debug/admin-action-log-live'), 'STAT-043 stats flow uses product dataset, not debug logs');
  assert(!cleanRoot.text.match(/reach|охват/i), 'STAT-044 root does not advertise unavailable reach');
  assert(svc.loadStatsDataset(ctx, {}).diagnostics.trace.includes('render → payload → handler → context → dataset → screen'), 'STAT-045 diagnostics trace');

  console.log('PR226 stats product-perfect regression OK', JSON.stringify({ assertions: 45, root: cleanRoot.id }));
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
