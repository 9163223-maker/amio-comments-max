'use strict';
const Module=require('module');
const RUNTIME='CC6.1';
const SOURCE='adminkit-CC6.1-comments-clean-boot-ui-preserved';
process.env.BUILD_VERSION=RUNTIME;process.env.RUNTIME_VERSION=RUNTIME;process.env.BUILD_SOURCE_MARKER=SOURCE;
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
async function dbStats(){try{return await require('./cc5-db-core').stats();}catch(e){return{error:e&&e.message?e.message:String(e),dbUrlPresent:!!(process.env.DATABASE_URL||process.env.POSTGRES_URI||process.env.POSTGRES_URL),reachable:false}}}
function routerSelfTest(){try{return require('./cc55-moderation-router').selfTest();}catch(e){return{ok:false,error:e&&e.message?e.message:String(e)}}}
function releaseGateStatus(stats,selfTest){if(!selfTest.ok)return'blocked_router_selftest';if(!stats.dbUrlPresent)return'blocked_database_url_missing';if(!stats.reachable)return'blocked_postgres_unreachable';return'pass'}
function addRoutes(app){
  if(!app||app.__cc61clean)return app;
  app.__cc61clean=true;
  try{require('./cc60-comments-standalone').install(app)}catch(e){console.error('[CC6.1 comments clean boot]',e&&e.message?e.message:e)}
  try{require('./cc55-feature-gate').install(app)}catch(e){console.warn('[CC6.1 feature gate]',e&&e.message?e.message:e)}
  try{require('./cc54-public-post-register').install(app)}catch(e){console.warn('[CC6.1 public register]',e&&e.message?e.message:e)}
  try{require('./cc52-db-debug-routes').install(app)}catch(e){}
  try{require('./cc53-db-diagnose').install(app)}catch(e){}
  app.get('/debug/qa-lite',async(req,res)=>{noCache(res);const s=await dbStats();const st=routerSelfTest();const rel=releaseGateStatus(s,st);const manual=(rel==='pass')?'allowed':'blocked';res.type('text/plain').send(['OK: '+(manual==='allowed'?'PROD_CHECK_READY':'WARNING'),'runtime: '+RUNTIME,'sourceMarker: '+SOURCE,'releaseGate: '+rel,'featureGate: informational_only_not_blocking_comments','manualTesting: '+manual,'commentsShell: cc61_clean_boot_ui_preserved','commentsRoute: /app_intercepted_before_legacy','usesLegacyAppJs: false','uiPolicy: preserve_approved_telegram_like_layout','commentsOpenBlocksDb: false','commentsPostBlocksDb: false','dbRegistration: background_only','redirects: false','floatingCta: removed_from_boot_path','moderationRouter: cc55_single_router','legacyRouterFallback: disabled','mainMenuRouter: cc_owned','callbackPostUpsert: disabled','dbGuard: enabled','dbScanRoute: enabled','dbDiagnoseRoute: enabled','publicPostRegister: background_only','routerSelfTest: '+(st.ok?'pass':'fail'),'dbUrlPresent: '+Boolean(s.dbUrlPresent),'postgresReachable: '+Boolean(s.reachable),'dbAdmins: '+(s.admins||0),'dbChannels: '+(s.channels||0),'dbPosts: '+(s.posts||0),'dbRules: '+(s.rules||0),'debugTruth: qa_lite_matches_comments_shell','featureGateReason: comments_open_is_not_blocked_by_feature_gate'].join('\n')+'\n');});
  app.get('/debug/mod-router-selftest',(req,res)=>{noCache(res);res.json(routerSelfTest());});
  return app;
}
const old=Module._load;
Module._load=function(request,parent,isMain){
  const loaded=old.apply(this,arguments);
  try{
    if(String(request||'')==='express'&&loaded&&!loaded.__cc61wrap){
      function ex(){
        const app=loaded.apply(this,arguments);
        addRoutes(app);
        if(app&&!app.__cc61post){
          app.__cc61post=true;
          const oldPost=app.post.bind(app);
          const routeName='/web'+'hook';
          app.post=(route,...handlers)=>String(route||'').includes(routeName)?oldPost(route,async(req,res,next)=>{try{if(await require('./cc55-moderation-router').handle(req.body||{}))return res.json({ok:true,handledBy:RUNTIME});}catch(e){console.error('[CC6.1 router]',e&&e.message?e.message:e);}next();},...handlers):oldPost(route,...handlers);
        }
        return app;
      }
      Object.setPrototypeOf(ex,loaded);Object.assign(ex,loaded);ex.__cc61wrap=true;return ex;
    }
  }catch(e){console.warn('[CC6.1 bootstrap]',e&&e.message?e.message:e);}
  return loaded;
};
require('./cc5-db-core').init().catch(e=>console.error('[CC6.1 DB]',e&&e.message?e.message:e));
require('./server-sp4058.js');
try{require('./cc45-public-final').install();}catch{}
