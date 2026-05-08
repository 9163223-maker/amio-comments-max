'use strict';
const Module = require('module');
const RUNTIME = 'SP40.5.9-clear-core-debug-aliases';
console.log('[' + RUNTIME + '] debug aliases wrapper');
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = 'adminkit-SP40.5.9-clear-core-debug-aliases';
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0','Pragma':'no-cache','Expires':'0'});}catch(e){}}
function install(app){
  if(!app || app.__ak4059DebugAliases) return app;
  app.__ak4059DebugAliases = true;
  app.get('/debug/qa-lite', (req,res)=>{ noCache(res); res.type('text/plain').send(['OK: PROD_CHECK_READY','runtime: '+RUNTIME,'sourceMarker: adminkit-SP40.5.9-clear-core-debug-aliases','entrypoint: server-sp4059-debug.js -> server-sp4058.js','clearCore: enabled','debugAliases: enabled','storeLiveMetaMayShowOldCore: true'].join('\n')+'\n'); });
  app.get('/debug/runtime-marker', (req,res)=>{ noCache(res); res.json({ok:true,runtimeVersion:RUNTIME,sourceMarker:'adminkit-SP40.5.9-clear-core-debug-aliases',entrypoint:'server-sp4059-debug.js -> server-sp4058.js',clearCore:true,debugAliases:true,generatedAt:Date.now(),generatedAtIso:new Date().toISOString()}); });
  return app;
}
const oldLoad = Module._load;
Module._load = function(request,parent,isMain){
  const loaded = oldLoad.apply(this, arguments);
  if(request === 'express' && loaded && !loaded.__ak4059Wrapped){
    function wrappedExpress(){ return install(loaded.apply(this, arguments)); }
    Object.setPrototypeOf(wrappedExpress, loaded); Object.assign(wrappedExpress, loaded); wrappedExpress.__ak4059Wrapped = true; return wrappedExpress;
  }
  return loaded;
};
require('./server-sp4058.js');
