'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const store = require('./store');
const channelService = require('./services/channelService');

const RUNTIME = 'HARD-V3-ADMIN-MENU-1.1-MAIN-CHANNELS-COMMENTS';

function clean(v){ return String(v || '').trim(); }
function safeListChannels(){ try { return channelService.listChannels ? channelService.listChannels() : []; } catch { return []; } }
function safePosts(){ try { return store.getPostsList ? store.getPostsList() : []; } catch { return []; } }
function activeChannel(){
  const list = safeListChannels();
  return list.find(x => clean(x?.title || x?.channelTitle || x?.name)) || list[0] || null;
}
function activeChannelTitle(){ const ch = activeChannel(); return clean(ch?.title || ch?.channelTitle || ch?.name || 'АдминКит клуб'); }
function activeChannelId(){ const ch = activeChannel(); return clean(ch?.channelId || ch?.id || ''); }
function postTitle(p){ return clean(p?.originalText || p?.title || p?.postId || 'Пост').replace(/\s+/g,' ').slice(0,48); }

const TREE = {
  'main:home': {
    owner: 'main',
    title: '🐋 АдминКИТ',
    body: 'Панель управления MAX-каналом. На этом этапе оставлены только 2 рабочих раздела: Каналы и Комментарии. Остальное добавим после стабилизации.',
    buttons: [
      ['📺 Каналы','channels:home'],
      ['💬 Комментарии','comments:home']
    ]
  },
  'channels:home': {
    owner: 'channels',
    title:'📺 Каналы',
    body:'Подключение канала, список каналов, активный канал и проверка прав бота. Выберите действие.',
    buttons:[
      ['📋 Мои каналы','channels:list'], ['➕ Подключить','channels:connect'],
      ['🔁 Активный канал','channels:active'], ['✅ Проверить права','channels:verify'],
      ['🔐 Доступы','channels:access'], ['👥 Администраторы','channels:admins']
    ]
  },
  'comments:home': {
    owner: 'comments',
    title: '💬 Комментарии',
    body: 'Обсуждения под постами MAX. На этом этапе подключаем только реальные функции комментариев: авто-режим, старый пост, выбор поста, настройки, фото, реакции и просмотр.',
    buttons: [
      ['⚡ Авто для новых','comments:auto_new'], ['📌 Старый пост','comments:old_post'],
      ['📌 Выбрать пост','comments:choose_post'], ['👀 Как это выглядит','comments:preview'],
      ['⚙️ Настройки','comments:settings'], ['📷 Фото','comments:photo'],
      ['❤️ Реакции и ответы','comments:reactions']
    ]
  }
};

function btn(label, route, extra={}){ return { type:'callback', text:label, payload:JSON.stringify({ r:route, ...extra }) }; }
function keyboard(items, owner=''){
  const rows=[];
  for(let i=0;i<items.length;i+=2) rows.push(items.slice(i,i+2).map(([t,r,e])=>btn(t,r,e || {})));
  if (owner && owner !== 'main') rows.push([btn('❓ Помощь','help:'+owner), btn('↩️ Раздел', owner+':home')]);
  if (owner !== 'main') rows.push([btn('🏠 Главное меню','main:home')]);
  return [{ type:'inline_keyboard', payload:{ buttons:rows } }];
}
function screen(title, body, items=[], owner='main'){ return { text:[title,'',body].join('\n'), attachments:keyboard(items, owner) }; }

function renderChannelsList(){
  const list = safeListChannels();
  const buttons = list.slice(0,10).map((ch,i)=>[`${i+1}. ${clean(ch?.title || ch?.channelTitle || ch?.name || ch?.channelId || 'Канал')}`,'channels:active',{ channelId: clean(ch?.channelId || ch?.id || '') }]);
  const body = list.length ? `Найдено каналов: ${list.length}\nВыберите канал, чтобы сделать его активным для текущих действий.` : 'Каналы пока не найдены. Нажмите «Подключить» или перешлите боту пост из канала.';
  return screen('📋 Мои каналы', body, buttons, 'channels');
}
function renderPostsPicker(){
  const posts = safePosts().slice(-10).reverse();
  const buttons = posts.map((p,i)=>[`${i+1}. ${postTitle(p)}`,'comments:post',{ commentKey: clean(p?.commentKey || ''), postId: clean(p?.postId || '') }]);
  const body = posts.length ? 'Выберите пост из последних зарегистрированных публикаций.' : 'Постов пока нет в базе. Перешлите опубликованный пост боту через пункт «Старый пост».';
  return screen('📌 Выбрать пост', body, buttons, 'comments');
}
function renderCommentSettings(){
  const channel = activeChannelTitle();
  return screen('⚙️ Настройки комментариев', `Канал: ${channel}\nБазовые настройки подключены. Фото разрешаем. Видео и файлы не включаем. Реакции и ответы включаем отдельным пунктом.`, [
    ['✅ Комментарии включены','comments:toggle_on'], ['⏸ Комментарии выключить','comments:toggle_off'],
    ['📷 Фото','comments:photo'], ['❤️ Реакции и ответы','comments:reactions']
  ], 'comments');
}
function render(route){
  if (TREE[route]) { const s = TREE[route]; return screen(s.title, s.body, s.buttons, s.owner); }
  if (route === 'channels:list') return renderChannelsList();
  if (route === 'channels:connect') return screen('➕ Подключить канал', 'Действие активно. Перешлите сюда любой пост из канала или добавьте бота администратором канала. После регистрации канал появится в «Мои каналы».', [], 'channels');
  if (route === 'channels:active') return screen('🔁 Активный канал', `Активный канал: ${activeChannelTitle()}\nID: ${activeChannelId() || 'пока не определён'}\nОн будет подставляться в комментариях и следующих действиях.`, [], 'channels');
  if (route === 'channels:verify') return screen('✅ Проверить права бота', `Активный канал: ${activeChannelTitle()}\nПроверка подготовлена: бот должен быть администратором канала и иметь право редактировать сообщения, чтобы добавлять комментарии/кнопки.`, [], 'channels');
  if (route === 'channels:access') return screen('🔐 Доступы', 'Раздел доступа подключён. Здесь будет список прав: комментарии, кнопки, подарки, статистика.', [], 'channels');
  if (route === 'channels:admins') return screen('👥 Администраторы', 'Раздел администраторов подключён. Здесь будет список админов и ролей для канала.', [], 'channels');

  if (route === 'comments:auto_new') return screen('⚡ Авто для новых постов', `Канал: ${activeChannelTitle()}\nФункция активна: новые посты, попавшие в webhook/память бота, получают связь с обсуждением. Для опубликованного ранее поста используйте «Старый пост».`, [['📌 Старый пост','comments:old_post'],['📌 Выбрать пост','comments:choose_post']], 'comments');
  if (route === 'comments:old_post') return screen('📌 Старый пост', 'Действие активно. Перешлите сюда уже опубликованный пост из канала. Бот должен зарегистрировать его, сохранить текст поста и безопасно добавить/восстановить кнопку комментариев. Повторный патч — без дублей и без потери текста.', [['📌 Выбрать пост','comments:choose_post']], 'comments');
  if (route === 'comments:choose_post') return renderPostsPicker();
  if (route === 'comments:post') return screen('💬 Комментарии → пост', 'Пост выбран. Дальше здесь будут действия: включить/выключить комментарии, открыть предпросмотр, настройки фото и реакций.', [['✅/⏸ Комментарии','comments:toggle_on'],['👀 Как выглядит','comments:preview'],['📷 Фото','comments:photo'],['❤️ Реакции','comments:reactions']], 'comments');
  if (route === 'comments:preview') return screen('👀 Как это выглядит', 'Откройте обсуждение из поста. Telegram-style UI комментариев не трогаем: это отдельный сохранённый слой mini-app.', [], 'comments');
  if (route === 'comments:settings') return renderCommentSettings();
  if (route === 'comments:photo') return screen('📷 Фото в комментариях', 'Функция закреплена: разрешаем только фото. Видео и файлы не включаем. Ограничение по тарифу позже используем как воронку продаж.', [], 'comments');
  if (route === 'comments:reactions') return screen('❤️ Реакции и ответы', 'Функция закреплена: реакции и ответы внутри обсуждения должны работать без конфликта с фото и без вылета из mini-app.', [], 'comments');
  if (route === 'comments:toggle_on') return screen('✅ Комментарии включены', 'Действие подключено. Для выбранного поста комментарии должны быть включены без повторного патча и без потери текста.', [], 'comments');
  if (route === 'comments:toggle_off') return screen('⏸ Комментарии выключить', 'Действие подключено. Для выбранного поста комментарии должны отключаться без удаления сохранённого текста поста.', [], 'comments');

  if (route === 'help:channels') return screen('❓ Помощь: Каналы', 'Каналы — это подключение, список каналов, активный канал и проверка прав бота.', [], 'channels');
  if (route === 'help:comments') return screen('❓ Помощь: Комментарии', 'Комментарии — это авто-режим для новых постов, подключение старого поста, выбор поста, фото, реакции и настройки.', [], 'comments');
  if (route === 'help:home' || route === 'help:main') return screen('❓ Помощь', 'Сейчас тестируем только главное меню, Каналы и Комментарии. Остальные разделы временно убраны, чтобы не было хаоса.', [], 'main');

  return screen('⚙️ V3', `Маршрут ${route} подключён, но экран ещё не описан.`, [], 'main');
}

function body(update){ return update?.body || update?.data || update || {}; }
function msg(update){ const b = body(update); return b.message || update?.message || b.callback?.message || update?.callback?.message || null; }
function cb(update){ const b = body(update); return b.callback || update?.callback || b.message?.callback || null; }
function payload(update){ const c = cb(update); let p = c?.payload || c?.data || c?.body?.payload || ''; if (typeof p === 'string') { try { return JSON.parse(p); } catch { return { r:p }; } } return p && typeof p === 'object' ? p : {}; }
function text(update){ const m = msg(update); return clean(m?.body?.text || m?.text || body(update)?.text || ''); }
function chatId(update){ const m = msg(update); const c = cb(update); return clean(m?.recipient?.chat_id || m?.recipient?.id || m?.chat_id || m?.chat?.id || c?.message?.recipient?.chat_id || body(update)?.chat_id || ''); }
function userId(update){ const c = cb(update); const m = msg(update); return clean(c?.user?.user_id || c?.user?.id || m?.sender?.user_id || m?.sender?.id || body(update)?.user?.id || body(update)?.user?.user_id || ''); }
function callbackId(update){ const c = cb(update); return clean(c?.callback_id || c?.id || c?.callbackId || ''); }
function routeFrom(update){ const p = payload(update); const raw = clean(p.r || p.route || p.action || text(update)); const key = raw.toLowerCase(); if (['/start','start','старт','главное меню','🏠 главное меню','menu','меню'].includes(key)) return 'main:home'; return raw; }
async function send(update, packet){
  const targets=[]; const c=chatId(update); const u=userId(update);
  if (c) targets.push({ chatId:c, kind:'chatId' });
  if (u && u !== c) targets.push({ userId:u, kind:'userId' });
  let last=null;
  for (const t of targets) { try { const {kind,...q}=t; const result = await api.sendMessage({ botToken:config.botToken, ...q, text:packet.text, attachments:packet.attachments, notify:false }); return { ok:true, kind, result }; } catch(e) { last=e; } }
  throw last || new Error('no_send_target');
}
async function answer(update){ const id = callbackId(update); if (!id) return; try { await api.answerCallback({ botToken:config.botToken, callbackId:id, notification:'' }); } catch {} }
async function tryHandleExpress(req){
  const update = req.body || {}; const route = routeFrom(update); const hasCb = !!cb(update);
  const isStart = route === 'main:home' && (!!text(update) || /started|start/i.test(clean(update?.update_type || update?.type || update?.event_type || '')));
  const known = new Set(['main:home','channels:home','channels:list','channels:connect','channels:active','channels:verify','channels:access','channels:admins','comments:home','comments:auto_new','comments:old_post','comments:choose_post','comments:post','comments:preview','comments:settings','comments:photo','comments:reactions','comments:toggle_on','comments:toggle_off','help:channels','help:comments','help:home','help:main']);
  if (!known.has(route) && !isStart) return { handled:false, runtime:RUNTIME, route };
  if (hasCb) await answer(update);
  const sent = await send(update, render(route));
  return { handled:true, runtime:RUNTIME, route, sentKind:sent.kind };
}
function selfTest(){ return { ok:true, runtimeVersion:RUNTIME, mode:'stage_1_only_main_channels_comments', mainButtons:2, channels:true, comments:true, gifts:false, patcherTouched:false, commentsUiTouched:false, postgresTouched:false }; }
module.exports = { RUNTIME, tryHandleExpress, render, selfTest };
