'use strict';

const db = require('./cc5-db-core');
const RUNTIME = 'CC5.4';

function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function norm(v){return String(v||'').replace(/\s+/g,' ').trim();}
function clean(v){return db.clean(v);}
function splitKey(commentKey=''){
  const key=clean(commentKey);
  if(!key || !key.includes(':')) return {channelId:'',postId:'',commentKey:key};
  const parts=key.split(':');
  return {channelId:parts[0],postId:parts.slice(1).join(':'),commentKey:key};
}
function isServiceTitle(title=''){
  const t=norm(title).toLowerCase();
  return !t || /модерац|выберите область|выберите пост|выберите канал|правила всего канала|главное меню|помощь по/.test(t);
}
async function registerPublicPost(input={}){
  await db.init();
  const fromKey=splitKey(input.commentKey||input.key||'');
  const channelId=norm(input.channelId||input.channel_id||fromKey.channelId);
  const postId=norm(input.postId||input.post_id||input.messageId||input.message_id||fromKey.postId);
  const commentKey=clean(input.commentKey||input.key||(channelId&&postId?`${channelId}:${postId}`:''));
  const title=norm(input.title||input.postTitle||input.text||postId||'Пост');
  if(!channelId||!postId||!commentKey) return {ok:false,registered:0,reason:'scope_missing',channelId,postId,commentKey};
  if(isServiceTitle(title)) return {ok:false,registered:0,reason:'service_title_blocked',channelId,postId,title};
  const {rows}=await db.query('select admin_id as "adminId" from ak_admin_channels where channel_id=$1 order by updated_at desc limit 25',[channelId]);
  if(!rows.length) return {ok:true,registered:0,reason:'channel_not_linked_to_admin',channelId,postId,commentKey};
  const registered=[];
  for(const row of rows){
    const saved=await db.upsertPost(row.adminId,channelId,postId,title,{source:'cc54_public_comments_open',commentKey,channelTitle:input.channelTitle||input.channel_title||'',url:input.url||''},postId);
    if(saved) registered.push(saved);
  }
  return {ok:true,registered:registered.length,channelId,postId,commentKey,title,admins:registered.map(x=>x.adminId)};
}
function install(app){
  if(!app||app.__cc54PublicPostRegister) return app;
  app.__cc54PublicPostRegister=true;
  try{app.use('/api/cc54/register-public-post', require('express').json({limit:'64kb'}));}catch{}
  app.post('/api/cc54/register-public-post', async(req,res)=>{
    noCache(res);
    try{res.json({runtimeVersion:RUNTIME,...await registerPublicPost(req.body||{}),generatedAt:Date.now()});}
    catch(e){res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e&&e.message?e.message:String(e)});}
  });
  app.get('/debug/public-post-register-selftest', async(req,res)=>{
    noCache(res);
    res.json({ok:true,runtimeVersion:RUNTIME,parser:splitKey(String(req.query.commentKey||'-100:p1')),generatedAt:Date.now()});
  });
  return app;
}
module.exports={install,registerPublicPost,splitKey};
