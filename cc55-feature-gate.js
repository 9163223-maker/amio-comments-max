'use strict';

/**
 * CC5.5 feature gate.
 * Debug must reflect real user scenarios, not only loaded flags.
 */

const db = require('./cc5-db-core');
const guard = require('./cc52-db-guard');
const router = require('./cc55-moderation-router');

const RUNTIME = 'CC5.5';
const SOURCE = 'adminkit-CC5.5-hard-feature-gate';

function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function norm(v){return String(v||'').replace(/\s+/g,' ').trim();}
function tokenOk(req){const expected=String(process.env.DEBUG_TOKEN||process.env.GIFT_ADMIN_TOKEN||'admin');return String(req.query.token||'')===expected;}

async function ensureTable(){
  await db.init();
  await db.query(`create table if not exists ak_client_events (
    id bigserial primary key,
    event_type text not null,
    admin_id text,
    channel_id text,
    post_id text,
    comment_key text,
    ok boolean,
    payload jsonb not null default '{}'::jsonb,
    user_agent text,
    created_at timestamptz default now()
  );`);
}
async function record(eventType, payload={}, userAgent=''){
  await ensureTable();
  const p = payload && typeof payload === 'object' ? payload : {value:payload};
  const adminId = norm(p.adminId || p.admin_id || '');
  const channelId = norm(p.channelId || p.channel_id || '');
  const postId = norm(p.postId || p.post_id || '');
  const commentKey = norm(p.commentKey || p.comment_key || '');
  const ok = typeof p.ok === 'boolean' ? p.ok : null;
  await db.query(`insert into ak_client_events(event_type,admin_id,channel_id,post_id,comment_key,ok,payload,user_agent) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [norm(eventType)||'unknown', adminId, channelId, postId, commentKey, ok, JSON.stringify(p), String(userAgent||'').slice(0,500)]);
  return {ok:true};
}
async function latestEvents(limit=20){
  await ensureTable();
  const {rows}=await db.query(`select event_type as "eventType", admin_id as "adminId", channel_id as "channelId", post_id as "postId", comment_key as "commentKey", ok, payload, created_at as "createdAt" from ak_client_events order by created_at desc limit $1`, [Math.max(1, Math.min(Number(limit||20),100))]);
  return rows;
}
function fresh(event, maxAgeMs){
  if(!event || !event.createdAt) return false;
  const t = new Date(event.createdAt).getTime();
  return Number.isFinite(t) && Date.now()-t <= maxAgeMs;
}
async function computeFeatureGate(){
  const stats = await db.stats();
  const routerTest = router.selfTest();
  const scan = await guard.scanServicePosts(50).catch(e=>({count:-1,error:e&&e.message?e.message:String(e),sample:[]}));
  const events = await latestEvents(30).catch(()=>[]);
  const loaded = events.find(e=>e.eventType==='comments_client_loaded');
  const cta = events.find(e=>e.eventType==='floating_cta_visible');
  const registerAttempt = events.find(e=>e.eventType==='public_post_register_attempt');
  const registerResult = events.find(e=>e.eventType==='public_post_register_result');
  const checks = {
    postgres: { ok: !!stats.reachable, status: stats.reachable ? 'pass' : 'fail', value: !!stats.reachable },
    routerSelfTest: { ok: !!routerTest.ok, status: routerTest.ok ? 'pass' : 'fail', value: routerTest.checks || routerTest },
    servicePostsClean: { ok: scan.count === 0, status: scan.count === 0 ? 'pass' : 'fail', count: scan.count, sample: scan.sample || [] },
    mainMenuOwnedByCC: { ok: !!routerTest?.checks?.mainMenuAction, status: routerTest?.checks?.mainMenuAction ? 'pass' : 'fail' },
    commentsClientTelemetry: { ok: fresh(loaded, 12*60*60*1000), status: fresh(loaded, 12*60*60*1000) ? 'pass' : 'not_proven', last: loaded || null },
    floatingCtaVisible: { ok: fresh(cta, 12*60*60*1000), status: fresh(cta, 12*60*60*1000) ? 'pass' : 'not_proven', last: cta || null },
    publicPostRegisterAttempt: { ok: fresh(registerAttempt, 12*60*60*1000), status: fresh(registerAttempt, 12*60*60*1000) ? 'pass' : 'not_proven', last: registerAttempt || null },
    publicPostRegisterResult: { ok: fresh(registerResult, 12*60*60*1000) && registerResult.ok !== false && Number(registerResult.payload?.registered || 0) > 0, status: fresh(registerResult, 12*60*60*1000) ? (registerResult.ok !== false && Number(registerResult.payload?.registered || 0) > 0 ? 'pass' : 'fail') : 'not_proven', last: registerResult || null },
    realPostsInDb: { ok: Number(stats.posts||0) > 0, status: Number(stats.posts||0) > 0 ? 'pass' : 'not_proven', count: Number(stats.posts||0) }
  };
  const ok = Object.values(checks).every(x=>x.ok === true);
  return {ok, runtimeVersion:RUNTIME, sourceMarker:SOURCE, featureGate: ok ? 'pass' : 'fail', stats, checks, generatedAt:Date.now()};
}
function install(app){
  if(!app || app.__cc55FeatureGate) return app;
  app.__cc55FeatureGate = true;
  try{app.use('/api/cc55/client-event', require('express').json({limit:'64kb'}));}catch{}
  app.post('/api/cc55/client-event', async(req,res)=>{
    noCache(res);
    try{await record(req.body?.eventType || req.body?.type || 'unknown', req.body?.payload || req.body || {}, req.headers['user-agent']||''); res.json({ok:true,runtimeVersion:RUNTIME});}
    catch(e){res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});}
  });
  app.get('/debug/feature-gate', async(req,res)=>{
    noCache(res);
    if(!tokenOk(req)) return res.status(403).json({ok:false,error:'forbidden'});
    try{res.json(await computeFeatureGate());}
    catch(e){res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});}
  });
  app.get('/debug/client-events', async(req,res)=>{
    noCache(res);
    if(!tokenOk(req)) return res.status(403).json({ok:false,error:'forbidden'});
    try{res.json({ok:true,runtimeVersion:RUNTIME,events:await latestEvents(Number(req.query.limit||30)),generatedAt:Date.now()});}
    catch(e){res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});}
  });
  return app;
}
module.exports={RUNTIME,SOURCE,install,record,latestEvents,computeFeatureGate};
