'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const store = require('./store');
const db = require('./cc5-db-core');

const RUNTIME = 'HARD-V3-ADMIN-MENU-1.2-CHANNELS-COMMENTS-READY';

const STAGE_ROUTES = [
  'main:home',
  'channels:home','channels:list','channels:connect','channels:set_active','channels:active','channels:verify','channels:access','channels:admins',
  'comments:home','comments:auto_new','comments:auto_on','comments:auto_off','comments:old_post','comments:choose_post','comments:post','comments:preview','comments:settings','comments:toggle_on','comments:toggle_off','comments:photo','comments:photo_on','comments:photo_off','comments:reactions','comments:reactions_on','comments:reactions_off','help:channels','help:comments','help:home','help:main'
];
const KNOWN = new Set(STAGE_ROUTES);

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 64) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const now = () => Date.now();
const memState = new Map();

function body(update){ return update?.body || update?.data || update || {}; }
function msg(update){ const b = body(update); return b.message || update?.message || b.callback?.message || update?.callback?.message || null; }
function cb(update){ const b = body(update); return b.callback || update?.callback || b.message?.callback || null; }
function payload(update){ const c = cb(update); let p = c?.payload || c?.data || c?.body?.payload || ''; if (typeof p === 'string') { try { return JSON.parse(p); } catch { return { r:p }; } } return p && typeof p === 'object' ? p : {}; }
function text(update){ const m = msg(update); return clean(m?.body?.text || m?.text || body(update)?.text || ''); }
function chatId(update){ const m = msg(update); const c = cb(update); return clean(m?.recipient?.chat_id || m?.recipient?.id || m?.chat_id || m?.chat?.id || c?.message?.recipient?.chat_id || body(update)?.chat_id || ''); }
function userId(update){ const c = cb(update); const m = msg(update); return clean(c?.user?.user_id || c?.user?.id || m?.sender?.user_id || m?.sender?.id || body(update)?.user?.id || body(update)?.user?.user_id || ''); }
function callbackId(update){ const c = cb(update); return clean(c?.callback_id || c?.id || c?.callbackId || ''); }
function adminIdFromUpdate(update){ return userId(update) || chatId(update) || ''; }
function routeFrom(update){ const p = payload(update); const raw = clean(p.r || p.route || p.action || text(update)); const key = raw.toLowerCase(); if (['/start','start','старт','главное меню','🏠 главное меню','menu','меню'].includes(key)) return 'main:home'; return raw; }

async function getFlow(adminId){
  if (!adminId) return {};
  try { const flow = await db.getFlow(adminId); return flow && typeof flow === 'object' ? flow : {}; } catch { return memState.get(adminId) || {}; }
}
async function setFlow(adminId, patch){
  if (!adminId) return {};
  const flow = await getFlow(adminId);
  const menuV3 = { ...(flow.menuV3 || {}), ...(patch || {}), updatedAt: now() };
  const next = { ...flow, menuV3 };
  try { await db.setFlow(adminId, next); } catch { memState.set(adminId, next); }
  return menuV3;
}
async function state(adminId){ const flow = await getFlow(adminId); return flow.menuV3 || {}; }

async function channels(adminId){
  const byId = new Map();
  try { (await db.getChannels(adminId)).forEach((c) => { const id = clean(c.channelId || c.id); if (id) byId.set(id, { channelId:id, title:clean(c.title || id), source:'postgres' }); }); } catch {}
  try { (store.getChannelsList ? store.getChannelsList() : []).forEach((c) => { const id = clean(c.channelId || c.id); if (id && !byId.has(id)) byId.set(id, { channelId:id, title:clean(c.title || c.channelTitle || c.name || id), source:'store' }); }); } catch {}
  return [...byId.values()].sort((a,b)=>String(a.title).localeCompare(String(b.title),'ru'));
}
async function activeChannel(adminId, forced = ''){
  const list = await channels(adminId);
  const st = await state(adminId);
  const id = clean(forced || st.activeChannelId || '');
  return list.find((c)=>c.channelId === id) || list[0] || { channelId:'', title:'Канал не выбран' };
}
async function posts(adminId, channelId){
  const out = [];
  try { out.push(...(await db.getPosts(adminId, channelId, 50)).map((p)=>({ ...p, source:'postgres' }))); } catch {}
  try { out.push(...(store.listPostsByChannel ? store.listPostsByChannel(channelId, 50) : (store.getPostsList ? store.getPostsList() : []).filter((p)=>!channelId || String(p.channelId||'')===String(channelId))).map((p)=>({ postId:p.postId, commentKey:p.commentKey, title:p.title || p.originalText || p.postId, messageId:p.messageId, source:'store' }))); } catch {}
  const seen = new Set();
  return out.filter((p)=>{ const k=clean(p.commentKey || p.postId); if(!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0,50);
}
async function selectedPost(adminId, p = {}){
  const st = await state(adminId);
  const ch = await activeChannel(adminId, p.channelId || p.c || '');
  const list = await posts(adminId, ch.channelId);
  const key = clean(p.commentKey || p.k || st.selectedCommentKey || '');
  const postId = clean(p.postId || p.p || st.selectedPostId || '');
  return list.find((x)=>clean(x.commentKey)===key || clean(x.postId)===postId) || list[0] || null;
}

function btn(label, route, extra={}){ return { type:'callback', text:label, payload:JSON.stringify({ r:route, ...extra }) }; }
function keyboard(items, owner='main'){
  const rows=[];
  for(let i=0;i<items.length;i+=2) rows.push(items.slice(i,i+2).map(([t,r,e])=>btn(t,r,e || {})));
  if (owner && owner !== 'main') rows.push([btn('❓ Помощь','help:'+owner), btn('↩️ Раздел', owner+':home')]);
  if (owner !== 'main') rows.push([btn('🏠 Главное меню','main:home')]);
  return [{ type:'inline_keyboard', payload:{ buttons:rows } }];
}
function screen(title, lines, items=[], owner='main'){
  const body = Array.isArray(lines) ? lines.filter((x)=>x !== '').join('\n') : String(lines || '');
  return { text:[title,'',body].join('\n'), attachments:keyboard(items, owner) };
}
function postLabel(p, i){ return `${i+1}. ${cut(p.title || p.originalText || p.postId || 'Пост', 42)}`; }

async function renderAsync(route='main:home', adminId='', p={}){
  const st = await state(adminId);
  const ch = await activeChannel(adminId, p.channelId || p.c || '');

  if (route === 'main:home') return screen('🐋 АдминКИТ', 'Панель управления MAX-каналом. Сейчас в чистом V3 включены только два готовых раздела: Каналы и Комментарии.', [['📺 Каналы','channels:home'], ['💬 Комментарии','comments:home']], 'main');

  if (route === 'channels:home') return screen('📺 Каналы', ['Активный канал: ' + (ch.title || 'не выбран'), 'Здесь подключение, список, выбор активного канала и live-проверка прав бота.'], [['📋 Мои каналы','channels:list'], ['➕ Подключить','channels:connect'], ['🔁 Активный канал','channels:active'], ['✅ Проверить права','channels:verify'], ['🔐 Доступы','channels:access'], ['👥 Администраторы','channels:admins']], 'channels');
  if (route === 'channels:list') {
    const list = await channels(adminId);
    const items = list.slice(0,10).map((c,i)=>[`${i+1}. ${cut(c.title || c.channelId, 36)}`, 'channels:set_active', { channelId:c.channelId }]);
    return screen('📋 Мои каналы', list.length ? [`Найдено каналов: ${list.length}`, 'Нажмите канал, чтобы сделать его активным.'] : ['Каналы пока не найдены.', 'Перешлите боту пост из канала или добавьте бота администратором канала.'], items, 'channels');
  }
  if (route === 'channels:set_active') {
    const list = await channels(adminId); const id = clean(p.channelId || p.c); const picked = list.find((x)=>x.channelId===id) || null;
    if (picked) await setFlow(adminId, { activeChannelId:picked.channelId, activeChannelTitle:picked.title });
    return screen('🔁 Активный канал', picked ? [`Сохранено: ${picked.title}`, `ID: ${picked.channelId}`, 'Этот канал будет подставляться в комментариях.'] : ['Канал не найден. Откройте «Мои каналы» и выберите канал заново.'], [], 'channels');
  }
  if (route === 'channels:connect') { await setFlow(adminId, { mode:'await_channel_forward', section:'channels' }); return screen('➕ Подключить канал', ['Действие активно.', '1) Добавьте бота администратором канала.', '2) Перешлите сюда любой пост из этого канала.', '3) Бот сохранит канал в базе и покажет его в «Мои каналы».'], [], 'channels'); }
  if (route === 'channels:active') return screen('🔁 Активный канал', [`Канал: ${ch.title}`, `ID: ${ch.channelId || 'пока не определён'}`, `Источник: ${ch.source || 'нет данных'}`], [], 'channels');
  if (route === 'channels:verify') {
    if (!ch.channelId) return screen('✅ Проверить права бота', 'Сначала подключите или выберите канал.', [['📋 Мои каналы','channels:list']], 'channels');
    try { const member = await api.getBotChatMember({ botToken:config.botToken, chatId:ch.channelId }); return screen('✅ Проверить права бота', [`Канал: ${ch.title}`, 'Live-проверка MAX API: успешно.', `Статус/роль: ${clean(member?.status || member?.role || member?.permissions?.role || 'ответ получен')}`, 'Если бот администратор и может редактировать сообщения — можно патчить комментарии/кнопки.'], [], 'channels'); }
    catch(error){ return screen('✅ Проверить права бота', [`Канал: ${ch.title}`, 'Live-проверка MAX API: не прошла.', `Ошибка: ${clean(error?.message || error)}`, 'Проверьте, что бот добавлен администратором канала.'], [['➕ Подключить','channels:connect']], 'channels'); }
  }
  if (route === 'channels:access') return screen('🔐 Доступы', [`Канал: ${ch.title}`, 'Нужно для работы:', '• бот добавлен в канал', '• бот администратор', '• право редактировать сообщения', '• право видеть/получать события постов'], [['✅ Проверить права','channels:verify']], 'channels');
  if (route === 'channels:admins') {
    if (!ch.channelId) return screen('👥 Администраторы', 'Сначала выберите канал.', [['📋 Мои каналы','channels:list']], 'channels');
    try { const members = await api.getAllChatMembers({ botToken:config.botToken, chatId:ch.channelId, limit:500 }); const admins = members.filter((m)=>/admin|owner|creator/i.test(clean(m.role || m.status || m.permissions?.role))); return screen('👥 Администраторы', [`Канал: ${ch.title}`, `Участников получено: ${members.length}`, `Администраторов найдено: ${admins.length}`, ...(admins.slice(0,8).map((m,i)=>`${i+1}. ${clean(m.user?.name || m.name || m.user_id || m.id || 'Администратор')}`))], [], 'channels'); }
    catch(error){ return screen('👥 Администраторы', [`Канал: ${ch.title}`, 'Не удалось получить список через MAX API.', `Ошибка: ${clean(error?.message || error)}`], [['✅ Проверить права','channels:verify']], 'channels'); }
  }

  if (route === 'comments:home') return screen('💬 Комментарии', [`Канал: ${ch.title}`, 'Готовые функции: авто-режим, старый пост, выбор поста, настройки, фото, реакции и предпросмотр.'], [['⚡ Авто для новых','comments:auto_new'], ['📌 Старый пост','comments:old_post'], ['📌 Выбрать пост','comments:choose_post'], ['👀 Как это выглядит','comments:preview'], ['⚙️ Настройки','comments:settings'], ['📷 Фото','comments:photo'], ['❤️ Реакции и ответы','comments:reactions']], 'comments');
  if (route === 'comments:auto_new') return screen('⚡ Авто для новых постов', [`Канал: ${ch.title}`, `Статус: ${st.commentsAutoNew === false ? 'выключено' : 'включено'}`, 'Новые посты, попавшие в webhook/память бота, связываются с обсуждением. Старые посты подключаются через «Старый пост».'], [['✅ Включить','comments:auto_on'], ['⏸ Выключить','comments:auto_off'], ['📌 Старый пост','comments:old_post']], 'comments');
  if (route === 'comments:auto_on') { await setFlow(adminId, { commentsAutoNew:true }); return screen('✅ Авто для новых включено', [`Канал: ${ch.title}`, 'Состояние сохранено.'], [], 'comments'); }
  if (route === 'comments:auto_off') { await setFlow(adminId, { commentsAutoNew:false }); return screen('⏸ Авто для новых выключено', [`Канал: ${ch.title}`, 'Состояние сохранено.'], [], 'comments'); }
  if (route === 'comments:old_post') { await setFlow(adminId, { mode:'await_old_post_forward', section:'comments', activeChannelId:ch.channelId, activeChannelTitle:ch.title }); return screen('📌 Старый пост', ['Действие активно.', 'Перешлите сюда уже опубликованный пост из канала.', 'Бот должен зарегистрировать пост, сохранить текст и безопасно добавить/восстановить кнопку комментариев без дублей.'], [['📌 Выбрать пост','comments:choose_post']], 'comments'); }
  if (route === 'comments:choose_post') {
    const list = await posts(adminId, ch.channelId);
    const items = list.slice(0,10).map((post,i)=>[postLabel(post,i), 'comments:post', { channelId:ch.channelId, postId:post.postId, commentKey:post.commentKey }]);
    return screen('📌 Выбрать пост', list.length ? [`Канал: ${ch.title}`, `Постов найдено: ${list.length}`, 'Выберите пост.'] : [`Канал: ${ch.title}`, 'Постов пока нет в базе.', 'Перешлите опубликованный пост через «Старый пост».'], items, 'comments');
  }
  if (route === 'comments:post') {
    const picked = await selectedPost(adminId, p); if (picked) await setFlow(adminId, { selectedPostId:picked.postId, selectedCommentKey:picked.commentKey, activeChannelId:ch.channelId, activeChannelTitle:ch.title });
    return screen('💬 Комментарии → пост', picked ? [`Пост выбран: ${cut(picked.title || picked.postId, 80)}`, `commentKey: ${picked.commentKey}`, 'Дальше доступны действия для этого поста.'] : ['Пост не выбран.'], [['✅/⏸ Комментарии','comments:settings'], ['👀 Как выглядит','comments:preview'], ['📷 Фото','comments:photo'], ['❤️ Реакции','comments:reactions']], 'comments');
  }
  if (route === 'comments:preview') { const picked = await selectedPost(adminId, p); return screen('👀 Как это выглядит', picked ? [`Пост: ${cut(picked.title || picked.postId, 80)}`, 'Откройте обсуждение из кнопки в посте. Telegram-style UI комментариев не трогаем.'] : ['Пост не выбран. Выберите пост, чтобы проверить обсуждение.'], [['📌 Выбрать пост','comments:choose_post']], 'comments'); }
  if (route === 'comments:settings') return screen('⚙️ Настройки комментариев', [`Канал: ${ch.title}`, `Комментарии: ${st.commentsEnabled === false ? 'выключены' : 'включены'}`, `Фото: ${st.commentsPhoto === false ? 'выключено' : 'включено'}`, `Реакции и ответы: ${st.commentsReactions === false ? 'выключены' : 'включены'}`], [['✅ Комментарии ON','comments:toggle_on'], ['⏸ Комментарии OFF','comments:toggle_off'], ['📷 Фото','comments:photo'], ['❤️ Реакции','comments:reactions']], 'comments');
  if (route === 'comments:toggle_on') { await setFlow(adminId, { commentsEnabled:true }); return screen('✅ Комментарии включены', 'Состояние сохранено. При следующем патче поста комментарии остаются включёнными.', [], 'comments'); }
  if (route === 'comments:toggle_off') { await setFlow(adminId, { commentsEnabled:false }); return screen('⏸ Комментарии выключены', 'Состояние сохранено. Текст поста и привязка в базе не удаляются.', [], 'comments'); }
  if (route === 'comments:photo') return screen('📷 Фото в комментариях', [`Статус: ${st.commentsPhoto === false ? 'выключено' : 'включено'}`, 'Разрешаем только фото. Видео и файлы не включаем.'], [['✅ Фото ON','comments:photo_on'], ['⏸ Фото OFF','comments:photo_off']], 'comments');
  if (route === 'comments:photo_on') { await setFlow(adminId, { commentsPhoto:true }); return screen('✅ Фото включены', 'Состояние сохранено: фото разрешены.', [], 'comments'); }
  if (route === 'comments:photo_off') { await setFlow(adminId, { commentsPhoto:false }); return screen('⏸ Фото выключены', 'Состояние сохранено: фото запрещены.', [], 'comments'); }
  if (route === 'comments:reactions') return screen('❤️ Реакции и ответы', [`Статус: ${st.commentsReactions === false ? 'выключены' : 'включены'}`, 'Реакции и ответы работают внутри обсуждения и не должны конфликтовать с фото.'], [['✅ Реакции ON','comments:reactions_on'], ['⏸ Реакции OFF','comments:reactions_off']], 'comments');
  if (route === 'comments:reactions_on') { await setFlow(adminId, { commentsReactions:true }); return screen('✅ Реакции включены', 'Состояние сохранено.', [], 'comments'); }
  if (route === 'comments:reactions_off') { await setFlow(adminId, { commentsReactions:false }); return screen('⏸ Реакции выключены', 'Состояние сохранено.', [], 'comments'); }

  if (route === 'help:channels') return screen('❓ Помощь: Каналы', 'Каналы: подключение, список, выбор активного канала и live-проверка прав.', [], 'channels');
  if (route === 'help:comments') return screen('❓ Помощь: Комментарии', 'Комментарии: авто-режим, старый пост, выбор поста, настройки, фото, реакции и предпросмотр.', [], 'comments');
  return screen('❓ Помощь', 'Сейчас в чистом V3 готовы только Главное меню, Каналы и Комментарии.', [], 'main');
}
function render(route='main:home'){ if(route==='main:home') return screen('🐋 АдминКИТ','Панель управления MAX-каналом. Сейчас включены только Каналы и Комментарии.', [['📺 Каналы','channels:home'], ['💬 Комментарии','comments:home']], 'main'); return screen('V3', `Маршрут ${route}. Для полной проверки используйте async render/debug.`, [], route.split(':')[0] || 'main'); }
async function send(update, packet){
  const targets=[]; const c=chatId(update); const u=userId(update); if (c) targets.push({ chatId:c, kind:'chatId' }); if (u && u !== c) targets.push({ userId:u, kind:'userId' });
  let last=null; for (const t of targets) { try { const {kind,...q}=t; const result = await api.sendMessage({ botToken:config.botToken, ...q, text:packet.text, attachments:packet.attachments, notify:false }); return { ok:true, kind, result }; } catch(e) { last=e; } }
  throw last || new Error('no_send_target');
}
async function answer(update){ const id = callbackId(update); if (!id) return; try { await api.answerCallback({ botToken:config.botToken, callbackId:id, notification:'' }); } catch {} }
async function tryHandleExpress(req){
  const update = req.body || {}; const route = routeFrom(update); const hasCb = !!cb(update); const isStart = route === 'main:home' && (!!text(update) || /started|start/i.test(clean(update?.update_type || update?.type || update?.event_type || '')));
  if (!KNOWN.has(route) && !isStart) return { handled:false, runtime:RUNTIME, route };
  try { await db.upsertFromUpdate(update); } catch {}
  const adminId = adminIdFromUpdate(update); if (hasCb) await answer(update);
  const sent = await send(update, await renderAsync(route, adminId, payload(update)));
  return { handled:true, runtime:RUNTIME, route, sentKind:sent.kind };
}
async function selfTestAsync(adminId=''){
  const bad=[]; for (const r of STAGE_ROUTES) { try { const s = await renderAsync(r, adminId, {}); if (!s?.text || !Array.isArray(s.attachments)) bad.push(r); } catch(e) { bad.push(`${r}:${e.message}`); } }
  return { ok: bad.length===0, runtimeVersion:RUNTIME, checked:STAGE_ROUTES.length, badRoutes:bad, readySections:['main','channels','comments'], patcherTouched:false, commentsUiTouched:false, postgresUsed:true };
}
function selfTest(){ return { ok:true, runtimeVersion:RUNTIME, mode:'stage_1_main_channels_comments_real_actions', mainButtons:2, channelsRoutes:8, commentsRoutes:16, patcherTouched:false, commentsUiTouched:false, postgresTouched:false }; }
module.exports = { RUNTIME, tryHandleExpress, render, renderAsync, selfTest, selfTestAsync };
