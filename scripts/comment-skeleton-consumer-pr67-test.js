'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appLoader = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const skeletonConsumer = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-skeleton-consumer-pr67.js'), 'utf8');
const skeletonConsumerPr84 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-skeleton-consumer-pr84.js'), 'utf8');
const contract = fs.readFileSync(path.join(__dirname, '..', 'docs', 'COMMENT_UI_CONTRACT.md'), 'utf8');

assert.ok(appLoader.includes('CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED'), 'loader should expose PR67 skeleton consumer runtime');
assert.ok(appLoader.includes('/public/app-onepass.js?'), 'loader must keep legacy onepass as the default asset');
assert.ok(appLoader.includes('/public/app-skeleton-consumer-pr67.js?'), 'loader should route to guarded skeleton consumer asset only when opted in');
assert.ok(appLoader.includes('skeletonConsumer=pr(?:67|84)'), 'loader should preserve explicit PR67/PR84 skeleton consumer opt-in');
assert.ok(appLoader.includes('skeletonConsumer=pr67'), 'loader should preserve explicit PR67 skeleton consumer config selection');
assert.ok(appLoader.includes('skeletonFlagSource'), 'loader should read skeleton opt-in flags from both search and hash');
assert.ok(appLoader.includes('hasQueryFlag ? query : hash'), 'loader should let explicit search flags take precedence over hash flags');
assert.ok(appLoader.includes('hasSkeletonFlagValue'), 'loader should centralize skeleton opt-in and opt-out flag matching');
assert.ok(appLoader.includes('skeletonConsumerConfig'), 'loader should choose the guarded skeleton consumer from the explicit opt-in config');
assert.ok(appLoader.includes('__ADMINKIT_COMMENT_SKELETON_CONSUMER_RUNTIME__ = skeletonConfig.runtime'), 'loader should expose the selected skeleton runtime before loading the consumer');
assert.ok(/adminkitSkeleton\|commentSkeleton\|skeletonConsumer/.test(appLoader), 'loader must require an explicit URL opt-in flag');
assert.ok(!appLoader.includes('skeleton=1') || appLoader.indexOf('/public/app-onepass.js?') < appLoader.indexOf('/public/app-skeleton-consumer-pr67.js?'), 'default legacy loader must not silently append skeleton=1');

assert.ok(skeletonConsumer.includes('/debug/comment-ui/contract'), 'consumer must verify deployed contract endpoint before skeleton use');
assert.ok(skeletonConsumer.includes('legacyRuntimeStable === true'), 'consumer must guard legacy runtime stability');
assert.ok(skeletonConsumer.includes('skeletonOptInWorks === true'), 'consumer must require skeleton opt-in support');
assert.ok(skeletonConsumer.includes('hydrateUrlStripsSkeleton === true'), 'consumer must require hydrateUrl skeleton stripping');
assert.ok(skeletonConsumer.includes('noUserUiChange === true'), 'consumer must guard no user UI change contract');
assert.ok(skeletonConsumer.includes('initialSkeletonParams'), 'consumer must merge launch params from search and hash before skeleton fetch');
assert.ok(skeletonConsumer.includes('hashParamSource'), 'consumer must parse hash query strings after hash routes');
assert.ok(skeletonConsumer.includes("raw.indexOf('?')"), 'consumer must support #/route?commentKey=... hash launch params');
assert.ok(skeletonConsumer.includes('hashParams.forEach'), 'consumer must fill missing launch params from hash without overriding search');
assert.ok(skeletonConsumer.includes("params.set('skeleton', '1')"), 'consumer must request skeleton only from the guarded path');
assert.ok(skeletonConsumerPr84.includes('initialSkeletonParams'), 'PR84 consumer must merge launch params from search and hash before skeleton fetch');
assert.ok(skeletonConsumerPr84.includes('hashParamSource'), 'PR84 consumer must parse hash query strings after hash routes');
assert.ok(skeletonConsumerPr84.includes("params.set('skeletonConsumer', 'pr84')"), 'PR84 consumer must preserve the PR84 skeleton marker in skeleton fetches');
assert.ok(skeletonConsumerPr84.includes('hashParams.forEach'), 'PR84 consumer must fill missing launch params from hash without overriding search');
assert.ok(skeletonConsumer.includes('prefetchHydrate'), 'consumer should start hydrate prefetch after skeleton');
assert.ok(skeletonConsumer.includes('loadLegacy'), 'consumer must keep legacy fallback available');
assert.ok(skeletonConsumer.includes('contract_guard_failed'), 'consumer must fail back if contract check fails');
assert.ok(skeletonConsumer.includes('skeleton_fetch_failed'), 'consumer must fail back if skeleton fetch fails');
assert.ok(!skeletonConsumer.includes('/api/comments') && !skeletonConsumer.includes('gift') && !skeletonConsumer.includes('claimGift'), 'consumer must not touch comments mutation, gifts, or claim flows');

assert.ok(contract.includes('Performance PRs must be additive and reversible'), 'contract doc should continue to require additive/reversible rollout');

console.log('comment skeleton consumer PR67 smoke ok');
