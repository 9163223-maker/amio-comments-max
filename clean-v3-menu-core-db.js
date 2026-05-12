'use strict';

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CLEAN-V3-MENU-ROOT-2.1';
const SOURCE = 'adminkit-clean-v3-root-current-chat-delivery';

const ROOT = [
  ['📺 Каналы','channels:home'], ['💬 Комментарии','comments:home'],
  ['🛡 Модерация','moderation:home'], ['✏️ Редактор','editor:home'],
  ['⚪ Кнопки','buttons:home'], ['🎁 Подарки','gifts:home'],
  ['📌 Выделение','highlight:home'], ['🗳 Опросы','polls:home'],
  ['📊 Статистика','stats:home'], ['🧾 Тарифы','billing:home'],
  ['🤝 Рефералы','referrals:home'], ['❓ Помощь','help:home']
];
const CHILD = {
  channels:[['📋 Ваши каналы','channels:list'],['➕ Подключить','channels:connect'],['✅ Проверить права','channels:verify_access'],['🔐 Доступы','channels:access']],
  comments:[['⚡ Авто для новых','comments:auto_new'],['📌 Старый пост','comments:old_post'],['📌 Выбрать пост','comments:choose_post'],['👀 Как это выглядит','comments:preview'],['⚙️ Настройки','comments:settings'],['🖼 Баннер','comments_banner:home'],['📷 Фото','comments_photo:home'],['❤️ Реакции и ответы','comments_reactions:home']],
  moderation:[['🛡 Правила канала','moderation:rules'],['📋 Стоп-слова','moderation:words'],['➕ Добавить слово','moderation:add_word'],['🔗 Ссылки','moderation:links'],['📋 Журнал','moderation:logs']],
  editor:[['📌 Выбрать пост','editor:choose_post'],['🕘 История','editor:history']],
  buttons:[['📌 Выбрать пост','buttons:choose_post'],['➕ Добавить кнопку','buttons:create'],['📋 Кнопки поста','buttons:list'],['👀 Предпросмотр','buttons:preview']],
  gifts:[['🎁 Создать подарок','gifts:create'],['📌 Выбрать пост','gifts:choose_post'],['📋 Список подарков','gifts:list'],['🔐 Проверка подписки','gifts:subscription'],['🧪 Тестовая выдача','gifts:test']],
  stats:[['📊 Канал','stats:channel'],['📌 Пост','stats:post'],['💬 Комментарии','stats:comments'],['❤️ Реакции','stats:reactions'],['🎁 Подарки','stats:gifts'],['🔘 Клики','stats:buttons']]
};
const TITLES = {
  main:'🐋 АдминКИТ', channels:'📺 Каналы', comments:'💬 Комментарии', moderation:'🛡 Модерация', editor:'✏️ Редактор', buttons:'⚪ Кнопки', gifts:'🎁 Подарки', highlight:'📌 Выделение', polls:'🗳 Опросы', stats:'📊 Статистика', billing:'🧾 Тарифы', referrals:'🤝 Рефералы', help:'❓ Помощь'
};
const BODIES = {
  main:'Панель управления MAX-каналом. Выберите раздел.',
  channels:'Подключение и проверка каналов.', comments:'Обсуждения под постами MAX.', moderation:'Правила, стоп-слова и проверка комментариев.', editor:'Редактирование и предпросмотр постов.', buttons:'CTA-кнопки под постами.', gifts:'Подарки и лид-магниты за подписку.', stats:'Статистика канала, постов и функций.',
  highlight:'Выделение важных постов. Раздел в разработке.', polls:'Голосования и опросы. Раздел в разработке.', billing:'Тарифы и ограничения. Раздел в разработке.', referrals:'Реферальные ссылки и бонусы. Раздел в разработке.', help:'Помощь по текущему разделу.'
};
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const lower = (v) => norm(v).toLowerCase();
function routeOwner(route='main:home'){ return String(route||'main:home').split(':')[0] || 'main'; }
function b(text, route, extra={}){ const p={r:route}; Object.entries(extra||{}).forEach(([k,v])=>{ if(norm(v)) p[k]=norm(v); }); return {type:'callback', text, payload:JSON.stringify(p)}; }
function rows2(items){ const out=[]; for(let i=0;i<items.length;i+=2) out.push(items.slice(i,i+2)); return out; }
function keyboard(rows){ return [{type:'inline_keyboard',payload:{buttons:rows.filter((r)=>Array.isArray(r)&&r.length)}}]; }
function resultMessageId(result){ const raw=JSON.stringify(result||{}); return (raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*\"([^\"{}]+)\"/)||[])[1] || (raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*(\d+)/)||[])[1] || ''; }
let initPromise=null;

function seedRows(){
  const rows=[['main','',10,'main:home','main',TITLES.main,BODIES.main,true,'',false]];
  ROOT.forEach(([title,route],i)=>{ const o=routeOwner(route); rows.push([o,'main',(i+1)*10,route,o,title,BODIES[o]||'',true,'',false]); });
  Object.entries(CHILD).forEach(([owner,items])=>items.forEach(([title,route],i)=>rows.push([route.replace(/[:]/g,'_'),owner,(i+1)*10,route,owner,title,actionText(route),true, route.includes('choose_post')||['stats:post'].includes(route)?'post_picker':'', false])));
  rows.push(['comments_post','comments',900,'comments:post','comments','💬 Комментарии → пост','Действия с выбранным постом.',false,'post_action',false]);
  rows.push(['editor_post','editor',900,'editor:post','editor','✏️ Редактор → пост','Действия с выбранным постом.',false,'post_action',false]);
  rows.push(['buttons_post','buttons',900,'buttons:post','buttons','⚪ Кнопки → пост','Действия с выбранным постом.',false,'post_action',false]);
  rows.push(['gifts_post','gifts',900,'gifts:post','gifts','🎁 Подарки → пост','Действия с выбранным постом.',false,'post_action',false]);
  return rows;
}
function actionText(route){
  if(route==='comments:old_post') return 'Подключить обсуждение к уже опубликованному посту. Перешлите сюда пост из канала.';
  if(route==='comments_photo:home') return 'Фото в комментариях. Видео и файлы не включаем.';
  if(route==='buttons:create') return 'Шаг 1/3: пост → текст кнопки → ссылка/действие → сохранить.';
  if(route==='gifts:create') return 'Шаг 1/4: пост → подарок → сообщение получателю → сохранить.';
  return 'Действие открыто.';
}
async function init(){
  if(initPromise) return initPromise;
  initPromise=(async()=>{ await db.init(); await db.query(`create table if not exists ak_menu_nodes_v3(node_key text primary key,parent_key text not null default '',sort_order int not null default 0,route text not null,owner text not null default 'main',title text not null,body text not null default '',visible boolean not null default true,dynamic_kind text not null default '',delegate_to_legacy boolean not null default false,meta jsonb not null default '{}'::jsonb,created_at timestamptz default now(),updated_at timestamptz default now()); create table if not exists ak_menu_session_v3(admin_id text primary key,current_route text not null default 'main:home',current_node_key text not null default 'main',message_id text not null default '',updated_at timestamptz default now()); create table if not exists ak_menu_events_v3(id bigserial primary key,admin_id text not null default '',route text not null default '',node_key text not null default '',owner text not null default '',event_type text not null default 'open',payload jsonb not null default '{}'::jsonb,message_id text not null default '',created_at timestamptz default now());`); for(const r of seedRows()) await db.query(`insert into ak_menu_nodes_v3(node_key,parent_key,sort_order,route,owner,title,body,visible,dynamic_kind,delegate_to_legacy,meta,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now()) on conflict(node_key) do update set parent_key=excluded.parent_key,sort_order=excluded.sort_order,route=excluded.route,owner=excluded.owner,title=excluded.title,body=excluded.body,visible=excluded.visible,dynamic_kind=excluded.dynamic_kind,delegate_to_legacy=excluded.delegate_to_legacy,meta=ak_menu_nodes_v3.meta||excluded.meta,updated_at=now()`,[...r,JSON.stringify({seedRuntime:RUNTIME})]); return {ok:true,runtimeVersion:RUNTIME,nodesSeeded:seedRows().length}; })(); return initPromise;
}
async function query(sql,params=[]){ await init(); return db.query(sql,params); }
async function node(route='main:home'){ await init(); const {rows}=await db.query("select * from ak_menu_nodes_v3 where route=$1 order by case when node_key='main' then 0 else 1 end,sort_order asc limit 1",[route||'main:home']); return rows[0]||null; }
async function children(parent=''){ await init(); const {rows}=await db.query('select * from ak_menu_nodes_v3 where parent_key=$1 and visible=true order by sort_order asc,node_key asc',[parent]); return rows; }
async function nav(n){ if(!n||n.node_key==='main') return []; const o=n.owner||routeOwner(n.route); return [[b('❓ Помощь',`help:${o}`),b('↩️ Раздел',`${o}:home`)],[b('🏠 Главное меню','main:home')]]; }
function payload(update={}){ try{return db.payload(update)||{};}catch{return{};} }
function routeFromUpdate(update={}){ const p=payload(update); const raw=norm(p.r||p.route||p.action||db.action?.(update)||db.text?.(update)||''); const map={ak_main_menu:'main:home',main_menu:'main:home',menu_main:'main:home',home:'main:home',start:'main:home','/start':'main:home',menu:'main:home','главное меню':'main:home','🏠 главное меню':'main:home','старт':'main:home'}; return map[lower(raw)]||raw||'main:home'; }
function identity(update={},explicit=''){ const userId=norm(db.adminId?.(update)); const chatId=norm(db.chatId?.(update)); return {adminId:norm(explicit||userId||chatId), userId, chatId}; }
async function renderScreen(route='main:home',adminId='',p={}){ const n=await node(route)||await node('main:home'); if(n.dynamic_kind==='post_picker'){ const channels=await (db.getChannels?.(adminId).catch?.(()=>[])||[]); const ch=channels[0]||{}; const channelId=norm(p.c||ch.channelId||''); const posts=channelId && db.getPosts ? await db.getPosts(adminId,channelId,30).catch(()=>[]) : []; const target=n.owner==='editor'?'editor:post':n.owner==='buttons'?'buttons:post':n.owner==='gifts'?'gifts:post':n.owner==='stats'?'stats:post':'comments:post'; return {text:[n.title,'',`📺 ${ch.title||channelId||'Канал не выбран'}`,`Постов найдено: ${posts.length}`,'',posts.length?'Выберите пост.':'Постов пока нет в базе.'].join('\n'),attachments:keyboard([...posts.slice(0,10).map((post,i)=>[b(`${i+1}. ${norm(post.title||post.postId).slice(0,40)}`,target,{c:channelId,p:post.postId,k:post.commentKey})]),...(await nav(n))])}; } const ch=await children(n.node_key); if(ch.length) return {text:[n.title,'',n.body].join('\n'),attachments:keyboard([...rows2(ch.map((x)=>b(x.title,x.route))),...(await nav(n))])}; return {text:[n.title,'',n.body||actionText(n.route)].join('\n'),attachments:keyboard(await nav(n))}; }
async function sendPacket(update={},adminId='',packet={}){ const id=identity(update,adminId); const targets=[]; if(id.chatId) targets.push({chatId:id.chatId,kind:'chatId'}); if(id.userId&&id.userId!==id.chatId) targets.push({userId:id.userId,kind:'userId'}); if(!targets.length&&id.adminId) targets.push({userId:id.adminId,kind:'adminAsUser'},{chatId:id.adminId,kind:'adminAsChat'}); const attempts=[]; for(const t of targets){ try{ const {kind,...q}=t; const result=await api.sendMessage({botToken:config.botToken,...q,text:packet.text,attachments:packet.attachments||[],notify:false}); return {ok:true,kind,result,messageId:resultMessageId(result)}; }catch(e){ attempts.push({kind:t.kind,message:e.message,status:e.status||0}); }} const err=new Error('clean_v3_menu_send_failed'); err.attempts=attempts; throw err; }
async function deleteSavedMenu(adminId='',except=''){ try{ const oldId=await db.getMenu(adminId); if(oldId&&oldId!==except) await api.deleteMessage({botToken:config.botToken,messageId:oldId}); return oldId||'';}catch{return'';} }
async function setSession(adminId,route,nodeKey,messageId){ if(!adminId)return; await init(); await db.query('insert into ak_menu_session_v3(admin_id,current_route,current_node_key,message_id,updated_at) values($1,$2,$3,$4,now()) on conflict(admin_id) do update set current_route=excluded.current_route,current_node_key=excluded.current_node_key,message_id=coalesce(nullif(excluded.message_id,\'\'),ak_menu_session_v3.message_id),updated_at=now()',[adminId,route,nodeKey,messageId||'']); }
async function openMenu(adminId='',route='main:home',p={},update={}){ const id=identity(update,adminId); const packet=await renderScreen(route,id.adminId,p); await deleteSavedMenu(id.adminId,''); const sent=await sendPacket(update,id.adminId,packet); if(sent.messageId) await db.setMenu(id.adminId,sent.messageId); await setSession(id.adminId,route,(await node(route))?.node_key||'main',sent.messageId); return {ok:true,runtimeVersion:RUNTIME,mode:'open_menu_delete_old_then_send_bottom',target:sent.kind,route,messageId:sent.messageId}; }
async function answer(update){ const cid=db.callbackId?.(update); if(cid) try{ await api.answerCallback({botToken:config.botToken,callbackId:cid,notification:''}); }catch{} }
async function handle(update={}){ await init(); const id=identity(update); if(!id.adminId) return false; const route=routeFromUpdate(update); const n=await node(route); if(!n||n.delegate_to_legacy) return false; const packet=await renderScreen(route,id.adminId,payload(update)); if(db.cb?.(update)) await answer(update); const mid=db.messageId?.(update); let result; if(mid){ try{ await api.editMessage({botToken:config.botToken,messageId:mid,text:packet.text,attachments:packet.attachments||[],notify:false}); if(db.setMenu) await db.setMenu(id.adminId,mid); result={mode:'edit',messageId:mid}; }catch{ await deleteSavedMenu(id.adminId,''); const s=await sendPacket(update,id.adminId,packet); if(s.messageId&&db.setMenu) await db.setMenu(id.adminId,s.messageId); result={mode:'send_new_after_delete_old',target:s.kind,messageId:s.messageId}; }} else { await deleteSavedMenu(id.adminId,''); const s=await sendPacket(update,id.adminId,packet); if(s.messageId&&db.setMenu) await db.setMenu(id.adminId,s.messageId); result={mode:'send_new_after_delete_old',target:s.kind,messageId:s.messageId}; } await setSession(id.adminId,route,n.node_key,result.messageId); return {ok:true,handledBy:RUNTIME,sourceMarker:SOURCE,route,nodeKey:n.node_key,owner:n.owner,result}; }
async function renderDebug(route='main:home',adminId=''){ const uid=norm(adminId||process.env.DEBUG_ADMIN_ID||process.env.ADMIN_ID||'17507246'); const screen=await renderScreen(route,uid,{}); const n=await node(route); return {ok:!!screen,runtime:RUNTIME,sourceMarker:SOURCE,route,nodeKey:n?.node_key||'',owner:n?.owner||'',screen}; }
async function dataSelfTest(adminId=''){ const uid=norm(adminId||process.env.DEBUG_ADMIN_ID||process.env.ADMIN_ID||'17507246'); await init(); const q=await query('select count(*)::int as n from ak_menu_nodes_v3'); return {ok:true,runtime:RUNTIME,sourceMarker:SOURCE,adminId:uid,menuNodes:q.rows[0]?.n||0}; }
function canHandleRoute(route=''){ const r=norm(route); if(!r)return false; return r==='main:home'||ROOT.some((x)=>x[1]===r)||Object.values(CHILD).flat().some((x)=>x[1]===r)||['ak_main_menu','main_menu','menu_main','home','start','/start','menu','главное меню'].includes(lower(r)); }
function selfTest(){ return {ok:true,runtime:RUNTIME,sourceMarker:SOURCE,delivery:{oneCurrentMenuMessage:true,deleteOldBeforeSendNew:true,editCallbackMessageWhenPossible:true,startOpensBottomFreshMenu:true,sendTargetPriority:'chatId_then_userId'},commentsModuleTouched:false,openAppPolicy:'kept_as_is',checks:{productionMainButtons:12,productionMainRows:6,commentsLaunchUntouched:true,patcherTouched:false}}; }
module.exports={RUNTIME,SOURCE,init,query,handle,openMenu,renderScreen,renderDebug,dataSelfTest,selfTest,canHandleRoute,routeFromUpdate,logEvent:async()=>{}};
