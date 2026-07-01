'use strict';

const assert = require('assert');
const store = require('../store');
const access = require('../services/clientAccessService');
const binding = require('../services/tenantChannelBindingService');
const picker = require('../channel-post-picker-core');
const matrix = require('../services/tenantSectionMatrixService');

function reset() {
  access._resetForTests();
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.channels = {};
  binding.clearDiagnostics();
  store.saveStore();
}
function activate(maxUserId, maxChannels = 5) {
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels, createdByMaxUserId: 'pr267-admin', note: `PR267 ${maxUserId}` });
  const result = access.activateCode({ maxUserId, code: code.code, name: maxUserId });
  assert.strictEqual(result.ok, true, `${maxUserId}: activated`);
}
function bind(maxUserId, channelId, title, postId, postTitle) {
  const result = binding.bindChannelForInitiator({ maxUserId, channelId, channelTitle: title, source: 'pr267-tenant-section-matrix', botAdminProof: { proven: true }, postEvidence: { postId } });
  assert.strictEqual(result.ok, true, `${maxUserId}: channel bound`);
  store.savePost(`${channelId}:${postId}`, { channelId, channelTitle: title, postId, messageId: `m-${postId}`, commentKey: `${channelId}:${postId}`, title: postTitle, originalText: postTitle, linkedByUserId: maxUserId });
}

(async () => {
  reset();
  const userA = 'pr267-user-a';
  const userB = 'pr267-user-b';
  activate(userA, 5);
  activate(userB, 5);
  bind(userA, '-267001', 'Канал Альфа', 'alpha-post-1', 'Публикация Альфа');
  bind(userB, '-267002', 'Канал Бета', 'beta-post-1', 'Публикация Бета');
  store.saveChannel('chat-pr267', { channelId: 'chat-pr267', title: 'Семейный чат', type: 'group', linkedByUserId: userA });

  const aChannels = await picker.listUiChannelsForUser(userA, {});
  const bChannels = await picker.listUiChannelsForUser(userB, {});
  assert.strictEqual(aChannels.length, 1, 'user A has one picker channel');
  assert.strictEqual(bChannels.length, 1, 'user B has one picker channel');
  assert.ok(aChannels.some((channel) => /Альфа/.test(channel.title || channel.channelTitle || '')), 'user A sees Alpha');
  assert.ok(!aChannels.some((channel) => /Бета/.test(channel.title || channel.channelTitle || '')), 'user A does not see Beta');
  assert.ok(bChannels.some((channel) => /Бета/.test(channel.title || channel.channelTitle || '')), 'user B sees Beta');
  assert.ok(!bChannels.some((channel) => /Альфа/.test(channel.title || channel.channelTitle || '')), 'user B does not see Alpha');

  const result = await matrix.buildMatrix({ users: [userA, userB] });
  assert.strictEqual(result.ok, true, JSON.stringify(result.violations, null, 2));
  assert.deepStrictEqual(result.checkedUsers, ['pr2…r-a', 'pr2…r-b'], 'checked users are masked in export');
  assert.strictEqual(result.summary.checkedUsersCount, 2, 'two users checked');
  assert.strictEqual(result.summary.postScopedSectionsChecked >= 6, true, 'post scoped sections covered');
  assert.strictEqual(result.rows.length, 2, 'two matrix rows');
  assert.ok(result.rows.every((row) => row.userIdMasked && row.userId === row.userIdMasked), 'row user ids are masked');
  assert.ok(result.rows.every((row) => row.pickerChannelsCount === 1), 'each row has isolated picker channel');
  assert.ok(result.rows.every((row) => row.firstChannelPostsCount === 1), 'each row has one scoped post');
  assert.ok(result.rows.every((row) => row.routes.length >= 20), 'each user renders root and post-scoped routes');
  assert.ok(result.rows.every((row) => row.routes.some((route) => route.section === 'main' && route.scenario === 'root_open')), 'main root rendered for every user');
  assert.ok(result.rows.every((row) => row.routes.some((route) => route.section === 'channels' && route.scenario === 'my_channels')), 'channels tenant list rendered for every user');
  assert.ok(result.rows.every((row) => row.routes.some((route) => route.section === 'account' && route.scenario === 'account_home')), 'account tenant root rendered for every user');
  assert.ok(result.rows.every((row) => row.routes.some((route) => route.scenario === 'choose_channel')), 'post-scoped channel picker rendered for every user');
  assert.ok(result.rows.every((row) => row.routes.some((route) => route.scenario === 'choose_post')), 'post-scoped post picker rendered for every user');
  assert.ok(result.manualAlgorithms.length >= 3, 'manual algorithms included');
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(userA), 'raw user A id is not exported');
  assert.ok(!serialized.includes(userB), 'raw user B id is not exported');
  assert.ok(!serialized.includes('Семейный чат'), 'chat-like record never leaks into matrix output');
  console.log('PR267 tenant section matrix PASS');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });