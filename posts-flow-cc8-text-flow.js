'use strict';

const store = require('./store');
const channelService = require('./services/channelService');
const postEditor = require('./services/postEditorService');
const basePosts = require('./posts-flow-cc8');

const RUNTIME = 'CC8.0.10-POSTS-TEXT-FLOW-HOTFIX';
const EDIT_FLOW_KIND = 'post_edit_text';

function clean(value) { return String(value || '').trim(); }
function n(value) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }
function short(value, max = 72) {
  const s = clean(value).replace(/\s+/g, ' ');
  return s.length <= max ? s : s.slice(0, max - 1).trim() + '…';
}
function safeCall(fn, fallback) { try { return fn(); } catch { return fallback; } }
function array(value) { return Array.isArray(value) ? value : []; }
function button(menu, text, action, extra) { return menu.button(text, action, extra || {}); }
function keyboard(menu, rows) { return menu.keyboard(rows); }
function footer(menu) { return [[button(menu, '✏️ В начало редактора', 'admin_section_posts')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]; }
function screen(menu, id, title, lines, rows) {
  return { id, text: [title, '', ...(lines || [])].filter(Boolean).join('\n'), attachments: keyboard(menu, rows || footer(menu)) };
}
function getSetup(userId = '') { return safeCall(() => store.getSetupState(clean(userId)), {}) || {}; }
function findPost(commentKey = '') { return basePosts.findPost(clean(commentKey)); }
function listPosts(userId = '') { return basePosts.listPosts(clean(userId)); }
function channelTitle(channelId = '') {
  const id = clean(channelId);
  const channel = safeCall(() => channelService.listChannels().find((item) => clean(item.channelId) === id), null) || {};
  return clean(channel.title || channel.channelTitle || channel.name || channel.chatTitle || channel.channelName || id || 'Канал');
}
function postTitle(post = {}) { return short(post.originalText || post.postText || post.text || post.caption || post.postId || post.messageId || post.commentKey || 'Пост без текста', 58); }
function postTime(post = {}) {
  const ts = n(post.updatedAt || post.createdAt || post.ts || 0);
  if (!ts) return '';
  try { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); } catch { return ''; }
}
function commentsCount(post = {}) { return safeCall(() => array(store.getComments(clean(post.commentKey))).length, 0); }
function versionsCount(post = {}) { return array(post.versions).length; }
function getStoredTarget(userId = '') {
  const state = getSetup(userId);
  const target = state.commentTargetPost || state.giftTargetPost || null;
  const post = target && target.commentKey ? findPost(target.commentKey) : null;
  return post || target || null;
}
function resolvePost(payload = {}, ctx = {}) {
  const explicitKey = clean(payload.commentKey || payload.key || '');
  if (explicitKey) return findPost(explicitKey);
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
function bindTarget(userId = '', post = {}) {
  return basePosts.bindTargetForLegacy(clean(userId), post);
}
function clearPostEditFlow(userId = '') {
  const uid = clean(userId);
  if (!uid) return;
  safeCall(() => {
    const prev = getSetup(uid);
    store.setSetupState(uid, {
      postEditFlow: null,
      activeAdminFlowKind: clean(prev.activeAdminFlowKind) === EDIT_FLOW_KIND ? '' : prev.activeAdminFlowKind
    });
  }, null);
}
function startPostEditFlow(userId = '', post = {}) {
  const uid = clean(userId);
  const target = targetRecord(post);
  if (!uid || !target.commentKey) return target;
  safeCall(() => {
    const prev = getSetup(uid);
    const adminUi = {
      ...(prev.adminUi || {}),
      section: 'posts',
      backAction: 'admin_posts_open',
      rootAction: 'admin_section_posts',
      selectMode: 'posts'
    };
    store.setSetupState(uid, {
      commentTargetPost: target,
      giftTargetPost: target,
      adminUi,
      activeAdminUi: adminUi,
      activeAdminFlowKind: EDIT_FLOW_KIND,
      postEditFlow: { mode: 'edit_text', commentKey: target.commentKey, startedAt: Date.now(), runtimeVersion: RUNTIME }
    });
  }, null);
  return target;
}
function detailsRows(menu, post = {}) {
  const key = clean(post.commentKey);
  return [
    [button(menu, '✏️ Изменить текст поста', 'admin_posts_edit_text', { commentKey: key })],
    [button(menu, '🕘 История версий', 'admin_posts_history', { commentKey: key })],
    [button(menu, '📌 Выбрать другой пост', 'admin_posts_picker')],
    ...footer(menu)
  ];
}
function editTextRows(menu, post = {}) {
  const key = clean(post.commentKey);
  return [
    [button(menu, '↩️ К выбранному посту', 'admin_posts_open', { commentKey: key })],
    [button(menu, '✖️ Отменить ввод текста', 'admin_posts_edit_cancel', { commentKey: key })],
    ...footer(menu)
  ];
}
async function home(menu, ctx = {}) {
  const selected = getStoredTarget(ctx.userId);
  if (selected && selected.commentKey) return details(menu, { commentKey: selected.commentKey, fromHome: '1' }, ctx);
  const posts = listPosts(ctx.userId);
  const rows = [[button(menu, '📌 Выбрать пост для редактирования', 'admin_posts_picker')]];
  if (posts[0]) rows.push([button(menu, '🧾 Последний пост', 'admin_posts_open', { commentKey: clean(posts[0].commentKey) })]);
  rows.push(...footer(menu));
  return screen(menu, 'posts_clean_home', '✏️ Редактор постов', [
    'Сначала выберите пост. После выбора появятся действия именно редактора:',
    '• изменить текст поста;',
    '• открыть историю версий.',
    '',
    'Комментарии включаются/выключаются в разделе «Комментарии под постами».',
    'CTA-кнопки редактируются в отдельном разделе «CTA / пользовательские кнопки».',
    '',
    'Постов в быстром списке: ' + posts.length
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
  clearPostEditFlow(ctx.userId);
  const target = bindTarget(ctx.userId, post);
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
    'Здесь только функции редактора поста. Комментарии и CTA-кнопки — в отдельных разделах.'
  ], detailsRows(menu, post));
}
async function editTextStart(menu, payload = {}, ctx = {}) {
  const post = resolvePost(payload, ctx);
  if (!post || !post.commentKey) return details(menu, payload, ctx);
  startPostEditFlow(ctx.userId, post);
  return screen(menu, 'posts_clean_edit_text', '✏️ Изменение текста поста', [
    'Отправьте следующим сообщением новый текст выбранного поста.',
    '',
    'Это отдельный Clean Core flow редактора постов. Он не использует comments_edit_text и не уходит в общий comments/text legacy-flow.',
    '',
    'Текущий пост: ' + postTitle(post),
    'Текущий текст:',
    short(post.originalText || post.postText || post.text || '—', 700),
    '',
    'Чтобы ничего не менять, нажмите «Отменить ввод текста».'
  ], editTextRows(menu, post));
}
async function editTextCancel(menu, payload = {}, ctx = {}) {
  clearPostEditFlow(ctx.userId);
  return details(menu, payload, ctx);
}
async function handleTextInput(menu, { config = {}, userId = '', text = '' } = {}) {
  const uid = clean(userId);
  if (!uid) return null;
  const state = getSetup(uid);
  const flow = state.postEditFlow || {};
  if (clean(state.activeAdminFlowKind) !== EDIT_FLOW_KIND && clean(flow.mode) !== 'edit_text') return null;
  const commentKey = clean(flow.commentKey || state.commentTargetPost?.commentKey || state.giftTargetPost?.commentKey || '');
  const post = findPost(commentKey);
  if (!post || !post.commentKey) {
    clearPostEditFlow(uid);
    return screen(menu, 'posts_clean_edit_missing', '✏️ Изменение текста поста', ['Пост для редактирования не найден в store/cache.', 'Выберите пост заново.'], [[button(menu, '📌 Выбрать пост', 'admin_posts_picker')], ...footer(menu)]);
  }
  const nextText = clean(text);
  if (!nextText) return screen(menu, 'posts_clean_edit_empty', '✏️ Изменение текста поста', ['Пустой текст не сохранён.', 'Отправьте новый текст поста или отмените ввод.'], editTextRows(menu, post));
  if (/^\/cancel$/i.test(nextText)) {
    clearPostEditFlow(uid);
    return details(menu, { commentKey: post.commentKey }, { userId: uid, config });
  }
  try {
    const result = await postEditor.editPostText({ commentKey: post.commentKey, text: nextText, actorId: uid, actorName: 'admin', config });
    clearPostEditFlow(uid);
    const updatedPost = result?.post || findPost(post.commentKey) || post;
    bindTarget(uid, updatedPost);
    return screen(menu, 'posts_clean_edit_saved', '✅ Текст поста изменён', [
      'Изменение сохранено через Clean Core post editor flow.',
      '',
      'Пост: ' + postTitle(updatedPost),
      'Версия: ' + clean(result?.version?.id || 'создана'),
      'Патч кнопок/комментариев: ' + (result?.patch?.ok ? 'обновлён' : 'без подтверждения'),
      '',
      'Дальше можно открыть историю версий или вернуться к карточке поста.'
    ], [[button(menu, '↩️ К выбранному посту', 'admin_posts_open', { commentKey: clean(updatedPost.commentKey) })], [button(menu, '🕘 История версий', 'admin_posts_history', { commentKey: clean(updatedPost.commentKey) })], ...footer(menu)]);
  } catch (error) {
    return screen(menu, 'posts_clean_edit_error', '⚠️ Текст поста не изменён', [
      'Ошибка: ' + String(error?.message || error || 'unknown_error'),
      '',
      'Flow остаётся в режиме ввода текста. Можно отправить другой текст или отменить ввод.',
      '',
      'Пост: ' + postTitle(post)
    ], editTextRows(menu, post));
  }
}
async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = clean(payload.action);
  if (action === 'admin_section_posts') return home(menu, ctx);
  if (action === 'admin_posts_picker') return picker(menu, ctx);
  if (action === 'admin_posts_open') return details(menu, payload, ctx);
  if (action === 'admin_posts_edit_text') return editTextStart(menu, payload, ctx);
  if (action === 'admin_posts_edit_cancel') return editTextCancel(menu, payload, ctx);
  if (action === 'comments_pick_post' && clean(payload.source).toLowerCase() === 'posts') return details(menu, payload, ctx);
  return basePosts.screenForPayload(menu, payload, ctx);
}
module.exports = { RUNTIME, screenForPayload, handleTextInput, listPosts, findPost, bindTargetForLegacy: bindTarget, clearPostEditFlow };
