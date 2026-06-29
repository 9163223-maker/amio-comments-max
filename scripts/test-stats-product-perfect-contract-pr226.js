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
function noFake(screen) { assert(!/sampleCampaign|demo|здесь будет|Реклама вынесена в отдельный раздел/i.test(screen.text)); }
async function ui(action, ctx, payload = {}) { const screen = await statsFlow.screenForPayload(menu, { action, ...payload }, ctx); assert(screen, `screen ${action}`); noFake(screen); return screen; }

(async () => {
  svc.resetStatsStateForTests();
  const suffix = Date.now().toString(36);
  const ctx = { userId: `owner_${suffix}`, tenantKey: `tenant_${suffix}`, ownerUserId: `owner_${suffix}`, channelId: `chan_${suffix}` };
  const commentKey = `${ctx.channelId}:post1`;
  store.saveChannel(ctx.channelId, { channelId: ctx.channelId, title: 'Канал PR226', ownerUserId: ctx.ownerUserId, tenantKey: ctx.tenantKey });
  store.savePost(commentKey, { commentKey, tenantKey: ctx.tenantKey, ownerUserId: ctx.ownerUserId, channelId: ctx.channelId, postId: 'post1', originalText: 'PR226 post' });

  const root = await ui('admin_section_stats', { userId: ctx.userId, config: {} });
  assert.strictEqual(root.id, 'stats_root_menu_pr229', 'clean stats root id');
  assert.deepStrictEqual(labels(root), ['Обзор', 'По каналу', 'По посту', 'Рекламные ссылки', 'Источники', 'Обновить данные', 'Главное меню'], 'clean stats root labels');
  assert(!/Кнопки|Подарки|Комментарии|Реферал|Расходы|Воронка продаж|Выберите канал или чат/i.test(root.text + labels(root).join('\n')), 'stats root is not cluttered or chat-mixed');

  for (const button of flat(root).filter((item) => item.action !== 'admin_section_main')) {
    const screen = await statsFlow.screenForPayload(menu, { action: button.action, source: 'stats', channelId: ctx.channelId, commentKey, postId: 'post1' }, ctx);
    assert(screen && screen.id, `root action opens: ${button.action}`);
    noFake(screen);
  }

  const resolved = svc.resolveStatsContext(ctx, { postId: 'post1', commentKey });
  assert(resolved.tenantKey && resolved.channelId && resolved.postId === 'post1' && resolved.commentKey === commentKey, 'context resolution');

  svc.persistStatsEvent({ eventType: 'member_joined', tenantKey: 'other', ownerUserId: 'other', channelId: 'foreign', confidence: 'exact' });
  assert.strictEqual(svc.loadStatsDataset(ctx, {}).growth.joined, 0, 'tenant isolation');
  svc.persistStatsEvent({ ...ctx, eventType: 'member_joined', userId: 'u1', confidence: 'unattributed' });
  svc.persistStatsEvent({ ...ctx, eventType: 'member_left', userId: 'u2' });
  producers.recordCtaClick({ ...ctx, userId: 'u4', action: 'public_cta', buttonId: 'btn1', buttonText: 'Open', commentKey });
  producers.recordGiftRequested({ ...ctx, userId: 'u5', commentKey });
  producers.recordGiftClaimed({ ...ctx, userId: 'u5', commentKey, delivered: true });
  producers.recordCommentCreated({ ...ctx, userId: 'u6', postId: 'post1', commentKey });

  const dataset = svc.loadStatsDataset(ctx, { postId: 'post1', commentKey });
  assert(dataset.growth.joined >= 1 && dataset.growth.left >= 1, 'growth metrics');
  assert(dataset.sources.ctaClicks >= 1, 'CTA metric');
  assert(dataset.sources.giftClaims >= 1, 'gift metric');
  assert(dataset.content.comments >= 1, 'comment metric');

  const screens = [
    await ui('admin_stats_growth', ctx),
    await ui('admin_stats_sources', ctx),
    await ui('admin_stats_funnel', ctx),
    await ui('admin_stats_content', ctx),
    await ui('admin_stats_quality', ctx),
    await ui('admin_stats_export', ctx),
    await ui('admin_stats_post', ctx, { postId: 'post1', commentKey })
  ];
  for (const screen of screens) assert(screen.text && !/postId|channelId|commentKey|internalId|payload|trace/i.test(labels(screen).join('\n')), `safe screen ${screen.id}`);

  const exportJson = svc.sanitizedExport({ growth: { counts: { joined: 7, nested: { actions: 3 } } }, sources: { items: [{ clicks: 2 }] }, funnel: { steps: { click: 2 } }, content: { comments: 1 } });
  const parsed = JSON.parse(exportJson);
  assert(parsed.growth.counts.joined === 7 && parsed.growth.counts.nested.actions === 3 && parsed.sources.items[0].clicks === 2, 'export keeps safe nested metrics');

  console.log('PR226 stats product-perfect clean-root contract OK', JSON.stringify({ root: root.id, labels: labels(root).length }));
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
