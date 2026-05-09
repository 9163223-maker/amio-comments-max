'use strict';
const guard = require('./cc52-db-guard');
const RUNTIME = 'CC5.2';
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function install(app){
  if(!app || app.__cc52DbDebugRoutes) return app;
  app.__cc52DbDebugRoutes = true;
  app.get('/debug/db-posts-scan', async (req,res)=>{
    noCache(res);
    try{
      const limit = Math.max(1, Math.min(Number(req.query.limit || 30), 200));
      const result = await guard.scanServicePosts(limit);
      res.json({ok:true,runtimeVersion:RUNTIME,mode:'dry_run_only',result,generatedAt:Date.now()});
    }catch(e){
      res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});
    }
  });
  return app;
}
module.exports = { install };
