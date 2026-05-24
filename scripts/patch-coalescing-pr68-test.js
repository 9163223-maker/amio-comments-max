'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const postPatcher = fs.readFileSync(path.join(__dirname, '..', 'services', 'postPatcher.js'), 'utf8');

assert.ok(postPatcher.includes('CC8.1.10-PATCH-REPATCH-COALESCING'), 'postPatcher should expose PR68 runtime');
assert.ok(postPatcher.includes('patchCoalescingQueues'), 'postPatcher should keep a keyed coalescing queue');
assert.ok(postPatcher.includes('patchStoredPostRaw'), 'postPatcher should preserve the raw patch implementation');
assert.ok(postPatcher.includes('getPatchCoalescingSnapshot'), 'postPatcher should expose coalescing diagnostics');

[
  'patch.request.received',
  'patch.compute.begin',
  'patch.compute.end',
  'patch.edit_api.begin',
  'patch.edit_api.end',
  'patch.repatch.coalesced_count',
  'patch.done'
].forEach((marker) => {
  assert.ok(postPatcher.includes(marker), `postPatcher should emit ${marker}`);
});

assert.ok(/patchCoalescingQueues\.get\(commentKey\)/.test(postPatcher), 'coalescing should be keyed by commentKey');
assert.ok(/state\.pendingOptions = \{ \.\.\.options, commentKey \}/.test(postPatcher), 'coalescing should keep the latest pending options');
assert.ok(/runNextCoalescedPatch\(commentKey, state\)/.test(postPatcher), 'coalescing should drain the keyed queue');
assert.ok(/patchCoalescingStats\.coalescedRequests \+= 1/.test(postPatcher), 'coalesced requests should be counted');
assert.ok(postPatcher.includes('module.exports') && postPatcher.includes('PATCH_COALESCE_RUNTIME'), 'new runtime should be exported for audits');

assert.ok(!postPatcher.includes('claimGift('), 'PR68 must not call gift claim logic');
assert.ok(!postPatcher.includes('processPendingGiftClaimInput'), 'PR68 must not touch pending gift claim input');
assert.ok(!postPatcher.includes('/api/adminkit/comment-open-state'), 'PR68 must not change comment-open-state routing');

console.log('patch coalescing PR68 smoke ok');
