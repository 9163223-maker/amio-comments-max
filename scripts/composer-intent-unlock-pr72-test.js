'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const loader = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const onepass = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-onepass.js'), 'utf8');

assert.ok(loader.includes('CC8.1.13-COMPOSER-INTENT-UNLOCK'), 'loader should expose PR72 runtime marker');
assert.ok(loader.includes('installComposerIntentUnlock'), 'loader should install composer intent unlock guard');
assert.ok(loader.includes("target.id !== 'commentInput'"), 'unlock should only react to the comment composer input');
assert.ok(loader.includes('event.isTrusted === false'), 'unlock should ignore synthetic input events');
assert.ok(loader.includes('state.textSendInFlight = {}'), 'trusted composer input should clear text-send locks');
assert.ok(loader.includes('/public/app-onepass.js?'), 'default loader must keep direct app-onepass route');
assert.ok(loader.includes('/public/app-skeleton-consumer-pr67.js?'), 'skeleton consumer must remain explicit opt-in');
assert.ok(!loader.includes('app-fast-send-pr69'), 'PR72 must not reintroduce PR69 wrapper');
assert.ok(!loader.includes('/api/gifts') && !loader.includes('claimGift'), 'PR72 must not touch gifts');
assert.ok(!loader.includes('/api/adminkit/comment-open-state?skeleton=1'), 'PR72 must not change skeleton contract');

assert.ok(onepass.includes('textSendInFlight'), 'PR72 should remain compatible with PR70 text-send locks');
assert.ok(onepass.includes('function beginTextSend(fingerprint)'), 'PR70 direct core text guard should remain in onepass');
assert.ok(!onepass.includes('pruneTextSendGuards'), 'PR72 must not restore time-based text guard expiry');

console.log('composer intent unlock PR72 smoke ok');
