'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appLoader = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const skeletonConsumer = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-skeleton-consumer-pr67.js'), 'utf8');
const contract = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COMMENT_UI_CONTRACT.md'), 'utf8');

assert.ok(appLoader.includes('CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED'), 'loader should expose PR67 skeleton consumer runtime');
assert.ok(appLoader.includes('/public/app-onepass.js?'), 'loader must keep legacy onepass as the default asset');
assert.ok(appLoader.includes('/public/app-skeleton-consumer-pr67.js?'), 'loader should route to guarded skeleton consumer asset only when opted in');
assert.ok(appLoader.includes('skeletonConsumer=pr67'), 'loader should preserve explicit PR67 skeleton consumer opt-in');
assert.ok(appLoader.includes('skeletonConsumerConfig'), 'loader should choose the guarded skeleton consumer from the explicit opt-in config');
assert.ok(/adminkitSkeleton\|commentSkeleton\|skeletonConsumer/.test(appLoader), 'loader must require an explicit URL opt-in flag');
assert.ok(!appLoader.includes('skeleton=1') || appLoader.indexOf('/public/app-onepass.js?') < appLoader.indexOf('/public/app-skeleton-consumer-pr67.js?'), 'default legacy loader must not silently append skeleton=1');

assert.ok(skeletonConsumer.includes('/debug/comment-ui/contract'), 'consumer must verify deployed contract endpoint before skeleton use');
assert.ok(skeletonConsumer.includes('legacyRuntimeStable === true'), 'consumer must guard legacy runtime stability');
assert.ok(skeletonConsumer.includes('skeletonOptInWorks === true'), 'consumer must require skeleton opt-in support');
assert.ok(skeletonConsumer.includes('hydrateUrlStripsSkeleton === true'), 'consumer must require hydrateUrl skeleton stripping');
assert.ok(skeletonConsumer.includes('noUserUiChange === true'), 'consumer must guard no user UI change contract');
assert.ok(skeletonConsumer.includes("params.set('skeleton', '1')"), 'consumer must request skeleton only from the guarded path');
assert.ok(skeletonConsumer.includes('prefetchHydrate'), 'consumer should start hydrate prefetch after skeleton');
assert.ok(skeletonConsumer.includes('loadLegacy'), 'consumer must keep legacy fallback available');
assert.ok(skeletonConsumer.includes('contract_guard_failed'), 'consumer must fail back if contract check fails');
assert.ok(skeletonConsumer.includes('skeleton_fetch_failed'), 'consumer must fail back if skeleton fetch fails');
assert.ok(!skeletonConsumer.includes('/api/comments') && !skeletonConsumer.includes('gift') && !skeletonConsumer.includes('claimGift'), 'consumer must not touch comments mutation, gifts, or claim flows');

assert.ok(contract.includes('Performance PRs must be additive and reversible'), 'contract doc should continue to require additive/reversible rollout');

console.log('comment skeleton consumer PR67 smoke ok');
