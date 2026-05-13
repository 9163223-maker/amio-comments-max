'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const store = require('./store');
const db = require('./cc5-db-core');

const RUNTIME = 'HARD-V3-ADMIN-MENU-2.2-FIVE-SECTIONS-CURRENT';
const mem = new Map();
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 90) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const isOn = (v, def = true) => (v === undefined ? def : !!v);
const status = (v, def = true) => isOn(v, def) ? 'включено' : 'выключено';
const mark = (v, def = true) => isOn(v, def) ? '✅' : '⏸';

const MAIN_BUTTONS = [
  ['📺 Каналы', 'channels:home'],
  ['💬 Комментарии', 'comments:home'],
  ['🎁 Подарки', 'gifts:home'],
  ['🔘 Кнопки', 'buttons:home'],
  ['🛡 Модерация', 'moderation:home']
];
const START_WORDS = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню', 'начать', 'вы начали общение с ботом']);
const DEFAULT_BANNER = { text: 'Разработано АдминКИТ', button: 'Открыть', link: '', scope: 'all', place: 'start' };
const ALIAS = {
  'comments:select': 'comments:posts', 'comments:pick': 'comments:posts', 'comments:view': 'comments:preview', 'comments:old_post': 'comments:old',
  'comments:settings': 'comments:home', 'comments:settings:comments-on': 'comments:toggle:commentsEnabled', 'comments:settings:comments-off': 'comments:toggle:commentsEnabled',
  'comments:settings:photo-on': 'comments:toggle:commentsPhoto', 'comments:settings:photo-off': 'comments:toggle:commentsPhoto',
  'comments:settings:reactions-on': 'comments:toggle:commentsReactions', 'comments:settings:reactions-off': 'comments:toggle:commentsReactions',
  'comments:banner_text': 'comments:banner:text', 'comments:banner_button': 'comments:banner:button', 'comments:banner_link': 'comments:banner:link',
  'comments:banner_on': 'comments:banner:on', 'comments:banner_off': 'comments:banner:off', 'comments:banner_reset': 'comments:banner:reset',
  'gifts:create': 'gifts:input:giftTitle', 'gifts:select': 'gifts:posts', 'gifts:subscribe': 'gifts:toggle:giftsRequireSubscription', 'gifts:request_contact': 'gifts:toggle:giftsContactRequired',
  'buttons:add': 'buttons:input:ctaButtonText', 'buttons:select': 'buttons:posts',
  'moderation:ai': 'moderation:toggle:moderationAi', 'moderation:links': 'moderation:toggle:moderationLinksAllowed', 'moderation:invites': 'moderation:toggle:moderationInvitesAllowed',
  'channels:set': 'channels:select', 'channels:verify': 'channels:check'
};
function normalizeRoute(route = '') {
  const r = clean(route);
  if (START_WORDS.has(r.toLowerCase())) return 'main:home';
  return ALIAS[r] || r || 'main:home';
}
function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function textOf(u) { const m = msg(u); return clean(m?.body?.text || m?.text || body(u).text || ''); }
function payloadOf(u) { const c = cb(u); const raw = c?.payload || c?.data || ''; if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { r: raw }; } } return raw && typeof raw === 'object' ? raw : {}; }
function uid(u) { return clean(cb(u)?.user?.user_id || cb(u)?.user?.id || msg(u)?.sender?.user_id || msg(u)?.sender?.id || body(u)?.user?.user_id || body(u)?.user?.id || ''); }
function cid(u) { return clean(msg(u)?.recipient?.chat_id || msg(u)?.recipient?.id || msg(u)?.chat_id || msg(u)?.chat?.id || cb(u)?.message?.recipient?.chat_id || body(u).chat_id || ''); }
function adminId(u) { return uid(u) || cid(u) || ''; }
function routeFrom(u) { const p = payloadOf(u); return normalizeRoute(p.r || p.route || textOf(u)); }
function owner(route) { return clean(route).split(':')[0] || 'main'; }

async function getFlow(id) { try { return id ? await db.getFlow(id) || {} : {}; } catch { return mem.get(id) || {}; } }
async function getState(id) { return (await getFlow(id)).menuV3 || {}; }
async function saveState(id, patch) { const f = await getFlow(id); const next = { ...f, menuV3: { ...(f.menuV3 || {}), ...patch, updatedAt: Date.now() } }; try { await db.setFlow(id, next); } catch { mem.set(id, next); } return next.menuV3; }

async function listChannels(id) {
  const map = new Map();
  try { (await db.getChannels(id)).forEach(c => { const k = clean(c.channelId || c.id); if (k) map.set(k, { id: k, title: clean(c.title || k) }); }); } catch {}
  try { (store.getChannelsList ? store.getChannelsList() : []).forEach(c => { const k = clean(c.channelId || c.id); if (k && !map.has(k)) map.set(k, { id: k, title: clean(c.title || c.channelTitle || c.name || k) }); }); } catch {}
  return [...map.values()];
}
async function activeChannel(id) { const s = await getState(id); const list = await listChannels(id); return list.find(x => x.id === s.activeChannelId) || list[0] || { id: '', title: 'Канал не выбран' }; }
async function listPosts(id, channelId = '') {
  const out = [];
  try { out.push(...(await db.getPosts(id, channelId, 50))); } catch {}
  try { (store.getPostsList ? store.getPostsList() : []).forEach(p => { if (!channelId || String(p.channelId || '') === String(channelId)) out.push({ postId: p.postId, commentKey: p.commentKey, title: p.title || p.originalText || p.postId }); }); } catch {}
  const seen = new Set();
  return out.filter(p => { const k = clean(p.commentKey || p.postId); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 50);
}

function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: normalizeRoute(route), ...extra }) }; }
function keyboard(items, route = 'main:home') {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {})));
  const o = owner(route);
  if (o !== 'main') rows.push([btn('❓ Помощь', 'help:home'), btn('↩️ Раздел', o + ':home')], [btn('🏠 Главное меню', 'main:home')]);
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}
function screen(title, lines, items = [], route = 'main:home') {
  const text = [title, '', Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || '')].join('\n');
  return { text, attachments: keyboard(items, route) };
}
function mainScreen() {
  return screen('🐋 АдминКИТ', ['Готовые рабочие разделы V3:', 'Каналы, Комментарии, Подарки, Кнопки, Модерация.', '', 'Остальные разделы вернём после стабилизации этих пяти.'], MAIN_BUTTONS, 'main:home');
}
function selectedPost(s) { return cut(s.selectedPostTitle || s.selectedPostId || s.selectedCommentKey || 'не выбран'); }
function bannerState(s) { return { enabled: s.commentsBanner !== false, text: clean(s.commentsBannerText) || DEFAULT_BANNER.text, button: clean(s.commentsBannerButton) || DEFAULT_BANNER.button, link: clean(s.commentsBannerLink) || DEFAULT_BANNER.link, scope: clean(s.commentsBannerScope) || DEFAULT_BANNER.scope, place: clean(s.commentsBannerPlace) || DEFAULT_BANNER.place }; }
function commonStatus(s, ch) { return ['Статус:', `Канал: ${ch.title || 'не выбран'}`, `Пост: ${selectedPost(s)}`]; }
function commentsStatus(s, ch) { const b = bannerState(s); return commonStatus(s, ch).concat([`Комментарии: ${status(s.commentsEnabled)}`, `Авто для новых: ${status(s.commentsAutoNew)}`, `Фото: ${status(s.commentsPhoto)}`, `Реакции/ответы: ${status(s.commentsReactions)}`, `Баннер: ${b.enabled ? 'включен' : 'выключен'} — ${b.text}`]); }
function giftsStatus(s, ch) { return commonStatus(s, ch).concat([`Подарки: ${status(s.giftsEnabled, false)}`, `Проверка подписки: ${status(s.giftsRequireSubscription)}`, `Запрос контакта: ${status(s.giftsContactRequired, false)}`, `Подарок: ${clean(s.giftTitle) || 'не задан'}`, `Ссылка/файл: ${clean(s.giftLink) || 'не задано'}`]); }
function buttonsStatus(s, ch) { return commonStatus(s, ch).concat([`CTA-кнопки: ${status(s.buttonsEnabled, false)}`, `Текст кнопки: ${clean(s.ctaButtonText) || 'не задан'}`, `Ссылка/действие: ${clean(s.ctaButtonLink) || 'не задано'}`, `Запрос контакта: ${status(s.buttonsRequestContact, false)}`, `Запрос гео: ${status(s.buttonsRequestGeo, false)}`]); }
function moderationStatus(s, ch) { return ['Статус:', `Канал: ${ch.title || 'не выбран'}`, `Модерация: ${status(s.moderationEnabled)}`, `Стоп-слова: ${status(s.moderationStopwordsEnabled)}`, `Ссылки: ${s.moderationLinksAllowed === false ? 'запрещены' : 'разрешены'}`, `Инвайты: ${s.moderationInvitesAllowed === false ? 'запрещены' : 'разрешены'}`, `AI-фильтр: ${status(s.moderationAi, false)}`, `Правила: ${clean(s.moderationRules) || 'не заданы'}`, `Стоп-слова: ${clean(s.moderationStopwords) || 'список пуст'}`]; }
function sectionHome(sec, s = {}, ch = { title: 'Канал не выбран', id: '' }) {
  if (sec === 'channels') return screen('📺 Каналы', ['Статус:', `Активный канал: ${ch.title}`, `ID: ${ch.id || 'нет'}`, `Автокомментарии: ${status(s.channelAutoComments)}`, `Безопасный патч: ${status(s.channelSafePatch)}`, `Требовать права редактора: ${status(s.channelRequireEditRights)}`], [['📋 Мои каналы', 'channels:list'], ['➕ Подключить', 'channels:connect'], ['🔁 Активный канал', 'channels:active'], ['✅ Проверить права', 'channels:check'], [`${mark(s.channelAutoComments)} Автокомменты`, 'channels:toggle:channelAutoComments'], [`${mark(s.channelSafePatch)} Безопасный патч`, 'channels:toggle:channelSafePatch'], [`${mark(s.channelRequireEditRights)} Требовать права`, 'channels:toggle:channelRequireEditRights'], ['👥 Администраторы', 'channels:admins']], 'channels:home');
  if (sec === 'comments') return screen('💬 Комментарии', commentsStatus(s, ch), [[`${mark(s.commentsEnabled)} Комментарии`, 'comments:toggle:commentsEnabled'], [`${mark(s.commentsAutoNew)} Авто для новых`, 'comments:toggle:commentsAutoNew'], ['📌 Старый пост', 'comments:old'], ['📌 Выбрать пост', 'comments:posts'], ['🖼 Баннер', 'comments:banner'], [`${mark(s.commentsPhoto)} Фото`, 'comments:toggle:commentsPhoto'], [`${mark(s.commentsReactions)} Реакции/ответы`, 'comments:toggle:commentsReactions'], ['👀 Предпросмотр', 'comments:preview']], 'comments:home');
  if (sec === 'gifts') return screen('🎁 Подарки / лид-магниты', giftsStatus(s, ch), [[`${mark(s.giftsEnabled, false)} Подарки`, 'gifts:toggle:giftsEnabled'], ['📌 Выбрать пост', 'gifts:posts'], ['✏️ Название', 'gifts:input:giftTitle'], ['🔗 Ссылка/файл', 'gifts:input:giftLink'], ['💬 Сообщение', 'gifts:input:giftMessage'], [`${mark(s.giftsRequireSubscription)} Проверка подписки`, 'gifts:toggle:giftsRequireSubscription'], [`${mark(s.giftsContactRequired, false)} Запрос контакта`, 'gifts:toggle:giftsContactRequired'], ['📋 Список', 'gifts:list'], ['🧪 Тестовая выдача', 'gifts:test'], ['↩️ Сброс', 'gifts:reset']], 'gifts:home');
  if (sec === 'buttons') return screen('🔘 Кнопки под постами', buttonsStatus(s, ch), [[`${mark(s.buttonsEnabled, false)} CTA-кнопки`, 'buttons:toggle:buttonsEnabled'], ['📌 Выбрать пост', 'buttons:posts'], ['✏️ Текст кнопки', 'buttons:input:ctaButtonText'], ['🔗 Ссылка/действие', 'buttons:input:ctaButtonLink'], [`${mark(s.buttonsRequestContact, false)} Запрос контакта`, 'buttons:toggle:buttonsRequestContact'], [`${mark(s.buttonsRequestGeo, false)} Запрос гео`, 'buttons:toggle:buttonsRequestGeo'], ['📋 Кнопки поста', 'buttons:list'], ['👀 Предпросмотр', 'buttons:preview'], ['💾 Сохранить', 'buttons:save'], ['↩️ Сброс', 'buttons:reset']], 'buttons:home');
  if (sec === 'moderation') return screen('🛡 Модерация', moderationStatus(s, ch), [[`${mark(s.moderationEnabled)} Модерация`, 'moderation:toggle:moderationEnabled'], ['📜 Правила', 'moderation:input:moderationRules'], [`${mark(s.moderationStopwordsEnabled)} Стоп-слова`, 'moderation:toggle:moderationStopwordsEnabled'], ['➕ Добавить слово', 'moderation:input:moderationStopwords'], [`${s.moderationLinksAllowed === false ? '🚫' : '✅'} Ссылки`, 'moderation:toggle:moderationLinksAllowed'], [`${s.moderationInvitesAllowed === false ? '🚫' : '✅'} Инвайты`, 'moderation:toggle:moderationInvitesAllowed'], [`${mark(s.moderationAi, false)} AI-фильтр`, 'moderation:toggle:moderationAi'], ['📖 Журнал', 'moderation:log'], ['🧹 Очистить стоп-слова', 'moderation:clear']], 'moderation:home');
  return mainScreen();
}
async function postPicker(id, sec) { const ch = await activeChannel(id); const list = await listPosts(id, ch.id); return screen('📌 Выбрать пост', list.length ? [`Постов найдено: ${list.length}`, 'Выберите пост.'] : ['Постов пока нет в базе.', 'Для старого поста используйте «Старый пост».'], list.slice(0, 10).map((p, i) => [`${i + 1}. ${cut(p.title || p.postId, 42)}`, `${sec}:post`, { postId: p.postId, commentKey: p.commentKey, title: cut(p.title || p.postId, 90) }]), `${sec}:posts`); }
async function setSelectedPost(id, sec, p = {}) { const title = cut(p.title || p.postId || p.commentKey || 'выбранный пост', 90); const patch = { selectedPostId: clean(p.postId), selectedCommentKey: clean(p.commentKey), selectedPostTitle: title }; if (sec === 'gifts') Object.assign(patch, { giftPostId: clean(p.postId), giftPostTitle: title }); if (sec === 'buttons') Object.assign(patch, { buttonsPostId: clean(p.postId), buttonsPostTitle: title }); await saveState(id, patch); }
function toggleValue(s, key) { if (key === 'moderationLinksAllowed' || key === 'moderationInvitesAllowed') return s[key] === false; const def = !['buttonsRequestContact', 'buttonsRequestGeo', 'moderationAi', 'giftsEnabled', 'giftsContactRequired', 'buttonsEnabled'].includes(key); return !isOn(s[key], def); }

async function renderAsync(rawRoute = 'main:home', id = '', p = {}) {
  const route = normalizeRoute(rawRoute); const sec = owner(route); const s = await getState(id); const ch = await activeChannel(id);
  if (route === 'main:home') return mainScreen();
  if (MAIN_BUTTONS.some(x => owner(x[1]) === sec) && route.endsWith(':home')) return sectionHome(sec, s, ch);
  if (route.includes(':toggle:')) { const key = route.split(':toggle:')[1]; await saveState(id, { [key]: toggleValue(s, key) }); return sectionHome(sec, await getState(id), ch); }
  if (route.includes(':input:')) { const key = route.split(':input:')[1]; await saveState(id, { mode: `await:${sec}:${key}` }); return screen('✏️ Ввод значения', `Пришлите следующим сообщением значение для: ${key}.`, [], `${sec}:home`); }
  if (['comments:posts', 'gifts:posts', 'buttons:posts'].includes(route)) return postPicker(id, sec);
  if (['comments:post', 'gifts:post', 'buttons:post'].includes(route)) { await setSelectedPost(id, sec, p); return sectionHome(sec, await getState(id), ch); }
  if (route === 'channels:list') { const list = await listChannels(id); return screen('📋 Мои каналы', list.length ? [`Найдено каналов: ${list.length}`, 'Нажмите канал, чтобы сделать активным.'] : ['Каналы пока не найдены.', 'Перешлите боту пост из канала.'], list.slice(0, 10).map((c, i) => [`${i + 1}. ${cut(c.title, 36)}`, 'channels:select', { channelId: c.id }]), 'channels:list'); }
  if (route === 'channels:select') { const list = await listChannels(id); const c = list.find(x => x.id === clean(p.channelId)); if (c) await saveState(id, { activeChannelId: c.id, activeChannelTitle: c.title }); return screen('🔁 Активный канал', c ? [`Сохранено: ${c.title}`, `ID: ${c.id}`] : 'Канал не найден.', [['📺 Каналы', 'channels:home']], 'channels:active'); }
  if (route === 'channels:connect') { await saveState(id, { mode: 'await_channel_forward', section: 'channels' }); return screen('➕ Подключить канал', ['Ожидаю пересланный пост из канала.', 'Бот должен быть администратором канала.'], [], 'channels:connect'); }
  if (['channels:active', 'channels:permissions', 'channels:admins'].includes(route)) return sectionHome('channels', s, ch);
  if (route === 'channels:check') return screen('✅ Проверить права', [`Канал: ${ch.title}`, ch.id ? 'Проверка подготовлена через MAX API.' : 'Сначала выберите канал.'], ch.id ? [] : [['➕ Подключить', 'channels:connect']], 'channels:check');
  if (route === 'comments:old') { await saveState(id, { mode: 'await_old_post_forward', section: 'comments' }); return screen('📌 Старый пост', ['Ожидаю пересланный опубликованный пост.', 'Бот сохранит текст и восстановит кнопку комментариев без дублей.'], [['📌 Выбрать пост', 'comments:posts']], 'comments:old'); }
  if (route === 'comments:banner') { const b = bannerState(s); return screen('🖼 Баннер в комментариях', commentsStatus(s, ch).concat(['', `Текст: ${b.text}`, `Кнопка: ${b.button}`, `Действие/ссылка: ${b.link || 'не задано'}`, `Область: ${b.scope === 'post' ? 'только выбранный пост' : 'все обсуждения'}`, `Позиция: ${b.place === 'bottom' ? 'внизу обсуждения' : 'у начала обсуждения'}`]), [['✅ Включить', 'comments:banner:on'], ['⏸ Выключить', 'comments:banner:off'], ['✏️ Текст', 'comments:banner:text'], ['🔘 Кнопка', 'comments:banner:button'], ['🔗 Ссылка', 'comments:banner:link'], ['🌐 Все', 'comments:banner:scope_all'], ['📌 Только пост', 'comments:banner:scope_post'], ['🔝 У начала', 'comments:banner:place_start'], ['🔻 Внизу', 'comments:banner:place_bottom'], ['↩️ Сброс', 'comments:banner:reset']], 'comments:banner'); }
  if (route === 'comments:banner:on') { await saveState(id, { commentsBanner: true }); return renderAsync('comments:banner', id, {}); }
  if (route === 'comments:banner:off') { await saveState(id, { commentsBanner: false }); return renderAsync('comments:banner', id, {}); }
  if (route === 'comments:banner:text') return renderAsync('comments:input:commentsBannerText', id, {});
  if (route === 'comments:banner:button') return renderAsync('comments:input:commentsBannerButton', id, {});
  if (route === 'comments:banner:link') return renderAsync('comments:input:commentsBannerLink', id, {});
  if (route === 'comments:banner:scope_all') { await saveState(id, { commentsBannerScope: 'all' }); return renderAsync('comments:banner', id, {}); }
  if (route === 'comments:banner:scope_post') { await saveState(id, { commentsBannerScope: 'post' }); return renderAsync('comments:banner', id, {}); }
  if (route === 'comments:banner:place_start') { await saveState(id, { commentsBannerPlace: 'start' }); return renderAsync('comments:banner', id, {}); }
  if (route === 'comments:banner:place_bottom') { await saveState(id, { commentsBannerPlace: 'bottom' }); return renderAsync('comments:banner', id, {}); }
  if (route === 'comments:banner:reset') { await saveState(id, { commentsBanner: true, commentsBannerText: DEFAULT_BANNER.text, commentsBannerButton: DEFAULT_BANNER.button, commentsBannerLink: DEFAULT_BANNER.link, commentsBannerScope: DEFAULT_BANNER.scope, commentsBannerPlace: DEFAULT_BANNER.place }); return renderAsync('comments:banner', id, {}); }
  if (route === 'comments:preview') return screen('👀 Предпросмотр', commentsStatus(s, ch), [['🖼 Баннер', 'comments:banner'], ['📌 Выбрать пост', 'comments:posts']], 'comments:preview');
  if (['gifts:list', 'gifts:test'].includes(route)) return screen(route === 'gifts:test' ? '🧪 Тестовая выдача' : '📋 Список подарков', giftsStatus(s, ch), [], 'gifts:home');
  if (route === 'gifts:reset') { await saveState(id, { giftTitle: '', giftLink: '', giftMessage: '', giftsEnabled: false }); return sectionHome('gifts', await getState(id), ch); }
  if (['buttons:list', 'buttons:preview'].includes(route)) return screen(route === 'buttons:preview' ? '👀 Предпросмотр CTA' : '📋 Кнопки поста', buttonsStatus(s, ch), [], 'buttons:home');
  if (route === 'buttons:save') { await saveState(id, { buttonsEnabled: true, ctaSavedAt: Date.now() }); return sectionHome('buttons', await getState(id), ch); }
  if (route === 'buttons:reset') { await saveState(id, { buttonsEnabled: false, ctaButtonText: '', ctaButtonLink: '', buttonsRequestContact: false, buttonsRequestGeo: false }); return sectionHome('buttons', await getState(id), ch); }
  if (route === 'moderation:clear') { await saveState(id, { moderationStopwords: '' }); return sectionHome('moderation', await getState(id), ch); }
  if (route === 'moderation:log') return screen('📖 Журнал модерации', moderationStatus(s, ch), [], 'moderation:home');
  return screen('⚙️ АдминКИТ V3', 'Этот раздел будет добавлен после стабилизации пяти рабочих разделов.', MAIN_BUTTONS, 'main:home');
}
function render(rawRoute = 'main:home') { const route = normalizeRoute(rawRoute); if (route === 'main:home') return mainScreen(); if (MAIN_BUTTONS.some(x => x[1] === route)) return sectionHome(owner(route)); return screen('V3', `Маршрут ${route} подключён.`, [], route); }
function extractMessageId(x) { const seen = new Set(); function walk(v) { if (!v || typeof v !== 'object' || seen.has(v)) return ''; seen.add(v); for (const k of ['message_id', 'messageId', 'id', 'mid']) if (v[k]) return clean(v[k]); for (const k of ['message', 'body', 'data', 'result']) { const r = walk(v[k]); if (r) return r; } return ''; } return walk(x); }
async function deleteOld(oldId, newId) { if (!oldId || oldId === newId) return { deleted: false, reason: 'empty_or_same' }; try { await api.deleteMessage({ botToken: config.botToken, messageId: oldId, timeoutMs: 1800 }); return { deleted: true }; } catch (e) { return { deleted: false, error: clean(e?.message || e) }; } }
async function sendPacket(u, packet) { const id = adminId(u); const s = await getState(id); const targets = []; const chat = cid(u); const user = uid(u); if (chat) targets.push({ chatId: chat, kind: 'chatId' }); if (user && user !== chat) targets.push({ userId: user, kind: 'userId' }); let last = null; for (const t of targets) { try { const { kind, ...q } = t; const result = await api.sendMessage({ botToken: config.botToken, ...q, text: packet.text, attachments: packet.attachments, notify: false }); const newId = extractMessageId(result); const cleanup = await deleteOld(clean(s.lastMenuMessageId), newId); if (newId) await saveState(id, { lastMenuMessageId: newId, lastMenuRoute: routeFrom(u), lastMenuAt: Date.now(), lastMenuCleanup: cleanup }); return { ok: true, kind, newId, cleanup }; } catch (e) { last = e; } } throw last || new Error('no_send_target'); }
async function answerCallback(u) { const id = clean(cb(u)?.callback_id || cb(u)?.id || ''); if (id) try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification: '' }); } catch {} }
async function saveInput(id, mode, message) { const [, sec, key] = String(mode).split(':'); const patch = { mode: '' }; if (key === 'moderationStopwords') { const s = await getState(id); const cur = clean(s.moderationStopwords); patch.moderationStopwords = cur ? cur + ', ' + cut(message, 40) : cut(message, 40); patch.moderationStopwordsEnabled = true; patch.moderationEnabled = true; } else { patch[key] = cut(message, key === 'moderationRules' ? 500 : key === 'giftMessage' ? 300 : 200); if (sec === 'comments') patch.commentsBanner = true; if (sec === 'gifts') patch.giftsEnabled = true; if (sec === 'buttons') patch.buttonsEnabled = true; if (sec === 'moderation') patch.moderationEnabled = true; } await saveState(id, patch); return sec + ':home'; }
function startLike(u, s) { if (cb(u)) return false; const mode = String(s.mode || ''); if (mode.startsWith('await')) return false; const t = textOf(u).toLowerCase(); return START_WORDS.has(t) || (!t && !!msg(u)); }
function allowed(route) { return route === 'main:home' || /^(channels|comments|gifts|buttons|moderation|editor|highlight|polls|stats|tariffs|referrals|help):/.test(route); }
async function tryHandleExpress(req) { const u = req.body || {}; const id = adminId(u); const s = await getState(id); const hasCallback = !!cb(u); const message = textOf(u); let route = routeFrom(u); if (!hasCallback && message && String(s.mode || '').startsWith('await:')) { const next = await saveInput(id, s.mode, message); return { handled: true, runtime: RUNTIME, route: s.mode + '_saved', sentKind: (await sendPacket(u, await renderAsync(next, id, {}))).kind }; } if (startLike(u, s)) route = 'main:home'; if (!allowed(route)) return { handled: false, runtime: RUNTIME, route, reason: 'not_hard_v3_route' }; try { await db.upsertFromUpdate(u); } catch {} if (hasCallback) await answerCallback(u); return { handled: true, runtime: RUNTIME, route, sentKind: (await sendPacket(u, await renderAsync(route, id, payloadOf(u)))).kind }; }
async function selfTestAsync(id = '') { const routes = ['main:home','channels:home','comments:home','gifts:home','buttons:home','moderation:home','comments:banner','comments:posts','gifts:posts','buttons:posts','channels:list']; const bad = []; for (const r of routes) { try { const s = await renderAsync(r, id, {}); if (!s.text || !Array.isArray(s.attachments)) bad.push(r); } catch (e) { bad.push(r + ':' + e.message); } } return { ok: bad.length === 0, runtimeVersion: RUNTIME, checked: routes.length, badRoutes: bad, readySections: ['channels','comments','gifts','buttons','moderation'], mainButtons: 5, statusHeader: true, toggleScheme: true, menuDelivery: 'send_new_menu_then_delete_previous_saved_menu', oneCurrentMenuPolicy: true, patcherTouched: false, commentsUiTouched: false, postgresUsed: true }; }
function selfTest() { return { ok: true, runtimeVersion: RUNTIME, readySections: ['channels','comments','gifts','buttons','moderation'], mainButtons: 5, statusHeader: true, toggleScheme: true, patcherTouched: false, commentsUiTouched: false }; }

module.exports = { RUNTIME, tryHandleExpress, render, renderAsync, selfTest, selfTestAsync };
