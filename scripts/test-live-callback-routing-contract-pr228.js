#!/usr/bin/env node
'use strict';

const assert = require('assert');
const contract = require('../callback-contract-live-pr228');
const menu = require('../v3-menu-core-1539');
const routes = require('../v3-menu-routes-1539');
const statsFlow = require('../stats-flow-cc8');
const maxApi = require('../services/maxApi');

function createRouteRes() {
  const res = { statusCode: 0, body: '', headers: {} };
  res.set = (headers = {}) => { res.headers = { ...res.headers, ...headers }; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = () => res;
  res.send = (body) => { res.body = String(body); return res; };
  return res;
}
function installRoutes() {
  const registered = {};
  const app = { get(route, handler) { registered[route] = handler; return this; }, post(route, handler) { registered[`POST ${route}`] = handler; return this; } };
  routes.install(app);
  return registered;
}

(async () => {
  const parsedFromPollutedStdout = contract.parseChildResult(`module log before json\n${contract.RESULT_MARKER}{"ok":true,"sample":1}\n`);
  assert.strictEqual(parsedFromPollutedStdout.sample, 1, 'STAT-CB-000: child result parser must ignore stdout noise before marker');

  const result = await contract.runLiveCallbackContract();
  console.log(JSON.stringify(result, null, 2));
  assert.strictEqual(result.mainMenuStatsButtonFound, true, 'STAT-CB-001: main menu Statistics button must be found');
  assert.ok(result.mainMenuStatsPayload && ['admin_section_stats', 'stats:home'].includes(String(result.mainMenuStatsPayload.action || '')), 'STAT-CB-002: Statistics button payload must be the real production stats callback');
  assert.ok(result.resolvedHandler && !/legacy-stub/.test(result.resolvedHandler), 'STAT-CB-003: payload must pass through production callback/router path');
  for (const label of contract.EXPECTED_LABELS) assert.ok(result.expectedLabelsPresent.includes(label), `STAT-CB-004: missing PR226 root button label ${label}`);
  assert.deepStrictEqual(result.legacyLabelsPresent, [], 'STAT-CB-005: legacy stats root button labels must not be returned');
  assert.strictEqual(result.adminSectionStatsRoutesToPr226, true, 'STAT-CB-006: real main menu stats payload must route to PR226 stats home');
  assert.strictEqual(result.ok, true, `STAT-CB-007: live callback contract failed: ${result.errors.join(', ')}`);

  const syncStatsScreen = menu.screenForPayload({ action: 'stats:home', route: 'stats:home' });
  assert.ok(syncStatsScreen && typeof syncStatsScreen.then !== 'function', 'STAT-CB-008: sync stats route must not return a Promise');
  assert.strictEqual(syncStatsScreen.id, 'stats_product_perfect_home_pr226', 'STAT-CB-009: sync stats route must simulate PR226 root');
  const flowStatsScreen = await statsFlow.screenForPayload(menu, { action: 'admin_section_stats' }, { userId: 'pr228-admin-user' });
  assert.deepStrictEqual(contract.visibleButtonLabels(syncStatsScreen), contract.visibleButtonLabels(flowStatsScreen), 'STAT-CB-010: sync stats:home labels must match statsFlow admin_section_stats labels');

  const registered = installRoutes();
  assert.strictEqual(typeof registered['/debug/callback-contract-live'], 'function', 'STAT-CB-011: callback contract endpoint must be registered');
  assert.strictEqual(typeof registered['/debug/menu/routes'], 'function', 'STAT-CB-012: menu routes endpoint must be registered');
  const routesRes = createRouteRes();
  registered['/debug/menu/routes']({}, routesRes);
  const routesBody = JSON.parse(routesRes.body);
  assert.ok(routesBody.routes.includes('/debug/callback-contract-live'), 'STAT-CB-013: callback contract endpoint must be listed in /debug/menu/routes');

  const beforeMaxRefs = { answerCallback: maxApi.answerCallback, editMessage: maxApi.editMessage, sendMessage: maxApi.sendMessage };
  const endpointRes = createRouteRes();
  await registered['/debug/callback-contract-live']({}, endpointRes);
  assert.strictEqual(maxApi.answerCallback, beforeMaxRefs.answerCallback, 'STAT-CB-014: endpoint must not mutate maxApi.answerCallback in parent process');
  assert.strictEqual(maxApi.editMessage, beforeMaxRefs.editMessage, 'STAT-CB-015: endpoint must not mutate maxApi.editMessage in parent process');
  assert.strictEqual(maxApi.sendMessage, beforeMaxRefs.sendMessage, 'STAT-CB-016: endpoint must not mutate maxApi.sendMessage in parent process');
  const endpointBody = JSON.parse(endpointRes.body);
  assert.strictEqual(endpointRes.statusCode, 200, 'STAT-CB-017: callback contract endpoint status must be 200');
  assert.ok(/no-store/.test(endpointRes.headers['Cache-Control'] || ''), 'STAT-CB-018: callback contract endpoint must be no-cache');
  for (const key of ['ok','runtimeVersion','sourceMarker','entrypoint','checkedAt','mainMenuStatsButtonFound','mainMenuStatsPayload','resolvedHandler','screenId','screenTextPreview','renderedRootButtonLabels','expectedLabelsPresent','legacyLabelsPresent','adminSectionStatsRoutesToPr226','errors']) {
    assert.ok(Object.prototype.hasOwnProperty.call(endpointBody, key), `STAT-CB-019: endpoint JSON missing ${key}`);
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
