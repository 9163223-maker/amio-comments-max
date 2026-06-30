'use strict';
const assert = require('assert');
const menu = require('../v3-menu-core-1539');
const statsFlow = require('../stats-flow-cc8');
const statsData = require('../services/statsProductPerfectPr226');
const targets = require('../services/statsTargetsService');
const store = require('../store');
const routes = require('../v3-menu-routes-1539');
const access = require('../services/clientAccessService');
const producers = require('../services/statsEventProducersPr226');
const channelPostPicker = require('../channel-post-picker-core');

function btns(screen) {
  return (screen.attachments || [])
    .filter((item) => item.type === 'inline_keyboard')
    .flatMap((item) => item.payload.buttons || [])
    .flatMap((row) => row)
    .map((button) => ({ text: button.text, payload: JSON.parse(button.payload || '{}') }));
}
function noTech(screen) { assert(!/channelId|chatId|targetId|commentKey|postId/.test(screen.text), 'technical id visible'); }
async function render(action, scope = {}, ctx = { userId: 'u-pr229', config: { chats: [{ chatId: 'chat1', title: 'Чат один', userId: 'u-pr229' }, { chatId: 'chat2', title: 'Чат два', userId: 'u-pr229' }] } }) {
  return statsFlow.screenForPayload(menu, { action, ...scope }, ctx);
}

(async () => {
  statsData.resetStatsStateForTests();
  store.saveChannel('chan1', { title: 'Канал один', userId: 'u-pr229' });
  store.saveChannel('chan2', { title: 'Канал два', userId: 'u-pr229' });

  access._resetForTests && access._resetForTests();
  const accessChannelId = 'access-only-pr229-' + Date.now();
  access.upsertActivationCode({ code: 'AK-PR229-ACCESS-0001', createdByMaxUserId: 'admin-pr229', planId: 'business', durationDays: 30, maxChannels: 3, boundChannelId: accessChannelId });
  assert(access.activateCode({ maxUserId: 'access-user-pr229', code: 'AK-PR229-ACCESS-0001', name: 'Access User' }).ok, 'access activation must succeed');
  const accessTargets = targets.listStatsTargetsForUser('access-user-pr229', {});
  assert(accessTargets.channels.some((item) => item.channelId === accessChannelId && item.provider === 'client_access'), 'clientAccess-only channel must appear in stats targets');
  assert(!targets.listStatsTargetsForUser('access-other-pr229', {}).channels.some((item) => item.channelId === accessChannelId), 'clientAccess channel must not leak to unrelated user');

  const originalListUiChannelsForUser = channelPostPicker.listUiChannelsForUser;
  channelPostPicker.listUiChannelsForUser = async (userId) => String(userId) === 'shared-user-pr229' ? [
    { channelId: 'shared-only-pr229', title: 'Shared Only', ownerUserId: 'shared-user-pr229', tenantKey: 'tenant_shared-user-pr229' },
    { channelId: 'shared-leak-pr229', title: 'Shared Leak', ownerUserId: 'other-user-pr229', tenantKey: 'tenant_other-user-pr229' }
  ] : [];
  const sharedTargets = await targets.listStatsTargetsForUserAsync('shared-user-pr229', {});
  assert(sharedTargets.channels.some((item) => item.channelId === 'shared-only-pr229' && item.provider === 'channel_post_picker'), 'shared picker channel must appear in stats targets');
  assert(!sharedTargets.channels.some((item) => item.channelId === 'shared-leak-pr229'), 'shared picker unrelated channel must not leak');
  channelPostPicker.listUiChannelsForUser = originalListUiChannelsForUser;

  const root = await render('admin_section_stats');
  assert(/stats_root_menu_pr229/.test(root.id), 'root clean menu');
  const empty = await statsFlow.screenForPayload(menu, { action: 'admin_section_stats' }, { userId: 'none-pr229', config: { statsTargetsOverride: { channels: [], chats: [] } } });
  assert.equal(empty.id, 'stats_root_menu_pr229');

  const targetList = targets.listStatsTargetsForUser('u-pr229', { chats: [{ chatId: 'chat1', title: 'Чат один', userId: 'u-pr229' }] });
  assert(targetList.channels.length >= 2, 'channel targets must remain available');
  assert.equal(targetList.chats.length, 1, 'configured chat target is visible only as chat');
  const other = targets.listStatsTargetsForUser('other-pr229', { chats: [{ chatId: 'chat1', title: 'Чат один', userId: 'u-pr229' }] });
  assert(!other.channels.some((item) => item.channelId === 'chan1' || item.channelId === 'chan2'));
  assert(!other.chats.some((item) => item.chatId === 'chat1'));
  const noPushFake = targets.listStatsTargetsForUser('u-pr229', { pushSubscriptions: [{ chatId: 'push-only', title: 'Push only', userId: 'u-pr229' }] });
  assert(!noPushFake.chats.some((item) => item.chatId === 'push-only'));
  assert.equal(noPushFake.diagnostics.pushSubscriptionsUsedAsStatsChats, false);

  const channel = { targetKind: 'channel', targetId: 'chan1', channelId: 'chan1' };
  const channel2 = { targetKind: 'channel', targetId: 'chan2', channelId: 'chan2' };
  const chat = { targetKind: 'chat', targetId: 'chat1', chatId: 'chat1' };
  const allChannels = { targetKind: 'all_channels', targetId: 'all_channels' };
  const allChats = { targetKind: 'all_chats', targetId: 'all_chats' };

  statsData.persistStatsEvent({ tenantKey: 'tenant_u-pr229', ownerUserId: 'u-pr229', channelId: 'chan1', eventType: 'member_joined', userId: 'legacy-channel' });
  statsData.persistStatsEvent({ tenantKey: 'tenant_u-pr229', ownerUserId: 'u-pr229', chatId: 'chat1', eventType: 'member_joined', userId: 'legacy-chat' });
  assert.equal(statsData.loadStatsDataset({ userId: 'u-pr229', ...channel }, { period: 'all' }).growth.joined, 1);
  assert.equal(statsData.loadStatsDataset({ userId: 'u-pr229', ...chat }, { period: 'all' }).growth.joined, 1);
  assert.equal(statsData.loadStatsDataset({ userId: 'u-pr229', ...allChannels }, { period: 'all' }).growth.joined, 1);
  assert.equal(statsData.loadStatsDataset({ userId: 'u-pr229', ...allChats }, { period: 'all' }).growth.joined, 1);

  producers.recordAudienceUpdate({ type: 'member_added', chatId: 'chat-retry-pr229', ownerUserId: 'u-pr229', memberUserId: 'chat-retry-member', updateId: 'chat-stable-retry-pr229' });
  producers.recordAudienceUpdate({ type: 'member_added', chatId: 'chat-retry-pr229', ownerUserId: 'u-pr229', memberUserId: 'chat-retry-member', updateId: 'chat-stable-retry-pr229' });
  assert.equal(statsData.loadStatsEvents({ userId: 'u-pr229', targetKind: 'chat', targetId: 'chat-retry-pr229' }, { period: 'all', eventType: 'member_joined' }).length, 1, 'chat audience idempotency must remain scoped');

  await render('admin_stats_manual_costs', chat);
  await statsFlow.handleTextInput(menu, { userId: 'u-pr229', text: 'chatScope / saved' });
  const chatSaved = await statsFlow.handleTextInput(menu, { userId: 'u-pr229', text: '44' });
  const chatSourcesPayload = btns(chatSaved).find((button) => button.text === '🎯 Источники').payload;
  assert.equal(chatSourcesPayload.targetKind, 'chat');
  assert.equal(chatSourcesPayload.chatId, 'chat1');
  const chatSources = await render(chatSourcesPayload.action, chatSourcesPayload);
  assert(/chatScope: 44 RUB/.test(chatSources.text), 'chat-scope saved cost must remain visible after Sources navigation');

  const cost = statsData.writeManualCost({ userId: 'u-pr229', ...channel }, { source: 's', campaign: 'c', amount: 10 }, 'added');
  assert(statsData.getManualCosts({ userId: 'u-pr229', ...channel }, { period: 'all' }).length === 1);
  assert(statsData.getManualCosts({ userId: 'u-pr229', ...channel2 }, { period: 'all' }).length === 0);
  assert(!statsData.getManualCosts({ userId: 'u-pr229', ...chat }, { period: 'all' }).some((item) => item.costId === cost.costId));

  for (const scope of [channel, chat, allChannels, allChats]) {
    for (const action of ['admin_stats_scope_select', 'admin_stats_growth', 'admin_stats_sources', 'admin_stats_funnel', 'admin_stats_content', 'admin_stats_quality', 'admin_stats_export']) {
      const screen = await render(action, scope);
      assert(screen && screen.id, action);
      noTech(screen);
      assert(btns(screen).every((button) => button.payload.action), 'buttons must be routable');
    }
  }

  const cpa = { targetKind: 'channel', targetId: 'cpa-chan-pr229', channelId: 'cpa-chan-pr229' };
  store.saveChannel('cpa-chan-pr229', { title: 'CPA channel', userId: 'u-pr229' });
  statsData.recordMemberJoined({ ownerUserId: 'u-pr229', ...cpa }, { userId: 'cpa-user-pr229', source: 'ads' });
  statsData.writeManualCost({ userId: 'u-pr229', ...cpa }, { source: 'ads', campaign: 'cpa', amount: 50 }, 'added');
  const cpaSources = await render('admin_stats_sources', cpa);
  assert(/CPA: 50\.00 за вступление/.test(cpaSources.text), 'CPA must use computed costPerJoin');

  const prod = await statsFlow.screenForPayload(menu, { action: 'admin_section_stats' }, { userId: 'u-pr229', config: {} });
  assert(/pr229/.test(prod.id), 'production callback routing');
  delete require.cache[require.resolve('../stats-scope-buttons-live-pr229')];
  const liveModule = require('../stats-scope-buttons-live-pr229');
  assert.strictEqual(liveModule.liveFlags().statsScopeButtonsContractOk, false);
  const live = await liveModule.runLive();
  assert(live.ok);
  assert.strictEqual(liveModule.liveFlags().statsScopeButtonsContractOk, true);
  assert(live.checkedButtons.every((button) => button.opened || button.externalFlow === 'comments_select_post' || button.action === 'admin_section_channels'));
  assert(live.checkedButtons.some((button) => /Рекламные ссылки/.test(button.text) && button.action === 'ad_links:home' && button.opened));

  const registered = {};
  routes.install({ get(path, handler) { registered[path] = handler; return this; }, post(path, handler) { registered[`POST ${path}`] = handler; return this; } });
  assert.equal(typeof registered['/debug/stats-scope-buttons-live'], 'function');
  console.log('PR229 stats scope/buttons contract OK', JSON.stringify({ screen: prod.id, endpoint: '/debug/stats-scope-buttons-live' }));
})().catch((error) => { console.error(error); process.exit(1); });
