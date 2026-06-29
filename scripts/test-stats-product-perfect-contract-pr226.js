'use strict';

const assert = require('assert');
const store = require('../store');
const statsFlow = require('../stats-flow-cc8');
const svc = require('../services/statsProductPerfectPr226');
const producers = require('../services/statsEventProducersPr226');

function btn(text, action, extra = {}) { return { text, action, ...extra }; }
const menu = { button: btn, link: (text, url) => ({ text, url, type: 'link' }), keyboard: (rows) => ({ rows }) };
const flat = (screen) => (screen.attachments?.rows || []).flat();
const labels = (screen) => flat(screen).map((button) => String(button.text || '').trim()).filter(Boolean);
function findPayload(screen, action) { const found = flat(screen).find((button) => button.action === action); assert(found, `payload ${action} missing`); return found; }
function noFake(screen) { assert(!/sampleCampaign|demo|здесь будет|Реклама вынесена в отдельный раздел/i.test(screen.text)); }
async function ui(action, ctx, payload = {}) { const screen = await statsFlow.screenForPayload(menu, { action, ...payload }, ctx); assert(screen, `screen ${action}`); noFake(screen); return screen; }

(async () => {
  svc.resetStatsStateForTests();
  const suffix = Date.now().toString(36);
  const ctx = { userId: `owner_${suffix}`, tenantKey: `tenant_${suffix}`, ownerUserId: `owner_${suffix}`, channelId: `chan_${suffix}` };
  store.saveChannel(ctx.channelId, { channelId: ctx.channelId, title: 'Канал PR226', ownerUserId: ctx.ownerUserId, tenantKey: ctx.tenantKey });
  store.savePost(`${ctx.channelId}:post1`, { commentKey: `${ctx.channelId}:post1`, tenantKey: ctx.tenantKey, ownerUserId: ctx.ownerUserId, channelId: ctx.channelId, postId: 'post1', originalText: 'PR226 post' });

  const root = await ui('admin_section_stats', ctx);
  assert.strictEqual(root.id, 'stats_root_menu_pr229', 'STAT-001 clean stats root id');
  assert.deepStrictEqual(labels(root), ['Обзор', 'По каналу', 'По посту', 'Рекламные ссылки', 'Источники', 'Обновить данные', 'Главное меню'], 'STAT-002 clean stats root labels');
  assert(!/Кнопки|Подарки|Комментарии|Реферал|Расходы|Воронка продаж/.test(root.text), 'STAT-003 root text is not cluttered');
  for (const button of flat(root).filter((item) => item.action !== 'admin_section_main')) {
    assert(await statsFlow.screenForPayload(menu, { action: button.action, source: 'stats', channelId: ctx.channelId, commentKey: `${ctx.channelId}:post1`, postId: 'post1' }, ctx), `STAT-004 ${button.action}`);
  }

  const resolved = svc.resolveStatsContext(ctx, { postId: 'post1', commentKey: `${ctx.channelId}:post1` });
  assert(resolved.tenantKey && resolved.channelId && resolved.postId === 'post1' && resolved.commentKey === `${ctx.channelId}:post1`, 'STAT-005 context resolution');
  assert((await ui('admin_stats_post', ctx, { postId: 'missing' })).text.match(/Пост не найден|Выберите/), 'STAT-006 missing post state');

  svc.persistStatsEvent({ eventType: 'member_joined', tenantKey: 'other', ownerUserId: 'other', channelId: 'foreign', confidence: 'exact' });
  assert.strictEqual(svc.loadStatsDataset(ctx, {}).growth.joined, 0, 'STAT-007 tenant isolation');
  svc.persistStatsEvent({ ...ctx, eventType: 'member_joined', userId: 'u1', confidence: 'unattributed' });
  svc.persistStatsEvent({ ...ctx, eventType: 'member_left', userId: 'u2' });
  const dataset = svc.loadStatsDataset(ctx, {});
  assert(dataset.growth.joined === 1 && dataset.growth.left === 1 && dataset.growth.net === 0, 'STAT-008 growth counts');
  assert((await ui('admin_stats_growth', ctx)).text.includes('Без метки: 1'), 'STAT-009 growth screen');

  const link = svc.createTrackingLink(ctx, { source: 'blogger_a', campaign: 'camp', slug: `slug_${suffix}` });
  assert(link && link.source === 'blogger_a', 'STAT-010 tracking link created');
  svc.trackLinkClick(ctx, { linkId: link.linkId, userId: 'u3', source: 'blogger_a', campaign: 'camp' });
  svc.recordMemberJoined(ctx, { userId: 'u3' });
  assert(svc.loadStatsEvents(ctx, { eventType: 'tracking_link_clicked' }).length, 'STAT-011 tracking click stored');
  assert(svc.loadStatsEvents(ctx, { eventType: 'member_join_attributed' }).length, 'STAT-012 attributed join stored');

  producers.recordCtaClick({ ...ctx, userId: 'u4', action: 'public_cta', buttonId: 'btn1', buttonText: 'Open', commentKey: `${ctx.channelId}:post1` });
  producers.recordGiftRequested({ ...ctx, userId: 'u5', commentKey: `${ctx.channelId}:post1` });
  producers.recordGiftClaimed({ ...ctx, userId: 'u5', commentKey: `${ctx.channelId}:post1`, delivered: true });
  producers.recordCommentCreated({ ...ctx, userId: 'u6', postId: 'post1', commentKey: `${ctx.channelId}:post1` });
  assert(svc.loadStatsDataset(ctx, {}).sources.ctaClicks >= 1, 'STAT-013 CTA counted');
  assert(svc.loadStatsDataset(ctx, {}).sources.giftClaims >= 1, 'STAT-014 gift counted');
  assert(svc.loadStatsDataset(ctx, { postId: 'post1', commentKey: `${ctx.channelId}:post1` }).content.comments >= 1, 'STAT-015 comments counted');

  assert((await ui('admin_stats_sources', ctx)).text.includes('Клики:'), 'STAT-016 sources screen');
  assert((await ui('admin_stats_funnel', ctx)).text.includes('tracking click → joined → action'), 'STAT-017 funnel screen');
  assert((await ui('admin_stats_content', ctx)).text.includes('Комментарии:'), 'STAT-018 content screen');
  assert((await ui('admin_stats_post', ctx, { postId: 'post1', commentKey: `${ctx.channelId}:post1` })).text.match(/CTA-клики|Статистика выбранного поста/), 'STAT-019 post stats screen');
  const quality = await ui('admin_stats_quality', ctx);
  assert(quality.text.includes('Точно:') && quality.text.includes('Вероятно:') && quality.text.includes('Недоступно:'), 'STAT-020 quality screen');

  const exportScreen = await ui('admin_stats_export', ctx);
  assert(exportScreen.text.includes('санитарный'), 'STAT-021 export screen');
  const exportJson = svc.sanitizedExport({ growth: { counts: { joined: 7, nested: { actions: 3, token: 'x' } } }, sources: { items: [{ clicks: 2, secret: 'bad' }] }, funnel: { steps: { click: 2 } }, content: { comments: 1 }, Authorization: 'y', cookie: 'z', stack: 's' });
  const parsed = JSON.parse(exportJson);
  assert(parsed.growth.counts.joined === 7 && parsed.growth.counts.nested.actions === 3 && parsed.sources.items[0].clicks === 2, 'STAT-022 export keeps safe nested metrics');
  assert(!/token|Authorization|cookie|secret|stack|bad/i.test(exportJson), 'STAT-023 export removes sensitive fields');

  const srcScreen = await ui('admin_stats_sources', ctx);
  const manualPayload = findPayload(srcScreen, 'admin_stats_manual_costs');
  const manualStart = await statsFlow.screenForPayload(menu, manualPayload, ctx);
  assert(manualStart.text.includes('Напишите источник'), 'STAT-024 manual cost starts');
  await statsFlow.handleTextInput(menu, { ...ctx, text: 'srcCost / campCost' });
  const manualSaved = await statsFlow.handleTextInput(menu, { ...ctx, text: '123.45' });
  assert(manualSaved.text.includes('проверен чтением'), 'STAT-025 manual cost saved');
  assert((await ui('admin_stats_sources', ctx)).text.includes('123.45 RUB'), 'STAT-026 manual cost visible');

  const emptyStats = await ui('admin_section_stats', { userId: `empty_${suffix}`, tenantKey: `empty_${suffix}` });
  assert.strictEqual(emptyStats.id, 'stats_root_menu_pr229', 'STAT-027 empty user still gets clean root');
  assert(labels(emptyStats).includes('Обзор') && labels(emptyStats).includes('По каналу'), 'STAT-028 empty root is actionable');
  assert(svc.loadStatsDataset(ctx, {}).diagnostics.trace.includes('render → payload → handler → context → dataset → screen'), 'STAT-029 diagnostics trace');

  console.log('PR226 stats product-perfect contract OK', JSON.stringify({ root: root.id, labels: labels(root).length }));
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
