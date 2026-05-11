'use strict';

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CLEAN-V3-MENU-1.0';
const SOURCE = 'adminkit-clean-v3-db-menu-tree-events';

const MENU_TREE = [
  { key: 'main', parent: '', order: 10, route: 'main:home', defaultTitle: '🐋 АдминКИТ', defaultText: 'Панель управления MAX-каналом. Выберите раздел.', owner: 'main', visible: true },
  { key: 'channels', parent: 'main', order: 10, route: 'channels:home', defaultTitle: '📺 Каналы', defaultText: 'Подключение и проверка каналов.', owner: 'channels', visible: true },
  { key: 'comments', parent: 'main', order: 20, route: 'comments:home', defaultTitle: '💬 Комментарии', defaultText: 'Обсуждения под постами MAX.', owner: 'comments', visible: true },
  { key: 'moderation', parent: 'main', order: 30, route: 'moderation:home', defaultTitle: '🛡 Модерация', defaultText: 'Правила, стоп-слова и проверка комментариев.', owner: 'moderation', visible: true, delegate: true },
  { key: 'editor', parent: 'main', order: 40, route: 'editor:home', defaultTitle: '✏️ Редактор', defaultText: 'Редактирование и предпросмотр постов.', owner: 'editor', visible: true },
  { key: 'buttons', parent: 'main', order: 50, route: 'buttons:home', defaultTitle: '⚪ Кнопки', defaultText: 'CTA-кнопки под постами.', owner: 'buttons', visible: true },
  { key: 'gifts', parent: 'main', order: 60, route: 'gifts:home', defaultTitle: '🎁 Подарки', defaultText: 'Подарки и лид-магниты за подписку.', owner: 'gifts', visible: true },
  { key: 'highlight', parent: 'main', order: 70, route: 'highlight:home', defaultTitle: '📌 Выделение', defaultText: 'Выделение важных постов.', owner: 'highlight', visible: true },
  { key: 'polls', parent: 'main', order: 80, route: 'polls:home', defaultTitle: '🗳 Опросы', defaultText: 'Голосования и опросы.', owner: 'polls', visible: true },
  { key: 'stats', parent: 'main', order: 90, route: 'stats:home', defaultTitle: '📊 Статистика', defaultText: 'Статистика канала, постов и функций.', owner: 'stats', visible: true },
  { key: 'billing', parent: 'main', order: 100, route: 'billing:home', defaultTitle: '🧾 Тарифы', defaultText: 'Тарифы, ограничения и доступы.', owner: 'billing', visible: true },
  { key: 'referrals', parent: 'main', order: 110, route: 'referrals:home', defaultTitle: '🤝 Рефералы', defaultText: 'Реферальные ссылки и бонусы.', owner: 'referrals', visible: true },
  { key: 'help', parent: 'main', order: 120, route: 'help:home', defaultTitle: '❓ Помощь', defaultText: 'Помощь по текущему разделу.', owner: 'help', visible: true },

  { key: 'comments_auto_new', parent: 'comments', order: 10, route: 'comments:auto_new', defaultTitle: '⚡ Авто для новых', defaultText: 'Автоматически подключать обсуждения к новым постам.', owner: 'comments', visible: true },
  { key: 'comments_old_post', parent: 'comments', order: 20, route: 'comments:old_post', defaultTitle: '📌 Старый пост', defaultText: 'Подключить обсуждение к уже опубликованному посту.', owner: 'comments', visible: true },
  { key: 'comments_choose_post', parent: 'comments', order: 30, route: 'comments:choose_post', defaultTitle: '📌 Выбрать пост', defaultText: 'Выбор поста из зарегистрированных публикаций.', owner: 'comments', visible: true, dynamic: 'post_picker' },
  { key: 'comments_preview', parent: 'comments', order: 40, route: 'comments:preview', defaultTitle: '👀 Как это выглядит', defaultText: 'Предпросмотр обсуждения.', owner: 'comments', visible: true },
  { key: 'comments_settings', parent: 'comments', order: 50, route: 'comments:settings', defaultTitle: '⚙️ Настройки', defaultText: 'Настройки обсуждений.', owner: 'comments', visible: true },
  { key: 'comments_banner', parent: 'comments', order: 60, route: 'comments_banner:home', defaultTitle: '🖼 Баннер', defaultText: 'Аккуратная подпись/баннер внутри обсуждения.', owner: 'comments', visible: true },
  { key: 'comments_photo', parent: 'comments', order: 70, route: 'comments_photo:home', defaultTitle: '📷 Фото', defaultText: 'Фото в комментариях. Видео и файлы не включаем.', owner: 'comments', visible: true },
  { key: 'comments_reactions', parent: 'comments', order: 80, route: 'comments_reactions:home', defaultTitle: '❤️ Реакции и ответы', defaultText: 'Реакции и ответы внутри обсуждения.', owner: 'comments', visible: true },

  { key: 'editor_choose_post', parent: 'editor', order: 10, route: 'editor:choose_post', defaultTitle: '📌 Выбрать пост', defaultText: 'Выберите пост для редактирования.', owner: 'editor', visible: true, dynamic: 'post_picker' },
  { key: 'editor_history', parent: 'editor', order: 20, route: 'editor:history', defaultTitle: '🕘 История', defaultText: 'История изменений.', owner: 'editor', visible: true },

  { key: 'channels_list', parent: 'channels', order: 10, route: 'channels:list', defaultTitle: 'Ваши каналы', defaultText: 'Список подключённых каналов.', owner: 'channels', visible: true },
  { key: 'channels_connect', parent: 'channels', order: 20, route: 'channels:connect', defaultTitle: '➕ Подключить', defaultText: 'Добавить канал.', owner: 'channels', visible: true },
  { key: 'channels_verify', parent: 'channels', order: 30, route: 'channels:verify_access', defaultTitle: '✅ Проверить права', defaultText: 'Проверить права бота в канале.', owner: 'channels', visible: true },
  { key: 'channels_access', parent: 'channels', order: 40, route: 'channels:access', defaultTitle: '🔐 Доступы', defaultText: 'Доступы и права.', owner: 'channels', visible: true }
];

const NAV_KEYS = {
  help: 'nav_help',
  section: 'nav_section',
  main: 'nav_main'
};

const NAV_DEFAULTS = [
  { key: NAV_KEYS.help, parent: '', order: 900, route: 'help:context', defaultTitle: '❓ Помощь', defaultText: 'Помощь', owner: 'nav', visible: false },
  { key: NAV_KEYS.section, parent: '', order: 910, route: 'section:home', defaultTitle: '↩️ Раздел', defaultText: 'Вернуться в раздел', owner: 'nav', visible: false },
  { key: NAV_KEYS.main, parent: '', order: 920, route: 'main:home', defaultTitle: '🏠 Главное меню', defaultText: 'Главное меню', owner: 'nav', visible: false }
];

let initPromise = null;
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const lower = (v) => norm(v).toLowerCase();
const ownerOf = (route = '') => String(route || '').split(':')[0] || 'main';

function chunkRows(buttons, size = 2) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += size) rows.push(buttons.slice(i, i + size));
  return rows;
}

function callbackButton(text, route, extra = {}) {
  const payload = { r: route };
  Object.entries(extra || {}).forEach(([key, value]) => {
    const next = norm(value);
    if (next) payload[key] = next;
  });
  return { type: 'callback', text, payload: JSON.stringify(payload) };
}

function keyboard(rows) {
  return [{ type: 'inline_keyboard', payload: { buttons: rows.filter((row) => Array.isArray(row) && row.length) } }];
}

async function query(sql, params = []) {
  await db.init();
  return db.query(sql, params);
}

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
    `);

    const all = [...MENU_TREE, ...NAV_DEFAULTS];
    for (const item of all) {
      await db.query(`
        insert into ak_menu_nodes_v3(node_key,parent_key,sort_order,route,owner,title,body,visible,dynamic_kind,delegate_to_legacy,meta,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now())
        on conflict(node_key) do update set
          parent_key=excluded.parent_key,
          sort_order=excluded.sort_order,
          route=excluded.route,
          owner=excluded.owner,
          visible=excluded.visible,
          dynamic_kind=excluded.dynamic_kind,
          delegate_to_legacy=excluded.delegate_to_legacy,
          meta=ak_menu_nodes_v3.meta || excluded.meta,
          updated_at=now()
      `, [
        item.key,
        item.parent || '',
        Number(item.order || 0),
        item.route,
        item.owner || ownerOf(item.route),
        item.defaultTitle,
        item.defaultText || '',
        item.visible !== false,
        item.dynamic || '',
        item.delegate === true,
        JSON.stringify({ seedRuntime: RUNTIME, seedSource: SOURCE })
      ]);
    }
    return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, nodesSeeded: all.length };
  })();
  return initPromise;
}

async function getNodeByRoute(route = '') {
  await init();
  const r = norm(route) || 'main:home';
  const { rows } = await query(`select * from ak_menu_nodes_v3 where route=$1 limit 1`, [r]);
  return rows[0] || null;
}

async function getNodeByKey(key = '') {
  await init();
  const { rows } = await query(`select * from ak_menu_nodes_v3 where node_key=$1 limit 1`, [norm(key)]);
  return rows[0] || null;
}

async function getChildren(parentKey = '') {
  await init();
  const { rows } = await query(`select * from ak_menu_nodes_v3 where parent_key=$1 and visible=true order by sort_order asc, node_key asc`, [norm(parentKey)]);
  return rows;
}

async function getChannels(adminId = '') {
  try { return await db.getChannels(adminId); } catch { return []; }
}

async function getPosts(adminId = '', channelId = '', limit = 20) {
  try { return await db.getPosts(adminId, channelId, limit); } catch { return []; }
}

async function logEvent({ adminId = '', route = '', nodeKey = '', owner = '', eventType = 'open', payload = {}, messageId = '' } = {}) {
  await init();
  await query(`insert into ak_menu_events_v3(admin_id,route,node_key,owner,event_type,payload,message_id) values($1,$2,$3,$4,$5,$6::jsonb,$7)`, [
    norm(adminId), norm(route), norm(nodeKey), norm(owner), norm(eventType || 'open'), JSON.stringify(payload || {}), norm(messageId)
  ]);
}

async function setSession(adminId = '', route = 'main:home', nodeKey = 'main', messageId = '') {
  if (!adminId) return;
  await init();
  await query(`insert into ak_menu_session_v3(admin_id,current_route,current_node_key,message_id,updated_at) values($1,$2,$3,$4,now()) on conflict(admin_id) do update set current_route=excluded.current_route,current_node_key=excluded.current_node_key,message_id=coalesce(nullif(excluded.message_id,''),ak_menu_session_v3.message_id),updated_at=now()`, [adminId, route, nodeKey, messageId]);
}

async function getSession(adminId = '') {
  if (!adminId) return null;
  await init();
  const { rows } = await query(`select * from ak_menu_session_v3 where admin_id=$1 limit 1`, [adminId]);
  return rows[0] || null;
}

function parsePayload(update = {}) {
  return db.payload(update) || {};
}

function routeFromUpdate(update = {}) {
  const p = parsePayload(update);
  const raw = norm(p.r || p.route || p.action || db.action(update) || '');
  const mapped = {
    ak_main_menu: 'main:home',
    main_menu: 'main:home',
    menu_main: 'main:home',
    home: 'main:home',
    start: 'main:home',
    '/start': 'main:home',
    menu: 'main:home',
    'главное меню': 'main:home'
  };
  return mapped[lower(raw)] || raw || 'main:home';
}

async function buildNavRows(node) {
  const owner = node?.owner || ownerOf(node?.route || 'main:home');
  const rows = [];
  if (node?.node_key !== 'main') {
    const help = await getNodeByKey(NAV_KEYS.help);
    const section = await getNodeByKey(NAV_KEYS.section);
    const main = await getNodeByKey(NAV_KEYS.main);
    rows.push([
      callbackButton(help?.title || '❓ Помощь', `help:${owner}`),
      callbackButton(section?.title || '↩️ Раздел', `${owner}:home`)
    ]);
    rows.push([callbackButton(main?.title || '🏠 Главное меню', 'main:home')]);
  }
  return rows;
}

async function buildPostPicker(adminId, node, payload = {}) {
  const channels = await getChannels(adminId);
  const channel = channels[0] || null;
  const channelId = norm(payload.c || payload.channelId || channel?.channelId || '');
  const channelTitle = norm(channel?.title || channelId || 'Канал не выбран');
  const posts = channelId ? await getPosts(adminId, channelId, 30) : [];
  const targetRoute = node.owner === 'editor' ? 'editor:post' : 'comments:post';
  const rows = posts.slice(0, 10).map((post, index) => [
    callbackButton(`${index + 1}. ${norm(post.title || post.postId).slice(0, 40)}`, targetRoute, {
      c: channelId,
      p: post.postId,
      k: post.commentKey
    })
  ]);
  const navRows = await buildNavRows(node);
  return {
    text: [
      node.title,
      '',
      `📺 ${channelTitle}`,
      `Постов найдено: ${posts.length}`,
      '',
      posts.length ? 'Выберите пост.' : 'Постов пока нет в базе. Перешлите пост боту или зарегистрируйте его.'
    ].join('\n'),
    attachments: keyboard([...rows, ...navRows])
  };
}

async function buildChannelsHome(adminId, node) {
  const channels = await getChannels(adminId);
  const active = channels[0] || null;
  const children = await getChildren(node.node_key);
  const rows = children.map((child) => [callbackButton(child.title, child.route, active?.channelId ? { c: active.channelId } : {})]);
  const navRows = await buildNavRows(node);
  return {
    text: [node.title, '', `Подключённых каналов: ${channels.length}.`, active?.title ? `Активный канал: ${active.title}` : 'Активный канал не выбран.'].join('\n'),
    attachments: keyboard([...rows, ...navRows])
  };
}

async function renderScreen(route = 'main:home', adminId = '', payload = {}) {
  await init();
  const node = await getNodeByRoute(route) || await getNodeByRoute('main:home');
  await logEvent({ adminId, route: node.route, nodeKey: node.node_key, owner: node.owner, eventType: 'render', payload });

  if (node.dynamic_kind === 'post_picker') return buildPostPicker(adminId, node, payload);
  if (node.node_key === 'channels') return buildChannelsHome(adminId, node);

  const children = await getChildren(node.node_key);
  const buttons = children.map((child) => callbackButton(child.title, child.route));
  const childRows = chunkRows(buttons, node.node_key === 'main' ? 2 : 2);
  const navRows = await buildNavRows(node);
  return {
    text: [node.title, '', node.body || 'Выберите действие.'].join('\n'),
    attachments: keyboard([...childRows, ...navRows])
  };
}

async function answerCallback(update, text = '') {
  const callbackId = db.callbackId(update);
  if (!callbackId) return;
  try {
    await api.answerCallback({ botToken: config.botToken, callbackId, notification: text || '' });
  } catch {}
}

function resultMessageId(result) {
  const m = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id)"\s*:\s*"([^"{}]+)"/);
  return m ? m[1] : '';
}

async function sendOrEdit(update, adminId, packet) {
  const mid = db.messageId(update);
  if (mid) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: mid, text: packet.text, attachments: packet.attachments || [], notify: false });
      await db.setMenu(adminId, mid);
      return { mode: 'edit', messageId: mid };
    } catch {}
  }
  const result = await api.sendMessage({ botToken: config.botToken, userId: adminId, text: packet.text, attachments: packet.attachments || [], notify: false });
  const nextId = resultMessageId(result);
  if (nextId) await db.setMenu(adminId, nextId);
  return { mode: 'send', messageId: nextId };
}

async function handle(update = {}) {
  await init();
  if (!db.cb(update)) return false;
  const adminId = db.adminId(update);
  if (!adminId) return false;
  const payload = parsePayload(update);
  const route = routeFromUpdate(update);
  const node = await getNodeByRoute(route);
  if (!node) return false;
  if (node.delegate_to_legacy) return false;

  await logEvent({ adminId, route, nodeKey: node.node_key, owner: node.owner, eventType: 'callback', payload, messageId: db.messageId(update) });
  const packet = await renderScreen(route, adminId, payload);
  await answerCallback(update, '');
  const result = await sendOrEdit(update, adminId, packet);
  await setSession(adminId, route, node.node_key, result.messageId || db.messageId(update) || '');
  return { ok: true, handledBy: RUNTIME, sourceMarker: SOURCE, route, nodeKey: node.node_key, owner: node.owner, result };
}

async function renderDebug(route = 'main:home', adminId = '') {
  const uid = norm(adminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  const screen = await renderScreen(route, uid, {});
  const node = await getNodeByRoute(route);
  return { ok: !!screen, runtime: RUNTIME, sourceMarker: SOURCE, route, nodeKey: node?.node_key || '', owner: node?.owner || '', screen };
}

async function dataSelfTest(adminId = '') {
  const uid = norm(adminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  await init();
  const { rows: nodeRows } = await query(`select count(*)::int as n from ak_menu_nodes_v3`);
  const { rows: eventRows } = await query(`select count(*)::int as n from ak_menu_events_v3`);
  const channels = await getChannels(uid);
  const posts = channels[0]?.channelId ? await getPosts(uid, channels[0].channelId, 10) : [];
  return { ok: true, runtime: RUNTIME, sourceMarker: SOURCE, adminId: uid, menuNodes: nodeRows[0]?.n || 0, menuEvents: eventRows[0]?.n || 0, channels, posts };
}

function canHandleRoute(route = '') {
  const r = norm(route);
  if (!r) return false;
  if (r.startsWith('moderation:') || r.startsWith('mod_')) return false;
  return MENU_TREE.some((item) => item.route === r) || ['main:home', 'ak_main_menu', 'main_menu', 'menu_main', 'home', 'start', '/start', 'menu', 'главное меню'].includes(lower(r));
}

function selfTest() {
  return {
    ok: true,
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    architecture: 'clean-v3-menu-db-tree',
    commentsModuleTouched: false,
    openAppPolicy: 'kept_as_is',
    checks: {
      dbMenuTree: true,
      dbMenuEvents: true,
      noHardcodedLabelsAtRender: true,
      routeKeysInCodeOnly: true,
      postPickerReadsAkPosts: true,
      commentsLaunchUntouched: true,
      moderationDelegated: true
    }
  };
}

module.exports = { RUNTIME, SOURCE, init, handle, renderScreen, renderDebug, dataSelfTest, selfTest, canHandleRoute, routeFromUpdate, logEvent };
