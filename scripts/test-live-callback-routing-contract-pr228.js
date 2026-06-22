'use strict';
const assert = require('assert');
(async () => {
  const contract = require('../callback-contract-live-pr228');
  const result = await contract.runLiveContract();
  assert.strictEqual(result.chainIncludesChannelFirst, true, 'production bot chain must include clean-bot-channel-first-post-picker-pr90.js');
  assert.strictEqual(result.packageStartUnchanged, true, 'package start script must remain unchanged');
  assert.strictEqual(result.activeEntrypointUnchanged, true, 'active entrypoint must remain clean-entrypoint-1.53.10-pr89.js');
  assert.strictEqual(result.statsMainMenuRoutesToCurrentStatsRoot, true, `Statistics callback must reach PR229 stats root, got ${result.screenId}`);
  assert.strictEqual(result.statsLegacyRootNotReturned, true, `Statistics callback must not return legacy stats root, got ${result.screenId}`);
  assert.strictEqual(result.statsCallbackContractLiveOk, true, 'live stats callback contract must pass');
  console.log(JSON.stringify(result));
})().catch((error) => { console.error(error); process.exit(1); });
