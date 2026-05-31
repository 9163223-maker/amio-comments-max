'use strict';
const RUNTIME='CC8.3.44-AUTO-TENANT-CHANNEL-BIND';
const binder=require('./tenant-channel-auto-bind-cc8344');
const audit=require('./admin-bot-audit-trace');
const clean=(v)=>String(v||'').trim();
function log(type,payload={}){try{audit.log(type,{...payload,runtimeVersion:RUNTIME});}catch{}}
function install(){const statsFlow=require('./stats-flow-cc8');if(statsFlow.__adminkitAdAutoTenantChannelBindInstalled)return{ok:true,already:true,runtimeVersion:RUNTIME};const old=statsFlow.screenForPayload;statsFlow.screenForPayload=async function(menu,payload={},ctx={}){const action=clean(payload.action);if(action==='admin_stats_campaign_create'&&ctx&&ctx.config&&ctx.config.botToken&&clean(ctx.userId)){try{const r=await binder.bindUnownedForUser({botToken:ctx.config.botToken,userId:ctx.userId,tenantName:'',limit:30});log('ad_auto_tenant_channel_bind.done',{userId:ctx.userId,targets:r&&r.targets,bound:r&&r.bound});}catch(e){log('ad_auto_tenant_channel_bind.error',{userId:ctx.userId,error:String(e&&e.message||e).slice(0,160)});}}return old(menu,payload,ctx);};statsFlow.__adminkitAdAutoTenantChannelBindInstalled=true;return{ok:true,runtimeVersion:RUNTIME,autoTenantChannelBind:true};}
module.exports={RUNTIME,install};
