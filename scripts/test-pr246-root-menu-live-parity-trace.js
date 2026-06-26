'use strict';
const assert = require('assert');
process.env.ADMINKIT_TEST_MODE='1';
delete process.env.GITHUB_DEBUG_TOKEN;
const trace=require('../services/rootMenuLiveParityTraceService');
const botAudit=require('../admin-bot-audit-trace');
const runtimeTrace=require('../services/runtimeBotAuditTraceService');
const ROOT=['channels:home','comments:home','gifts:home','buttons:home','stats:home','push:home','ad_links:home','polls:home','highlights:home','editor:home','archive:home','account:home','settings:home'];
function reset(){trace.clear();botAudit.clear();runtimeTrace._resetSchedulerForTests();}
function text(o){return JSON.stringify(o);}
function assertNoSecrets(o){const s=text(o);for(const bad of ['secret-token','Bearer abc','cookie-value','raw-callback-id','raw-user-id','raw-chat-id','raw-message-id','raw-channel-id','raw-post-id','comment-key-secret','https://x.test/?token=abc'])assert.ok(!s.includes(bad),`secret leaked: ${bad}`);}
(async()=>{
reset();
assert.strictEqual(trace.DEFAULT_BRANCH,'runtime-status');
assert.strictEqual(trace.ROOT_PARITY_DEFAULT_PATH,'runtime/root-menu-live-parity-trace.json');
assert.strictEqual(trace.MANUAL_WALKTHROUGH_DEFAULT_PATH,'runtime/manual-ui-walkthrough-trace.json');
let m=trace.safePayloadMetadata({payload:{route:'comments:home',action:'comments:home',r:'comments:home',canonicalAction:'comments:home',legacyAction:'admin_section_comments',source:'main',token:'secret-token',commentKey:'comment-key-secret'}});
assert.strictEqual(m.callbackRoute,'comments:home'); assert.strictEqual(m.canonicalAction,'comments:home'); assert.strictEqual(m.legacyAction,'admin_section_comments'); assert.ok(m.payloadKeys.includes('route')); assert.ok(!m.payloadKeys.includes('token')); assertNoSecrets(m);
assert.strictEqual(trace.safePayloadMetadata({payload:JSON.stringify({route:'buttons:home',authorization:'Bearer abc'})}).payloadShape,'json_string');
assert.strictEqual(trace.safePayloadMetadata({payload:'gifts:home'}).payloadShape,'plain_string');
assert.strictEqual(trace.safePayloadMetadata({}).payloadShape,'missing');
for(const route of ROOT){trace.record('webhook_edge_received',{updateType:'message_callback',hasCallback:true,hasMessage:true,hasUserId:true,hasCallbackId:true,payload:{route,action:route,callbackId:'raw-callback-id',userId:'raw-user-id'}});trace.record('root_resolved',{payload:{route},resolvedRootRoute:route,resolver:'payload.route',handlerName:'handleRootSectionCallback'});trace.record('render_started',{payload:{route},resolvedRootRoute:route});trace.record('render_resolved',{payload:{route},resolvedRootRoute:route,resultKind:'screen'});trace.record('delivery_resolved',{payload:{route},resolvedRootRoute:route,delivery:'edit_or_upsert_current_message',resultKind:'ok'});}
let info=trace.info();
for(const route of ROOT){const ev=info.root.events.find(e=>e.resolvedRootRoute===route);assert.ok(ev,`${route} parity event`);assert.notStrictEqual(ev.handlerName,'giftsOnlyHandler','no gifts-only handler');assert.ok('callbackAction'in ev || 'callbackRoute'in ev);}
assert.ok(info.manual.events.some(e=>e.eventKind==='webhook_edge_received'));
reset(); for(const route of ['main:home','channels:home','comments:home','gifts:home','buttons:home']) trace.record('delivery_resolved',{payload:{route},resolvedRootRoute:route,delivery:'delivered'});
info=trace.info(); assert.deepStrictEqual(info.manual.events.map(e=>e.resolvedRootRoute),['main:home','channels:home','comments:home','gifts:home','buttons:home']); for(let i=1;i<info.manual.events.length;i++)assert.ok(info.manual.events[i].seq>info.manual.events[i-1].seq);
reset(); for(let i=0;i<105;i++){process.env.GITHUB_SHA='sha'+i;trace.record('delivery_resolved',{payload:{route:ROOT[i%ROOT.length]},resolvedRootRoute:ROOT[i%ROOT.length]});} info=trace.info(); assert.strictEqual(info.manual.events.length,100); assert.ok(new Set(info.manual.events.map(e=>e.githubMainHeadSha)).size>1);
reset(); for(const action of ['admin_section_comments','admin_section_buttons','admin_section_gifts','gift_admin_open_menu','admin_section_stats']) trace.record('legacy_compatibility_resolved',{payload:{action},resolver:'legacy_compatibility'}); info=trace.info(); assert.strictEqual(info.manual.events.length,5); assert.ok(info.root.events.every(e=>e.eventKind==='legacy_compatibility_resolved')); assert.ok(!text(info).includes('debug_admin_only'));
let writes=[]; trace._setExporterForTests(async(p,log)=>{writes.push([p,log]);}); await trace.exportLatestTrace(); assert.deepStrictEqual(writes.map(x=>x[0]).sort(),[trace.MANUAL_WALKTHROUGH_DEFAULT_PATH,trace.ROOT_PARITY_DEFAULT_PATH].sort()); assert.ok(writes.every(x=>x[1].events.length<=100));
trace._setExporterForTests(async()=>{throw new Error('github boom')}); const r=await trace.exportLatestTrace(); assert.strictEqual(r.ok,false); assert.ok(['github_api_error','unexpected_error','no_events','missing_token'].includes(r.root.category||r.root.reason)); assertNoSecrets(trace.info());
reset(); trace.record('callback_received',{payload:{route:'gifts:home',token:'secret-token',authorization:'Bearer abc',cookie:'cookie-value',callbackId:'raw-callback-id',userId:'raw-user-id',chatId:'raw-chat-id',messageId:'raw-message-id',channelId:'raw-channel-id',postId:'raw-post-id',commentKey:'comment-key-secret',url:'https://x.test/?token=abc'}}); assertNoSecrets(trace.info());
for(const route of ROOT) assert.ok(trace.ROOT_ROUTES.has(route),'PR245 root route still covered '+route); assert.ok(trace.safePayloadMetadata({payload:{route:'polls:create',legacyAction:'comments_select_post',source:'polls'}}).legacyAction==='comments_select_post'); assert.ok(trace.safePayloadMetadata({payload:{action:'comments_pick_post',source:'polls'}}).source==='polls'); assert.ok(trace.ROOT_ROUTES.has('gifts:home'));
console.log('PR246 root menu live parity trace tests ok');
})().catch(e=>{console.error(e);process.exit(1);});
