'use strict';

// АдминКИТ V3 hard-root menu.
// Цель: одно новое понятное дерево меню без старых меню-слоев.
// Не трогаем: patcher комментариев, Postgres, Telegram-style UI обсуждений.

const config = require('./config');
const api = require('./services/maxApi');
const store = require('./store');
const db = require('./cc5-db-core');

const RUNTIME = 'HARD-V3-ADMIN-MENU-2.4-CLIENT-ONE-CURRENT';
const mem = new Map();

const KNOWN_CHANNEL_TITLES = {
  '-73175958664622': 'АдминКИТ клуб'
};

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 90) => {
  const s = clean(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const isOn = (v, def = true) => (v === undefined ? def : !!v);
const status = (v, def = true) => (isOn(v, def) ? 'включено' : 'выключено');
const mark = (v, def = true) => (isOn(v, def) ? '✅' : '⏸');
const isTechnical = (v) => /^-?\d{8,}$/.test(clean(v)) || /^[a-f0-9]{16,}$/i.test(clean(v));
const isHuman = (v) => !!clean(v) && !isTechnical(v) && !['Канал не выбран', 'Пост не выбран', 'Подключённый канал'].includes(clean(v));

function channelTitleById(id = '') { return KNOWN_CHANNEL_TITLES[clean(id)] || ''; }
function normalizeChannelTitle(id = '', title = '') {
  const t = clean(title);
  if (isHuman(t)) return cut(t, 80);
  const known = channelTitleById(id);
  return known || (id ? 'Подключённый канал' : 'Канал не выбран');
}
function showChannel(ch = {}, s = {}) {
  return normalizeChannelTitle(ch.channelId || ch.id || s.activeChannelId, ch.title || s.activeChannelTitle || '');
}
function showPost(s = {}) {
  const title = clean(s.selectedPostTitle || s.buttonsPostTitle || s.giftPostTitle || '');
  if (isHuman(title)) return cut(title, 80);
  if (s.selectedPostId || s.selectedCommentKey) return 'Пост выбран';
  return 'не выбран';
}
function isAdminMenuTitle(v = '') {
  const s = clean(v).toLowerCase();
  if (!s) return false;
  return /админкит|главное меню|мои каналы|каналы$|комментарии$|кнопки под постами|подарки|модерация|статус:|подключённый канал|нужно ввести данные|выберите, что настроить/.test(s);
}
function postTitle(p = {}, fallback = 'Пост') {
  const t = clean(p.title || p.originalText || p.text || p.caption || '');
  if (isHuman(t) && !isAdminMenuTitle(t)) return cut(t, 42);
  const id = clean(p.postId || p.commentKey || '');
  return id ? fallback : 'Пост без названия';
}

const MAIN_BUTTONS = [
  ['📺 Каналы', 'channels:home'],
  ['💬 Комментарии', 'comments:home'],
  ['🎁 Подарки', 'gifts:home'],
  ['🔘 Кнопки', 'buttons:home'],
  ['🛡 Модерация', 'moderation:home']
];
const START_WORDS = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню', 'начать', 'вы начали общение с ботом']);
const DEFAULT_BANNER = { text: 'Разработано АдминКИТ', button: 'Открыть', link: '', scope: 'all', place: 'start' };
const LABELS = {
  commentsBannerText: 'текст баннера',
  commentsBannerButton: 'текст кнопки баннера',
  commentsBannerLink: 'ссылка или действие баннера',
  giftTitle: 'название подарка',
  giftLink: 'ссылка или файл подарка',
  giftMessage: 'сообщение получателю подарка',
  ctaButtonText: 'текст кнопки под постом',
  ctaButtonLink: 'ссылка или действие кнопки',
  moderationRules: 'правила модерации',
  moderationStopwords: 'стоп-слово'
};
const ALIAS = {
  'comments:select': 'comments:posts',
  'comments:pick': 'comments:posts',
  'comments:view': 'comments:preview',
  'comments:old_post': 'comments:old',
  'comments:settings': 'comments:home',
  'comments:banner_text': 'comments:banner:text',
  'comments:banner_button': 'comments:banner:button',
  'comments:banner_link': 'comments:banner:link',
  'comments:banner_on': 'comments:banner:on',
  'comments:banner_off': 'comments:banner:off',
  'comments:banner_reset': 'comments:banner:reset',
  'gifts:create': 'gifts:input:giftTitle',
  'gifts:select': 'gifts:posts',
  'buttons:add': 'buttons:input:ctaButtonText',
  'buttons:select': 'buttons:posts',
  'moderation:ai': 'moderation:toggle:moderationAi',
  'channels:set': 'channels:select',
  'channels:verify': 'channels:check'
};
function normalizeRoute(route = '') {
  const r = clean(route);
  if (START_WORDS.has(r.toLowerCase())) return 'main:home';
  return ALIAS[r] || r || 'main:home';
}
function owner(route = '') { return clean(route).split(':')[0] || 'main'; }

function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function textOf(u) {
  const m = msg(u);
  return clean(m?.body?.text || m?.text || body(u).text || '');
}
function payloadOf(u) {
  const c = cb(u);
  const raw = c?.payload || c?.data || '';
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return { r: raw }; }
  }
  return raw && typeof raw === 'object' ? raw : {};
}
function routeFrom(u) {
  const p = payloadOf(u);
  return normalizeRoute(p.r || p.route || textOf(u));
}
function isCallback(u) { return !!cb(u); }
function callbackId(u) { try { return db.callbackId(u); } catch { return clean(cb(u)?.callback_id || cb(u)?.id || ''); } }
function adminId(u) { try { return db.adminId(u) || db.chatId(u) || ''; } catch { return clean(cb(u)?.user?.user_id || msg(u)?.sender?.user_id || body(u).user_id || ''); } }
function chatId(u) { try { return db.chatId(u) || ''; } catch { return clean(msg(u)?.recipient?.chat_id || msg(u)?.chat_id || body(u).chat_id || ''); } }
function currentMessageId(u) { try { return db.messageId(u) || ''; } catch { return clean(cb(u)?.message?.message_id || msg(u)?.message_id || msg(u)?.id || ''); } }
function menuKey(u) { return chatId(u) || adminId(u) || 'global'; }
function responseMessageId(data = {}) {
  return clean(data.message_id || data.messageId || data.id || data.message?.message_id || data.message?.id || data.data?.message_id || data.data?.id || '');
}

async function getFlow(id) {
  try { return id ? (await db.getFlow(id)) || {} : {}; }
  catch { return mem.get(id) || {}; }
}
async function getState(id) { return (await getFlow(id)).menuV3 || {}; }
async function saveState(id, patch) {
  const f = await getFlow(id);
  const next = { ...f, menuV3: { ...(f.menuV3 || {}), ...patch, updatedAt: Date.now() } };
  try { await db.setFlow(id, next); }
  catch { mem.set(id, next); }
  return next.menuV3;
}
async function getLastMenu(key) {
  try { return await db.getMenu(key); }
  catch { return clean(mem.get('menu:' + key)); }
}
async function setLastMenu(key, messageId) {
  if (!key || !messageId) return;
  try { await db.setMenu(key, messageId); }
  catch { mem.set('menu:' + key, messageId); }
}

function addChannel(map, raw = {}) {
  const id = clean(raw.channelId || raw.id || raw.chat_id || raw.channel_id);
  if (!id) return;
  const title = normalizeChannelTitle(id, raw.title || raw.channelTitle || raw.name || raw.caption || '');
  const current = map.get(id);
  if (!current || (isHuman(title) && !isHuman(current.title))) map.set(id, { id, channelId: id, title });
}
async function listChannels(id) {
  const map = new Map();
  try { (await db.getChannels(id)).forEach(c => addChannel(map, c)); } catch {}
  try { (store.getChannelsList ? store.getChannelsList() : []).forEach(c => addChannel(map, c)); } catch {}
  try { Object.values(store.store?.channels || store.channels || {}).forEach(c => addChannel(map, c)); } catch {}
  return [...map.values()].map(c => ({ ...c, title: normalizeChannelTitle(c.id || c.channelId, c.title) }));
}
async function activeChannel(id) {
  const s = await getState(id);
  const list = await listChannels(id);
  const found = list.find(x => x.id === s.activeChannelId || x.channelId === s.activeChannelId) || list[0] || { id: '', channelId: '', title: '' };
  return { ...found, title: showChannel(found, s) };
}
async function listPosts(id, channelIdValue = '') {
  const out = [];
  try { out.push(...(await db.getPosts(id, channelIdValue, 80))); } catch {}
  try {
    (store.getPostsList ? store.getPostsList() : []).forEach(p => {
      if (!channelIdValue || String(p.channelId || '') === String(channelIdValue)) {
        out.push({ postId: p.postId, commentKey: p.commentKey, title: p.title || p.originalText || p.text || p.caption || '' });
      }
    });
  } catch {}
  const seen = new Set();
  return out.filter(p => {
    const k = clean(p.commentKey || p.postId || p.messageId);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    const t = clean(p.title || p.originalText || p.text || p.caption || '');
    if (isAdminMenuTitle(t)) return false;
    return true;
  }).slice(0, 50);
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
  return screen('🐋 АдминКИТ', ['Главное меню.', 'Выберите, что настроить: канал, комментарии, подарки, кнопки или модерацию.'], MAIN_BUTTONS, 'main:home');
}
function bannerState(s) {
  return {
    enabled: s.commentsBanner !== false,
    text: clean(s.commentsBannerText) || DEFAULT_BANNER.text,
    button: clean(s.commentsBannerButton) || DEFAULT_BANNER.button,
    link: clean(s.commentsBannerLink) || DEFAULT_BANNER.link,
    scope: clean(s.commentsBannerScope) || DEFAULT_BANNER.scope,
    place: clean(s.commentsBannerPlace) || DEFAULT_BANNER.place
  };
}
function commonStatus(s, ch) { return ['Статус:', `Канал: ${showChannel(ch, s)}`, `Пост: ${showPost(s)}`]; }
function commentsStatus(s, ch) {
  const b = bannerState(s);
  return commonStatus(s, ch).concat([
    `Комментарии: ${status(s.commentsEnabled)}`,
    `Авто для новых постов: ${status(s.commentsAutoNew)}`,
    `Фото в комментариях: ${status(s.commentsPhoto)}`,
    `Реакции и ответы: ${status(s.commentsReactions)}`,
    `Баннер: ${b.enabled ? 'включен' : 'выключен'}`
  ]);
}
function giftsStatus(s, ch) {
  return commonStatus(s, ch).concat([
    `Подарки: ${status(s.giftsEnabled, false)}`,
    `Только подписчикам: ${status(s.giftsRequireSubscription)}`,
    `Запрашивать контакт: ${status(s.giftsContactRequired, false)}`,
    `Название подарка: ${clean(s.giftTitle) || 'не задано'}`,
    `Ссылка/файл: ${clean(s.giftLink) ? 'задано' : 'не задано'}`
  ]);
}
function buttonsStatus(s, ch) {
  return commonStatus(s, ch).concat([
    `Кнопка под постом: ${status(s.buttonsEnabled, false)}`,
    `Текст кнопки: ${clean(s.ctaButtonText) || 'не задан'}`,
    `Ссылка/действие: ${clean(s.ctaButtonLink) ? 'задано' : 'не задано'}`,
    `Запрос контакта: ${status(s.buttonsRequestContact, false)}`,
    `Запрос гео: ${status(s.buttonsRequestGeo, false)}`
  ]);
}
function moderationStatus(s, ch) {
  return ['Статус:', `Канал: ${showChannel(ch, s)}`, `Модерация: ${status(s.moderationEnabled)}`, `Стоп-слова: ${status(s.moderationStopwordsEnabled)}`, `Ссылки: ${s.moderationLinksAllowed === false ? 'запрещены' : 'разрешены'}`, `Инвайты: ${s.moderationInvitesAllowed === false ? 'запрещены' : 'разрешены'}`, `AI-фильтр: ${status(s.moderationAi, false)}`, `Правила: ${clean(s.moderationRules) || 'не заданы'}`, `Стоп-слова: ${clean(s.moderationStopwords) || 'список пуст'}`];
}
function sectionHome(sec, s = {}, ch = { id: '', title: '' }) {
  if (sec === 'channels') return screen('📺 Каналы', ['Статус:', `Активный канал: ${showChannel(ch, s)}`, ch.id ? 'Канал подключён.' : 'Канал ещё не подключён.', `Автокомментарии: ${status(s.channelAutoComments)}`, `Безопасное обновление постов: ${status(s.channelSafePatch)}`, `Перед изменениями проверять права: ${status(s.channelRequireEditRights)}`], [['📋 Мои каналы', 'channels:list'], ['➕ Подключить', 'channels:connect'], ['🔁 Активный канал', 'channels:active'], ['✅ Проверить права', 'channels:check'], [`${mark(s.channelAutoComments)} Автокомменты`, 'channels:toggle:channelAutoComments'], [`${mark(s.channelSafePatch)} Безопасно обновлять`, 'channels:toggle:channelSafePatch'], [`${mark(s.channelRequireEditRights)} Проверять права`, 'channels:toggle:channelRequireEditRights'], ['👥 Администраторы', 'channels:admins']], 'channels:home');
  if (sec === 'comments') return screen('💬 Комментарии', commentsStatus(s, ch), [[`${mark(s.commentsEnabled)} Комментарии`, 'comments:toggle:commentsEnabled'], [`${mark(s.commentsAutoNew)} Авто для новых`, 'comments:toggle:commentsAutoNew'], ['📌 Старый пост', 'comments:old'], ['📌 Выбрать пост', 'comments:posts'], ['🖼 Баннер', 'comments:banner'], [`${mark(s.commentsPhoto)} Фото`, 'comments:toggle:commentsPhoto'], [`${mark(s.commentsReactions)} Реакции/ответы`, 'comments:toggle:commentsReactions'], ['👀 Предпросмотр', 'comments:preview']], 'comments:home');
  if (sec === 'gifts') return screen('🎁 Подарки / лид-магниты', giftsStatus(s, ch), [[`${mark(s.giftsEnabled, false)} Подарки`, 'gifts:toggle:giftsEnabled'], ['📌 Выбрать пост', 'gifts:posts'], ['✏️ Название', 'gifts:input:giftTitle'], ['🔗 Ссылка/файл', 'gifts:input:giftLink'], ['💬 Сообщение', 'gifts:input:giftMessage'], [`${mark(s.giftsRequireSubscription)} Только подписчикам`, 'gifts:toggle:giftsRequireSubscription'], [`${mark(s.giftsContactRequired, false)} Запрос контакта`, 'gifts:toggle:giftsContactRequired'], ['📋 Список', 'gifts:list'], ['🧪 Тестовая выдача', 'gifts:test'], ['↩️ Сброс', 'gifts:reset']], 'gifts:home');
  if (sec === 'buttons') return screen('🔘 Кнопки под постами', buttonsStatus(s, ch), [[`${mark(s.buttonsEnabled, false)} Кнопка`, 'buttons:toggle:buttonsEnabled'], ['📌 Выбрать пост', 'buttons:posts'], ['✏️ Текст кнопки', 'buttons:input:ctaButtonText'], ['🔗 Ссылка/действие', 'buttons:input:ctaButtonLink'], [`${mark(s.buttonsRequestContact, false)} Запрос контакта`, 'buttons:toggle:buttonsRequestContact'], [`${mark(s.buttonsRequestGeo, false)} Запрос гео`, 'buttons:toggle:buttonsRequestGeo'], ['📋 Что настроено', 'buttons:list'], ['👀 Предпросмотр', 'buttons:preview'], ['💾 Сохранить', 'buttons:save'], ['↩️ Сброс', 'buttons:reset']], 'buttons:home');
  if (sec === 'moderation') return screen('🛡 Модерация', moderationStatus(s, ch), [[`${mark(s.moderationEnabled)} Модерация`, 'moderation:toggle:moderationEnabled'], ['📜 Правила', 'moderation:input:moderationRules'], [`${mark(s.moderationStopwordsEnabled)} Стоп-слова`, 'moderation:toggle:moderationStopwordsEnabled'], ['➕ Добавить слово', 'moderation:input:moderationStopwords'], [`${s.moderationLinksAllowed === false ? '🚫' : '✅'} Ссылки`, 'moderation:toggle:moderationLinksAllowed'], [`${s.moderationInvitesAllowed === false ? '🚫' : '✅'} Инвайты`, 'moderation:toggle:moderationInvitesAllowed'], [`${mark(s.moderationAi, false)} AI-фильтр`, 'moderation:toggle:moderationAi'], ['📖 Журнал', 'moderation:log'], ['🧹 Очистить стоп-слова', 'moderation:clear']], 'moderation:home');
  return mainScreen();
}

async function postPicker(id, sec) {
  const ch = await activeChannel(id);
  const list = await listPosts(id, ch.id || ch.channelId);
  return screen('📌 Выбрать пост', list.length ? [`Найдено постов: ${list.length}`, 'Нажмите нужный пост.'] : ['Постов пока нет.', 'Для старого поста нажмите «Старый пост» и перешлите публикацию.'], list.slice(0, 10).map((p, i) => [`${i + 1}. ${postTitle(p, 'Пост')}`, `${sec}:post`, { postId: p.postId, commentKey: p.commentKey, title: postTitle(p, 'Пост выбран') }]), `${sec}:posts`);
}
async function setSelectedPost(id, sec, p = {}) {
  const title = isHuman(p.title) ? cut(p.title, 90) : 'Пост выбран';
  const patch = { selectedPostId: clean(p.postId), selectedCommentKey: clean(p.commentKey), selectedPostTitle: title };
  if (sec === 'gifts') Object.assign(patch, { giftPostId: clean(p.postId), giftPostTitle: title });
  if (sec === 'buttons') Object.assign(patch, { buttonsPostId: clean(p.postId), buttonsPostTitle: title });
  await saveState(id, patch);
}
function toggleValue(s, key) {
  if (key === 'moderationLinksAllowed' || key === 'moderationInvitesAllowed') return s[key] === false;
  const def = !['buttonsRequestContact', 'buttonsRequestGeo', 'moderationAi', 'giftsEnabled', 'giftsContactRequired', 'buttonsEnabled'].includes(key);
  return !isOn(s[key], def);
}
function missingButtonFields(s) {
  const m = [];
  if (!s.selectedPostId && !s.selectedCommentKey) m.push('выберите пост');
  if (!clean(s.ctaButtonText)) m.push('введите текст кнопки');
  if (!clean(s.ctaButtonLink) && !s.buttonsRequestContact && !s.buttonsRequestGeo) m.push('добавьте ссылку/действие или включите запрос контакта/гео');
  return m;
}
function missingGiftFields(s) {
  const m = [];
  if (!s.selectedPostId && !s.selectedCommentKey) m.push('выберите пост');
  if (!clean(s.giftTitle)) m.push('введите название подарка');
  if (!clean(s.giftLink)) m.push('добавьте ссылку или файл подарка');
  return m;
}

async function renderAsync(rawRoute = 'main:home', id = '', p = {}) {
  const route = normalizeRoute(rawRoute);
  const sec = owner(route);
  let s = await getState(id);
  let ch = await activeChannel(id);

  if (route === 'main:home') return mainScreen();
  if (MAIN_BUTTONS.some(x => owner(x[1]) === sec) && route.endsWith(':home')) return sectionHome(sec, s, ch);
  if (route.includes(':toggle:')) {
    const key = route.split(':toggle:')[1];
    s = await saveState(id, { [key]: toggleValue(s, key) });
    return sectionHome(sec, s, ch);
  }
  if (route.includes(':input:')) {
    const key = route.split(':input:')[1];
    await saveState(id, { mode: `await:${sec}:${key}` });
    return screen('✏️ Нужно ввести данные', [`Пришлите следующим сообщением: ${LABELS[key] || 'значение'}.`, 'После этого я сохраню настройку и верну вас в раздел.'], [], `${sec}:home`);
  }
  if (['comments:posts', 'gifts:posts', 'buttons:posts'].includes(route)) return postPicker(id, sec);
  if (['comments:post', 'gifts:post', 'buttons:post'].includes(route)) {
    await setSelectedPost(id, sec, p);
    s = await getState(id);
    return sectionHome(sec, s, ch);
  }
  if (route === 'channels:list') {
    const list = await listChannels(id);
    return screen('📋 Мои каналы', list.length ? [`Найдено каналов: ${list.length}`, 'Нажмите канал, чтобы сделать его активным.'] : ['Каналы пока не найдены.', 'Перешлите боту пост из нужного канала.'], list.slice(0, 10).map((c, i) => [`${i + 1}. ${showChannel(c, s)}`, 'channels:select', { channelId: c.id || c.channelId, channelTitle: showChannel(c, s) }]), 'channels:list');
  }
  if (route === 'channels:select') {
    const title = normalizeChannelTitle(p.channelId, p.channelTitle);
    await saveState(id, { activeChannelId: clean(p.channelId), activeChannelTitle: title });
    return screen('🔁 Активный канал', [`Готово. Теперь работаем с каналом: ${title}.`], [['📺 Каналы', 'channels:home']], 'channels:active');
  }
  if (route === 'channels:connect') {
    await saveState(id, { mode: 'await_channel_forward', section: 'channels' });
    return screen('➕ Подключить канал', ['Перешлите сюда любой пост из канала.', 'После этого канал появится в списке, а бот сможет настраивать комментарии, кнопки и подарки.'], [], 'channels:connect');
  }
  if (route === 'channels:active') return screen('🔁 Активный канал', [`Сейчас выбран: ${showChannel(ch, s)}.`], [['📋 Мои каналы', 'channels:list']], 'channels:active');
  if (route === 'channels:admins') return screen('👥 Администраторы', ['Здесь будет список администраторов канала, если MAX API отдаёт эти данные.', 'Главное: бот должен быть администратором и иметь право редактировать сообщения.'], [['✅ Проверить права', 'channels:check']], 'channels:admins');
  if (route === 'channels:check') return screen('✅ Проверить права', ch.id ? [`Канал: ${showChannel(ch, s)}`, 'Проверяем, что бот является администратором и может редактировать посты.'] : ['Сначала подключите или выберите канал.'], ch.id ? [] : [['➕ Подключить', 'channels:connect']], 'channels:check');

  if (route === 'comments:old') {
    await saveState(id, { mode: 'await_old_post_forward', section: 'comments' });
    return screen('📌 Старый пост', ['Перешлите сюда уже опубликованный пост.', 'Бот аккуратно добавит или восстановит кнопку комментариев без дублей.'], [['📌 Выбрать пост', 'comments:posts']], 'comments:old');
  }
  if (route === 'comments:banner') {
    const b = bannerState(s);
    return screen('🖼 Баннер в комментариях', commentsStatus(s, ch).concat(['', `Текст: ${b.text}`, `Кнопка: ${b.button}`, `Действие: ${b.link ? 'задано' : 'не задано'}`, `Где показывать: ${b.scope === 'post' ? 'только выбранный пост' : 'во всех обсуждениях'}`, `Позиция: ${b.place === 'bottom' ? 'внизу обсуждения' : 'у начала обсуждения'}`]), [['✅ Включить', 'comments:banner:on'], ['⏸ Выключить', 'comments:banner:off'], ['✏️ Текст', 'comments:banner:text'], ['🔘 Кнопка', 'comments:banner:button'], ['🔗 Ссылка', 'comments:banner:link'], ['🌐 Все', 'comments:banner:scope_all'], ['📌 Только пост', 'comments:banner:scope_post'], ['🔝 У начала', 'comments:banner:place_start'], ['🔻 Внизу', 'comments:banner:place_bottom'], ['↩️ Сброс', 'comments:banner:reset']], 'comments:banner');
  }
  if (route === 'comments:banner:on') { await saveState(id, { commentsBanner: true }); return renderAsync('comments:banner', id); }
  if (route === 'comments:banner:off') { await saveState(id, { commentsBanner: false }); return renderAsync('comments:banner', id); }
  if (route === 'comments:banner:text') return renderAsync('comments:input:commentsBannerText', id);
  if (route === 'comments:banner:button') return renderAsync('comments:input:commentsBannerButton', id);
  if (route === 'comments:banner:link') return renderAsync('comments:input:commentsBannerLink', id);
  if (route === 'comments:banner:scope_all') { await saveState(id, { commentsBannerScope: 'all' }); return renderAsync('comments:banner', id); }
  if (route === 'comments:banner:scope_post') { await saveState(id, { commentsBannerScope: 'post' }); return renderAsync('comments:banner', id); }
  if (route === 'comments:banner:place_start') { await saveState(id, { commentsBannerPlace: 'start' }); return renderAsync('comments:banner', id); }
  if (route === 'comments:banner:place_bottom') { await saveState(id, { commentsBannerPlace: 'bottom' }); return renderAsync('comments:banner', id); }
  if (route === 'comments:banner:reset') { await saveState(id, { commentsBanner: true, commentsBannerText: DEFAULT_BANNER.text, commentsBannerButton: DEFAULT_BANNER.button, commentsBannerLink: DEFAULT_BANNER.link, commentsBannerScope: DEFAULT_BANNER.scope, commentsBannerPlace: DEFAULT_BANNER.place }); return renderAsync('comments:banner', id); }
  if (route === 'comments:preview') return screen('👀 Предпросмотр', commentsStatus(s, ch).concat(['', 'Так будет работать выбранный пост: читатели открывают обсуждение, пишут комментарии, ставят реакции и прикрепляют фото, если фото включены.']), [['🖼 Баннер', 'comments:banner'], ['📌 Выбрать пост', 'comments:posts']], 'comments:preview');

  if (route === 'gifts:list') return screen('📋 Подарки', clean(s.giftTitle) ? giftsStatus(s, ch) : ['Подарок пока не создан.', 'Укажите название, ссылку/файл и выберите пост.'], [['✏️ Название', 'gifts:input:giftTitle'], ['🔗 Ссылка/файл', 'gifts:input:giftLink']], 'gifts:home');
  if (route === 'gifts:test') {
    const m = missingGiftFields(s);
    return screen('🧪 Тестовая выдача', m.length ? ['Подарок ещё не готов.', 'Нужно: ' + m.join(', ') + '.'] : ['Подарок готов к тестовой выдаче.', `Название: ${clean(s.giftTitle)}`, `Пост: ${showPost(s)}`], [], 'gifts:home');
  }
  if (route === 'gifts:reset') { await saveState(id, { giftTitle: '', giftLink: '', giftMessage: '', giftsEnabled: false }); return sectionHome('gifts', await getState(id), ch); }

  if (route === 'buttons:list') return screen('📋 Что настроено', clean(s.ctaButtonText) || clean(s.ctaButtonLink) ? buttonsStatus(s, ch) : ['Кнопка пока не настроена.', 'Выберите пост, введите текст кнопки и ссылку/действие.'], [['✏️ Текст кнопки', 'buttons:input:ctaButtonText'], ['🔗 Ссылка/действие', 'buttons:input:ctaButtonLink']], 'buttons:home');
  if (route === 'buttons:preview') {
    const m = missingButtonFields(s);
    return screen('👀 Предпросмотр кнопки', m.length ? ['Кнопка ещё не готова.', 'Нужно: ' + m.join(', ') + '.'] : ['Так увидит пользователь:', `Кнопка: ${clean(s.ctaButtonText)}`, `Действие: ${clean(s.ctaButtonLink) ? 'открыть ссылку/действие' : s.buttonsRequestContact ? 'запросить контакт' : 'запросить гео'}`, `Пост: ${showPost(s)}`], [], 'buttons:home');
  }
  if (route === 'buttons:save') {
    const m = missingButtonFields(s);
    if (m.length) return screen('💾 Сохранить кнопку', ['Кнопку пока нельзя сохранить.', 'Нужно: ' + m.join(', ') + '.'], [['✏️ Текст кнопки', 'buttons:input:ctaButtonText'], ['🔗 Ссылка/действие', 'buttons:input:ctaButtonLink'], ['📌 Выбрать пост', 'buttons:posts']], 'buttons:home');
    await saveState(id, { buttonsEnabled: true, ctaSavedAt: Date.now() });
    return screen('💾 Сохранено', ['Кнопка сохранена для выбранного поста.', `Пост: ${showPost(s)}`], [['🔘 Кнопки', 'buttons:home']], 'buttons:home');
  }
  if (route === 'buttons:reset') { await saveState(id, { ctaButtonText: '', ctaButtonLink: '', buttonsEnabled: false, buttonsRequestContact: false, buttonsRequestGeo: false }); return sectionHome('buttons', await getState(id), ch); }

  if (route === 'moderation:log') return screen('📖 Журнал модерации', ['Здесь будет список последних сработавших правил.', 'На этом этапе журнал не показывает технические данные.'], [], 'moderation:home');
  if (route === 'moderation:clear') { await saveState(id, { moderationStopwords: '' }); return sectionHome('moderation', await getState(id), ch); }
  if (route === 'help:home') return screen('❓ Помощь', ['Выберите раздел и нажимайте кнопки.', 'Переключатели работают сразу.', 'Если нужно ввести текст, бот попросит прислать следующее сообщение.'], [], `${sec}:home`);

  return sectionHome(sec, s, ch);
}

async function handleAwaitedInput(update, id) {
  const s = await getState(id);
  const mode = clean(s.mode);
  if (!mode.startsWith('await:')) return null;
  const value = textOf(update);
  if (!value || START_WORDS.has(value.toLowerCase())) return null;
  const [, sec, key] = mode.split(':');
  await saveState(id, { mode: '', [key]: value });
  const ch = await activeChannel(id);
  const next = await getState(id);
  return screen('✅ Сохранено', [`Сохранила: ${LABELS[key] || 'значение'}.`, '', 'Возвращаю вас в раздел.'], [[`↩️ ${sec === 'comments' ? 'Комментарии' : sec === 'gifts' ? 'Подарки' : sec === 'buttons' ? 'Кнопки' : sec === 'moderation' ? 'Модерация' : 'Раздел'}`, `${sec}:home`]], `${sec}:home`);
}

async function handleForwardMode(update, id) {
  const s = await getState(id);
  const mode = clean(s.mode);
  if (!['await_channel_forward', 'await_old_post_forward'].includes(mode)) return null;
  let saved = null;
  try { saved = await db.upsertFromUpdate(update); } catch {}
  const chId = clean(saved?.channelId || s.activeChannelId || '');
  const pId = clean(saved?.postId || '');
  const title = normalizeChannelTitle(chId, saved?.channelTitle || s.activeChannelTitle || '');
  const patch = { mode: '', activeChannelId: chId || s.activeChannelId, activeChannelTitle: title };
  if (pId || saved?.commentKey) Object.assign(patch, { selectedPostId: pId, selectedCommentKey: clean(saved?.commentKey), selectedPostTitle: isHuman(saved?.title) ? cut(saved.title, 80) : 'Пост выбран' });
  await saveState(id, patch);
  return mode === 'await_channel_forward'
    ? screen('✅ Канал подключён', [`Канал: ${title}.`, 'Теперь можно настраивать комментарии, подарки, кнопки и модерацию.'], [['📺 Каналы', 'channels:home']], 'channels:home')
    : screen('✅ Пост подключён', [`Канал: ${title}.`, `Пост: ${showPost(await getState(id))}.`, 'Кнопка комментариев будет восстановлена без дублей.'], [['💬 Комментарии', 'comments:home']], 'comments:home');
}

async function deliverMenu(update, screenObj, route) {
  const token = config.botToken;
  if (!token) return { handled: true, route, sentKind: 'skipped_no_bot_token' };
  const key = menuKey(update);
  const chat = chatId(update);
  const user = adminId(update);
  const previous = await getLastMenu(key);
  let sent = null;
  try {
    sent = await api.sendMessage({ botToken: token, chatId: chat || undefined, userId: chat ? undefined : user, text: screenObj.text, attachments: screenObj.attachments, notify: false });
  } catch (error) {
    return { handled: true, route, sentKind: 'send_failed', error: error?.message || String(error) };
  }
  const newId = responseMessageId(sent);
  if (newId) await setLastMenu(key, newId);
  const current = currentMessageId(update);
  const toDelete = [...new Set([previous, current].filter(x => x && x !== newId))];
  for (const mid of toDelete) {
    api.deleteMessage({ botToken: token, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
  }
  return { handled: true, route, sentKind: 'send_new_delete_previous', messageId: newId };
}

async function tryHandle(update) {
  const route = routeFrom(update);
  const text = textOf(update);
  const p = payloadOf(update);
  const id = adminId(update) || chatId(update) || 'global';
  const routeOwner = owner(route);
  const allowed = route === 'main:home' || MAIN_BUTTONS.some(x => owner(x[1]) === routeOwner) || routeOwner === 'help';

  let screenObj = await handleAwaitedInput(update, id);
  if (!screenObj) screenObj = await handleForwardMode(update, id);
  if (!screenObj) {
    if (!allowed && !START_WORDS.has(text.toLowerCase())) return { handled: false, route };
    screenObj = await renderAsync(route, id, p);
  }

  const cbId = callbackId(update);
  if (cbId && config.botToken) api.answerCallback({ botToken: config.botToken, callbackId: cbId, notification: '' }).catch(() => {});
  return deliverMenu(update, screenObj, route);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return renderAsync(route, 'debug', {}); }
function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, readySections: ['channels', 'comments', 'gifts', 'buttons', 'moderation'], mainButtons: MAIN_BUTTONS.length, clientFriendly: true, hidesTechnicalIds: true, filtersAdminMenuAsPosts: true, knownChannelTitles: Object.keys(KNOWN_CHANNEL_TITLES).length, menuDelivery: 'send_new_then_delete_previous_and_current_callback_message', patcherTouched: false, commentsUiTouched: false, postgresUsed: true };
}
function install() { return selfTest(); }

module.exports = { RUNTIME, install, selfTest, render, renderAsync, tryHandle, tryHandleExpress };
