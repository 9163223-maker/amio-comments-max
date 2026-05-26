'use strict';

const guard = require('./clean-bot-flow-guard-1546');
const menu = require('./v3-menu-core-1539');
const posts = require('./posts-flow-cc8-text-flow');
const gifts = require('./gifts-flow-cc812-bottom');
const buttons = require('./buttons-flow-cc8-clean');
const max = require('./services/maxApi');
const postPatcher = require('./services/postPatcher');
const timing = require('./v3-ui-timing-cc8');
const store = require('./store');

const RUNTIME = 'CC8.1.16-FAST-PATCH-CORE-PR76';

function clean(v){ return String(v || '').trim(); }
function find(o,p,d){ if(!o||d<0) return null; if(typeof o==='object'&&p(o)) return o; if(typeof o!=='object') return null; for(const v of (Array.isArray(o)?o:Object.values(o))){ const r=find(v,p,d-1); if(r) return r; } return null; }
function firstDeep(o, keys, depth=6){ const found=find(o,x=>x&&typeof x==='object'&&keys.some(k=>x[k]!==undefined&&x[k]!==null&&String(x[k]).trim()),depth); if(!found)return ''; for(const k of keys){ const v=clean(found[k]); if(v)return v; } return ''; }
function msg(u){ return u?.message || u?.data?.message || u?.callback?.message || u?.data?.callback?.message || find(u,x=>x&&(x.body?.text||x.text||x.body?.seq||x.seq)&&(x.recipient||x.sender||x.id),5); }
function cb(u){ return u?.callback || u?.data?.callback || u?.message?.callback || u?.data?.message?.callback || find(u,x=>x&&(x.callback_id||x.callbackId||x.payload||x.data||x.callback_data),6); }
function kind(u){ return clean(u?.update_type||u?.type||u?.data?.update_type||u?.data?.type).toLowerCase(); }
function userFrom(o){ if(!o||typeof o!=='object') return ''; return clean(o.user_id||o.userId||o.sender_id||o.senderId||o.id||userFrom(o.user)||userFrom(o.sender)||userFrom(o.from)); }
function uid(u,c,m){ return userFrom(c)||userFrom(u)||clean(m?.sender?.user_id||m?.sender?.id||m?.user_id); }
function cbid(c){ return clean(c?.callback_id||c?.callbackId||c?.id); }
function chatId(m){ return clean(m?.recipient?.chat_id||m?.recipient?.id||m?.chat_id||m?.chat?.id); }
function chatType(m){ return clean(m?.recipient?.chat_type||m?.recipient?.type||m?.chat_type||m?.chat?.type).toLowerCase(); }
function channel(m){ const id=chatId(m); return chatType(m)==='channel'||/^-/.test(id); }
function mid(m){ return clean(m?.body?.mid||m?.body?.message_id||m?.message_id||m?.messageId||m?.id); }
function body(m){ return m?.body&&typeof m.body==='object'?m.body:{}; }
function postId(m){ const b=body(m); return clean(b.seq||b.post_id||m?.seq||m?.post_id||firstDeep(b?.message||m?.message||{},['seq','post_id'],4)||''); }
function textOf(m){ const b=body(m); return String(b.text||b.caption||b?.message?.text||b?.link?.message?.text||b?.forward?.message?.text||m?.text||m?.caption||m?.link?.message?.text||''); }
function channelTitleOf(m){ const b=body(m); return clean(b?.chat_title||b?.chat?.title||m?.chat?.title||m?.recipient?.title||m?.recipient?.chat_title||''); }
function linkOf(m){ const b=body(m); const value=b.link||m?.link||null; return value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):null; }
function formatOf(m){ const b=body(m); return b.format!==undefined?b.format:m?.format; }
function collectAttachments(source){ const result=[]; const push=(v,forced='')=>{ if(!v)return; if(Array.isArray(v)){v.forEach(x=>push(x,forced));return;} if(typeof v!=='object')return; const type=clean(forced||v.type||v.kind||v.attachment_type).toLowerCase(); const payload=v.payload&&typeof v.payload==='object'?v.payload:v; const looks=Boolean(type||v.token||payload.token||payload.url||payload.file_id||payload.photo_id||payload.image_id||payload.video_id||payload.document_id); if(!looks)return; result.push(v.type||v.kind||v.attachment_type?v:{type:type||'file',payload}); };
  if(!source||typeof source!=='object')return result;
  if(Array.isArray(source.attachments))source.attachments.forEach(x=>push(x));
  ['photo','image','picture','document','file','video','audio','voice'].forEach(k=>push(source[k],k));
  return result;
}
function attachmentsOf(m){ const b=body(m); const list=[...collectAttachments(b),...collectAttachments(m),...collectAttachments(b?.message),...collectAttachments(m?.message)]; const seen=new Set(); return list.filter(x=>{const k=JSON.stringify(x); if(seen.has(k))return false; seen.add(k); return true;}); }
function hasCommentsKeyboard(m){ return attachmentsOf(m).some(x=>x?.type==='inline_keyboard'&&JSON.stringify(x).includes('Комментар')); }
function payload(c){ const raw=c?.payload??c?.data??c?.value??c?.callback_data??c?.callbackData??''; if(raw&&typeof raw==='object') return raw; try{return JSON.parse(clean(raw));}catch{return {action:clean(raw),raw:clean(raw)};} }
function isPostOpen(p){ const a=clean(p.action||p.raw); return a==='admin_posts_open'||(a==='comments_pick_post'&&clean(p.source).toLowerCase()==='posts'); }
function isGiftClean(p){ const a=clean(p.action||p.raw); return gifts.isCleanGiftAction&&gifts.isCleanGiftAction(a); }
function isButtonClean(p){ const a=clean(p.action||p.raw); return buttons.isCleanButtonAction&&buttons.isCleanButtonAction(a); }
function isGiftStartCreate(p){ const a=clean(p.action||p.raw); return a==='gift_admin_start_create'||a==='gift_admin_create_from_target'||a==='gift_admin_pick_file'||a==='gift_admin_replace_existing'; }
function resultMessageId(result, fallback=''){ return clean(result?.message?.body?.mid||result?.message?.id||result?.body?.mid||result?.message_id||result?.messageId||result?.id||fallback); }
function isGiftScreen(screen){ return /^(gifts?|adminkit_gift)/i.test(clean(screen&&screen.id)); }
function rememberGiftScreen(userId='', messageId='', screen=null){ const u=clean(userId), m=clean(messageId); if(!u||!m||!isGiftScreen(screen)) return; try{ store.setSetupState(u,{ giftActiveScreenMessageId:m, giftActiveScreenId:clean(screen.id), giftActiveScreenAt:Date.now() }); }catch{} }
async function answer(config,id,meta={}){
  if(!id) return null;
  const hasNotification = Object.prototype.hasOwnProperty.call(meta, 'notification');
  if(meta.skipAck===true || (meta.cleanOwned===true && hasNotification && clean(meta.notification)==='')) return null;
  try{
    return await max.answerCallback({botToken:config.botToken,callbackId:id,notification:hasNotification?meta.notification:'Открываю пост…'});
  }catch(e){
    timing.log('posts_open_callback_ack_error',{durationMs:0,ok:false,action:clean(meta.action),userId:timing.mask(meta.userId||''),status:e?.status||0,error:String(e?.message||e)});
    return null;
  }
}
async function sendScreen(config,u,m,screen,meta={}){ const messageId=mid(m); if(messageId){ try{ const result=await max.editMessage({botToken:config.botToken,messageId,text:screen.text,attachments:screen.attachments,notify:false}); rememberGiftScreen(meta.userId||uid(u,null,m),messageId,screen); return result; }catch{} } const cid=chatId(m), userId=uid(u,null,m); const result=await max.sendMessage({botToken:config.botToken,userId:cid?'':userId,chatId:cid,text:screen.text,attachments:screen.attachments,notify:false}); rememberGiftScreen(meta.userId||userId,resultMessageId(result),screen); return result; }
function later(config,u,m,screen,meta){ const started=Date.now(); setTimeout(async()=>{ try{ await sendScreen(config,u,m,screen,meta); timing.log(meta.timingName||'posts_open_async_show_result',{durationMs:Date.now()-started,ok:true,action:meta.action,screenId:screen.id,userId:timing.mask(meta.userId)}); }catch(e){ timing.log(meta.timingName||'posts_open_async_show_result',{durationMs:Date.now()-started,ok:false,action:meta.action,screenId:screen.id,userId:timing.mask(meta.userId),error:String(e?.message||e)}); } },0); }
async function patchChannelMessageFast(u,m,config){
  const started=Date.now(); const channelId=chatId(m), id=postId(m), messageId=mid(m);
  if(!channelId||!id||!messageId)return {ok:false,skipped:true,reason:'channel_post_identity_missing'};
  if(hasCommentsKeyboard(m))return {ok:true,skipped:true,reason:'already_patched'};
  const result=await postPatcher.tryPatchChannelPost({
    botToken:config.botToken,appBaseUrl:config.appBaseUrl,botUsername:config.botUsername,maxDeepLinkBase:config.maxDeepLinkBase,
    channelId,postId:id,messageId,originalText:textOf(m),sourceAttachments:attachmentsOf(m),originalLink:linkOf(m),originalFormat:formatOf(m),
    nativeReactions:[],channelTitle:channelTitleOf(m),linkedByUserId:uid(u,null,m),linkedByName:'',autoMode:true
  });
  timing.log('channel_fast_patch_pr76',{durationMs:Date.now()-started,ok:!result?.patchError,commentKey:result?.commentKey||'',postId:id,channelId,messageId,forwardOrDirect:true,fastPatchRuntime:'CC8.1.16-FAST-PATCH-CORE-PR76'});
  return result;
}

function createCleanBot(legacy){
  const wrapped = guard.createCleanBot(legacy);
  return { handleWebhook: async function(req,res,config){
    const u=req.body||{}, m=msg(u), c=cb(u), p=payload(c), userId=uid(u,c,m), action=clean(p.action||p.raw);
    if(kind(u)==='message_created' && m && channel(m) && postId(m)){
      try{ const result=await patchChannelMessageFast(u,m,config); return res.status(200).json({ok:true,handledBy:RUNTIME,action:'channel_fast_patch_pr76',result}); }
      catch(e){ timing.log('channel_fast_patch_pr76_error',{durationMs:0,ok:false,error:String(e?.message||e),status:e?.status||0}); }
    }
    if(c && !channel(m) && isGiftClean(p)){
      const startCreate = isGiftStartCreate(p);
      const fastTimingName = startCreate ? 'gifts_start_create_fast_screen' : 'gifts_fast_screen';
      const asyncTimingName = startCreate ? 'gifts_start_create_async_show_result' : 'gifts_async_show_result';
      const screen = await timing.measure(fastTimingName,{action,userId:timing.mask(userId)},()=>gifts.screenForPayload(menu,p,{userId,config}));
      if(screen){ await answer(config,cbid(c),{action,userId,notification:'',cleanOwned:true}); later(config,u,m,screen,{action,userId,timingName:asyncTimingName}); return res.status(200).json({ok:true,handledBy:RUNTIME,action,screenId:screen.id,giftsCleanFlow:true,giftsBottomSummary:true,giftsSavePatch:true,giftsStepNumberingClean:true,activeGiftScreenTracked:true,asyncDelivery:true}); }
    }
    if(c && !channel(m) && isButtonClean(p)){
      const screen = await timing.measure('buttons_fast_screen',{action,userId:timing.mask(userId)},()=>buttons.screenForPayload(menu,p,{userId,config}));
      if(screen){ await answer(config,cbid(c),{action,userId,notification:'',cleanOwned:true}); later(config,u,m,screen,{action,userId,timingName:'buttons_async_show_result'}); return res.status(200).json({ok:true,handledBy:RUNTIME,action,screenId:screen.id,buttonsCleanFlow:true,asyncDelivery:true}); }
    }
    if(c && !channel(m) && isPostOpen(p)){
      const screen = await timing.measure('posts_open_fast_screen',{action,userId:timing.mask(userId)},()=>posts.screenForPayload(menu,p,{userId,config}));
      if(screen){ await answer(config,cbid(c),{action,userId}); later(config,u,m,screen,{action,userId}); return res.status(200).json({ok:true,handledBy:RUNTIME,action,screenId:screen.id,postsOpenAsyncDelivery:true,ackHotfix:true,legacyRepatch:true}); }
    }
    return wrapped.handleWebhook(req,res,config);
  }};
}

module.exports = { RUNTIME, createCleanBot };
