'use strict';

const assert = require('assert');
const store = require('../store');
const access = require('../services/clientAccessService');
const binding = require('../services/tenantChannelBindingService');
const picker = require('../channel-post-picker-core');
const patcher = require('../services/postPatcherFastPr84');

function reset() {
  access._resetForTests();
  store.store.posts = {}; store.store.comments = {}; store.store.likes = {}; store.store.reactions = {}; store.store.channels = {};
  binding.clearDiagnostics(); store.saveStore();
}

(async () => {
  reset();
  const user = 'pr263-user';
  const channel = '-263001';
  const tenantResult = binding.ensureTenantForUser({ maxUserId: user, name: 'PR263', source: 'test' });
  assert.strictEqual(tenantResult.ok, true, 'activation creates tenant for user');
  const bind = binding.bindChannelForInitiator({ maxUserId: user, channelId: channel, channelTitle: 'PR263 Channel', source: 'test', botAdminProof: { proven: true }, postEvidence: { postId: 'p1' } });
  assert.strictEqual(bind.ok, true, 'bindChannelForInitiator creates active binding');
  assert.ok(access.getClientChannels(user).some((ch) => ch.channelId === channel), 'clientAccessService.getClientChannels includes bound channel');
  store.savePost(`${channel}:p1`, { channelId: channel, channelTitle: 'PR263 Channel', postId: 'p1', messageId: 'm1', commentKey: `${channel}:p1`, originalText: 'Visible PR263 post', linkedByUserId: user });
  const channels = await picker.listUiChannelsForUser(user, {});
  assert.ok(channels.some((ch) => ch.channelId === channel), 'channel-post-picker-core.listUiChannelsForUser includes bound channel');
  assert.ok(picker.listUiPostsForChannel(user, channel).some((post) => post.postId === 'p1'), 'listUiPostsForChannel includes posts for bound channel');

  const channel2 = '-263002';
  await patcher.tryPatchChannelPost({ channelId: channel2, postId: 'p2', messageId: 'm2', channelTitle: 'PR263 Direct', linkedByUserId: user, originalText: 'Direct post with user', autoMode: true });
  assert.ok(access.getClientChannels(user).some((ch) => ch.channelId === channel2), 'direct channel post with initiating user binds channel');
  assert.ok(picker.listUiPostsForChannel(user, channel2).some((post) => post.postId === 'p2'), 'direct channel post appears');

  const channel3 = '-263003';
  await patcher.tryPatchChannelPost({ channelId: channel3, postId: 'p3', messageId: 'm3', channelTitle: 'PR263 Missing User', originalText: 'Direct post without user', autoMode: true });
  assert.ok(!access.getClientChannels(user).some((ch) => ch.channelId === channel3), 'direct channel post without initiating user does not silently bind');
  assert.ok(binding.getDiagnostics().some((d) => d.code === 'missing_initiating_user_for_channel_bind'), 'diagnostic warns for missing initiating user');

  binding.markChannelBotAdminState({ channelId: channel2, botIsAdmin: false, source: 'bot_removed' });
  assert.ok(!(await picker.listUiChannelsForUser(user, {})).some((ch) => ch.channelId === channel2), 'bot_removed hides inactive binding from picker');

  const chatBind = binding.bindChannelForInitiator({ maxUserId: user, channelId: 'chat-263', channelTitle: 'Chat', source: 'test', metadata: { type: 'group' } });
  assert.strictEqual(chatBind.ok, false, 'chat-like record does not bind');
  assert.strictEqual(chatBind.reason, 'chat_like_record');
  assert.ok(!(await picker.listUiChannelsForUser(user, {})).some((ch) => ch.channelId === 'chat-263'), 'chat-like record does not appear in channel picker');

  const other = 'pr263-other';
  binding.ensureTenantForUser({ maxUserId: other, source: 'test' });
  const conflict = binding.bindChannelForInitiator({ maxUserId: other, channelId: channel, channelTitle: 'Conflict', source: 'test' });
  assert.strictEqual(conflict.reason, 'channel_owned_by_another_tenant', 'conflict with another tenant returns channel_owned_by_another_tenant');

  binding.clearDiagnostics();
  const normal = await binding.buildTenantChannelBindingMatrix({ maxUserId: user });
  assert.strictEqual(normal.ok, true, 'runtime tenant-channel-binding matrix ok true on normal fixture');
  const hidden = '-263004';
  store.savePost(`${hidden}:p4`, { channelId: hidden, channelTitle: 'Hidden', postId: 'p4', messageId: 'm4', commentKey: `${hidden}:p4`, originalText: 'Hidden post', linkedByUserId: user });
  const blocked = await binding.buildTenantChannelBindingMatrix({ maxUserId: user });
  assert.strictEqual(blocked.ok, false, 'runtime tenant-channel-binding matrix blocks on missing binding fixture');
  assert.ok(blocked.summary.blockCount > 0, 'missing binding creates block');
  console.log('PR263 tenant channel binding contract PASS');
})().catch((error) => { console.error(error); process.exit(1); });
