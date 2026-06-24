'use strict';

const assert = require('assert');
const runtimeRoutes = require('../runtime-contract-routes');

const payload = runtimeRoutes.payload();
const summary = payload.pr237SingleActiveSlashUx;

assert.strictEqual(payload.ok, true, 'PR237-DIAG-001: runtime contract endpoint must be ok only when PR237 UX contract is ok');
assert.strictEqual(summary.ok, true, 'PR237-DIAG-002: PR237 UX summary must be ok');
assert.strictEqual(summary.source, 'services/nativeSlashCommands.pr237Contract', 'PR237-DIAG-003: PR237 source must be explicit');

for (const key of runtimeRoutes.PR237_KEYS) {
  assert.strictEqual(summary.flags[key], true, `PR237-DIAG-004: summary flag ${key} must be true`);
  assert.strictEqual(payload.contract[key], true, `PR237-DIAG-005: raw contract flag ${key} must be true`);
}

assert.strictEqual(payload.contract.pr237SingleActiveSlashUx.slashPrivateUpsertTargetsLatestBotMenu, true, 'PR237-DIAG-006: nested contract keeps latest-bot-menu proof');
assert.strictEqual(payload.contract.pr237SingleActiveSlashUx.slashGroupHelpUsesUntrackedReply, true, 'PR237-DIAG-007: nested contract keeps group untracked reply proof');
assert.strictEqual(payload.contract.pr237SingleActiveSlashUx.slashGroupPushDoesNotRenderPrivateAdminScreen, true, 'PR237-DIAG-008: nested contract keeps group push safety proof');

console.log('PR237 runtime contract diagnostics assertions passed');
