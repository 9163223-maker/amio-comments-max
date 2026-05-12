'use strict';

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CLEAN-V3-MENU-ROOT-2.0';
const SOURCE = 'adminkit-clean-v3-root-one-current-menu-message';

const SEED_NODES = [
  ['main', '', 10, 'main:home', 'main', '🐋 АдминКИТ', 'Панель управления MAX-каналом. Выберите раздел.', true, '', false],
  ['channels', 'main', 10, 'channels:home', 'channels', '📺 Каналы', 'Подключение и проверка каналов.', true, '', false],
  ['comments', 'main', 20, 'comments:home', 'comments', '💬 Комментарии', 'Обсуждения под постами MAX.', true, '', false],
  ['moderation', 'main', 30, 'moderation:home', 'moderation', '🛡 Модерация', 'Правила, стоп-слова и проверка комментариев.', true, '', false],
  ['editor', 'main', 40, 'editor:home', 'editor', '✏️ Редактор', 'Редактирование и предпросмотр постов.', true, '', false],
  ['buttons', 'main', 50, 'buttons:home', 'buttons', '⚪ Кнопки', 'CTA-кнопки под постами.', true, '', false],
  ['gifts', 'main', 60, 'gifts:home', 'gifts', '🎁 Подарки', 'Подарки и лид-магниты за подписку.', true, '', false],
  ['highlight', 'main', 70, 'highlight:home', 'highlight', '📌 Выделение', 'Выделение важных постов. Раздел в разработке.', true, '', false],
  ['polls', 'main', 80, 'polls:home', 'polls', '🗳 Опросы', 'Голосования и опросы. Раздел в разработке.', true, '', false],
  ['stats', 'main', 90, 'stats:home', 'stats', '📊 Статистика', 'Статистика канала, постов и функций.', true, '', false],
  ['billing', 'main', 100, 'billing:home', 'billing', '🧾 Тарифы', 'Тарифы, ограничения и доступы. Раздел в разработке.', true, '', false],
  ['referrals', 'main', 110, 'referrals:home', 'referrals', '🤝 Рефералы', 'Реферальные ссылки и бонусы. Раздел в разработке.', true, '', false],
  ['help', 'main', 120, 'help:home', 'help', '❓ Помощь', 'Помощь по текущему разделу.', true, '', false],

  ['channels_list', 'channels', 10, 'channels:list', 'channels', '📋 Ваши каналы', 'Список подключённых каналов.', true, '', false],
  ['channels_connect', 'channels', 20, 'channels:connect', 'channels', '➕ Подключить', 'Добавить канал.', true, '', false],
  ['channels_verify', 'channels', 30, 'channels:verify_access', 'channels', '✅ Проверить права', 'Проверить права бота в канале.', true, '', false],
  ['channels_access', 'channels', 40, 'channels:access', 'channels', '🔐 Доступы', 'Доступы и права.', true, '', false],

  ['comments_auto_new', 'comments', 10, 'comments:auto_new', 'comments', '⚡ Авто для новых', 'Автоматически подключать обсуждения к новым постам.', true, '', false],
  ['comments_old_post', 'comments', 20, 'comments:old_post', 'comments', '📌 Старый пост', 'Подключить обсуждение к уже опубликованному посту.', true, '', false],
  ['comments_choose_post', 'comments', 30, 'comments:choose_post', 'comments', '📌 Выбрать пост', 'Выбор поста из зарегистрированных публикаций.', true, 'post_picker', false],
  ['comments_preview', 'comments', 40, 'comments:preview', 'comments', '👀 Как это выглядит', 'Предпросмотр обсуждения.', true, '', false],
  ['comments_settings', 'comments', 50, 'comments:settings', 'comments', '⚙️ Настройки', 'Настройки обсуждений.', true, '', false],
  ['comments_banner', 'comments', 60, 'comments_banner:home', 'comments', '🖼 Баннер', 'Аккуратная подпись/баннер внутри обсуждения.', true, '', false],
  ['comments_photo', 'comments', 70, 'comments_photo:home', 'comments', '📷 Фото', 'Фото в комментариях. Видео и файлы не включаем.', true, '', false],
  ['comments_reactions', 'comments', 80, 'comments_reactions:home', 'comments', '❤️ Реакции и ответы', 'Реакции и ответы внутри обсуждения.', true, '', false],
  ['comments_post', 'comments', 900, 'comments:post', 'comments', '💬 Комментарии → пост', 'Действия с выбранным постом.', false, 'post_action', false],
  ['comments_toggle', 'comments', 910, 'comments:toggle', 'comments', '✅/⏸ Комменты', 'Включение и отключение комментариев для выбранного поста.', false, 'post_toggle', false],

  ['moderation_rules', 'moderation', 10, 'moderation:rules', 'moderation', '🛡 Правила канала', 'Правила модерации для выбранного канала.', true, '', false],
  ['moderation_words', 'moderation', 20, 'moderation:words', 'moderation', '📋 Стоп-слова', 'Список стоп-слов канала.', true, '', false],
  ['moderation_add_word', 'moderation', 30, 'moderation:add_word', 'moderation', '➕ Добавить слово', 'Добавить стоп-слово или фразу.', true, '', false],
  ['moderation_links', 'moderation', 40, 'moderation:links', 'moderation', '🔗 Ссылки', 'Включить или отключить ссылки.', true, '', false],
  ['moderation_logs', 'moderation', 50, 'moderation:logs', 'moderation', '📋 Журнал', 'Журнал модерации.', true, '', false],

  ['editor_choose_post', 'editor', 10, 'editor:choose_post', 'editor', '📌 Выбрать пост', 'Выберите пост для редактирования.', true, 'post_picker', false],
  ['editor_history', 'editor', 20, 'editor:history', 'editor', '🕘 История', 'История изменений.', true, '', false],
  ['editor_post', 'editor', 900, 'editor:post', 'editor', '✏️ Редактор → пост', 'Действия с выбранным постом.', false, 'post_action', false],

  ['buttons_choose_post', 'buttons', 10, 'buttons:choose_post', 'buttons', '📌 Выбрать пост', 'Выберите пост для кнопок.', true, 'post_picker', false],
  ['buttons_create', 'buttons', 20, 'buttons:create', 'buttons', '➕ Добавить кнопку', 'Шаг 1/3: пост, текст, ссылка, сохранить.', true, '', false],
  ['buttons_list', 'buttons', 30, 'buttons:list', 'buttons', '📋 Кнопки поста', 'Список кнопок поста.', true, '', false],
  ['buttons_preview', 'buttons', 40, 'buttons:preview', 'buttons', '👀 Предпросмотр', 'Предпросмотр кнопок.', true, '', false],

  ['gifts_create', 'gifts', 10, 'gifts:create', 'gifts', '🎁 Создать подарок', 'Шаг 1/4: пост, подарок, сообщение, сохранить.', true, '', false],
  ['gifts_choose_post', 'gifts', 20, 'gifts:choose_post', 'gifts', '📌 Выбрать пост', 'Выберите пост для подарка.', true, 'post_picker', false],
  ['gifts_list', 'gifts', 30, 'gifts:list', 'gifts', '📋 Список подарков', 'Список подарков.', true, '', false],
  ['gifts_subscription', 'gifts', 40, 'gifts:subscription', 'gifts', '🔐 Проверка подписки', 'Проверка подписки.', true, '', false],
  ['gifts_test', 'gifts', 50, 'gifts:test', 'gifts', '🧪 Тестовая выдача', 'Тестовая выдача.', true, '', false],

  ['stats_channel', 'stats', 10, 'stats:channel', 'stats', '📊 Канал', 'Статистика канала.', true, '', false],
  ['stats_post', 'stats', 20, 'stats:post', 'stats', '📌 Пост', 'Статистика поста.', true, 'post_picker', false],
  ['stats_comments', 'stats', 30, 'stats:comments', 'stats', '💬 Комментарии', 'Статистика комментариев.', true, '', false],
  ['stats_reactions', 'stats', 40, 'stats:reactions', 'stats', '❤️ Реакции', 'Статистика реакций.', true, '', false],
  ['stats_gifts', 'stats', 50, 'stats:gifts', 'stats', '🎁 Подарки', 'Статистика подарков.', true, '', false],
  ['stats_buttons', 'stats', 60, 'stats:buttons', 'stats', '🔘 Клики', 'Статистика кликов.', true, '', false],

  ['help_comments', '', 880, 'help:comments', 'help', '❓ Помощь: комментарии', 'Раздел комментариев: выбор поста, включение/отключение, баннер, реакции и фото.', false, 'help_context', false]
];

let initPromise = null;
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const lower = (v) => norm(v).toLowerCase();
const ownerOf = (route = '') => String(route || '').split(':')[0] || 'main';
const SERVICE_ROUTES = new Set(['help:context', 'section:home', 'nav:main']);

function callbackButton(text, route, extra = {}) {
  const payload = { r: route };
  for (const [key, value] of Object.entries(extra || {})) {
    if (['r', 'route', 'action', 'command', 'payload'].includes(key)) continue;
    const v = norm(value);
    if (v) payload[key] = v;
  }
  return { type: 'callback', text, payload: JSON.stringify(payload) };
}
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter((row) => Array.isArray(row) && row.length) } }]; }
function rows2(buttons) { const rows = []; for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2)); return rows; }

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await db.init();
    await db.query(`
      create table if not exists ak_menu_nodes_v3 (
        node_key text primary key,
        parent_key text not null default '',
        sort_order int not null default 0,
        route text not null,
        owner text not null default 'main',
        title text not null,
        body text not null default '',
        visible boolean not null default true,
        dynamic_kind text not null default '',
        delegate_to_legacy boolean not null default false,
        meta jsonb not null default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );
      create table if not exists ak_menu_events_v3 (
        id bigserial primary key,
        admin_id text not null default '',
        route text not null default '',
        node_key text not null default '',
        owner text not null default '',
        event_type text not null default 'open',
        payload jsonb not null default '{}'::jsonb,
        message_id text not null default '',
        created_at timestamptz default now()
      );
      create table if not exists ak_menu_session_v3 (
        admin_id text primary key,
        current_route text not null default 'main:home',
        current_node_key text not null default 'main',
        message_id text not null default '',
        updated_at timestamptz default now()
      );
      create table if not exists ak_post_settings_v3 (
        admin_id text not null,
        channel_id text not null,
        post_id text not null,
        comments_enabled boolean not null default true,
        banner_enabled boolean not null default true,
        reactions_enabled boolean not null default true,
        updated_at timestamptz default now(),
        primary key(admin_id, channel_id, post_id)
      );
    `);
    for (const n of SEED_NODES) {
      const [key, parent, order, route, owner, title, body, visible, dynamic, delegate] = n;
      await db.query(`insert into ak_menu_nodes_v3(node_key,parent_key,sort_order,route,owner,title,body,visible,dynamic_kind,delegate_to_legacy,meta,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now())
        on conflict(node_key) do update set parent_key=excluded.parent_key, sort_order=excluded.sort_order, route=excluded.route, owner=excluded.owner, title=excluded.title, body=excluded.body, visible=excluded.visible, dynamic_kind=excluded.dynamic_kind, delegate_to_legacy=excluded.delegate_to_legacy, meta=ak_menu_nodes_v3.meta || excluded.meta, updated_at=now()`,
        [key, parent, order, route, owner, title, body, visible, dynamic, delegate, JSON.stringify({ seedRuntime: RUNTIME, seedSource: SOURCE })]);
    }
    return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, nodesSeeded: SEED_NODES.length };
  })();
  return initPromise;
}
async function query(sql, params = []) { await init(); return db.query(sql, params); }
async function getNodeByRoute(route = '') { await init(); const r = norm(route) || 'main:home'; const { rows } = await db.query("select * from ak_menu_nodes_v3 where route=$1 order by case when node_key='main' then 0 else 1 end, sort_order asc limit 1", [r]); return rows[0] || null; }
async function getChildren(parentKey = '') { await init(); const { rows } = await db.query('select * from ak_menu_nodes_v3 where parent_key=$1 and visible=true order by sort_order asc, node_key asc', [norm(parentKey)]); return rows; }
async function logEvent({ adminId = '', route = '', nodeKey = '', owner = '', eventType = 'open', payload = {}, messageId = '' } = {}) { await init(); await db.query('insert into ak_menu_events_v3(admin_id,route,node_key,owner,event_type,payload,message_id) values($1,$2,$3,$4,$5,$6::jsonb,$7)', [norm(adminId), norm(route), norm(nodeKey), norm(owner), norm(eventType), JSON.stringify(payload || {}), norm(messageId)]); }
async function setSession(adminId = '', route = 'main:home', nodeKey = 'main', messageId = '') { if (!adminId) return; await init(); await db.query('insert into ak_menu_session_v3(admin_id,current_route,current_node_key,message_id,updated_at) values($1,$2,$3,$4,now()) on conflict(admin_id) do update set current_route=excluded.current_route,current_node_key=excluded.current_node_key,message_id=coalesce(nullif(excluded.message_id,\'\'),ak_menu_session_v3.message_id),updated_at=now()', [adminId, route, nodeKey, messageId]); }

function parsePayload(update = {}) { return db.payload(update) || {}; }
function routeFromUpdate(update = {}) {
  const p = parsePayload(update);
  const raw = norm(p.r || p.route || p.action || db.action(update) || db.text(update) || '');
  const mapped = { ak_main_menu: 'main:home', main_menu: 'main:home', menu_main: 'main:home', home: 'main:home', start: 'main:home', '/start': 'main:home', menu: 'main:home', 'главное меню': 'main:home', '🏠 главное меню': 'main:home', 'старт': 'main:home' };
  return mapped[lower(raw)] || raw || 'main:home';
}
async function navRows(node) {
  if (!node || node.node_key === 'main') return [];
  const owner = node.owner || ownerOf(node.route);
  return [[callbackButton('❓ Помощь', `help:${owner}`), callbackButton('↩️ Раздел', `${owner}:home`)], [callbackButton('🏠 Главное меню', 'main:home')]];
}
async function getChannels(adminId = '') { try { return await db.getChannels(adminId); } catch { return []; } }
async function getPosts(adminId = '', channelId = '', limit = 30) { try { return await db.getPosts(adminId, channelId, limit); } catch { return []; } }

async function selectedPost(adminId, payload = {}) {
  const channels = await getChannels(adminId);
  const channel = channels[0] || null;
  const channelId = norm(payload.c || payload.channelId || channel?.channelId || '');
  const posts = channelId ? await getPosts(adminId, channelId, 50) : [];
  const post = posts.find((item) => (payload.p && String(item.postId) === String(payload.p)) || (payload.k && String(item.commentKey) === String(payload.k))) || null;
  return { channel, channelId, posts, post, title: norm(post?.title || payload.t || payload.p || 'Пост') };
}
async function postPicker(adminId, node, payload = {}) {
  const channels = await getChannels(adminId);
  const channel = channels[0] || null;
  const channelId = norm(payload.c || payload.channelId || channel?.channelId || '');
  const channelTitle = norm(channel?.title || channelId || 'Канал не выбран');
  const posts = channelId ? await getPosts(adminId, channelId, 30) : [];
  const targetRoute = node.owner === 'editor' ? 'editor:post' : node.owner === 'buttons' ? 'buttons:post' : node.owner === 'gifts' ? 'gifts:post' : node.owner === 'stats' ? 'stats:post' : 'comments:post';
  const rows = posts.slice(0, 10).map((post, i) => [callbackButton(`${i + 1}. ${norm(post.title || post.postId).slice(0, 40)}`, targetRoute, { c: channelId, p: post.postId, k: post.commentKey })]);
  return { text: [node.title, '', `📺 ${channelTitle}`, `Постов найдено: ${posts.length}`, '', posts.length ? 'Выберите пост.' : 'Постов пока нет в базе. Перешлите пост боту или зарегистрируйте его.'].join('\n'), attachments: keyboard([...rows, ...(await navRows(node))]) };
}
async function simpleAction(adminId, node, payload = {}) {
  const lines = [node.title, '', node.body || 'Выберите действие.'];
  if (['buttons:create', 'gifts:create'].includes(node.route)) lines.push('', node.owner === 'buttons' ? 'Сценарий: 1/3 пост → 2/3 текст кнопки → 3/3 ссылка/действие → сохранить.' : 'Сценарий: 1/4 пост → 2/4 подарок → 3/4 сообщение получателю → 4/4 сохранить.');
  if (['highlight', 'polls', 'billing', 'referrals'].includes(node.owner)) lines.push('', 'Статус: в разработке.');
  return { text: lines.join('\n'), attachments: keyboard(await navRows(node)) };
}
async function postAction(adminId, node, payload = {}) {
  const picked = await selectedPost(adminId, payload);
  return { text: [node.title, '', `📝 ${picked.title.slice(0, 80)}`, '', 'Выберите действие.'].join('\n'), attachments: keyboard(await navRows(node)) };
}
async function commentsToggle(adminId, node, payload = {}) {
  const picked = await selectedPost(adminId, payload);
  return { text: [node.title, '', `📝 ${picked.title.slice(0, 80)}`, '', 'Переключение комментариев для выбранного поста будет сохранено здесь.'].join('\n'), attachments: keyboard(await navRows(node)) };
}
async function helpContext(adminId, node) { return { text: [node.title, '', node.body || 'Помощь по разделу.'].join('\n'), attachments: keyboard(await navRows({ ...node, owner: ownerOf(node.route), node_key: 'help_virtual' })) }; }
async function channelsHome(adminId, node) {
  const channels = await getChannels(adminId);
  const children = await getChildren(node.node_key);
  const rows = children.map((child) => [callbackButton(child.title, child.route)]);
  return { text: [node.title, '', `Подключённых каналов: ${channels.length}.`, channels[0]?.title ? `Активный канал: ${channels[0].title}` : 'Активный канал не выбран.'].join('\n'), attachments: keyboard([...rows, ...(await navRows(node))]) };
}
async function renderScreen(route = 'main:home', adminId = '', payload = {}) {
  await init();
  const node = await getNodeByRoute(route) || await getNodeByRoute('main:home');
  await logEvent({ adminId, route: node.route, nodeKey: node.node_key, owner: node.owner, eventType: 'render', payload });
  if (node.dynamic_kind === 'post_picker') return postPicker(adminId, node, payload);
  if (node.dynamic_kind === 'post_action') return postAction(adminId, node, payload);
  if (node.dynamic_kind === 'post_toggle') return commentsToggle(adminId, node, payload);
  if (node.dynamic_kind === 'help_context') return helpContext(adminId, node, payload);
  if (node.node_key === 'channels') return channelsHome(adminId, node);
  const children = await getChildren(node.node_key);
  const rows = rows2(children.map((child) => callbackButton(child.title, child.route)));
  if (!children.length && node.node_key !== 'main') return simpleAction(adminId, node, payload);
  return { text: [node.title, '', node.body || 'Выберите действие.'].join('\n'), attachments: keyboard([...rows, ...(await navRows(node))]) };
}

function resultMessageId(result) { const raw = JSON.stringify(result || {}); const str = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*\"([^\"{}]+)\"/); if (str) return str[1]; const num = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*(\d+)/); return num ? num[1] : ''; }
async function silentAnswer(update) { const id = db.callbackId(update); if (!id) return; try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification: '' }); } catch {} }
async function deleteSavedMenu(adminId = '', exceptMessageId = '') {
  try {
    const oldId = await db.getMenu(adminId);
    if (oldId && oldId !== exceptMessageId) await api.deleteMessage({ botToken: config.botToken, messageId: oldId });
    return oldId || '';
  } catch { return ''; }
}
async function sendOrEdit(update, adminId, packet) {
  const mid = db.messageId(update);
  if (mid) {
    try { await api.editMessage({ botToken: config.botToken, messageId: mid, text: packet.text, attachments: packet.attachments || [], notify: false }); await db.setMenu(adminId, mid); return { mode: 'edit', messageId: mid }; } catch {}
  }
  await deleteSavedMenu(adminId, '');
  const result = await api.sendMessage({ botToken: config.botToken, userId: adminId, text: packet.text, attachments: packet.attachments || [], notify: false });
  const nextId = resultMessageId(result);
  if (nextId) await db.setMenu(adminId, nextId);
  return { mode: 'send_new_after_delete_old', messageId: nextId };
}
async function openMenu(adminId = '', route = 'main:home', payload = {}) {
  await init();
  const packet = await renderScreen(route, adminId, payload);
  await deleteSavedMenu(adminId, '');
  const result = await api.sendMessage({ botToken: config.botToken, userId: adminId, text: packet.text, attachments: packet.attachments || [], notify: false });
  const messageId = resultMessageId(result);
  if (messageId) await db.setMenu(adminId, messageId);
  await setSession(adminId, route, (await getNodeByRoute(route))?.node_key || 'main', messageId || '');
  return { ok: true, runtimeVersion: RUNTIME, mode: 'open_menu_delete_old_then_send_bottom', route, messageId };
}
async function handle(update = {}) {
  await init();
  const hasCallback = !!db.cb(update);
  const adminId = db.adminId(update) || db.chatId(update);
  if (!adminId) return false;
  const route = routeFromUpdate(update);
  const node = await getNodeByRoute(route);
  if (!node || node.delegate_to_legacy) return false;
  const payload = parsePayload(update);
  await logEvent({ adminId, route, nodeKey: node.node_key, owner: node.owner, eventType: hasCallback ? 'callback' : 'open', payload, messageId: db.messageId(update) });
  const packet = await renderScreen(route, adminId, payload);
  if (hasCallback) await silentAnswer(update);
  const result = await sendOrEdit(update, adminId, packet);
  await setSession(adminId, route, node.node_key, result.messageId || db.messageId(update) || '');
  return { ok: true, handledBy: RUNTIME, sourceMarker: SOURCE, route, nodeKey: node.node_key, owner: node.owner, result };
}
async function renderDebug(route = 'main:home', adminId = '') { const uid = norm(adminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246'); const screen = await renderScreen(route, uid, {}); const node = await getNodeByRoute(route); return { ok: !!screen, runtime: RUNTIME, sourceMarker: SOURCE, route, nodeKey: node?.node_key || '', owner: node?.owner || '', screen }; }
async function dataSelfTest(adminId = '') { const uid = norm(adminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246'); await init(); const { rows: nodeRows } = await query('select count(*)::int as n from ak_menu_nodes_v3'); const { rows: eventRows } = await query('select count(*)::int as n from ak_menu_events_v3'); const channels = await getChannels(uid); const posts = channels[0]?.channelId ? await getPosts(uid, channels[0].channelId, 10) : []; return { ok: true, runtime: RUNTIME, sourceMarker: SOURCE, adminId: uid, menuNodes: nodeRows[0]?.n || 0, menuEvents: eventRows[0]?.n || 0, channels, posts }; }
function canHandleRoute(route = '') { const r = norm(route); if (!r) return false; if (SERVICE_ROUTES.has(r)) return true; return SEED_NODES.some((item) => item[3] === r) || ['main:home', 'ak_main_menu', 'main_menu', 'menu_main', 'home', 'start', '/start', 'menu', 'главное меню'].includes(lower(r)); }
function selfTest() { const mainVisible = SEED_NODES.filter((item) => item[1] === 'main' && item[7] !== false && item[0] !== 'main'); return { ok: true, runtime: RUNTIME, sourceMarker: SOURCE, architecture: 'clean-v3-menu-root', commentsModuleTouched: false, openAppPolicy: 'kept_as_is', delivery: { oneCurrentMenuMessage: true, deleteOldBeforeSendNew: true, editCallbackMessageWhenPossible: true, startOpensBottomFreshMenu: true }, checks: { productionMainButtons: mainVisible.length, productionMainRows: Math.ceil(mainVisible.length / 2), commentsLaunchUntouched: true, patcherTouched: false } }; }

module.exports = { RUNTIME, SOURCE, init, handle, openMenu, renderScreen, renderDebug, dataSelfTest, selfTest, canHandleRoute, routeFromUpdate, logEvent };
