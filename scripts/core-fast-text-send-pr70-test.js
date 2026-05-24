'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const onepass = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-onepass.js'), 'utf8');

assert.ok(loader.includes('/public/app-onepass.js?'), 'default loader must keep direct app-onepass route');
assert.ok(!loader.includes('app-fast-send-pr69'), 'default loader must not use fast-send wrapper');
assert.ok(loader.includes('/public/app-skeleton-consumer-pr67.js?'), 'skeleton consumer must remain explicit opt-in');
assert.ok(/adminkitSkeleton\|commentSkeleton\|skeletonConsumer/.test(loader), 'skeleton path must remain guarded by explicit opt-in flags');

assert.ok(onepass.includes('CC8.1.12-CORE-FAST-TEXT-SEND'), 'core comments client should expose PR70 runtime');
assert.ok(onepass.includes('textSendInFlight'), 'core comments client should keep text send guard map');
assert.ok(onepass.includes('beginTextSend(fingerprint)'), 'text send should use a core duplicate guard');
assert.ok(onepass.includes('endTextSend(fingerprint)'), 'text send should release the core duplicate guard after POST completion');
assert.ok(onepass.includes('if (hasPhoto) {'), 'photo sends should remain separated from text-only sends');
assert.ok(onepass.includes('setSendingUi(true)'), 'photo send still uses the conservative legacy sending UI lock');
assert.ok(onepass.includes('if (textOnly) pushCommentTrace'), 'text-only sends should be traced separately');
assert.ok(onepass.includes('autoResizeComposerInput();'), 'composer should resize after optimistic text clear');

assert.ok(!onepass.includes('app-fast-send-pr69'), 'core patch must not depend on PR69 wrapper');
assert.ok(!onepass.includes('setTimeout(() => unlock'), 'core patch must not clear sendInFlight with a timer');
assert.ok(!onepass.includes('state.sendInFlight = false;\n  state.lastSendFingerprint'), 'core patch must not globally bypass sendInFlight before POST completion');
assert.ok(!onepass.includes('/api/gifts') && !onepass.includes('claimGift'), 'PR70 must not touch gifts');
assert.ok(!onepass.includes('/api/adminkit/comment-open-state?skeleton=1'), 'PR70 must not change skeleton contract');

console.log('core fast text send PR70 smoke ok');
