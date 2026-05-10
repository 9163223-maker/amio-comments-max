'use strict';

// CC6.5.2.5 production menu runtime.
// Renders real bot UI from production-menu-map-v2 instead of the older hardcoded clean-menu screens.
// Fixes: no commentKey in client UI, full planned sections visible, route owners preserved.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.2.5';
const SOURCE = 'adminkit-CC6.5.2.5-production-menu-runtime';
const LOGO_PATH = path.join(__dirname, 'public', 'adminkit_chat_logo.png');
const lastMenus = new Map();
const events = [];
let cachedLogoAttachment = null;

const ALIASES = {
  ak_main_menu: 'main:home', main_menu: 'main:home', menu_main: 'main:home', home: 'main:home',
  comments_menu: 'comments:home', comments_choose_post: 'comments:choose_post', comments_post_card: 'comments:post', comments_enable: 'comments:enable', comments_disable: 'comments:disable', comments_debug_post: 'comments:debug_post', help_comments: 'help:comments',
  gift_menu: 'gifts:home', gifts_menu: 'gifts:home', gift_create: 'gifts:create', gift_list: 'gifts:list', help_gifts: 'help:gifts',
  buttons_menu: 'buttons:home', buttons_add: 'buttons:add', buttons_list: 'buttons:list', help_buttons: 'help:buttons',
  mod_start: 'moderation:home', moderation_menu: 'moderation:home', help_moderation: 'help:moderation',
  stats_menu: 'stats:home', help_stats: 'help:stats', channels_menu: 'channels:home', help_channels: 'help:channels', help_menu: 'help:home'
};

const SECTION_TITLES = {
  channels: '📺 Каналы и доступ', comments: '💬 Комментарии', comments_banner: '🖼 Баннер в обсуждениях', comments_photo: '📷 Фото в комментариях', comments_reactions: '❤️ Реакции и ответы', moderation: '🛡 Модерация', editor: '✏️ Редактор постов', buttons: '⚪ Кнопки под постами', gifts: '🎁 Подарки / лид-магниты', highlight: '📌 Выделение постов', polls: 'Голосования / опросы', stats: '📊 Статистика', billing: '🧾 Покупка и тарифы', referrals: '🤝 Реферальная программа', help: '❓ Помощь'
};
const SECTION_HOME = { comments_banner: 'comments:home', comments_photo: 'comments:home', comments_reactions: 'comments:home' };

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function clip(v, n = 72) { const s = norm(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function tryJson(v) { try { const p = JSON.parse(String(v || '')); return p && typeof p === 'object' ? p : null; } catch { return null; } }
function clone(v) { return JSON.parse(JSON.stringify(v ?? null)); }
function map() { return require('./production-menu-map-v2'); }
function msg(u = {}) { return u.message || u.data?.message || u.callback?.message || u.data?.callback?.message || null; }
function cb(u = {}) { return u.callback || u.data?.callback || msg(u)?.callback || null; }
function payloadRaw(u = {}) { const c = cb(u) || {}; return norm(c.payload || c.body?.payload || u.payload || u.data?.payload || ''); }
function payload(u = {}) { return tryJson(payloadRaw(u)) || {}; }
function text(u = {}) { const m = msg(u) || {}; return norm(m.body?.text || m.text || m.message?.text || u.message?.text || ''); }
function eventType(u = {}) { return norm(u.update_type || u.type || u.event_type || u.eventType || u.event || u.data?.update_type || u.data?.type || '').toLowerCase(); }
function startPayload(u = {}) { return norm([u.start_payload, u.payload, u.startParam, u.start_param, u.data?.start_payload, u.data?.payload, u.user?.start_payload, u.user?.start_param, msg(u)?.body?.payload, msg(u)?.payload].find((x) => norm(x)) || ''); }
function userId(u = {}) { const m = msg(u) || {}; const c = cb(u) || {}; return norm(u.user?.user_id || u.user?.id || u.sender?.user_id || u.sender?.id || c.user?.user_id || c.user?.id || c.sender?.user_id || c.sender?.id || m.sender?.user_id || m.sender?.id || m.user_id || m.from?.id || u.data?.user?.user_id || u.data?.user?.id || ''); }
function chatId(u = {}) { const m = msg(u) || {}; return norm(m.recipient?.chat_id || m.recipient?.id || m.chat_id || m.chat?.id || u.chat_id || u.chat?.id || u.data?.chat_id || u.data?.chat?.id || ''); }
function target(u = {}) { const uid = userId(u); const cid = chatId(u); return { userId: uid, chatId: cid, key: uid || cid }; }
function callbackId(u = {}) { const c = cb(u) || {}; return norm(c.callback_id || c.callbackId || c.id || u.callback_id || ''); }
function messageId(u = {}) { const c = cb(u) || {}; const m = c.message || msg(u) || {}; const b = m.body || {}; return norm(b.mid || b.message_id || b.messageId || m.message_id || m.messageId || m.id || m.mid || c.message_id || c.messageId || ''); }
function responseMessageId(v = {}) { return norm([v?.message?.body?.mid, v?.message?.body?.message_id, v?.message?.message_id, v?.message?.id, v?.body?.mid, v?.body?.message_id, v?.message_id, v?.id, v?.mid, v?.data?.message?.body?.mid, v?.data?.message?.id, v?.data?.id].find((x) => norm(x)) || ''); }
function rawAction(u = {}) { const p = payload(u); const raw = payloadRaw(u); return norm(p.action || p.cmd || p.route || (/^[a-z0-9_:.\-]+$/i.test(raw) ? raw : '')).toLowerCase(); }
function canonical(action = '') { const a = norm(action).toLowerCase(); return ALIASES[a] || a; }
function owner(action = '') { const route = canonical(action); if (route === 'main:home') return 'main'; const item = map().getRoute(route); if (item) return item.owner; const ns = route.split(':')[0]; return map().OWNER_ORDER.includes(ns) ? ns : ''; }
function owned(action = '') { return canonical(action) === 'main:home' || Boolean(owner(action)); }
function isStart(u = {}) { if (cb(u)) return false; const t = eventType(u); const tx = text(u).toLowerCase(); const sp = startPayload(u).toLowerCase(); return t === 'bot_started' || t === 'bot_start' || t === 'bot_started_update' || ['start', '/start', 'menu', '/menu', 'меню'].includes(tx) || ['start', 'menu', 'main'].includes(sp); }
function logEvent(item) { events.push({ ts: Date.now(), ...item }); while (events.length > 160) events.shift(); }

function btn(label, action, extra = {}) { return { type: 'callback', text: label, payload: JSON.stringify({ action, ...extra }) }; }
function kb(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function gatePrefix(item) { if (!item) return ''; if (item.status === 'pro_only') return '🔒 '; if (item.status === 'business_only') return '💼 '; if (item.status === 'coming_soon') return '🕓 '; if (item.status === 'disabled') return '⛔ '; return ''; }
function label(item) { return gatePrefix(item) + item.title; }
function sectionHomeRoute(section) { return SECTION_HOME[section] || `${section}:home`; }
function navRows(section, helpRoute) { return [[btn('❓ Помощь раздела', helpRoute || `help:${section}`)], [btn('↩️ В меню раздела', sectionHomeRoute(section))], [btn('🏠 Главное меню', 'main:home')]]; }
function mainNavRows() { return [[btn('🏠 Главное меню', 'main:home')]]; }
function children(parent) { return map().getChildren(parent).filter((x) => x.visible !== false); }
function routeItem(route) { return map().getRoute(route); }
function activeChannels() { try { const xs = require('./services/channelService').listChannels(); return Array.isArray(xs) ? xs : []; } catch { return []; } }
function channelIdOf(c = {}) { return norm(c.channelId || c.channel_id || c.id || c.chatId || c.chat_id || ''); }
function channelTitle(c = {}) { return norm(c.title || c.channelTitle || c.channelName || c.name || c.chatTitle || channelIdOf(c) || 'Канал'); }
function storeObj() { try { return require('./store'); } catch { return {}; } }
function postKey(p = {}) { return norm(p.commentKey || p.key || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')); }
function postTitle(p = {}, i = 0) { return `${i + 1}. ${clip(p.originalText || p.title || p.linkedByName || p.postTitle || p.postId || p.commentKey || 'Пост', 44)}`; }
function listPosts(channelId = '') { try { const xs = require('./services/postEditorService').listAdminPosts({ channelId, limit: 20, config: require('./config') }); if (Array.isArray(xs) && xs.length) return xs; } catch {} try { const posts = Object.values(storeObj().store?.posts || {}); return posts.filter((p) => !channelId || norm(p.channelId) === norm(channelId)); } catch { return []; } }
function findPost(commentKey = '', channelId = '') { return listPosts(channelId).find((p) => postKey(p) === norm(commentKey)) || listPosts('').find((p) => postKey(p) === norm(commentKey)) || null; }
function selectedChannelId(extra = {}) { const channels = activeChannels(); return norm(extra.channelId || extra.channel_id || (channels.length === 1 ? channelIdOf(channels[0]) : '')); }

function mainModel() {
  const rows = map().MAIN_MENU.map((route) => routeItem(route)).filter((x) => x && x.visible !== false).map((item) => [btn(label(item), item.route)]);
  return { text: 'АдминКИТ — главное меню\n\nВыберите раздел управления каналом.', attachments: kb(rows), logo: true };
}
function sectionIntro(section) {
  const intros = {
    channels: 'Подключение каналов, активный канал, права бота и доступы.',
    comments: 'Обсуждения под постами, авто-комментарии, старые посты, баннеры, фото, реакции и ответы.',
    comments_banner: 'Плавающий баннер внутри окна обсуждения. Это не CTA-кнопка под постом.',
    comments_photo: 'Фото в комментариях — платная функция Pro. Видео и файлы не включаем.',
    comments_reactions: 'Реакции и ответы внутри обсуждений.',
    moderation: 'Фильтры, стоп-слова, ссылки, приглашения, AI-модерация и журнал.',
    editor: 'Редактирование постов без потери текста, ссылок, форматирования и медиа.',
    buttons: 'CTA-кнопки именно под постами MAX. Не путать с баннером в обсуждениях.',
    gifts: 'Лид-магниты и подарки за подписку: выбор поста, 4 шага, тестовая выдача.',
    highlight: 'Выделение важных постов, метки и стили выделения.',
    stats: 'Статистика канала и постов: комментарии, реакции, клики, подарки, рост.',
    billing: 'Покупка, тарифы, пробный период, токены и продление доступа.',
    referrals: 'Реферальные ссылки, приглашения и бонусы.',
    help: 'Помощь по разделам и тарифам.'
  };
  return intros[section] || 'Раздел АдминКИТ.';
}
function sectionHomeModel(section) {
  const home = routeItem(`${section}:home`) || routeItem(sectionHomeRoute(section));
  const title = home?.title || SECTION_TITLES[section] || section;
  const rows = children(home?.route || `${section}:home`).map((item) => [btn(label(item), item.route)]);
  if (section === 'comments') {
    for (const route of ['comments_banner:home','comments_photo:home','comments_reactions:home']) {
      const item = routeItem(route); if (item) rows.push([btn(label(item), item.route)]);
    }
  }
  if (section === 'channels') {
    const channels = activeChannels();
    const channelText = channels.length ? `\n\nАктивные каналы: ${channels.map(channelTitle).join(', ')}` : '\n\nКаналы не найдены.';
    return { text: `${title}\n\n${sectionIntro(section)}${channelText}`, attachments: kb([...rows, ...navRows(section, home?.helpRoute)]) };
  }
  return { text: `${title}\n\n${sectionIntro(section)}`, attachments: kb([...rows, ...navRows(section, home?.helpRoute)]) };
}
function helpModel(section) {
  const helpTexts = {
    comments: 'Комментарии управляют обсуждениями под постами. Выбор поста в этом разделе открывает только карточку комментариев, без модерации и без технических ID.',
    comments_banner: 'Баннер в обсуждениях живёт внутри mini-app комментариев. Он может вести на подарок, ссылку или действие, но не является кнопкой под постом.',
    comments_photo: 'Фото в комментариях — Pro-функция. В текущем плане разрешаем только фото; видео и файлы исключены.',
    moderation: 'Модерация получает только свои маршруты: правила канала и правила конкретного поста. Она не перехватывает выбор постов из других разделов.',
    buttons: 'Кнопки под постами — это CTA, которые патчат сам пост MAX. Это отдельный раздел, не баннер.',
    gifts: 'Подарки создаются по шагам 1/4–4/4 и привязываются к посту после проверки подписки.',
    billing: 'Покупка и тарифы: пробный период, токены, оплата, продление и повышение тарифа.',
    channels: 'Канал должен восстанавливаться из PostgreSQL после redeploy. Клиент не подключает его заново.'
  };
  const targetSection = section === 'help' ? 'help' : section;
  return { text: `❓ Помощь: ${SECTION_TITLES[targetSection] || targetSection}\n\n${helpTexts[targetSection] || 'Подсказка по разделу будет заполнена.'}`, attachments: kb([...navRows(targetSection, `help:${targetSection}`)]) };
}
function choosePostModel(section, extra = {}) {
  const chId = selectedChannelId(extra);
  const channels = activeChannels();
  const sectionTitle = SECTION_TITLES[section] || section;
  if (!channels.length) return { text: `${sectionTitle} → выбор поста\n\nКанал не найден. Откройте «Каналы и доступ» или проверьте persistence.`, attachments: kb([[btn('📺 Каналы и доступ', 'channels:home')], ...navRows(section, `help:${section}`)]) };
  if (!chId && channels.length > 1) return { text: `${sectionTitle} → выбор канала\n\nСначала выберите канал.`, attachments: kb([...channels.map((c) => [btn(channelTitle(c), `${section}:choose_post`, { channelId: channelIdOf(c) })]), ...navRows(section, `help:${section}`)]) };
  const posts = listPosts(chId);
  if (!posts.length) return { text: `${sectionTitle} → выбор поста\n\nКанал: ${channelTitle(channels.find((c) => channelIdOf(c) === chId) || { channelId: chId })}\n\nПостов пока нет. Перешлите пост из канала в бот.`, attachments: kb([[btn('🔄 Обновить список', `${section}:choose_post`, { channelId: chId })], ...navRows(section, `help:${section}`)]) };
  return { text: `${sectionTitle} → выбор поста\n\nКанал: ${channelTitle(channels.find((c) => channelIdOf(c) === chId) || { channelId: chId })}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments: kb([...posts.map((p, i) => [btn(postTitle(p, i), `${section}:post`, { channelId: chId, commentKey: postKey(p), postId: norm(p.postId) })]), ...navRows(section, `help:${section}`)]) };
}
function postModel(section, extra = {}) {
  const commentKey = norm(extra.commentKey);
  const post = findPost(commentKey, extra.channelId);
  const sectionTitle = SECTION_TITLES[section] || section;
  if (!post) return { text: `${sectionTitle} → пост\n\nПост не найден. Вернитесь к списку постов.`, attachments: kb([[btn('📌 К списку постов', `${section}:choose_post`, { channelId: extra.channelId })], ...navRows(section, `help:${section}`)]) };
  const postName = clip(post.originalText || post.title || post.postTitle || post.linkedByName || post.postId || 'Пост', 80);
  if (section === 'comments') {
    const rows = ['comments:enable','comments:disable','comments:open_discussion','comments:remove_button','comments:restore_button','comments_banner:home','comments_photo:home','comments_reactions:home'].map((r) => routeItem(r)).filter(Boolean).map((item) => [btn(label(item), item.route, { commentKey, channelId: extra.channelId })]);
    rows.push([btn('🧪 Debug поста', 'comments:debug_post', { commentKey, channelId: extra.channelId })]);
    rows.push([btn('📌 К списку постов', 'comments:choose_post', { channelId: extra.channelId })]);
    return { text: `💬 Комментарии → пост\n\nПост: ${postName}\nКомментарии: ${post.commentsDisabled ? 'выключены' : 'включены'}\n\nВыберите действие.`, attachments: kb([...rows, ...navRows('comments', 'help:comments')]) };
  }
  if (section === 'moderation') {
    const routes = ['moderation:enable_filter','moderation:disable_filter','moderation:basic_words','moderation:manual_words','moderation:logs','moderation:test_comment','moderation:ai_enable'];
    return { text: `🛡 Модерация → пост\n\nПост: ${postName}\n\nЗдесь настраиваются только правила модерации конкретного поста.`, attachments: kb([...routes.map((r) => routeItem(r)).filter(Boolean).map((item) => [btn(label(item), item.route, { commentKey, channelId: extra.channelId })]), [btn('📌 К списку постов', 'moderation:choose_post', { channelId: extra.channelId })], ...navRows('moderation', 'help:moderation')]) };
  }
  if (section === 'gifts') {
    const routes = ['gifts:create','gifts:step_1_channel_post','gifts:step_2_file_or_link','gifts:step_3_message','gifts:step_4_confirm','gifts:test_send','gifts:check_subscription'];
    return { text: `🎁 Подарки → пост\n\nПост: ${postName}\n\nСоздайте или настройте подарок для этого поста.`, attachments: kb([...routes.map((r) => routeItem(r)).filter(Boolean).map((item) => [btn(label(item), item.route, { commentKey, channelId: extra.channelId })]), [btn('📌 К списку постов', 'gifts:choose_post', { channelId: extra.channelId })], ...navRows('gifts', 'help:gifts')]) };
  }
  if (section === 'buttons') {
    const routes = ['buttons:add','buttons:list','buttons:edit','buttons:delete','buttons:preview'];
    return { text: `⚪ Кнопки → пост\n\nПост: ${postName}\n\nНастройте CTA-кнопки под этим постом.`, attachments: kb([...routes.map((r) => routeItem(r)).filter(Boolean).map((item) => [btn(label(item), item.route, { commentKey, channelId: extra.channelId })]), [btn('📌 К списку постов', 'buttons:choose_post', { channelId: extra.channelId })], ...navRows('buttons', 'help:buttons')]) };
  }
  return { text: `${sectionTitle} → пост\n\nПост: ${postName}\n\nДействие осталось внутри раздела ${sectionTitle}.`, attachments: kb([[btn('📌 К списку постов', `${section}:choose_post`, { channelId: extra.channelId })], ...navRows(section, `help:${section}`)]) };
}
function statusScreen(route, extra = {}) {
  const item = routeItem(route);
  const section = owner(route);
  if (!item) return null;
  if (item.status === 'pro_only' || item.status === 'business_only') {
    const tariff = item.status === 'business_only' ? 'Business' : 'Pro';
    return { text: `${item.title}\n\nЭта функция входит в тариф ${tariff}.\n\nОна уже есть в production-карте и будет подключена через систему доступов: admin + channel + tariff.`, attachments: kb([[btn('🎁 Попробовать бесплатно', 'billing:trial')], [btn('💳 Купить подписку', 'billing:buy')], [btn('📋 Мой тариф', 'billing:my_plan')], ...navRows(section, `help:${section}`)]) };
  }
  if (item.status === 'coming_soon') {
    return { text: `${item.title}\n\nФункция запланирована в production-карте и будет включена отдельным релизом.`, attachments: kb([...navRows(section, `help:${section}`)]) };
  }
  if (item.status === 'disabled') {
    return { text: `${item.title}\n\nФункция временно выключена для безопасности.`, attachments: kb([...navRows(section, `help:${section}`)]) };
  }
  return null;
}
async function commentsToggle(route, extra = {}, update = {}) {
  const commentKey = norm(extra.commentKey);
  if (!commentKey) return postModel('comments', extra);
  try {
    const { setPostCommentsEnabled } = require('./services/postEditorService');
    await setPostCommentsEnabled({ commentKey, enabled: route === 'comments:enable', actorId: userId(update), actorName: 'admin', config: require('./config') });
    return { text: `💬 Комментарии\n\nГотово: комментарии ${route === 'comments:enable' ? 'включены' : 'выключены'}.`, attachments: kb([[btn('↩️ К посту', 'comments:post', { commentKey, channelId: extra.channelId })], [btn('📌 К списку постов', 'comments:choose_post', { channelId: extra.channelId })], ...navRows('comments', 'help:comments')]) };
  } catch (e) {
    return { text: `💬 Комментарии\n\nНе удалось изменить комментарии.\n${e?.message || String(e)}`, attachments: kb([[btn('↩️ К посту', 'comments:post', { commentKey, channelId: extra.channelId })], ...navRows('comments', 'help:comments')]) };
  }
}
async function model(routeRaw, extra = {}, update = {}) {
  const route = canonical(routeRaw);
  if (route === 'main:home') return mainModel();
  const item = routeItem(route);
  const ns = owner(route);
  if (route.endsWith(':home') && ns && ns !== 'help') return sectionHomeModel(ns);
  if (route.startsWith('help:')) return helpModel(route.split(':')[1] || 'help');
  if (route.endsWith(':choose_post')) return choosePostModel(ns, extra);
  if (route.endsWith(':post')) return postModel(ns, extra);
  if (route === 'comments:enable' || route === 'comments:disable') return commentsToggle(route, extra, update);
  if (route === 'comments:debug_post') return { text: `🧪 Debug поста\n\ncommentKey: ${norm(extra.commentKey) || 'не найден'}\nowner: comments\nroute: comments:debug_post`, attachments: kb([[btn('↩️ К посту', 'comments:post', extra)], ...navRows('comments', 'help:comments')]) };
  const gated = statusScreen(route, extra); if (gated) return gated;
  if (item) return { text: `${item.title}\n\nФункция находится в разделе: ${SECTION_TITLES[item.owner] || item.owner}.\nСтатус: ${item.status}.\nТариф: ${item.tariffGate}.`, attachments: kb([...navRows(item.owner, item.helpRoute || `help:${item.owner}`)]) };
  return null;
}
async function logoAttachment() { if (cachedLogoAttachment) return clone(cachedLogoAttachment); if (!fs.existsSync(LOGO_PATH)) return null; try { const api = require('./services/maxApi'); const config = require('./config'); const buffer = fs.readFileSync(LOGO_PATH); const init = await api.createUpload({ botToken: config.botToken, type: 'image' }); const uploaded = await api.uploadBinaryToUrl({ uploadUrl: init?.url, botToken: config.botToken, buffer, fileName: 'adminkit_chat_logo.png', mimeType: 'image/png' }); cachedLogoAttachment = api.buildUploadAttachmentPayload({ uploadType: 'image', uploadInitResponse: init, uploadResponse: uploaded }); return clone(cachedLogoAttachment); } catch { return null; } }
async function render(update = {}, routeRaw = 'main:home', forceSend = false) {
  const route = canonical(routeRaw);
  const api = require('./services/maxApi'); const config = require('./config'); const t = target(update); const extra = payload(update); let m = await model(route, extra, update); if (!m) return { ok: false, reason: 'not_owned', route };
  if (m.logo) { const logo = await logoAttachment(); if (logo) m.attachments = [logo, ...(m.attachments || [])]; }
  const cbid = callbackId(update); if (cbid) { try { await api.answerCallback({ botToken: config.botToken, callbackId: cbid }); } catch {} }
  const mid = messageId(update); if (mid && !forceSend) { try { await api.editMessage({ botToken: config.botToken, messageId: mid, notify: false, text: m.text, attachments: m.attachments }); return { ok: true, mode: 'edit', route, owner: owner(route), runtimeVersion: RUNTIME }; } catch {} }
  if (!t.userId && !t.chatId) return { ok: false, reason: 'target_missing', route };
  const old = lastMenus.get(t.key); if (old?.messageId) { try { await api.deleteMessage({ botToken: config.botToken, messageId: old.messageId, timeoutMs: 1600 }); } catch {} }
  const sent = await api.sendMessage({ botToken: config.botToken, userId: t.userId || undefined, chatId: t.userId ? undefined : t.chatId, notify: false, text: m.text, attachments: m.attachments }); const sid = responseMessageId(sent); if (sid) lastMenus.set(t.key, { messageId: sid, ts: Date.now() }); return { ok: true, mode: 'send', route, owner: owner(route), messageIdSaved: Boolean(sid), runtimeVersion: RUNTIME };
}
function runtimeStress() {
  const routes = ['main:home', ...map().MAIN_MENU, 'comments:home','comments_banner:home','comments_photo:home','comments_reactions:home','comments:choose_post','gifts:choose_post','buttons:choose_post','moderation:choose_post','billing:home','referrals:home'];
  const checks = routes.map((route) => ({ route, owner: owner(route), owned: owned(route), itemExists: route === 'main:home' || Boolean(routeItem(route)) }));
  return { ok: checks.every((x) => x.owned && x.itemExists), total: checks.length, passed: checks.filter((x) => x.owned && x.itemExists).length, checks };
}
function sendText(res, lines) { noCache(res); return res.type('text/plain').send(lines.join('\n') + '\n'); }
function sendRuntime(res) { const s = runtimeStress(); return sendText(res, ['OK: ' + (s.ok ? 'PRODUCTION_MENU_RUNTIME_READY' : 'PRODUCTION_MENU_RUNTIME_FAIL'), 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'usesMap: production-menu-map-v2', 'noClientCommentKey: true_except_debug_post', 'mainMenuSource: production_map', 'sectionMenusSource: production_map_children', 'routesTotal: ' + s.total, 'routesPassed: ' + s.passed]); }
function sendEvents(req, res) { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, events: events.slice(-100) }); }
function installExpressPatch() {
  if (Module._load.__cc6525ProductionMenuRuntimePatch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6525Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6525ProductionMenuRuntime) {
          app.__cc6525ProductionMenuRuntime = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/production-menu-runtime') return sendRuntime(res);
            if (route === '/debug/production-menu-events') return sendEvents(req, res);
            return next();
          });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => {
            const routeText = String(route || '').toLowerCase();
            if (!routeText.includes('/webhook')) return oldPost(route, ...handlers);
            return oldPost(route, async (req, res, next) => {
              try {
                const routeAction = canonical(rawAction(req.body || {}));
                const shouldHandle = isStart(req.body || {}) || owned(routeAction);
                logEvent({ route: routeAction, owner: owner(routeAction), handled: shouldHandle, isStart: isStart(req.body || {}), payloadRaw: payloadRaw(req.body || {}), text: text(req.body || {}) });
                if (isStart(req.body || {})) return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, 'main:home', true) });
                if (owned(routeAction)) return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, routeAction) });
                return next();
              } catch (e) { logEvent({ error: e?.message || String(e), route: rawAction(req.body || {}) }); return next(); }
            }, ...handlers);
          };
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6525Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6525ProductionMenuRuntimePatch = true;
  Module._load = patchedLoad;
}
function install() { process.env.BUILD_VERSION = RUNTIME; process.env.RUNTIME_VERSION = RUNTIME; process.env.BUILD_SOURCE_MARKER = SOURCE; installExpressPatch(); return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE }; }
module.exports = { RUNTIME, SOURCE, install, runtimeStress, owner, owned, canonical };
