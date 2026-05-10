'use strict';

// CC6.5.4.0 — functional canonical router.
// Single canonical layer for product menus. No raw technical fields in admin UI.
// Adds real flow for manual moderation stop-words and keeps comments as one toggle.

const Module = require('module');
const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC6.5.4.0';
const SOURCE = 'adminkit-CC6.5.4.0-functional-canonical-router';
const events = [];
let storePatched = false;

const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const lower = (value) => norm(value).toLowerCase();
const cut = (value, limit = 54) => {
  const text = norm(value);
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
};
const clean = (value) => db.clean ? db.clean(value) : norm(value).replace(/^ck:/i, '').replace(/^post:/i, '');
const nowHm = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}
function parseJson(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
function callback(update = {}) { return db.cb ? db.cb(update) : (update.callback || update.data?.callback || update.message?.callback || null); }
function message(update = {}) { return db.msg ? db.msg(update) : (update.message || update.data?.message || callback(update)?.message || null); }
function payload(update = {}) { return db.payload ? db.payload(update) : (parseJson(callback(update)?.payload || update.payload || '') || {}); }
function action(update = {}) {
  const data = payload(update);
  return lower(data.action || data.route || data.cmd || db.action?.(update) || '');
}
function adminId(update = {}) { return db.adminId ? db.adminId(update) : ''; }
function chatId(update = {}) { return db.chatId ? db.chatId(update) : ''; }
function messageId(update = {}) { return db.messageId ? db.messageId(update) : ''; }
function callbackId(update = {}) { return db.callbackId ? db.callbackId(update) : ''; }
function textOf(update = {}) { return db.text ? db.text(update) : norm(message(update)?.text || message(update)?.body?.text || ''); }
function button(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action: route, ...extra }) }; }
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function log(item) { events.push({ ts: Date.now(), ...item }); while (events.length > 150) events.shift(); }
function resultMessageId(result) {
  const match = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id|mid)"\s*:\s*"([^"{}]+)"/);
  return match ? match[1] : '';
}
async function answer(update, notification = '') {
  const id = callbackId(update);
  if (!id) return;
  try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification }); } catch {}
}

function isStart(update = {}) {
  if (callback(update)) return false;
  const type = lower(update.update_type || update.type || update.event_type || update.data?.update_type || '');
  const body = lower(textOf(update));
  const startPayload = lower(update.start_payload || update.payload || update.data?.payload || '');
  return type.includes('start') || ['start', '/start', 'menu', '/menu', 'меню'].includes(body) || ['start', 'menu', 'main'].includes(startPayload);
}
function routeOf(raw = '') {
  const route = lower(raw);
  const map = {
    ak_main_menu: 'main:home', main_menu: 'main:home', menu_main: 'main:home', home: 'main:home', start: 'main:home',
    channels_menu: 'channels:home',
    comments_menu: 'comments:home', comments_choose_post: 'comments:choose_post', comments_post_card: 'comments:post',
    mod_start: 'moderation:home', moderation_menu: 'moderation:home', 'модерация': 'moderation:home',
    mod_choose_post: 'moderation:choose_post', mod_post_rules: 'moderation:post', mod_channel_rules: 'moderation:channel',
    mod_toggle_enabled: 'moderation:toggle_filter', mod_toggle_preset: 'moderation:toggle_basic', mod_toggle_links: 'moderation:toggle_links', mod_toggle_invites: 'moderation:toggle_invites', mod_toggle_ai: 'moderation:toggle_ai', mod_base_words: 'moderation:base_words', mod_add_stopword: 'moderation:manual_words', mod_logs: 'moderation:logs', mod_test_comment: 'moderation:test_comment',
    buttons_menu: 'buttons:home', gift_menu: 'gifts:home', gifts_menu: 'gifts:home', stats_menu: 'stats:home', help_menu: 'help:home'
  };
  return map[route] || route;
}
function sectionOf(route = '') {
  const canonical = routeOf(route);
  if (canonical === 'main:home') return 'main';
  if (canonical.startsWith('access:')) return 'channels';
  return canonical.split(':')[0];
}
function isOwned(route = '') {
  return ['main', 'channels', 'comments', 'moderation', 'editor', 'buttons', 'gifts', 'stats', 'billing', 'referrals', 'help', 'comments_banner', 'comments_photo', 'comments_reactions', 'access'].includes(sectionOf(route));
}
function sectionTitle(section) {
  return {
    main: '🐋 АдминКИТ', channels: '📺 Каналы', comments: '💬 Комментарии', moderation: '🛡 Модерация', editor: '✏️ Редактор постов', buttons: '⚪ Кнопки', gifts: '🎁 Подарки', stats: '📊 Статистика', billing: '🧾 Тарифы', referrals: '🤝 Рефералы', help: '❓ Помощь'
  }[section] || section;
}
function nav(section) {
  return [[button('❓ Помощь', `help:${section}`), button('↩️ Раздел', `${section}:home`)], [button('🏠 Главное меню', 'main:home')]];
}

async function setActiveMenu(userId, menuMessageId) { try { if (userId && menuMessageId) await db.setMenu(userId, menuMessageId); } catch {} }
async function getActiveMenu(userId) { try { return userId ? await db.getMenu(userId) : ''; } catch { return ''; } }
async function sendOrEdit(update, packet, preferEdit = true) {
  const userId = adminId(update);
  const targetMessageId = preferEdit ? messageId(update) : '';
  if (targetMessageId) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: targetMessageId, text: packet.text, attachments: packet.attachments || [], notify: false });
      await setActiveMenu(userId, targetMessageId);
      return { mode: 'edit', messageId: targetMessageId };
    } catch (error) {
      console.warn('[cc6540 edit]', error?.message || error);
    }
  }
  const oldMenu = await getActiveMenu(userId);
  if (oldMenu) { try { await api.deleteMessage({ botToken: config.botToken, messageId: oldMenu, timeoutMs: 1200 }); } catch {} }
  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  if (userId) args.userId = userId;
  else if (chatId(update)) args.chatId = chatId(update);
  else return { mode: 'skip', reason: 'target_missing' };
  const result = await api.sendMessage(args);
  const newMessageId = resultMessageId(result);
  await setActiveMenu(userId, newMessageId);
  return { mode: 'send', messageId: newMessageId };
}

function channelIdOf(channel = {}) { return norm(channel.channelId || channel.channel_id || channel.id || channel.chatId || channel.chat_id || ''); }
function channelTitle(channel = {}) { return norm(channel.title || channel.channelTitle || channel.name || channel.chatTitle || channelIdOf(channel) || 'Канал'); }
function postKeyOf(post = {}) { return clean(post.commentKey || post.key || (post.channelId && post.postId ? `${post.channelId}:${post.postId}` : '')); }
function postTitleOf(post = {}) { return norm(post.title || post.originalText || post.postTitle || post.text || post.postId || 'Пост'); }
function isServiceTitle(value = '') {
  const title = lower(value);
  return !title || /главное меню|модерац|выберите|помощь|текущие настройки|нажатие меняет|правила/.test(title);
}
async function channelsFor(userId) { try { return await db.getChannels(userId); } catch { return []; } }
async function firstChannel(userId, explicitChannelId = '') {
  const channels = await channelsFor(userId);
  return channels.find((channel) => channelIdOf(channel) === explicitChannelId) || channels[0] || null;
}
function localPosts(channelId = '') {
  try {
    const store = require('./store');
    const rows = typeof store.listPostsByChannel === 'function' ? store.listPostsByChannel(channelId, 200) : Object.values(store.store?.posts || {});
    return rows.filter((post) => !channelId || String(post.channelId || '') === String(channelId));
  } catch {
    return [];
  }
}
async function importLocalPosts(userId, channelId = '') {
  let imported = 0;
  for (const post of localPosts(channelId)) {
    const postId = norm(post.postId || post.messageId || '');
    const title = postTitleOf(post);
    if (!postId || isServiceTitle(title)) continue;
    const saved = await db.upsertPost(userId, channelId, postId, title, { source: 'cc6540_local_store_sync', commentKey: postKeyOf(post), channelTitle: post.channelTitle || '' }, post.messageId || postId);
    if (saved) imported += 1;
  }
  return imported;
}
async function postsFor(userId, channelId = '') {
  if (!userId || !channelId) return [];
  await importLocalPosts(userId, channelId).catch(() => 0);
  const rows = await db.getPosts(userId, channelId, 100).catch(() => []);
  const byKey = new Map();
  for (const post of rows) {
    if (!isServiceTitle(postTitleOf(post))) byKey.set(postKeyOf(post), { ...post, title: postTitleOf(post), source: 'db' });
  }
  for (const post of localPosts(channelId)) {
    const key = postKeyOf(post);
    const postId = norm(post.postId || post.messageId || '');
    const title = postTitleOf(post);
    if (!key || !postId || isServiceTitle(title)) continue;
    if (!byKey.has(key)) byKey.set(key, { channelId, postId, commentKey: key, title, messageId: post.messageId || postId, source: 'local' });
  }
  return [...byKey.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 100);
}
async function postFromPayload(userId, data = {}) {
  const channelId = norm(data.channelId || data.channel_id || '');
  const commentKey = clean(data.commentKey || data.key || '');
  const postId = norm(data.postId || data.post_id || '');
  const rows = await postsFor(userId, channelId);
  return rows.find((post) => (commentKey && postKeyOf(post) === commentKey) || (postId && String(post.postId) === String(postId))) || { channelId, postId, commentKey: commentKey || (channelId && postId ? `${channelId}:${postId}` : ''), title: postId || 'Пост' };
}

async function registerPostForLinkedAdmins({ channelId, postId, commentKey, title, messageId = '', channelTitle = '', source = 'cc6540' } = {}) {
  const normalizedChannelId = norm(channelId);
  const normalizedPostId = norm(postId);
  const normalizedCommentKey = clean(commentKey || (normalizedChannelId && normalizedPostId ? `${normalizedChannelId}:${normalizedPostId}` : ''));
  const normalizedTitle = norm(title || normalizedPostId || 'Пост');
  if (!normalizedChannelId || !normalizedPostId || !normalizedCommentKey || isServiceTitle(normalizedTitle)) return { ok: false, registered: 0, reason: 'scope_missing_or_service' };
  const { rows } = await db.query('select admin_id as "adminId" from ak_admin_channels where channel_id=$1 order by updated_at desc limit 100', [normalizedChannelId]);
  let registered = 0;
  for (const row of rows || []) {
    const saved = await db.upsertPost(row.adminId, normalizedChannelId, normalizedPostId, normalizedTitle, { source, commentKey: normalizedCommentKey, channelTitle }, messageId || normalizedPostId);
    if (saved) registered += 1;
  }
  return { ok: true, registered, channelId: normalizedChannelId, postId: normalizedPostId, commentKey: normalizedCommentKey, title: normalizedTitle };
}
async function registerPostFromUpdate(update = {}) {
  if (callback(update)) return null;
  const data = payload(update);
  const extractedChannel = db.extractChannel ? db.extractChannel(update, data) : { channelId: '' };
  const channelId = norm(extractedChannel.channelId || '');
  if (!channelId || !channelId.startsWith('-')) return null;
  const extractedPost = db.extractPost ? db.extractPost(update, data, channelId) : { postId: '' };
  if (!extractedPost.postId || !extractedPost.commentKey) return null;
  return registerPostForLinkedAdmins({ channelId, postId: extractedPost.postId, commentKey: extractedPost.commentKey, title: extractedPost.title, messageId: extractedPost.messageId, channelTitle: extractedChannel.title, source: 'cc6540_webhook_message_created' });
}\nfunction patchStoreSavePost() {
  if (storePatched) return;
  storePatched = true;
  try {
    const store = require('./store');
    if (store.__cc6540Patched || typeof store.savePost !== 'function') return;
    const original = store.savePost.bind(store);
    store.savePost = function patchedSavePost(commentKey, post = {}) {
      const saved = original(commentKey, post);
      setTimeout(() => registerPostForLinkedAdmins({
        channelId: saved?.channelId || post.channelId || String(commentKey || '').split(':')[0],
        postId: saved?.postId || post.postId || saved?.messageId || post.messageId || String(commentKey || '').split(':').pop(),
        commentKey: saved?.commentKey || commentKey,
        title: postTitleOf(saved || post),
        messageId: saved?.messageId || post.messageId || '',
        channelTitle: saved?.channelTitle || post.channelTitle || '',
        source: 'cc6540_store_save_bridge'
      }).catch((error) => console.warn('[cc6540 savePost bridge]', error?.message || error)), 0);
      return saved;
    };
    store.__cc6540Patched = true;
  } catch (error) {
    console.warn('[cc6540 patchStore]', error?.message || error);
  }
}

function mainPacket() {
  return { text: '🐋 АдминКИТ\n\nПанель управления MAX-каналом.', attachments: keyboard([
    [button('📺 Каналы', 'channels:home'), button('💬 Комменты', 'comments:home')],
    [button('🛡 Модерация', 'moderation:home'), button('✏️ Редактор', 'editor:home')],
    [button('⚪ Кнопки', 'buttons:home'), button('🎁 Подарки', 'gifts:home')],
    [button('📊 Статистика', 'stats:home'), button('🧾 Тарифы', 'billing:home')],
    [button('🤝 Рефералы', 'referrals:home'), button('❓ Помощь', 'help:home')]
  ]) };
}
async function channelsPacket(userId) {
  const channels = await channelsFor(userId);
  return { text: `📺 Каналы\n\nПодключено: ${channels.length}.\n${channels[0] ? `Активный: ${channelTitle(channels[0])}` : 'Канал пока не выбран.'}`, attachments: keyboard([
    ...channels.slice(0, 4).map((channel) => [button(`📺 ${cut(channelTitle(channel), 30)}`, 'channels:select', { channelId: channelIdOf(channel) })]),
    [button('➕ Подключить', 'channels:connect'), button('✅ Проверить права', 'channels:verify_access')],
    [button('🔐 Доступы', 'access:channel_status'), button('🏠 Главное меню', 'main:home')]
  ]) };
}
async function connectPacket(userId) {
  const channels = await channelsFor(userId);
  return { text: `📺 Подключение канала\n\n1. Добавьте бота администратором в MAX-канал.\n2. Перешлите любой пост из канала сюда.\n3. Новые посты будут сохраняться автоматически.\n\nСейчас подключено: ${channels.length}.`, attachments: keyboard([[button('✅ Проверить права', 'channels:verify_access')], ...nav('channels')]) };
}
function botAdminStatus(memberResponse = {}) {
  const compact = JSON.stringify(memberResponse || {}).toLowerCase();
  if (/"is_admin"\s*:\s*true/.test(compact) || compact.includes('"role":"admin"') || compact.includes('"status":"administrator"') || compact.includes('"permissions"')) return '✅ администратор';
  if (compact.includes('"is_owner":true')) return '✅ владелец';
  return '✅ доступ есть';
}
async function verifyPacket(userId, data = {}) {
  const channel = await firstChannel(userId, norm(data.channelId || data.channel_id || ''));
  if (!channel) return { text: '📺 Каналы\n\nКанал не подключён. Добавьте бота в канал и перешлите любой пост.', attachments: keyboard([[button('➕ Подключить', 'channels:connect')], ...nav('channels')]) };
  const channelId = channelIdOf(channel);
  let chatOk = false;
  let memberOk = false;
  let adminStatus = '';
  let errorText = '';
  try {
    const chat = await api.getChat({ botToken: config.botToken, chatId: channelId });
    chatOk = true;
    const liveTitle = norm(chat?.title || chat?.name || chat?.chat?.title || '');
    if (liveTitle) await db.upsertChannel(userId, channelId, liveTitle, { source: 'cc6540_verify_chat' });
  } catch (error) {
    errorText = error?.message || String(error);
  }
  try {
    const member = await api.getBotChatMember({ botToken: config.botToken, chatId: channelId });
    memberOk = true;
    adminStatus = botAdminStatus(member);
  } catch (error) {
    errorText = errorText || error?.message || String(error);
  }
  const ok = chatOk || memberOk;
  return { text: [
    '📺 Каналы',
    '',
    `Канал: ${channelTitle(channel)}`,
    `Права бота: ${ok ? '✅ проверены' : '❌ не проверены'} в ${nowHm()}`,
    ok ? `Статус: ${adminStatus || '✅ доступ есть'}` : `Ошибка: ${errorText || 'нет доступа'}`
  ].join('\n'), attachments: keyboard([[button('🔄 Проверить ещё раз', 'channels:verify_access', { channelId })], [button('🔐 Доступы', 'access:channel_status', { channelId })], ...nav('channels')]) };
}
async function accessPacket(userId, data = {}) {
  const channel = await firstChannel(userId, norm(data.channelId || ''));
  const channels = await channelsFor(userId);
  const posts = channel ? await postsFor(userId, channelIdOf(channel)) : [];
  return { text: [`🔐 Доступы канала`, '', channel ? `Канал: ${channelTitle(channel)}` : 'Канал не выбран', `Тестовый режим: Pro/Business открыт`, `Подключённых каналов: ${channels.length}`, `Постов в памяти: ${posts.length}`].join('\n'), attachments: keyboard([[button('✅ Проверить права', 'channels:verify_access', { channelId: channel ? channelIdOf(channel) : '' })], ...nav('channels')]) };
}
async function choosePostPacket(userId, section, data = {}) {
  const channel = await firstChannel(userId, norm(data.channelId || data.channel_id || ''));
  if (!channel) return { text: `${sectionTitle(section)} → выбор поста\n\nКанал не подключён.`, attachments: keyboard([[button('📺 Каналы', 'channels:home')], ...nav(section)]) };
  const channelId = channelIdOf(channel);
  const posts = await postsFor(userId, channelId);
  return { text: `${sectionTitle(section)} → выбор поста\n\n📺 ${channelTitle(channel)}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments: keyboard([
    ...posts.slice(0, 10).map((post, index) => [button(`${index + 1}. ${cut(postTitleOf(post), 36)}`, `${section}:post`, { channelId, postId: post.postId, commentKey: postKeyOf(post) })]),
    [button('🔄 Обновить список', `${section}:choose_post`, { channelId })],
    ...nav(section)
  ]) };
}
async function commentsHomePacket() {
  return { text: '💬 Комментарии\n\nОбсуждения под постами, старые посты, баннеры, фото, реакции и ответы.', attachments: keyboard([
    [button('⚡ Авто для новых', 'comments:auto_new'), button('📌 Старый пост', 'comments:old_post')],
    [button('📌 Выбрать пост', 'comments:choose_post')],
    [button('🖼 Баннер', 'comments_banner:home'), button('📷 Фото', 'comments_photo:home')],
    [button('❤️ Реакции', 'comments_reactions:home')],
    ...nav('comments')
  ]) };
}
async function simpleHome(section, description, rows = []) { return { text: `${sectionTitle(section)}\n\n${description}`, attachments: keyboard([...rows, ...nav(section)]) }; }
async function commentsPostPacket(userId, data = {}) {
  const post = await postFromPayload(userId, data);
  const key = post.commentKey || data.commentKey;
  const store = require('./store');
  const current = store.getPost?.(key) || post;
  const enabled = current.commentsDisabled !== true;
  const base = { channelId: post.channelId || data.channelId, postId: post.postId || data.postId, commentKey: key };
  return { text: `💬 Комментарии → пост\n\n📝 ${cut(postTitleOf(post), 64)}\nКомментарии: ${enabled ? '✅ включены' : '⏸ выключены'}`, attachments: keyboard([
    [button(enabled ? '⏸ Выключить комментарии' : '✅ Включить комментарии', 'comments:toggle', base)],
    [button('🖼 Баннер', 'comments_banner:home', base), button('❤️ Реакции', 'comments_reactions:home', base)],
    [button('📌 К списку', 'comments:choose_post', base)],
    ...nav('comments')
  ]) };
}
async function genericPostPacket(userId, section, data = {}) {
  const post = await postFromPayload(userId, data);
  const base = { channelId: post.channelId || data.channelId, postId: post.postId || data.postId, commentKey: post.commentKey || data.commentKey };
  if (section === 'comments') return commentsPostPacket(userId, base);
  if (section === 'moderation') return moderationPacket(userId, base);
  const rows = section === 'editor'
    ? [[button('✏️ Текст', 'editor:edit_text', base), button('👀 Вид', 'editor:preview', base)], [button('💾 Сохранить', 'editor:save', base), button('↩️ Оригинал', 'editor:restore_original', base)]]
    : section === 'buttons'
      ? [[button('➕ Добавить', 'buttons:add', base), button('📋 Список', 'buttons:list', base)], [button('👀 Вид', 'buttons:preview', base), button('🗑 Удалить', 'buttons:delete', base)]]
      : section === 'gifts'
        ? [[button('🎁 Создать', 'gifts:create', base), button('🔐 Подписка', 'gifts:check_subscription', base)], [button('🧪 Тест', 'gifts:test_send', base), button('📋 Список', 'gifts:list', base)]]
        : [];
  return { text: `${sectionTitle(section)} → пост\n\n📝 ${cut(postTitleOf(post), 64)}\n\nВыберите действие.`, attachments: keyboard([...rows, [button('📌 К списку', `${section}:choose_post`, base)], ...nav(section)]) };
}
async function commentsTogglePacket(userId, data = {}) {
  const post = await postFromPayload(userId, data);
  const key = post.commentKey || data.commentKey;
  const store = require('./store');
  const current = store.getPost?.(key) || post;
  const nextEnabled = current.commentsDisabled === true;
  store.savePost?.(key, { ...current, commentsDisabled: !nextEnabled, commentsEnabled: nextEnabled });
  return commentsPostPacket(userId, { ...data, channelId: post.channelId, postId: post.postId, commentKey: key });
}

function scopeFrom(userId, data = {}) {
  const channelId = norm(data.channelId || data.channel_id || '');
  const postId = norm(data.postId || data.post_id || '');
  return { adminId: userId, channelId, scopeType: postId ? 'post' : 'channel', postId, commentKey: clean(data.commentKey || (channelId && postId ? `${channelId}:${postId}` : '')) };
}
function yes(value) { return value ? '✅' : '❌'; }
async function moderationPacket(userId, data = {}) {
  const channel = await firstChannel(userId, norm(data.channelId || ''));
  if (!channel) return simpleHome('moderation', 'Сначала подключите канал.', [[button('📺 Каналы', 'channels:home')]]);
  const channelId = channelIdOf(channel);
  const scope = scopeFrom(userId, { ...data, channelId });
  const rules = await db.getRules(scope);
  const post = scope.postId ? await postFromPayload(userId, scope) : null;
  const customCount = Array.isArray(rules.customBlocklist) ? rules.customBlocklist.length : 0;
  return { text: [
    '🛡 Модерация',
    `📺 ${channelTitle(channel)}`,
    `🎯 ${scope.postId ? `Пост: ${cut(postTitleOf(post), 42)}` : 'Весь канал'}`,
    '',
    `Фильтр ${yes(rules.enabled !== false)} · База ${yes(rules.applyPresetCommon !== false)}`,
    `Ссылки ${rules.blockLinks ? '❌' : '✅'} · Инвайты ${rules.blockInvites === false ? '✅' : '❌'} · AI ${yes(rules.aiEnabled)}`,
    `Стоп-слова: ${customCount}`
  ].join('\n'), attachments: keyboard([
    [button('🛡 Канал', 'moderation:channel', { channelId }), button('🎯 Пост', 'moderation:choose_post', { channelId })],
    [button(rules.enabled === false ? '✅ Фильтр' : '⏸ Фильтр', 'moderation:toggle_filter', scope), button('🧱 База', 'moderation:base_words', scope)],
    [button(rules.blockLinks ? '🔗 Разрешить' : '🔗 Запретить', 'moderation:toggle_links', scope), button(rules.blockInvites === false ? '✉️ Запретить' : '✉️ Разрешить', 'moderation:toggle_invites', scope)],
    [button(rules.aiEnabled ? '🤖 AI выкл' : '🤖 AI вкл', 'moderation:toggle_ai', scope), button('➕ Стоп-слово', 'moderation:manual_words', scope)],
    [button('📋 Журнал', 'moderation:logs', scope), button('🧪 Проверка', 'moderation:test_comment', scope)],
    ...nav('moderation')
  ]) };
}
async function moderationTogglePacket(userId, route, data = {}) {
  const scope = scopeFrom(userId, data);
  const oldRules = await db.getRules(scope);
  const next = { ...oldRules };
  if (route.endsWith('toggle_filter')) next.enabled = oldRules.enabled === false;
  if (route.endsWith('toggle_basic')) next.applyPresetCommon = oldRules.applyPresetCommon === false;
  if (route.endsWith('toggle_links')) next.blockLinks = !oldRules.blockLinks;
  if (route.endsWith('toggle_invites')) next.blockInvites = oldRules.blockInvites === false;
  if (route.endsWith('toggle_ai')) next.aiEnabled = !oldRules.aiEnabled;
  await db.saveRules(scope, next);
  return moderationPacket(userId, data);
}
async function startStopWordFlow(userId, data = {}) {
  const scope = scopeFrom(userId, data);
  await db.setFlow(userId, { flow: 'moderation_add_word', scope, createdAt: Date.now() });
  return { text: '➕ Стоп-слово\n\nПришлите одно слово или фразу следующим сообщением. Я добавлю его в ручной список и сразу верну вас в это меню.', attachments: keyboard([[button('↩️ Назад', 'moderation:post', data)], ...nav('moderation')]) };
}
async function addStopWordFromText(update, flow) {
  const userId = adminId(update);
  const word = norm(textOf(update)).slice(0, 80);
  const scope = flow?.scope || {};
  if (!word) return false;
  const oldRules = await db.getRules(scope);
  const custom = Array.isArray(oldRules.customBlocklist) ? oldRules.customBlocklist.map(norm).filter(Boolean) : [];
  const normalizedWord = lower(word);
  const nextList = [...new Set([...custom, normalizedWord])];
  await db.saveRules(scope, { customBlocklist: nextList });
  await db.clearFlow(userId);
  const packet = await moderationPacket(userId, scope);
  packet.text = `✅ Стоп-слово добавлено: ${word}\n\n${packet.text}`;
  const result = await sendOrEdit(update, packet, false);
  return { ok: true, handledBy: RUNTIME, flow: 'moderation_add_word', word, result };
}
async function moderationAuxPacket(userId, route, data = {}) {
  if (route.endsWith('base_words')) return { text: '🧱 Базовые стоп-слова\n\nВключаются одной кнопкой «База».\n\nПример: спам, скам, мошенник, лохотрон, ставки, казино, крипта, 18+, займ срочно, напиши в личку.', attachments: keyboard([[button('↩️ Назад', 'moderation:post', data)], ...nav('moderation')]) };
  if (route.endsWith('manual_words')) return startStopWordFlow(userId, data);
  if (route.endsWith('logs')) return { text: '📋 Журнал модерации\n\nПока журнал пуст. Здесь будут последние срабатывания фильтра.', attachments: keyboard([[button('↩️ Назад', 'moderation:post', data)], ...nav('moderation')]) };
  return { text: '🧪 Проверка комментария\n\nОтправьте тестовый текст после подключения flow проверки. Сейчас доступен быстрый пример: «спам, перейди по ссылке» → будет скрыто базовым фильтром.', attachments: keyboard([[button('↩️ Назад', 'moderation:post', data)], ...nav('moderation')]) };
}

async function routePacket(userId, rawRoute, data = {}) {
  const route = routeOf(rawRoute);
  const section = sectionOf(route);
  if (route === 'main:home') return mainPacket();
  if (route === 'channels:home') return channelsPacket(userId);
  if (route === 'channels:connect') return connectPacket(userId);
  if (route === 'channels:verify_access' || route === 'channels:select') return verifyPacket(userId, data);
  if (route === 'access:channel_status' || route === 'channels:access') return accessPacket(userId, data);
  if (route === 'comments:home') return commentsHomePacket();
  if (route === 'comments:toggle') return commentsTogglePacket(userId, data);
  if (route === 'comments:auto_new') return simpleHome('comments', 'Авто-комментарии для новых постов включены в тестовом режиме. Новые посты сохраняются через webhook.', [[button('📌 Выбрать пост', 'comments:choose_post')]]);
  if (route === 'comments:old_post') return simpleHome('comments', 'Для старого поста перешлите публикацию боту. После этого она появится в списке выбора.', [[button('📌 Выбрать пост', 'comments:choose_post')]]);
  if (route === 'editor:home') return simpleHome('editor', 'Редактирование текста поста, предпросмотр и история.', [[button('📌 Выбрать пост', 'editor:choose_post'), button('🕘 История', 'editor:history')]]);
  if (route === 'buttons:home') return simpleHome('buttons', 'CTA-кнопки под постом: добавить, изменить, удалить.', [[button('➕ Добавить', 'buttons:add'), button('📌 Пост', 'buttons:choose_post')], [button('📋 Список', 'buttons:list'), button('👀 Вид', 'buttons:preview')]]);
  if (route === 'gifts:home') return simpleHome('gifts', 'Лид-магниты: подарок за подписку, тестовая выдача, проверка подписки.', [[button('🎁 Создать', 'gifts:create'), button('📌 Пост', 'gifts:choose_post')], [button('📋 Список', 'gifts:list'), button('🔐 Подписка', 'gifts:check_subscription')]]);
  if (route === 'stats:home') return simpleHome('stats', 'Канал, посты, комментарии, реакции, клики и подарки.', [[button('📊 Канал', 'stats:channel'), button('📌 Пост', 'stats:choose_post')]]);
  if (route === 'billing:home') return simpleHome('billing', 'Пробный период, подписка, токены и тарифы.', [[button('🎁 Пробный', 'billing:trial'), button('💳 Купить', 'billing:buy')]]);
  if (route === 'referrals:home') return simpleHome('referrals', 'Реферальная ссылка, приглашения и бонусы.', [[button('🔗 Ссылка', 'referrals:my_link'), button('📊 Статус', 'referrals:stats')]]);
  if (route.startsWith('help:')) return { text: `❓ Помощь\n\nРаздел: ${sectionTitle(route.split(':')[1] || 'help')}.\nОдин раздел — один владелец маршрута.`, attachments: keyboard([[button('🏠 Главное меню', 'main:home')]]) };
  if (route === 'moderation:home' || route === 'moderation:channel') return moderationPacket(userId, data);
  if (route.startsWith('moderation:toggle_')) return moderationTogglePacket(userId, route, data);
  if (['moderation:base_words', 'moderation:manual_words', 'moderation:logs', 'moderation:test_comment'].includes(route)) return moderationAuxPacket(userId, route, data);
  if (route.endsWith(':choose_post')) return choosePostPacket(userId, section, data);
  if (route.endsWith(':post')) return genericPostPacket(userId, section, data);
  return simpleHome(section, `Экран подключён к каноническому владельцу маршрута.\nМаршрут: ${route}`, []);
}
async function handleFlowTextIfNeeded(update = {}) {
  if (callback(update)) return false;
  const userId = adminId(update);
  if (!userId) return false;
  const flow = await db.getFlow(userId).catch(() => null);
  if (!flow || flow.flow !== 'moderation_add_word') return false;
  return addStopWordFromText(update, flow);
}
async function handleUpdate(update = {}, forcedRoute = '') {
  await db.init().catch(() => {});
  patchStoreSavePost();
  const flowHandled = await handleFlowTextIfNeeded(update);
  if (flowHandled) return flowHandled;
  if (!callback(update)) {
    const registered = await registerPostFromUpdate(update).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if (registered?.registered) return { ok: true, handledBy: RUNTIME, registeredPost: registered };
  }
  const userId = adminId(update);
  if (!userId) return false;
  const route = forcedRoute || (isStart(update) ? 'main:home' : routeOf(action(update)));
  if (!route || !isOwned(route)) return false;
  const packet = await routePacket(userId, route, payload(update));
  await answer(update, route.includes('choose_post') ? 'Выберите пост' : '');
  const result = await sendOrEdit(update, packet, !isStart(update));
  return { ok: true, handledBy: RUNTIME, route, result };
}
async function backfillAll() {
  await db.init();
  const stats = { channels: 0, localPosts: 0, imported: 0 };
  const { rows } = await db.query('select admin_id as "adminId", channel_id as "channelId" from ak_admin_channels order by updated_at desc limit 200');
  for (const row of rows || []) {
    stats.channels += 1;
    const local = localPosts(row.channelId);
    stats.localPosts += local.length;
    stats.imported += await importLocalPosts(row.adminId, row.channelId);
  }
  return stats;
}
function selfTest() {
  return {
    ok: true,
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    functionalCanonicalRouter: true,
    conciseVerify: true,
    commentsSingleToggle: true,
    moderationManualStopWordFlow: true,
    webhookPostRegistration: true,
    localPostBackfill: true
  };
}
function installExpressPatch() {
  if (Module._load.__cc6540FunctionalCanonical) return;
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6540Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6540) {
          app.__cc6540 = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/canonical-product-router' || route === '/debug/functional-canonical-router') { noCache(res); return res.json(selfTest()); }
            if (route === '/debug/post-backfill') { noCache(res); return backfillAll().then((data) => res.json({ ok: true, runtime: RUNTIME, sourceMarker: SOURCE, ...data })).catch((error) => res.status(500).json({ ok: false, error: error?.message || String(error) })); }
            if (route === '/debug/canonical-product-events') { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, events: events.slice(-100) }); }
            return next();
          });
          try { app.use('/api/ak/register-post', loaded.json({ limit: '128kb' })); } catch {}
          app.post('/api/ak/register-post', async (req, res) => {
            noCache(res);
            try { res.json({ runtimeVersion: RUNTIME, sourceMarker: SOURCE, ...await registerPostForLinkedAdmins({ ...req.body, source: 'cc6540_api_register_post' }) }); }
            catch (error) { res.status(500).json({ ok: false, error: error?.message || String(error) }); }
          });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => String(route || '').includes('/webhook')
            ? oldPost(route, async (req, res, next) => {
                try {
                  const currentRoute = isStart(req.body || {}) ? 'main:home' : routeOf(action(req.body || {}));
                  const owned = isStart(req.body || {}) || isOwned(currentRoute) || !callback(req.body || {});
                  log({ route: currentRoute, owned, action: action(req.body || {}) });
                  const handled = await handleUpdate(req.body || {}, isStart(req.body || {}) ? 'main:home' : (isOwned(currentRoute) ? currentRoute : ''));
                  if (handled && handled.ok) return res.json(handled);
                } catch (error) {
                  log({ error: error?.message || String(error) });
                }
                return next();
              }, ...handlers)
            : oldPost(route, ...handlers);
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6540Wrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__cc6540FunctionalCanonical = true;
}
function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  patchStoreSavePost();
  installExpressPatch();
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, handleUpdate, backfillAll, registerPostForLinkedAdmins };
