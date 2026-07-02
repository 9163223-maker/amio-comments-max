'use strict';

const assert = require('assert');
const picker = require('../channel-post-picker-core');

assert.strictEqual(picker.isKnownChannelRecord({ channelId: 'c1', type: 'channel', isChannel: true }, 'u1'), true);
assert.strictEqual(picker.isKnownChannelRecord({ channelId: 'c2', type: 'chat' }, 'u1'), false);
assert.strictEqual(picker.isKnownChannelRecord({ channelId: 'c3', type: 'dialog' }, 'u1'), false);

console.log('PR272 service diagnostic and official picker smoke PASS');
