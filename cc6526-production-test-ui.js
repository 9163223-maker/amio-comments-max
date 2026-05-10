'use strict';

// CC6.5.2.6 production test UI.
// Goal: лаконичное меню без дублей, Pro/Business unlocked for product test,
// one toggle per setting, no technical ids in client UI.

const Module = require('module');
const RUNTIME = 'CC6.5.2.6';
const SOURCE = 'adminkit-CC6.5.2.6-production-test-ui';
const lastMenus = new Map();
const events = [];

const ALIASES = {
  ak_main_menu: 'main:home', main_menu: 'main:home', menu_main: 'main:home', home: 'main:home',
  comments_menu: 'comments:home', comments_choose_post: 'comments:choose_post', comments_post_card: 'comments:post', help_comments: 'help:comments',
  comments_enable: 'comments:toggle', comments_disable: 'comments:toggle', comments_debug_post: 'comments:debug_post',
  gift_menu: 'gifts:home', gifts_menu: 'gifts:home', gift_create: 'gifts:create', gift_list: 'gifts:list', help_gifts: 'help:gifts',
  buttons_menu: 'buttons:home', buttons_add: 'buttons:add', buttons_list: 'buttons:list', help_buttons: 'help:buttons',
  mod_start: 'moderation:home', moderation_menu: 'moderation:home', help_moderation: 'help:moderation',
  stats_menu: 'stats:home', channels_menu: 'channels:home', help_menu: 'help:home'
};

const MAIN = [
  ['📺 Каналы и доступ', 'channels:home'],
  ['💬 Комментарии', 'comments:home'],
  ['🛡 Модерация', 'moderation:home'],
  ['✏️ Редактор постов', 'editor:home'],
  ['⚪ Кнопки под постами', 'buttons:home'],
  ['🎁 Подарки / лид-магниты', 'gifts:home'],
  ['📌 Выделение постов', 'highlight:home'],
  ['📊 Статистика', 'stats:home'],
  ['🧾 Покупка и тарифы', 'billing:home'],
  ['🤝 Реферальная программа', 'referrals:home'],
  ['❓ Помощь', 'help:home']
];

const SECTION = {
  channels: '📺 Каналы и доступ', comments: '💬 Комментарии', moderation: '🛡 Модерация', editor: '✏️ Редактор постов', buttons: '⚪ Кнопки под постами', gifts: '🎁 Подарки / лид-магниты', highlight: '📌 Выделение постов', stats: '📊 Статистика', billing: '🧾 Покупка и тарифы', referrals: '🤝 Реферальная программа', help: '❓ Помощь', comments_banner: '🖼 Баннер в обсуждениях', comments_photo: '📷 Фото в комментариях', comments_reactions: '❤️ Реакции и ответы'
};

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function clip(v, n = 72) { const s = norm(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function tryJson(v) { try { const p = JSON.parse(String(v || '')); return p && typeof p === 'object' ? p : null; } catch { return null; } }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function msg(u = {}) { return u.message || u.data?.message || u.callback?.message || u.data?.callback?.message || null; }
function cb(u = {}) { return u.callback || u.data?.callback || msg(u)?.callback || null; }
function payloadRaw(u = {}) { const c = cb(u) || {}; return norm(c.payload || c.body?.payload || u.payload || u.data?.payload || ''); }
function payload(u = {}) { return tryJson(payloadRaw(u)) || {}; }
function rawAction(u = {}) { const p = payload(u); const raw = payloadRaw(u); return norm(p.action || p.cmd || p.route || (/^[a-z0-9_:.\-]+$/i.test(raw) ? raw : '')).toLowerCase(); }
function canonical(a = '') { const x = norm(a).toLowerCase(); return ALIASES[x] || x; }
function ns(route = '') { route = canonical(route); return route === 'main:home' ? 'main' : route.split(':')[0]; }
function owned(route = '') { const n = ns(route); return ['main','channels','comments','comments_banner','comments_photo','comments_reactions','moderation','editor','buttons','gifts','highlight','stats','billing','referrals','help'].includes(n); }
function eventType(u = {}) { return norm(u.update_type || u.type || u.event_type || u.eventType || u.event || u.data?.update_type || u.data?.type || '').toLowerCase(); }
function text(u = {}) { const m = msg(u) || {}; return norm(m.body?.text || m.text || m.message?.text || u.message?.text || ''); }
function startPayload(u = {}) { return norm([u.start_payload, u.payload, u.startParam, u.start_param, u.data?.start_payload, u.data?.payload, msg(u)?.body?.payload, msg(u)?.payload].find((x) => norm(x)) || ''); }
function isStart(u = {}) { if (cb(u)) return false; const t = eventType(u); const tx = text(u).toLowerCase(); const sp = startPayload(u).toLowerCase(); return t === 'bot_started' || t === 'bot_start' || t === 'bot_started_update' || ['start','/start','menu','/menu','меню'].includes(tx) || ['start','menu','main'].includes(sp); }
function userId(u = {}) { const m = msg(u) || {}; const c = cb(u) || {}; return norm(u.user?.user_id || u.user?.id || u.sender?.user_id || u.sender?.id || c.user?.user_id || c.user?.id || c.sender?.user_id || c.sender?.id || m.sender?.user_id || m.sender?.id || m.user_id || m.from?.id || u.data?.user?.user_id || u.data?.user?.id || ''); }
function chatId(u = {}) { const m = msg(u) || {}; return norm(m.recipient?.chat_id || m.recipient?.id || m.chat_id || m.chat?.id || u.chat_id || u.chat?.id || u.data?.chat_id || u.data?.chat?.id || ''); }
function target(u = {}) { const uid = userId(u); const cid = chatId(u); return { userId: uid, chatId: cid, key: uid || cid }; }
function callbackId(u = {}) { const c = cb(u) || {}; return norm(c.callback_id || c.callbackId || c.id || u.callback_id || ''); }
function messageId(u = {}) { const c = cb(u) || {}; const m = c.message || msg(u) || {}; const b = m.body || {}; return norm(b.mid || b.message_id || b.messageId || m.message_id || m.messageId || m.id || m.mid || c.message_id || c.messageId || ''); }
function responseMessageId(v = {}) { return norm([v?.message?.body?.mid, v?.message?.body?.message_id, v?.message?.message_id, v?.message?.id, v?.body?.mid, v?.body?.message_id, v?.message_id, v?.id, v?.mid, v?.data?.message?.body?.mid, v?.data?.message?.id, v?.data?.id].find((x) => norm(x)) || ''); }
function logEvent(item) { events.push({ ts: Date.now(), ...item }); while (events.length > 120) events.shift(); }

function btn(label, action, extra = {}) { return { type: 'callback', text: label, payload: JSON.stringify({ action, ...extra }) }; }
function kb(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function nav(section) { return [[btn('❓ Помощь раздела', `help:${section}`)], [btn('↩️ В меню раздела', `${section}:home`)], [btn('🏠 Главное меню', 'main:home')]]; }
function mainModel() { return { text: 'АдминКИТ — главное меню\n\nРежим теста продукта: Pro/Business-функции открыты для проверки.', attachments: kb(MAIN.map(([t, r]) => [btn(t, r)])) }; }

function storeMod() { const s = require('./store'); if (!s.store.moderation) s.store.moderation = { byChannel: {}, logs: [] }; if (!s.store.moderation.byChannel) s.store.moderation.byChannel = {}; return s; }
function saveStore() { try { const s = require('./store'); if (typeof s.saveStore === 'function') s.saveStore(s.store); } catch {} }
function channelIdOf(c = {}) { return norm(c.channelId || c.channel_id || c.id || c.chatId || c.chat_id || ''); }
function channelTitle(c = {}) { return norm(c.title || c.channelTitle || c.channelName || c.name || c.chatTitle || channelIdOf(c) || 'Канал'); }
function channels() { try { const xs = require('./services/channelService').listChannels(); return Array.isArray(xs) ? xs : []; } catch { return []; } }
function selectedChannelId(extra = {}) { const xs = channels(); return norm(extra.channelId || extra.channel_id || (xs.length === 1 ? channelIdOf(xs[0]) : '')); }
function postKey(p = {}) { return norm(p.commentKey || p.key || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')); }
function postTitle(p = {}, i = 0) { return `${i + 1}. ${clip(p.originalText || p.title || p.linkedByName || p.postTitle || p.postId || p.commentKey || 'Пост', 44)}`; }
function listPosts(channelId = '') { try { const xs = require('./services/postEditorService').listAdminPosts({ channelId, limit: 20, config: require('./config') }); if (Array.isArray(xs) && xs.length) return xs; } catch {} try { const posts = Object.values(require('./store').store?.posts || {}); return posts.filter((p) => !channelId || norm(p.channelId) === norm(channelId)); } catch { return []; } }
function findPost(commentKey = '', channelId = '') { return listPosts(channelId).find((p) => postKey(p) === norm(commentKey)) || listPosts('').find((p) => postKey(p) === norm(commentKey)) || null; }
function modKey(extra = {}) { return norm(extra.commentKey || selectedChannelId(extra) || 'global'); }
function defaultModState() { return { filter: true, basicWords: true, links: true, invites: false, ai: false, manualWords: [] }; }
function getMod(extra = {}) { const s = storeMod(); const key = modKey(extra); const cur = s.store.moderation.byChannel[key] || {}; return { ...defaultModState(), ...cur, key }; }
function setMod(extra = {}, patch = {}) { const s = storeMod(); const key = modKey(extra); s.store.moderation.byChannel[key] = { ...getMod(extra), ...patch, updatedAt: Date.now() }; saveStore(); return s.store.moderation.byChannel[key]; }
function toggleMod(field, extra = {}) { const cur = getMod(extra); return setMod(extra, { [field]: !cur[field] }); }
function humanOn(v) { return v ? 'включено' : 'выключено'; }
function humanAllow(v) { return v ? 'разрешены' : 'запрещены'; }

function sectionHome(section) {
  if (section === 'comments') return commentsHome();
  if (section === 'moderation') return moderationHome({});
  if (section === 'gifts') return giftsHome();
  if (section === 'buttons') return buttonsHome();
  if (section === 'channels') return channelsHome();
  if (section === 'billing') return billingHome();
  if (section === 'referrals') return referralsHome();
  if (section === 'stats') return simpleHome('📊 Статистика', 'Проверяем статистику канала, постов, комментариев, реакций, кликов, подарков и роста.', [['📊 Статистика канала','stats:channel'], ['📌 Статистика поста','stats:choose_post'], ['Комментарии','stats:comments'], ['Реакции','stats:reactions'], ['Клики по кнопкам','stats:buttons'], ['Подарки и заявки','stats:gifts'], ['Прирост подписчиков','stats:growth'], ['Экспорт','stats:export']], 'stats');
  if (section === 'editor') return simpleHome('✏️ Редактор постов', 'Проверяем редактирование текста, ссылок, медиа, предпросмотр, сохранение и восстановление оригинала.', [['📌 Выбрать пост','editor:choose_post'], ['История изменений','editor:history']], 'editor');
  if (section === 'highlight') return simpleHome('📌 Выделение постов', 'Проверяем выделение важных постов, метки, стиль и предпросмотр.', [['📌 Выбрать пост','highlight:choose_post'], ['⭐ Включить выделение','highlight:enable'], ['🎨 Стиль выделения','highlight:set_style']], 'highlight');
  return simpleHome(SECTION[section] || section, 'Раздел открыт для теста продукта.', [], section);
}
function simpleHome(title, body, rows, section) { return { text: `${title}\n\n${body}`, attachments: kb([...rows.map(([t,r]) => [btn(t,r)]), ...nav(section)]) }; }
function commentsHome() {
  return { text: '💬 Комментарии\n\nОбсуждения под постами, авто-комментарии, старые посты, баннеры, фото, реакции и ответы.\n\nВсе функции открыты в режиме теста Pro.', attachments: kb([
    [btn('⚡ Авто для новых постов','comments:auto_new')], [btn('📌 Подключить старый пост','comments:old_post')], [btn('📌 Выбрать пост','comments:choose_post')], [btn('👀 Как это выглядит','comments:preview')], [btn('⚙️ Настройки комментариев','comments:settings')], [btn('🖼 Баннер в обсуждениях','comments_banner:home')], [btn('📷 Фото в комментариях','comments_photo:home')], [btn('❤️ Реакции и ответы','comments_reactions:home')], ...nav('comments')]) };
}
function giftsHome() { return simpleHome('🎁 Подарки / лид-магниты', 'Создание подарков по шагам 1/4–4/4, проверка подписки, список, тестовая выдача и fallback.', [['🎁 Создать подарок','gifts:create'], ['📌 Выбрать пост для подарка','gifts:choose_post'], ['📋 Список подарков','gifts:list'], ['🧪 Тестовая выдача','gifts:test_send'], ['🔐 Проверка подписки','gifts:check_subscription']], 'gifts'); }
function buttonsHome() { return simpleHome('⚪ Кнопки под постами', 'CTA-кнопки под постом MAX: текст кнопки, ссылка, список, редактирование, удаление и предпросмотр.', [['➕ Добавить кнопку','buttons:add'], ['📌 Выбрать пост для кнопки','buttons:choose_post'], ['📋 Кнопки поста','buttons:list'], ['👀 Предпросмотр','buttons:preview']], 'buttons'); }
function channelsHome() { const xs = channels(); const rows = xs.map((c) => [btn(channelTitle(c), 'channels:select', { channelId: channelIdOf(c) })]); return { text: `📺 Каналы и доступ\n\nПодключённых каналов: ${xs.length}.\nКанал восстанавливается из PostgreSQL после redeploy.`, attachments: kb([...rows, [btn('➕ Подключить канал','channels:connect')], [btn('✅ Проверить права бота','channels:verify_access')], [btn('🔐 Доступы канала','access:channel_status')], ...nav('channels')]) }; }
function billingHome() { return simpleHome('🧾 Покупка и тарифы', 'Тестируем продуктовый контур: пробный период, покупка, тариф, токен, продление и upgrade.', [['🎁 Попробовать бесплатно','billing:trial'], ['💳 Купить подписку','billing:buy'], ['📋 Мой тариф','billing:my_plan'], ['🔐 Активировать токен','billing:activate_token'], ['⬆️ Улучшить тариф','billing:upgrade']], 'billing'); }
function referralsHome() { return simpleHome('🤝 Реферальная программа', 'Реферальная ссылка, приглашения, бонусы и условия программы.', [['🔗 Моя реферальная ссылка','referrals:my_link'], ['📊 Мои приглашения','referrals:stats'], ['🎁 Мои бонусы','referrals:bonuses'], ['💸 Условия программы','referrals:terms']], 'referrals'); }
function moderationHome(extra = {}) { const m = getMod(extra); return { text: `🛡 Модерация\n\nТекущие настройки:\nФильтр: ${humanOn(m.filter)}\nБазовые стоп-слова: ${humanOn(m.basicWords)}\nРучных стоп-слов: ${(m.manualWords || []).length}\nСсылки: ${humanAllow(m.links)}\nПриглашения: ${humanAllow(m.invites)}\nAI-модерация: ${humanOn(m.ai)}\n\nНажатие меняет состояние этой же настройки.`, attachments: kb([
    [btn('🎯 Правила конкретного поста','moderation:choose_post')],
    [btn(m.filter ? '⏸ Выключить фильтр' : '✅ Включить фильтр','moderation:toggle_filter', extra)],
    [btn(m.basicWords ? '🧱 Базовые стоп-слова: выкл.' : '🧱 Базовые стоп-слова: вкл.','moderation:toggle_basic_words', extra)],
    [btn('📝 Ручной список стоп-слов','moderation:manual_words', extra)],
    [btn(m.links ? '🔗 Ссылки: запретить' : '🔗 Ссылки: разрешить','moderation:toggle_links', extra)],
    [btn(m.invites ? '✉️ Приглашения: запретить' : '✉️ Приглашения: разрешить','moderation:toggle_invites', extra)],
    [btn(m.ai ? '🤖 Выключить AI-модерацию' : '🤖 Включить AI-модерацию','moderation:toggle_ai', extra)],
    [btn('📋 Журнал модерации','moderation:logs', extra)], [btn('🧪 Тест комментария','moderation:test_comment', extra)], ...nav('moderation')]) } }
function moderationManual(extra = {}) { const m = getMod(extra); const words = (m.manualWords || []).slice(-8); const top = words.length ? `\n\nСлова: ${words.join(', ')}` : '\n\nСписок пока пуст.'; return { text: `📝 Ручной список стоп-слов${top}\n\nДля теста кнопка «Добавить» добавляет слово «спам».`, attachments: kb([[btn('➕ Добавить «спам»','moderation:add_word', extra)], [btn('➖ Удалить последнее','moderation:remove_word', extra)], [btn('🧹 Очистить список','moderation:clear_manual_words', extra)], ...nav('moderation')]) }; }
function choosePost(section, extra = {}) { const chId = selectedChannelId(extra); const xs = channels(); if (!xs.length) return { text: `${SECTION[section]} → выбор поста\n\nКанал не найден.`, attachments: kb([[btn('📺 Каналы и доступ','channels:home')], ...nav(section)]) }; const posts = listPosts(chId); return { text: `${SECTION[section]} → выбор поста\n\nКанал: ${channelTitle(xs.find((c) => channelIdOf(c) === chId) || xs[0] || {})}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments: kb([...posts.map((p, i) => [btn(postTitle(p, i), `${section}:post`, { channelId: chId, commentKey: postKey(p), postId: norm(p.postId) })]), ...nav(section)]) }; }
function postModel(section, extra = {}) { const post = findPost(extra.commentKey, extra.channelId); const name = clip(post?.originalText || post?.title || post?.postTitle || post?.linkedByName || post?.postId || 'Пост', 80); if (section === 'comments') { const on = !post?.commentsDisabled; return { text: `💬 Комментарии → пост\n\nПост: ${name}\nКомментарии: ${on ? 'включены' : 'выключены'}\n\nВыберите действие.`, attachments: kb([[btn(on ? '⏸ Выключить комментарии' : '✅ Включить комментарии','comments:toggle', extra)], [btn('👀 Открыть обсуждение','comments:open_discussion', extra)], [btn('🖼 Баннер в обсуждении','comments_banner:home', extra)], [btn('📷 Фото в комментариях','comments_photo:home', extra)], [btn('❤️ Реакции и ответы','comments_reactions:home', extra)], [btn('📌 К списку постов','comments:choose_post', extra)], ...nav('comments')]) }; }
  if (section === 'moderation') return { ...moderationHome(extra), text: `🛡 Модерация → пост\n\nПост: ${name}\n\n` + moderationHome(extra).text.replace(/^🛡 Модерация\n\n/, '') };
  if (section === 'gifts') return { text: `🎁 Подарки → пост\n\nПост: ${name}\n\nСоздайте или настройте подарок для этого поста.`, attachments: kb([[btn('🎁 Создать подарок','gifts:create', extra)], [btn('Шаг 1/4 — канал и пост','gifts:step_1_channel_post', extra)], [btn('Шаг 2/4 — файл или ссылка','gifts:step_2_file_or_link', extra)], [btn('Шаг 3/4 — сообщение получателю','gifts:step_3_message', extra)], [btn('Шаг 4/4 — подтверждение','gifts:step_4_confirm', extra)], [btn('📌 К списку постов','gifts:choose_post', extra)], ...nav('gifts')]) };
  if (section === 'buttons') return { text: `⚪ Кнопки → пост\n\nПост: ${name}\n\nНастройте CTA-кнопки под этим постом.`, attachments: kb([[btn('➕ Добавить кнопку','buttons:add', extra)], [btn('Шаг 2/3 — текст кнопки','buttons:step_2_label', extra)], [btn('Шаг 3/3 — ссылка','buttons:step_3_url', extra)], [btn('📋 Кнопки поста','buttons:list', extra)], [btn('👀 Предпросмотр','buttons:preview', extra)], [btn('📌 К списку постов','buttons:choose_post', extra)], ...nav('buttons')]) };
  return { text: `${SECTION[section]} → пост\n\nПост: ${name}\n\nФункция открыта для теста Pro.`, attachments: kb([...nav(section)]) };
}
async function toggleComments(extra = {}, update = {}) { const post = findPost(extra.commentKey, extra.channelId); const nextEnabled = Boolean(post?.commentsDisabled); try { await require('./services/postEditorService').setPostCommentsEnabled({ commentKey: extra.commentKey, enabled: nextEnabled, actorId: userId(update), actorName: 'admin', config: require('./config') }); } catch {} return postModel('comments', extra); }
function featureScreen(route, extra = {}) { const section = ns(route); const title = SECTION[section] || route; return { text: `${title}\n\nФункция открыта в режиме теста Pro.\nМаршрут: ${route}\n\nДальше подключаем реальную бизнес-логику без смены владельца раздела.`, attachments: kb([...nav(section)]) }; }
function help(section) { return { text: `❓ Помощь: ${SECTION[section] || section}\n\nМеню работает в режиме теста продукта: Pro/Business-функции открыты. Технические ID скрыты из обычного интерфейса.`, attachments: kb([...nav(section)]) }; }
async function model(routeRaw, extra = {}, update = {}) { const route = canonical(routeRaw); const section = ns(route); if (route === 'main:home') return mainModel(); if (route.startsWith('help:')) return help(route.split(':')[1] || 'help'); if (route.endsWith(':home')) return sectionHome(section); if (route.endsWith(':choose_post')) return choosePost(section, extra); if (route.endsWith(':post')) return postModel(section, extra); if (route === 'comments:toggle') return toggleComments(extra, update); if (route === 'moderation:manual_words') return moderationManual(extra); if (route === 'moderation:toggle_filter') { toggleMod('filter', extra); return moderationHome(extra); } if (route === 'moderation:toggle_basic_words') { toggleMod('basicWords', extra); return moderationHome(extra); } if (route === 'moderation:toggle_links') { toggleMod('links', extra); return moderationHome(extra); } if (route === 'moderation:toggle_invites') { toggleMod('invites', extra); return moderationHome(extra); } if (route === 'moderation:toggle_ai') { toggleMod('ai', extra); return moderationHome(extra); } if (route === 'moderation:add_word') { const m = getMod(extra); setMod(extra, { manualWords: [...new Set([...(m.manualWords || []), 'спам'])] }); return moderationManual(extra); } if (route === 'moderation:remove_word') { const m = getMod(extra); setMod(extra, { manualWords: (m.manualWords || []).slice(0, -1) }); return moderationManual(extra); } if (route === 'moderation:clear_manual_words') { setMod(extra, { manualWords: [] }); return moderationManual(extra); } return featureScreen(route, extra); }
async function render(update = {}, routeRaw = 'main:home', forceSend = false) { const route = canonical(routeRaw); const api = require('./services/maxApi'); const config = require('./config'); const t = target(update); const m = await model(route, payload(update), update); const cbid = callbackId(update); if (cbid) { try { await api.answerCallback({ botToken: config.botToken, callbackId: cbid }); } catch {} } const mid = messageId(update); if (mid && !forceSend) { try { await api.editMessage({ botToken: config.botToken, messageId: mid, notify: false, text: m.text, attachments: m.attachments }); return { ok: true, mode: 'edit', route, runtimeVersion: RUNTIME }; } catch {} } if (!t.userId && !t.chatId) return { ok: false, reason: 'target_missing', route }; const old = lastMenus.get(t.key); if (old?.messageId) { try { await api.deleteMessage({ botToken: config.botToken, messageId: old.messageId, timeoutMs: 1600 }); } catch {} } const sent = await api.sendMessage({ botToken: config.botToken, userId: t.userId || undefined, chatId: t.userId ? undefined : t.chatId, notify: false, text: m.text, attachments: m.attachments }); const sid = responseMessageId(sent); if (sid) lastMenus.set(t.key, { messageId: sid, ts: Date.now() }); return { ok: true, mode: 'send', route, runtimeVersion: RUNTIME }; }
function sendText(res, lines) { noCache(res); return res.type('text/plain').send(lines.join('\n') + '\n'); }
function runtimeCheck(res) { return sendText(res, ['OK: PRODUCTION_TEST_UI_READY', 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'proAccessForTesting: enabled', 'dedupeMenus: enabled', 'singleTogglePolicy: enabled', 'noClientCommentKey: enabled', 'moderationStateSummary: enabled']); }
function installExpressPatch() { if (Module._load.__cc6526Patch) return; const oldLoad = Module._load; function patchedLoad(request, parent, isMain) { const loaded = oldLoad.apply(this, arguments); if (String(request || '') === 'express' && loaded && !loaded.__cc6526Wrap) { function expressWrapper() { const app = loaded.apply(this, arguments); if (app && !app.__cc6526) { app.__cc6526 = true; app.use((req, res, next) => { const r = String(req.path || req.url || '').split('?')[0].toLowerCase(); if (r === '/debug/production-test-ui') return runtimeCheck(res); if (r === '/debug/production-test-ui-events') { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, events: events.slice(-80) }); } return next(); }); const oldPost = app.post.bind(app); app.post = (route, ...handlers) => { const rt = String(route || '').toLowerCase(); if (!rt.includes('/webhook')) return oldPost(route, ...handlers); return oldPost(route, async (req, res, next) => { try { const action = canonical(rawAction(req.body || {})); const should = isStart(req.body || {}) || owned(action); logEvent({ action, handled: should, isStart: isStart(req.body || {}), payloadRaw: payloadRaw(req.body || {}) }); if (isStart(req.body || {})) return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, 'main:home', true) }); if (owned(action)) return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, action) }); return next(); } catch (e) { logEvent({ error: e?.message || String(e), action: rawAction(req.body || {}) }); return next(); } }, ...handlers); }; } return app; } Object.setPrototypeOf(expressWrapper, loaded); Object.assign(expressWrapper, loaded); expressWrapper.__cc6526Wrap = true; return expressWrapper; } return loaded; } patchedLoad.__cc6526Patch = true; Module._load = patchedLoad; }
function install() { process.env.BUILD_VERSION = RUNTIME; process.env.RUNTIME_VERSION = RUNTIME; process.env.BUILD_SOURCE_MARKER = SOURCE; installExpressPatch(); return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE }; }
module.exports = { RUNTIME, SOURCE, install };
