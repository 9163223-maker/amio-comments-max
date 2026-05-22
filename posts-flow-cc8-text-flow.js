'use strict';

const store = require('./store');
const postEditor = require('./services/postEditorService');
const fastText = require('./services/postEditorFastTextService');
const basePosts = require('./posts-flow-cc8');

const RUNTIME = 'CC8.0.13-POSTS-FAST-OPEN';
const EDIT_FLOW_KIND = 'post_edit_text';
const MAX_POSTS = 8;

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
function listPosts() {
  const posts = safeCall(() => array(store.getPostsList()), []);
  return posts
    .filter((post) => clean(post && post.commentKey))
    .sort((a, b) => n(b.updatedAt || b.createdAt || b.ts) - n(a.updatedAt || a.createdAt || a.ts))
    .slice(0, MAX_POSTS);
}
function channelTitle(postOrChannelId = '', maybePost = null) {
  const post = maybePost || (postOrChannelId && typeof postOrChannelId === 'object' ? postOrChannelId : null) || {};
  const channelId = typeof postOrChannelId === 'string' ? postOrChannelId : clean(post.channelId);
  return clean(post.channelTitle || post.channelName || post.chatTitle || post.title || post.name || channelId || 'Канал');
}
function postTitle(post = {}) { return short(post.originalText || post.postText || post.text || post.caption || post.postId || post.messageId || post.commentKey || 'Пост без текста', 58); }
function postTime(post = {}) {
  const ts = n(post.updatedAt || post.createdAt || post.ts || 0);
  if (!ts) return '';
  try { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); } catch { return ''; }
}
function commentsCount(post = {}) { return n(post.commentCount || post.commentsCount || post.comments_count || 0); }
function versionsCount(post = {}) { return array(post.versions).length || n(post.versionsCount || post.versionCount || 0); }
function mediaCount(post = {}) {
  const attachments = array(post.sourceAttachments || post.attachments);
  return attachments.filter((item) => clean(item?.type).toLowerCase() !== 'inline_keyboard').length;
}
function editableMeta(post = {}, config = {}) {
  const hours = Math.max(1, Number(config.postEditWindowHours || 24) || 24);
  const createdAt = n(post.createdAt || post.updatedAt || 0);
  const deadlineAt = createdAt ? createdAt + hours * 60 * 60 * 1000 : 0;
  const msLeft = deadlineAt ? deadlineAt - Date.now() : 0;
  return { editable: Boolean(deadlineAt) && msLeft > 0, windowHours: hours, msLeft: Math.max(0, msLeft) };
}
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
    channelTitle: channelTitle(post),
    postId: clean(post.postId),
    messageId: clean(post.messageId),
    commentKey: clean(post.commentKey),
    originalText: clean(post.originalText || post.postText || post.text || ''),
    linkedAt: Date.now()
  };
}
function bindTarget(userId = '', post = {}) {
  const uid = clean(userId);
  const target = targetRecord(post);
  if (!uid || !target.commentKey) return target;
  safeCall(() => {
    const prev = getSetup(uid);
    const currentKey = clean(prev.commentTargetPost?.commentKey || prev.giftTargetPost?.commentKey || '');
    const currentSection = clean(prev.adminUi?.section || prev.activeAdminUi?.section || '');
    if (currentKey === target.commentKey && currentSection === 'posts') return;
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
      activeAdminUi: adminUi
    });
  }, null);
  return target;
}
function clearPostEditFlow(userId = '') {
  const uid = clean(userId);
  if (!uid) return;
  safeCall(() => {
    const prev = getSetup(uid);
    if (!prev.postEditFlow && clean(prev.activeAdminFlowKind) !== EDIT_FLOW_KIND) return;
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
  clearPostEditFlow(ctx.userId);
  const selected = getStoredTarget(ctx.userId);
  const posts = listPosts();
  const rows = [[button(menu, '📌 Выбрать пост для редактирования', 'admin_posts_picker')]];
  if (selected && selected.commentKey) rows.push([button(menu, '↩️ К выбранному посту', 'admin_posts_open', { commentKey: clean(selected.commentKey) })]);
  if (posts[0] && clean(posts[0].commentKey) !== clean(selected?.commentKey)) rows.push([button(menu, '🧾 Последний пост', 'admin_posts_open', { commentKey: clean(posts[0].commentKey) })]);
  rows.push(...footer(menu));
  return screen(menu, 'posts_clean_home', '✏️ Редактор постов', [
    'Быстрый Clean Core экран редактора постов. Он не сканирует комментарии, каналы и MAX при открытии.',
    '',
    'Рабочие функции сохранены:',
    '• выбор поста из store/cache;',
    '• изменение текста через staged-flow;',
    '• история версий;',
    '',
    'Комментарии включаются/выключаются в разделе «Комментарии под постами».',
    'CTA-кнопки редактируются в отдельном разделе «CTA / пользовательские кнопки».',
    '',
    'Постов в быстром списке: ' + posts.length
  ], rows);
}
async function picker(menu) {
  const posts = listPosts();
  const rows = posts.map((post, index) => [button(menu, `${index + 1}. ${postTitle(post)}`, 'admin_posts_open', { commentKey: clean(post.commentKey) })]);
  if (!rows.length) rows.push([button(menu, 'Пока нет постов в памяти', 'admin_section_posts')]);
  rows.push([button(menu, '📌 Выбрать через список канал/пост', 'comments_select_post', { source: 'posts' })]);
  rows.push(...footer(menu));
  const lines = ['Выберите пост из последних сохранённых постов. Это быстрый список из store/cache без live-запросов к MAX.'];
  if (posts.length) {
    lines.push('');
    posts.forEach((post, index) => {
      const meta = [channelTitle(post), postTime(post), commentsCount(post) ? `${commentsCount(post)} комм.` : 'комм. не сканируем'].filter(Boolean).join(' · ');
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
  const editable = editableMeta(post, ctx.config || {});
  return screen(menu, 'posts_clean_detail', '✏️ Редактор постов', [
    payload.fromHome ? 'Выбранный пост уже сохранён. Можно сразу выполнять действия ниже.' : 'Пост выбран и передан в рабочие мастера редактора.',
    '',
    'Канал: ' + channelTitle(post, target.channelId),
    'Пост: ' + postTitle(post),
    'Post ID: ' + short(target.postId || '—', 80),
    'Медиа в посте: ' + mediaCount(post),
    'Версий в истории: ' + versionsCount(post),
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
    'Сохранение идёт staged-путём: текст меняется сразу, а пересборка кнопок/комментариев догоняется отдельным async patch.',
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
async function history(menu, payload = {}, ctx = {}) {
  const post = resolvePost(payload, ctx);
  if (!post || !post.commentKey) return details(menu, payload, ctx);
  bindTarget(ctx.userId, post);
  const versions = array(post.versions).length ? array(post.versions) : safeCall(() => postEditor.listPostVersions(clean(post.commentKey)), []);
  const lines = ['История сохранённых изменений выбранного поста берётся из store/cache без пересканирования постов.'];
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
    const result = await fastText.editPostTextFast({ commentKey: post.commentKey, text: nextText, actorId: uid, actorName: 'admin', config });
    clearPostEditFlow(uid);
    const updatedPost = result?.post || findPost(post.commentKey) || post;
    bindTarget(uid, updatedPost);
    return screen(menu, 'posts_clean_edit_saved', '✅ Текст поста изменён', [
      'Текст сохранён через быстрый staged-flow редактора постов.',
      '',
      'Пост: ' + postTitle(updatedPost),
      'Версия: ' + clean(result?.version?.id || 'создана'),
      'Патч кнопок/комментариев: ' + (result?.patch?.pending ? 'поставлен в очередь' : (result?.patch?.ok ? 'обновлён' : 'без подтверждения')),
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
  if (action === 'admin_posts_history') return history(menu, payload, ctx);
  if (action === 'admin_posts_edit_text') return editTextStart(menu, payload, ctx);
  if (action === 'admin_posts_edit_cancel') return editTextCancel(menu, payload, ctx);
  if (action === 'comments_pick_post' && clean(payload.source).toLowerCase() === 'posts') return details(menu, payload, ctx);
  return basePosts.screenForPayload(menu, payload, ctx);
}
module.exports = { RUNTIME, screenForPayload, handleTextInput, listPosts, findPost, bindTargetForLegacy: bindTarget, clearPostEditFlow };