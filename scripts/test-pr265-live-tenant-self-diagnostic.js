'use strict';

const assert = require('assert');
const store = require('../store');
const access = require('../services/clientAccessService');
const binding = require('../services/tenantChannelBindingService');
const diagnostic = require('../services/liveTenantSelfDiagnosticService');
const picker = require('../channel-post-picker-core');

function reset() {
  access._resetForTests();
  store.store.posts = {}; store.store.comments = {}; store.store.likes = {}; store.store.reactions = {}; store.store.channels = {};
  binding.clearDiagnostics(); store.saveStore();
}
function activate(maxUserId, maxChannels = 5) {
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels, createdByMaxUserId: 'pr265-admin', note: `PR265 ${maxUserId}` });
  const result = access.activateCode({ maxUserId, code: code.code, name: maxUserId });
  assert.strictEqual(result.ok, true, `${maxUserId}: activation works`);
  return result;
}
function bind(maxUserId, channelId, title, postId) {
  const r = binding.bindChannelForInitiator({ maxUserId, channelId, channelTitle: title, source: 'pr265-test', botAdminProof: { proven: true }, postEvidence: { postId } });
  assert.strictEqual(r.ok, true, `${maxUserId}: channel binding works`);
  store.savePost(`${channelId}:${postId}`, { channelId, channelTitle: title, postId, messageId: `m-${postId}`, commentKey: `${channelId}:${postId}`, originalText: `Post ${postId}`, linkedByUserId: maxUserId });
}

(async () => {
  reset();
  const userA = 'pr265-user-a';
  const userB = 'pr265-user-b';
  activate(userA, 5);
  activate(userB, 5);
  bind(userA, '-265001', 'PR265 A channel', 'a-post-1');
  bind(userB, '-265002', 'PR265 B channel', 'b-post-1');
  store.saveChannel('chat-265', { channelId: 'chat-265', title: 'PR265 group chat', type: 'group', linkedByUserId: userA });

  const a = await diagnostic.buildSelfDiagnostic({ maxUserId: userA });
  const b = await diagnostic.buildSelfDiagnostic({ maxUserId: userB });
  assert.strictEqual(a.ok, true, 'user A diagnostic ok');
  assert.strictEqual(b.ok, true, 'user B diagnostic ok');
  assert.strictEqual(a.summary.knownTenant, true, 'user A tenant found');
  assert.strictEqual(b.summary.knownTenant, true, 'user B tenant found');
  assert.strictEqual(a.summary.pickerChannelsCount, 1, 'user A has one picker channel');
  assert.strictEqual(b.summary.pickerChannelsCount, 1, 'user B has one picker channel');
  assert.ok(a.channels.picker.some((ch) => /A channel/.test(ch.title)), 'user A sees A channel');
  assert.ok(!a.channels.picker.some((ch) => /B channel/.test(ch.title)), 'user A does not see B channel');
  assert.ok(b.channels.picker.some((ch) => /B channel/.test(ch.title)), 'user B sees B channel');
  assert.ok(!b.channels.picker.some((ch) => /A channel/.test(ch.title)), 'user B does not see A channel');
  assert.ok(a.summary.chatExcludedCount >= 1, 'chat-like records are counted as excluded');
  assert.ok(!a.channels.picker.some((ch) => /group chat/i.test(ch.title)), 'chat-like record is not a picker channel');
  assert.ok(picker.listUiPostsForChannel(userA, '-265001').length === 1, 'user A post picker has own post');
  assert.ok(picker.listUiPostsForChannel(userB, '-265002').length === 1, 'user B post picker has own post');

  const missing = await diagnostic.buildSelfDiagnostic({ maxUserId: 'pr265-no-tenant' });
  assert.strictEqual(missing.ok, false, 'unknown user diagnostic blocks missing tenant');
  assert.ok(missing.violations.some((v) => v.code === 'tenant_missing_for_live_user'), 'missing tenant reason is explicit');

  const screen = await diagnostic.buildScreen({ maxUserId: userA });
  assert.ok(/Диагностика привязки/.test(screen.text), 'screen has diagnostic title');
  assert.ok(/Ваш MAX ID:/.test(screen.text), 'screen shows masked current user id');
  assert.ok(!screen.text.includes(userA), 'screen does not expose raw user id');
  assert.ok(/Каналы в picker: 1/.test(screen.text), 'screen reports picker channel count');
  assert.ok((screen.attachments[0].payload.buttons || []).flat().some((button) => button.text === 'Обновить диагностику'), 'screen has refresh action');

  const matrix = await diagnostic.buildMatrix({ users: [userA, userB] });
  assert.strictEqual(matrix.ok, true, 'multi-user diagnostic matrix ok');
  assert.strictEqual(matrix.summary.checkedCount, 2, 'matrix checks two configured users');
  assert.strictEqual(matrix.rows.length, 2, 'matrix has two rows');
  assert.ok(matrix.rows.every((row) => row.summary.pickerChannelsCount === 1), 'each user has isolated picker channel count');
  console.log('PR265 live tenant self diagnostic PASS');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });