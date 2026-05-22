'use strict';

const guard = require('./clean-bot-flow-guard-1546');
const menu = require('./v3-menu-core-1539');
const posts = require('./posts-flow-cc8-text-flow');
const gifts = require('./gifts-flow-cc8-fast');
const max = require('./services/maxApi');
const timing = require('./v3-ui-timing-cc8');

const RUNTIME = 'CC8.0.18-GIFTS-START-CREATE-FAST';

function clean(v){ return String(v || '').trim(); }
function find(o,p,d){ if(!o||d<0) return null; if(typeof o==='object'&&p(o)) return o; if(typeof o!=='object') return null; for(const v of (Array.isArray(o)?o:Object.values(o))){ const r=find(v,p,d-1); if(r) return r; } return null; }
function msg(u){ return u?.message || u?.data?.message || u?.callback?.message || u?.data?.callback?.message || find(u,x=>x&&(x.body?.text||x.text)&&(x.recipient||x.sender||x.id),5); }
function cb(u){ return u?.callback || u?.data?.callback || u?.message?.callback || u?.data?.message?.callback || find(u,x=>x&&(x.callback_id||x.callbackId||x.payload||x.data||x.callback_data),6); }
function userFrom(o){ if(!o||typeof o!=='object') return ''; return clean(o.user_id||o.userId||o.sender_id||o.senderId||o.id||userFrom(o.user)||userFrom(o.sender)||userFrom(o.from)); }
function uid(u,c,m){ return userFrom(c)||userFrom(u)||clean(m?.sender?.user_id||m?.sender?.id||m?.user_id); }
function cbid(c){ return clean(c?.callback_id||c?.callbackId||c?.id); }
function chatId(m){ return clean(m?.recipient?.chat_id||m?.recipient?.id||m?.chat_id||m?.chat?.id); }
function chatType(m){ return clean(m?.recipient?.chat_type||m?.recipient?.type||m?.chat_type||m?.chat?.type).toLowerCase(); }
function channel(m){ const id=chatId(m); return chatType(m)==='channel'||/^-/.test(id); }
function mid(m){ return clean(m?.body?.mid||m?.body?.message_id||m?.message_id||m?.messageId||m?.id); }
function payload(c){ const raw=c?.payload??c?.data??c?.value??c?.callback_data??c?.callbackData??''; if(raw&&typeof raw==='object') return raw; try{return JSON.parse(clean(raw));}catch{return {action:clean(raw),raw:clean(raw)};} }
function isPostOpen(p){ const a=clean(p.action||p.raw); return a==='admin_posts_open'||(a==='comments_pick_post'&&clean(p.source).toLowerCase()==='posts'); }
function isGiftClean(p){ const a=clean(p.action||p.raw); return gifts.isCleanGiftAction&&gifts.isCleanGiftAction(a); }
function isGiftStartCreate(p){ const a=clean(p.action||p.raw); return a==='gift_admin_start_create'||a==='gift_admin_create_from_target'||a==='gift_admin_pick_file'; }
async function answer(config,id,meta={}){
  if(!id) return null;
  try{
    return await max.answerCallback({botToken:config.botToken,callbackId:id,notification:meta.notification||'Открываю пост…'});
  }catch(e){
    timing.log('posts_open_callback_ack_error',{durationMs:0,ok:false,action:clean(meta.action),userId:timing.mask(meta.userId||''),status:e?.status||0,error:String(e?.message||e)});
    return null;
  }
}
async function sendScreen(config,u,m,screen){ const messageId=mid(m); if(messageId){ try{return await max.editMessage({botToken:config.botToken,messageId,text:screen.text,attachments:screen.attachments,notify:false});}catch{} } const cid=chatId(m), userId=uid(u,null,m); return max.sendMessage({botToken:config.botToken,userId:cid?'':userId,chatId:cid,text:screen.text,attachments:screen.attachments,notify:false}); }
function later(config,u,m,screen,meta){ const started=Date.now(); setTimeout(async()=>{ try{ await sendScreen(config,u,m,screen); timing.log(meta.timingName||'posts_open_async_show_result',{durationMs:Date.now()-started,ok:true,action:meta.action,screenId:screen.id,userId:timing.mask(meta.userId)}); }catch(e){ timing.log(meta.timingName||'posts_open_async_show_result',{durationMs:Date.now()-started,ok:false,action:meta.action,screenId:screen.id,userId:timing.mask(meta.userId),error:String(e?.message||e)}); } },0); }

function createCleanBot(legacy){
  const wrapped = guard.createCleanBot(legacy);
  return { handleWebhook: async function(req,res,config){
    const u=req.body||{}, m=msg(u), c=cb(u), p=payload(c), userId=uid(u,c,m), action=clean(p.action||p.raw);
    if(c && !channel(m) && isGiftClean(p)){
      const startCreate = isGiftStartCreate(p);
      const fastTimingName = startCreate ? 'gifts_start_create_fast_screen' : 'gifts_fast_screen';
      const asyncTimingName = startCreate ? 'gifts_start_create_async_show_result' : 'gifts_async_show_result';
      const screen = await timing.measure(fastTimingName,{action,userId:timing.mask(userId)},()=>gifts.screenForPayload(menu,p,{userId,config}));
      if(screen){ await answer(config,cbid(c),{action,userId,notification:startCreate?'Открываю создание подарка…':'Открываю подарки…'}); later(config,u,m,screen,{action,userId,timingName:asyncTimingName}); return res.status(200).json({ok:true,handledBy:RUNTIME,action,screenId:screen.id,giftsFastEntry:!startCreate,giftsStartCreateFast:startCreate,asyncDelivery:true}); }
    }
    if(c && !channel(m) && isPostOpen(p)){
      const screen = await timing.measure('posts_open_fast_screen',{action,userId:timing.mask(userId)},()=>posts.screenForPayload(menu,p,{userId,config}));
      if(screen){ await answer(config,cbid(c),{action,userId}); later(config,u,m,screen,{action,userId}); return res.status(200).json({ok:true,handledBy:RUNTIME,action,screenId:screen.id,postsOpenAsyncDelivery:true,ackHotfix:true,legacyRepatch:true}); }
    }
    return wrapped.handleWebhook(req,res,config);
  }};
}

module.exports = { RUNTIME, createCleanBot };