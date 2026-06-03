'use strict';

const store = require('./store');
const channelService = require('./services/channelService');
const postEditor = require('./services/postEditorService');
const tenant = require('./tenant-scope');
const visibility = require('./services/tenantChannelVisibility');

const RUNTIME = 'CC8.0.9-POSTS-SELECTED-CARD';
const MAX_POSTS = 8;

function clean(value) { return String(value || '').trim(); }
function n(value) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }
function short(value, max = 72) {
  const s = clean(value).replace(/\s+/g, ' ');
  return s.length <= max ? s : s.slice(0, max - 1).trim() + '…';
}
function array(value) { return Array.isArray(value) ? value : []; }
function safeCall(fn, fallback) { try { return fn(); } catch { return fallback; } }

function button(menu, text, action, extra) { return menu.button(text, action, extra || {}); }
function keyboard(menu, rows) { return menu.keyboard(rows); }
function footer(menu) { return [[button(menu, '✏️ В начало редактора', 'admin_section_posts')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]; }
function screen(menu, id, title, lines, rows) {
  return { id, text: [title, '', ...(lines || [])].filter(Boolean).join('\n'), attachments: keyboard(menu, rows || footer(menu)) };
}

function channelTitle(channelId = '') {
  const id = clean(channelId);
  const channel = safeCall(() => channelService.listChannels().find((item) => clean(item.channelId) === id), null) || {};
  return clean(channel.title || channel.channelTitle || channel.name || channel.chatTitle || channel.channelName || id || 'Канал');
}
function visibleChannelIds(userId = '') { return visibility.clientVisibleChannelIds(userId); }
function postTitle(post = {}) { return short(post.originalText || post.postText || post.text || post.caption || post.postId || post.messageId || post.commentKey || 'Пост без текста', 58); }
function postTime(post = {}) {
  const ts = n(post.updatedAt || post.createdAt || post.ts || 0);
  if (!ts) return '';
  try { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); } catch { return ''; }
}
function listPosts(userId = '') {
  const ids = visibleChannelIds(userId);
  const posts = safeCall(() => array(store.getPostsList()), []);
  const ctx = tenant.ensureTenantContext(userId);
  const filtered = posts.filter((post) => ids.has(clean(post && post.channelId)) && tenant.belongsToTenant(post, ctx));
  return filtered
    .filter((post) => clean(post && post.commentKey))
    .sort((a, b) => n(b.updatedAt || b.createdAt || b.ts) - n(a.updatedAt || a.createdAt || a.ts))
    .slice(0, MAX_POSTS);
}
function findPost(commentKey = '', userId = '') {
  const key = clean(commentKey);
  if (!key) return null;
  const post = safeCall(() => store.getPost(key), null) || safeCall(() => array(store.getPostsList()).find((item) => clean(item.commentKey) === key), null) || null;
  return post && tenant.belongsToTenant(post, tenant.ensureTenantContext(userId)) && visibility.canUseClientChannel(userId, post.channelId) ? post : null;
}
function getStoredTarget(userId = '') {
  const uid = clean(userId);
  if (!uid) return null;
  const state = safeCall(() => store.getSetupState(uid), {}) || {};
  const target = state.commentTargetPost || state.giftTargetPost || null;
  const post = target && target.commentKey ? findPost(target.commentKey, userId) : null;
  return post || target || null;
}
function resolvePost(payload = {}, ctx = {}) {
  const explicitKey = clean(payload.commentKey || payload.key || '');
  if (explicitKey) return findPost(explicitKey, ctx.userId);
  return getStoredTarget(ctx.userId);
}
function targetRecord(post = {}) {
  return {
    channelId: clean(post.channelId),
    channelTitle: clean(post.channelTitle || post.title || channelTitle(post.channelId)),
    postId: clean(post.postId),
    messageId: clean(post.messageId),
    commentKey: clean(post.commentKey),
    originalText: clean(post.originalText || post.postText || post.text || ''),
    linkedAt: Date.now()
  };
}
function bindTargetForLegacy(userId = '', post = {}) {
  const uid = clean(userId);
  const target = targetRecord(post);
  if (!uid || !target.commentKey) return target;
  safeCall(() => {
    const prev = safeCall(() => store.getSetupState(uid), {}) || {};
    const adminUi = {
      ...(prev.adminUi || {}),
      section: 'posts',
      backAction: 'admin_section_main',
      rootAction: 'admin_section_posts',
      selectMode: 'posts'
    };
    store.setSetupState(uid, {
      commentTargetPost: target,
      giftTargetPost: target,
      adminUi,
      activeAdminUi: adminUi
    });
  }, null);
  return target;
}
function commentsCount(post = {}) { return safeCall(() => array(store.getComments(clean(post.commentKey))).length, 0); }
function versionsCount(post = {}) { return array(post.versions).length; }
function buildPostRows(menu, post = {}) {
  const target = targetRecord(post);
  return [
    [button(menu, '✏️ Изменить текст поста', 'comments_edit_text')],
    [button(menu, '🕘 История версий', 'admin_posts_history', { commentKey: target.commentKey })],
    [button(menu, '📌 Выбрать другой пост', 'admin_posts_picker')],
    ...footer(menu)
  ];
}

async function home(menu, ctx = {}) {
  const selected = getStoredTarget(ctx.userId);
  if (selected && selected.commentKey) {
    return details(menu, { commentKey: selected.commentKey, fromHome: '1' }, ctx);
  }
  const posts = listPosts(ctx.userId);
  const rows = [[button(menu, '📌 Выбрать пост для редактирования', 'admin_posts_picker')]];
  if (posts[0]) rows.push([button(menu, '🧾 Последний пост', 'admin_posts_open', { commentKey: clean(posts[0].commentKey) })]);
  rows.push(...footer(menu));
  return screen(menu, 'posts_clean_home', '✏️ Редактор постов', [
    'Сначала выберите пост. После выбора на этом же экране появятся действия именно редактора:',
    '• изменить текст поста;',
    '• открыть историю версий.',
    '',
    'Комментарии включаются/выключаются в разделе «Комментарии под постами».',
    'Кнопки под постами редактируются в отдельном разделе «Кнопки под постами».',
    '',
    'Постов в быстром списке: ' + posts.length,
    '',
    'Важно: реальные операции с постом в MAX могут занимать дольше обычного. Их ускоряем отдельными PR, без подмены результата заглушкой.'
  ], rows);
}

async function picker(menu, ctx = {}) {
  const posts = listPosts(ctx.userId);
  const rows = posts.map((post, index) => [button(menu, `${index + 1}. ${postTitle(post)}`, 'admin_posts_open', { commentKey: clean(post.commentKey) })]);
  if (!rows.length) rows.push([button(menu, 'Пока нет постов в памяти', 'admin_section_posts')]);
  rows.push([button(menu, '📌 Выбрать через список канал/пост', 'comments_select_post', { source: 'posts' })]);
  rows.push(...footer(menu));
  const lines = ['Выберите пост из последних сохранённых постов. Это быстрый список из store/cache.'];
  if (posts.length) {
    lines.push('');
    posts.forEach((post, index) => {
      const meta = [channelTitle(post.channelId), postTime(post), `${commentsCount(post)} комм.`].filter(Boolean).join(' · ');
      lines.push(`${index + 1}. ${postTitle(post)}${meta ? '\n   ' + meta : ''}`);
    });
  } else {
    lines.push('', 'Пока нет сохранённых постов. Перешлите публикацию боту или подключите канал.');
  }
  return screen(menu, 'posts_clean_picker', '📌 Выбор поста для редактирования', lines, rows);
}

async function details(menu, payload = {}, ctx = {}) {
  const post = resolvePost(payload, ctx);
  if (!post || !post.commentKey) {
    return screen(menu, 'posts_clean_not_found', '✏️ Редактор постов', ['Пост не найден в store/cache.', 'Выберите другой пост или перешлите публикацию боту.'], [[button(menu, '📌 Выбрать другой пост', 'admin_posts_picker')], ...footer(menu)]);
  }
  const target = bindTargetForLegacy(ctx.userId, post);
  const card = safeCall(() => postEditor.buildPostAdminCard(post, ctx.config || {}), {}) || {};
  const editable = card.editable || {};
  const commentsEnabled = !Boolean(post.commentsDisabled);
  return screen(menu, 'posts_clean_detail', '✏️ Редактор постов', [
    payload.fromHome ? 'Выбранный пост уже сохранён. Можно сразу выполнять действия ниже.' : 'Пост выбран и передан в рабочие мастера редактора.',
    '',
    'Канал: ' + channelTitle(target.channelId),
    'Пост: ' + postTitle(post),
    'Post ID: ' + short(target.postId || '—', 80),
    'Комментариев: ' + commentsCount(post),
    'Комментарии под постом: ' + (commentsEnabled ? 'включены' : 'выключены'),
    'Медиа в посте: ' + n(card.sourceAttachmentsCount || card.mediaCount || 0),
    'Версий в истории: ' + n(card.versionsCount || versionsCount(post)),
    'Окно редактирования: ' + (editable.editable ? 'доступно' : 'может быть ограничено MAX'),
    '',
    'Здесь только функции редактора поста. Комментарии и Кнопки под постами — в отдельных разделах.'
  ], buildPostRows(menu, post));
}

async function history(menu, payload = {}, ctx = {}) {
  const post = resolvePost(payload, ctx);
  if (!post || !post.commentKey) return details(menu, payload, ctx);
  bindTargetForLegacy(ctx.userId, post);
  const versions = safeCall(() => postEditor.listPostVersions(clean(post.commentKey)), []);
  const lines = ['История сохранённых изменений выбранного поста.'];
  if (!versions.length) {
    lines.push('', 'Версий пока нет. Они появятся после изменения текста, медиа или отката.');
  } else {
    lines.push('');
    versions.slice(0, 8).forEach((item, index) => {
      const at = item.createdAt ? new Date(Number(item.createdAt)).toISOString().slice(0, 16).replace('T', ' ') : '';
      lines.push(`${index + 1}. ${clean(item.type || 'version')} ${at ? '· ' + at : ''}`);
    });
  }
  return screen(menu, 'posts_clean_history', '🕘 История версий поста', lines, [[button(menu, '↩️ К выбранному посту', 'admin_posts_open', { commentKey: clean(post.commentKey) })], ...footer(menu)]);
}

async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = clean(payload.action);
  if (action === 'admin_section_posts') return home(menu, ctx);
  if (action === 'admin_posts_picker') return picker(menu, ctx);
  if (action === 'admin_posts_open') return details(menu, payload, ctx);
  if (action === 'admin_posts_history') return history(menu, payload, ctx);
  if (action === 'comments_pick_post' && clean(payload.source).toLowerCase() === 'posts') return details(menu, payload, ctx);
  return null;
}

module.exports = { RUNTIME, screenForPayload, listPosts, findPost, bindTargetForLegacy };
