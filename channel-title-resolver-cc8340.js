'use strict';
const max = require('./services/maxApi');
const store = require('./store');
const RUNTIME = 'CC8.3.40-CHANNEL-TITLE-RESOLVER';
function clean(v){ return String(v || '').trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function looksTechnical(v=''){ const s=clean(v); return /^-?\d{6,}$/.test(s) || /^id\d{6,}$/i.test(s); }
function looksPersonal(v=''){
  const s=clean(v);
  if(!s || s.includes(' ') || s.includes('-') || s.includes('_') || s.includes('.') || s.length>24) return false;
  if(/club|клуб|канал|style|стиль|admin|админ|kit|кит|blog|блог/i.test(s)) return false;
  return /^[A-Za-zА-Яа-яЁё]+$/.test(s);
}
function isGoodTitle(v=''){ const s=clean(v); return Boolean(s && !looksTechnical(s) && !looksPersonal(s)); }
function idOf(x={}){ return clean(x.channelId || x.chatId || x.chat_id || x.id); }
function savedTitle(channelId=''){
  const id=clean(channelId);
  if(!id) return '';
  for(const item of arr(store.getChannelsList())){
    if(idOf(item)!==id) continue;
    for(const t of [item.resolvedChannelTitle,item.channelTitle,item.title,item.channelName,item.chatTitle]){
      if(isGoodTitle(t)) return clean(t);
    }
  }
  return '';
}
async function resolveTitle({ botToken, channelId, tenantUserId='', tenantName='', force=false }={}){
  const id=clean(channelId);
  if(!id) return { ok:false, skipped:true, reason:'channel_id_missing', runtimeVersion:RUNTIME };
  const existing=savedTitle(id);
  if(existing && !force) return { ok:true, channelId:id, title:existing, source:'store', runtimeVersion:RUNTIME };
  let title='';
  let error='';
  try{
    const chat=await max.getChat({ botToken, chatId:id, timeoutMs:1800 });
    title=clean(chat && (chat.title || chat.name || chat.chat_title || chat.username || chat.link || ''));
  }catch(e){ error=String(e && e.message || e).slice(0,220); }
  if(!isGoodTitle(title)) title='';
  const old=arr(store.getChannelsList()).find(x=>idOf(x)===id) || {};
  const saved=store.saveChannel(id,{...old,channelId:id,title:title||old.title||'',channelTitle:title||old.channelTitle||'',resolvedChannelTitle:title||old.resolvedChannelTitle||'',type:'channel',chatType:'channel',isMaxChannel:true,isChannel:true,linkedByUserId:clean(tenantUserId||old.linkedByUserId||old.ownerUserId),ownerUserId:clean(tenantUserId||old.ownerUserId||old.linkedByUserId),linkedByName:clean(tenantName||old.linkedByName),channelTitleResolvedAt:Date.now(),channelTitleResolverRuntime:RUNTIME,channelTitleResolveError:error});
  return { ok:true, channelId:id, title:clean(saved.resolvedChannelTitle||saved.channelTitle||saved.title)||'Канал без названия', source:title?'max.getChat':'fallback', error, runtimeVersion:RUNTIME };
}
function install(){ return { ok:true, runtimeVersion:RUNTIME, channelTitleResolver:true }; }
module.exports={ RUNTIME, install, resolveTitle, savedTitle, isGoodTitle };
