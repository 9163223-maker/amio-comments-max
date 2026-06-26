'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';
delete process.env.GITHUB_DEBUG_TOKEN;

const pr247 = require('../services/rootMenuLiveParityTraceService');
const edge = require('../services/maxWebhookEdgeDiagnostics');

const ROUTES = ['channels:home','comments:home','gifts:home','buttons:home','stats:home','push:home','ad_links:home','polls:home','highlights:home','editor:home','archive:home','account:home','settings:home'];
const LEGACY = ['admin_section_comments','admin_section_buttons','admin_section_gifts','gift_admin_open_menu','admin_section_stats'];

function reset() { pr247.clear(); edge.clear(); }
function callbackBody(payload, extra = {}) { return { update_type: 'message_callback', callback: { callback_id: extra.callbackId || 'raw-callback-id', payload: typeof payload === 'string' ? payload : JSON.stringify(payload), user: { user_id: extra.userId || 'raw-user-id' } }, message: { id: extra.messageId || 'raw-message-id', body: { mid: extra.mid || 'raw-mid', text: extra.text || 'button' }, recipient: { chat_id: extra.chatId || 'raw-chat-id' } } }; }
function assertNoLeaks(obj) { const text = JSON.stringify(obj); for (const leak of ['secret-token','Bearer abc','comment-key-secret','https://x.test/?token=abc','raw-callback-id','raw-user-id','raw-chat-id','raw-message-id','raw-channel-id','raw-post-id']) assert(!text.includes(leak), `leak absent: ${leak}`); }

async function main() {
  reset();

  let ev = pr247.extractSafePayload({ body: callbackBody({ route: 'gifts:home', action: 'gifts:home', r: 'gifts:home', canonicalAction: 'gifts:home', legacyAction: 'admin_section_gifts', source: 'menu', token: 'secret-token' }) });
  assert.strictEqual(ev.callbackRoute, 'gifts:home');
  assert.strictEqual(ev.callbackAction, 'gifts:home');
  assert.strictEqual(ev.callbackR, 'gifts:home');
  assert.strictEqual(ev.payloadShape, 'object');
  assert(ev.payloadKeys.includes('route'));
  assert(ev.payloadKeys.includes('[redacted-key]'));
  assertNoLeaks(ev);
  ev = pr247.extractSafePayload({ callback: { payload: '{"route":"buttons:home","action":"buttons:home"}' } });
  assert.strictEqual(ev.resolvedRootRoute, 'buttons:home');
  ev = pr247.extractSafePayload({ callback: { payload: 'plain-action' } });
  assert.strictEqual(ev.payloadShape, 'plain_string');
  ev = pr247.extractSafePayload({ callback: {} });
  assert.strictEqual(ev.payloadShape, 'missing');

  reset();
  for (const route of ROUTES) {
    pr247.record({ eventKind: 'callback_received', body: callbackBody({ route }), handlerName: 'handleMessageCallback' });
    pr247.record({ eventKind: 'root_resolved', body: callbackBody({ route }), resolvedRootRoute: route, resolver: 'payload.route', handlerName: 'handleRootSectionCallback', resultKind: 'resolved' });
    pr247.record({ eventKind: 'delivery_resolved', body: callbackBody({ route }), resolvedRootRoute: route, resolver: 'payload.route', handlerName: 'handleRootSectionCallback', resultKind: 'delivered', delivery: 'edit_or_upsert_current_message' });
  }
  const rootEvents = pr247.listRoot();
  const manualEvents = pr247.listManual();
  for (const route of ROUTES) {
    assert(rootEvents.some((e) => e.resolvedRootRoute === route), `${route} parity event`);
    assert(manualEvents.some((e) => e.resolvedRootRoute === route), `${route} manual event`);
  }
  assert(!rootEvents.find((e) => e.resolvedRootRoute === 'gifts:home' && /gift.*only/i.test(e.handlerName || '')), 'Gifts has no Gifts-only handler marker');
  assert(rootEvents.every((e) => Object.prototype.hasOwnProperty.call(e, 'payloadShape') && Object.prototype.hasOwnProperty.call(e, 'hasCallback')), 'comparable fields exist');

  reset();
  const edgeEvent = edge.record({ body: callbackBody({ route: 'comments:home', token: 'secret-token' }), handedToBot: false });
  assert.strictEqual(pr247.listManual()[0].eventKind, 'webhook_edge_received', 'edge event is first before bot handler');
  assert(pr247.listRoot().some((e) => e.resolvedRootRoute === 'comments:home'), 'edge feeds root parity without downstream handler');
  edge.update(edgeEvent, { handedToBot: true, botResultKind: 'response_sent_200', errorCode: 'none' });
  assert(pr247.listManual().some((e) => e.eventKind === 'handler_returned' && e.resultKind === 'response_sent_200' && e.delivery === 'handed_to_bot'), 'handler return visible');
  assertNoLeaks({ edge: edge.summary(), pr247: pr247.payload('manual') });

  reset();
  const sensitive = '{"route":"gifts:home","action":"gifts:home","token":"secret-token","authorization":"Bearer abc","commentKey":"comment-key-secret","url":"https://x.test/?token=abc","callbackId":"raw-callback-id","userId":"raw-user-id","chatId":"raw-chat-id","messageId":"raw-message-id","channelId":"raw-channel-id","postId":"raw-post-id"}';
  edge.record({ body: callbackBody(sensitive), handedToBot: false });
  const combined = { info: pr247.payload('manual'), summary: edge.summary(), html: edge.renderHtml(edge.summary()) };
  assertNoLeaks(combined);
  assert(JSON.stringify(combined).includes('gifts:home'), 'safe route remains visible');

  reset();
  for (const route of ['main:home','channels:home','comments:home','gifts:home','buttons:home']) pr247.record({ eventKind: 'delivery_resolved', body: callbackBody({ route }), resolvedRootRoute: route, resultKind: 'delivered', delivery: 'edit' });
  const ordered = pr247.listManual();
  assert.deepStrictEqual(ordered.map((e) => e.resolvedRootRoute), ['main:home','channels:home','comments:home','gifts:home','buttons:home']);
  for (let i = 1; i < ordered.length; i++) assert(ordered[i].seq > ordered[i - 1].seq, 'seq increases');

  reset();
  for (let i = 0; i < 105; i++) pr247.record({ eventKind: 'callback_received', body: callbackBody({ route: ROUTES[i % ROUTES.length] }), runtimeIdentity: { runtimeVersion: `runtime-${i % 2}` } });
  assert.strictEqual(pr247.listManual().length, 100, 'retention keeps latest 100');
  assert(new Set(pr247.listManual().map((e) => e.runtimeVersion)).size >= 2, 'runtime identities distinguish deploys');

  reset();
  for (const action of LEGACY) pr247.record({ eventKind: 'legacy_compatibility_resolved', body: callbackBody({ action }), handlerName: 'handleRootSectionCallback' });
  for (const action of LEGACY) assert(pr247.listRoot().some((e) => e.legacyAction === action && e.eventKind === 'legacy_compatibility_resolved'), `${action} compatibility visible`);
  assert(!JSON.stringify(pr247.payload('root')).includes('debug'), 'no hidden debug route exposed by test data');

  assert.strictEqual(pr247.DEFAULT_BRANCH, 'runtime-status');
  assert.strictEqual(pr247.ROOT_MENU_DEFAULT_PATH, 'runtime/root-menu-live-parity-trace.json');
  assert.strictEqual(pr247.MANUAL_DEFAULT_PATH, 'runtime/manual-ui-walkthrough-trace.json');
  const exportResult = await pr247.exportTraces();
  assert(exportResult.every((r) => r.ok === false), 'missing token export is captured not thrown');
  assert.strictEqual(pr247.payload('root').traceExportStatus.targetBranch, 'runtime-status');
  assert(pr247.payload('root').events.length <= 100, 'export bounded');

  for (const route of ROUTES) assert(pr247.ROOT_ROUTES.has(route), `${route} remains in root contract`);
  assert(pr247.ROOT_ROUTES.has('gifts:home'), 'Gifts remains same root-section contract');

  console.log(JSON.stringify({ ok: true, test: 'PR247 root menu live parity trace' }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
