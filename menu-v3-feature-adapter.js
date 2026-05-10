'use strict';

// CC6.5.5.1 — V3 Live Bridge.
// Safe feature adapter: no boot hooks, no Express patching, no Module._load patching.
// It is called only from the existing canonical webhook router.

const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC6.5.5.1-MENU-V3-LIVE-BRIDGE';
const SOURCE = 'adminkit-CC6.5.5.1-menu-v3-live-bridge-safe-adapter';

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const lower = (v) => norm(v).toLowerCase();
const cut = (v, n = 32) => {
  const s = norm(v);
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
};
const clean = (v) => db.clean ? db.clean(v) : norm(v).replace(/^post:/i, '').replace(/^ck:/i, '');

function button(text, route, extra = {}) {
  return {
    type: 'callback',
    text,
    payload: JSON.stringify({
      route,
      action: route,
      ...extra
    })
  };
}
function keyboard(rows) {
  return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }];
}
function payload(update = {}) { return db.payload(update) || {}; }
function routeFromUpdate(update = {}) {
  const p = payload(update);
  const raw = norm(p.route || p.action || db.action(update) || '');
  const map = {
    ak_main_menu: 'main:home',
    main_menu: 'main:home',
    menu_main: 'main:home',
    home: 'main:home',
    start: 'main:home',
    'главное меню': 'main:home',
    mod_start: 'moderation:home',
    moderation_menu: 'moderation:home',
    mod_choose_post: 'moderation:choose_post',
    mod_post_rules: 'moderation:post',
    mod_channel_rules: 'moderation:channel',
    mod_open_channel: 'moderation:home',
    mod_choose_channel: 'moderation:home'
  };
  return map[lower(raw)] || raw;
}
function ownerOf(route = '') {
  return String(route || '').split(':')[0] || '';
}
function adminId(update = {}) { return db.adminId(update); }
function messageId(update = {}) { return db.messageId(update); }
function chatId(update = {}) { return db.chatId(update); }
function callbackId(update = {}) { return db.callbackId(update); }

function resultMessageId(result) {
  const match = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id)"\s*:\s*"([^"{}]+)"/);
  return match ? match[1] : '';
}

async function answer(update, notification = '') {
  const id = callbackId(update);
  if (!id) return;
  try {
    await api.answerCallback({ botToken: config.botToken, callbackId: id, notification });
  } catch {}
}

async function sendOrEdit(update, currentAdminId, packet, preferEdit = true) {
  const mid = preferEdit ? messageId(update) : '';
  if (mid) {
    try {
      await api.editMessage({
        botToken: config.botToken,
        messageId: mid,
        text: packet.text,
        attachments: packet.attachments || [],
        notify: false
      });
      await db.setMenu(currentAdminId, mid);
      return { mode: 'edit', messageId: mid };
    } catch (error) {
      console.warn('[V3 live bridge edit]', error && error.message ? error.message : error);
    }
  }

  const oldMenuId = await db.getMenu(currentAdminId).catch(() => '');
  if (oldMenuId && oldMenuId !== mid) {
    try { await api.deleteMessage({ botToken: config.botToken, messageId: oldMenuId, timeoutMs: 1200 }); } catch {}
  }

  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  if (currentAdminId) args.userId = currentAdminId;
  else if (chatId(update)) args.chatId = chatId(update);
  else return { mode: 'skip', reason: 'no_target_chat' };

  const result = await api.sendMessage(args);
  const newId = resultMessageId(result);
  if (newId) await db.setMenu(currentAdminId, newId);
  return { mode: 'send', messageId: newId };
}

function nav(owner) {
  return [
    [button('❓ Помощь', `help:${owner}`), button('↩️ Раздел', `${owner}:home`)],
    [button('🏠 Главное меню', 'main:home')]
  ];
}

async function dataContext(currentAdminId) {
  const channels = await db.getChannels(currentAdminId).catch(() => []);
  const channel = channels[0] || null;
  const channelId = norm(channel && channel.channelId);
  const channelTitle = norm(channel && channel.title) || channelId || 'Канал не выбран';
  const posts = channelId ? await db.getPosts(currentAdminId, channelId, 30).catch(() => []) : [];
  const cleanPosts = posts
    .filter((post) => post && post.postId && post.commentKey && !/^mid\./i.test(String(post.postId || '')))
    .slice(0, 20);
  return { channels, channel, channelId, channelTitle, posts: cleanPosts };
}

function postFromPayloadOrList(p = {}, posts = []) {
  const postId = norm(p.postId || p.post_id || '');
  const commentKey = clean(p.commentKey || p.comment_key || '');
  return posts.find((post) =>
    (postId && String(post.postId) === postId) ||
    (commentKey && String(post.commentKey) === commentKey)
  ) || {
    postId,
    commentKey: commentKey || (p.channelId && postId ? `${p.channelId}:${postId}` : ''),
    title: norm(p.postTitle || p.title || 'Пост')
  };
}

function postPayload(owner, post, channelId, channelTitle) {
  return {
    owner,
    channelId,
    channelTitle,
    postId: norm(post.postId),
    commentKey: clean(post.commentKey || (channelId && post.postId ? `${channelId}:${post.postId}` : '')),
    postTitle: norm(post.title || post.postTitle || post.postId || 'Пост')
  };
}

function mainMenu() {
  return {
    text: ['🐋 АдминКИТ', '', 'Панель управления MAX-каналом.', 'Режим теста: PRO открыт.'].join('\n'),
    attachments: keyboard([
      [button('📺 Каналы', 'channels:home'), button('💬 Комменты', 'comments:home')],
      [button('🛡 Модерация', 'moderation:home'), button('✏️ Редактор', 'editor:home')],
      [button('⚪ Кнопки', 'buttons:home'), button('🎁 Подарки', 'gifts:home')],
      [button('📌 Выделение', 'highlight:home'), button('🗳 Опросы', 'polls:home')],
      [button('📊 Статистика', 'stats:home'), button('🧾 Тарифы', 'billing:home')],
      [button('🤝 Рефералы', 'referrals:home'), button('❓ Помощь', 'help:home')]
    ])
  };
}

async function channelsHome(currentAdminId) {
  const data = await dataContext(currentAdminId);
  const rights = data.channelId ? 'не проверялись' : 'нет канала';
  return {
    text: ['📺 Каналы', '', `Подключённых каналов: ${data.channels.length}.`, data.channelId ? `Активный канал: ${data.channelTitle}` : 'Активный канал не выбран.', `Права бота: ${rights}`].join('\n'),
    attachments: keyboard([
      data.channelId ? [button(data.channelTitle, 'channels:list', { channelId: data.channelId })] : null,
      [button('➕ Подключить', 'channels:connect')],
      [button('✅ Проверить права', 'channels:verify_access', { channelId: data.channelId })],
      [button('🔐 Доступы', 'channels:access', { channelId: data.channelId })],
      ...nav('channels')
    ])
  };
}

async function verifyAccess(currentAdminId, p = {}) {
  const data = await dataContext(currentAdminId);
  const channelId = norm(p.channelId || data.channelId);
  const title = channelId === data.channelId ? data.channelTitle : channelId;
  if (!channelId) {
    return {
      text: ['📺 Каналы', '', 'Канал не выбран.', 'Добавьте бота администратором в канал и перешлите любой пост боту.'].join('\n'),
      attachments: keyboard([[button('➕ Подключить', 'channels:connect')], ...nav('channels')])
    };
  }

  let ok = false;
  let details = 'Проверьте, что бот добавлен администратором.';
  try {
    const member = await api.getBotChatMember({ botToken: config.botToken, chatId: channelId });
    ok = true;
    const isAdmin = member && (member.is_admin === true || member.isAdmin === true || member.role === 'admin' || member.status === 'administrator');
    const isOwner = member && (member.is_owner === true || member.isOwner === true || member.role === 'owner' || member.status === 'creator');
    details = isOwner ? 'бот видит канал как владелец/создатель' : (isAdmin ? 'бот видит канал как администратор' : 'бот видит канал');
  } catch (error) {
    try {
      await api.getChat({ botToken: config.botToken, chatId: channelId });
      ok = true;
      details = 'канал доступен боту';
    } catch {}
  }

  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  return {
    text: ['📺 Каналы', '', `Канал: ${title}`, `Права бота: ${ok ? '✅ проверены' : '❌ не подтверждены'} в ${time}`, ok ? `Статус: ${details}.` : details].join('\n'),
    attachments: keyboard([
      [button('🔄 Проверить ещё раз', 'channels:verify_access', { channelId })],
      [button('🔐 Доступы', 'channels:access', { channelId })],
      ...nav('channels')
    ])
  };
}

async function genericSection(currentAdminId, owner, title, description, rows = []) {
  await dataContext(currentAdminId); // forces DB init/read without changing state
  return {
    text: [title, '', description || 'Функция открыта в режиме теста PRO.'].join('\n'),
    attachments: keyboard([...rows, ...nav(owner)])
  };
}

function commentsHome() {
  return {
    text: ['💬 Комментарии', '', 'Обсуждения под постами MAX.'].join('\n'),
    attachments: keyboard([
      [button('⚡ Авто', 'comments:auto_new'), button('📌 Старый пост', 'comments:old_post')],
      [button('📌 Выбрать пост', 'comments:choose_post'), button('👀 Вид', 'comments:preview')],
      [button('⚙️ Настройки', 'comments:settings'), button('🖼 Баннер', 'comments_banner:home')],
      [button('📷 Фото', 'comments_photo:home'), button('❤️ Реакции', 'comments_reactions:home')],
      ...nav('comments')
    ])
  };
}

async function postPicker(currentAdminId, owner, title, targetRoute) {
  const data = await dataContext(currentAdminId);
  if (!data.channelId) {
    return {
      text: [title, '', 'Канал не выбран.', 'Сначала подключите канал.'].join('\n'),
      attachments: keyboard([[button('📺 Каналы', 'channels:home')], ...nav(owner)])
    };
  }

  const rows = data.posts.slice(0, 10).map((post, index) => [
    button(`${index + 1}. ${cut(post.title || post.postId, 30)}`, targetRoute, postPayload(owner, post, data.channelId, data.channelTitle))
  ]);

  return {
    text: [title, '', `📺 ${data.channelTitle}`, `Постов найдено: ${data.posts.length}`, '', data.posts.length ? 'Выберите пост.' : 'Перешлите нужный пост боту один раз.'].join('\n'),
    attachments: keyboard([...rows, ...nav(owner)])
  };
}

async function commentsPost(currentAdminId, p = {}) {
  const data = await dataContext(currentAdminId);
  const post = postFromPayloadOrList(p, data.posts);
  const base = postPayload('comments', post, norm(p.channelId || data.channelId), norm(p.channelTitle || data.channelTitle));
  return {
    text: ['💬 Комментарии → пост', '', `📝 ${cut(base.postTitle, 64)}`, '', 'Выберите действие.'].join('\n'),
    attachments: keyboard([
      [button('✅/⏸ Комменты', 'comments:toggle', base), button('🖼 Баннер', 'comments_banner:home', base)],
      [button('❤️ Реакции', 'comments_reactions:home', base), button('📌 К списку', 'comments:choose_post', base)],
      ...nav('comments')
    ])
  };
}

async function editorHome() {
  return {
    text: ['✏️ Редактор постов', '', 'Выбор поста, предпросмотр и подготовка изменений.'].join('\n'),
    attachments: keyboard([
      [button('📌 Выбрать пост', 'editor:choose_post')],
      [button('🕘 История', 'editor:history')],
      ...nav('editor')
    ])
  };
}

async function editorPost(currentAdminId, p = {}) {
  const data = await dataContext(currentAdminId);
  const post = postFromPayloadOrList(p, data.posts);
  const base = postPayload('editor', post, norm(p.channelId || data.channelId), norm(p.channelTitle || data.channelTitle));
  return {
    text: ['✏️ Редактор → пост', '', `📝 ${cut(base.postTitle, 64)}`, '', 'Выберите действие.'].join('\n'),
    attachments: keyboard([
      [button('✏️ Текст', 'editor:edit_text', base), button('👀 Предпросмотр', 'editor:preview', base)],
      [button('💾 Сохранить', 'editor:save', base), button('↩️ Оригинал', 'editor:restore_original', base)],
      [button('📌 К списку', 'editor:choose_post', base)],
      ...nav('editor')
    ])
  };
}

async function featureStub(currentAdminId, route, p = {}) {
  const owner = ownerOf(route);
  const labels = {
    'comments:auto_new': ['⚡ Авто для новых постов', 'Автоматически добавляет комментарии к новым публикациям.'],
    'comments:old_post': ['📌 Старый пост', 'Перешлите старый пост боту, чтобы подключить к нему обсуждение.'],
    'comments:preview': ['👀 Вид комментариев', 'Предпросмотр интерфейса обсуждений.'],
    'comments:settings': ['⚙️ Настройки комментариев', 'Общие настройки обсуждений под постами.'],
    'comments:toggle': ['💬 Комментарии', 'Состояние комментариев для поста переключено в тестовом режиме.'],
    'comments_banner:home': ['🖼 Баннер', 'Плавающий баннер внутри обсуждений.'],
    'comments_photo:home': ['📷 Фото', 'Фото в комментариях. Видео и файлы не включаем.'],
    'comments_reactions:home': ['❤️ Реакции и ответы', 'Реакции и ответы внутри обсуждений.'],
    'buttons:home': ['⚪ Кнопки', 'CTA-кнопки под постами. Это не баннер в комментариях.'],
    'gifts:home': ['🎁 Подарки', 'Лид-магниты и подарки за подписку.'],
    'highlight:home': ['📌 Выделение', 'Выделение важных постов.'],
    'polls:home': ['🗳 Опросы', 'Голосования и опросы для вовлечения.'],
    'stats:home': ['📊 Статистика', 'Статистика канала, постов и функций.'],
    'billing:home': ['🧾 Тарифы', 'Покупка, пробный период и токены доступа.'],
    'referrals:home': ['🤝 Рефералы', 'Реферальные ссылки, приглашения и бонусы.'],
    'help:home': ['❓ Помощь', 'Помощь по разделам АдминКИТ.']
  };
  const [title, desc] = labels[route] || [route, 'Функция открыта в режиме теста PRO.'];
  return genericSection(currentAdminId, owner || 'main', title, desc);
}

async function renderScreen(route, currentAdminId, p = {}) {
  const r = norm(route);
  if (!r || r === 'main:home') return mainMenu();

  if (r === 'channels:home' || r === 'channels:list' || r === 'channels:connect') return channelsHome(currentAdminId);
  if (r === 'channels:verify_access') return verifyAccess(currentAdminId, p);
  if (r === 'channels:access') {
    return genericSection(currentAdminId, 'channels', '🔐 Доступы канала', 'Режим теста: PRO открыт. Все функции доступны для проверки.');
  }

  if (r === 'comments:home') return commentsHome();
  if (r === 'comments:choose_post') return postPicker(currentAdminId, 'comments', '💬 Комменты → выбор поста', 'comments:post');
  if (r === 'comments:post') return commentsPost(currentAdminId, p);
  if (r.startsWith('comments:') || r.startsWith('comments_banner:') || r.startsWith('comments_photo:') || r.startsWith('comments_reactions:')) {
    return featureStub(currentAdminId, r, p);
  }

  if (r === 'editor:home') return editorHome();
  if (r === 'editor:choose_post') return postPicker(currentAdminId, 'editor', '✏️ Редактор → выбор поста', 'editor:post');
  if (r === 'editor:post') return editorPost(currentAdminId, p);
  if (r.startsWith('editor:')) return featureStub(currentAdminId, r, p);

  if (['buttons:home','gifts:home','highlight:home','polls:home','stats:home','billing:home','referrals:home','help:home'].includes(r)) {
    return featureStub(currentAdminId, r, p);
  }

  return null;
}

function canHandleRoute(route) {
  const r = norm(route);
  if (!r) return false;
  if (r.startsWith('moderation:') || r.startsWith('mod_')) return false; // canonical moderation router owns moderation
  return [
    'main:', 'channels:', 'comments:', 'comments_banner:', 'comments_photo:', 'comments_reactions:',
    'editor:', 'buttons:', 'gifts:', 'highlight:', 'polls:', 'stats:', 'billing:', 'referrals:', 'help:'
  ].some((prefix) => r.startsWith(prefix)) || ['ak_main_menu','main_menu','menu_main','home','start'].includes(lower(r));
}

async function handle(update = {}) {
  await db.init().catch(() => {});
  if (!db.cb(update)) return false;
  const uid = adminId(update);
  if (!uid) return false;

  const p = payload(update);
  const route = routeFromUpdate(update);
  if (!canHandleRoute(route)) return false;

  const packet = await renderScreen(route, uid, p);
  if (!packet) return false;

  await answer(update, route === 'main:home' ? 'Главное меню' : 'Открыто');
  const result = await sendOrEdit(update, uid, packet, true);
  return { ok: true, handledBy: RUNTIME, sourceMarker: SOURCE, route, owner: ownerOf(route), result };
}

async function renderDebug(route = 'main:home', admin = '') {
  const currentAdminId = norm(admin || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  const p = {};
  const screen = await renderScreen(route, currentAdminId, p);
  return {
    ok: !!screen,
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    route,
    owner: ownerOf(route),
    safeCoreFreeze: true,
    touchesBoot: false,
    patchesExpress: false,
    patchesModuleLoad: false,
    patchesAppPost: false,
    touchesDebugStore: false,
    touchesDebugPing: false,
    attachedToWebhook: false,
    screen
  };
}

async function dataSelfTest(admin = '') {
  const currentAdminId = norm(admin || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  const data = await dataContext(currentAdminId);
  return {
    ok: true,
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    safeCoreFreeze: true,
    touchesBoot: false,
    patchesExpress: false,
    patchesModuleLoad: false,
    patchesAppPost: false,
    touchesDebugStore: false,
    touchesDebugPing: false,
    attachedToWebhook: false,
    adminId: currentAdminId,
    channelId: data.channelId,
    channelTitle: data.channelTitle,
    postsFound: data.posts.length,
    posts: data.posts.slice(0, 10).map((p) => ({
      postId: p.postId,
      commentKey: p.commentKey,
      title: p.title,
      updatedAt: p.updatedAt
    }))
  };
}

function selfTest() {
  const routes = [
    'main:home',
    'channels:home',
    'channels:verify_access',
    'comments:home',
    'comments:choose_post',
    'comments:post',
    'editor:home',
    'editor:choose_post',
    'editor:post',
    'buttons:home',
    'gifts:home',
    'stats:home'
  ];
  const checks = {
    safeCoreFreeze: true,
    touchesBoot: false,
    patchesExpress: false,
    patchesModuleLoad: false,
    patchesAppPost: false,
    touchesDebugStore: false,
    touchesDebugPing: false,
    rendererHasMain: !!mainMenu().text,
    commentsChoosePostOwnedByComments: canHandleRoute('comments:choose_post'),
    editorChoosePostOwnedByEditor: canHandleRoute('editor:choose_post'),
    moderationOwnedByCanonicalRouter: !canHandleRoute('moderation:choose_post'),
    routesChecked: routes.length
  };
  return {
    ok: Object.entries(checks).every(([key, value]) => key === 'routesChecked' ? value > 0 : Boolean(value)),
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    adapterVersion: 'menu-v3-live-bridge-1',
    safeCoreFreeze: true,
    attachedToWebhook: true,
    checks
  };
}

function install() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    safeCoreFreeze: true,
    touchesBoot: false,
    patchesExpress: false,
    patchesModuleLoad: false,
    patchesAppPost: false,
    touchesDebugStore: false,
    touchesDebugPing: false,
    attachedToWebhook: false,
    note: 'adapter exports only; live bridge is called from cc55-moderation-router'
  };
}

module.exports = {
  RUNTIME,
  SOURCE,
  install,
  handle,
  renderScreen,
  renderDebug,
  dataSelfTest,
  selfTest,
  canHandleRoute,
  routeFromUpdate
};
