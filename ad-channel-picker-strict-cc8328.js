'use strict';
const RUNTIME='CC8.3.30-SAFE-ADS-LINK-ONLY-NATIVE-START';
function clean(v){return String(v||'').trim();}
function btn(menu,text,action,data={}){return menu.button(text,action,data);}
function kb(menu,rows){return menu.keyboard(rows);}
function footer(menu){return [[btn(menu,'📣 В начало рекламы','admin_stats_campaigns')],[btn(menu,'🏠 Главное меню','admin_section_main')]];}
function screen(menu,id,title,lines,rows){return{id,text:[title,'',...(lines||[])].filter(Boolean).join('\n'),attachments:kb(menu,rows)};}
function choose(menu){return screen(menu,'stats_campaign_choose_channel_link_only','📣 Создание рекламной ссылки',['Канал для рекламы сейчас указывается ссылкой.','','Это безопасный режим: список сохранённых каналов скрыт, чтобы не выбрать личный профиль вместо канала.','','Пришлите invite-ссылку приватного канала или публичную ссылку/ник канала.'],[[btn(menu,'➕ Указать канал по ссылке','admin_stats_campaign_external')],...footer(menu)]);}
function denied(menu){return screen(menu,'stats_campaign_channel_disabled','📣 Создание рекламной ссылки',['Выбор из сохранённого списка временно отключён.','Создайте рекламную ссылку через MAX-ссылку канала.'],[[btn(menu,'➕ Указать канал по ссылке','admin_stats_campaign_external')],...footer(menu)]);}
function install(){const statsFlow=require('./stats-flow-cc8');const ads=require('./services/adCampaignService');if(statsFlow.__adminkitStrictAdChannelPickerInstalled)return{ok:true,already:true,runtimeVersion:RUNTIME};const old=statsFlow.screenForPayload;const oldSelf=ads.selftest;statsFlow.screenForPayload=async function(menu,payload={},ctx={}){const a=clean(payload.action);if(a==='admin_stats_campaign_create')return choose(menu);if(a==='admin_stats_campaign_channel')return denied(menu);return old(menu,payload,ctx);};ads.selftest=function(config={}){const base=oldSelf?oldSelf(config):{ok:true};return{...base,runtimeVersion:RUNTIME,safeAdsLinkOnly:true,storedChannelPickerHidden:true,noAdminUsersInAdChannelPicker:true};};statsFlow.__adminkitStrictAdChannelPickerInstalled=true;return{ok:true,runtimeVersion:RUNTIME,safeAdsLinkOnly:true};}
module.exports={RUNTIME,install};
