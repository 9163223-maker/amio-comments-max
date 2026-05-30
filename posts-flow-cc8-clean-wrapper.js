'use strict';

const base = require('./posts-flow-cc8-text-flow');
const store = require('./store');

const RUNTIME = 'CC8.3.7-POSTS-CLEAN-WRAPPER-NO-IDS';
const EDIT_FLOW_KIND = 'post_edit_text';

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function looksTechnicalId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^id\d{6,}$/i.test(s); }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
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
  return 'выбранный пост';
}
function cleanScreenText(text = '', ctx = {}, payload = {}) {
  const post = currentPostFromState(ctx.userId, payload);
  const channelTitle = channelTitleFor(post);
  let out = String(text || '');
  out = out.replace(/^Post ID:.*$/gmi, '');
  out = out.replace(/^Канал:\s*(-?\d{6,}|id\d{6,})\s*$/gmi, `Канал: ${channelTitle}`);
  out = out.replace(/Пост выбран и передан в рабочие мастера редактора\./i, 'Пост выбран для редактирования.');
  out = out.replace(/Быстрый Clean Core экран редактора постов\. Он не сканирует комментарии, каналы и MAX при открытии\./i, 'Редактор постов. Выберите пост и измените текст без перехода в другие разделы.');
  out = out.replace(/Сохранение идёт staged-путём:[^\n]*/i, 'Сохранение меняет текст поста и затем обновляет кнопки/комментарии.');
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
async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = clean(payload.action || payload.raw || payload.route || '');
  if (isPostsAction(action)) clearCompetingFlows(ctx.userId, `posts_action:${action}`);
  const screen = await base.screenForPayload(menu, payload, ctx);
  if (isPostsAction(action)) clearCompetingFlows(ctx.userId, `posts_screen:${action}`);
  return cleanScreen(screen, ctx, payload);
}
async function handleTextInput(menu, ctx = {}) {
  clearCompetingFlows(ctx.userId, 'posts_text_input');
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
