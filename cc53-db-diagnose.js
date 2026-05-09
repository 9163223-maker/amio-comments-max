'use strict';

const { Pool } = require('pg');
const RUNTIME = 'CC5.3';

function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function databaseUrl(){return String(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL || '').trim();}
function safeUrlInfo(raw){
  if(!raw) return {present:false};
  try{
    const u = new URL(raw);
    return {
      present:true,
      protocol:u.protocol.replace(':',''),
      host:u.hostname || '',
      port:u.port || '',
      database:(u.pathname||'').replace(/^\//,'') || '',
      username:u.username ? '[present]' : '',
      password:u.password ? '[present]' : '',
      sslmode:u.searchParams.get('sslmode') || '',
      searchKeys:[...u.searchParams.keys()].filter(k=>!/password|pass|token|secret/i.test(k))
    };
  }catch(e){
    return {present:true, parseError:e&&e.message?e.message:String(e), startsWith:raw.slice(0,18)};
  }
}
function errorInfo(e){
  return {
    name:e&&e.name?e.name:'Error',
    code:e&&e.code?String(e.code):'',
    errno:e&&e.errno?String(e.errno):'',
    syscall:e&&e.syscall?String(e.syscall):'',
    address:e&&e.address?String(e.address):'',
    port:e&&e.port?String(e.port):'',
    message:e&&e.message?String(e.message):String(e)
  };
}
async function probe(){
  const raw = databaseUrl();
  const info = safeUrlInfo(raw);
  if(!raw) return {ok:false,runtimeVersion:RUNTIME,dbUrlPresent:false,url:info,error:{message:'DATABASE_URL / POSTGRES_URI / POSTGRES_URL is missing'}};
  const ssl = /sslmode=disable/i.test(raw) ? false : { rejectUnauthorized:false };
  const pool = new Pool({connectionString:raw,ssl,max:1,idleTimeoutMillis:1000,connectionTimeoutMillis:4500});
  const startedAt = Date.now();
  try{
    const r = await pool.query('select now() as now, current_database() as database, current_user as user, version() as version');
    return {ok:true,runtimeVersion:RUNTIME,dbUrlPresent:true,postgresReachable:true,url:info,sslMode:ssl===false?'disabled':'enabled_rejectUnauthorized_false',latencyMs:Date.now()-startedAt,row:r.rows&&r.rows[0]?{database:r.rows[0].database,user:'[present]',now:r.rows[0].now,version:String(r.rows[0].version||'').slice(0,80)}:{}};
  }catch(e){
    return {ok:false,runtimeVersion:RUNTIME,dbUrlPresent:true,postgresReachable:false,url:info,sslMode:ssl===false?'disabled':'enabled_rejectUnauthorized_false',latencyMs:Date.now()-startedAt,error:errorInfo(e)};
  }finally{
    try{await pool.end();}catch{}
  }
}
function install(app){
  if(!app||app.__cc53DbDiagnose) return app;
  app.__cc53DbDiagnose = true;
  app.get('/debug/db-diagnose', async (req,res)=>{noCache(res);try{res.json(await probe());}catch(e){res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:errorInfo(e),generatedAt:Date.now()});}});
  return app;
}
module.exports={install,probe,safeUrlInfo};
