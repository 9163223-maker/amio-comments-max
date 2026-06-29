'use strict';

const assert = require('assert');
const store = require('../store');
const statsFlow = require('../stats-flow-cc8');
const svc = require('../services/statsProductPerfectPr226');

function btn(text, action, extra = {}) { return { text, action, ...extra }; }
const menu = { button: btn, link: (text, url) => ({ text, url, type: 'link' }), keyboard: (rows) => ({ rows }) };
const flat = (screen) => (screen.attachments?.rows || []).flat();
const labels = (screen) => flat(screen).map((button) => String(button.text || '').trim()).filter(Boolean);
function noFake(screen) { assert(!/sampleCampaign|demo|здесь будет|Реклама вынесена в отдельный раздел/i.test(screen.text)); }
async function render(action, ctx, data = {}) { const screen = await statsFlow.screenForPayload(menu, { action, ...data }, ctx); assert(screen && screen.id, `screen ${action}`); noFake(screen); return screen; }

(async () => {
  svc.resetStatsStateForTests();
  const suffix = Date.now().toString(36);
  const ctx = { userId: `owner_${suffix}`, tenantKey: `tenant_${suffix}`, ownerUserId: `owner_${suffix}`, channelId: `chan_${suffix}` };
  const commentKey = `${ctx.channelId}:post1`;
  store.saveChannel(ctx.channelId, { channelId: ctx.channelId, title: 'Канал PR226', ownerUserId: ctx.ownerUserId, tenantKey: ctx.tenantKey });
  store.savePost(commentKey, { commentKey, tenantKey: ctx.tenantKey, ownerUserId: ctx.ownerUserId, channelId: ctx.channelId, postId: 'post1', originalText: 'PR226 post' });

  const root = await render('admin_section_stats', { userId: ctx.userId, config: {} });
  assert.strictEqual(root.id, 'stats_root_menu_pr229', 'clean stats root id');
  assert.deepStrictEqual(labels(root), ['Обзор', 'По каналу', 'По посту', 'Рекламные ссылки', 'Источники', 'Обновить данные', 'Главное меню'], 'clean stats root labels');
  assert(!/Выберите канал или чат|Кнопки|Подарки|Комментарии|Реферал|Воронка продаж/i.test(root.text + labels(root).join('\n')), 'stats root is not cluttered or chat-mixed');

  for (const item of flat(root)) {
    if (['admin_section_main', 'comments_select_post'].includes(item.action)) continue;
    const screen = await statsFlow.screenForPayload(menu, { action: item.action, source: 'stats', channelId: ctx.channelId, commentKey, postId: 'post1' }, ctx);
    assert(screen && screen.id, `root action opens: ${item.action}`);
  }

  const scopedScreens = [
    await render('admin_stats_growth', ctx),
    await render('admin_stats_sources', ctx),
    await render('admin_stats_funnel', ctx),
    await render('admin_stats_content', ctx),
    await render('admin_stats_quality', ctx),
    await render('admin_stats_export', ctx)
  ];
  for (const screen of scopedScreens) {
    assert(screen.text && labels(screen).length, `visible stats screen ${screen.id}`);
    assert(!/technical_id_marker_should_not_appear/i.test(labels(screen).join('\n')), `safe labels in ${screen.id}`);
  }

  const exportJson = svc.sanitizedExport({ growth: { counts: { joined: 7, nested: { actions: 3 } } }, sources: { items: [{ clicks: 2 }] }, funnel: { steps: { click: 2 } }, content: { comments: 1 } });
  const parsed = JSON.parse(exportJson);
  assert(parsed.growth.counts.joined === 7 && parsed.growth.counts.nested.actions === 3 && parsed.sources.items[0].clicks === 2, 'export keeps safe nested metrics');

  console.log('PR226 stats clean-root regression OK', JSON.stringify({ root: root.id, labels: labels(root).length }));
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
