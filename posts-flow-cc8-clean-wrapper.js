'use strict';

const base = require('./posts-flow-cc8-text-flow');
const store = require('./store');
const clientAccessService = require('./services/clientAccessService');
const fastText = require('./services/postEditorFastTextService');

const RUNTIME = 'CC8.3.8-POSTS-TEXT-MEDIA-WRAPPER';
const EDIT_FLOW_KIND = 'post_edit_text';

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function looksTechnicalId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^id\d{6,}$/i.test(s); }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function clonePlain(value) { try { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null; } catch { return null; } }
function storedChannelTitle(channelId = '') {
  const id = clean(channelId);
  if (!id) return '';
  const channel = safe(() => arr(store.getChannelsList()).find((item) => clean(item.channelId || item.id || item.chatId) === id), null);
  const title = clean(channel && (channel.title || channel.channelTitle || channel.channelName || channel.chatTitle || channel.name));
  return title && !looksTechnicalId(title) ? title : '';
}
function currentPostFromState(userId = '', payload = {}) {
  const key = clean(payload.commentKey || payload.key || '');
  if (key && base.findPost) return safe(() => base.findPost(key), null) || null;
  const state = safe(() => store.getSetupState(clean(userId)) || {}, {}) || {};
  const target = state.commentTargetPost || state.postTargetPost || null;
  if (target && target.commentKey && base.findPost) return safe(() => base.findPost(target.commentKey), null) || target;
  return target || null;
}
function channelTitleFor(post = null) {
  const explicit = clean(post && (post.channelTitle || post.channelName || post.chatTitle || post.title || post.name));
  if (explicit && !looksTechnicalId(explicit)) return explicit;
  return storedChannelTitle(post && (post.channelId || post.requiredChatId)) || 'Канал без названия';
}
function postTitleFor(post = null) {
  const s = clean(post && (post.originalText || post.postText || post.text || post.caption));
  if (s) return s.length > 70 ? `${s.slice(0, 69).trim()}…` : s;
  const media = arr(post && (post.sourceAttachments || post.attachments)).filter((x) => clean(x?.type).toLowerCase() !== 'inline_keyboard');
  return media.length ? 'Пост с медиа' : 'выбранный пост';
}
function body(msg = {}) { return msg?.body && typeof msg.body === 'object' ? msg.body : {}; }
function message(update = {}) { return update?.message || update?.data?.message || update?.callback?.message || update?.data?.callback?.message || null; }
function attachmentLikeItems(source = null) {
  const out = [];
  const push = (value, forcedType = '') => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach((item) => push(item, forcedType));
    if (typeof value !== 'object') return;
    const normalizedType = clean(forcedType || value.type || value.kind || value.attachment_type).toLowerCase();
    const payload = value?.payload && typeof value.payload === 'object' ? value.payload : value;
    const looksLikeAttachment = Boolean(normalizedType || value.token || payload.token || payload.url || payload.file_id || payload.photo_id || payload.image_id || payload.video_id || payload.audio_id || payload.document_id || payload.file_name || payload.filename || payload.mime_type || payload.content_type);
    if (!looksLikeAttachment) return;
    out.push(value.type || value.kind || value.attachment_type ? clonePlain(value) : { type: normalizedType || 'file', payload: clonePlain(payload) || payload });
  };
  if (!source || typeof source !== 'object') return out;
  if (Array.isArray(source.attachments)) source.attachments.forEach((entry) => push(entry));
  ['photo', 'image', 'picture', 'document', 'file', 'video', 'audio', 'voice'].forEach((key) => push(source[key], key));
  return out;
}
function messageAttachments(update = {}) {
  const msg = message(update) || {};
  const b = body(msg);
  const pools = [
    ...attachmentLikeItems(b.message),
    ...attachmentLikeItems(b.message?.body),
    ...attachmentLikeItems(b),
    ...attachmentLikeItems(msg),
    ...attachmentLikeItems(msg.message),
    ...attachmentLikeItems(msg.message?.body)
  ];
  const seen = new Set();
  return pools.filter((item) => {
    const type = clean(item?.type).toLowerCase();
    if (type === 'inline_keyboard') return false;
    const marker = JSON.stringify(item);
    if (seen.has(marker)) return false;
    seen.add(marker);
    return true;
  });
}
function cleanScreenText(text = '', ctx = {}, payload = {}) {
  const post = currentPostFromState(ctx.userId, payload);
  const channelTitle = channelTitleFor(post);
  let out = String(text || '');
  out = out.replace(/^Post ID:.*$/gmi, '');
  out = out.replace(/^Канал:\s*(-?\d{6,}|id\d{6,})\s*$/gmi, `Канал: ${channelTitle}`);
  out = out.replace(/^Версия:\s*\S+.*$/gmi, 'Версия сохранена.');
  out = out.replace(/Пост выбран и передан в рабочие мастера редактора\./i, 'Пост выбран для редактирования.');
  out = out.replace(/Быстрый Clean Core экран редактора постов\. Он не сканирует комментарии, каналы и MAX при открытии\./i, 'Редактор постов. Выберите пост и измените текст без перехода в другие разделы.');
  out = out.replace(/Сохранение идёт staged-путём:[^\n]*/i, 'Сохранение меняет текст поста и затем обновляет кнопки/комментарии.');
  out = out.replace(/Текст сохранён через быстрый staged-flow редактора постов\./i, 'Текст сохранён.');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}
function cleanScreen(screen = null, ctx = {}, payload = {}) {
  if (!screen) return screen;
  return { ...screen, text: cleanScreenText(screen.text, ctx, payload) };
}
function clearCompetingFlows(userId = '', reason = '') {
  const uid = clean(userId);
  if (!uid) return;
  safe(() => {
    const prev = store.getSetupState(uid) || {};
    const nextKind = clean(prev.activeAdminFlowKind) === EDIT_FLOW_KIND ? EDIT_FLOW_KIND : '';
    store.setSetupState(uid, {
      giftFlow: null,
      buttonFlow: null,
      commentAdminFlow: null,
      giftActiveScreenMessageId: '',
      buttonActiveScreenMessageId: '',
      activeAdminFlowKind: nextKind,
      flowIsolationReason: reason || RUNTIME
    });
  }, null);
}
function isPostsAction(action = '') {
  const a = clean(action);
  return a === 'editor:home' || a === 'admin_section_posts' || /^admin_posts_/.test(a) || a === 'comments_pick_post';
}
function visibleChannelIds(userId = '') {
  const uid = clean(userId);
  if (!uid) return null;
  return new Set(safe(() => clientAccessService.getClientChannels(uid), []).map((channel) => clean(channel.channelId || channel.id)).filter(Boolean));
}
function isTenantVisiblePost(post = {}, userId = '') {
  const ids = visibleChannelIds(userId);
  if (!ids) return true;
  return Boolean(post && clean(post.commentKey) && clean(post.channelId) && ids.has(clean(post.channelId)));
}
function getPostEditState(userId = '') {
  const state = safe(() => store.getSetupState(clean(userId)) || {}, {}) || {};
  const flow = state.postEditFlow || {};
  if (clean(state.activeAdminFlowKind) !== EDIT_FLOW_KIND && clean(flow.mode) !== 'edit_text') return null;
  if (clean(flow.source).toLowerCase() !== 'editor_card') return null;
  const selectedKey = clean(state.commentTargetPost?.commentKey || state.giftTargetPost?.commentKey || '');
  const commentKey = clean(flow.commentKey || '');
  if (!commentKey || commentKey !== selectedKey) return null;
  const post = commentKey && base.findPost ? safe(() => base.findPost(commentKey), null) : null;
  return post && post.commentKey && isTenantVisiblePost(post, userId) ? { state, flow, commentKey, post } : null;
}
function button(menu, text, action, extra) { return menu.button(text, action, extra || {}); }
function keyboard(menu, rows) { return menu.keyboard(rows); }
function savedScreen(menu, post = {}, result = {}) {
  const key = clean(post.commentKey);
  const mediaUpdated = Boolean(result.mediaUpdated);
  const mediaLine = mediaUpdated ? `Медиа обновлено: ${Number(result.mediaCount || 0)} влож.` : '';
  return {
    id: 'posts_clean_edit_saved',
    text: ['✅ Пост изменён', '', mediaUpdated ? 'Текст и медиа сохранены.' : 'Текст сохранён.', '', 'Пост: ' + postTitleFor(result.post || post), mediaLine, 'Патч кнопок/комментариев: ' + (result?.patch?.pending ? 'поставлен в очередь' : (result?.patch?.ok ? 'обновлён' : 'без подтверждения')), '', 'Дальше можно открыть историю версий или вернуться к карточке поста.'].filter(Boolean).join('\n'),
    attachments: keyboard(menu, [[button(menu, '↩️ К выбранному посту', 'admin_posts_open', { commentKey: key })], [button(menu, '🕘 История версий', 'admin_posts_history', { commentKey: key })], [button(menu, '✏️ В начало редактора', 'admin_section_posts')], [button(menu, '🏠 Главное меню', 'admin_section_main')]])
  };
}
function errorScreen(menu, post = {}, error = null) {
  const key = clean(post.commentKey);
  return {
    id: 'posts_clean_edit_error',
    text: ['⚠️ Пост не изменён', '', 'Ошибка: ' + clean(error?.message || error || 'unknown_error'), '', 'Можно отправить другой текст/медиа или отменить ввод.', '', 'Пост: ' + postTitleFor(post)].join('\n'),
    attachments: keyboard(menu, [[button(menu, '↩️ К выбранному посту', 'admin_posts_open', { commentKey: key })], [button(menu, '✖️ Отменить ввод текста', 'admin_posts_edit_cancel', { commentKey: key })], [button(menu, '✏️ В начало редактора', 'admin_section_posts')], [button(menu, '🏠 Главное меню', 'admin_section_main')]])
  };
}
async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = clean(payload.action || payload.raw || payload.route || '');
  if (isPostsAction(action)) clearCompetingFlows(ctx.userId, `posts_action:${action}`);
  const screen = await base.screenForPayload(menu, payload, ctx);
  if (isPostsAction(action)) clearCompetingFlows(ctx.userId, `posts_screen:${action}`);
  return cleanScreen(screen, ctx, payload);
}
async function handleTextInput(menu, ctx = {}) {
  clearCompetingFlows(ctx.userId, 'posts_text_input');
  const edit = getPostEditState(ctx.userId);
  const attachments = messageAttachments(ctx.update);
  if (edit && attachments.length) {
    try {
      const nextText = clean(ctx.text) || clean(edit.post.originalText || edit.post.postText || edit.post.text || '');
      const result = await fastText.editPostTextFast({ commentKey: edit.commentKey, text: nextText, sourceAttachments: attachments, actorId: ctx.userId, actorName: 'admin', config: ctx.config || {} });
      if (base.clearPostEditFlow) base.clearPostEditFlow(ctx.userId);
      const updatedPost = result?.post || (base.findPost ? base.findPost(edit.commentKey) : edit.post) || edit.post;
      if (base.bindTargetForLegacy) base.bindTargetForLegacy(ctx.userId, updatedPost);
      clearCompetingFlows(ctx.userId, 'posts_media_text_saved');
      return cleanScreen(savedScreen(menu, updatedPost, result), ctx, { commentKey: edit.commentKey });
    } catch (error) {
      return cleanScreen(errorScreen(menu, edit.post, error), ctx, { commentKey: edit.commentKey });
    }
  }
  const screen = await base.handleTextInput(menu, ctx);
  clearCompetingFlows(ctx.userId, 'posts_text_saved');
  return cleanScreen(screen, ctx, {});
}
function bindTargetForLegacy(userId = '', post = {}) {
  clearCompetingFlows(userId, 'posts_bind_target');
  return base.bindTargetForLegacy ? base.bindTargetForLegacy(userId, post) : post;
}
function clearPostEditFlow(userId = '') {
  return base.clearPostEditFlow ? base.clearPostEditFlow(userId) : null;
}
module.exports = { ...base, RUNTIME, screenForPayload, handleTextInput, bindTargetForLegacy, clearPostEditFlow };
