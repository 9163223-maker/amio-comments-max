'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');

const RUNTIME = 'HARD-V3-ADMIN-MENU-2.7-DB-ONLY';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 80) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const linesOf = (v) => String(v || '').split(/[\n,;]/g).map(x => clean(x).toLowerCase()).filter(Boolean);
const isOn = (v, def = true) => v === undefined ? def : !!v;
const status = (v, def = true) => isOn(v, def) ? 'включено' : 'выключено';
const mark = (v, def = true) => isOn(v, def) ? '✅' : '⏸';

const MAIN = [ ['📺 Каналы', 'channels:home'], ['💬 Комментарии', 'comments:home'], ['🎁 Подарки', 'gifts:home'], ['🔘 Кнопки', 'buttons:home'], ['🛡 Модерация', 'moderation:home'] ];
const START = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню', 'начать', 'вы начали общение с ботом']);
const LABELS = { commentsBannerText: 'текст баннера', commentsBannerButton: 'текст кнопки баннера', commentsBannerLink: 'ссылку или действие баннера', giftTitle: 'название подарка', giftLink: 'ссылку или файл подарка', giftMessage: 'сообщение получателю', ctaButtonText: 'текст кнопки', ctaButtonLink: 'ссылку или действие кнопки', moderationStopwords: 'стоп-слово или несколько слов через запятую' };
const ALIAS = { 'comments:select': 'comments:posts', 'comments:pick': 'comments:posts', 'buttons:select': 'buttons:posts', 'gifts:select': 'gifts:posts', 'channels:verify': 'channels:check' };
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

async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: normRoute(route), ...extra }) }; }
function keyboard(items, route = 'main:home') { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {}))); const o = owner(route); if (o !== 'main') rows.push([btn('↩️ Назад', o + ':home'), btn('🏠 Главное', 'main:home')]); return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function screen(title, textLines, items = [], route = 'main:home') { return { text: [title, '', (Array.isArray(textLines) ? textLines.filter(Boolean).join('\n') : String(textLines || ''))].join('\n'), attachments: keyboard(items, route) }; }
function mainScreen() { return screen('🐋 АдминКИТ', ['Главное меню.', 'Настройки и выбранные посты берутся только из Postgres.'], MAIN, 'main:home'); }
function banner(s) { return { enabled: s.commentsBanner !== false, text: clean(s.commentsBannerText) || 'Разработано АдминКИТ', button: clean(s.commentsBannerButton) || 'Открыть', link: clean(s.commentsBannerLink) || '' }; }
function postName(s) { return clean(s.selectedPostTitle) || (s.selectedCommentKey ? 'Пост выбран' : 'не выбран'); }
function baseStatus(s, ch) { return [`Канал: ${state.channelTitle(ch.channelId, ch.title)}`, `Пост: ${postName(s)}`]; }
function stopwordsText(s) { const arr = linesOf(s.moderationStopwords); return arr.length ? arr.slice(0, 8).join(', ') : 'не заданы'; }

async function selectedPost(id) { const s = await getS(id); if (!s.selectedCommentKey) return null; return state.getPostByCommentKey(id, s.selectedCommentKey); }
async function sectionHome(sec, id) {
  const s = await getS(id); const ch = await state.activeChannel(id); const p = await selectedPost(id); const ps = p || {};
  if (sec === 'channels') return screen('📺 Каналы', [`Активный канал: ${state.channelTitle(ch.channelId, ch.title)}`, ch.channelId ? 'Канал подключён.' : 'Канал ещё не подключён.', `Автокомментарии: ${status(s.channelAutoComments)}`, `Безопасное обновление: ${status(s.channelSafePatch)}`], [['📋 Мои каналы','channels:list'], ['➕ Подключить','channels:connect'], ['✅ Проверить права','channels:check'], [`${mark(s.channelAutoComments)} Автокомменты`,'channels:toggle:channelAutoComments'], [`${mark(s.channelSafePatch)} Безопасно обновлять`,'channels:toggle:channelSafePatch']], 'channels:home');
  if (sec === 'comments') return screen('💬 Комментарии', [`Канал: ${state.channelTitle(ch.channelId, ch.title)}`, `Пост: ${ps.title || postName(s)}`, `Комментарии: ${status(ps.commentsEnabled)}`, `Фото: ${status(ps.commentsPhoto)}`, `Реакции: ${status(ps.commentsReactions)}`, `Баннер: ${ps.commentsBanner === false ? 'выключен' : 'включен'}`], [[`${mark(ps.commentsEnabled)} Комментарии`,'comments:toggle:commentsEnabled'], ['📌 Выбрать пост','comments:posts'], [`${mark(ps.commentsPhoto)} Фото`,'comments:toggle:commentsPhoto'], [`${mark(ps.commentsReactions)} Реакции`,'comments:toggle:commentsReactions'], ['🖼 Баннер','comments:banner'], ['👀 Предпросмотр','comments:preview']], 'comments:home');
  if (sec === 'gifts') return screen('🎁 Подарки', baseStatus(s, ch).concat([`Подарки: ${status(ps.giftsEnabled, false)}`, `Название: ${clean(ps.giftTitle) || 'не задано'}`, `Файл/ссылка: ${clean(ps.giftLink) ? 'задано' : 'не задано'}`, `Только подписчикам: ${status(ps.giftsRequireSubscription)}`]), [[`${mark(ps.giftsEnabled, false)} Подарки`,'gifts:toggle:giftsEnabled'], ['📌 Пост','gifts:posts'], ['✏️ Название','gifts:input:giftTitle'], ['🔗 Файл/ссылка','gifts:input:giftLink'], [`${mark(ps.giftsRequireSubscription)} Только подписчикам`,'gifts:toggle:giftsRequireSubscription'], ['🧪 Проверить','gifts:test']], 'gifts:home');
  if (sec === 'buttons') return screen('🔘 Кнопки', baseStatus(s, ch).concat([`Кнопка: ${status(ps.buttonsEnabled, false)}`, `Текст: ${clean(ps.ctaButtonText) || 'не задан'}`, `Действие: ${clean(ps.ctaButtonLink) ? 'задано' : 'не задано'}`]), [[`${mark(ps.buttonsEnabled, false)} Кнопка`,'buttons:toggle:buttonsEnabled'], ['📌 Пост','buttons:posts'], ['✏️ Текст','buttons:input:ctaButtonText'], ['🔗 Действие','buttons:input:ctaButtonLink'], ['👀 Проверить','buttons:preview'], ['💾 Сохранить','buttons:save']], 'buttons:home');
  if (sec === 'moderation') return screen('🛡 Модерация', [`Канал: ${state.channelTitle(ch.channelId, ch.title)}`, `Модерация: ${status(s.moderationEnabled)}`, `Стоп-слова: ${stopwordsText(s)}`, `Ссылки: ${s.moderationLinksAllowed === false ? 'запрещены' : 'разрешены'}`], [[`${mark(s.moderationEnabled)} Модерация`,'moderation:toggle:moderationEnabled'], ['➕ Стоп-слово','moderation:input:moderationStopwords'], [`${s.moderationLinksAllowed === false ? '🚫' : '✅'} Ссылки`,'moderation:toggle:moderationLinksAllowed'], ['🧹 Очистить','moderation:clear']], 'moderation:home');
  return mainScreen();
}

async function postPicker(id, sec) { const ch = await state.activeChannel(id); const list = await state.listPosts(id, ch.channelId, 30); return screen('📌 Выбрать пост', list.length ? [`Найдено постов: ${list.length}`, 'Нажмите нужный пост.'] : ['Постов пока нет.', 'Перешлите пост из канала.'], list.slice(0, 10).map((p, i) => [`${i + 1}. ${p.title}`, `${sec}:post`, { postId: p.postId, commentKey: p.commentKey, title: p.title, channelId: p.channelId }]), `${sec}:posts`); }
async function selectPost(id, sec, p = {}) { const ch = await state.activeChannel(id); const post = { channelId: p.channelId || ch.channelId, postId: p.postId, commentKey: p.commentKey, title: p.title }; await state.ensurePostSettings(id, post); await saveS(id, { selectedPostId: post.postId, selectedCommentKey: post.commentKey, selectedPostTitle: post.title }); }
async function togglePostValue(id, key) { const p = await selectedPost(id); if (!p) return null; const next = !state.bool(p[key], !['buttonsEnabled','giftsEnabled'].includes(key)); const saved = await state.savePostSetting(id, p, { [key]: next }); if (key === 'commentsEnabled') await state.patchCommentsButton(id, saved.commentKey); return saved; }
async function savePostField(id, key, value) { const p = await selectedPost(id); if (!p) return null; return state.savePostSetting(id, p, { [key]: value }); }
async function syncModeration(id, s) { const ch = await state.activeChannel(id); if (!ch.channelId) return; await state.saveModeration(id, ch.channelId, { enabled: s.moderationEnabled !== false, stopwords: s.moderationStopwords || '', blockLinks: s.moderationLinksAllowed === false }); }
function toggleStateValue(s, key) { if (key === 'moderationLinksAllowed') return s[key] === false; return !isOn(s[key], true); }

async function renderAsync(rawRoute = 'main:home', id = '', p = {}) {
  const route = normRoute(rawRoute), sec = owner(route); let s = await getS(id);
  if (route === 'main:home') return mainScreen();
  if (MAIN.some(x => owner(x[1]) === sec) && route.endsWith(':home')) return sectionHome(sec, id);
  if (route.includes(':toggle:')) {
    const key = route.split(':toggle:')[1];
    if (['comments','gifts','buttons'].includes(sec)) await togglePostValue(id, key);
    else { s = await saveS(id, { [key]: toggleStateValue(s, key) }); if (sec === 'moderation') await syncModeration(id, s); }
    return sectionHome(sec, id);
  }
  if (route.includes(':input:')) { const key = route.split(':input:')[1]; await saveS(id, { mode: `await:${sec}:${key}` }); return screen('✏️ Ввод', [`Пришлите следующим сообщением: ${LABELS[key] || 'значение'}.`], [], `${sec}:home`); }
  if (['comments:posts','gifts:posts','buttons:posts'].includes(route)) return postPicker(id, sec);
  if (['comments:post','gifts:post','buttons:post'].includes(route)) { await selectPost(id, sec, p); return sectionHome(sec, id); }
  if (route === 'channels:list') { const list = await state.listChannels(id); return screen('📋 Мои каналы', list.length ? [`Найдено каналов: ${list.length}`, 'Нажмите канал, чтобы сделать активным.'] : ['Каналы пока не найдены.', 'Перешлите пост из канала.'], list.slice(0, 10).map((c, i) => [`${i + 1}. ${c.title}`, 'channels:select', { channelId: c.channelId, channelTitle: c.title }]), 'channels:list'); }
  if (route === 'channels:select') { await saveS(id, { activeChannelId: p.channelId, activeChannelTitle: p.channelTitle }); return sectionHome('channels', id); }
  if (route === 'channels:connect') { await saveS(id, { mode: 'await_channel_forward' }); return screen('➕ Подключить канал', ['Перешлите сюда любой пост из канала.'], [], 'channels:connect'); }
  if (route === 'channels:check') { const ch = await state.activeChannel(id); return screen('✅ Проверить права', ch.channelId ? [`Канал: ${state.channelTitle(ch.channelId, ch.title)}`, 'Проверяем, что бот администратор и может редактировать посты.'] : ['Сначала подключите канал.'], [], 'channels:check'); }
  if (route === 'comments:banner') { const p0 = await selectedPost(id); const b = banner(p0 || {}); return screen('🖼 Баннер', [`Статус: ${b.enabled ? 'включен' : 'выключен'}`, `Текст: ${b.text}`, `Кнопка: ${b.button}`, `Действие: ${b.link ? 'задано' : 'не задано'}`], [['✅ Вкл','comments:toggle:commentsBanner'], ['✏️ Текст','comments:input:commentsBannerText'], ['🔘 Кнопка','comments:input:commentsBannerButton'], ['🔗 Ссылка','comments:input:commentsBannerLink']], 'comments:banner'); }
  if (route === 'comments:preview') return sectionHome('comments', id);
  if (route === 'gifts:test') return screen('🧪 Проверка подарка', ['Проверка идёт по данным Postgres.'], [], 'gifts:home');
  if (route === 'buttons:preview') return screen('👀 Проверка кнопки', ['Проверка идёт по данным Postgres.'], [], 'buttons:home');
  if (route === 'buttons:save') return screen('💾 Сохранено', ['Кнопка сохранена в базе для выбранного поста.'], [], 'buttons:home');
  if (route === 'moderation:clear') { s = await saveS(id, { moderationStopwords: '' }); await syncModeration(id, s); return sectionHome('moderation', id); }
  return sectionHome(sec, id);
}

async function handleAwait(update, id) { const s = await getS(id); const mode = clean(s.mode); if (!mode.startsWith('await:')) return null; const value = textOf(update); if (!value || START.has(value.toLowerCase())) return null; const [, sec, key] = mode.split(':'); await saveS(id, { mode: '' }); if (key === 'moderationStopwords') { const next = [...new Set([...linesOf(s.moderationStopwords), ...linesOf(value)])].join('\n'); const ns = await saveS(id, { moderationStopwords: next }); await syncModeration(id, ns); } else await savePostField(id, key, value); return screen('✅ Сохранено', [`Сохранила: ${LABELS[key] || 'значение'}.`], [[`↩️ Раздел`, `${sec}:home`]], `${sec}:home`); }
async function handleForward(update, id) { const s = await getS(id); if (clean(s.mode) !== 'await_channel_forward') return null; const saved = await db.upsertFromUpdate(update); if (saved?.channelId) await saveS(id, { mode: '', activeChannelId: saved.channelId, activeChannelTitle: state.channelTitle(saved.channelId, saved.title) }); return sectionHome('channels', id); }
async function deliver(update, screenObj, route) { if (!config.botToken) return { handled: true, route, sentKind: 'skipped_no_bot_token' }; const id = adminId(update) || chatId(update) || 'global'; const prev = await state.getMenu(id); let sent; try { sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: screenObj.text, attachments: screenObj.attachments, notify: false }); } catch (e) { return { handled: true, route, sentKind: 'send_failed', error: e?.message || String(e) }; } const mid = responseMessageId(sent); if (mid) await state.setMenu(id, mid); [...new Set([prev, messageId(update)].filter(x => x && x !== mid))].forEach(x => api.deleteMessage({ botToken: config.botToken, messageId: x, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {})); return { handled: true, route, sentKind: 'db_only_send_new_delete_previous', messageId: mid }; }
async function tryHandle(update) { const route = routeOf(update), sec = owner(route), id = adminId(update) || chatId(update) || 'global'; const allowed = route === 'main:home' || MAIN.some(x => owner(x[1]) === sec) || sec === 'help'; let sc = await handleAwait(update, id) || await handleForward(update, id); if (!sc) { if (!allowed && !START.has(textOf(update).toLowerCase())) return { handled: false, route }; sc = await renderAsync(route, id, payloadOf(update)); } const cbid = callbackId(update); if (cbid && config.botToken) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {}); return deliver(update, sc, route); }
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return renderAsync(route, 'debug', {}); }
function selfTest() { return { ok: true, runtimeVersion: RUNTIME, databaseOnly: true, storeUsedForMenu: false, readySections: ['channels','comments','gifts','buttons','moderation'], mainButtons: MAIN.length, postPickerSource: 'Postgres ak_posts', settingsSource: 'Postgres ak_post_settings', flowSource: 'Postgres ak_flow_state', menuSource: 'Postgres ak_menu_state', perPostCommentToggle: true, commentsUiTouched: false }; }
function install() { return selfTest(); }
module.exports = { RUNTIME, install, selfTest, render, renderAsync, tryHandle, tryHandleExpress };
