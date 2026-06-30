'use strict';
const assert = require('assert');
const adapter = require('../features/menu-v3/adapter');
const matrix = require('../services/channelTargetMatrixService');
const picker = require('../channel-post-picker-core');

const channels = matrix.fixtureChannels();
const report = matrix.buildMatrix(channels);
assert.strictEqual(report.ok, true, `matrix leaked chat-like records: ${JSON.stringify(report.leaks)}`);
assert(report.routes.includes('channels:list'));
for (const target of matrix.POST_TARGETS) {
  assert(report.routes.includes(`${target}:choose_channel`), `${target}:choose_channel covered`);
  assert(report.routes.includes(`${target}:choose_post`), `${target}:choose_post covered`);
}

for (const title of matrix.FORBIDDEN_TITLES) {
  assert.strictEqual(picker.isKnownChannelRecord({ channelId:'danger-direct', title }, 'matrix-user'), false, `dangerous channelId + ${title} must not be a channel`);
}
assert.strictEqual(picker.isKnownChannelRecord({ channelId:'ch-tenant-1', title:'Tenant channel', tenantId:'tenant-1', status:'active' }, 'matrix-user'), true, 'tenant-bound channel must remain visible');
assert.strictEqual(picker.isKnownChannelRecord({ channelId:'ch-real-1', title:'Typed channel', type:'channel' }, 'matrix-user'), true, 'explicit channel type must remain visible');
assert.strictEqual(picker.isKnownChannelRecord({ channelId:'ch-owner-1', title:'Owner channel', ownerUserId:'matrix-user' }, 'matrix-user'), true, 'owner-linked channel must remain visible');

const rawRoot = adapter.render('channels:list', { channels });
const serializedRoot = JSON.stringify(rawRoot);
for (const forbidden of matrix.FORBIDDEN_TITLES) assert(!serializedRoot.includes(forbidden), `channels:list leaked ${forbidden}`);
for (const raw of matrix.dangerousRecords(channels)) for (const value of [raw.id, raw.chatId, raw.channelId].filter(Boolean)) assert(!serializedRoot.includes(value), `channels:list payload leaked ${value}`);
for (const target of matrix.POST_TARGETS) {
  const chooseChannel = adapter.render(`${target}:choose_channel`, { channels });
  const serializedChannel = JSON.stringify(chooseChannel);
  const posts = matrix.fixturePosts('ch-posts-1');
  const choosePost = adapter.render(`${target}:choose_post`, { dataContext:{ channelId:'ch-posts-1', channelTitle:'Канал с постами', posts }, channels, posts });
  const serializedPost = JSON.stringify(choosePost);
  for (const serialized of [serializedChannel, serializedPost]) {
    for (const forbidden of matrix.FORBIDDEN_TITLES) assert(!serialized.includes(forbidden), `${target} leaked ${forbidden}`);
    for (const raw of matrix.dangerousRecords(channels)) for (const value of [raw.id, raw.chatId, raw.channelId].filter(Boolean)) assert(!serialized.includes(value), `${target} payload leaked ${value}`);
  }
  assert(serializedPost.includes('Безопасный пост'), `${target}:choose_post shows safe post`);
}
assert(serializedRoot.includes('Настоящий канал'));
assert(serializedRoot.includes('Канал клиента'));
console.log('PR259 channel target matrix PASS');
