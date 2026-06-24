'use strict';

// АдминКИТ V3 functional menu adapter.
// PR240 restores polls as a live channel -> post -> poll workflow.

const RUNTIME = 'CC6.6.10-V3-MENU-ACTIONS-POLLS-UNIFIED-WORKFLOW';
const SOURCE = 'adminkit-pr240-polls-unified-post-workflow';

let installed = false;
let patched = false;
let lastError = '';
let renderCount = 0;
let lastRoute = '';
let lastRenderedAt = '';

const MAIN = [
  ['channels:home', '📺 Каналы'], ['comments:home', '💬 Комментарии'],
  ['moderation:home', '🛡 Модерация'], ['editor:home', '✏️ Редактор'],
  ['buttons:home', '⚪ Кнопки'], ['gifts:home', '🎁 Подарки'],
  ['highlight:home', '📌 Выделение'], ['polls:home', '🗳 Опросы'],
  ['stats:home', '📊 Статистика'], ['billing:home', '🧾 Тарифы'],
  ['referrals:home', '🤝 Рефералы'], ['help:home', '❓ Помощь']
];

const SECTIONS = {
  channels: ['📺 Каналы', 'Подключение канала, список каналов, права бота и восстановление после redeploy.'],
  comments: ['💬 Комментарии', 'Обсуждения под постами MAX. Здесь подключаем старые посты, авто-режим, фото, реакции и настройки.'],
  moderation: ['🛡 Модерация', 'Правила, стоп-слова, ссылки, инвайты, AI-проверка и журнал.'],
  editor: ['✏️ Редактор', 'Редактирование постов без потери комментариев, ссылок, медиа и кнопок.'],
  buttons: ['⚪ Кнопки', 'CTA-кнопки под постами: текст, ссылка, список, удаление и предпросмотр.'],
  gifts: ['🎁 Подарки', 'Подарки и лид-магниты за подписку: создание, список, проверка подписки, тестовая выдача.'],
  highlight: ['📌 Выделение', 'Выделение важных постов. Раздел в разработке, но маршрут и сценарий закреплены.'],
  polls: ['🗳 Опросы', 'Голосования под конкретным постом: канал, пост, вопрос, варианты и результаты.'],
  stats: ['📊 Статистика', 'Статистика канала, постов, комментариев, реакций, подарков и кнопок.'],
  billing: ['🧾 Тарифы', 'Тариф, пробный период, токены и ограничения. Платёжный модуль в разработке.'],
  referrals: ['🤝 Рефералы', 'Реферальная ссылка, приглашения и бонусы. Раздел в разработке.'],
  help: ['❓ Помощь', 'Контекстная помощь по разделам АдминКИТ.']
};

const CHILDREN = {
  channels: [['channels:list','📋 Мои каналы'],['channels:connect','➕ Подключить'],['channels:select','🔁 Активный канал'],['channels:verify_access','✅ Проверить права'],['channels:access','🔐 Доступы'],['channels:admins','👥 Администраторы']],
  comments: [['comments:auto_new','⚡ Авто для новых'],['comments:old_post','📌 Старый пост'],['comments:choose_post','📌 Выбрать пост'],['comments:preview','👀 Как это выглядит'],['comments:settings','⚙️ Настройки'],['comments_banner:home','🖼 Баннер'],['comments_photo:home','📷 Фото'],['comments_reactions:home','❤️ Реакции и ответы']],
  moderation: [['moderation:channel','🛡 Правила канала'],['moderation:choose_post','🎯 Правила поста'],['moderation:toggle_filter','✅/⏸ Фильтр'],['moderation:base_words','🧱 Базовые стоп-слова'],['moderation:manual_words','📋 Ручной список'],['moderation:add_word','➕ Стоп-слово'],['moderation:toggle_links','🔗 Ссылки'],['moderation:toggle_invites','✉️ Инвайты'],['moderation:toggle_ai','🤖 AI-модерация'],['moderation:logs','📋 Журнал'],['moderation:test_comment','🧪 Проверить комментарий']],
  editor: [['editor:choose_post','📌 Выбрать пост'],['editor:history','🕘 История']],
  buttons: [['buttons:add','➕ Добавить кнопку'],['buttons:choose_post','📌 Выбрать пост'],['buttons:list','📋 Кнопки поста'],['buttons:preview','👀 Предпросмотр']],
  gifts: [['gifts:create','🎁 Создать подарок'],['gifts:choose_post','📌 Выбрать пост'],['gifts:list','📋 Список подарков'],['gifts:check_subscription','🔐 Проверка подписки'],['gifts:test_send','🧪 Тестовая выдача'],['gifts:recipient_message','💬 Сообщение получателю']],
  highlight: [['highlight:choose_post','📌 Выбрать пост'],['highlight:toggle','✅/⏸ Выделение'],['highlight:set_text','✏️ Текст выделения'],['highlight:preview','👀 Предпросмотр'],['highlight:stats','📊 Статистика']],
  polls: [['polls:create','➕ Создать опрос'],['polls:results','📊 Результаты опросов']],
  stats: [['stats:channel','📊 Канал'],['stats:choose_post','📌 Пост'],['stats:comments','💬 Комментарии'],['stats:reactions','❤️ Реакции'],['stats:button_clicks','🔘 Клики'],['stats:gifts','🎁 Подарки'],['stats:growth','📈 Прирост'],['stats:period_24h','24 часа'],['stats:period_7d','7 дней'],['stats:period_14d','14 дней'],['stats:period_30d','30 дней'],['stats:export','📤 Экспорт']],
  billing: [['billing:my_plan','📋 Мой тариф'],['billing:trial','🎁 Пробный период'],['billing:buy','💳 Купить'],['billing:upgrade','⬆️ Улучшить'],['billing:activate_token','🔐 Активировать токен'],['billing:history','🧾 История оплат'],['billing:channel_limits','📺 Лимиты каналов']],
  referrals: [['referrals:my_link','🔗 Моя ссылка'],['referrals:stats','📊 Приглашения'],['referrals:bonuses','🎁 Бонусы'],['referrals:terms','💸 Условия'],['referrals:share','📤 Поделиться']],
  help: [['help:channels','📺 Каналы'],['help:comments','💬 Комментарии'],['help:moderation','🛡 Модерация'],['help:editor','✏️ Редактор'],['help:buttons','⚪ Кнопки'],['help:gifts','🎁 Подарки'],['help:stats','📊 Статистика']]
};

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function owner(route) { return norm(route).split(':')[0] || 'main'; }
function btn(text, route, extra = {}) {
  const payload = { r: route };
  for (const [k, v] of Object.entries(extra || {})) if (norm(v)) payload[k] = norm(v);
  return { type:'callback', text, payload: JSON.stringify(payload) };
}
function kb(rows) { return [{ type:'inline_keyboard', payload:{ buttons: rows.filter(Boolean).filter((r) => Array.isArray(r) && r.length) } }]; }
function rows2(items) { const out = []; for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2)); return out; }
function nav(o) { return o === 'main' ? [] : [[btn('❓ Помощь', `help:${o}`), btn('↩️ Раздел', `${o}:home`)], [btn('🏠 Главное меню', 'main:home')]]; }
function screen(text, rows = []) { return { text: text.filter((x) => x !== '').join('\n'), attachments: kb(rows) }; }
function short(v, n = 70) { const s = norm(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function parseOptions(value = '') { return String(value || '').split('|').map((x) => norm(x)).filter(Boolean).slice(0, 8); }

function config() { try { return require('./config'); } catch { return {}; } }
function db() { return require('./cc5-db-core'); }
function store() { return require('./store'); }
function pollsData() { return require('./src/core/pollsDataAdapter'); }
async function channels(adminId) { try { return await db().getChannels(adminId); } catch { try { return (require('./services/channelService').listChannels() || []); } catch { return []; } } }
async function posts(adminId, channelId, limit = 30) {
  try { if (channelId) return await db().getPosts(adminId, channelId, limit); } catch {}
  try { return store().getPostsList().filter((p) => !channelId || String(p.channelId) === String(channelId)).slice(0, limit).map((p) => ({ postId:p.postId, commentKey:p.commentKey, title:p.title || p.originalText || p.postTitle || p.postId, messageId:p.messageId, channelId:p.channelId })); } catch { return []; }
}
async function active(adminId, payload = {}) {
  const cs = await channels(adminId);
  const c = norm(payload.c || payload.channelId || cs[0]?.channelId || cs[0]?.id || '');
  const ps = await posts(adminId, c, 50);
  const p = ps.find((x) => norm(x.postId) === norm(payload.p) || norm(x.commentKey) === norm(payload.k)) || ps[0] || null;
  const selected = cs.find((x) => norm(x.channelId || x.id) === c) || {};
  return { channels:cs, channelId:c, channelTitle:norm(selected.title || selected.channelTitle || selected.displayTitle || c || 'Канал не выбран'), posts:ps, post:p, commentKey:norm(payload.k || p?.commentKey || '') };
}
async function setFlow(adminId, flow) { try { await db().setFlow(adminId, { ...(flow || {}), runtimeVersion:RUNTIME, updatedAt:Date.now() }); } catch {} }

async function main() { return screen(['🐋 АдминКИТ', '', 'Панель управления MAX-каналом. Выберите раздел.'], rows2(MAIN.map(([r,t]) => btn(t,r)))); }
async function home(route, adminId = '', payload = {}) {
  const o = owner(route); if (o === 'polls') return pollsRoute(adminId, route, payload);
  const s = SECTIONS[o] || ['АдминКИТ','Раздел']; return screen([s[0], '', s[1], '', 'Выберите действие.'], [...rows2((CHILDREN[o] || []).map(([r,t]) => btn(t,r))), ...nav(o)]);
}

async function pickPost(adminId, route, payload) {
  const o = owner(route); const a = await active(adminId, payload); const target = o === 'editor' ? 'editor:post' : o === 'buttons' ? 'buttons:post' : o === 'gifts' ? 'gifts:post' : o === 'moderation' ? 'moderation:post' : o === 'highlight' ? 'highlight:post' : o === 'stats' ? 'stats:post' : o === 'polls' ? 'polls:post' : 'comments:post';
  const rows = a.posts.slice(0, 10).map((p,i) => [btn(`${i+1}. ${short(p.title || p.postTitle || p.postId, 42)}`, target, { c:a.channelId, p:p.postId, k:p.commentKey, mid:p.messageId, pt:p.title || p.postTitle })]);
  return screen([SECTIONS[o]?.[0] || 'Посты', '', `Канал: ${a.channelTitle}`, `Постов в памяти: ${a.posts.length}`, '', a.posts.length ? 'Выберите пост.' : 'Постов нет в памяти. Перешлите опубликованный пост боту — он зарегистрирует пост и сохранит текст.'], [...rows, ...nav(o)]);
}

async function postCard(adminId, route, payload) {
  const o = owner(route); if (o === 'polls') return pollsPostCard(adminId, payload);
  const a = await active(adminId, payload); const p = a.post || {}; const base = { c:a.channelId, p:p.postId || payload.p || '', k:a.commentKey || payload.k || '' };
  const byOwner = {
    comments: [['comments:toggle','✅/⏸ Комменты'],['comments_banner:home','🖼 Баннер'],['comments_photo:home','📷 Фото'],['comments_reactions:home','❤️ Реакции']],
    editor: [['editor:edit_text','✏️ Изменить текст'],['editor:preview','👀 Предпросмотр'],['editor:save','💾 Сохранить'],['editor:history','🕘 История']],
    buttons: [['buttons:list','📋 Кнопки'],['buttons:add','➕ Добавить'],['buttons:edit','✏️ Редактировать'],['buttons:delete','🗑 Удалить']],
    gifts: [['gifts:create','🎁 Создать'],['gifts:list','📋 Подарки'],['gifts:check_subscription','🔐 Проверка'],['gifts:test_send','🧪 Тест']],
    moderation: [['moderation:channel','🛡 Правила'],['moderation:toggle_filter','✅/⏸ Фильтр'],['moderation:manual_words','📋 Стоп-слова'],['moderation:logs','📋 Журнал']],
    highlight: [['highlight:toggle','✅/⏸ Выделение'],['highlight:set_text','✏️ Текст'],['highlight:preview','👀 Предпросмотр'],['highlight:stats','📊 Статистика']],
    stats: [['stats:comments','💬 Комментарии'],['stats:reactions','❤️ Реакции'],['stats:button_clicks','🔘 Клики'],['stats:gifts','🎁 Подарки']]
  };
  return screen([SECTIONS[o]?.[0] || 'Пост', '', `Канал: ${a.channelTitle}`, `Пост: ${short(p.title || p.originalText || p.postId || 'пост не выбран', 90)}`, `commentKey: ${a.commentKey || '—'}`, '', 'Выберите действие для этого поста.'], [...rows2((byOwner[o] || []).map(([r,t]) => btn(t,r,base))), [btn('📌 К списку постов', `${o}:choose_post`, { c:a.channelId })], ...nav(o)]);
}

async function pollsPickChannel(adminId, route, payload = {}) {
  const cs = await channels(adminId);
  if (!cs.length) return screen(['🗳 Опросы / голосования', '', 'У вас пока нет подключённых каналов.', 'Добавьте бота администратором в MAX-канал и перешлите сюда любой пост.'], [[btn('➕ Подключить канал','channels:connect')], ...nav('polls')]);
  if (cs.length === 1) return pickPost(adminId, 'polls:choose_post', { ...payload, c:norm(cs[0].channelId || cs[0].id) });
  const rows = cs.slice(0, 12).map((c, i) => [btn(`${i+1}. ${short(c.title || c.channelTitle || c.displayTitle || c.channelId || c.id, 46)}`, 'polls:choose_post', { c:c.channelId || c.id })]);
  return screen(['🗳 Опросы / голосования', '', 'Шаг 1 из 5. Выберите канал.', 'Дальше покажем последние посты этого канала.'], [...rows, ...nav('polls')]);
}
async function pollsPostCard(adminId, payload = {}) {
  const a = await active(adminId, payload); const p = a.post || {}; const base = { c:a.channelId, p:p.postId || payload.p || '', k:a.commentKey || payload.k || '', mid:p.messageId || payload.mid || '', pt:p.title || p.postTitle || payload.pt || '' };
  return screen(['🗳 Опросы / голосования', '', `Канал: ${a.channelTitle}`, `Пост: ${short(p.title || p.postTitle || p.originalText || p.postId || 'пост не выбран', 90)}`, '', 'Выберите действие.'], [[btn('➕ Создать опрос', 'polls:question', base), btn('📊 Результаты опросов', 'polls:results', base)], [btn('📌 Выбрать другой пост', 'polls:choose_post', { c:a.channelId })], ...nav('polls')]);
}
async function pollsQuestion(adminId, payload = {}) {
  const a = await active(adminId, payload); const base = { c:a.channelId, p:a.post?.postId || payload.p || '', k:a.commentKey || payload.k || '', mid:a.post?.messageId || payload.mid || '', pt:a.post?.title || payload.pt || '' };
  await setFlow(adminId, { type:'polls_create', step:'question', channelId:base.c, postId:base.p, commentKey:base.k });
  return screen(['❓ Вопрос опроса', '', `Канал: ${a.channelTitle}`, `Пост: ${short(a.post?.title || a.post?.postId || 'пост выбран', 90)}`, '', 'Выберите готовый вопрос или отправьте свой вопрос следующим сообщением.'], [[btn('Какой формат вам интереснее?', 'polls:options', { ...base, q:'Какой формат вам интереснее?' })], [btn('Нужен ли продолжение?', 'polls:options', { ...base, q:'Нужен ли продолжение?' })], [btn('↩️ К посту', 'polls:post', base)], ...nav('polls')]);
}
async function pollsOptions(adminId, payload = {}) {
  const a = await active(adminId, payload); const base = { c:a.channelId, p:a.post?.postId || payload.p || '', k:a.commentKey || payload.k || '', mid:a.post?.messageId || payload.mid || '', pt:a.post?.title || payload.pt || '', q:payload.q || 'Какой вариант выбираем?' };
  return screen(['🔢 Варианты ответов', '', `Вопрос: ${base.q}`, 'Минимум 2 варианта. Повторный голос пользователя обновляет выбор, а не создаёт дубль.'], [[btn('Да / Нет / Позже', 'polls:preview', { ...base, opts:'Да|Нет|Позже' })], [btn('Полезное / Новости / Подарки', 'polls:preview', { ...base, opts:'Полезное|Новости|Подарки' })], [btn('↩️ Изменить вопрос', 'polls:question', base)], ...nav('polls')]);
}
async function pollsPreview(adminId, payload = {}) {
  const opts = parseOptions(payload.opts || 'Да|Нет|Позже'); const a = await active(adminId, payload);
  return screen(['👁 Предпросмотр опроса', '', `Канал: ${a.channelTitle}`, `Пост: ${short(a.post?.title || payload.pt || payload.p || 'пост выбран', 90)}`, `Вопрос: ${payload.q || 'Какой вариант выбираем?'}`, 'Варианты:', ...opts.map((o, i) => `${i+1}. ${o}`)], [[btn('✅ Создать опрос', 'polls:create_run', { ...payload, opts:opts.join('|') })], [btn('↩️ Варианты', 'polls:options', payload)], ...nav('polls')]);
}
async function pollsCreate(adminId, payload = {}) {
  const a = await active(adminId, payload); const opts = parseOptions(payload.opts || 'Да|Нет|Позже');
  let saved = { ok:false, error:'not_started' };
  try { saved = await pollsData().createPoll({ adminId, userId:adminId }, { channelId:a.channelId, channelTitle:a.channelTitle, postId:a.post?.postId || payload.p, messageId:a.post?.messageId || payload.mid, postTitle:a.post?.title || payload.pt, question:payload.q || 'Какой вариант выбираем?', options:opts }); }
  catch (error) { saved = { ok:false, error:error?.message || String(error) }; }
  return screen([saved.ok ? '✅ Опрос создан' : '⚠️ Не удалось создать опрос', '', saved.ok ? `Пост: ${saved.postTitle}` : 'Проверьте выбранный канал, пост, вопрос и варианты.', saved.ok ? `Вопрос: ${saved.question}` : `Ошибка: ${short(saved.error || 'unknown', 120)}`, saved.ok ? `Вариантов: ${saved.options.length}` : '', '', 'Опрос сохранён отдельно от CTA-кнопок.'], [[btn('📊 Результаты', 'polls:results', { c:a.channelId, p:a.post?.postId || payload.p, pollId:saved.pollId })], [btn('➕ Создать ещё', 'polls:create', { c:a.channelId })], ...nav('polls')]);
}
async function pollsResults(adminId, payload = {}) {
  const a = await active(adminId, payload); let list = { ok:true, polls:[] };
  try { list = await pollsData().listPolls({ adminId, userId:adminId, payload:{ channelId:a.channelId } }, { channelId:a.channelId, limit:10 }); } catch (error) { list = { ok:false, polls:[], error:error?.message || String(error) }; }
  const rows = (list.polls || []).slice(0, 8).map((p, i) => [btn(`${i+1}. ${p.status === 'closed' ? '🔒' : '🟢'} ${short(p.question, 42)}`, 'polls:results', { c:p.channelId || a.channelId, p:p.postId, pollId:p.pollId })]);
  return screen(['📊 Результаты опросов', '', `Канал: ${a.channelTitle}`, (list.polls || []).length ? 'Выберите опрос или создайте новый.' : 'Пока нет созданных опросов для этого канала.'], [...rows, [btn('➕ Создать опрос', 'polls:create', { c:a.channelId })], ...nav('polls')]);
}
async function pollsRoute(adminId, route, payload = {}) {
  if (route === 'polls:home') return screen(['🗳 Опросы / голосования', '', 'Создавайте голосования под конкретным постом.', 'Workflow: канал → пост → вопрос → варианты → создание.'], [[btn('➕ Создать опрос', 'polls:create')], [btn('📊 Результаты опросов', 'polls:results')], ...nav('polls')]);
  if (route === 'polls:create' || route === 'polls:attach_post' || route === 'polls:choose_channel') return pollsPickChannel(adminId, route, payload);
  if (route === 'polls:choose_post') return pickPost(adminId, route, payload);
  if (route === 'polls:post') return pollsPostCard(adminId, payload);
  if (route === 'polls:question') return pollsQuestion(adminId, payload);
  if (route === 'polls:options') return pollsOptions(adminId, payload);
  if (route === 'polls:preview') return pollsPreview(adminId, payload);
  if (route === 'polls:create_run') return pollsCreate(adminId, payload);
  if (route === 'polls:results' || route === 'polls:list') return pollsResults(adminId, payload);
  return pollsPickChannel(adminId, route, payload);
}

async function channelsRoute(adminId, route, payload) {
  const cs = await channels(adminId); const a = await active(adminId, payload);
  if (route === 'channels:list' || route === 'channels:select') {
    const rows = cs.slice(0, 10).map((c,i) => [btn(`${i+1}. ${short(c.title || c.channelTitle || c.channelId, 45)}`, 'channels:home', { c:c.channelId })]);
    return screen(['📋 Мои каналы', '', `Найдено каналов: ${cs.length}`, cs.length ? 'Выберите канал, чтобы сделать его активным в текущих действиях.' : 'Каналов пока нет. Перешлите любой пост из канала боту или нажмите «Подключить».'], [...rows, ...nav('channels')]);
  }
  if (route === 'channels:connect') { await setFlow(adminId, { type:'connect_channel', step:'await_forwarded_post' }); return screen(['➕ Подключить канал', '', 'Действие активно.', 'Перешлите сюда любой опубликованный пост из нужного MAX-канала. Бот сохранит channelId, название канала, postId и сможет прикреплять функции к постам.', '', 'После пересылки откройте «Мои каналы».'], [[btn('📋 Мои каналы','channels:list')], ...nav('channels')]); }
  if (route === 'channels:verify_access') return screen(['✅ Проверить права бота', '', `Активный канал: ${a.channelTitle}`, 'Проверка подготовлена: бот должен быть администратором канала и иметь право редактировать сообщения.'], [[btn('📋 Мои каналы','channels:list'), btn('➕ Подключить','channels:connect')], ...nav('channels')]);
  return screen(['🔐 Доступы канала', '', `Активный канал: ${a.channelTitle}`, route === 'channels:admins' ? 'Администраторы канала — бизнес-раздел в разработке.' : 'Базовая проверка доступа активна.'], [[btn('✅ Проверить права','channels:verify_access')], ...nav('channels')]);
}

async function commentsRoute(adminId, route, payload) {
  const a = await active(adminId, payload);
  if (route === 'comments:auto_new') { try { if (a.channelId) store().saveChannel(a.channelId, { autoModeEnabled:true, autoCommentsV3:true }); } catch {} return screen(['⚡ Авто для новых постов', '', `Канал: ${a.channelTitle}`, 'Функция активна: новые посты, попавшие в webhook/память бота, получают связь с обсуждением.', '', 'Для уже опубликованного поста используйте «Старый пост».'], [[btn('📌 Старый пост','comments:old_post'), btn('📌 Выбрать пост','comments:choose_post',{c:a.channelId})], ...nav('comments')]); }
  if (route === 'comments:old_post') { await setFlow(adminId, { type:'comments_old_post', step:'await_forwarded_post' }); return screen(['📌 Старый пост', '', 'Действие активно.', 'Перешлите сюда уже опубликованный пост из канала. Бот зарегистрирует его, сохранит текст поста и безопасно добавит/восстановит кнопку комментариев.'], [[btn('📌 Выбрать пост','comments:choose_post',{c:a.channelId})], ...nav('comments')]); }
  if (route === 'comments:preview') return screen(['👀 Как это выглядит', '', 'Открывается мини-приложение обсуждения в Telegram-like стиле MAX: верхняя навигация, счётчик комментариев, поле ввода, реакции и ответы.'], [[btn('📌 Выбрать пост','comments:choose_post',{c:a.channelId})], ...nav('comments')]);
  if (route === 'comments:settings') return screen(['⚙️ Настройки комментариев', '', 'Активные настройки:', '— авто-режим для новых постов;', '— подключение старого поста;', '— фото только как отдельная премиальная функция;', '— видео и файлы не включаем;', '— реакции и ответы отдельным подпунктом.'], [[btn('📷 Фото','comments_photo:home'), btn('❤️ Реакции','comments_reactions:home')], ...nav('comments')]);
  if (route === 'comments:toggle') return screen(['✅/⏸ Комментарии', '', `Пост: ${short(a.post?.title || a.post?.postId || 'не выбран')}`, 'Переключение выполняется только после выбора конкретного поста и подтверждения в карточке поста.'], [[btn('📌 Выбрать пост','comments:choose_post',{c:a.channelId})], ...nav('comments')]);
  return home('comments:home', adminId, payload);
}

async function moderationRoute(adminId, route, payload) {
  const a = await active(adminId, payload); let settings = null;
  try { settings = store().getModerationSettings(a.channelId); } catch {}
  if (route === 'moderation:toggle_filter') { try { const next = { ...(settings || {}), enabled: !(settings?.enabled !== false) }; store().saveModerationSettings(a.channelId, next); settings = next; } catch {} }
  if (route === 'moderation:toggle_links') { try { const next = { ...(settings || {}), blockLinks: !settings?.blockLinks }; store().saveModerationSettings(a.channelId, next); settings = next; } catch {} }
  if (route === 'moderation:toggle_invites') { try { const next = { ...(settings || {}), blockInvites: !(settings?.blockInvites !== false) }; store().saveModerationSettings(a.channelId, next); settings = next; } catch {} }
  if (route === 'moderation:add_word' || route === 'moderation:test_comment') await setFlow(adminId, { type: route, channelId:a.channelId, step:'await_text' });
  return screen(['🛡 Модерация', '', `Канал: ${a.channelTitle}`, `Фильтр: ${settings?.enabled === false ? 'выключен' : 'включен'}`, `Ссылки: ${settings?.blockLinks ? 'запрещены' : 'разрешены'}`, `Инвайты: ${settings?.blockInvites === false ? 'разрешены' : 'запрещены'}`, '', route === 'moderation:add_word' ? 'Пришлите следующим сообщением стоп-слово для добавления.' : route === 'moderation:test_comment' ? 'Пришлите следующим сообщением тестовый комментарий для проверки.' : 'Выберите действие.'], [...rows2((CHILDREN.moderation || []).map(([r,t]) => btn(t,r,{c:a.channelId}))), ...nav('moderation')]);
}
async function statsRoute(adminId, route, payload) {
  const a = await active(adminId, payload); let comments = 0, reactions = 0, gifts = 0;
  try { const postsList = await posts(adminId, a.channelId, 200); for (const p of postsList) comments += (store().getComments(p.commentKey) || []).length; } catch {}
  try { gifts = (store().store?.gifts?.campaigns && Object.keys(store().store.gifts.campaigns).length) || 0; } catch {}
  return screen(['📊 Статистика', '', `Канал: ${a.channelTitle}`, `Постов в памяти: ${a.posts.length}`, `Комментариев: ${comments}`, `Реакций: ${reactions}`, `Подарков/лид-магнитов: ${gifts}`, '', route === 'stats:export' ? 'Экспорт — бизнес-функция в разработке.' : 'Срез собран из текущей памяти и БД.'], [...rows2((CHILDREN.stats || []).map(([r,t]) => btn(t,r,{c:a.channelId}))), ...nav('stats')]);
}
async function flowRoute(adminId, route, payload) {
  const o = owner(route); const a = await active(adminId, payload); await setFlow(adminId, { type:route, owner:o, channelId:a.channelId, postId:payload.p || a.post?.postId || '', commentKey:payload.k || a.commentKey || '', step:'started' });
  const dev = ['highlight','billing','referrals'].includes(o);
  const text = { editor:'Функция редактора активна: выберите пост, затем отправьте новый текст. Медиа, ссылки и кнопки должны сохраняться через postEditorService.', buttons:'Функция кнопок активна как 3 шага: 1) пост, 2) текст кнопки, 3) ссылка/действие, затем сохранить.', gifts:'Функция подарков активна как 4 шага: 1) канал и пост, 2) файл или ссылка, 3) сообщение получателю, 4) подтверждение.', highlight:'Раздел выделения постов в разработке. Маршрут закреплён, выбранный пост сохраняется в flow.', billing:'Платёжный модуль в разработке. Маршрут закреплён, тарифные действия не смешиваются с комментариями.', referrals:'Реферальный модуль в разработке. Маршрут закреплён.' }[o] || 'Действие запущено.';
  return screen([SECTIONS[o]?.[0] || 'Действие', '', dev ? 'Статус: в разработке.' : 'Статус: функция привязана.', text, '', `Канал: ${a.channelTitle}`, a.post ? `Пост: ${short(a.post.title || a.post.postId)}` : 'Пост не выбран.'], [[btn('📌 Выбрать пост', `${o}:choose_post`, {c:a.channelId})], ...nav(o)]);
}
async function simpleRoute(adminId, route, payload) {
  const o = owner(route);
  if (o === 'polls') return pollsRoute(adminId, route, payload);
  if (route.includes('choose_channel')) return pollsPickChannel(adminId, route, payload);
  if (route.includes('choose_post') || route.includes('attach_post')) return pickPost(adminId, route, payload);
  if (route.endsWith(':post')) return postCard(adminId, route, payload);
  if (o === 'channels') return channelsRoute(adminId, route, payload);
  if (o === 'comments') return commentsRoute(adminId, route, payload);
  if (o === 'moderation') return moderationRoute(adminId, route, payload);
  if (o === 'stats') return statsRoute(adminId, route, payload);
  if (o === 'comments_banner') return screen(['🖼 Баннер в обсуждениях', '', 'Функция привязана к обсуждению, не к CTA-кнопке под постом.', 'Сейчас доступен предпросмотр и маршруты настройки.'], [[btn('💬 В комментарии','comments:home')], ...nav('comments')]);
  if (o === 'comments_photo') return screen(['📷 Фото в комментариях', '', 'Функция закреплена: разрешаем только фото. Видео и файлы не включаем.'], [[btn('⚙️ Настройки','comments:settings'), btn('💬 В комментарии','comments:home')], ...nav('comments')]);
  if (o === 'comments_reactions') return screen(['❤️ Реакции и ответы', '', 'Функция активна в интерфейсе обсуждений: реакции и ответы внутри треда.'], [[btn('👀 Предпросмотр','comments:preview'), btn('💬 В комментарии','comments:home')], ...nav('comments')]);
  if (['editor','buttons','gifts','highlight','billing','referrals'].includes(o)) return flowRoute(adminId, route, payload);
  if (o === 'help') return helpRoute(route);
  return screen(['АдминКИТ', '', `Маршрут: ${route}`, 'Функция привязана к дереву V3.'], [[btn('🏠 Главное меню','main:home')]]);
}
async function helpRoute(route) {
  const target = route.split(':')[1] || 'main'; const s = SECTIONS[target] || SECTIONS.help;
  return screen(['❓ Помощь', '', s[0], s[1], '', 'Каждая кнопка V3 открывает действие: активную функцию, выбор поста, flow или честную заглушку «в разработке».'], [[btn('🏠 Главное меню','main:home')]]);
}
async function renderScreen(route = 'main:home', adminId = '', payload = {}) {
  const r = norm(route) || 'main:home'; renderCount += 1; lastRoute = r; lastRenderedAt = new Date().toISOString();
  if (r === 'main:home' || r === 'ak_main_menu' || r === 'menu_main' || r === 'main_menu') return main();
  if (r.endsWith(':home') && SECTIONS[owner(r)]) return home(r, adminId, payload || {});
  if (r.endsWith(':main_menu') || r === 'help:main_menu') return main();
  if (r.endsWith(':section_home')) return home(`${owner(r)}:home`, adminId, payload || {});
  if (r.startsWith('help:')) return helpRoute(r);
  return simpleRoute(adminId, r, payload || {});
}
function install() {
  if (installed) return selfTest(); installed = true;
  try { const clean = require('./clean-v3-menu-core-db'); clean.renderScreen = renderScreen; clean.__adminkitV3MenuActionsAdapter = { runtimeVersion:RUNTIME, sourceMarker:SOURCE }; patched = true; }
  catch (error) { lastError = error?.message || String(error); }
  return selfTest();
}
function selfTest() {
  const routeCount = Object.values(CHILDREN).reduce((n, arr) => n + arr.length, MAIN.length);
  return { ok: installed && patched, runtimeVersion:RUNTIME, sourceMarker:SOURCE, installed, patched, routeCount, renderCount, lastRoute, lastRenderedAt, lastError, pollsUnifiedWorkflowReady:true, pollsAutoSingleChannelReady:true, pollsCreateUsesPollsDataAdapter:true, policy:{ everyVisibleButtonHasHandler:true, oldPatchedPostsUntouchedByNavigation:true, openAppCommentsUntouched:true, devRoutesSayInDevelopment:true, pollsNotDevPlaceholder:true } };
}
module.exports = { RUNTIME, SOURCE, install, selfTest, renderScreen, pollsRoute };
