'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const store = require('./store');
const db = require('./cc5-db-core');
const { patchStoredPost } = require('./services/postPatcher');

if (!store.store) store.store = store;

const RUNTIME = 'HARD-V3-ADMIN-MENU-2.6-POST-TOGGLE-DEDUP';
const mem = new Map();
const KNOWN_CHANNEL_TITLES = { '-73175958664622': 'АдминКИТ клуб' };

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 80) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const linesOf = (v) => String(v || '').split(/[\n,;]/g).map(x => clean(x).toLowerCase()).filter(Boolean);
const isOn = (v, def = true) => v === undefined ? def : !!v;
const status = (v, def = true) => isOn(v, def) ? 'включено' : 'выключено';
const mark = (v, def = true) => isOn(v, def) ? '✅' : '⏸';
const isTech = (v) => /^-?\d{8,}$/.test(clean(v)) || /^[a-f0-9]{16,}$/i.test(clean(v));
const isHuman = (v) => !!clean(v) && !isTech(v) && !['Канал не выбран', 'Пост не выбран', 'Подключённый канал'].includes(clean(v));

function channelTitleById(id = '') { return KNOWN_CHANNEL_TITLES[clean(id)] || ''; }
function humanChannel(id = '', title = '') { return isHuman(title) ? cut(title) : (channelTitleById(id) || (id ? 'Подключённый канал' : 'Канал не выбран')); }
function humanPost(s = {}) { const t = clean(s.selectedPostTitle || s.buttonsPostTitle || s.giftPostTitle || ''); return isHuman(t) ? cut(t) : ((s.selectedPostId || s.selectedCommentKey) ? 'Пост выбран' : 'не выбран'); }
function isMenuText(v = '') { return /админкит|главное меню|мои каналы|комментарии$|каналы$|модерация|кнопки|подарки|статус:|выберите|подключённый канал|нужно ввести/i.test(clean(v)); }
function postTitle(p = {}) { const t = clean(p.title || p.originalText || p.text || p.caption || ''); return isHuman(t) && !isMenuText(t) ? cut(t, 38) : 'Пост'; }
function titleKey(p = {}) { return clean(postTitle(p)).toLowerCase(); }

const MAIN = [ ['📺 Каналы', 'channels:home'], ['💬 Комментарии', 'comments:home'], ['🎁 Подарки', 'gifts:home'], ['🔘 Кнопки', 'buttons:home'], ['🛡 Модерация', 'moderation:home'] ];
const START = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню', 'начать', 'вы начали общение с ботом']);
const LABELS = {
  commentsBannerText: 'текст баннера', commentsBannerButton: 'текст кнопки баннера', commentsBannerLink: 'ссылку или действие баннера',
  giftTitle: 'название подарка', giftLink: 'ссылку или файл подарка', giftMessage: 'сообщение получателю',
  ctaButtonText: 'текст кнопки', ctaButtonLink: 'ссылку или действие кнопки',
  moderationStopwords: 'стоп-слово или несколько слов через запятую', moderationRules: 'правило модерации'
};
const ALIAS = { 'comments:select': 'comments:posts', 'comments:pick': 'comments:posts', 'comments:view': 'comments:preview', 'comments:banner_text': 'comments:banner:text', 'comments:banner_button': 'comments:banner:button', 'comments:banner_link': 'comments:banner:link', 'buttons:add': 'buttons:input:ctaButtonText', 'buttons:select': 'buttons:posts', 'gifts:create': 'gifts:input:giftTitle', 'gifts:select': 'gifts:posts', 'channels:verify': 'channels:check' };
function normRoute(r = '') { const x = clean(r); if (START.has(x.toLowerCase())) return 'main:home'; return ALIAS[x] || x || 'main:home'; }
function owner(r = '') { return clean(r).split(':')[0] || 'main'; }
function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function textOf(u) { const m = msg(u); return clean(m?.body?.text || m?.text || body(u).text || ''); }
function payloadOf(u) { const raw = cb(u)?.payload || cb(u)?.data || ''; if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { r: raw }; } } return raw && typeof raw === 'object' ? raw : {}; }
function routeOf(u) { const p = payloadOf(u); return normRoute(p.r || p.route || textOf(u)); }
function adminId(u) { try { return db.adminId(u) || db.chatId(u) || ''; } catch { return clean(cb(u)?.user?.user_id || msg(u)?.sender?.user_id || body(u).user_id || ''); } }
function chatId(u) { try { return db.chatId(u) || ''; } catch { return clean(msg(u)?.recipient?.chat_id || msg(u)?.chat_id || body(u).chat_id || ''); } }
function callbackId(u) { try { return db.callbackId(u); } catch { return clean(cb(u)?.callback_id || cb(u)?.id || ''); } }
function messageId(u) { try { return db.messageId(u) || ''; } catch { return clean(cb(u)?.message?.message_id || msg(u)?.message_id || msg(u)?.id || ''); } }
function responseMessageId(d = {}) { return clean(d.message_id || d.messageId || d.id || d.message?.message_id || d.message?.id || d.data?.message_id || d.data?.id || ''); }
function menuKey(u) { return chatId(u) || adminId(u) || 'global'; }

async function getFlow(id) { try { return id ? (await db.getFlow(id)) || {} : {}; } catch { return mem.get(id) || {}; } }
async function getState(id) { return (await getFlow(id)).menuV3 || {}; }
async function saveState(id, patch) { const f = await getFlow(id); const next = { ...f, menuV3: { ...(f.menuV3 || {}), ...patch, updatedAt: Date.now() } }; try { await db.setFlow(id, next); } catch { mem.set(id, next); } return next.menuV3; }
async function getLastMenu(k) { try { return await db.getMenu(k); } catch { return clean(mem.get('menu:' + k)); } }
async function setLastMenu(k, mid) { if (!k || !mid) return; try { await db.setMenu(k, mid); } catch { mem.set('menu:' + k, mid); } }

function addChannel(map, raw = {}) { const id = clean(raw.channelId || raw.id || raw.chat_id || raw.channel_id); if (!id) return; const title = humanChannel(id, raw.title || raw.channelTitle || raw.name || raw.caption || ''); map.set(id, { id, channelId: id, title }); }
async function listChannels(id) { const m = new Map(); try { (await db.getChannels(id)).forEach(c => addChannel(m, c)); } catch {} try { (store.getChannelsList ? store.getChannelsList() : []).forEach(c => addChannel(m, c)); } catch {} try { Object.values(store.store?.channels || store.channels || {}).forEach(c => addChannel(m, c)); } catch {} return [...m.values()]; }
async function activeChannel(id) { const s = await getState(id); const list = await listChannels(id); const found = list.find(x => x.id === s.activeChannelId) || list[0] || { id: '', title: '' }; return { ...found, title: humanChannel(found.id, found.title || s.activeChannelTitle) }; }
async function listPosts(id, channelId = '') {
  const out = [];
  try { out.push(...(await db.getPosts(id, channelId, 100))); } catch {}
  try { (store.getPostsList ? store.getPostsList() : []).forEach(p => { if (!channelId || String(p.channelId || '') === String(channelId)) out.push({ postId: p.postId, commentKey: p.commentKey, title: p.title || p.originalText || p.text || p.caption || '', updatedAt: p.updatedAt || p.createdAt || 0 }); }); } catch {}
  const byKey = new Set();
  const byTitle = new Set();
  return out
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .filter(p => {
      const k = clean(p.commentKey || p.postId || p.messageId);
      const tk = titleKey(p);
      if (!k || byKey.has(k) || isMenuText(p.title || p.text || '')) return false;
      if (tk && byTitle.has(tk)) return false;
      byKey.add(k);
      if (tk) byTitle.add(tk);
      return true;
    }).slice(0, 50);
}

function findStoredPost({ commentKey = '', postId = '', channelId = '' } = {}) {
  const posts = store.store?.posts || {};
  const key = clean(commentKey) || (channelId && postId ? `${clean(channelId)}:${clean(postId)}` : '');
  if (key && posts[key]) return { key, post: posts[key] };
  for (const [k, p] of Object.entries(posts)) {
    if (commentKey && String(p?.commentKey || k) === String(commentKey)) return { key: k, post: p };
    if (postId && String(p?.postId || '') === String(postId) && (!channelId || String(p?.channelId || '') === String(channelId))) return { key: k, post: p };
  }
  return { key, post: null };
}

async function syncPostComments(id, state = null) {
  const s = state || await getState(id);
  const ch = await activeChannel(id);
  const found = findStoredPost({ commentKey: s.selectedCommentKey, postId: s.selectedPostId, channelId: ch.id || s.activeChannelId });
  if (!found.key) return { ok: false, reason: 'post_not_selected' };
  const commentsDisabled = !isOn(s.commentsEnabled, true);
  const patch = { commentsDisabled, commentsEnabled: !commentsDisabled, commentKey: found.key, channelId: clean(found.post?.channelId || ch.id || s.activeChannelId), postId: clean(found.post?.postId || s.selectedPostId), updatedAt: Date.now() };
  if (store.savePost) store.savePost(found.key, patch);
  else { if (!store.store.posts) store.store.posts = {}; store.store.posts[found.key] = { ...(found.post || {}), ...patch }; if (store.saveStore) store.saveStore(); }
  const after = findStoredPost({ commentKey: found.key }).post || {};
  if (after.messageId && config.botToken) {
    try {
      return await patchStoredPost({ botToken: config.botToken, appBaseUrl: config.appBaseUrl, botUsername: config.botUsername, maxDeepLinkBase: config.maxDeepLinkBase, commentKey: found.key });
    } catch (error) {
      return { ok: false, reason: 'patch_failed', error: error?.message || String(error) };
    }
  }
  return { ok: true, skipped: true, reason: 'message_id_missing' };
}

function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: normRoute(route), ...extra }) }; }
function keyboard(items, route = 'main:home') { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {}))); const o = owner(route); if (o !== 'main') rows.push([btn('↩️ Назад', o + ':home'), btn('🏠 Главное', 'main:home')]); return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function screen(title, textLines, items = [], route = 'main:home') { return { text: [title, '', (Array.isArray(textLines) ? textLines.filter(Boolean).join('\n') : String(textLines || ''))].join('\n'), attachments: keyboard(items, route) }; }
function mainScreen() { return screen('🐋 АдминКИТ', ['Выберите раздел.'], MAIN, 'main:home'); }
function banner(s) { return { enabled: s.commentsBanner !== false, text: clean(s.commentsBannerText) || 'Разработано АдминКИТ', button: clean(s.commentsBannerButton) || 'Открыть', link: clean(s.commentsBannerLink) || '', scope: clean(s.commentsBannerScope) || 'all', place: clean(s.commentsBannerPlace) || 'start' }; }
function baseStatus(s, ch) { return [`Канал: ${humanChannel(ch.id, ch.title || s.activeChannelTitle)}`, `Пост: ${humanPost(s)}`]; }
function stopwordsText(s) { const arr = linesOf(s.moderationStopwords); return arr.length ? arr.slice(0, 8).join(', ') : 'не заданы'; }
function sectionHome(sec, s = {}, ch = {}) {
  if (sec === 'channels') return screen('📺 Каналы', [`Активный канал: ${humanChannel(ch.id, ch.title || s.activeChannelTitle)}`, ch.id ? 'Канал подключён.' : 'Канал ещё не подключён.', `Автокомментарии: ${status(s.channelAutoComments)}`, `Безопасное обновление: ${status(s.channelSafePatch)}`], [['📋 Мои каналы', 'channels:list'], ['➕ Подключить', 'channels:connect'], ['✅ Проверить права', 'channels:check'], [`${mark(s.channelAutoComments)} Автокомменты`, 'channels:toggle:channelAutoComments'], [`${mark(s.channelSafePatch)} Безопасно обновлять`, 'channels:toggle:channelSafePatch']], 'channels:home');
  if (sec === 'comments') return screen('💬 Комментарии', baseStatus(s, ch).concat([`Комментарии: ${status(s.commentsEnabled)}`, `Фото: ${status(s.commentsPhoto)}`, `Реакции/ответы: ${status(s.commentsReactions)}`, `Баннер: ${banner(s).enabled ? 'включен' : 'выключен'}`]), [[`${mark(s.commentsEnabled)} Комментарии`, 'comments:toggle:commentsEnabled'], ['📌 Выбрать пост', 'comments:posts'], [`${mark(s.commentsPhoto)} Фото`, 'comments:toggle:commentsPhoto'], [`${mark(s.commentsReactions)} Реакции`, 'comments:toggle:commentsReactions'], ['🖼 Баннер', 'comments:banner'], ['👀 Предпросмотр', 'comments:preview']], 'comments:home');
  if (sec === 'gifts') return screen('🎁 Подарки', baseStatus(s, ch).concat([`Подарки: ${status(s.giftsEnabled, false)}`, `Название: ${clean(s.giftTitle) || 'не задано'}`, `Файл/ссылка: ${clean(s.giftLink) ? 'задано' : 'не задано'}`, `Только подписчикам: ${status(s.giftsRequireSubscription)}`]), [[`${mark(s.giftsEnabled, false)} Подарки`, 'gifts:toggle:giftsEnabled'], ['📌 Пост', 'gifts:posts'], ['✏️ Название', 'gifts:input:giftTitle'], ['🔗 Файл/ссылка', 'gifts:input:giftLink'], [`${mark(s.giftsRequireSubscription)} Только подписчикам`, 'gifts:toggle:giftsRequireSubscription'], ['🧪 Проверить', 'gifts:test']], 'gifts:home');
  if (sec === 'buttons') return screen('🔘 Кнопки', baseStatus(s, ch).concat([`Кнопка: ${status(s.buttonsEnabled, false)}`, `Текст: ${clean(s.ctaButtonText) || 'не задан'}`, `Действие: ${clean(s.ctaButtonLink) ? 'задано' : 'не задано'}`]), [[`${mark(s.buttonsEnabled, false)} Кнопка`, 'buttons:toggle:buttonsEnabled'], ['📌 Пост', 'buttons:posts'], ['✏️ Текст', 'buttons:input:ctaButtonText'], ['🔗 Действие', 'buttons:input:ctaButtonLink'], ['👀 Проверить', 'buttons:preview'], ['💾 Сохранить', 'buttons:save']], 'buttons:home');
  if (sec === 'moderation') return screen('🛡 Модерация', [`Канал: ${humanChannel(ch.id, ch.title || s.activeChannelTitle)}`, `Модерация: ${status(s.moderationEnabled)}`, `Стоп-слова: ${stopwordsText(s)}`, `Ссылки: ${s.moderationLinksAllowed === false ? 'запрещены' : 'разрешены'}`], [[`${mark(s.moderationEnabled)} Модерация`, 'moderation:toggle:moderationEnabled'], ['➕ Стоп-слово', 'moderation:input:moderationStopwords'], [`${s.moderationLinksAllowed === false ? '🚫' : '✅'} Ссылки`, 'moderation:toggle:moderationLinksAllowed'], ['📖 Журнал', 'moderation:log'], ['🧹 Очистить', 'moderation:clear']], 'moderation:home');
  return mainScreen();
}

async function syncModeration(id, s = null) {
  const state = s || await getState(id);
  const ch = await activeChannel(id);
  const channelId = clean(ch.id || state.activeChannelId || '');
  if (!channelId) return;
  const words = linesOf(state.moderationStopwords);
  const next = { ...(store.store?.moderation?.byChannel?.[channelId] || {}), enabled: state.moderationEnabled !== false, basicEnabled: true, stopwordsEnabled: state.moderationStopwordsEnabled !== false, applyPresetCommon: false, customBlocklist: words, blockLinks: state.moderationLinksAllowed === false, blockInvites: state.moderationInvitesAllowed !== false, aiEnabled: !!state.moderationAi, action: 'reject', updatedAt: Date.now() };
  if (!store.store.moderation) store.store.moderation = { byChannel: {}, logs: [] };
  if (!store.store.moderation.byChannel) store.store.moderation.byChannel = {};
  store.store.moderation.byChannel[channelId] = next;
  try { store.saveStore(); } catch {}
}

async function postPicker(id, sec) { const ch = await activeChannel(id); const list = await listPosts(id, ch.id); return screen('📌 Выбрать пост', list.length ? [`Найдено постов: ${list.length}`, 'Нажмите нужный пост.'] : ['Постов пока нет.', 'Для старого поста перешлите публикацию боту.'], list.slice(0, 10).map((p, i) => [`${i + 1}. ${postTitle(p)}`, `${sec}:post`, { postId: p.postId, commentKey: p.commentKey, title: postTitle(p) }]), `${sec}:posts`); }
async function selectPost(id, sec, p = {}) {
  const ch = await activeChannel(id);
  const found = findStoredPost({ commentKey: p.commentKey, postId: p.postId, channelId: ch.id });
  const t = isHuman(p.title) ? cut(p.title) : postTitle(found.post || p);
  const patch = { selectedPostId: clean(p.postId || found.post?.postId), selectedCommentKey: clean(p.commentKey || found.key), selectedPostTitle: t, commentsEnabled: found.post?.commentsDisabled === true ? false : true };
  if (sec === 'gifts') Object.assign(patch, { giftPostId: patch.selectedPostId, giftPostTitle: t });
  if (sec === 'buttons') Object.assign(patch, { buttonsPostId: patch.selectedPostId, buttonsPostTitle: t });
  await saveState(id, patch);
}
function toggleValue(s, key) { if (key === 'moderationLinksAllowed' || key === 'moderationInvitesAllowed') return s[key] === false; const def = !['buttonsEnabled', 'giftsEnabled', 'buttonsRequestContact', 'buttonsRequestGeo', 'moderationAi'].includes(key); return !isOn(s[key], def); }

async function renderAsync(rawRoute = 'main:home', id = '', p = {}) {
  const route = normRoute(rawRoute), sec = owner(route); let s = await getState(id); let ch = await activeChannel(id);
  if (route === 'main:home') return mainScreen();
  if (MAIN.some(x => owner(x[1]) === sec) && route.endsWith(':home')) return sectionHome(sec, s, ch);
  if (route.includes(':toggle:')) {
    const key = route.split(':toggle:')[1];
    s = await saveState(id, { [key]: toggleValue(s, key) });
    if (sec === 'moderation') await syncModeration(id, s);
    if (sec === 'comments' && key === 'commentsEnabled') await syncPostComments(id, s);
    return sectionHome(sec, await getState(id), ch);
  }
  if (route.includes(':input:')) { const key = route.split(':input:')[1]; await saveState(id, { mode: `await:${sec}:${key}` }); return screen('✏️ Ввод', [`Пришлите следующим сообщением: ${LABELS[key] || 'значение'}.`], [], `${sec}:home`); }
  if (['comments:posts', 'gifts:posts', 'buttons:posts'].includes(route)) return postPicker(id, sec);
  if (['comments:post', 'gifts:post', 'buttons:post'].includes(route)) { await selectPost(id, sec, p); return sectionHome(sec, await getState(id), ch); }
  if (route === 'channels:list') { const list = await listChannels(id); return screen('📋 Мои каналы', list.length ? [`Найдено каналов: ${list.length}`, 'Нажмите канал, чтобы сделать активным.'] : ['Каналы пока не найдены.', 'Перешлите пост из канала.'], list.slice(0, 10).map((c, i) => [`${i + 1}. ${humanChannel(c.id, c.title)}`, 'channels:select', { channelId: c.id, channelTitle: humanChannel(c.id, c.title) }]), 'channels:list'); }
  if (route === 'channels:select') { const title = humanChannel(p.channelId, p.channelTitle); await saveState(id, { activeChannelId: clean(p.channelId), activeChannelTitle: title }); await syncModeration(id); return screen('✅ Канал выбран', [`Теперь работаем с каналом: ${title}.`], [['📺 Каналы', 'channels:home']], 'channels:home'); }
  if (route === 'channels:connect') { await saveState(id, { mode: 'await_channel_forward', section: 'channels' }); return screen('➕ Подключить канал', ['Перешлите сюда любой пост из канала.'], [], 'channels:connect'); }
  if (route === 'channels:check') return screen('✅ Проверить права', ch.id ? [`Канал: ${humanChannel(ch.id, ch.title)}`, 'Бот должен быть администратором и иметь право редактировать посты.'] : ['Сначала подключите канал.'], [], 'channels:check');
  if (route === 'comments:banner') { const b = banner(s); return screen('🖼 Баннер', [`Статус: ${b.enabled ? 'включен' : 'выключен'}`, `Текст: ${b.text}`, `Кнопка: ${b.button}`, `Действие: ${b.link ? 'задано' : 'не задано'}`], [['✅ Вкл', 'comments:banner:on'], ['⏸ Выкл', 'comments:banner:off'], ['✏️ Текст', 'comments:banner:text'], ['🔘 Кнопка', 'comments:banner:button'], ['🔗 Ссылка', 'comments:banner:link'], ['↩️ Сброс', 'comments:banner:reset']], 'comments:banner'); }
  if (route === 'comments:banner:on') { await saveState(id, { commentsBanner: true }); return renderAsync('comments:banner', id); }
  if (route === 'comments:banner:off') { await saveState(id, { commentsBanner: false }); return renderAsync('comments:banner', id); }
  if (route === 'comments:banner:text') return renderAsync('comments:input:commentsBannerText', id);
  if (route === 'comments:banner:button') return renderAsync('comments:input:commentsBannerButton', id);
  if (route === 'comments:banner:link') return renderAsync('comments:input:commentsBannerLink', id);
  if (route === 'comments:banner:reset') { await saveState(id, { commentsBanner: true, commentsBannerText: '', commentsBannerButton: '', commentsBannerLink: '' }); return renderAsync('comments:banner', id); }
  if (route === 'comments:preview') return screen('👀 Предпросмотр', baseStatus(s, ch).concat([`Комментарии: ${status(s.commentsEnabled)}`, `Баннер: ${banner(s).enabled ? 'включен' : 'выключен'}`]), [['🖼 Баннер', 'comments:banner']], 'comments:preview');
  if (route === 'gifts:test') { const ready = clean(s.giftTitle) && clean(s.giftLink) && (s.selectedPostId || s.selectedCommentKey); return screen('🧪 Проверка подарка', ready ? ['Подарок готов к подключению.'] : ['Не хватает данных: выберите пост, добавьте название и ссылку/файл.'], [], 'gifts:home'); }
  if (route === 'buttons:preview') { const ready = clean(s.ctaButtonText) && clean(s.ctaButtonLink) && (s.selectedPostId || s.selectedCommentKey); return screen('👀 Проверка кнопки', ready ? [`Кнопка: ${s.ctaButtonText}`, 'Действие задано.'] : ['Не хватает данных: выберите пост, добавьте текст и действие.'], [], 'buttons:home'); }
  if (route === 'buttons:save') { const ready = clean(s.ctaButtonText) && clean(s.ctaButtonLink) && (s.selectedPostId || s.selectedCommentKey); if (!ready) return renderAsync('buttons:preview', id); await saveState(id, { buttonsEnabled: true, ctaSavedAt: Date.now() }); return screen('💾 Сохранено', ['Кнопка сохранена для выбранного поста.'], [], 'buttons:home'); }
  if (route === 'moderation:log') return screen('📖 Журнал', ['Здесь будут последние срабатывания модерации.', 'Если стоп-слово найдено, комментарий не публикуется.'], [], 'moderation:home');
  if (route === 'moderation:clear') { s = await saveState(id, { moderationStopwords: '' }); await syncModeration(id, s); return sectionHome('moderation', s, ch); }
  if (route === 'help:home') return screen('❓ Помощь', ['Переключатели работают сразу.', 'Для текста бот просит прислать следующее сообщение.'], [], `${sec}:home`);
  return sectionHome(sec, s, ch);
}

async function handleAwait(update, id) { const s = await getState(id); const mode = clean(s.mode); if (!mode.startsWith('await:')) return null; const value = textOf(update); if (!value || START.has(value.toLowerCase())) return null; const [, sec, key] = mode.split(':'); const patch = { mode: '' }; if (key === 'moderationStopwords') patch[key] = [...new Set([...linesOf(s[key]), ...linesOf(value)])].join('\n'); else patch[key] = value; const next = await saveState(id, patch); if (sec === 'moderation') await syncModeration(id, next); return screen('✅ Сохранено', [`Сохранила: ${LABELS[key] || 'значение'}.`], [[`↩️ ${sec === 'moderation' ? 'Модерация' : 'Раздел'}`, `${sec}:home`]], `${sec}:home`); }
async function handleForward(update, id) { const s = await getState(id); if (!['await_channel_forward', 'await_old_post_forward'].includes(clean(s.mode))) return null; let saved = null; try { saved = await db.upsertFromUpdate(update); } catch {} const chId = clean(saved?.channelId || s.activeChannelId || ''); const title = humanChannel(chId, saved?.channelTitle || s.activeChannelTitle || ''); const patch = { mode: '', activeChannelId: chId || s.activeChannelId, activeChannelTitle: title }; if (saved?.postId || saved?.commentKey) Object.assign(patch, { selectedPostId: clean(saved.postId), selectedCommentKey: clean(saved.commentKey), selectedPostTitle: isHuman(saved.title) ? cut(saved.title) : 'Пост выбран' }); await saveState(id, patch); await syncModeration(id); return screen(clean(s.mode) === 'await_channel_forward' ? '✅ Канал подключён' : '✅ Пост подключён', [`Канал: ${title}.`], [['📺 Каналы', 'channels:home'], ['💬 Комментарии', 'comments:home']], 'channels:home'); }
async function deliver(update, screenObj, route) { if (!config.botToken) return { handled: true, route, sentKind: 'skipped_no_bot_token' }; const key = menuKey(update), chat = chatId(update), user = adminId(update), prev = await getLastMenu(key); let sent; try { sent = await api.sendMessage({ botToken: config.botToken, chatId: chat || undefined, userId: chat ? undefined : user, text: screenObj.text, attachments: screenObj.attachments, notify: false }); } catch (e) { return { handled: true, route, sentKind: 'send_failed', error: e?.message || String(e) }; } const mid = responseMessageId(sent); if (mid) await setLastMenu(key, mid); [...new Set([prev, messageId(update)].filter(x => x && x !== mid))].forEach(x => api.deleteMessage({ botToken: config.botToken, messageId: x, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {})); return { handled: true, route, sentKind: 'send_new_delete_previous', messageId: mid }; }
async function tryHandle(update) { const route = routeOf(update), sec = owner(route), id = adminId(update) || chatId(update) || 'global'; const allowed = route === 'main:home' || MAIN.some(x => owner(x[1]) === sec) || sec === 'help'; let sc = await handleAwait(update, id) || await handleForward(update, id); if (!sc) { if (!allowed && !START.has(textOf(update).toLowerCase())) return { handled: false, route }; sc = await renderAsync(route, id, payloadOf(update)); } const cbid = callbackId(update); if (cbid && config.botToken) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {}); return deliver(update, sc, route); }
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return renderAsync(route, 'debug', {}); }
function selfTest() { return { ok: true, runtimeVersion: RUNTIME, readySections: ['channels', 'comments', 'gifts', 'buttons', 'moderation'], mainButtons: MAIN.length, dedupePostsByTitle: true, perPostCommentToggle: true, patcherUpdatesCommentButton: true, liveModerationSync: true, customStopwordsBlockComments: true, menuDelivery: 'send_new_then_delete_previous_and_current_callback_message', patcherTouched: true, commentsUiTouched: false, postgresUsed: true }; }
function install() { return selfTest(); }
module.exports = { RUNTIME, install, selfTest, render, renderAsync, tryHandle, tryHandleExpress };
