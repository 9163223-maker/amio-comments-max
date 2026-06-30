'use strict';
const assert = require('assert');
const adapter = require('../features/menu-v3/adapter');
const matrix = require('../services/channelTargetMatrixService');
const picker = require('../channel-post-picker-core');

const channels = matrix.fixtureChannels();
const report = matrix.buildMatrix(channels);
assert.strictEqual(report.ok, true, `matrix leaked chat-like records: ${JSON.stringify(report.leaks)}`);
assert(report.routes.includes('channels:list'));
for (const target of matrix.POST_TARGETS) assert(report.routes.includes(`${target}:choose_channel`));

const rawRoot = adapter.render('channels:list', { channels });
const serializedRoot = JSON.stringify(rawRoot);
for (const forbidden of matrix.FORBIDDEN_TITLES) assert(!serializedRoot.includes(forbidden), `channels:list leaked ${forbidden}`);
for (const raw of channels) {
  if (picker.isChatLikeRecord(raw) || matrix.FORBIDDEN_TITLES.includes(raw.title)) {
    for (const value of [raw.id, raw.chatId].filter(Boolean)) assert(!serializedRoot.includes(value), `channels:list payload leaked ${value}`);
  }
}
assert(serializedRoot.includes('Настоящий канал'));
assert(serializedRoot.includes('Канал клиента'));
console.log('PR259 channel target matrix PASS');
