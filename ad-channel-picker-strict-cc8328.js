'use strict';
const RUNTIME='CC8.3.35-ADS-POSTS-BACKED-CHANNEL-PICKER';
const channelService=require('./services/channelService');
function clean(v){return String(v||'').trim();}
function short(v,m=52){const s=clean(v).replace(/\s+/g,' ');return s.length<=m?s:s.slice(0,Math.max(1,m-1)).trim()+'…';}
function btn(menu,text,action,data={}){return menu.button(text,action,data);}
function kb(menu,rows){return menu.keyboard(rows);}
function footer(menu){return [[btn(menu,'📣 В начало рекламы','admin_stats_campaigns')],[btn(menu,'🏠 Главное меню','admin_section_main')]];}
function screen(menu,id,title,lines,rows){return{id,text:[title,'',...(lines||[])].filter(Boolean).join('\n'),attachments:kb(menu,rows)};}
function id(ch={}){return clean(ch.channelId||ch.id||ch.chatId);}
function title(ch={}){return clean(ch.title||ch.channelTitle||ch.channelName||ch.chatTitle)||'Канал без названия';}
function channels(userId=''){return channelService.listChannelsForAdmin?channelService.listChannelsForAdmin(userId):channelService.listChannels();}
function choose(menu,ctx={}){const list=channels(ctx.userId).filter(ch=>id(ch)).slice(0,12);const rows=list.map((ch,i)=>[btn(menu,`${i+1}. ${short(title(ch))}`,'admin_stats_campaign_channel',{channelId:id(ch)})]);rows.push([btn(menu,'➕ Другой канал по ссылке','admin_stats_campaign_external')],...footer(menu));return screen(menu,'stats_campaign_choose_channel_posts_backed','📣 Создание рекламной ссылки',list.length?['Выберите канал, куда должна вести реклама.','','Список строится из каналов, где у бота уже есть сохранённые посты.','Если нужного канала нет — выберите «Другой канал по ссылке».']:['Пока нет каналов с сохранёнными постами.','Добавьте бота в канал и опубликуйте/перешлите пост, либо выберите «Другой канал по ссылке».'],rows);}
function denied(menu){return screen(menu,'stats_campaign_channel_not_found','📣 Создание рекламной ссылки',['Канал не найден в текущем списке.','Выберите канал заново или используйте «Другой канал по ссылке».'],[[btn(menu,'📺 Выбрать канал','admin_stats_campaign_create')],[btn(menu,'➕ Другой канал по ссылке','admin_stats_campaign_external')],...footer(menu)]);}
function install(){const statsFlow=require('./stats-flow-cc8');const ads=require('./services/adCampaignService');if(statsFlow.__adminkitStrictAdChannelPickerInstalled)return{ok:true,already:true,runtimeVersion:RUNTIME};const old=statsFlow.screenForPayload;const oldSelf=ads.selftest;statsFlow.screenForPayload=async function(menu,payload={},ctx={}){const a=clean(payload.action);if(a==='admin_stats_campaign_create')return choose(menu,ctx);if(a==='admin_stats_campaign_channel'&&!channels(ctx.userId).some(ch=>id(ch)===clean(payload.channelId)))return denied(menu);return old(menu,payload,ctx);};ads.selftest=function(config={}){const base=oldSelf?oldSelf(config):{ok:true};const list=channels('');return{...base,runtimeVersion:RUNTIME,adsPostsBackedChannelPicker:true,eligibleAdChannels:list.map(ch=>({channelId:id(ch),title:title(ch)})),noAdminUsersInAdChannelPicker:true};};statsFlow.__adminkitStrictAdChannelPickerInstalled=true;return{ok:true,runtimeVersion:RUNTIME,adsPostsBackedChannelPicker:true};}
module.exports={RUNTIME,install};
