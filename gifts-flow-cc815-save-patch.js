'use strict';

const base = require('./gifts-flow-cc812-bottom');
const store = require('./store');
const config = require('./config');
const { patchStoredPost } = require('./services/postPatcher');

const RUNTIME = 'CC8.1.4-GIFTS-SAVE-PATCH-CLEANUP';
const CLEAN_GIFT_ACTIONS = base.CLEAN_GIFT_ACTIONS || [];

function clean(value) { return String(value || '').trim(); }
function setup(userId = '') { try { return store.getSetupState(clean(userId)) || {}; } catch { return {}; } }
function short(value = '', max = 90) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trim()}…`; }
function targetFromState(userId = '') {
  const state = setup(userId);
  const flow = state.giftFlow || {};
  return flow.targetPost || state.giftTargetPost || state.commentTargetPost || null;
}
function postTitle(target = null) {
  return short(target?.originalText || target?.postText || target?.text || target?.caption || target?.postId || 'выбранный пост', 70);
}
function normalizeConfig(ctx = {}) {
  const c = ctx.config || {};
  return {
    botToken: clean(c.botToken || config.botToken),
    appBaseUrl: clean(c.appBaseUrl || config.appBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL),
    botUsername: clean(c.botUsername || config.botUsername),
    maxDeepLinkBase: clean(c.maxDeepLinkBase || config.maxDeepLinkBase)
  };
}
async function patchGiftButton(ctx = {}, target = null) {
  const commentKey = clean(target?.commentKey);
  if (!commentKey) return { ok: false, skipped: true, reason: 'comment_key_missing' };
  const c = normalizeConfig(ctx);
  if (!c.botToken) return { ok: false, skipped: true, reason: 'bot_token_missing' };
  try {
    const result = await patchStoredPost({ ...c, commentKey });
    return result || { ok: false, reason: 'empty_patch_result' };
  } catch (error) {
    return { ok: false, error: { status: error?.status || 0, message: error?.message || 'patch_failed', data: error?.data || null } };
  }
}
function patchLine(result = {}) {
  if (result.ok) {
    if (result.skipped && result.reason === 'already_patched') return 'Кнопка под постом: уже была актуальна.';
    return 'Кнопка под постом: добавлена/обновлена.';
  }
  const reason = clean(result.reason || result.error?.message || 'patch_failed');
  return `Подарок сохранён, но кнопку под постом обновить не удалось: ${reason}`;
}
function appendPatchResult(screen = null, patchResult = null) {
  if (!screen || !patchResult) return screen;
  return { ...screen, text: [clean(screen.text), '', patchLine(patchResult)].filter(Boolean).join('\n') };
}
function rewriteScreen(screen = null, ctx = {}) {
  if (!screen) return screen;
  const id = clean(screen.id);
  let text = String(screen.text || '');
  if (/start_create|gift_start/i.test(id) || /foundation-PR|Post ID:|post_edit_window_expire/i.test(text)) {
    const target = targetFromState(ctx.userId);
    return {
      ...screen,
      id: 'adminkit_gift_step_1_material',
      text: ['🎁 Создание подарка', '', 'Шаг 1 — материал подарка', '', 'Пришлите ссылку на подарок.', '', `Пост выбран: ${postTitle(target)}`, '', 'Условия получения настроим дальше.'].join('\n')
    };
  }
  if (/Шаг 3 — текст получателю|Шаг 3\/4/i.test(text)) {
    text = text.replace(/Шаг 3(?:\/4)?\s*[—.]?\s*текст получателю/i, 'Шаг 2 — текст получателю');
    text = text.replace(/Шаг 3\/4\. Напишите текст[^\n]*/i, 'Шаг 2 — текст получателю');
  }
  if (/Шаг 4 — условия|Шаг 4\/4/i.test(text)) {
    text = text.replace(/Шаг 4(?:\/4)?\s*[—.]?\s*условия[^\n]*/i, 'Шаг 3 — условия получения подарка');
  }
  if (/Шаг 5 — проверить и сохранить/i.test(text)) {
    text = text.replace(/Шаг 5 — проверить и сохранить/i, 'Шаг 4 — проверить и сохранить');
  }
  if (/Шаг 5 — сохранение завершено/i.test(text)) {
    text = text.replace(/Шаг 5 — сохранение завершено/i, 'Сохранение завершено');
  }
  return { ...screen, text };
}
async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = clean(payload.action || payload.raw);
  if (action === 'gift_admin_commit_save') {
    const target = targetFromState(ctx.userId);
    const screen = rewriteScreen(await base.screenForPayload(menu, payload, ctx), ctx);
    if (/Подарок сохран/i.test(clean(screen && screen.text))) {
      const patchResult = await patchGiftButton(ctx, target);
      return appendPatchResult(screen, patchResult);
    }
    return screen;
  }
  return rewriteScreen(await base.screenForPayload(menu, payload, ctx), ctx);
}
async function handleTextInput(menu, ctx = {}) {
  return rewriteScreen(await base.handleTextInput(menu, ctx), ctx);
}
function isCleanGiftAction(action = '') {
  return base.isCleanGiftAction ? base.isCleanGiftAction(action) : CLEAN_GIFT_ACTIONS.includes(clean(action));
}

module.exports = { ...base, RUNTIME, CLEAN_GIFT_ACTIONS, isCleanGiftAction, screenForPayload, handleTextInput, patchGiftButton };
