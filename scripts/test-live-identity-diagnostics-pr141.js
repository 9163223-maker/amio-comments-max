'use strict';

const assert = require('assert');
const liveIdentity = require('../services/liveIdentityService');
const botAudit = require('../admin-bot-audit-trace');
const walkthrough = require('../admin-walkthrough-trace');
const uiTrace = require('../v3-ui-trace-1539');
const routes = require('../admin-walkthrough-trace-routes');
const store = require('../store');

function makeApp() {
  const handlers = new Map();
  return {
    handlers,
    get(path, handler) {
      const paths = Array.isArray(path) ? path : [path];
      for (const p of paths) handlers.set(p, handler);
    }
  };
}
function makeReq(query = {}) {
  return { query, headers: {}, get(name) { return this.headers[String(name || '').toLowerCase()] || ''; } };
}
function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(obj) { Object.assign(this.headers, obj || {}); return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}
async function call(app, path, query = {}) {
  const handler = app.handlers.get(path);
  assert.ok(handler, `handler registered for ${path}`);
  const res = makeRes();
  await handler(makeReq(query), res);
  return res;
}
function jsonText(value) { return JSON.stringify(value); }

(async () => {
  process.env.ADMIN_TOKEN = 'super-secret-admin-token-pr141';
  process.env.WEBHOOK_SECRET = 'super-secret-webhook-pr141';
  process.env.GIFT_ADMIN_TOKEN = 'super-secret-gift-token-pr141';
  process.env.GITHUB_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
  process.env.BUILD_VERSION = process.env.BUILD_VERSION || 'TEST-BUILD';

  const id1 = liveIdentity.identity();
  const id2 = liveIdentity.identity();
  assert.ok(id1.generatedAt, 'identity has generatedAt');
  assert.ok(id1.serverStartedAt, 'identity has serverStartedAt');
  assert.ok(Number.isFinite(id1.uptimeSec), 'identity has uptimeSec');
  assert.ok(id1.pid, 'identity has pid');
  assert.ok(id1.nodeVersion, 'identity has nodeVersion');
  assert.ok(id1.runtimeVersion, 'identity has runtimeVersion');
  assert.ok(id1.buildVersion, 'identity has buildVersion');
  assert.ok(id1.displayVersion, 'identity has displayVersion');
  assert.ok(id1.packageVersion, 'identity has packageVersion');
  assert.ok(id1.sourceMarker, 'identity has sourceMarker');
  assert.ok(id1.gitCommit, 'identity has gitCommit');
  assert.strictEqual(id1.serverStartedAt, id2.serverStartedAt, 'serverStartedAt is stable');
  assert.strictEqual(id1.activeBotModule, 'bot.js', 'active bot module is exposed safely');

  const identityJson = jsonText(id1);
  assert.ok(!identityJson.includes('super-secret-admin-token-pr141'), 'identity omits ADMIN_TOKEN');
  assert.ok(!identityJson.includes('super-secret-webhook-pr141'), 'identity omits webhook secret');
  assert.ok(!identityJson.includes('super-secret-gift-token-pr141'), 'identity omits gift admin token');

  assert.strictEqual(liveIdentity.compareExpectedCommit(id1.gitCommit.slice(0, 8), id1.gitCommit), true, 'expected commit prefix matches');
  assert.strictEqual(liveIdentity.compareExpectedCommit('0000000', id1.gitCommit), false, 'expected commit mismatch is false');
  assert.strictEqual(liveIdentity.compareExpectedCommit('', id1.gitCommit), null, 'missing expected commit is null');

  botAudit.clear();
  walkthrough.clear();
  uiTrace.clear();
  botAudit.log('pr141.test_webhook', { userId: '17507246', action: 'gifts:home', token: 'must-not-appear' });
  walkthrough.log('pr141.test_admin', { userId: '17507246', action: 'gifts:home' });
  uiTrace.log('pr141.test_ui', { userId: '17507246', action: 'gifts:home' });
  assert.ok(botAudit.list()[0].liveIdentity.gitCommit, 'bot-audit trace includes live identity fingerprint');
  assert.ok(walkthrough.list()[0].liveIdentity.gitCommit, 'admin walkthrough trace includes live identity fingerprint');
  assert.ok(uiTrace.list()[0].liveIdentity.gitCommit, 'ui trace includes live identity fingerprint');

  const latest = liveIdentity.recordWebhook({ requestId: 'req-pr141', userId: '17507246', action: 'gifts:home', screenId: 'gifts_clean_home', handler: 'test.handler', module: 'test.js', updateType: 'message_callback' });
  assert.strictEqual(latest.liveIdentity.gitCommit, liveIdentity.fingerprint().gitCommit, 'recorded webhook has matching fingerprint');

  const app = makeApp();
  routes.install(app);

  const liveRes = await call(app, '/debug/live-identity', { token: 'admin', expectedCommit: id1.gitCommit.slice(0, 8) });
  assert.strictEqual(liveRes.statusCode, 200, 'live identity endpoint returns 200');
  assert.strictEqual(liveRes.body.ok, true, 'live identity endpoint ok');
  assert.ok(liveRes.body.identity.gitCommit, 'live identity endpoint includes identity');
  assert.strictEqual(liveRes.body.commitMatchesExpected, true, 'live identity endpoint compares expected commit');
  assert.ok(liveRes.body.latestWebhookIdentity.liveIdentity.gitCommit, 'live identity endpoint includes latest webhook identity');

  const versionRes = await call(app, '/debug/version-live', {});
  assert.strictEqual(versionRes.body.gitCommit, liveIdentity.identity().gitCommit, 'version-live includes gitCommit from live identity');
  assert.ok(versionRes.body.latestWebhookIdentity.liveIdentity.gitCommit, 'version-live includes latest webhook identity');

  const rawChannelId = '-1234567890123';
  const rawPostId = 'post-pr141-raw-secret';
  const rawCommentKey = `${rawChannelId}:${rawPostId}:comment-key-raw`;
  const rawToken = 'token-pr141-raw-secret';
  const rawUrl = 'https://private.example.test/file-token-pr141';
  store.setSetupState('17507246', {
    activeAdminFlowKind: 'gift',
    adminUi: { section: 'gifts' },
    activeAdminUi: { section: 'gifts' },
    giftFlow: { mode: 'create', stepIndex: 2, awaitingConfirmation: true, token: rawToken, payload: { url: rawUrl } },
    giftsCurrentCard: { channelId: rawChannelId, postId: rawPostId, commentKey: rawCommentKey, token: rawToken, privateUrl: rawUrl },
    giftTargetPost: { channelId: rawChannelId, postId: rawPostId, commentKey: rawCommentKey, title: 'Safe title', privateUrl: rawUrl },
    selectedCard: { channelId: rawChannelId, postId: rawPostId, commentKey: rawCommentKey, title: 'Safe selected', url: rawUrl },
    updatedAt: '2026-06-06T00:00:00.000Z'
  });
  const stateRes = await call(app, '/debug/live-user-state', { token: 'admin', userId: '17507246' });
  assert.strictEqual(stateRes.body.ok, true, 'live user state endpoint ok');
  assert.strictEqual(stateRes.body.sanitized, true, 'live user state endpoint declares sanitized output');
  const stateText = jsonText(stateRes.body);
  assert.ok(!stateText.includes(rawChannelId), 'live user state omits raw channelId');
  assert.ok(!stateText.includes(rawPostId), 'live user state omits raw postId');
  assert.ok(!stateText.includes(rawCommentKey), 'live user state omits raw commentKey');
  assert.ok(!stateText.includes(rawToken), 'live user state omits token');
  assert.ok(!stateText.includes(rawUrl), 'live user state omits private URL');
  assert.strictEqual(stateRes.body.state.giftFlow.exists, true, 'live user state reports giftFlow existence');
  assert.strictEqual(stateRes.body.state.giftTargetPost.exists, true, 'live user state reports gift target existence');

  const routeRes = await call(app, '/debug/live-route-probe', { token: 'admin', action: 'gifts:home', userId: '17507246' });
  assert.strictEqual(routeRes.statusCode, 200, 'route probe returns 200');
  assert.strictEqual(routeRes.body.ok, true, 'route probe response ok');
  if (routeRes.body.probeSupported) {
    assert.strictEqual(routeRes.body.action, 'gifts:home', 'route probe echoes action');
    assert.ok(routeRes.body.resolved.screenId, 'route probe returns resolved screenId');
    assert.ok(['canonical_root', 'canonical_or_menu_router'].includes(routeRes.body.resolved.routeSource), 'route probe reports route source');
  } else {
    assert.ok(routeRes.body.explanation, 'route probe unsupported response includes explanation');
  }

  console.log('test-live-identity-diagnostics-pr141: ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
