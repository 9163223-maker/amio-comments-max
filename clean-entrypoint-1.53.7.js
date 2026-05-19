'use strict';

const RUNTIME='CC7.5.34-CORE-1.53.7-CLEAN-MENU-COMMENTS-NESTED';
const SOURCE='adminkit-cc7-5-34-core-1-53-7-clean-menu-comments-nested';
const BASE='https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

function applyEnv(){
  process.env.BUILD_VERSION=RUNTIME;
  process.env.RUNTIME_VERSION=RUNTIME;
  process.env.BUILD_SOURCE_MARKER=SOURCE;
  process.env.ADMINKIT_PUBLIC_BASE_URL=BASE;
  process.env.ADMINKIT_CLEAN_MENU_CORE='1';
  process.env.ADMINKIT_CLEAN_ENTRYPOINT='1.53.7';
}

function installExpressRoutes(){
  const expressPath=require.resolve('express');
  const express=require('express');
  const routes=require('./v3-menu-routes-1537');
  if(express&&express.__adminkitClean1537Wrapped)return {ok:true,already:true,runtimeVersion:RUNTIME};
  function wrappedExpress(){
    const app=express.apply(this,arguments);
    routes.install(app);
    return app;
  }
  Object.setPrototypeOf(wrappedExpress,express);
  Object.assign(wrappedExpress,express);
  wrappedExpress.__adminkitClean1537Wrapped=true;
  require.cache[expressPath].exports=wrappedExpress;
  return {ok:true,runtimeVersion:RUNTIME,mode:'express-cache-wrapper-only',noModuleLoadPatch:true};
}

function installCleanBot(){
  const botPath=require.resolve('./bot');
  const legacy=require('./bot');
  const {createCleanBot}=require('./clean-bot-1537');
  const clean=createCleanBot(legacy);
  require.cache[botPath].exports=clean;
  return {ok:true,runtimeVersion:RUNTIME,mode:'bot-cache-replacement',legacyDelegation:true,noMaxApiPatch:true};
}

function info(){return{ok:true,runtimeVersion:RUNTIME,sourceMarker:SOURCE,canonicalPublicBaseUrl:BASE,cleanBase:true,entrypoint:'clean-entrypoint-1.53.7.js',menuCore:'v3-menu-core-1537.js',botAdapter:'clean-bot-1537.js',routes:'v3-menu-routes-1537.js',activeRuntime:'index.js',visibleMainMenuTotal:13,featurePlanTotal:15,commentsNestedItems:['photos','reactions_replies'],noModuleLoadPatch:true,noMaxApiPatch:true,noFsPatch:true,noLongEntrypointChain:true,rollback:'Set package.json start back to node clean-entrypoint-1.53.6.js'};}

function start(){
  applyEnv();
  const expressRoutes=installExpressRoutes();
  const cleanBot=installCleanBot();
  process.env.ADMINKIT_CLEAN_1537_EXPRESS_ROUTES_OK=expressRoutes.ok?'1':'0';
  process.env.ADMINKIT_CLEAN_1537_BOT_OK=cleanBot.ok?'1':'0';
  console.log('adminkit clean 1.53.7 start', JSON.stringify({runtimeVersion:RUNTIME, expressRoutes, cleanBot}));
  return require('./index');
}

if(require.main===module)start();
module.exports={RUNTIME,SOURCE,BASE,applyEnv,installExpressRoutes,installCleanBot,info,start};