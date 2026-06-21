#!/usr/bin/env node
'use strict';

const assert = require('assert');
const contract = require('../callback-contract-live-pr228');
const menu = require('../v3-menu-core-1539');
const routes = require('../v3-menu-routes-1539');

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

  const registered = installRoutes();
  assert.strictEqual(typeof registered['/debug/callback-contract-live'], 'function', 'STAT-CB-010: callback contract endpoint must be registered');
  assert.strictEqual(typeof registered['/debug/menu/routes'], 'function', 'STAT-CB-011: menu routes endpoint must be registered');
  const routesRes = createRouteRes();
  registered['/debug/menu/routes']({}, routesRes);
  const routesBody = JSON.parse(routesRes.body);
  assert.ok(routesBody.routes.includes('/debug/callback-contract-live'), 'STAT-CB-012: callback contract endpoint must be listed in /debug/menu/routes');

  const endpointRes = createRouteRes();
  await registered['/debug/callback-contract-live']({}, endpointRes);
  const endpointBody = JSON.parse(endpointRes.body);
  assert.strictEqual(endpointRes.statusCode, 200, 'STAT-CB-013: callback contract endpoint status must be 200');
  assert.ok(/no-store/.test(endpointRes.headers['Cache-Control'] || ''), 'STAT-CB-014: callback contract endpoint must be no-cache');
  for (const key of ['ok','runtimeVersion','sourceMarker','entrypoint','checkedAt','mainMenuStatsButtonFound','mainMenuStatsPayload','resolvedHandler','screenId','screenTextPreview','expectedLabelsPresent','legacyLabelsPresent','adminSectionStatsRoutesToPr226','errors']) {
    assert.ok(Object.prototype.hasOwnProperty.call(endpointBody, key), `STAT-CB-015: endpoint JSON missing ${key}`);
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
