'use strict';
const Module=require('module');
const RUNTIME='CC5.6';
const SOURCE='adminkit-CC5.6-comments-fast-after-app';
process.env.BUILD_VERSION=RUNTIME;
process.env.RUNTIME_VERSION=RUNTIME;
process.env.BUILD_SOURCE_MARKER=SOURCE;
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
async function stats(){try{return await require('./cc5-db-core').stats();}catch{return {dbUrlPresent:false,reachable:false,admins:0,channels:0,posts:0,rules:0}}}
async function gate(){try{return await require('./cc55-feature-gate').computeFeatureGate();}catch{return {ok:false,featureGate:'fail'}}}
function self(){try{return require('./cc55-moderation-router').selfTest();}catch(e){return {ok:false,error:e&&e.message?e.message:String(e)}}}
function qa(app){if(!app||app.__cc56QaInstalled)return;app.__cc56QaInstalled=true;app.get('/debug/qa-lite-cc56',async(req,res)=>{noCache(res);const s=await stats();const st=self();const fg=await gate();const rel=(!st.ok)?'blocked_router_selftest':(!s.dbUrlPresent?'blocked_database_url_missing':(!s.reachable?'blocked_postgres_unreachable':'pass'));const manual=(rel==='pass'&&fg.ok)?'allowed':'blocked';res.type('text/plain').send(['OK: '+(manual==='allowed'?'PROD_CHECK_READY':'WARNING'),'runtime: '+RUNTIME,'sourceMarker: '+SOURCE,'releaseGate: '+rel,'featureGate: '+(fg.featureGate||'fail'),'manualTesting: '+manual,'commentsShell: cc56_fast_after_app','fullscreenShell: disabled','floatingCta: delayed_after_comments_ready','publicPostRegister: after_comments_state_ready','routerSelfTest: '+(st.ok?'pass':'fail'),'dbUrlPresent: '+Boolean(s.dbUrlPresent),'postgresReachable: '+Boolean(s.reachable),'dbAdmins: '+(s.admins||0),'dbChannels: '+(s.channels||0),'dbPosts: '+(s.posts||0),'dbRules: '+(s.rules||0),'featureGateReason: '+(fg.ok?'pass':'see_/debug/feature-gate')].join('\n')+'\n')});}
const old=Module._load;
Module._load=function(request,parent,isMain){if(String(request||'').includes('cc53-comments-shell'))return require('./cc56-comments-fast');const loaded=old.apply(this,arguments);try{if(String(request||'')==='express'&&loaded&&!loaded.__cc56pre){function ex(){const app=loaded.apply(this,arguments);qa(app);return app;}Object.setPrototypeOf(ex,loaded);Object.assign(ex,loaded);ex.__cc56pre=true;return ex;}}catch{}return loaded;};
module.exports={RUNTIME,SOURCE};
