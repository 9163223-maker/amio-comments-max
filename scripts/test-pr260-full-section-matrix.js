'use strict';
const assert = require('assert');
const menu = require('../features/menu-v3/adapter');
const full = require('../services/fullSectionMatrixService');
const processEvents = require('../services/processEventsService');
const northflank = require('../services/northflankStartupLogService');
const channel = require('../services/channelTargetMatrixService');

const matrix = full.buildMatrix();
assert.strictEqual(matrix.ok, true, `full section matrix not ok: ${JSON.stringify(matrix.violations, null, 2)}`);
assert.strictEqual(matrix.summary.blockCount, 0, 'block violations must be absent');
for (const section of ['main','channels','comments','gifts','buttons','stats','push','ad_links','polls','highlights','editor','archive','account','settings']) assert(matrix.sectionsChecked.includes(section), `missing section ${section}`);
for (const route of ['main:home','channels:home','comments:home','gifts:home','buttons:home','stats:home','push:home','ad_links:home','polls:home','highlights:home','editor:home','archive:home','account:home','settings:home','comments:choose_channel','comments:choose_post','comments:post','stats:choose_post','stats:post']) assert(matrix.routesChecked.includes(route), `missing route ${route}`);
for (const scenario of full.REQUIRED_SCENARIOS) assert(matrix.scenarios.includes(scenario), `missing scenario ${scenario}`);
assert.strictEqual(matrix.summary.chatLeakCount, 0, 'chat-like fixture leaks must be absent');
assert.strictEqual(matrix.summary.payloadIssueCount, 0, 'payload parse issues must be absent');
assert.strictEqual(matrix.summary.technicalLeakCount, 0, 'technical visible leaks must be absent');

const originalRender = menu.render;
menu.render = (route, context) => {
  const screen = originalRender(route, context);
  const rows = screen && screen.attachments && screen.attachments[0] && screen.attachments[0].payload && screen.attachments[0].payload.buttons;
  if (route === 'comments:choose_channel' && Array.isArray(rows) && rows[0]) {
    const unsafePayload = { route: 'comments:choose_post' };
    unsafePayload[`chat${'Id'}`] = 'chat-1';
    rows[0].push({ type: 'callback', text: 'Matrix safe label', payload: JSON.stringify(unsafePayload) });
  }
  return screen;
};
try {
  const injected = full.buildMatrix();
  assert.strictEqual(injected.ok, false, 'injected dangerous payload id must fail matrix');
  assert(injected.summary.chatLeakCount > 0, 'injected dangerous payload id must increment chatLeakCount');
  assert(injected.violations.some((v) => v.reason === 'chat_like_record_leak' && v.offendingPayload === 'chat-1'), 'violation must identify injected payload id');
} finally {
  menu.render = originalRender;
}

const proc = processEvents.info();
assert(proc.bootId && proc.bootedAt, 'process diagnostics payload is buildable');
const nf = northflank.payload();
assert.strictEqual(nf.ok, true, 'northflank payload ok');
assert('configured' in nf && nf.generatedAt, 'northflank fallback/build payload shape');
const cm = channel.buildMatrix();
assert.strictEqual(cm.ok, true, 'channel target matrix buildable and ok');
assert(Array.isArray(cm.checkedRoutes) && Array.isArray(cm.violations), 'channel matrix PR260 shape');
console.log('PR260 full section matrix PASS');
