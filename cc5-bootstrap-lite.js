'use strict';
const Module=require('module');
const RUNTIME='CC5.2';
const SOURCE='adminkit-CC5.2-clean-moderation-router';
process.env.BUILD_VERSION=RUNTIME;process.env.RUNTIME_VERSION=RUNTIME;process.env.BUILD_SOURCE_MARKER=SOURCE;
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
async function dbStats(){try{return await require('./cc5-db-core').stats();}catch(e){return{error:e&&e.message?e.message:String(e)}}}
function routerSelfTest(){try{return require('./cc52-moderation-router').selfTest();}catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}}
function addRoutes(app){if(!app||app.__cc52clean)return app;app.__cc52clean=true;app.get('/debug/qa-lite',async(req,res)=>{noCache(res);const s=await dbStats();const st=routerSelfTest();res.type('text/plain').send(['OK: '+(st.ok?'PROD_CHECK_READY':'WARNING'),'runtime: '+RUNTIME,'sourceMarker: '+SOURCE,'moderationRouter: cc52_single_file','legacyRouterFallback: disabled','callbackPostUpsert: disabled','routerSelfTest: '+(st.ok?'pass':'fail'),'dbUrlPresent: '+Boolean(s.dbUrlPresent),'postgresReachable: '+Boolean(s.reachable),'dbAdmins: '+(s.admins||0),'dbChannels: '+(s.channels||0),'dbPosts: '+(s.posts||0),'dbRules: '+(s.rules||0)].join('\n')+'\n');});app.get('/debug/mod-router-selftest',(req,res)=>{noCache(res);res.json(routerSelfTest());});return app;}
const old=Module._load;Module._load=function(request,parent,isMain){const loaded=old.apply(this,arguments);try{if(String(request||'')==='express'&&loaded&&!loaded.__cc52wrap){function ex(){const app=loaded.apply(this,arguments);addRoutes(app);if(app&&!app.__cc52post){app.__cc52post=true;const oldPost=app.post.bind(app);const routeName='/web'+'hook';app.post=(route,...handlers)=>String(route||'').includes(routeName)?oldPost(route,async(req,res,next)=>{try{if(await require('./cc52-moderation-router').handle(req.body||{}))return res.json({ok:true,handledBy:RUNTIME});}catch(e){console.error('[CC5.2 router]',e&&e.message?e.message:e);}next();},...handlers):oldPost(route,...handlers);}return app;}Object.setPrototypeOf(ex,loaded);Object.assign(ex,loaded);ex.__cc52wrap=true;return ex;}}catch(e){console.warn('[CC5.2 bootstrap]',e&&e.message?e.message:e);}return loaded;};
require('./cc5-db-core').init().catch(e=>console.error('[CC5.2 DB]',e&&e.message?e.message:e));
require('./server-sp4058.js');
try{require('./cc45-public-final').install();}catch{}
