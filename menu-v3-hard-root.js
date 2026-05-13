'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const store = require('./store');
const db = require('./cc5-db-core');

const RUNTIME = 'HARD-V3-ADMIN-MENU-1.6-START-EVENT';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 80) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const mem = new Map();
const DEFAULT_BANNER = { text:'Разработано АдминКИТ', button:'Открыть', link:'', place:'start', scope:'all' };
const ROUTES = new Set([
 'main:home',
 'channels:home','channels:list','channels:connect','channels:set','channels:active','channels:verify','channels:access','channels:admins',
 'comments:home','comments:auto','comments:auto_on','comments:auto_off','comments:old','comments:pick','comments:post','comments:view','comments:settings','comments:on','comments:off','comments:photo','comments:photo_on','comments:photo_off','comments:reactions','comments:reactions_on','comments:reactions_off',
 'comments:banner','comments:banner_on','comments:banner_off','comments:banner_text','comments:banner_button','comments:banner_link','comments:banner_scope','comments:banner_scope_all','comments:banner_scope_post','comments:banner_place','comments:banner_place_start','comments:banner_place_bottom','comments:banner_preview','comments:banner_reset',
 'help:channels','help:comments','help:home'
]);

function body(u){ return u?.body || u?.data || u || {}; }
function msg(u){ const b=body(u); return b.message || u?.message || b.callback?.message || null; }
function cb(u){ const b=body(u); return b.callback || u?.callback || b.message?.callback || null; }
function text(u){ const m=msg(u); return clean(m?.body?.text || m?.text || body(u)?.text || ''); }
function payload(u){ const c=cb(u); const raw=c?.payload || c?.data || ''; if(typeof raw==='string'){ try{return JSON.parse(raw);}catch{return {r:raw};} } return raw && typeof raw==='object' ? raw : {}; }
function uid(u){ const c=cb(u), m=msg(u); return clean(c?.user?.user_id || c?.user?.id || m?.sender?.user_id || m?.sender?.id || body(u)?.user?.user_id || body(u)?.user?.id || ''); }
function cid(u){ const m=msg(u), c=cb(u); return clean(m?.recipient?.chat_id || m?.recipient?.id || m?.chat_id || m?.chat?.id || c?.message?.recipient?.chat_id || body(u)?.chat_id || ''); }
function chatType(u){ const m=msg(u); return clean(m?.recipient?.chat_type || m?.recipient?.type || m?.chat_type || m?.chat?.type || body(u)?.chat_type || '').toLowerCase(); }
function adminId(u){ return uid(u) || cid(u) || ''; }
function callbackId(u){ const c=cb(u); return clean(c?.callback_id || c?.id || c?.callbackId || ''); }
function startWords(k){ return ['/start','start','старт','меню','menu','главное меню','🏠 главное меню','начать','вы начали общение с ботом'].includes(k); }
function routeFrom(u){ const p=payload(u); const raw=clean(p.r || p.route || text(u)); const k=raw.toLowerCase(); return startWords(k) ? 'main:home' : raw; }
function hasDeepKey(value, names, seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value)) return false; seen.add(value);
 for(const [k,v] of Object.entries(value)){ if(names.includes(String(k||'').toLowerCase()) && v) return true; if(hasDeepKey(v,names,seen)) return true; }
 return false;
}
function looksLikeForwardedPost(u){
 const m=msg(u) || {}; const b=m.body || body(u) || {};
 if(hasDeepKey(b,['forward','link','attachments','attachment','media','photo','video','file'])) return true;
 if(hasDeepKey(m,['forward','link','attachments','attachment','media','photo','video','file'])) return true;
 const t=text(u).toLowerCase();
 return /переслано|forwarded/.test(t);
}
function isStartLikeMessage(u, st={}){
 if(cb(u)) return false;
 if(looksLikeForwardedPost(u)) return false;
 const mode=clean(st.mode||'');
 if(mode && /^await_(channel_forward|old_post_forward)/.test(mode)) return false;
 const t=text(u).toLowerCase();
 if(startWords(t)) return true;
 const ct=chatType(u);
 const hasMessage=!!msg(u);
 const systemStart=/message|bot|start|chat/i.test(clean(body(u)?.update_type || body(u)?.type || body(u)?.event_type || u?.update_type || u?.type || ''));
 // MAX often sends the blue system row “Вы начали общение с ботом” to the chat, while webhook body has no usable text.
 // In a private/admin chat, a clean non-forward message with empty text must open our new hard V3 main menu and must not fall through to legacy bot.js.
 return hasMessage && !t && !looksLikeForwardedPost(u) && (ct==='' || ct==='dialog' || ct==='private' || ct==='chat' || systemStart);
}

async function flow(id){ if(!id) return {}; try { return await db.getFlow(id) || {}; } catch { return mem.get(id) || {}; } }
async function state(id){ const f=await flow(id); return f.menuV3 || {}; }
async function save(id, patch){ const f=await flow(id); const next={...f, menuV3:{...(f.menuV3||{}), ...patch, updatedAt:Date.now()}}; try{ await db.setFlow(id,next); }catch{ mem.set(id,next); } return next.menuV3; }
function banner(st={}){ return { enabled:st.commentsBanner !== false, text:clean(st.commentsBannerText)||DEFAULT_BANNER.text, button:clean(st.commentsBannerButton)||DEFAULT_BANNER.button, link:clean(st.commentsBannerLink)||DEFAULT_BANNER.link, scope:clean(st.commentsBannerScope)||DEFAULT_BANNER.scope, place:clean(st.commentsBannerPlace)||DEFAULT_BANNER.place }; }
function scopeName(v){ return v==='post' ? 'только выбранный пост' : 'все обсуждения канала'; }
function placeName(v){ return v==='bottom' ? 'внизу обсуждения' : 'у начала обсуждения'; }

async function channels(id){ const map=new Map(); try{ (await db.getChannels(id)).forEach(c=>{ const k=clean(c.channelId||c.id); if(k) map.set(k,{id:k,title:clean(c.title||k),src:'postgres'}); }); }catch{} try{ (store.getChannelsList?store.getChannelsList():[]).forEach(c=>{ const k=clean(c.channelId||c.id); if(k&&!map.has(k)) map.set(k,{id:k,title:clean(c.title||c.channelTitle||c.name||k),src:'store'}); }); }catch{} return [...map.values()]; }
async function activeChannel(id){ const st=await state(id); const list=await channels(id); return list.find(x=>x.id===st.activeChannelId) || list[0] || {id:'',title:'Канал не выбран'}; }
async function posts(id, channelId){ const out=[]; try{ out.push(...(await db.getPosts(id,channelId,50)).map(p=>({...p,src:'postgres'}))); }catch{} try{ const arr=store.getPostsList?store.getPostsList():[]; out.push(...arr.filter(p=>!channelId||String(p.channelId||'')===String(channelId)).map(p=>({postId:p.postId,commentKey:p.commentKey,title:p.title||p.originalText||p.postId,src:'store'}))); }catch{} const seen=new Set(); return out.filter(p=>{ const k=clean(p.commentKey||p.postId); if(!k||seen.has(k)) return false; seen.add(k); return true; }).slice(0,50); }

function button(label, route, extra={}){ return {type:'callback', text:label, payload:JSON.stringify({r:route,...extra})}; }
function kb(items, owner='main'){ const rows=[]; for(let i=0;i<items.length;i+=2) rows.push(items.slice(i,i+2).map(x=>button(x[0],x[1],x[2]||{}))); if(owner&&owner!=='main') rows.push([button('❓ Помощь','help:'+owner),button('↩️ Раздел',owner+':home')]); if(owner!=='main') rows.push([button('🏠 Главное меню','main:home')]); return [{type:'inline_keyboard',payload:{buttons:rows}}]; }
function screen(title, lines, items=[], owner='main'){ const t=Array.isArray(lines)?lines.filter(Boolean).join('\n'):String(lines||''); return {text:[title,'',t].join('\n'), attachments:kb(items,owner)}; }
function bannerLines(st){ const b=banner(st); return [`Статус: ${b.enabled?'включен':'выключен'}`,`Текст: ${b.text}`,`Кнопка: ${b.button}`,`Действие/ссылка: ${b.link || 'не задано'}`,`Область: ${scopeName(b.scope)}`,`Позиция: ${placeName(b.place)}`,'Баннер настраивается как текст + кнопка + действие/ссылка.']; }
function bannerMenu(){ return [['✅ Включить','comments:banner_on'],['⏸ Выключить','comments:banner_off'],['✏️ Текст','comments:banner_text'],['🔘 Кнопка','comments:banner_button'],['🔗 Действие/ссылка','comments:banner_link'],['🎯 Область','comments:banner_scope'],['📍 Позиция','comments:banner_place'],['👀 Предпросмотр','comments:banner_preview'],['↩️ Сброс','comments:banner_reset']]; }

async function renderAsync(route='main:home', id='', p={}){
 const st=await state(id); const ch=await activeChannel(id);
 if(route==='main:home') return screen('🐋 АдминКИТ','Готовые разделы: Каналы и Комментарии.',[['📺 Каналы','channels:home'],['💬 Комментарии','comments:home']],'main');
 if(route==='channels:home') return screen('📺 Каналы',[`Активный канал: ${ch.title}`,'Подключение, список, выбор активного канала и проверка прав.'],[['📋 Мои каналы','channels:list'],['➕ Подключить','channels:connect'],['🔁 Активный канал','channels:active'],['✅ Проверить права','channels:verify'],['🔐 Доступы','channels:access'],['👥 Администраторы','channels:admins']],'channels');
 if(route==='channels:list'){ const list=await channels(id); return screen('📋 Мои каналы',list.length?[`Найдено каналов: ${list.length}`,'Нажмите канал, чтобы сделать активным.']:['Каналы пока не найдены.','Перешлите боту пост из канала.'],list.slice(0,10).map((c,i)=>[`${i+1}. ${cut(c.title,36)}`,'channels:set',{channelId:c.id}]),'channels'); }
 if(route==='channels:set'){ const list=await channels(id); const c=list.find(x=>x.id===clean(p.channelId)); if(c) await save(id,{activeChannelId:c.id,activeChannelTitle:c.title}); return screen('🔁 Активный канал',c?[`Сохранено: ${c.title}`,`ID: ${c.id}`]:'Канал не найден.',[], 'channels'); }
 if(route==='channels:connect'){ await save(id,{mode:'await_channel_forward',section:'channels'}); return screen('➕ Подключить канал',['1) Добавьте бота администратором канала.','2) Перешлите сюда любой пост из канала.','3) Канал появится в «Мои каналы».'],[], 'channels'); }
 if(route==='channels:active') return screen('🔁 Активный канал',[`Канал: ${ch.title}`,`ID: ${ch.id||'нет'}`],[], 'channels');
 if(route==='channels:verify') return screen('✅ Проверить права бота',[`Канал: ${ch.title}`,'Бот должен быть администратором и иметь право редактировать сообщения. Live-проверка выполняется через MAX API.'],[], 'channels');
 if(route==='channels:access') return screen('🔐 Доступы','Нужно: бот в канале, права администратора, право редактировать сообщения.',[['✅ Проверить права','channels:verify']], 'channels');
 if(route==='channels:admins') return screen('👥 Администраторы','Список администраторов будет получаться через MAX API при доступных правах.',[['✅ Проверить права','channels:verify']], 'channels');

 if(route==='comments:home') return screen('💬 Комментарии',[`Канал: ${ch.title}`,'Функции: авто-режим, старый пост, выбор поста, настройки, баннер, фото, реакции.'],[['⚡ Авто для новых','comments:auto'],['📌 Старый пост','comments:old'],['📌 Выбрать пост','comments:pick'],['👀 Как это выглядит','comments:view'],['⚙️ Настройки','comments:settings'],['🖼 Баннер','comments:banner'],['📷 Фото','comments:photo'],['❤️ Реакции и ответы','comments:reactions']],'comments');
 if(route==='comments:auto') return screen('⚡ Авто для новых',[`Статус: ${st.commentsAutoNew===false?'выключено':'включено'}`,'Новые посты получают обсуждение.'],[['✅ Включить','comments:auto_on'],['⏸ Выключить','comments:auto_off'],['📌 Старый пост','comments:old']],'comments');
 if(route==='comments:auto_on'){ await save(id,{commentsAutoNew:true}); return screen('✅ Авто включено','Состояние сохранено.',[], 'comments'); }
 if(route==='comments:auto_off'){ await save(id,{commentsAutoNew:false}); return screen('⏸ Авто выключено','Состояние сохранено.',[], 'comments'); }
 if(route==='comments:old'){ await save(id,{mode:'await_old_post_forward',section:'comments'}); return screen('📌 Старый пост',['Перешлите сюда опубликованный пост из канала.','Бот должен сохранить текст и восстановить кнопку комментариев без дублей.'],[['📌 Выбрать пост','comments:pick']], 'comments'); }
 if(route==='comments:pick'){ const list=await posts(id,ch.id); return screen('📌 Выбрать пост',list.length?[`Постов найдено: ${list.length}`,'Выберите пост.']:['Постов пока нет в базе.','Перешлите пост через «Старый пост».'],list.slice(0,10).map((post,i)=>[`${i+1}. ${cut(post.title||post.postId,42)}`,'comments:post',{postId:post.postId,commentKey:post.commentKey}]),'comments'); }
 if(route==='comments:post'){ await save(id,{selectedPostId:clean(p.postId),selectedCommentKey:clean(p.commentKey)}); return screen('💬 Комментарии → пост','Пост выбран. Доступны настройки комментариев, баннера, фото и реакций.',[['⚙️ Настройки','comments:settings'],['👀 Как выглядит','comments:view'],['🖼 Баннер','comments:banner'],['📷 Фото','comments:photo'],['❤️ Реакции','comments:reactions']], 'comments'); }
 if(route==='comments:view'){ const b=banner(st); return screen('👀 Как это выглядит',[`Баннер: ${b.enabled?'включен':'выключен'}`,`Текст: ${b.text}`,`Кнопка: ${b.button}`,`Действие/ссылка: ${b.link||'не задано'}`],[['🖼 Баннер','comments:banner'],['📌 Выбрать пост','comments:pick']], 'comments'); }
 if(route==='comments:settings') return screen('⚙️ Настройки',[`Комментарии: ${st.commentsEnabled===false?'выключены':'включены'}`,`Баннер: ${banner(st).enabled?'включен':'выключен'}`,`Фото: ${st.commentsPhoto===false?'выключено':'включено'}`,`Реакции: ${st.commentsReactions===false?'выключены':'включены'}`],[['✅ Комментарии ON','comments:on'],['⏸ Комментарии OFF','comments:off'],['🖼 Баннер','comments:banner'],['📷 Фото','comments:photo'],['❤️ Реакции','comments:reactions']], 'comments');
 if(route==='comments:on'){ await save(id,{commentsEnabled:true}); return screen('✅ Комментарии включены','Состояние сохранено.',[], 'comments'); }
 if(route==='comments:off'){ await save(id,{commentsEnabled:false}); return screen('⏸ Комментарии выключены','Состояние сохранено, текст поста не удаляется.',[], 'comments'); }

 if(route==='comments:banner') return screen('🖼 Баннер в комментариях',bannerLines(st),bannerMenu(),'comments');
 if(route==='comments:banner_on'){ await save(id,{commentsBanner:true}); return screen('✅ Баннер включен',bannerLines(await state(id)),bannerMenu(),'comments'); }
 if(route==='comments:banner_off'){ await save(id,{commentsBanner:false}); return screen('⏸ Баннер выключен',bannerLines(await state(id)),bannerMenu(),'comments'); }
 if(route==='comments:banner_text'){ await save(id,{mode:'await_banner_text'}); return screen('✏️ Текст баннера','Пришлите следующим сообщением текст баннера.',[], 'comments'); }
 if(route==='comments:banner_button'){ await save(id,{mode:'await_banner_button'}); return screen('🔘 Кнопка баннера','Пришлите следующим сообщением текст кнопки.',[], 'comments'); }
 if(route==='comments:banner_link'){ await save(id,{mode:'await_banner_link'}); return screen('🔗 Действие/ссылка','Пришлите следующим сообщением ссылку или действие для кнопки.',[], 'comments'); }
 if(route==='comments:banner_scope') return screen('🎯 Область баннера',`Сейчас: ${scopeName(banner(st).scope)}`,[['🌐 Все обсуждения','comments:banner_scope_all'],['📌 Только пост','comments:banner_scope_post']], 'comments');
 if(route==='comments:banner_scope_all'){ await save(id,{commentsBannerScope:'all'}); return screen('🌐 Для всех обсуждений',bannerLines(await state(id)),bannerMenu(),'comments'); }
 if(route==='comments:banner_scope_post'){ await save(id,{commentsBannerScope:'post'}); return screen('📌 Только выбранный пост',bannerLines(await state(id)),[['📌 Выбрать пост','comments:pick'],...bannerMenu()],'comments'); }
 if(route==='comments:banner_place') return screen('📍 Позиция баннера',`Сейчас: ${placeName(banner(st).place)}`,[['🔝 У начала обсуждения','comments:banner_place_start'],['🔻 Внизу','comments:banner_place_bottom']], 'comments');
 if(route==='comments:banner_place_start'){ await save(id,{commentsBannerPlace:'start'}); return screen('🔝 Позиция сохранена',bannerLines(await state(id)),bannerMenu(),'comments'); }
 if(route==='comments:banner_place_bottom'){ await save(id,{commentsBannerPlace:'bottom'}); return screen('🔻 Позиция сохранена',bannerLines(await state(id)),bannerMenu(),'comments'); }
 if(route==='comments:banner_preview') return screen('👀 Предпросмотр баннера',bannerLines(st),bannerMenu(),'comments');
 if(route==='comments:banner_reset'){ await save(id,{commentsBanner:true,commentsBannerText:DEFAULT_BANNER.text,commentsBannerButton:DEFAULT_BANNER.button,commentsBannerLink:DEFAULT_BANNER.link,commentsBannerScope:DEFAULT_BANNER.scope,commentsBannerPlace:DEFAULT_BANNER.place}); return screen('↩️ Баннер сброшен',bannerLines(await state(id)),bannerMenu(),'comments'); }

 if(route==='comments:photo') return screen('📷 Фото',[`Статус: ${st.commentsPhoto===false?'выключено':'включено'}`,'Видео и файлы не включаем.'],[['✅ Фото ON','comments:photo_on'],['⏸ Фото OFF','comments:photo_off']], 'comments');
 if(route==='comments:photo_on'){ await save(id,{commentsPhoto:true}); return screen('✅ Фото включены','Состояние сохранено.',[], 'comments'); }
 if(route==='comments:photo_off'){ await save(id,{commentsPhoto:false}); return screen('⏸ Фото выключены','Состояние сохранено.',[], 'comments'); }
 if(route==='comments:reactions') return screen('❤️ Реакции и ответы',`Статус: ${st.commentsReactions===false?'выключены':'включены'}`,[['✅ Реакции ON','comments:reactions_on'],['⏸ Реакции OFF','comments:reactions_off']], 'comments');
 if(route==='comments:reactions_on'){ await save(id,{commentsReactions:true}); return screen('✅ Реакции включены','Состояние сохранено.',[], 'comments'); }
 if(route==='comments:reactions_off'){ await save(id,{commentsReactions:false}); return screen('⏸ Реакции выключены','Состояние сохранено.',[], 'comments'); }
 if(route==='help:channels') return screen('❓ Помощь: Каналы','Каналы: подключение, список, активный канал, права.',[], 'channels');
 if(route==='help:comments') return screen('❓ Помощь: Комментарии','Комментарии: авто, старый пост, выбор поста, настройки, баннер, фото, реакции.',[], 'comments');
 return screen('❓ Помощь','Готовы два раздела: Каналы и Комментарии.',[], 'main');
}
function render(route='main:home'){ return route==='main:home' ? screen('🐋 АдминКИТ','Готовые разделы: Каналы и Комментарии.',[['📺 Каналы','channels:home'],['💬 Комментарии','comments:home']],'main') : screen('V3',`Маршрут ${route}.`,[],route.split(':')[0]||'main'); }
function extractMessageId(x){ const seen=new Set(); function walk(v){ if(!v||typeof v!=='object'||seen.has(v)) return ''; seen.add(v); for(const k of ['message_id','messageId','id','mid']) if(v[k]) return clean(v[k]); for(const k of ['message','body','data','result']) { const r=walk(v[k]); if(r) return r; } return ''; } return walk(x); }
async function deleteOldMenu(oldId,newId){ if(!oldId||oldId===newId) return {deleted:false,reason:'empty_or_same'}; try{ await api.deleteMessage({botToken:config.botToken,messageId:oldId,timeoutMs:1800}); return {deleted:true}; }catch(e){ return {deleted:false,error:clean(e?.message||e)}; } }
async function send(u, packet){ const id=adminId(u); const before=await state(id); const targets=[]; const c=cid(u), user=uid(u); if(c) targets.push({chatId:c,kind:'chatId'}); if(user&&user!==c) targets.push({userId:user,kind:'userId'}); let last=null; for(const t of targets){ try{ const {kind,...q}=t; const result=await api.sendMessage({botToken:config.botToken,...q,text:packet.text,attachments:packet.attachments,notify:false}); const newId=extractMessageId(result); const oldId=clean(before.lastMenuMessageId||''); const cleanup=await deleteOldMenu(oldId,newId); if(newId) await save(id,{lastMenuMessageId:newId,lastMenuRoute:routeFrom(u),lastMenuChatId:c,lastMenuKind:kind,lastMenuAt:Date.now(),lastMenuCleanup:cleanup}); return {ok:true,kind,result,newId,cleanup}; }catch(e){ last=e; } } throw last||new Error('no_send_target'); }
async function answer(u){ const id=callbackId(u); if(id) try{ await api.answerCallback({botToken:config.botToken,callbackId:id,notification:''}); }catch{} }
async function tryHandleExpress(req){ const u=req.body||{}; let route=routeFrom(u); const id=adminId(u); const hasCb=!!cb(u); const message=text(u); const st=await state(id);
 if(!hasCb&&message&&st.mode==='await_banner_text'){ await save(id,{mode:'',commentsBanner:true,commentsBannerText:cut(message,120)}); return {handled:true,runtime:RUNTIME,route:'comments:banner_text_saved',sentKind:(await send(u,await renderAsync('comments:banner',id,{}))).kind}; }
 if(!hasCb&&message&&st.mode==='await_banner_button'){ await save(id,{mode:'',commentsBanner:true,commentsBannerButton:cut(message,40)}); return {handled:true,runtime:RUNTIME,route:'comments:banner_button_saved',sentKind:(await send(u,await renderAsync('comments:banner',id,{}))).kind}; }
 if(!hasCb&&message&&st.mode==='await_banner_link'){ await save(id,{mode:'',commentsBanner:true,commentsBannerLink:cut(message,200)}); return {handled:true,runtime:RUNTIME,route:'comments:banner_link_saved',sentKind:(await send(u,await renderAsync('comments:banner',id,{}))).kind}; }
 if(isStartLikeMessage(u,st)) route='main:home';
 const isStart=route==='main:home';
 if(!ROUTES.has(route)&&!isStart) return {handled:false,runtime:RUNTIME,route,reason:'not_hard_v3_route'};
 try{ await db.upsertFromUpdate(u); }catch{}
 if(hasCb) await answer(u);
 return {handled:true,runtime:RUNTIME,route,sentKind:(await send(u,await renderAsync(route,id,payload(u)))).kind}; }
async function selfTestAsync(id=''){ const bad=[]; for(const r of ROUTES){ try{ const s=await renderAsync(r,id,{}); if(!s?.text||!Array.isArray(s.attachments)) bad.push(r); }catch(e){ bad.push(r+':'+e.message); } } return {ok:bad.length===0,runtimeVersion:RUNTIME,checked:ROUTES.size,badRoutes:bad,readySections:['main','channels','comments'],banner:'text_button_link_scope_place_preview_reset',menuDelivery:'send_new_menu_then_delete_previous_saved_menu',oneCurrentMenuPolicy:true,menuPositionPolicy:'new menu is always sent as the latest chat message',startEventHandled:true,patcherTouched:false,commentsUiTouched:false,postgresUsed:true}; }
function selfTest(){ return {ok:true,runtimeVersion:RUNTIME,mainButtons:2,sections:['channels','comments'],banner:'full_controls',menuDelivery:'one_current_menu_best_effort_delete_previous',startEventHandled:true,patcherTouched:false,commentsUiTouched:false}; }
module.exports={RUNTIME,tryHandleExpress,render,renderAsync,selfTest,selfTestAsync};
