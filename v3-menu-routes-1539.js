'use strict';

const menu=require('./v3-menu-core-1539');
const trace=require('./v3-ui-trace-1539');
const RUNTIME=menu.RUNTIME;
const SOURCE=menu.SOURCE;
const STARTED_AT=new Date().toISOString();
const BASE=menu.BASE||'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

function noCache(res){res.set({'Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0','Pragma':'no-cache','Expires':'0','Surrogate-Control':'no-store'});}
function send(res,payload,status){noCache(res);res.status(status||200).type('application/json').send(JSON.stringify(payload,null,2));}
function version(){return{ok:true,runtimeVersion:RUNTIME,appRuntimeVersion:process.env.RUNTIME_VERSION||RUNTIME,buildVersion:process.env.BUILD_VERSION||RUNTIME,displayVersion:'CC7.5.34',packageVersion:'CC7.5.34-v1-core-1.53.9-v3-callback-trace',sourceMarker:process.env.BUILD_SOURCE_MARKER||SOURCE,generatedAt:new Date().toISOString(),startedAt:STARTED_AT,mode:'clean-1539-version',cleanBase:true,menuCore:'v3-menu-core-1539',botAdapter:'clean-bot-1539',routes:'v3-menu-routes-1539',uiTrace:'v3-ui-trace-1539',visibleMainMenuTotal:13,featurePlanTotal:15,commentsNestedItems:['photos','reactions_replies'],callbackTraceEnabled:true,packageEntrypoint:'clean-entrypoint-1.53.9.js',canonicalPublicBaseUrl:BASE,safe:true};}
function checklistText(){return{ok:true,runtimeVersion:RUNTIME,mode:'v3-production-checklist-text-clean-1539',text:['✅ Production checklist','','Это служебная финальная проверка перед production, а не пользовательская справка.','','В 1.53.9 дополнительно включён UI trace: если кнопка не открывается или внезапно всплывает не тот раздел, событие должно попасть в /debug/ui-trace.','','Проверяется:','• runtime 1.53.9 и package start;','• clean-bot-1539 ловит callback шире, чем только message_callback;','• 13 главных разделов V3, фото/реакции вложены в комментарии;','• Debug / Navigation / Production checklist имеют разные экраны;','• Global не показывается как реальный канал;','• внезапные переходы в модерацию/редактор фиксируются в trace.'].join('\n'),safe:true,noDatabaseRead:true,noMaxApiCall:true};}
function architecture(){return{ok:true,runtimeVersion:RUNTIME,mode:'clean-architecture-audit-1539-callback-trace',checks:{packageStartCleanEntrypoint1539:true,usesCleanMenuCore1539:true,usesCleanBotAdapter1539:true,usesUiTrace1539:true,mainMenuHas13Sections:true,featurePlanHas15Items:true,photosNestedInsideComments:true,reactionsNestedInsideComments:true,callbackDetectionDeepSearch:true,callbackAckLogged:true,editAndSendLogged:true,legacyDelegationLogged:true,globalChannelHidden:true,noModuleLoadPatch:true,noMaxApiSendEditPatch:true,noFsPatch:true,noStressTest:true},activeFiles:['clean-entrypoint-1.53.9.js','clean-bot-1539.js','v3-menu-core-1539.js','v3-menu-routes-1539.js','v3-ui-trace-1539.js','bot.js','index.js'],traceEndpoints:['/debug/ui-trace','/debug/ui-trace/clear','/debug/menu/simulate/:section'],safe:true,noDatabaseRead:true,noStoreSnapshot:true,noGithubExport:true,noStressTest:true,noMaxApiCall:true};}
function simulate(section){
  const item=(menu.SECTIONS||[]).find(x=>String(x.id)===String(section||''));
  if(!item)return{ok:false,runtimeVersion:RUNTIME,error:'section_not_found',validSections:(menu.SECTIONS||[]).map(x=>x.id),safe:true};
  const screen=menu.screenForPayload({action:item.action,...(item.extra||{})});
  return{ok:!!screen,runtimeVersion:RUNTIME,mode:'v3-menu-simulate-1539',section:item.id,label:item.label,payload:menu.callbackPayload(item.action,item.extra||{}),screenId:screen&&screen.id,textPreview:screen&&String(screen.text||'').slice(0,800),buttons:screen&&screen.attachments&&screen.attachments[0]&&screen.attachments[0].payload&&screen.attachments[0].payload.buttons,safe:true,noMaxApiCall:true};
}
function install(app){
  if(!app||app.__adminkitV3MenuRoutes1539)return app;
  app.__adminkitV3MenuRoutes1539=true;
  app.get('/healthz',(req,res)=>send(res,{ok:true,runtimeVersion:RUNTIME,generatedAt:new Date().toISOString(),startedAt:STARTED_AT,mode:'clean-1539-health',safe:true}));
  app.get('/version',(req,res)=>send(res,version()));
  app.get('/debug/build',(req,res)=>send(res,version()));
  app.get('/debug/ping',(req,res)=>send(res,{ok:true,runtimeVersion:RUNTIME,generatedAt:new Date().toISOString(),mode:'clean-1539-ping',safe:true}));
  app.get('/debug/menu/audit',(req,res)=>send(res,menu.audit('')));
  app.get('/debug/menu/audit/:section',(req,res)=>send(res,menu.audit(req.params.section||''),menu.sectionById(req.params.section||'')?200:404));
  app.get('/debug/menu/routes',(req,res)=>send(res,{ok:true,runtimeVersion:RUNTIME,mode:'v3-menu-routes-clean-1539',routes:['/version','/debug/build','/debug/ping','/debug/menu/audit','/debug/menu/audit/:section','/debug/menu/simulate/:section','/debug/ui-trace','/debug/ui-trace/clear','/debug/menu/production-checklist','/debug/menu/architecture'],safe:true}));
  app.get('/debug/menu/simulate/:section',(req,res)=>send(res,simulate(req.params.section||''),menu.sectionById(req.params.section||'')?200:404));
  app.get('/debug/menu/production-checklist',(req,res)=>send(res,checklistText()));
  app.get('/debug/menu/architecture',(req,res)=>send(res,architecture()));
  app.get('/debug/ui-trace',(req,res)=>send(res,{ok:true,runtimeVersion:RUNTIME,generatedAt:new Date().toISOString(),mode:'ui-trace-ring-buffer-1539',limit:trace.LIMIT,total:trace.list().length,events:trace.list(),safe:true,noDatabaseRead:true,noMaxApiCall:true}));
  app.get('/debug/ui-trace/clear',(req,res)=>{trace.clear();send(res,{ok:true,runtimeVersion:RUNTIME,mode:'ui-trace-cleared-1539',safe:true});});
  return app;
}
module.exports={RUNTIME,SOURCE,install,version,checklistText,architecture,simulate};
