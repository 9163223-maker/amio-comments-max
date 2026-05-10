'use strict';

// CC6.5.4.5 — Production Menu V3 Renderer.
// One canonical UI renderer based only on Production Menu Map V3.
// Legacy handlers can still keep deep business logic, but they no longer own menu rendering.

const Module = require('module');
const menuMap = require('./production-menu-map-v3-fixed');
const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC6.5.4.5';
const SOURCE = 'adminkit-CC6.5.4.5-production-menu-v3-renderer';
const events = [];

const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const lower = (value) => norm(value).toLowerCase();
const clean = (value) => (db.clean ? db.clean(value) : norm(value).replace(/^ck:/i, '').replace(/^post:/i, ''));
const short = (value, limit = 42) => {
  const text = norm(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};
const rowsOfTwo = (buttons) => {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
};

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}
function parseJson(value) { try { const parsed = JSON.parse(String(value || '')); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
function cb(update = {}) { return db.cb ? db.cb(update) : (update.callback || update.data?.callback || null); }
function payload(update = {}) { return db.payload ? db.payload(update) : parseJson(cb(update)?.payload || update.payload || ''); }
function msg(update = {}) { return db.msg ? db.msg(update) : (update.message || update.data?.message || cb(update)?.message || null); }
function textOf(update = {}) { return db.text ? db.text(update) : norm(msg(update)?.text || msg(update)?.body?.text || ''); }
function actionOf(update = {}) { const data = payload(update); return lower(data.action || data.route || data.cmd || db.action?.(update) || ''); }
function userIdOf(update = {}) { return db.adminId ? db.adminId(update) : norm(update.user_id || update.userId || msg(update)?.sender?.user_id || msg(update)?.recipient?.user_id || ''); }
function chatIdOf(update = {}) { return db.chatId ? db.chatId(update) : norm(msg(update)?.recipient?.chat_id || msg(update)?.chat_id || ''); }
function messageIdOf(update = {}) { return db.messageId ? db.messageId(update) : norm(cb(update)?.message?.id || msg(update)?.id || msg(update)?.message_id || ''); }
function callbackIdOf(update = {}) { return db.callbackId ? db.callbackId(update) : norm(cb(update)?.callback_id || cb(update)?.id || ''); }
function button(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action: route, ...extra }) }; }
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean).filter((row) => row.length) } }]; }
function resultMessageId(result) { const m = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id|mid)"\s*:\s*"([^"{}]+)"/); return m ? m[1] : ''; }
function log(event) { events.push({ ts: Date.now(), ...event }); while (events.length > 160) events.shift(); }

const routeSet = new Set(menuMap.items.map((item) => item.route));
const itemByRoute = new Map(menuMap.items.map((item) => [item.route, item]));
const sectionByOwner = new Map(menuMap.sections.map((section) => [section.owner, section]));

const aliases = {
  ak_main_menu: 'main:home', main_menu: 'main:home', menu_main: 'main:home', home: 'main:home', start: 'main:home', '/start': 'main:home', menu: 'main:home', '/menu': 'main:home',
  channels_menu: 'channels:home', 'access:channel_status': 'channels:access', 'channels:verify': 'channels:verify_access',
  comments_menu: 'comments:home', comments_choose_post: 'comments:choose_post', comments_post_card: 'comments:post', comments_open_discussion: 'comments:toggle',
  comments_banner_home: 'comments_banner:home', comments_photo_home: 'comments_photo:home', comments_reactions_home: 'comments_reactions:home',
  mod_start: 'moderation:home', moderation_menu: 'moderation:home', mod_channel_rules: 'moderation:channel', mod_choose_post: 'moderation:choose_post', mod_post_rules: 'moderation:post',
  mod_toggle_enabled: 'moderation:toggle_filter', mod_toggle_preset: 'moderation:base_words', mod_toggle_links: 'moderation:toggle_links', mod_toggle_invites: 'moderation:toggle_invites', mod_toggle_ai: 'moderation:toggle_ai', mod_base_words: 'moderation:base_words', mod_add_stopword: 'moderation:add_word', mod_logs: 'moderation:logs', mod_test_comment: 'moderation:test_comment',
  editor_menu: 'editor:home', buttons_menu: 'buttons:home', gift_menu: 'gifts:home', gifts_menu: 'gifts:home', stats_menu: 'stats:home', help_menu: 'help:home'
};
function canonicalRoute(raw = '') {
  const route = lower(raw);
  if (aliases[route]) return aliases[route];
  if (route === 'comments:banner_link') return 'comments_banner:home';
  if (route === 'comments:photo_link') return 'comments_photo:home';
  if (route === 'comments:reactions_link') return 'comments_reactions:home';
  if (route.endsWith(':help')) return `help:${route.split(':')[0]}`;
  if (route.endsWith(':section_home')) return `${route.split(':')[0]}:home`;
  if (route.endsWith(':main_menu')) return 'main:home';
  if (route.includes(':')) return route;
  return route;
}
function ownerOf(route) {
  const canonical = canonicalRoute(route);
  if (canonical === 'main:home') return 'main';
  const prefix = canonical.split(':')[0];
  if (prefix === 'help' && canonical !== 'help:home') return 'help';
  return prefix;
}
function sectionTitle(owner) {
  if (owner === 'main') return '🐋 АдминКИТ';
  return sectionByOwner.get(owner)?.title || owner;
}
function isStart(update = {}) {
  if (cb(update)) return false;
  const text = lower(textOf(update));
  const type = lower(update.update_type || update.type || update.event_type || update.data?.update_type || '');
  const startPayload = lower(update.start_payload || update.payload || update.data?.payload || '');
  return type.includes('start') || ['start', '/start', 'menu', '/menu', 'меню'].includes(text) || ['start', 'menu', 'main'].includes(startPayload);
}
function isV3Route(route) { return route === 'main:home' || routeSet.has(route) || route.startsWith('help:'); }
function navRows(owner) { return [[button('❓ Помощь', `help:${owner}`), button('↩️ Раздел', `${owner}:home`)], [button('🏠 Главное меню', 'main:home')]]; }
function visibleChildren(owner, parent) {
  return menuMap.items.filter((item) => item.owner === owner && item.visible !== false && item.parent === parent && !item.route.endsWith(':help') && !item.route.endsWith(':section_home') && !item.route.endsWith(':main_menu'));
}
function targetRouteFor(item) {
  if (item.route === 'comments:banner_link') return 'comments_banner:home';
  if (item.route === 'comments:photo_link') return 'comments_photo:home';
  if (item.route === 'comments:reactions_link') return 'comments_reactions:home';
  return item.route;
}
function cleanTitle(title) { return norm(title).replace('✅ / ⏸ ', ''); }

async function answerCallback(update, notification = '') {
  const callbackId = callbackIdOf(update);
  if (!callbackId) return;
  try { await api.answerCallback({ botToken: config.botToken, callbackId, notification }); } catch {}
}
async function setActiveMenu(userId, menuMessageId) { try { if (userId && menuMessageId && db.setMenu) await db.setMenu(userId, menuMessageId); } catch {} }
async function getActiveMenu(userId) { try { return userId && db.getMenu ? await db.getMenu(userId) : ''; } catch { return ''; } }
async function sendOrEdit(update, packet, preferEdit = true) {
  const userId = userIdOf(update);
  const messageId = preferEdit ? messageIdOf(update) : '';
  if (messageId) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId, text: packet.text, attachments: packet.attachments || [], notify: false });
      await setActiveMenu(userId, messageId);
      return { mode: 'edit', messageId };
    } catch (error) { log({ level: 'warn', where: 'editMessage', error: error?.message || String(error) }); }
  }
  const oldMenu = await getActiveMenu(userId);
  if (oldMenu) { try { await api.deleteMessage({ botToken: config.botToken, messageId: oldMenu, timeoutMs: 1200 }); } catch {} }
  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  if (userId) args.userId = userId;
  else if (chatIdOf(update)) args.chatId = chatIdOf(update);
  else return { mode: 'skip', reason: 'target_missing' };
  const result = await api.sendMessage(args);
  const sentMessageId = resultMessageId(result);
  await setActiveMenu(userId, sentMessageId);
  return { mode: 'send', messageId: sentMessageId };
}

function channelId(channel = {}) { return norm(channel.channelId || channel.channel_id || channel.id || channel.chatId || channel.chat_id || ''); }
function channelTitle(channel = {}) { return norm(channel.title || channel.channelTitle || channel.name || channel.chatTitle || channelId(channel) || 'Канал'); }
function postKey(post = {}) { return clean(post.commentKey || post.key || (post.channelId && post.postId ? `${post.channelId}:${post.postId}` : '')); }
function postTitle(post = {}) { return norm(post.title || post.originalText || post.postTitle || post.text || post.postId || 'Пост'); }
function isServicePostTitle(value = '') {
  const text = lower(value);
  return !text || /админкит|главное меню|модерац|выберите|помощь|текущие настройки|нажатие меняет|правила/.test(text);
}
async function channelsFor(userId) { try { return db.getChannels ? await db.getChannels(userId) : []; } catch { return []; } }
async function activeChannel(userId, explicitChannelId = '') {
  const channels = await channelsFor(userId);
  return channels.find((channel) => channelId(channel) === explicitChannelId) || channels[0] || null;
}
function localPosts(channel) {
  try {
    const store = require('./store');
    const rows = typeof store.listPostsByChannel === 'function' ? store.listPostsByChannel(channel, 200) : Object.values(store.store?.posts || {});
    return rows.filter((post) => !channel || String(post.channelId || '') === String(channel));
  } catch { return []; }
}
async function importLocalPosts(userId, channel) {
  if (!db.upsertPost) return 0;
  let imported = 0;
  for (const post of localPosts(channel)) {
    const postId = norm(post.postId || post.messageId || '');
    const title = postTitle(post);
    if (!postId || isServicePostTitle(title)) continue;
    const saved = await db.upsertPost(userId, channel, postId, title, { source: 'v3_renderer_local_sync', commentKey: postKey(post), channelTitle: post.channelTitle || '' }, post.messageId || postId).catch(() => null);
    if (saved) imported += 1;
  }
  return imported;
}
async function postsFor(userId, channel) {
  if (!userId || !channel) return [];
  await importLocalPosts(userId, channel).catch(() => 0);
  const rows = db.getPosts ? await db.getPosts(userId, channel, 100).catch(() => []) : [];
  const byKey = new Map();
  for (const post of rows || []) {
    const title = postTitle(post);
    if (!isServicePostTitle(title)) byKey.set(postKey(post), { ...post, title });
  }
  for (const post of localPosts(channel)) {
    const title = postTitle(post);
    const key = postKey(post);
    const id = norm(post.postId || post.messageId || '');
    if (!key || !id || isServicePostTitle(title)) continue;
    if (!byKey.has(key)) byKey.set(key, { channelId: channel, postId: id, commentKey: key, title, messageId: post.messageId || id });
  }
  return [...byKey.values()].slice(0, 100);
}
async function postFromPayload(userId, data = {}) {
  const channel = norm(data.channelId || data.channel_id || '');
  const key = clean(data.commentKey || data.key || '');
  const id = norm(data.postId || data.post_id || '');
  const posts = await postsFor(userId, channel);
  return posts.find((post) => (key && postKey(post) === key) || (id && String(post.postId) === String(id))) || { channelId: channel, postId: id, commentKey: key || (channel && id ? `${channel}:${id}` : ''), title: id || 'Пост' };
}

function mainPacket() {
  const buttons = menuMap.mainMenu.map((route) => {
    const item = itemByRoute.get(route);
    const title = item?.title || sectionTitle(route.split(':')[0]);
    return button(title.replace('Каналы и доступ', 'Каналы').replace('Покупка и тарифы', 'Тарифы').replace('Реферальная программа', 'Рефералы').replace('Подарки / лид-магниты', 'Подарки'), route);
  });
  return { text: '🐋 АдминКИТ\n\nПанель управления MAX-каналом.\nРежим теста: PRO открыт.', attachments: keyboard(rowsOfTwo(buttons)) };
}
async function sectionHomePacket(owner, userId, data = {}) {
  if (owner === 'channels') return channelsPacket(userId, data);
  if (owner === 'moderation') return moderationPacket(userId, data);
  const section = sectionByOwner.get(owner);
  const children = visibleChildren(owner, `${owner}:home`);
  const buttons = children.map((item) => button(cleanTitle(item.title), targetRouteFor(item), data));
  return { text: `${section?.title || owner}\n\n${section?.description || 'Выберите действие.'}`, attachments: keyboard([...rowsOfTwo(buttons), ...navRows(owner)]) };
}
async function channelsPacket(userId, data = {}) {
  const channels = await channelsFor(userId);
  const channel = await activeChannel(userId, norm(data.channelId || ''));
  const rows = [];
  channels.slice(0, 6).forEach((item) => rows.push([button(`📺 ${short(channelTitle(item), 34)}`, 'channels:select', { channelId: channelId(item) })]));
  rows.push([button('➕ Подключить', 'channels:connect'), button('✅ Проверить права', 'channels:verify_access', { channelId: channel ? channelId(channel) : '' })]);
  rows.push([button('🔐 Доступы', 'channels:access', { channelId: channel ? channelId(channel) : '' })]);
  return { text: `📺 Каналы\n\nПодключено: ${channels.length}.\n${channel ? `Активный: ${channelTitle(channel)}` : 'Канал пока не выбран.'}`, attachments: keyboard([...rows, ...navRows('channels')]) };
}
async function verifyAccessPacket(userId, data = {}) {
  const channel = await activeChannel(userId, norm(data.channelId || ''));
  if (!channel) return { text: '📺 Каналы\n\nКанал не подключён. Добавьте бота администратором в канал и перешлите любой пост.', attachments: keyboard([[button('➕ Подключить', 'channels:connect')], ...navRows('channels')]) };
  const id = channelId(channel);
  let ok = false;
  let status = '';
  try { await api.getChat({ botToken: config.botToken, chatId: id }); ok = true; } catch {}
  try {
    const member = await api.getBotChatMember({ botToken: config.botToken, chatId: id });
    ok = true;
    status = member?.is_owner ? '✅ владелец' : member?.is_admin ? '✅ администратор' : '✅ доступ есть';
  } catch {}
  return { text: ['📺 Каналы', '', `Канал: ${channelTitle(channel)}`, `Права бота: ${ok ? '✅ проверены' : '❌ не проверены'}`, ok ? `Статус: ${status || '✅ доступ есть'}` : 'Проверьте, что бот добавлен администратором.'].join('\n'), attachments: keyboard([[button('🔄 Проверить ещё раз', 'channels:verify_access', { channelId: id }), button('🔐 Доступы', 'channels:access', { channelId: id })], ...navRows('channels')]) };
}
async function accessPacket(userId, data = {}) {
  const channels = await channelsFor(userId);
  const channel = await activeChannel(userId, norm(data.channelId || ''));
  const posts = channel ? await postsFor(userId, channelId(channel)) : [];
  return { text: ['🔐 Доступы канала', '', channel ? `Канал: ${channelTitle(channel)}` : 'Канал не выбран', 'Режим теста: PRO открыт', `Подключённых каналов: ${channels.length}`, `Постов в памяти: ${posts.length}`].join('\n'), attachments: keyboard([[button('✅ Проверить права', 'channels:verify_access', { channelId: channel ? channelId(channel) : '' })], ...navRows('channels')]) };
}
async function choosePostPacket(owner, userId, data = {}) {
  const channel = await activeChannel(userId, norm(data.channelId || ''));
  if (!channel) return { text: `${sectionTitle(owner)} → выбор поста\n\nКанал не подключён.`, attachments: keyboard([[button('📺 Каналы', 'channels:home')], ...navRows(owner)]) };
  const id = channelId(channel);
  const posts = await postsFor(userId, id);
  const target = routeSet.has(`${owner}:post`) ? `${owner}:post` : `${owner}:home`;
  const rows = posts.slice(0, 10).map((post, index) => [button(`${index + 1}. ${short(postTitle(post), 38)}`, target, { channelId: id, postId: post.postId, commentKey: postKey(post) })]);
  rows.push([button('🔄 Обновить список', `${owner}:choose_post`, { channelId: id })]);
  return { text: `${sectionTitle(owner)} → выбор поста\n\n📺 ${channelTitle(channel)}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments: keyboard([...rows, ...navRows(owner)]) };
}
async function commentsPostPacket(userId, data = {}) {
  const post = await postFromPayload(userId, data);
  const key = post.commentKey || data.commentKey;
  let enabled = true;
  try { const store = require('./store'); enabled = store.getPost?.(key)?.commentsDisabled !== true; } catch {}
  const base = { channelId: post.channelId || data.channelId, postId: post.postId || data.postId, commentKey: key };
  return { text: `💬 Комментарии → пост\n\n📝 ${short(postTitle(post), 64)}\nКомментарии: ${enabled ? '✅ включены' : '⏸ выключены'}`, attachments: keyboard([[button(enabled ? '⏸ Выключить комментарии' : '✅ Включить комментарии', 'comments:toggle', base)], [button('🖼 Баннер', 'comments_banner:home', base), button('❤️ Реакции', 'comments_reactions:home', base)], [button('📌 К списку', 'comments:choose_post', base)], ...navRows('comments')]) };
}
async function commentsTogglePacket(userId, data = {}) {
  const post = await postFromPayload(userId, data);
  const key = post.commentKey || data.commentKey;
  try {
    const store = require('./store');
    const current = store.getPost?.(key) || post;
    const nextEnabled = current.commentsDisabled === true;
    store.savePost?.(key, { ...current, commentsDisabled: !nextEnabled, commentsEnabled: nextEnabled });
  } catch {}
  return commentsPostPacket(userId, { ...data, channelId: post.channelId, postId: post.postId, commentKey: key });
}
function scopeOf(userId, data = {}) {
  const channelIdValue = norm(data.channelId || data.channel_id || '');
  const postIdValue = norm(data.postId || data.post_id || '');
  return { adminId: userId, channelId: channelIdValue, scopeType: postIdValue ? 'post' : 'channel', postId: postIdValue, commentKey: clean(data.commentKey || (channelIdValue && postIdValue ? `${channelIdValue}:${postIdValue}` : '')) };
}
function mark(value) { return value ? '✅' : '❌'; }
async function moderationPacket(userId, data = {}, prefix = '') {
  const channel = await activeChannel(userId, norm(data.channelId || ''));
  if (!channel) return { text: '🛡 Модерация\n\nСначала подключите канал.', attachments: keyboard([[button('📺 Каналы', 'channels:home')], ...navRows('moderation')]) };
  const cId = channelId(channel);
  const scope = scopeOf(userId, { ...data, channelId: cId });
  const rules = db.getRules ? await db.getRules(scope).catch(() => ({})) : {};
  const post = scope.postId ? await postFromPayload(userId, scope) : null;
  const customCount = Array.isArray(rules.customBlocklist) ? rules.customBlocklist.length : 0;
  const base = { channelId: cId, postId: scope.postId, commentKey: scope.commentKey };
  return { text: [prefix, '🛡 Модерация', `📺 ${channelTitle(channel)}`, `🎯 ${scope.postId ? `Пост: ${short(postTitle(post), 38)}` : 'Весь канал'}`, '', `Фильтр ${mark(rules.enabled !== false)} · База ${mark(rules.applyPresetCommon !== false)}`, `Ссылки ${rules.blockLinks ? '❌' : '✅'} · Инвайты ${rules.blockInvites === false ? '✅' : '❌'} · AI ${mark(rules.aiEnabled)}`, `Стоп-слова: ${customCount}`].filter(Boolean).join('\n'), attachments: keyboard([[button('🛡 Канал', 'moderation:channel', { channelId: cId }), button('🎯 Пост', 'moderation:choose_post', { channelId: cId })], [button(rules.enabled === false ? '✅ Фильтр' : '⏸ Фильтр', 'moderation:toggle_filter', base), button(rules.applyPresetCommon === false ? '🧱 База вкл' : '🧱 База выкл', 'moderation:base_words', base)], [button(rules.blockLinks ? '🔗 Разрешить' : '🔗 Запретить', 'moderation:toggle_links', base), button(rules.blockInvites === false ? '✉️ Запретить' : '✉️ Разрешить', 'moderation:toggle_invites', base)], [button(rules.aiEnabled ? '🤖 AI выкл' : '🤖 AI вкл', 'moderation:toggle_ai', base), button('➕ Стоп-слово', 'moderation:add_word', base)], [button('📋 Журнал', 'moderation:logs', base), button('🧪 Проверка', 'moderation:test_comment', base)], ...navRows('moderation')]) };
}
async function moderationTogglePacket(userId, route, data = {}) {
  const scope = scopeOf(userId, data);
  const rules = db.getRules ? await db.getRules(scope).catch(() => ({})) : {};
  const next = { ...rules };
  if (route === 'moderation:toggle_filter') next.enabled = rules.enabled === false;
  if (route === 'moderation:base_words') next.applyPresetCommon = rules.applyPresetCommon === false;
  if (route === 'moderation:toggle_links') next.blockLinks = !rules.blockLinks;
  if (route === 'moderation:toggle_invites') next.blockInvites = rules.blockInvites === false;
  if (route === 'moderation:toggle_ai') next.aiEnabled = !rules.aiEnabled;
  if (db.saveRules) await db.saveRules(scope, next).catch(() => {});
  return moderationPacket(userId, data);
}
async function stopWordStartPacket(userId, data = {}) {
  const scope = scopeOf(userId, data);
  if (db.setFlow) await db.setFlow(userId, { flow: 'v3_add_stop_word', scope, createdAt: Date.now() }).catch(() => {});
  return { text: '➕ Стоп-слово\n\nПришлите одно слово или фразу следующим сообщением. Я добавлю его в ручной список и верну вас в меню.', attachments: keyboard([[button('↩️ Назад', scope.postId ? 'moderation:post' : 'moderation:channel', scope)], ...navRows('moderation')]) };
}
async function handleStopWordFlow(update = {}) {
  if (cb(update)) return false;
  const userId = userIdOf(update);
  if (!userId || !db.getFlow) return false;
  const flow = await db.getFlow(userId).catch(() => null);
  if (!flow || flow.flow !== 'v3_add_stop_word') return false;
  const word = norm(textOf(update)).slice(0, 80);
  if (!word) return false;
  const rules = db.getRules ? await db.getRules(flow.scope).catch(() => ({})) : {};
  const list = Array.isArray(rules.customBlocklist) ? rules.customBlocklist.map(norm).filter(Boolean) : [];
  if (db.saveRules) await db.saveRules(flow.scope, { customBlocklist: [...new Set([...list, lower(word)])] }).catch(() => {});
  if (db.clearFlow) await db.clearFlow(userId).catch(() => {});
  const packet = await moderationPacket(userId, flow.scope, `✅ Стоп-слово добавлено: ${word}\n`);
  const result = await sendOrEdit(update, packet, false);
  return { ok: true, handledBy: RUNTIME, route: 'moderation:add_word:flow_text', word, result };
}
async function baseWordsPacket(userId, data = {}) {
  const scope = scopeOf(userId, data);
  await moderationTogglePacket(userId, 'moderation:base_words', scope);
  return moderationPacket(userId, scope);
}
async function genericPostPacket(owner, userId, data = {}) {
  if (owner === 'comments') return commentsPostPacket(userId, data);
  if (owner === 'moderation') return moderationPacket(userId, data);
  const post = await postFromPayload(userId, data);
  const children = visibleChildren(owner, `${owner}:post`);
  const base = { channelId: post.channelId || data.channelId, postId: post.postId || data.postId, commentKey: post.commentKey || data.commentKey };
  const buttons = children.map((item) => button(cleanTitle(item.title), targetRouteFor(item), base));
  return { text: `${sectionTitle(owner)} → пост\n\n📝 ${short(postTitle(post), 64)}\n\nВыберите действие.`, attachments: keyboard([...rowsOfTwo(buttons), [button('📌 К списку', `${owner}:choose_post`, base)], ...navRows(owner)]) };
}
async function helpPacket(route) {
  const helpOwner = route.split(':')[1] || 'home';
  const title = helpOwner === 'home' ? 'АдминКИТ' : sectionTitle(helpOwner);
  return { text: `❓ Помощь\n\nРаздел: ${title}\n\nВсе экраны строятся по Production Menu Map V3. Один раздел — один владелец маршрутов.`, attachments: keyboard([[button('🏠 Главное меню', 'main:home')]]) };
}
async function genericFunctionPacket(owner, route, data = {}) {
  const item = itemByRoute.get(route);
  const section = sectionByOwner.get(owner);
  const text = `${item?.title || section?.title || route}\n\nФункция открыта в тестовом PRO-режиме.\nЭкран подключён к Production Menu Map V3.`;
  return { text, attachments: keyboard(navRows(owner)) };
}
async function packetForRoute(route, userId, data = {}) {
  if (route === 'main:home') return mainPacket();
  if (route === 'channels:home') return channelsPacket(userId, data);
  if (route === 'channels:verify_access' || route === 'channels:select') return verifyAccessPacket(userId, data);
  if (route === 'channels:access') return accessPacket(userId, data);
  if (route === 'channels:connect') return { text: '📺 Подключить канал\n\nДобавьте бота администратором в MAX-канал и перешлите сюда любой пост из этого канала.', attachments: keyboard([[button('✅ Проверить права', 'channels:verify_access')], ...navRows('channels')]) };
  if (route.startsWith('help:')) return helpPacket(route);
  if (route === 'comments:toggle') return commentsTogglePacket(userId, data);
  if (route === 'moderation:channel') return moderationPacket(userId, { ...data, postId: '', commentKey: '' });
  if (route === 'moderation:add_word' || route === 'moderation:manual_words') return stopWordStartPacket(userId, data);
  if (['moderation:toggle_filter','moderation:toggle_links','moderation:toggle_invites','moderation:toggle_ai'].includes(route)) return moderationTogglePacket(userId, route, data);
  if (route === 'moderation:base_words') return baseWordsPacket(userId, data);
  if (route === 'moderation:logs') return { text: '📋 Журнал модерации\n\nПока журнал пуст. Здесь будут последние срабатывания фильтра.', attachments: keyboard(navRows('moderation')) };
  if (route === 'moderation:test_comment') return { text: '🧪 Проверить комментарий\n\nПришлите текст для проверки следующим сообщением. Этот flow подключим следующим шагом после renderer.', attachments: keyboard(navRows('moderation')) };
  if (route.endsWith(':choose_post') || route === 'comments_banner:scope_one_post' || route === 'polls:attach_post') return choosePostPacket(ownerOf(route), userId, data);
  if (route.endsWith(':post')) return genericPostPacket(ownerOf(route), userId, data);
  const owner = ownerOf(route);
  if (route === `${owner}:home`) return sectionHomePacket(owner, userId, data);
  if (routeSet.has(route)) return genericFunctionPacket(owner, route, data);
  return false;
}
async function handleUpdate(update = {}, forcedRoute = '') {
  await db.init().catch(() => {});
  const flow = await handleStopWordFlow(update);
  if (flow) return flow;
  const raw = forcedRoute || (isStart(update) ? 'main:home' : actionOf(update));
  const route = canonicalRoute(raw);
  if (!isV3Route(route)) return false;
  const userId = userIdOf(update);
  if (!userId) return false;
  const packet = await packetForRoute(route, userId, payload(update));
  if (!packet) return false;
  await answerCallback(update, route.includes('choose_post') ? 'Выберите пост' : '');
  const result = await sendOrEdit(update, packet, !isStart(update));
  log({ route, owner: ownerOf(route), mode: result.mode });
  return { ok: true, handledBy: RUNTIME, route, owner: ownerOf(route), result };
}
function selfTest() {
  const validation = menuMap.validateMenuMapV3();
  return { ok: validation.ok, runtime: RUNTIME, sourceMarker: SOURCE, mapVersion: menuMap.VERSION, testMode: menuMap.TEST_MODE, rendererOwnsMenus: true, legacyMenuBypass: true, errors: validation.errors.length, warnings: validation.warnings.length, mainMenuRoutes: menuMap.mainMenu.length, totalRoutes: menuMap.items.length };
}
function stressTest() {
  const validation = menuMap.validateMenuMapV3();
  const ownerChecks = menuMap.sections.filter((s) => !s.internal).map((section) => {
    const homeRoute = `${section.owner}:home`;
    const hasHome = routeSet.has(homeRoute);
    const children = visibleChildren(section.owner, homeRoute).length;
    return { owner: section.owner, homeRoute, hasHome, directChildren: children };
  });
  return { ok: validation.ok && ownerChecks.every((x) => x.hasHome), runtime: RUNTIME, sourceMarker: SOURCE, validation, ownerChecks, recentEvents: events.slice(-25) };
}
function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (Module._load.__productionMenuV3Renderer) return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, alreadyInstalled: true };
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__productionMenuV3RendererWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__productionMenuV3Renderer) {
          app.__productionMenuV3Renderer = true;
          app.use((req, res, next) => {
            const path = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (path === '/debug/production-menu-v3-renderer') { noCache(res); return res.json(selfTest()); }
            if (path === '/debug/production-menu-v3-renderer-stress') { noCache(res); return res.json(stressTest()); }
            return next();
          });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => String(route || '').includes('/webhook')
            ? oldPost(route, async (req, res, next) => {
                try {
                  const handled = await handleUpdate(req.body || {}, '');
                  if (handled && handled.ok) return res.json(handled);
                } catch (error) {
                  log({ level: 'error', error: error?.message || String(error) });
                }
                return next();
              }, ...handlers)
            : oldPost(route, ...handlers);
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__productionMenuV3RendererWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__productionMenuV3Renderer = true;
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, stressTest, handleUpdate };
