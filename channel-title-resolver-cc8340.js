'use strict';
const max = require('./services/maxApi');
const store = require('./store');
const RUNTIME = 'CC8.3.44-AUTO-TENANT-CHANNEL-BIND';
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
function savedRecord(channelId=''){
  const id=clean(channelId);
  return arr(store.getChannelsList()).find(x=>idOf(x)===id) || {};
}
function savedTitle(channelId=''){
  const item=savedRecord(channelId);
  for(const t of [item.resolvedChannelTitle,item.channelTitle,item.title,item.channelName,item.chatTitle]){
    if(isGoodTitle(t)) return clean(t);
  }
  return '';
}
function saveResolvedChannel({channelId='',title='',tenantUserId='',tenantName='',old={},error=''}={}){
  const id=clean(channelId);
  if(!id) return null;
  const good=isGoodTitle(title)?clean(title):'';
  const linkedByUserId=clean(tenantUserId||old.linkedByUserId||old.ownerUserId||'');
  const ownerUserId=clean(tenantUserId||old.ownerUserId||old.linkedByUserId||'');
  return store.saveChannel(id,{...old,channelId:id,title:good||old.title||'',channelTitle:good||old.channelTitle||'',resolvedChannelTitle:good||old.resolvedChannelTitle||'',type:'channel',chatType:'channel',isMaxChannel:true,isChannel:true,linkedByUserId,ownerUserId,linkedByName:clean(tenantName||old.linkedByName),channelTitleResolvedAt:Date.now(),channelTitleResolverRuntime:RUNTIME,channelTitleResolveError:error});
}
async function resolveTitle({ botToken, channelId, tenantUserId='', tenantName='', force=false }={}){
  const id=clean(channelId);
  if(!id) return { ok:false, skipped:true, reason:'channel_id_missing', runtimeVersion:RUNTIME };
  const old=savedRecord(id);
  const existing=savedTitle(id);
  const needsTenantBind=Boolean(clean(tenantUserId) && (!clean(old.linkedByUserId) || !clean(old.ownerUserId)));
  if(existing && !force && !needsTenantBind) return { ok:true, channelId:id, title:existing, source:'store', linkedByUserId:clean(old.linkedByUserId||old.ownerUserId), runtimeVersion:RUNTIME };
  if(existing && !force && needsTenantBind){
    const saved=saveResolvedChannel({channelId:id,title:existing,tenantUserId,tenantName,old,error:''});
    return { ok:true, channelId:id, title:existing, source:'tenant-bind-store', linkedByUserId:clean(saved.linkedByUserId||saved.ownerUserId), runtimeVersion:RUNTIME };
  }
  let title='';
  let error='';
  try{
    const chat=await max.getChat({ botToken, chatId:id, timeoutMs:1800 });
    title=clean(chat && (chat.title || chat.name || chat.chat_title || chat.username || chat.link || ''));
  }catch(e){ error=String(e && e.message || e).slice(0,220); }
  if(!isGoodTitle(title)) title='';
  const saved=saveResolvedChannel({channelId:id,title,tenantUserId,tenantName,old,error});
  return { ok:true, channelId:id, title:clean(saved.resolvedChannelTitle||saved.channelTitle||saved.title)||'Канал без названия', source:title?'max.getChat':'fallback', linkedByUserId:clean(saved.linkedByUserId||saved.ownerUserId), error, runtimeVersion:RUNTIME };
}
function install(){
  let autoTenantChannelBind=false;
  try{ const auto=require('./ad-auto-tenant-channel-bind-cc8344'); const r=auto.install&&auto.install(); autoTenantChannelBind=Boolean(r&&r.ok); }catch{}
  return { ok:true, runtimeVersion:RUNTIME, channelTitleResolver:true, tenantChannelBinding:true, autoTenantChannelBind };
}
module.exports={ RUNTIME, install, resolveTitle, savedTitle, isGoodTitle };
