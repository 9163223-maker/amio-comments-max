'use strict';
const guard = require('./cc52-db-guard');
const RUNTIME = 'CC5.3';
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function tokenOk(req){const expected=String(process.env.DEBUG_TOKEN||process.env.GIFT_ADMIN_TOKEN||'admin');return String(req.query.token||'')===expected;}
function install(app){
  if(!app || app.__cc52DbDebugRoutes) return app;
  app.__cc52DbDebugRoutes = true;
  app.get('/debug/db-posts-scan', async (req,res)=>{
    noCache(res);
    if(!tokenOk(req)) return res.status(403).json({ok:false,error:'forbidden'});
    try{
      const limit = Math.max(1, Math.min(Number(req.query.limit || 30), 200));
      const result = await guard.scanServicePosts(limit);
      res.json({ok:true,runtimeVersion:RUNTIME,mode:'dry_run_only',result,generatedAt:Date.now()});
    }catch(e){
      res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});
    }
  });
  app.get('/debug/db-posts-cleanup', async (req,res)=>{
    noCache(res);
    if(!tokenOk(req)) return res.status(403).json({ok:false,error:'forbidden'});
    const apply = String(req.query.apply||'0') === '1';
    const confirm = String(req.query.confirm||'') === 'delete-service-posts';
    try{
      const limit = Math.max(1, Math.min(Number(req.query.limit || 50), 200));
      if(!apply || !confirm){
        const preview = await guard.cleanupServicePosts({apply:false,limit});
        return res.json({ok:true,runtimeVersion:RUNTIME,mode:'dry_run_only',message:'To delete service menu posts call with apply=1&confirm=delete-service-posts',result:preview,generatedAt:Date.now()});
      }
      const result = await guard.cleanupServicePosts({apply:true,limit});
      res.json({ok:true,runtimeVersion:RUNTIME,mode:'applied',result,generatedAt:Date.now()});
    }catch(e){
      res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});
    }
  });
  return app;
}
module.exports = { install };
