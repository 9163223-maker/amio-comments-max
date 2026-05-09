'use strict';

const RUNTIME = 'CC6.5';
const SOURCE = 'adminkit-CC6.5-moderation-title-repair';
const CURRENT_TEST_CHANNEL_ID = '-73175958664622';
const CURRENT_TEST_CHANNEL_TITLE = 'АдминКит клуб';

function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function tokenOk(req){const expected=String(process.env.DEBUG_TOKEN||process.env.GIFT_ADMIN_TOKEN||'admin');return String(req.query&&req.query.token||'')===expected;}
function norm(v){return String(v||'').replace(/\s+/g,' ').trim();}
function isIdLike(v){return /^-?\d+$/.test(norm(v));}
function isHumanTitle(title, channelId){const t=norm(title), id=norm(channelId);return Boolean(t && t!==id && !isIdLike(t));}
function parseOverrides(){
  const raw=norm(process.env.AK_CHANNEL_TITLE_OVERRIDES||process.env.CHANNEL_TITLE_OVERRIDES||'');
  const out={};
  if(raw){
    try{Object.assign(out, JSON.parse(raw));}catch{
      raw.split(/[;,\n]+/g).forEach(part=>{const [id,...rest]=part.split('='); if(norm(id)&&norm(rest.join('='))) out[norm(id)]=norm(rest.join('='));});
    }
  }
  out[CURRENT_TEST_CHANNEL_ID]=CURRENT_TEST_CHANNEL_TITLE;
  return out;
}
function overrideTitle(channelId){const id=norm(channelId);const title=norm(parseOverrides()[id]);return isHumanTitle(title,id)?title:'';}
async function maxTitle(channelId){
  const id=norm(channelId); if(!id) return '';
  try{
    const api=require('./services/maxApi'); const config=require('./config');
    for(const chatId of [...new Set([id,id.replace(/^-/,'')])]){
      try{const chat=await api.getChat({botToken:config.botToken,chatId}); const title=norm(chat&&(chat.title||chat.name||chat.chat&&(chat.chat.title||chat.chat.name))); if(isHumanTitle(title,id)) return title;}catch{}
    }
  }catch{}
  return '';
}
async function repairOne(db, channelId, explicitTitle=''){
  const id=norm(channelId); if(!id) return {ok:false,reason:'channel_id_missing'};
  const title=isHumanTitle(explicitTitle,id)?norm(explicitTitle):(overrideTitle(id)||await maxTitle(id));
  if(!isHumanTitle(title,id)) return {ok:false,channelId:id,reason:'title_source_missing'};
  const {rows}=await db.query('select admin_id as "adminId" from ak_admin_channels where channel_id=$1 order by updated_at desc limit 50',[id]);
  const admins=rows.map(r=>r.adminId).filter(Boolean);
  if(!admins.length) await db.query('update ak_channels set title=$2, updated_at=now() where channel_id=$1',[id,title]);
  for(const adminId of admins) await db.upsertChannel(adminId,id,title,{source:'cc65_title_repair',title});
  return {ok:true,channelId:id,title,admins,source:RUNTIME};
}
function installDbPatch(){
  const db=require('./cc5-db-core');
  if(db.__cc65TitleRepairInstalled) return db;
  db.__cc65TitleRepairInstalled=true;
  const oldGetChannels=db.getChannels.bind(db);
  db.getChannels=async function(adminId){
    const rows=await oldGetChannels(adminId);
    for(const row of rows){if(row&&row.channelId&&!isHumanTitle(row.title,row.channelId)){const result=await repairOne(db,row.channelId); if(result.ok){row.title=result.title; row.titleRepairedBy=RUNTIME;}}}
    return rows;
  };
  return db;
}
async function titleStatus(){
  const db=installDbPatch(); await db.init();
  const {rows}=await db.query('select channel_id as "channelId", title, updated_at as "updatedAt" from ak_channels order by updated_at desc limit 50');
  const repaired=[];
  for(const row of rows){if(row&&row.channelId&&!isHumanTitle(row.title,row.channelId)){const r=await repairOne(db,row.channelId); if(r.ok){row.title=r.title; repaired.push(r);}}}
  return {ok:true,runtimeVersion:RUNTIME,sourceMarker:SOURCE,channels:rows,repaired,channelTitleIsId:rows.filter(r=>!isHumanTitle(r.title,r.channelId)).length,generatedAt:Date.now()};
}
function install(app){
  installDbPatch();
  if(!app||app.__cc65TitleRepairRoutes) return app;
  app.__cc65TitleRepairRoutes=true;
  app.get('/debug/mod-channel-title-status',async(req,res)=>{noCache(res); if(!tokenOk(req)) return res.status(403).json({ok:false,error:'forbidden'}); try{res.json(await titleStatus());}catch(e){res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});}});
  app.get('/debug/mod-channel-title-repair',async(req,res)=>{noCache(res); if(!tokenOk(req)) return res.status(403).json({ok:false,error:'forbidden'}); try{const db=installDbPatch(); await db.init(); res.json({runtimeVersion:RUNTIME,sourceMarker:SOURCE,...await repairOne(db,req.query.channelId||req.query.channel,req.query.title||''),generatedAt:Date.now()});}catch(e){res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});}});
  return app;
}
module.exports={RUNTIME,SOURCE,install,installDbPatch,titleStatus,repairOne};
