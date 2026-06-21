'use strict';
const assert=require('assert');
const menu=require('../v3-menu-core-1539');
const statsFlow=require('../stats-flow-cc8');
const statsData=require('../services/statsProductPerfectPr226');
const targets=require('../services/statsTargetsService');
const store=require('../store');
function btns(s){return (s.attachments||[]).filter(a=>a.type==='inline_keyboard').flatMap(a=>a.payload.buttons||[]).flatMap(r=>r).map(b=>({text:b.text,payload:JSON.parse(b.payload||'{}')}));}
function noTech(s){assert(!/channelId|chatId|targetId|commentKey|postId/.test(s.text),'technical id visible');}
async function render(action,scope={},ctx={userId:'u-pr229',config:{chats:[{chatId:'chat1',title:'Чат один',userId:'u-pr229'},{chatId:'chat2',title:'Чат два',userId:'u-pr229'}]}}){return statsFlow.screenForPayload(menu,{action,...scope},ctx);}
(async()=>{
 statsData.resetStatsStateForTests();
 store.saveChannel('chan1',{title:'Канал один',userId:'u-pr229'}); store.saveChannel('chan2',{title:'Канал два',userId:'u-pr229'});
 let root=await render('admin_section_stats'); assert(/stats_scope_selector_pr229|stats_home_pr229/.test(root.id),'root selector/home');
 const empty=await statsFlow.screenForPayload(menu,{action:'admin_section_stats'},{userId:'none-pr229',config:{statsTargetsOverride:{channels:[],chats:[]}}}); assert.equal(empty.id,'stats_scope_empty_pr229');
 const t=targets.listStatsTargetsForUser('u-pr229',{chats:[{chatId:'chat1',title:'Чат один',userId:'u-pr229'}]}); assert(t.channels.length>=2); assert(t.chats.length===1); assert(t.diagnostics.chatProviderAvailable===true);
 const channel={targetKind:'channel',targetId:'chan1',channelId:'chan1'}; const channel2={targetKind:'channel',targetId:'chan2',channelId:'chan2'}; const chat={targetKind:'chat',targetId:'chat1',chatId:'chat1'}; const allc={targetKind:'all_channels',targetId:'all_channels'}; const allch={targetKind:'all_chats',targetId:'all_chats'};
 statsData.persistStatsEvent({...channel,tenantKey:'tenant_u-pr229',ownerUserId:'u-pr229',eventType:'member_joined',userId:'a'});
 statsData.persistStatsEvent({tenantKey:'tenant_u-pr229',ownerUserId:'u-pr229',channelId:'chan1',eventType:'member_joined',userId:'legacy-channel'});
 statsData.persistStatsEvent({...chat,tenantKey:'tenant_u-pr229',ownerUserId:'u-pr229',eventType:'member_joined',userId:'b'});
 assert.equal(statsData.loadStatsDataset({userId:'u-pr229',...channel},{period:'all'}).growth.joined,2);
 assert.equal(statsData.loadStatsDataset({userId:'u-pr229',...chat},{period:'all'}).growth.joined,1);
 assert.equal(statsData.loadStatsDataset({userId:'u-pr229',...allc},{period:'all'}).growth.joined,2);
 assert.equal(statsData.loadStatsDataset({userId:'u-pr229',...allch},{period:'all'}).growth.joined,1);
 const cost=statsData.writeManualCost({userId:'u-pr229',...channel},{source:'s',campaign:'c',amount:10},'added'); assert(statsData.getManualCosts({userId:'u-pr229',...channel},{period:'all'}).length===1); assert(statsData.getManualCosts({userId:'u-pr229',...channel2},{period:'all'}).length===0); assert(statsData.getManualCosts({userId:'u-pr229',...chat},{period:'all'}).length===0); assert(statsData.writeManualCost({userId:'u-pr229',...channel},{costId:cost.costId},'deleted')); const allCost=statsData.writeManualCost({userId:'u-pr229',...allc},{source:'all',campaign:'all',amount:30},'added'); assert(allCost&&allCost.costId); assert(statsData.getManualCosts({userId:'u-pr229',...allc},{period:'all'}).some(x=>x.costId===allCost.costId));
 for (const scope of [channel,chat,allc,allch]) for (const action of ['admin_stats_scope_select','admin_stats_growth','admin_stats_sources','admin_stats_funnel','admin_stats_content','admin_stats_quality','admin_stats_export']){const s=await render(action,scope); assert(s&&s.id,action); noTech(s); const bs=btns(s); assert(bs.every(b=>b.payload.action),'routable'); assert(bs.every(b=>/admin_section_main|ad_links:home|ads:home|admin_section_stats|comments_select_post/.test(b.payload.action)||b.payload.targetKind),'scope propagation');}
 const sources=await render('admin_stats_sources',channel); const labels=btns(sources).map(b=>b.text); ['Все ссылки','Создать ссылку','Создать первую ссылку','Создать ещё ссылку','Отключить ссылку','Карточка рекламной ссылки'].forEach(x=>assert(!labels.includes(x),x)); assert(labels.some(x=>/Рекламные ссылки/.test(x))); assert(btns(sources).some(b=>b.payload.action==='ad_links:home'||b.payload.action==='ads:home'));
 const growth=await render('admin_stats_growth',channel); assert(/Текущее количество подписчиков: недоступно через текущий MAX API/.test(growth.text)); assert(!/Итог: \+0/.test(growth.text));
 const chatContent=await render('admin_stats_content',chat); assert(/Активность/.test(chatContent.text)); assert(!btns(chatContent).some(b=>/Лучшие посты|низкой активностью|выбранного поста/.test(b.text)));
 const main=menu.mainScreen(); const stat=btns(main).find(b=>/Статистика/.test(b.text)); const prod=await statsFlow.screenForPayload(menu,{action:stat.payload.action==='stats:home'?'admin_section_stats':stat.payload.action},{userId:'u-pr229',config:{}}); assert(/pr229/.test(prod.id),'production callback routing');
 const live=await require('../stats-scope-buttons-live-pr229').runLive(); assert(live.ok); console.log('PR229 stats scope/buttons contract OK', JSON.stringify({screen:prod.id, endpoint:'/debug/stats-scope-buttons-live'}));
})().catch(e=>{console.error(e);process.exit(1);});
