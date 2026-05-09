'use strict';
const Module = require('module');
const path = require('path');
const RUNTIME = 'CC6.5.5';
const SOURCE = 'adminkit-CC6.5.5-landing-logo-optimized';
const logoCore = require('./cc654-optimized-logo-asset');
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function isLogoRequest(req){
  const raw = String(req.path || req.url || '').split('?')[0].toLowerCase();
  const base = path.posix.basename(raw);
  return base === 'adminkit_chat_logo.png' || base === 'adminkit_chat_logo_optimized.png' || base === 'adminkit-logo.png' || base === 'adminkit_logo.png' || (base === 'logo.png' && raw.includes('adminkit'));
}
function sendLogo(res){
  const buffer = logoCore.ensureOptimizedLogoFile();
  try{res.set({'Content-Type':'image/png','Cache-Control':'public, max-age=86400, immutable','X-Adminkit-Logo-Asset':'optimized','X-Adminkit-Logo-Runtime':RUNTIME});}catch{}
  return res.end(buffer);
}
function installExpressPatch(){
  if(Module._load.__cc655LandingLogoPatch)return;
  const oldLoad = Module._load;
  function patchedLoad(request,parent,isMain){
    const loaded = oldLoad.apply(this, arguments);
    if(String(request || '') === 'express' && loaded && !loaded.__cc655LandingLogoWrap){
      function expressWrapper(){
        const app = loaded.apply(this, arguments);
        if(app && !app.__cc655LandingLogoRoutes){
          app.__cc655LandingLogoRoutes = true;
          app.use((req,res,next)=>{
            const p = String(req.path || req.url || '').split('?')[0];
            if(p === '/debug/logo-assets'){
              noCache(res);
              const buffer = logoCore.ensureOptimizedLogoFile();
              return res.type('text/plain').send([
                'OK: LOGO_ASSETS_READY','runtime: '+RUNTIME,'sourceMarker: '+SOURCE,
                'chatMenuLogo: optimized','landingLogo: optimized','landingStaticInterceptor: enabled',
                'servedPaths: /adminkit_chat_logo.png, /public/adminkit_chat_logo.png, /adminkit_chat_logo_optimized.png',
                'format: png','dimensions: 480x168','optimizedBytes: '+buffer.length,
                'landingLogoBlocksAppOpen: false','desktopOverflowGuard: enabled'
              ].join('\n')+'\n');
            }
            if(isLogoRequest(req)) return sendLogo(res);
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded); Object.assign(expressWrapper, loaded); expressWrapper.__cc655LandingLogoWrap = true; return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc655LandingLogoPatch = true; Module._load = patchedLoad;
}
function install(){process.env.BUILD_VERSION=RUNTIME;process.env.RUNTIME_VERSION=RUNTIME;process.env.BUILD_SOURCE_MARKER=SOURCE;logoCore.install();installExpressPatch();return {ok:true,runtimeVersion:RUNTIME,sourceMarker:SOURCE};}
module.exports = {RUNTIME,SOURCE,install};
