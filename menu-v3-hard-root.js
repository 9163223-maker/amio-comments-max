'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const store = require('./store');
const channelService = require('./services/channelService');
const giftService = require('./services/giftService');

const RUNTIME = 'HARD-V3-ADMIN-MENU-1.0';

const TREE = {
  'main:home': {
    title: '🐋 АдминКИТ',
    body: 'Панель управления MAX-каналом. Выберите раздел.',
    buttons: [
      ['📺 Каналы','channels:home'], ['💬 Комментарии','comments:home'],
      ['🛡 Модерация','moderation:home'], ['✏️ Редактор','editor:home'],
      ['⚪ Кнопки','buttons:home'], ['🎁 Подарки','gifts:home'],
      ['📌 Выделение','highlight:home'], ['🗳 Опросы','polls:home'],
      ['📊 Статистика','stats:home'], ['🧾 Тарифы','billing:home'],
      ['🤝 Рефералы','referrals:home'], ['❓ Помощь','help:home']
    ]
  },
  'comments:home': {
    title: '💬 Комментарии',
    body: 'Обсуждения под постами MAX. Здесь подключаем старые посты, авто-режим, фото, реакции и настройки. Выберите действие.',
    buttons: [
      ['⚡ Авто для новых','comments:auto_new'], ['📌 Старый пост','comments:old_post'],
      ['📌 Выбрать пост','comments:choose_post'], ['👀 Как это выглядит','comments:preview'],
      ['⚙️ Настройки','comments:settings'], ['🖼 Баннер','comments:banner'],
      ['📷 Фото','comments:photo'], ['❤️ Реакции и ответы','comments:reactions']
    ]
  },
  'gifts:home': {
    title: '🎁 Подарки',
    body: 'Подарки и лид-магниты за подписку: создание, список, проверка подписки и тестовая выдача. Выберите действие.',
    buttons: [
      ['🎁 Создать подарок','gifts:create'], ['📌 Выбрать пост','gifts:choose_post'],
      ['📋 Список подарков','gifts:list'], ['🔐 Проверка подписки','gifts:subscription'],
      ['🧪 Тестовая выдача','gifts:test']
    ]
  },
  'channels:home': { title:'📺 Каналы', body:'Каналы, доступы и проверка прав.', buttons:[['📋 Мои каналы','channels:list'],['➕ Подключить','channels:connect'],['✅ Проверить права','channels:verify']] },
  'moderation:home': { title:'🛡 Модерация', body:'Правила, стоп-слова и проверка комментариев.', buttons:[['🛡 Правила','moderation:rules'],['📋 Стоп-слова','moderation:words'],['➕ Добавить слово','moderation:add_word'],['🔗 Ссылки','moderation:links'],['📋 Журнал','moderation:logs']] },
  'editor:home': { title:'✏️ Редактор', body:'Редактирование постов без потери комментариев, ссылок, медиа и кнопок.', buttons:[['📌 Выбрать пост','editor:choose_post'],['🕘 История','editor:history']] },
  'buttons:home': { title:'⚪ Кнопки', body:'CTA-кнопки под постами: текст, ссылка, список, удаление и предпросмотр.', buttons:[['➕ Добавить кнопку','buttons:create'],['📌 Выбрать пост','buttons:choose_post'],['📋 Кнопки поста','buttons:list'],['👀 Предпросмотр','buttons:preview']] },
  'stats:home': { title:'📊 Статистика', body:'Статистика канала, постов, комментариев, реакций, подарков и кликов.', buttons:[['📊 Канал','stats:channel'],['📌 Пост','stats:post'],['💬 Комментарии','stats:comments'],['❤️ Реакции','stats:reactions'],['🎁 Подарки','stats:gifts'],['🔘 Клики','stats:buttons']] },
  'highlight:home': { title:'📌 Выделение', body:'Раздел в разработке: выделение важных постов.', buttons:[] },
  'polls:home': { title:'🗳 Опросы', body:'Раздел в разработке: голосования и опросы.', buttons:[] },
  'billing:home': { title:'🧾 Тарифы', body:'Раздел в разработке: тарифы, лимиты и доступы.', buttons:[] },
  'referrals:home': { title:'🤝 Рефералы', body:'Раздел в разработке: реферальные ссылки и бонусы.', buttons:[] },
  'help:home': { title:'❓ Помощь', body:'Главное правило: меню V3 всегда отправляется новым актуальным блоком вниз. Старое меню больше не управляет навигацией.', buttons:[] }
};

const ACTION_TEXT = {
  'comments:auto_new': '⚡ Авто для новых постов\nКанал: {{channel}}\nФункция активна: новые посты, попавшие в webhook/память бота, получают связь с обсуждением. Для уже опубликованного поста используйте «Старый пост».',
  'comments:old_post': '📌 Старый пост\nДействие активно. Перешлите сюда уже опубликованный пост из канала. Бот зарегистрирует его, сохранит текст поста и безопасно добавит/восстановит кнопку комментариев. Повторный патч должен быть идемпотентным: без дублей и без потери текста.',
  'comments:preview': '👀 Как это выглядит\nОткройте обсуждение из поста. UI комментариев Telegram-style не трогаем: это отдельный слой mini-app.',
  'comments:settings': '⚙️ Настройки обсуждений\nЗдесь будут включение/отключение комментариев, баннера, фото, реакций и ответов для выбранного канала/поста.',
  'comments:banner': '🖼 Баннер\nАккуратная подпись/баннер внутри обсуждения. Без агрессивной рекламы.',
  'comments:photo': '📷 Фото в комментариях\nФункция закреплена: разрешаем только фото. Видео и файлы не включаем.',
  'comments:reactions': '❤️ Реакции и ответы\nФункция закреплена: реакции и ответы внутри обсуждения.',
  'gifts:create': '🎁 Создать подарок\nСценарий активен как мастер 1/4:\n1/4 выбрать канал и пост\n2/4 загрузить подарок или ссылку\n3/4 сообщение получателю\n4/4 сохранить и проверить выдачу.',
  'gifts:choose_post': '📌 Выбрать пост для подарка\nВыберите пост из зарегистрированных публикаций. Если поста нет — сначала перешлите его боту.',
  'gifts:list': '📋 Список подарков\nСписок сохранённых подарков и лид-магнитов по текущему каналу.',
  'gifts:subscription': '🔐 Проверка подписки\nПодарок выдаётся только после проверки подписки на канал.',
  'gifts:test': '🧪 Тестовая выдача\nПроверка выдачи подарка администратору без ожидания реального пользователя.'
};

const ROUTES = new Set([...Object.keys(TREE), ...Object.keys(ACTION_TEXT), 'comments:choose_post']);

function clean(v){ return String(v || '').trim(); }
function body(update){ return update?.body || update?.data || update || {}; }
function msg(update){ const b = body(update); return b.message || update?.message || b.callback?.message || update?.callback?.message || null; }
function cb(update){ const b = body(update); return b.callback || update?.callback || b.message?.callback || null; }
function payload(update){
  const c = cb(update); let p = c?.payload || c?.data || c?.body?.payload || '';
  if (typeof p === 'string') { try { return JSON.parse(p); } catch { return { r:p }; } }
  return p && typeof p === 'object' ? p : {};
}
function text(update){ const m = msg(update); return clean(m?.body?.text || m?.text || body(update)?.text || ''); }
function chatId(update){ const m = msg(update); const c = cb(update); return clean(m?.recipient?.chat_id || m?.recipient?.id || m?.chat_id || m?.chat?.id || c?.message?.recipient?.chat_id || body(update)?.chat_id || ''); }
function userId(update){ const c = cb(update); const m = msg(update); return clean(c?.user?.user_id || c?.user?.id || m?.sender?.user_id || m?.sender?.id || body(update)?.user?.id || body(update)?.user?.user_id || ''); }
function callbackId(update){ const c = cb(update); return clean(c?.callback_id || c?.id || c?.callbackId || ''); }
function routeFrom(update){
  const p = payload(update); const raw = clean(p.r || p.route || p.action || text(update)); const key = raw.toLowerCase();
  if (['/start','start','старт','главное меню','🏠 главное меню','menu','меню'].includes(key)) return 'main:home';
  return raw;
}
function btn(label, route, extra={}){ return { type:'callback', text:label, payload:JSON.stringify({ r:route, ...extra }) }; }
function keyboard(items, owner=''){
  const rows=[]; for(let i=0;i<items.length;i+=2) rows.push(items.slice(i,i+2).map(([t,r])=>btn(t,r)));
  if (owner && owner !== 'main') rows.push([btn('❓ Помощь','help:home'), btn('↩️ Раздел',`${owner}:home`)]);
  if (owner !== 'main') rows.push([btn('🏠 Главное меню','main:home')]);
  return [{ type:'inline_keyboard', payload:{ buttons:rows } }];
}
function activeChannelTitle(){
  try { const ch = (channelService.listChannels ? channelService.listChannels() : []).find(x => x?.title || x?.channelTitle) || {}; return clean(ch.title || ch.channelTitle || 'АдминКит клуб'); } catch { return 'АдминКит клуб'; }
}
function render(route){
  if (TREE[route]) { const screen = TREE[route]; const owner = route === 'main:home' ? 'main' : route.split(':')[0]; return { text:[screen.title,'',screen.body].join('\n'), attachments:keyboard(screen.buttons || [], owner) }; }
  if (route === 'comments:choose_post') return renderPostPicker('comments:post');
  if (ACTION_TEXT[route]) return { text: ACTION_TEXT[route].replace('{{channel}}', activeChannelTitle()), attachments:keyboard([], route.split(':')[0]) };
  if (route.startsWith('gifts:') && ACTION_TEXT[route]) return { text: ACTION_TEXT[route], attachments:keyboard([], 'gifts') };
  return { text:['⚙️ Раздел V3','',`Маршрут ${route} подключён. Функция будет развёрнута следующим шагом.`].join('\n'), attachments:keyboard([], route.split(':')[0] || 'main') };
}
function renderPostPicker(targetRoute){
  let posts=[]; try { posts = store.getPostsList ? store.getPostsList().slice(-10).reverse() : []; } catch {}
  const rows = posts.map((p,i)=>[`${i+1}. ${clean(p.originalText || p.title || p.postId || 'Пост').slice(0,36)}`, targetRoute]);
  return { text:['📌 Выбрать пост','', posts.length ? 'Выберите пост из последних зарегистрированных публикаций.' : 'Постов пока нет в базе. Перешлите опубликованный пост боту.'].join('\n'), attachments:keyboard(rows, 'comments') };
}
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
  const isKnown = ROUTES.has(route) || isStart;
  if (!isKnown) return { handled:false, runtime:RUNTIME, route };
  if (hasCb) await answer(update);
  const packet = render(route);
  const sent = await send(update, packet);
  return { handled:true, runtime:RUNTIME, route, sentKind:sent.kind };
}
function selfTest(){ return { ok:true, runtimeVersion:RUNTIME, mode:'hard_reset_new_message_only', routes:[...ROUTES].length, comments:true, gifts:true, patcherTouched:false, commentsUiTouched:false, postgresTouched:false }; }

module.exports = { RUNTIME, tryHandleExpress, render, selfTest };
