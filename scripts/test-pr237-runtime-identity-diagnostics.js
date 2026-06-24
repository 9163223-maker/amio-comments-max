'use strict';

const assert = require('assert');
const buildInfo = require('../buildInfo').getBuildInfo();
const runtimeContract = require('../services/runtimeContractService').buildContract();

assert.strictEqual(buildInfo.runtimeVersion, 'CC8.3.69-PR237-SINGLE-ACTIVE-SLASH-UX', 'runtimeVersion exposes PR237 identity');
assert.strictEqual(buildInfo.buildVersion, 'CC8.3.69-PR237-SINGLE-ACTIVE-SLASH-UX', 'buildVersion exposes PR237 identity');
assert.strictEqual(buildInfo.displayVersion, 'CC8.3.69-PR237-SINGLE-ACTIVE-SLASH-UX', 'displayVersion exposes PR237 identity');
assert.strictEqual(buildInfo.sourceMarker, 'adminkit-pr237-single-active-slash-ux', 'sourceMarker exposes PR237 identity');
assert.strictEqual(buildInfo.expectedRuntimeVersion, 'CC8.3.69-PR237-SINGLE-ACTIVE-SLASH-UX', 'expected runtime is PR237');
assert.strictEqual(buildInfo.staleEndpointDetected, false, 'PR237 runtime identity is not stale');
assert.strictEqual(runtimeContract.slashSingleActiveMenuContractOk, true, 'runtime contract exposes PR237 single-active slash contract');
assert.strictEqual(runtimeContract.slashPrivateUpsertTargetsLatestBotMenu, true, 'runtime contract exposes latest bot menu edit target');
assert.strictEqual(runtimeContract.slashGroupHelpUsesUntrackedReply, true, 'runtime contract exposes untracked group reply');
assert.strictEqual(runtimeContract.slashGroupPushDoesNotRenderPrivateAdminScreen, true, 'runtime contract exposes group push safety');

console.log('PR237 runtime identity diagnostics assertions passed');
