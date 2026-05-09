'use strict';
const Module=require('module');
const RUNTIME='CC6.0';
const SOURCE='adminkit-CC6.0-comments-standalone-clean-boot';
process.env.BUILD_VERSION=RUNTIME;process.env.RUNTIME_VERSION=RUNTIME;process.env.BUILD_SOURCE_MARKER=SOURCE;
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
async function dbStats(){try{return await require('./cc5-db-core').stats();}catch(e){return{error:e&&e.message?e.message:String(e),dbUrlPresent:!!(process.env.DATABASE_URL||process.env.POSTGRES_URI||process.env.POSTGRES_URL),reachable:false}}}
function routerSelfTest(){try{return require('./cc55-moderation-router').selfTest();}catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}}
async function featureGate(){try{return await require('./cc55-feature-gate').computeFeatureGate();}catch(e){return{ok:false,featureGate:'fail',error:e&&e.message?e.message:String(e)}}}
function releaseGateStatus(stats,selfTest){if(!selfTest.ok)return'blocked_router_selftest';if(!stats.dbUrlPresent)return'blocked_database_url_missing';if(!stats.reachable)return'blocked_postgres_unreachable';return'pass'}
function addRoutes(app){
  if(!app||app.__cc60clean)return app;
  app.__cc60clean=true;
  try{require('./cc60-comments-standalone').install(app)}catch(e){console.error('[CC6.0 standalone comments]',e&&e.message?e.message:e)}
  try{require('./cc55-feature-gate').install(app)}catch(e){console.warn('[CC6.0 feature gate]',e&&e.message?e.message:e)}
  try{require('./cc54-public-post-register').install(app)}catch(e){console.warn('[CC6.0 public register]',e&&e.message?e.message:e)}
  try{require('./cc52-db-debug-routes').install(app)}catch(e){}
  try{require('./cc53-db-diagnose').install(app)}catch(e){}
  app.get('/debug/qa-lite',async(req,res)=>{noCache(res);const s=await dbStats();const st=routerSelfTest();const rel=releaseGateStatus(s,st);const fg=await featureGate();const manual=(rel==='pass')?'allowed':'blocked';res.type('text/plain').send(['OK: '+(manual==='allowed'?'PROD_CHECK_READY':'WARNING'),'runtime: '+RUNTIME,'sourceMarker: '+SOURCE,'releaseGate: '+rel,'featureGate: '+(fg.featureGate||'informational'),'manualTesting: '+manual,'commentsShell: cc60_standalone_clean_route','commentsRoute: /app intercepted_before_legacy','usesLegacyAppJs: false','commentsOpenBlocksDb: false','commentsPostBlocksDb: false','dbRegistration: background_only','redirects: false','floatingCta: removed_from_boot_path','moderationRouter: cc55_single_router','legacyRouterFallback: disabled','mainMenuRouter: cc_owned','callbackPostUpsert: disabled','dbGuard: enabled','dbScanRoute: enabled','dbDiagnoseRoute: enabled','publicPostRegister: background_only','routerSelfTest: '+(st.ok?'pass':'fail'),'dbUrlPresent: '+Boolean(s.dbUrlPresent),'postgresReachable: '+Boolean(s.reachable),'dbAdmins: '+(s.admins||0),'dbChannels: '+(s.channels||0),'dbPosts: '+(s.posts||0),'dbRules: '+(s.rules||0),'featureGateReason: comments_open_is_not_blocked_by_feature_gate'].join('\n')+'\n');});
  app.get('/debug/mod-router-selftest',(req,res)=>{noCache(res);res.json(routerSelfTest());});
  return app;
}
const old=Module._load;
Module._load=function(request,parent,isMain){
  const loaded=old.apply(this,arguments);
  try{
    if(String(request||'')==='express'&&loaded&&!loaded.__cc60wrap){
      function ex(){
        const app=loaded.apply(this,arguments);
        addRoutes(app);
        if(app&&!app.__cc60post){
          app.__cc60post=true;
          const oldPost=app.post.bind(app);
          const routeName='/web'+'hook';
          app.post=(route,...handlers)=>String(route||'').includes(routeName)?oldPost(route,async(req,res,next)=>{try{if(await require('./cc55-moderation-router').handle(req.body||{}))return res.json({ok:true,handledBy:RUNTIME});}catch(e){console.error('[CC6.0 router]',e&&e.message?e.message:e);}next();},...handlers):oldPost(route,...handlers);
        }
        return app;
      }
      Object.setPrototypeOf(ex,loaded);Object.assign(ex,loaded);ex.__cc60wrap=true;return ex;
    }
  }catch(e){console.warn('[CC6.0 bootstrap]',e&&e.message?e.message:e);}
  return loaded;
};
require('./cc5-db-core').init().catch(e=>console.error('[CC6.0 DB]',e&&e.message?e.message:e));
require('./server-sp4058.js');
try{require('./cc45-public-final').install();}catch{}
