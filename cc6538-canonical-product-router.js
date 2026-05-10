'use strict';

// CC6.5.3.8 — canonical product router.
// One canonical UI owner for product menus. No old moderation/product-test screens.
// Also bridges local stored posts into PostgreSQL so new channel posts appear in admin lists.

const Module = require('module');
const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC6.5.3.8';
const SOURCE = 'adminkit-CC6.5.3.8-canonical-product-router';
const events = [];
let storePatched = false;

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 44) => { const s = norm(v); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; };
const clean = (v) => db.clean ? db.clean(v) : norm(v).replace(/^post:/i, '').replace(/^ck:/i, '').trim();
const icon = {
  main: '🐋', channels: '📺', comments: '💬', moderation: '🛡', editor: '✏️', buttons: '⚪', gifts: '🎁', stats: '📊', billing: '🧾', referrals: '🤝', help: '❓', back: '↩️', home: '🏠'
};

function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function tryJson(v) { try { const p = JSON.parse(String(v || '')); return p && typeof p === 'object' ? p : null; } catch { return null; } }
function cb(u = {}) { return db.cb ? db.cb(u) : (u.callback || u.data?.callback || u.message?.callback || null); }
function msg(u = {}) { return db.msg ? db.msg(u) : (u.message || u.data?.message || cb(u)?.message || null); }
function payload(u = {}) { return db.payload ? db.payload(u) : (tryJson(cb(u)?.payload || u.payload || '') || {}); }
function action(u = {}) { const p = payload(u); return norm(p.action || p.route || p.cmd || db.action?.(u) || '').toLowerCase(); }
function adminId(u = {}) { return db.adminId ? db.adminId(u) : ''; }
function chatId(u = {}) { return db.chatId ? db.chatId(u) : ''; }
function callbackId(u = {}) { return db.callbackId ? db.callbackId(u) : ''; }
function messageId(u = {}) { return db.messageId ? db.messageId(u) : ''; }
function text(u = {}) { return db.text ? db.text(u) : norm(msg(u)?.text || msg(u)?.body?.text || ''); }
function startEvent(u = {}) { const t = norm(u.update_type || u.type || u.event_type || u.data?.update_type || '').toLowerCase(); const body = text(u).toLowerCase(); const p = norm(u.start_payload || u.payload || u.data?.payload || '').toLowerCase(); return !cb(u) && (t.includes('start') || ['start','/start','menu','/menu','меню'].includes(body) || ['start','menu','main'].includes(p)); }
function btn(label, route, extra = {}) { return { type: 'callback', text: label, payload: JSON.stringify({ action: route, ...extra }) }; }
function kb(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function log(item) { events.push({ ts: Date.now(), ...item }); while (events.length > 120) events.shift(); }
function resultMessageId(v = {}) { const match = JSON.stringify(v || {}).match(/"(?:message_id|messageId|id|mid)"\s*:\s*"([^"{}]+)"/); return match ? match[1] : ''; }
async function answer(u, notification = '') { const id = callbackId(u); if (!id) return; try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification }); } catch {} }

function ns(route = '') { const r = canonical(route); return r === 'main:home' ? 'main' : r.split(':')[0]; }
function canonical(route = '') {
  const r = norm(route).toLowerCase();
  const map = {
    ak_main_menu: 'main:home', main_menu: 'main:home', menu_main: 'main:home', home: 'main:home', start: 'main:home',
    comments_menu: 'comments:home', comments_choose_post: 'comments:choose_post', comments_post_card: 'comments:post',
    mod_start: 'moderation:home', moderation_menu: 'moderation:home', 'модерация': 'moderation:home',
    mod_choose_post: 'moderation:choose_post', mod_post_rules: 'moderation:post', mod_channel_rules: 'moderation:channel',
    mod_toggle_enabled: 'moderation:toggle_filter', mod_toggle_preset: 'moderation:toggle_basic', mod_toggle_links: 'moderation:toggle_links', mod_toggle_invites: 'moderation:toggle_invites', mod_toggle_ai: 'moderation:toggle_ai', mod_base_words: 'moderation:base_words', mod_add_stopword: 'moderation:manual_words', mod_logs: 'moderation:logs', mod_test_comment: 'moderation:test_comment',
    help_moderation: 'help:moderation', help_comments: 'help:comments', help_menu: 'help:home',
    gift_menu: 'gifts:home', gifts_menu: 'gifts:home', gift_create: 'gifts:create', buttons_menu: 'buttons:home', stats_menu: 'stats:home', channels_menu: 'channels:home'
  };
  return map[r] || r;
}
function isOwned(route = '') {
  const n = ns(route);
  return ['main','channels','comments','moderation','editor','buttons','gifts','stats','billing','referrals','help','comments_banner','comments_photo','comments_reactions'].includes(n);
}

async function setMenu(uid, mid) { try { if (uid && mid) await db.setMenu(uid, mid); } catch {} }
async function getMenu(uid) { try { return uid ? await db.getMenu(uid) : ''; } catch { return ''; } }
async function sendOrEdit(update, packet, preferEdit = true) {
  const uid = adminId(update);
  const mid = preferEdit ? messageId(update) : '';
  if (mid) {
    try { await api.editMessage({ botToken: config.botToken, messageId: mid, text: packet.text, attachments: packet.attachments || [], notify: false }); await setMenu(uid, mid); return { ok: true, mode: 'edit', messageId: mid }; }
    catch (error) { console.warn('[canonical product edit]', error?.message || error); }
  }
  const old = await getMenu(uid);
  if (old) { try { await api.deleteMessage({ botToken: config.botToken, messageId: old, timeoutMs: 1200 }); } catch {} }
  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  if (uid) args.userId = uid; else if (chatId(update)) args.chatId = chatId(update); else return { ok: false, reason: 'target_missing' };
  const result = await api.sendMessage(args);
  const id = resultMessageId(result);
  await setMenu(uid, id);
  return { ok: true, mode: 'send', messageId: id };
}

function channelIdOf(c = {}) { return norm(c.channelId || c.channel_id || c.id || c.chatId || c.chat_id || ''); }
function channelTitle(c = {}) { return norm(c.title || c.channelTitle || c.channelName || c.name || c.chatTitle || channelIdOf(c) || 'Канал'); }
function postKeyOf(p = {}) { return clean(p.commentKey || p.key || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')); }
function postTitleOf(p = {}) { return norm(p.title || p.originalText || p.postTitle || p.linkedByName || p.postId || 'Пост'); }
async function channelsFor(uid) { try { return await db.getChannels(uid); } catch { return []; } }
async function firstChannel(uid, explicit = '') { const channels = await channelsFor(uid); return channels.find((c) => channelIdOf(c) === explicit) || channels[0] || null; }
function localPosts(channelId = '') { try { const store = require('./store'); const rows = typeof store.listPostsByChannel === 'function' ? store.listPostsByChannel(channelId, 100) : Object.values(store.store?.posts || {}); return rows.filter((p) => !channelId || String(p.channelId || '') === String(channelId)); } catch { return []; } }
function isServicePostTitle(title = '') { const s = norm(title).toLowerCase(); return !s || /модерац|главное меню|выберите|помощь|текущие настройки|нажатие меняет|правила/.test(s); }
async function syncLocalPostsToDb(uid, channelId = '') {
  if (!uid || !channelId) return { imported: 0 };
  let imported = 0;
  for (const p of localPosts(channelId)) {
    const postId = norm(p.postId || p.messageId || '');
    const title = postTitleOf(p);
    if (!postId || isServicePostTitle(title)) continue;
    const saved = await db.upsertPost(uid, channelId, postId, title, { source: 'cc6538_local_store_sync', commentKey: postKeyOf(p), channelTitle: p.channelTitle || '' }, p.messageId || postId);
    if (saved) imported += 1;
  }
  return { imported };
}
async function postsFor(uid, channelId = '') {
  await syncLocalPostsToDb(uid, channelId);
  const fromDb = await db.getPosts(uid, channelId, 100).catch(() => []);
  const byKey = new Map();
  for (const p of fromDb) byKey.set(postKeyOf(p), { ...p, title: postTitleOf(p), source: 'db' });
  for (const p of localPosts(channelId)) {
    const key = postKeyOf(p);
    const postId = norm(p.postId || p.messageId || '');
    const title = postTitleOf(p);
    if (!key || !postId || isServicePostTitle(title)) continue;
    if (!byKey.has(key)) byKey.set(key, { channelId, postId, commentKey: key, title, messageId: p.messageId || postId, source: 'local' });
  }
  return [...byKey.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,100);
}
async function postByPayload(uid, p = {}) {
  const ch = norm(p.channelId || p.channel_id || '');
  const key = clean(p.commentKey || p.key || '');
  const postId = norm(p.postId || p.post_id || '');
  const rows = ch ? await postsFor(uid, ch) : [];
  return rows.find((x) => (key && postKeyOf(x) === key) || (postId && String(x.postId) === String(postId))) || { channelId: ch, postId, commentKey: key || (ch && postId ? `${ch}:${postId}` : ''), title: postId || 'Пост' };
}

function patchStoreSavePost() {
  if (storePatched) return;
  storePatched = true;
  try {
    const store = require('./store');
    if (!store || store.__cc6538Patched) return;
    const original = typeof store.savePost === 'function' ? store.savePost.bind(store) : null;
    if (!original) return;
    store.savePost = function cc6538SavePost(commentKey, post = {}) {
      const saved = original(commentKey, post);
      try {
        const channelId = norm(saved?.channelId || post.channelId || String(commentKey || '').split(':')[0] || '');
        const postId = norm(saved?.postId || post.postId || saved?.messageId || post.messageId || String(commentKey || '').split(':').pop() || '');
        const title = postTitleOf(saved || post);
        const key = postKeyOf(saved || { commentKey });
        if (channelId && postId && !isServicePostTitle(title)) {
          db.query('select admin_id as "adminId" from ak_admin_channels where channel_id=$1 order by updated_at desc limit 50', [channelId])
            .then(({ rows }) => Promise.all((rows || []).map((row) => db.upsertPost(row.adminId, channelId, postId, title, { source: 'cc6538_store_save_bridge', commentKey: key, channelTitle: saved?.channelTitle || '' }, saved?.messageId || postId))))
            .catch((e) => console.warn('[cc6538 store->db]', e?.message || e));
        }
      } catch (e) { console.warn('[cc6538 store patch]', e?.message || e); }
      return saved;
    };
    store.__cc6538Patched = true;
  } catch (e) { console.warn('[cc6538 patchStoreSavePost]', e?.message || e); }
}

function compactNav(section) { return [[btn(`${icon.help} Помощь`, `help:${section}`), btn(`${icon.back} Раздел`, `${section}:home`)], [btn(`${icon.home} Главное меню`, 'main:home')]]; }
function mainMenu() { return { text: `${icon.main} АдминКИТ\n\nПанель управления MAX-каналом.`, attachments: kb([
  [btn('📺 Каналы', 'channels:home'), btn('💬 Комменты', 'comments:home')],
  [btn('🛡 Модерация', 'moderation:home'), btn('✏️ Редактор', 'editor:home')],
  [btn('⚪ Кнопки', 'buttons:home'), btn('🎁 Подарки', 'gifts:home')],
  [btn('📊 Статистика', 'stats:home'), btn('🧾 Тарифы', 'billing:home')],
  [btn('🤝 Рефералы', 'referrals:home'), btn('❓ Помощь', 'help:home')]
]) }; }
async function channelsMenu(uid) { const ch = await channelsFor(uid); return { text: `📺 Каналы\n\nПодключено: ${ch.length}.\nПамять хранится в PostgreSQL.`, attachments: kb([...ch.slice(0,6).map((c)=>[btn(cut(channelTitle(c),32),'channels:select',{channelId:channelIdOf(c)})]), [btn('➕ Подключить', 'channels:connect'), btn('✅ Проверить права', 'channels:verify_access')], [btn('🔐 Доступы', 'access:channel_status'), btn('🏠 Главное меню', 'main:home')]]) }; }
async function choosePostMenu(uid, section, p = {}) { const ch = await firstChannel(uid, norm(p.channelId || p.channel_id || '')); if (!ch) return { text: `${sectionTitle(section)} → выбор поста\n\nКанал не найден.`, attachments: kb([[btn('📺 Каналы', 'channels:home')], ...compactNav(section)]) }; const channelId = channelIdOf(ch); const posts = await postsFor(uid, channelId); return { text: `${sectionTitle(section)} → выбор поста\n\n📺 ${channelTitle(ch)}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments: kb([...posts.slice(0,10).map((post,i)=>[btn(`${i+1}. ${cut(postTitleOf(post),36)}`, `${section}:post`, { channelId, postId: post.postId, commentKey: postKeyOf(post) })]), ...compactNav(section)]) }; }
function sectionTitle(section) { return { comments:'💬 Комментарии', moderation:'🛡 Модерация', editor:'✏️ Редактор постов', buttons:'⚪ Кнопки', gifts:'🎁 Подарки', stats:'📊 Статистика', channels:'📺 Каналы', billing:'🧾 Тарифы', referrals:'🤝 Рефералы', help:'❓ Помощь' }[section] || section; }
async function simpleHome(section, description, actions = []) { return { text: `${sectionTitle(section)}\n\n${description}`, attachments: kb([...actions.map((a)=>Array.isArray(a[0])?a.map(x=>btn(x[0],x[1])):[btn(a[0],a[1])]), ...compactNav(section)]) }; }
async function commentsHome() { return simpleHome('comments', 'Обсуждения под постами: включение, старые посты, баннер, фото, реакции.', [[['⚡ Авто','comments:auto_new'],['📌 Старый пост','comments:old_post']], ['📌 Выбрать пост','comments:choose_post'], [['🖼 Баннер','comments_banner:home'],['📷 Фото','comments_photo:home']], [['❤️ Реакции','comments_reactions:home'],['👀 Вид','comments:preview']]]); }
async function editorHome() { return simpleHome('editor', 'Редактирование текста и кнопок поста. Новые посты берутся из PostgreSQL и локального store.', [['📌 Выбрать пост','editor:choose_post'], ['🕘 История','editor:history']]); }
async function giftsHome() { return simpleHome('gifts', 'Лид-магниты: создание, проверка подписки, тестовая выдача.', [[['🎁 Создать','gifts:create'],['📌 Пост','gifts:choose_post']], [['📋 Список','gifts:list'],['🧪 Тест','gifts:test_send']], ['🔐 Проверка подписки','gifts:check_subscription']]); }
async function buttonsHome() { return simpleHome('buttons', 'CTA-кнопки под постом: добавить, изменить, удалить, предпросмотр.', [[['➕ Добавить','buttons:add'],['📌 Пост','buttons:choose_post']], [['📋 Список','buttons:list'],['👀 Вид','buttons:preview']]]); }
async function moderationHome(uid, p = {}) { const ch = await firstChannel(uid, norm(p.channelId || '')); if (!ch) return simpleHome('moderation', 'Сначала подключите канал.', [['📺 Каналы','channels:home']]); const scope = buildScope(uid, { ...p, channelId: channelIdOf(ch) }); return moderationRules(scope); }
function buildScope(uid, p = {}) { const channelId = norm(p.channelId || p.channel_id || ''); const postId = norm(p.postId || p.post_id || ''); const commentKey = clean(p.commentKey || (channelId && postId ? `${channelId}:${postId}` : '')); return { adminId: uid, channelId, scopeType: postId ? 'post' : 'channel', postId, commentKey }; }
function yes(v) { return v ? '✅' : '❌'; }
async function moderationRules(scope) { const rules = await db.getRules(scope); const chTitle = channelTitle((await channelsFor(scope.adminId)).find(c=>channelIdOf(c)===scope.channelId) || { title: scope.channelId }); const custom = Array.isArray(rules.customBlocklist) ? rules.customBlocklist : []; const title = scope.postId ? (await postByPayload(scope.adminId, scope)).title : ''; const p = { channelId: scope.channelId, postId: scope.postId || '', commentKey: scope.commentKey || '', scopeType: scope.scopeType };
  return { text: [`🛡 Модерация`, `📺 ${chTitle}`, `🎯 ${scope.postId ? 'Пост: ' + cut(title,42) : 'Весь канал'}`, '', `Фильтр ${yes(rules.enabled!==false)} · База ${yes(rules.applyPresetCommon!==false)}`, `Ссылки ${rules.blockLinks?'❌':'✅'} · Инвайты ${rules.blockInvites===false?'✅':'❌'} · AI ${yes(rules.aiEnabled)}`, `Стоп-слова: ${custom.length}`].join('\n'), attachments: kb([
    [btn('🛡 Канал','moderation:channel',{channelId:scope.channelId}), btn('🎯 Пост','moderation:choose_post',{channelId:scope.channelId})],
    [btn(rules.enabled===false?'✅ Фильтр':'⏸ Фильтр','moderation:toggle_filter',p), btn('🧱 База','moderation:base_words',p)],
    [btn(rules.blockLinks?'🔗 Разрешить':'🔗 Запретить','moderation:toggle_links',p), btn(rules.blockInvites===false?'✉️ Запретить':'✉️ Разрешить','moderation:toggle_invites',p)],
    [btn(rules.aiEnabled?'🤖 AI выкл':'🤖 AI вкл','moderation:toggle_ai',p), btn('➕ Стоп-слово','moderation:manual_words',p)],
    [btn('📋 Журнал','moderation:logs',p), btn('🧪 Проверка','moderation:test_comment',p)],
    ...compactNav('moderation')
  ]) };
}
async function postCard(uid, section, p = {}) { const post = await postByPayload(uid, p); const title = cut(postTitleOf(post), 64); if (section === 'moderation') return moderationRules(buildScope(uid, p)); const routeBase = section; const rows = section === 'editor' ? [[btn('✏️ Текст','editor:edit_text',p), btn('👀 Вид','editor:preview',p)], [btn('💾 Сохранить','editor:save',p), btn('↩️ Оригинал','editor:restore_original',p)]] : section === 'comments' ? [[btn('✅/⏸ Комменты','comments:toggle',p), btn('👀 Обсуждение','comments:open_discussion',p)], [btn('🖼 Баннер','comments_banner:home',p), btn('❤️ Реакции','comments_reactions:home',p)]] : section === 'gifts' ? [[btn('🎁 Создать','gifts:create',p), btn('🔐 Подписка','gifts:check_subscription',p)], [btn('🧪 Тест','gifts:test_send',p), btn('📋 Список','gifts:list',p)]] : section === 'buttons' ? [[btn('➕ Добавить','buttons:add',p), btn('📋 Список','buttons:list',p)], [btn('👀 Вид','buttons:preview',p), btn('🗑 Удалить','buttons:delete',p)]] : [];
  return { text: `${sectionTitle(section)} → пост\n\n📝 ${title}\n\nВыберите действие.`, attachments: kb([...rows, [btn('📌 К списку', `${routeBase}:choose_post`, p)], ...compactNav(section)]) };
}
async function toggleRule(uid, route, p = {}) { const scope = buildScope(uid, p); const old = await db.getRules(scope); const next = { ...old }; if (route.endsWith('toggle_filter')) next.enabled = old.enabled === false; else if (route.endsWith('toggle_basic')) next.applyPresetCommon = old.applyPresetCommon === false; else if (route.endsWith('toggle_links')) next.blockLinks = !old.blockLinks; else if (route.endsWith('toggle_invites')) next.blockInvites = old.blockInvites === false; else if (route.endsWith('toggle_ai')) next.aiEnabled = !old.aiEnabled; const saved = await db.saveRules(scope, next); return moderationRules({ ...scope, ...saved }); }
async function baseWords(uid, p = {}) { const scope = buildScope(uid,p); const words = ['спам','скам','мошенник','обман','лохотрон','развод','ставки','казино','крипта','18+','наркотики','займ срочно','личка','напиши в личку']; return { text: `🧱 Базовые слова\n\nВключены в стандартный фильтр.\nПример: ${words.join(', ')}.`, attachments: kb([[btn('↩️ Назад','moderation:post',p)], ...compactNav('moderation')]) }; }
async function manualWords(uid,p={}) { return { text: `➕ Стоп-слово\n\nПришлите слово отдельным сообщением.\nДля теста используйте кнопку ниже.`, attachments: kb([[btn('➕ Добавить «спам»','moderation:add_word',p)], [btn('🧹 Очистить','moderation:clear_words',p)], ...compactNav('moderation')]) }; }
async function help(section='home') { return { text: `❓ Помощь\n\nРаздел: ${sectionTitle(section)}.\nОдин раздел — один владелец маршрута. Внизу всегда «Раздел» и «Главное меню».`, attachments: kb([[btn('🏠 Главное меню','main:home')]]) }; }
async function feature(route, section) { return { text: `${sectionTitle(section)}\n\nФункция открыта в тестовом режиме.\nМаршрут: ${route}`, attachments: kb(compactNav(section)) }; }

async function model(uid, routeRaw, p = {}) { const route = canonical(routeRaw); const section = ns(route); if (route === 'main:home') return mainMenu(); if (route.startsWith('help:')) return help(route.split(':')[1] || 'home'); if (route === 'channels:home') return channelsMenu(uid); if (route === 'comments:home') return commentsHome(); if (route === 'editor:home') return editorHome(); if (route === 'gifts:home') return giftsHome(); if (route === 'buttons:home') return buttonsHome(); if (route === 'moderation:home' || route === 'moderation:channel') return moderationHome(uid, p); if (route.endsWith(':choose_post')) return choosePostMenu(uid, section, p); if (route.endsWith(':post')) return postCard(uid, section, p); if (route.startsWith('moderation:toggle_')) return toggleRule(uid, route, p); if (route === 'moderation:base_words') return baseWords(uid,p); if (route === 'moderation:manual_words' || route === 'moderation:add_word') return manualWords(uid,p); if (route === 'stats:home') return simpleHome('stats','Канал, посты, комментарии, реакции, клики и подарки.', [[['📊 Канал','stats:channel'],['📌 Пост','stats:choose_post']], [['7 дней','stats:period_7d'],['30 дней','stats:period_30d']]]); if (route === 'billing:home') return simpleHome('billing','Пробный период, подписка, токены и тариф.', [[['🎁 Пробный','billing:trial'],['💳 Купить','billing:buy']], [['📋 Мой тариф','billing:my_plan'],['🔐 Токен','billing:activate_token']]]); if (route === 'referrals:home') return simpleHome('referrals','Реферальная ссылка, приглашения и бонусы.', [[['🔗 Ссылка','referrals:my_link'],['📊 Статус','referrals:stats']]]); return feature(route, section); }

async function handleUpdate(update = {}, forcedRoute = '') {
  await db.init().catch(()=>{});
  patchStoreSavePost();
  const uid = adminId(update);
  if (!uid) return false;
  const route = forcedRoute || (startEvent(update) ? 'main:home' : canonical(action(update)));
  if (!route || !isOwned(route)) return false;
  const packet = await model(uid, route, payload(update));
  await answer(update, '');
  const result = await sendOrEdit(update, packet, !startEvent(update));
  return { ok: true, handledBy: RUNTIME, route, result };
}

async function registerPostFromRequest(body = {}) {
  await db.init();
  const channelId = norm(body.channelId || body.channel_id || (body.commentKey || '').split(':')[0] || '');
  const postId = norm(body.postId || body.post_id || body.messageId || body.message_id || (body.commentKey || '').split(':').pop() || '');
  const commentKey = clean(body.commentKey || body.key || (channelId && postId ? `${channelId}:${postId}` : ''));
  const title = norm(body.title || body.postTitle || body.text || postId || 'Пост');
  if (!channelId || !postId || !commentKey) return { ok:false, reason:'scope_missing', channelId, postId, commentKey };
  const { rows } = await db.query('select admin_id as "adminId" from ak_admin_channels where channel_id=$1 order by updated_at desc limit 50', [channelId]);
  const saved = [];
  for (const row of rows || []) { const x = await db.upsertPost(row.adminId, channelId, postId, title, { source:'cc6538_register_post', commentKey, channelTitle: body.channelTitle || '' }, postId); if (x) saved.push(x); }
  return { ok:true, registered:saved.length, channelId, postId, commentKey, title };
}
async function backfillAll() {
  await db.init();
  const stats = { channels: 0, localPosts: 0, imported: 0 };
  const store = require('./store');
  const posts = Object.values(store.store?.posts || {});
  const byChannel = new Map();
  for (const p of posts) { const ch = norm(p.channelId || postKeyOf(p).split(':')[0] || ''); if (!ch) continue; if (!byChannel.has(ch)) byChannel.set(ch, []); byChannel.get(ch).push(p); }
  for (const [channelId, list] of byChannel) {
    stats.channels += 1; stats.localPosts += list.length;
    const { rows } = await db.query('select admin_id as "adminId" from ak_admin_channels where channel_id=$1 order by updated_at desc limit 50', [channelId]);
    for (const row of rows || []) {
      for (const p of list) {
        const postId = norm(p.postId || p.messageId || ''); const title = postTitleOf(p); if (!postId || isServicePostTitle(title)) continue;
        const saved = await db.upsertPost(row.adminId, channelId, postId, title, { source:'cc6538_backfill', commentKey: postKeyOf(p), channelTitle:p.channelTitle||'' }, p.messageId || postId);
        if (saved) stats.imported += 1;
      }
    }
  }
  return stats;
}
function selfTest() { return { ok:true, runtime:RUNTIME, sourceMarker:SOURCE, canonicalProductRouter:true, oldProductionTestUiDisabled:true, compactMenu:true, dbPostBridge:true, routeOwners:['comments','moderation','editor','buttons','gifts','channels'] }; }

function installExpressPatch() {
  if (Module._load.__cc6538CanonicalProduct) return;
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6538Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6538) {
          app.__cc6538 = true;
          app.use((req,res,next)=>{
            const r = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (r === '/debug/canonical-product-router') { noCache(res); return res.json(selfTest()); }
            if (r === '/debug/post-backfill') { noCache(res); return backfillAll().then(x=>res.json({ok:true,runtime:RUNTIME,sourceMarker:SOURCE,...x})).catch(e=>res.status(500).json({ok:false,error:e?.message||String(e)})); }
            if (r === '/debug/canonical-product-events') { noCache(res); return res.json({ok:true,runtimeVersion:RUNTIME,events:events.slice(-100)}); }
            next();
          });
          try { app.use('/api/ak/register-post', loaded.json({limit:'128kb'})); } catch {}
          app.post('/api/ak/register-post', async (req,res)=>{ noCache(res); try { res.json({runtimeVersion:RUNTIME,sourceMarker:SOURCE,...await registerPostFromRequest(req.body||{})}); } catch(e){ res.status(500).json({ok:false,error:e?.message||String(e)}); } });
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => {
            const rt = String(route || '').toLowerCase();
            if (!rt.includes('/webhook')) return oldPost(route, ...handlers);
            return oldPost(route, async (req,res,next)=>{
              try {
                const r = startEvent(req.body||{}) ? 'main:home' : canonical(action(req.body||{}));
                const should = startEvent(req.body||{}) || isOwned(r);
                log({ route:r, handled:should, payload:payload(req.body||{}) });
                if (should) return res.json(await handleUpdate(req.body||{}, r));
              } catch(e) { log({ error:e?.message||String(e), action:action(req.body||{}) }); }
              return next();
            }, ...handlers);
          };
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6538Wrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__cc6538CanonicalProduct = true;
}

function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  patchStoreSavePost();
  installExpressPatch();
  return { ok:true, runtimeVersion:RUNTIME, sourceMarker:SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, registerPostFromRequest, backfillAll };
