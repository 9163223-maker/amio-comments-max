#!/usr/bin/env node
'use strict';

const assert = require('assert');
const contract = require('../callback-contract-live-pr228');

(async () => {
  const result = await contract.runLiveCallbackContract();
  console.log(JSON.stringify(result, null, 2));
  assert.strictEqual(result.mainMenuStatsButtonFound, true, 'STAT-CB-001: main menu Statistics button must be found');
  assert.ok(result.mainMenuStatsPayload && ['admin_section_stats', 'stats:home'].includes(String(result.mainMenuStatsPayload.action || '')), 'STAT-CB-002: Statistics button payload must be the real production stats callback');
  assert.ok(result.resolvedHandler && !/legacy-stub/.test(result.resolvedHandler), 'STAT-CB-003: payload must pass through production callback/router path');
  for (const label of contract.EXPECTED_LABELS) assert.ok(result.expectedLabelsPresent.includes(label), `STAT-CB-004: missing PR226 label ${label}`);
  assert.deepStrictEqual(result.legacyLabelsPresent, [], 'STAT-CB-005: legacy stats root labels must not be returned');
  assert.strictEqual(result.adminSectionStatsRoutesToPr226, true, 'STAT-CB-006: real main menu stats payload must route to PR226 stats home');
  assert.strictEqual(result.ok, true, `STAT-CB-007: live callback contract failed: ${result.errors.join(', ')}`);
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
