'use strict';
const channelService=require('./services/channelService');
const titleResolver=require('./channel-title-resolver-cc8340');
const botAudit=require('./admin-bot-audit-trace');
const RUNTIME='CC8.3.44-AUTO-TENANT-CHANNEL-BIND';
const clean=(v)=>String(v||'').trim();
const arr=(v)=>Array.isArray(v)?v:[];
const cid=(x={})=>clean(x.channelId||x.id||x.chatId||x.chat_id);
const owner=(x={})=>clean(x.linkedByUserId||x.ownerUserId||'');
function audit(type,payload={}){try{botAudit.log(type,{...payload,runtimeVersion:RUNTIME});}catch{}}
async function bindUnownedForUser({botToken='',userId='',tenantName='',limit=30}={}){const uid=clean(userId);if(!uid)return{ok:false,reason:'user_id_missing',runtimeVersion:RUNTIME};const list=arr(channelService.listChannels()).filter(x=>cid(x)).slice(0,Math.max(1,Math.min(Number(limit||30),100)));const targets=list.filter(x=>!owner(x));const results=[];for(const ch of targets){const channelId=cid(ch);try{const r=await titleResolver.resolveTitle({botToken,channelId,tenantUserId:uid,tenantName,force:false});results.push({channelId,title:r&&r.title||'',bound:clean(r&&r.linkedByUserId)===uid,linkedByUserId:r&&r.linkedByUserId||'',source:r&&r.source||''});}catch(e){results.push({channelId,bound:false,error:String(e&&e.message||e).slice(0,160)});}}
audit('tenant_channel_auto_bind.checked',{userId:uid,targets:targets.length,bound:results.filter(x=>x.bound).length});return{ok:true,runtimeVersion:RUNTIME,userId:uid,targets:targets.length,bound:results.filter(x=>x.bound).length,results};}
module.exports={RUNTIME,bindUnownedForUser};
