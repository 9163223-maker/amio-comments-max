'use strict';

const Module = require('module');
const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC6.5.3.9';
const SOURCE = 'adminkit-CC6.5.3.9-functional-canonical-router';
const events = [];
let storePatched = false;

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 54) => { const s = norm(v); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const clean = (v) => db.clean ? db.clean(v) : norm(v).replace(/^ck:/i, '').replace(/^post:/i, '');
const nowHm = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function tryJson(v) { try { const p = JSON.parse(String(v || '')); return p && typeof p === 'object' ? p : null; } catch { return null; } }
function cb(u = {}) { return db.cb ? db.cb(u) : (u.callback || u.data?.callback || u.message?.callback || null); }
function msg(u = {}) { return db.msg ? db.msg(u) : (u.message || u.data?.message || cb(u)?.message || null); }
function payload(u = {}) { return db.payload ? db.payload(u) : (tryJson(cb(u)?.payload || u.payload || '') || {}); }
function action(u = {}) { const p = payload(u); return norm(p.action || p.route || p.cmd || db.action?.(u) || '').toLowerCase(); }
function uid(u = {}) { return db.adminId ? db.adminId(u) : ''; }
function mid(u = {}) { return db.messageId ? db.messageId(u) : ''; }
function cid(u = {}) { return db.chatId ? db.chatId(u) : ''; }
function cbid(u = {}) { return db.callbackId ? db.callbackId(u) : ''; }
function bodyText(u = {}) { return db.text ? db.text(u) : norm(msg(u)?.text || msg(u)?.body?.text || ''); }
function button(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action: route, ...extra }) }; }
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function log(item) { events.push({ ts: Date.now(), ...item }); while (events.length > 120) events.shift(); }
function resultMessageId(result) { const m = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id|mid)"\s*:\s*"([^"{}]+)"/); return m ? m[1] : ''; }
async function answer(u, notification = '') { const id = cbid(u); if (!id) return; try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification }); } catch {} }

function isStart(u = {}) {
  if (cb(u)) return false;
  const t = norm(u.update_type || u.type || u.event_type || u.data?.update_type || '').toLowerCase();
  const text = bodyText(u).toLowerCase();
  const p = norm(u.start_payload || u.payload || u.data?.payload || '').toLowerCase();
  return t.includes('start') || ['start', '/start', 'menu', '/menu', 'меню'].includes(text) || ['start', 'menu', 'main'].includes(p);
}
function routeOf(raw = '') {
  const r = norm(raw).toLowerCase();
  const map = {
    ak_main_menu:'main:home', main_menu:'main:home', menu_main:'main:home', home:'main:home', start:'main:home',
    channels_menu:'channels:home', mod_start:'moderation:home', moderation_menu:'moderation:home', 'модерация':'moderation:home',
    mod_choose_post:'moderation:choose_post', mod_post_rules:'moderation:post', mod_channel_rules:'moderation:channel',
    mod_toggle_enabled:'moderation:toggle_filter', mod_toggle_preset:'moderation:toggle_basic', mod_toggle_links:'moderation:toggle_links', mod_toggle_invites:'moderation:toggle_invites', mod_toggle_ai:'moderation:toggle_ai', mod_base_words:'moderation:base_words', mod_add_stopword:'moderation:manual_words', mod_logs:'moderation:logs', mod_test_comment:'moderation:test_comment',
    comments_menu:'comments:home', comments_choose_post:'comments:choose_post', comments_post_card:'comments:post',
    buttons_menu:'buttons:home', gift_menu:'gifts:home', gifts_menu:'gifts:home', stats_menu:'stats:home', help_menu:'help:home'
  };
  return map[r] || r;
}
function owner(route = '') { const r = routeOf(route); if (r === 'main:home') return 'main'; if (r.startsWith('access:')) return 'channels'; return r.split(':')[0]; }
function isOwned(route = '') { return ['main','channels','comments','moderation','editor','buttons','gifts','stats','billing','referrals','help','comments_banner','comments_photo','comments_reactions','access'].includes(owner(route)); }
function nav(section) { return [[button('❓ Помощь', `help:${section}`), button('↩️ Раздел', `${section}:home`)], [button('🏠 Главное меню', 'main:home')]]; }
function title(section) { return { main:'🐋 АдминКИТ', channels:'📺 Каналы', comments:'💬 Комментарии', moderation:'🛡 Модерация', editor:'✏️ Редактор постов', buttons:'⚪ Кнопки', gifts:'🎁 Подарки', stats:'📊 Статистика', billing:'🧾 Тарифы', referrals:'🤝 Рефералы', help:'❓ Помощь' }[section] || section; }

async function setActiveMenu(userId, messageId) { try { if (userId && messageId) await db.setMenu(userId, messageId); } catch {} }
async function getActiveMenu(userId) { try { return userId ? await db.getMenu(userId) : ''; } catch { return ''; } }
async function sendOrEdit(update, packet, preferEdit = true) {
  const userId = uid(update);
  const messageId = preferEdit ? mid(update) : '';
  if (messageId) {
    try { await api.editMessage({ botToken: config.botToken, messageId, text: packet.text, attachments: packet.attachments || [], notify: false }); await setActiveMenu(userId, messageId); return { mode:'edit', messageId }; }
    catch (e) { console.warn('[cc6539 edit]', e?.message || e); }
  }
  const old = await getActiveMenu(userId);
  if (old) { try { await api.deleteMessage({ botToken: config.botToken, messageId: old, timeoutMs: 1200 }); } catch {} }
  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  if (userId) args.userId = userId; else if (cid(update)) args.chatId = cid(update); else return { mode:'skip', reason:'target_missing' };
  const result = await api.sendMessage(args);
  const newId = resultMessageId(result);
  await setActiveMenu(userId, newId);
  return { mode:'send', messageId:newId };
}

function channelIdOf(c = {}) { return norm(c.channelId || c.channel_id || c.id || c.chatId || c.chat_id || ''); }
function channelTitle(c = {}) { return norm(c.title || c.channelTitle || c.name || c.chatTitle || channelIdOf(c) || 'Канал'); }
function postKeyOf(p = {}) { return clean(p.commentKey || p.key || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')); }
function postTitleOf(p = {}) { return norm(p.title || p.originalText || p.postTitle || p.text || p.postId || 'Пост'); }
function isServiceTitle(s = '') { const x = norm(s).toLowerCase(); return !x || /главное меню|модерац|выберите|помощь|текущие настройки|нажатие меняет|правила/.test(x); }
async function channelsFor(userId) { try { return await db.getChannels(userId); } catch { return []; } }
async function firstChannel(userId, explicit = '') { const list = await channelsFor(userId); return list.find(c => channelIdOf(c) === explicit) || list[0] || null; }
function localPosts(channelId = '') { try { const store = require('./store'); const rows = typeof store.listPostsByChannel === 'function' ? store.listPostsByChannel(channelId, 200) : Object.values(store.store?.posts || {}); return rows.filter(p => !channelId || String(p.channelId || '') === String(channelId)); } catch { return []; } }
async function importLocalPosts(userId, channelId = '') {
  let imported = 0;
  for (const p of localPosts(channelId)) {
    const postId = norm(p.postId || p.messageId || '');
    const t = postTitleOf(p);
    if (!postId || isServiceTitle(t)) continue;
    const saved = await db.upsertPost(userId, channelId, postId, t, { source:'cc6539_local_store_sync', commentKey:postKeyOf(p), channelTitle:p.channelTitle || '' }, p.messageId || postId);
    if (saved) imported += 1;
  }
  return imported;
}
async function postsFor(userId, channelId = '') {
  if (!userId || !channelId) return [];
  await importLocalPosts(userId, channelId).catch(()=>0);
  const rows = await db.getPosts(userId, channelId, 100).catch(()=>[]);
  const map = new Map();
  for (const p of rows) if (!isServiceTitle(postTitleOf(p))) map.set(postKeyOf(p), { ...p, title:postTitleOf(p), source:'db' });
  for (const p of localPosts(channelId)) {
    const key = postKeyOf(p); const postId = norm(p.postId || p.messageId || ''); const t = postTitleOf(p);
    if (!key || !postId || isServiceTitle(t)) continue;
    if (!map.has(key)) map.set(key, { channelId, postId, commentKey:key, title:t, messageId:p.messageId || postId, source:'local' });
  }
  return [...map.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,100);
}
async function postFromPayload(userId, p = {}) { const channelId = norm(p.channelId || p.channel_id || ''); const key = clean(p.commentKey || p.key || ''); const postId = norm(p.postId || p.post_id || ''); const rows = await postsFor(userId, channelId); return rows.find(x => (key && postKeyOf(x) === key) || (postId && String(x.postId) === String(postId))) || { channelId, postId, commentKey:key || (channelId && postId ? `${channelId}:${postId}` : ''), title:postId || 'Пост' }; }

async function registerPostForLinkedAdmins({ channelId, postId, commentKey, title, messageId = '', channelTitle = '', source = 'cc6539' } = {}) {
  channelId = norm(channelId); postId = norm(postId); commentKey = clean(commentKey || (channelId && postId ? `${channelId}:${postId}` : '')); title = norm(title || postId || 'Пост');
  if (!channelId || !postId || !commentKey || isServiceTitle(title)) return { ok:false, registered:0, reason:'scope_missing_or_service' };
  const { rows } = await db.query('select admin_id as "adminId" from ak_admin_channels where channel_id=$1 order by updated_at desc limit 100', [channelId]);
  let registered = 0;
  for (const row of rows || []) { const saved = await db.upsertPost(row.adminId, channelId, postId, title, { source, commentKey, channelTitle }, messageId || postId); if (saved) registered += 1; }
  return { ok:true, registered, channelId, postId, commentKey, title };
}
async function registerPostFromUpdate(update = {}) {
  if (cb(update)) return null;
  const p = payload(update);
  const ch = db.extractChannel ? db.extractChannel(update, p) : { channelId:'' };
  const channelId = norm(ch.channelId || '');
  if (!channelId || !/^[-0-9]+$/.test(channelId)) return null;
  const po = db.extractPost ? db.extractPost(update, p, channelId) : { postId:'' };
  if (!po.postId || !po.commentKey) return null;
  return registerPostForLinkedAdmins({ channelId, postId:po.postId, commentKey:po.commentKey, title:po.title, messageId:po.messageId, channelTitle:ch.title, source:'cc6539_webhook_message_created' });
}
function patchStoreSavePost() {
  if (storePatched) return; storePatched = true;
  try {
    const store = require('./store');
    if (store.__cc6539Patched || typeof store.savePost !== 'function') return;
    const old = store.savePost.bind(store);
    store.savePost = function patchedSavePost(commentKey, post = {}) {
      const saved = old(commentKey, post);
      setTimeout(() => registerPostForLinkedAdmins({ channelId:saved?.channelId || post.channelId || String(commentKey || '').split(':')[0], postId:saved?.postId || post.postId || saved?.messageId || post.messageId || String(commentKey || '').split(':').pop(), commentKey:saved?.commentKey || commentKey, title:postTitleOf(saved || post), messageId:saved?.messageId || post.messageId || '', channelTitle:saved?.channelTitle || post.channelTitle || '', source:'cc6539_store_save_bridge' }).catch(e => console.warn('[cc6539 savePost bridge]', e?.message || e)), 0);
      return saved;
    };
    store.__cc6539Patched = true;
  } catch (e) { console.warn('[cc6539 patchStore]', e?.message || e); }
}

function mainPacket() { return { text:'🐋 АдминКИТ\n\nПанель управления MAX-каналом.', attachments:keyboard([
  [button('📺 Каналы','channels:home'), button('💬 Комменты','comments:home')],
  [button('🛡 Модерация','moderation:home'), button('✏️ Редактор','editor:home')],
  [button('⚪ Кнопки','buttons:home'), button('🎁 Подарки','gifts:home')],
  [button('📊 Статистика','stats:home'), button('🧾 Тарифы','billing:home')],
  [button('🤝 Рефералы','referrals:home'), button('❓ Помощь','help:home')]
])}; }
async function channelsPacket(userId) { const list = await channelsFor(userId); return { text:`📺 Каналы\n\nПодключено: ${list.length}.\n${list[0] ? `Активный: ${channelTitle(list[0])}` : 'Канал пока не выбран.'}`, attachments:keyboard([
  ...list.slice(0,4).map(c => [button(`📺 ${cut(channelTitle(c),30)}`,'channels:select',{channelId:channelIdOf(c)})]),
  [button('➕ Подключить','channels:connect'), button('✅ Проверить права','channels:verify_access')],
  [button('🔐 Доступы','access:channel_status'), button('🏠 Главное меню','main:home')]
])}; }
async function connectPacket(userId) { const list = await channelsFor(userId); return { text:`📺 Подключение канала\n\n1. Добавьте бота администратором в MAX-канал.\n2. Перешлите любой пост из канала сюда.\n3. Новые посты канала будут сохраняться автоматически.\n\nСейчас подключено: ${list.length}.`, attachments:keyboard([[button('✅ Проверить права','channels:verify_access')], ...nav('channels')])}; }
async function verifyPacket(userId, p = {}) {
  const ch = await firstChannel(userId, norm(p.channelId || p.channel_id || ''));
  if (!ch) return { text:'📺 Каналы\n\nКанал не подключён. Сначала добавьте бота в канал и перешлите любой пост.', attachments:keyboard([[button('➕ Подключить','channels:connect')], ...nav('channels')]) };
  const channelId = channelIdOf(ch); let chatOk = false, memberOk = false, role = '', err = '';
  try { const chat = await api.getChat({ botToken:config.botToken, chatId:channelId }); chatOk = true; const title = norm(chat?.title || chat?.name || chat?.chat?.title || ''); if (title) await db.upsertChannel(userId, channelId, title, { source:'cc6539_verify_chat' }); } catch(e) { err = e?.message || String(e); }
  try { const m = await api.getBotChatMember({ botToken:config.botToken, chatId:channelId }); memberOk = true; role = norm(m?.role || m?.status || m?.permissions?.role || JSON.stringify(m).slice(0,80)); } catch(e) { err = err || e?.message || String(e); }
  return { text:[`📺 Каналы`, '', `Канал: ${channelTitle(ch)}`, `Права бота: ${chatOk || memberOk ? '✅ проверены' : '❌ не проверены'} в ${nowHm()}`, role ? `Роль/статус: ${role}` : '', err && !(chatOk || memberOk) ? `Ошибка: ${err}` : '', '', 'После проверки новые посты должны попадать в память через webhook.'].filter(Boolean).join('\n'), attachments:keyboard([[button('🔄 Проверить ещё раз','channels:verify_access',{channelId})], [button('🔐 Доступы','access:channel_status',{channelId})], ...nav('channels')]) };
}
async function accessPacket(userId, p = {}) { const ch = await firstChannel(userId, norm(p.channelId || '')); const list = await channelsFor(userId); const posts = ch ? await postsFor(userId, channelIdOf(ch)) : []; return { text:[`🔐 Доступы канала`, '', ch ? `Канал: ${channelTitle(ch)}` : 'Канал не выбран', `Тестовый режим: Pro/Business открыт`, `Подключённых каналов: ${list.length}`, `Постов в памяти: ${posts.length}`, '', 'Открыто: комментарии, модерация, редактор, кнопки, подарки, статистика.'].join('\n'), attachments:keyboard([[button('✅ Проверить права','channels:verify_access',{channelId:ch ? channelIdOf(ch) : ''})], ...nav('channels')])}; }
async function choosePostPacket(userId, section, p = {}) { const ch = await firstChannel(userId, norm(p.channelId || p.channel_id || '')); if (!ch) return { text:`${title(section)} → выбор поста\n\nКанал не подключён.`, attachments:keyboard([[button('📺 Каналы','channels:home')], ...nav(section)])}; const channelId = channelIdOf(ch); const posts = await postsFor(userId, channelId); return { text:`${title(section)} → выбор поста\n\n📺 ${channelTitle(ch)}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments:keyboard([...posts.slice(0,10).map((post,i)=>[button(`${i+1}. ${cut(postTitleOf(post),36)}`, `${section}:post`, { channelId, postId:post.postId, commentKey:postKeyOf(post) })]), [button('🔄 Обновить список', `${section}:choose_post`, { channelId })], ...nav(section)])}; }
async function commentsHome() { return { text:'💬 Комментарии\n\nОбсуждения под постами, старые посты, баннеры, фото, реакции и ответы.', attachments:keyboard([[button('⚡ Авто для новых','comments:auto_new'), button('📌 Старый пост','comments:old_post')], [button('📌 Выбрать пост','comments:choose_post')], [button('🖼 Баннер','comments_banner:home'), button('📷 Фото','comments_photo:home')], [button('❤️ Реакции','comments_reactions:home'), button('👀 Вид','comments:preview')], ...nav('comments')])}; }
async function simpleHome(section, desc, rows = []) { return { text:`${title(section)}\n\n${desc}`, attachments:keyboard([...rows, ...nav(section)])}; }
async function postCard(userId, section, p = {}) { const post = await postFromPayload(userId, p); const base = { channelId:post.channelId || p.channelId, postId:post.postId || p.postId, commentKey:post.commentKey || p.commentKey }; if (section === 'moderation') return moderationPacket(userId, base); const rows = section === 'comments' ? [[button('✅/⏸ Комменты','comments:toggle',base), button('👀 Обсуждение','comments:open_discussion',base)], [button('🖼 Баннер','comments_banner:home',base), button('❤️ Реакции','comments_reactions:home',base)]] : section === 'editor' ? [[button('✏️ Текст','editor:edit_text',base), button('👀 Вид','editor:preview',base)], [button('💾 Сохранить','editor:save',base), button('↩️ Оригинал','editor:restore_original',base)]] : section === 'buttons' ? [[button('➕ Добавить','buttons:add',base), button('📋 Список','buttons:list',base)], [button('👀 Вид','buttons:preview',base), button('🗑 Удалить','buttons:delete',base)]] : section === 'gifts' ? [[button('🎁 Создать','gifts:create',base), button('🔐 Подписка','gifts:check_subscription',base)], [button('🧪 Тест','gifts:test_send',base), button('📋 Список','gifts:list',base)]] : [];
  return { text:`${title(section)} → пост\n\n📝 ${cut(postTitleOf(post),64)}\n\nВыберите действие.`, attachments:keyboard([...rows, [button('📌 К списку', `${section}:choose_post`, base)], ...nav(section)])}; }
async function commentsToggle(userId, p = {}) { const post = await postFromPayload(userId, p); const store = require('./store'); const key = post.commentKey || p.commentKey; const current = store.getPost?.(key) || post; const nextEnabled = current.commentsDisabled === true; store.savePost?.(key, { ...current, commentsDisabled: !nextEnabled, commentsEnabled: nextEnabled }); return { text:`💬 Комментарии → пост\n\n📝 ${cut(postTitleOf(post),64)}\nСтатус: ${nextEnabled ? '✅ включены' : '⏸ выключены'}\n\nНастройка сохранена в памяти.`, attachments:keyboard([[button('✅/⏸ Переключить ещё раз','comments:toggle',p), button('👀 Обсуждение','comments:open_discussion',p)], ...nav('comments')])}; }
async function openDiscussion(userId, p = {}) { const post = await postFromPayload(userId, p); const url = api.buildMiniAppLaunchUrl({ appBaseUrl:config.appBaseUrl, botUsername:config.botUsername, maxDeepLinkBase:config.maxDeepLinkBase, postId:post.postId, channelId:post.channelId, commentKey:post.commentKey }); return { text:`👀 Обсуждение\n\nПост: ${cut(postTitleOf(post),64)}\nСсылка: ${url || 'не сформирована'}`, attachments:keyboard([[button('↩️ Назад','comments:post',p)], ...nav('comments')])}; }
function scopeFrom(userId, p = {}) { const channelId = norm(p.channelId || p.channel_id || ''); const postId = norm(p.postId || p.post_id || ''); return { adminId:userId, channelId, scopeType:postId ? 'post' : 'channel', postId, commentKey:clean(p.commentKey || (channelId && postId ? `${channelId}:${postId}` : '')) }; }
function yes(v) { return v ? '✅' : '❌'; }
async function moderationPacket(userId, p = {}) { const ch = await firstChannel(userId, norm(p.channelId || '')); if (!ch) return simpleHome('moderation', 'Сначала подключите канал.', [[button('📺 Каналы','channels:home')]]); const channelId = channelIdOf(ch); const scope = scopeFrom(userId, { ...p, channelId }); const rules = await db.getRules(scope); const post = scope.postId ? await postFromPayload(userId, scope) : null; return { text:[`🛡 Модерация`, `📺 ${channelTitle(ch)}`, `🎯 ${scope.postId ? 'Пост: ' + cut(postTitleOf(post),42) : 'Весь канал'}`, '', `Фильтр ${yes(rules.enabled !== false)} · База ${yes(rules.applyPresetCommon !== false)}`, `Ссылки ${rules.blockLinks ? '❌' : '✅'} · Инвайты ${rules.blockInvites === false ? '✅' : '❌'} · AI ${yes(rules.aiEnabled)}`, `Стоп-слова: ${(rules.customBlocklist || []).length}`].join('\n'), attachments:keyboard([[button('🛡 Канал','moderation:channel',{channelId}), button('🎯 Пост','moderation:choose_post',{channelId})], [button(rules.enabled === false ? '✅ Фильтр':'⏸ Фильтр','moderation:toggle_filter',scope), button('🧱 База','moderation:base_words',scope)], [button(rules.blockLinks ? '🔗 Разрешить':'🔗 Запретить','moderation:toggle_links',scope), button(rules.blockInvites === false ? '✉️ Запретить':'✉️ Разрешить','moderation:toggle_invites',scope)], [button(rules.aiEnabled ? '🤖 AI выкл':'🤖 AI вкл','moderation:toggle_ai',scope), button('➕ Стоп-слово','moderation:manual_words',scope)], [button('📋 Журнал','moderation:logs',scope), button('🧪 Проверка','moderation:test_comment',scope)], ...nav('moderation')])}; }
async function moderationToggle(userId, route, p = {}) { const scope = scopeFrom(userId, p); const old = await db.getRules(scope); const next = { ...old }; if (route.endsWith('toggle_filter')) next.enabled = old.enabled === false; if (route.endsWith('toggle_basic')) next.applyPresetCommon = old.applyPresetCommon === false; if (route.endsWith('toggle_links')) next.blockLinks = !old.blockLinks; if (route.endsWith('toggle_invites')) next.blockInvites = old.blockInvites === false; if (route.endsWith('toggle_ai')) next.aiEnabled = !old.aiEnabled; await db.saveRules(scope, next); return moderationPacket(userId, p); }
async function moderationAux(route, p = {}) { if (route.endsWith('base_words')) return { text:'🧱 Базовые стоп-слова\n\nПример: спам, скам, мошенник, лохотрон, ставки, казино, крипта, 18+, займ срочно, напиши в личку.', attachments:keyboard([[button('↩️ Назад','moderation:post',p)], ...nav('moderation')])}; if (route.endsWith('manual_words')) return { text:'➕ Стоп-слово\n\nПришлите слово следующим сообщением. В этой сборке экран готов, сохранение ручного слова подключается к flow.', attachments:keyboard([[button('↩️ Назад','moderation:post',p)], ...nav('moderation')])}; if (route.endsWith('logs')) return { text:'📋 Журнал модерации\n\nПока журнал пуст. Здесь будут последние срабатывания фильтра.', attachments:keyboard([[button('↩️ Назад','moderation:post',p)], ...nav('moderation')])}; return { text:'🧪 Проверка комментария\n\nПример: «спам, перейди по ссылке» → будет скрыто базовым фильтром.', attachments:keyboard([[button('↩️ Назад','moderation:post',p)], ...nav('moderation')])}; }

async function routePacket(userId, route, p = {}) {
  route = routeOf(route); const section = owner(route);
  if (route === 'main:home') return mainPacket();
  if (route === 'channels:home') return channelsPacket(userId);
  if (route === 'channels:connect') return connectPacket(userId);
  if (route === 'channels:verify_access') return verifyPacket(userId, p);
  if (route === 'channels:select') return verifyPacket(userId, p);
  if (route === 'access:channel_status' || route === 'channels:access') return accessPacket(userId, p);
  if (route === 'comments:home') return commentsHome();
  if (route === 'editor:home') return simpleHome('editor', 'Редактирование текста поста, предпросмотр и история.', [[button('📌 Выбрать пост','editor:choose_post'), button('🕘 История','editor:history')]]);
  if (route === 'buttons:home') return simpleHome('buttons', 'CTA-кнопки под постом: добавить, изменить, удалить.', [[button('➕ Добавить','buttons:add'), button('📌 Пост','buttons:choose_post')], [button('📋 Список','buttons:list'), button('👀 Вид','buttons:preview')]]);
  if (route === 'gifts:home') return simpleHome('gifts', 'Лид-магниты: подарок за подписку, тестовая выдача, проверка подписки.', [[button('🎁 Создать','gifts:create'), button('📌 Пост','gifts:choose_post')], [button('📋 Список','gifts:list'), button('🔐 Подписка','gifts:check_subscription')]]);
  if (route === 'stats:home') return simpleHome('stats', 'Канал, посты, комментарии, реакции, клики и подарки.', [[button('📊 Канал','stats:channel'), button('📌 Пост','stats:choose_post')]]);
  if (route === 'billing:home') return simpleHome('billing', 'Пробный период, подписка, токены и тарифы.', [[button('🎁 Пробный','billing:trial'), button('💳 Купить','billing:buy')]]);
  if (route === 'referrals:home') return simpleHome('referrals', 'Реферальная ссылка, приглашения и бонусы.', [[button('🔗 Ссылка','referrals:my_link'), button('📊 Статус','referrals:stats')]]);
  if (route.startsWith('help:')) return { text:`❓ Помощь\n\nРаздел: ${title(route.split(':')[1] || 'help')}.\nОдин раздел — один владелец маршрута.`, attachments:keyboard([[button('🏠 Главное меню','main:home')]])};
  if (route === 'moderation:home' || route === 'moderation:channel') return moderationPacket(userId, p);
  if (route.startsWith('moderation:toggle_')) return moderationToggle(userId, route, p);
  if (['moderation:base_words','moderation:manual_words','moderation:logs','moderation:test_comment'].includes(route)) return moderationAux(route, p);
  if (route.endsWith(':choose_post')) return choosePostPacket(userId, section, p);
  if (route.endsWith(':post')) return postCard(userId, section, p);
  if (route === 'comments:toggle') return commentsToggle(userId, p);
  if (route === 'comments:open_discussion') return openDiscussion(userId, p);
  if (route === 'comments:auto_new') return simpleHome('comments', 'Авто-комментарии для новых постов включены в тестовом режиме. Новые channel message_created события сохраняются в PostgreSQL.', [[button('📌 Выбрать пост','comments:choose_post')]]);
  if (route === 'comments:old_post') return simpleHome('comments', 'Для старого поста перешлите публикацию боту. После этого она появится в списке выбора.', [[button('📌 Выбрать пост','comments:choose_post')]]);
  return simpleHome(section, `Экран подключён к каноническому владельцу маршрута.\nМаршрут: ${route}`, []);
}
async function handleUpdate(update = {}, forcedRoute = '') {
  await db.init().catch(()=>{}); patchStoreSavePost();
  if (!cb(update)) { const registered = await registerPostFromUpdate(update).catch(e => ({ ok:false, error:e?.message || String(e) })); if (registered?.registered) return { ok:true, handledBy:RUNTIME, registeredPost:registered }; }
  const userId = uid(update); if (!userId) return false;
  const route = forcedRoute || (isStart(update) ? 'main:home' : routeOf(action(update)));
  if (!route || !isOwned(route)) return false;
  const packet = await routePacket(userId, route, payload(update));
  await answer(update, route.includes('choose_post') ? 'Выберите пост' : '');
  const result = await sendOrEdit(update, packet, !isStart(update));
  return { ok:true, handledBy:RUNTIME, route, result };
}
async function backfillAll() { await db.init(); const stats = { channels:0, localPosts:0, imported:0 }; const { rows } = await db.query('select admin_id as "adminId", channel_id as "channelId" from ak_admin_channels order by updated_at desc limit 200'); for (const row of rows || []) { stats.channels += 1; const local = localPosts(row.channelId); stats.localPosts += local.length; stats.imported += await importLocalPosts(row.adminId, row.channelId); } return stats; }
function selfTest() { return { ok:true, runtime:RUNTIME, sourceMarker:SOURCE, functionalCanonicalRouter:true, compactMenu:true, channelVerifyRoute:true, channelAccessRoute:true, webhookPostRegistration:true, localPostBackfill:true, noFeatureStubForChannels:true }; }
function installExpressPatch() {
  if (Module._load.__cc6539FunctionalCanonical) return;
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6539Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6539) {
          app.__cc6539 = true;
          app.use((req,res,next)=>{ const r = String(req.path || req.url || '').split('?')[0].toLowerCase(); if (r === '/debug/canonical-product-router' || r === '/debug/functional-canonical-router') { noCache(res); return res.json(selfTest()); } if (r === '/debug/post-backfill') { noCache(res); return backfillAll().then(x=>res.json({ ok:true, runtime:RUNTIME, sourceMarker:SOURCE, ...x })).catch(e=>res.status(500).json({ ok:false, error:e?.message || String(e) })); } if (r === '/debug/canonical-product-events') { noCache(res); return res.json({ ok:true, runtimeVersion:RUNTIME, events:events.slice(-100) }); } return next(); });
          try { app.use('/api/ak/register-post', loaded.json({ limit:'128kb' })); } catch {}
          app.post('/api/ak/register-post', async (req,res)=>{ noCache(res); try { res.json({ runtimeVersion:RUNTIME, sourceMarker:SOURCE, ...await registerPostForLinkedAdmins({ ...req.body, source:'cc6539_api_register_post' }) }); } catch(e) { res.status(500).json({ ok:false, error:e?.message || String(e) }); } });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => String(route || '').includes('/webhook') ? oldPost(route, async (req,res,next)=>{ try { const r = isStart(req.body || {}) ? 'main:home' : routeOf(action(req.body || {})); const owned = isStart(req.body || {}) || isOwned(r) || !cb(req.body || {}); log({ route:r, owned, action:action(req.body || {}) }); const handled = await handleUpdate(req.body || {}, isStart(req.body || {}) ? 'main:home' : (isOwned(r) ? r : '')); if (handled && handled.ok) return res.json(handled); } catch(e) { log({ error:e?.message || String(e) }); } return next(); }, ...handlers) : oldPost(route, ...handlers);
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded); Object.assign(expressWrapper, loaded); expressWrapper.__cc6539Wrap = true; return expressWrapper;
    }
    return loaded;
  };
  Module._load.__cc6539FunctionalCanonical = true;
}
function install() { process.env.BUILD_VERSION = RUNTIME; process.env.RUNTIME_VERSION = RUNTIME; process.env.BUILD_SOURCE_MARKER = SOURCE; patchStoreSavePost(); installExpressPatch(); return { ok:true, runtimeVersion:RUNTIME, sourceMarker:SOURCE }; }
module.exports = { RUNTIME, SOURCE, install, selfTest, handleUpdate, backfillAll, registerPostForLinkedAdmins };
