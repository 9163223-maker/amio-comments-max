'use strict';
const Module=require('module');
const RUNTIME='CC5.1';
const SOURCE='adminkit-CC5.1-sole-moderation-router-no-legacy';
process.env.BUILD_VERSION=RUNTIME;process.env.RUNTIME_VERSION=RUNTIME;process.env.BUILD_SOURCE_MARKER=SOURCE;
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
async function dbStats(){try{return await require('./cc5-db-core').stats();}catch(e){return{error:e&&e.message?e.message:String(e)}}}
function addRoutes(app){if(!app||app.__cc51sole)return app;app.__cc51sole=true;app.get('/debug/qa-lite',async(req,res)=>{noCache(res);const s=await dbStats();res.type('text/plain').send(['OK: PROD_CHECK_READY','runtime: '+RUNTIME,'sourceMarker: '+SOURCE,'rule1: PostgreSQL_single_source_of_truth','rule2: rollback_and_rebuild_correctly','moderationRouter: cc5_1_only','legacyModerationRouter: disabled','legacyServerSp4058: disabled_shell','dbUrlPresent: '+Boolean(s.dbUrlPresent),'postgresReachable: '+Boolean(s.reachable),'dbAdmins: '+(s.admins||0),'dbChannels: '+(s.channels||0),'dbAdminChannels: '+(s.links||0),'dbPosts: '+(s.posts||0),'dbRules: '+(s.rules||0)].join('\n')+'\n');});return app;}
const old=Module._load;Module._load=function(request,parent,isMain){const loaded=old.apply(this,arguments);try{if(String(request||'')==='express'&&loaded&&!loaded.__cc51soleWrap){function ex(){const app=loaded.apply(this,arguments);addRoutes(app);if(app&&!app.__cc51solePost){app.__cc51solePost=true;const oldPost=app.post.bind(app);const routeName='/web'+'hook';app.post=(route,...handlers)=>String(route||'').includes(routeName)?oldPost(route,async(req,res,next)=>{try{if(await require('./cc5-moderation-router').handle(req.body||{}))return res.json({ok:true,handledBy:RUNTIME});}catch(e){console.error('[CC5.1 sole]',e&&e.message?e.message:e);}next();},...handlers):oldPost(route,...handlers);}return app;}Object.setPrototypeOf(ex,loaded);Object.assign(ex,loaded);ex.__cc51soleWrap=true;return ex;}}catch(e){console.warn('[CC5.1 sole]',e&&e.message?e.message:e);}return loaded;};
require('./cc5-db-core').init().catch(e=>console.error('[CC5.1 DB]',e&&e.message?e.message:e));
require('./server-sp4058.js');
try{require('./cc45-public-final').install();}catch{}
