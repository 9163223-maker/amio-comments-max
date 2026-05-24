'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const fastSend = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-fast-send-pr69.js'), 'utf8');

assert.ok(loader.includes('CC8.1.11-FAST-COMMENT-SEND-UNLOCK'), 'loader should expose PR69 fast send runtime');
assert.ok(loader.includes('/public/app-fast-send-pr69.js?'), 'default route should load fast send wrapper');
assert.ok(loader.includes('/public/app-skeleton-consumer-pr67.js?'), 'skeleton opt-in path must remain available');
assert.ok(/adminkitSkeleton\|commentSkeleton\|skeletonConsumer/.test(loader), 'skeleton path must remain explicit opt-in only');

assert.ok(fastSend.includes('CC8.1.11-FAST-COMMENT-SEND-UNLOCK'), 'fast send wrapper should expose runtime');
assert.ok(fastSend.includes('/public/app-onepass.js?v=7564'), 'fast send wrapper must load legacy onepass app');
assert.ok(fastSend.includes('unlockTextComposer'), 'fast send wrapper should unlock text composer');
assert.ok(fastSend.includes('state.sendInFlight = false'), 'fast send wrapper should clear sendInFlight for text sends');
assert.ok(fastSend.includes('input.readOnly = false'), 'fast send wrapper should release readOnly input');
assert.ok(fastSend.includes('sendBtn.disabled = false'), 'fast send wrapper should re-enable send button');
assert.ok(fastSend.includes('hasPendingPhoto'), 'fast send wrapper should preserve conservative photo behavior');
assert.ok(fastSend.includes('send_click') && fastSend.includes('enter_send'), 'fast send wrapper should cover button and Enter sends');

assert.ok(!fastSend.includes('/api/gifts') && !fastSend.includes('claimGift'), 'PR69 must not touch gifts');
assert.ok(!fastSend.includes('/api/adminkit/comment-open-state?') && !fastSend.includes('skeleton=1'), 'PR69 must not change comment-open-state or skeleton contract');

console.log('fast comment send PR69 smoke ok');
