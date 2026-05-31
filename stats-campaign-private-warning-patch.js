'use strict';
const RUNTIME='CC8.3.23-ADS-INVITE-LINK-INPUT';
function clean(v){return String(v||'').trim();}
function install(){const statsFlow=require('./stats-flow-cc8');if(statsFlow.__privateInviteWarningPatchInstalled)return{ok:true,already:true,runtimeVersion:RUNTIME};const oldScreen=statsFlow.screenForPayload;statsFlow.screenForPayload=async function(menu,payload={},ctx={}){const res=await oldScreen(menu,payload,ctx);const a=clean(payload.action);if(res&&typeof res.text==='string'&&(a==='admin_stats_campaign_create'||a==='admin_stats_campaign_channel'||res.id==='stats_campaign_registered_invite_url'||res.id==='stats_campaign_name_after_invite')){if(!res.text.includes('Приватный канал'))res.text+='\n\n⚠️ Приватный канал: используйте invite-ссылку MAX. После обновления ссылки в MAX обновите её и в АдминКИТ.';}return res;};statsFlow.__privateInviteWarningPatchInstalled=true;return{ok:true,runtimeVersion:RUNTIME};}
module.exports={RUNTIME,install};
