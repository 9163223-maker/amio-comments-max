'use strict';

const RUNTIME = 'CC6.2';
const SOURCE = 'adminkit-CC6.2-legacy-ui-clean-boot';
const express = require('express');

function noCache(res){
  try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}
}
function norm(v){return String(v || '').replace(/\s+/g, ' ').trim();}
function clean(v){return norm(v).replace(/^ck:/i,'').replace(/^post:/i,'').replace(/^:+/,'').replace(/^['\"]+|['\"]+$/g,'');}
function splitKey(v){const key=clean(v);const i=key.indexOf(':');return i>0?{commentKey:key,channelId:key.slice(0,i),postId:key.slice(i+1)}:{commentKey:key,channelId:'',postId:''};}
function handoffKey(v){const raw=norm(v).replace(/^handoff[:=_-]?/i,'').replace(/^h_+/i,'').replace(/[^A-Za-z0-9_-]/g,'');return raw?`h_${raw}`:'';}

async function resolveScope(input = {}){
  const direct = splitKey(input.commentKey || input.key || '');
  if (direct.channelId && direct.postId) return { ok:true, ...direct, title:norm(input.title || 'Пост'), source:'direct' };
  const token = handoffKey(input.handoff || input.handoffToken || input.commentKey || input.key || '');
  if (!token) return { ok:false, reason:'empty_scope', commentKey:'', channelId:'', postId:'', title:norm(input.title || 'Пост'), source:'empty' };
  try{
    const store = require('./store');
    let hand = store.getHandoff?.(token) || store.store?.handoffs?.[token] || null;
    let post = null;
    if (!hand && store.findPostByAnyId) post = store.findPostByAnyId(token) || null;
    if (hand?.commentKey && store.getPost) post = store.getPost(hand.commentKey) || post;
    const fromKey = splitKey(hand?.commentKey || post?.commentKey || '');
    const channelId = norm(fromKey.channelId || hand?.channelId || post?.channelId || '');
    const postId = norm(fromKey.postId || hand?.postId || hand?.messageId || post?.postId || post?.messageId || '');
    const commentKey = clean(fromKey.commentKey || (channelId && postId ? `${channelId}:${postId}` : token));
    const title = norm(post?.originalText || post?.text || post?.caption || post?.title || hand?.title || hand?.originalText || input.title || 'Пост').slice(0,160);
    return { ok:true, commentKey, channelId, postId, title, handoff:token, hasHandoff:!!hand, hasPost:!!post, source:(channelId&&postId?'handoff_resolved':'handoff_local') };
  }catch(e){
    return { ok:false, reason:'resolve_store_error', error:e?.message||String(e), commentKey:token, channelId:'', postId:'', title:norm(input.title||'Пост'), source:'handoff_local' };
  }
}
function getStoreComments(key){try{return require('./store').getComments(key)||[]}catch{return[]}}
function addStoreComment(key,item){try{return require('./store').addComment(key,item)}catch{return{id:`local_${Date.now()}`,createdAt:Date.now(),...item}}}
async function registerDbBackground(scope,url){
  if(!scope||!scope.channelId||!scope.postId||!String(scope.commentKey||'').includes(':')) return {ok:false,registered:0,reason:'scope_not_db_ready',scope};
  try{
    const out=await require('./cc54-public-post-register').registerPublicPost({channelId:scope.channelId,postId:scope.postId,commentKey:scope.commentKey,title:scope.title||'Пост',url:url||''});
    return {ok:!!out.ok,registered:Number(out.registered||0),scope,result:out};
  }catch(e){return {ok:false,registered:0,reason:'register_throw',error:e?.message||String(e),scope};}
}

function install(app){
  if(!app||app.__cc62LegacyUiCleanBoot) return app;
  app.__cc62LegacyUiCleanBoot=true;
  const json = express.json({limit:'64kb'});

  // ВАЖНО: CC6.2 сознательно НЕ регистрирует app.get('/app').
  // Визуальный слой и все функции комментариев остаются у утверждённого legacy UI из index/public/app.js.
  // Clean Core здесь обслуживает только независимые debug/API-ручки и не блокирует открытие окна.

  app.get('/api/cc62/comments', async (req,res)=>{
    noCache(res);
    const scope=await resolveScope({key:req.query.key,commentKey:req.query.commentKey,title:req.query.title});
    const key=scope.commentKey||clean(req.query.key||'local');
    res.json({ok:true,runtimeVersion:RUNTIME,scope,comments:getStoreComments(key),generatedAt:Date.now()});
  });
  app.post('/api/cc62/comments', json, async (req,res)=>{
    noCache(res);
    const scope=await resolveScope({key:req.body.key,commentKey:req.body.commentKey,title:req.body.title});
    const key=scope.commentKey||clean(req.body.key||'local');
    const text=norm(req.body.text).slice(0,2000);
    if(text) addStoreComment(key,{userId:norm(req.body.userId||'webapp'),userName:norm(req.body.userName||'Вы'),text,attachments:[],replyToId:'',mine:true});
    res.json({ok:true,runtimeVersion:RUNTIME,scope,comments:getStoreComments(key),generatedAt:Date.now()});
  });
  app.post('/api/cc62/register-bg', json, async (req,res)=>{
    noCache(res);
    const scope=await resolveScope({key:req.body.key,commentKey:req.body.commentKey,title:req.body.title});
    const result=await registerDbBackground(scope,req.body.url||'');
    res.json({ok:true,runtimeVersion:RUNTIME,scope,register:result,generatedAt:Date.now()});
  });
  app.get('/debug/comments-shell',(req,res)=>{
    noCache(res);
    res.json({
      ok:true,
      runtimeVersion:RUNTIME,
      sourceMarker:SOURCE,
      commentsShell:'legacy_ui_clean_boot',
      appRouteOwner:'legacy_index_public_app',
      usesLegacyAppJs:true,
      uiPolicy:'keep_approved_legacy_comments_ui_and_functions',
      cleanCoreScope:'backend_routes_and_db_registration_only',
      standalonePrototypeDisabled:true,
      blocksAppOpen:false,
      blocksPosting:false,
      dbRegistration:'background_only',
      redirects:false,
      generatedAt:Date.now()
    });
  });
  return app;
}
module.exports={RUNTIME,SOURCE,install,resolveScope,registerDbBackground};
