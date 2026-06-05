'use strict';

const base = require('./gifts-flow-cc812-summary');
const store = require('./store');
const config = require('./config');
const { patchStoredPost } = require('./services/postPatcher');
const channelTitles = require('./human-channel-title-helper');
const pickerCore = require('./channel-post-picker-core');

const RUNTIME = 'CC8.3.7-GIFTS-SKIP-CLEAN-NO-IDS';
const EXTRA_ACTIONS = ['gift_admin_skip_message'];
const CLEAN_GIFT_ACTIONS = Array.from(new Set([...(base.CLEAN_GIFT_ACTIONS || []), ...EXTRA_ACTIONS]));

function clean(value) { return String(value || '').trim(); }
function setup(userId = '') { try { return store.getSetupState(clean(userId)) || {}; } catch { return {}; } }
function short(value = '', max = 90) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trim()}…`; }
function arr(value) { return Array.isArray(value) ? value : []; }
function looksTechnicalId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^id\d{6,}$/i.test(s); }
function clearActiveGiftScreen(userId = '') { const uid = clean(userId); if (!uid) return; try { store.setSetupState(uid, { giftActiveScreenMessageId: '', giftActiveScreenId: '', giftActiveScreenAt: 0 }); } catch {} }
function storedChannelTitle(channelId = '', userId = '') { return channelTitles.resolveHumanChannelTitle(channelId, userId); }
function isVisibleTarget(userId = '', target = null) { if (!target || !clean(target.commentKey) || !clean(target.channelId)) return false; return pickerCore.listUiPostsForChannel(userId, target.channelId).some((post) => clean(post.commentKey) === clean(target.commentKey)); }
function targetFromState(userId = '') { const state = setup(userId); const flow = state.giftFlow || {}; const card = state.giftsCurrentCard || null; const target = flow.targetPost || card || null; return isVisibleTarget(userId, target) ? target : null; }
function exactTargetLine(target = null, userId = '') { if (!target) return ''; return `Целевой пост: канал «${channelTitle(target, userId)}», пост «${postTitle(target)}».`; }
function saveGiftPatchDiagnostic(userId = '', status = '', extra = {}) { const uid = clean(userId); if (!uid) return; try { const prev = setup(uid); const list = arr(prev.giftPatchDiagnostics).slice(-19); list.push({ status: clean(status), at: Date.now(), ...extra }); store.setSetupState(uid, { giftPatchDiagnostics: list }); } catch {} }
function hasMedia(target = null) { return arr(target?.sourceAttachments || target?.attachments || target?.media || target?.photos || target?.files).length > 0 || Boolean(target?.photo || target?.image || target?.video || target?.document); }
function postTitle(target = null) { const text = clean(target?.originalText || target?.postText || target?.text || target?.caption || ''); if (text) return short(text, 70); return hasMedia(target) ? 'Пост с медиа' : 'Пост без текста'; }
function channelTitle(target = null, userId = '') { return channelTitles.resolveHumanChannelTitle(target?.channelId || target?.requiredChatId || '', userId, target || {}); }
function normalizeConfig(ctx = {}) { const c = ctx.config || {}; return { botToken: clean(c.botToken || config.botToken), appBaseUrl: clean(c.appBaseUrl || config.appBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL), botUsername: clean(c.botUsername || config.botUsername), maxDeepLinkBase: clean(c.maxDeepLinkBase || config.maxDeepLinkBase) }; }
async function patchGiftButton(ctx = {}, target = null) { const commentKey = clean(target?.commentKey); saveGiftPatchDiagnostic(ctx.userId, 'patch_attempted', { commentKey }); if (!commentKey) { saveGiftPatchDiagnostic(ctx.userId, 'patch_failed', { reason: 'comment_key_missing' }); return { ok: false, skipped: true, reason: 'comment_key_missing' }; } const c = normalizeConfig(ctx); if (!c.botToken) { saveGiftPatchDiagnostic(ctx.userId, 'patch_failed', { reason: 'bot_token_missing', commentKey }); return { ok: false, skipped: true, reason: 'bot_token_missing' }; } try { const result = await patchStoredPost({ ...c, commentKey }) || { ok: false, reason: 'empty_patch_result' }; saveGiftPatchDiagnostic(ctx.userId, result.ok ? 'patch_confirmed' : 'patch_not_confirmed', { commentKey, reason: clean(result.reason || '') }); return result; } catch (error) { saveGiftPatchDiagnostic(ctx.userId, 'patch_failed', { commentKey, reason: error?.message || 'patch_failed' }); return { ok: false, error: { status: error?.status || 0, message: error?.message || 'patch_failed', data: error?.data || null } }; } }

function extractPayload(value = null) {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return typeof value === 'object' ? value : null;
}
function buttonCampaignId(button = {}) {
  const payload = extractPayload(button.payload) || extractPayload(button.data) || null;
  return clean(payload?.campaignId || payload?.giftCampaignId || '');
}
function attachmentHasCampaign(attachment = {}, campaignId = '') {
  const id = clean(campaignId);
  if (!id || !attachment || typeof attachment !== 'object') return false;
  if (clean(attachment.campaignId || attachment.giftCampaignId) === id) return true;
  const payload = extractPayload(attachment.payload) || null;
  if (clean(payload?.campaignId || payload?.giftCampaignId) === id) return true;
  return false;
}
function stripGiftCampaignRowsFromAttachments(attachments = [], campaignId = '') {
  const id = clean(campaignId);
  if (!id) return arr(attachments);
  return arr(attachments).map((attachment) => {
    if (!attachment || typeof attachment !== 'object') return attachment;
    if (attachmentHasCampaign(attachment, id)) return null;
    if (attachment.type !== 'inline_keyboard') return attachment;
    const payload = attachment.payload && typeof attachment.payload === 'object' ? { ...attachment.payload } : {};
    const buttons = arr(payload.buttons);
    const nextButtons = buttons.map((row) => arr(row).filter((button) => buttonCampaignId(button) !== id)).filter((row) => row.length);
    return { ...attachment, payload: { ...payload, buttons: nextButtons } };
  }).filter(Boolean);
}
function stripGiftCampaignRowsFromKeyboard(keyboard = {}, campaignId = '') {
  if (!keyboard || typeof keyboard !== 'object') return keyboard;
  const rows = arr(keyboard.rows).map((row) => arr(row).filter((button) => buttonCampaignId(button) !== clean(campaignId))).filter((row) => row.length);
  return { ...keyboard, rows };
}
function cleanupDeletedGiftPostState(userId = '', target = null, campaignId = '') {
  const key = clean(target?.commentKey);
  const id = clean(campaignId);
  if (!key || !id) return null;
  const post = store.getPost(key) || target || {};
  const patchedAttachments = stripGiftCampaignRowsFromAttachments(post.patchedAttachments, id);
  const customKeyboard = stripGiftCampaignRowsFromKeyboard(post.customKeyboard, id);
  const patch = {
    giftCampaignId: clean(post.giftCampaignId) === id ? '' : clean(post.giftCampaignId || ''),
    lastGiftRowsCount: clean(post.giftCampaignId) === id ? 0 : Number(post.lastGiftRowsCount || 0),
    patchedAttachments,
    customKeyboard,
    deletedGiftCampaignId: id,
    deletedGiftCampaignAt: Date.now()
  };
  store.savePost(key, patch);
  try {
    const state = setup(userId);
    const targetPost = state.giftTargetPost && clean(state.giftTargetPost.commentKey) === key ? { ...state.giftTargetPost, giftCampaignId: '' } : state.giftTargetPost;
    const card = state.giftsCurrentCard && clean(state.giftsCurrentCard.commentKey) === key ? { ...state.giftsCurrentCard, giftCampaignId: '' } : state.giftsCurrentCard;
    store.setSetupState(clean(userId), { giftTargetPost: targetPost, giftsCurrentCard: card });
  } catch {}
  return store.getPost(key) || null;
}
function findCampaignForTarget(target = null) {
  if (!target) return null;
  const channelId = clean(target.channelId || target.requiredChatId || '');
  const postId = clean(target.postId || '');
  const commentKey = clean(target.commentKey || '');
  return Object.values(store.store?.gifts?.campaigns || {}).find((campaign) => campaign && (clean(campaign.commentKey) === commentKey || (clean(campaign.channelId || campaign.requiredChatId) === channelId && arr(campaign.postIds).map(clean).includes(postId)))) || null;
}
async function handleConfirmDelete(menu, payload = {}, ctx = {}) {
  const userId = clean(ctx.userId);
  const before = targetFromState(userId);
  const campaign = before ? findCampaignForTarget(before) : null;
  const screen = await base.screenForPayload(menu, payload, ctx);
  if (clean(payload.action || payload.raw) !== 'gift_admin_confirm_delete' || !before || !campaign?.id) return rewriteScreen(screen, ctx);
  const cleanedPost = cleanupDeletedGiftPostState(userId, before, campaign.id) || before;
  const patchResult = await patchGiftButton(ctx, cleanedPost);
  const ok = Boolean(patchResult && patchResult.ok);
  const safeNote = ok ? 'Подарок удалён. Кнопка под постом обновлена/удалена.' : 'Подарок удалён, но обновление кнопки под постом не подтверждено.';
  const current = await base.screenForPayload(menu, { action: 'gift_admin_show_current', note: safeNote }, ctx);
  return rewriteScreen(current, ctx);
}

function patchLine(result = {}, target = null, userId = '') { const targetLine = exactTargetLine(target, userId); if (result.ok) { const status = result.skipped && result.reason === 'already_patched' ? 'Кнопка под постом уже была актуальна.' : 'Кнопка под постом добавлена/обновлена.'; return [targetLine, status].filter(Boolean).join('\n'); } return [targetLine, 'Не удалось подтвердить обновление кнопки под постом. Проверьте подключение канала и повторите сохранение подарка позже.'].filter(Boolean).join('\n'); }
function appendPatchResult(screen = null, patchResult = null, target = null, ctx = {}) { if (!screen || !patchResult) return screen; return { ...screen, text: [clean(screen.text), '', patchLine(patchResult, target, ctx.userId)].filter(Boolean).join('\n') }; }
function isStartCreateScreen(screen = null) { const id = clean(screen && screen.id); return /^(gifts_clean_start_create|adminkit_gifts_clean_start_create|adminkit_gift_step_1_material)$/i.test(id); }
function cleanGiftHome(screen = null, ctx = {}) { if (!screen || clean(screen.id) !== 'gifts_clean_home') return screen; const target = targetFromState(ctx.userId); const text = [
  '🎁 Подарки / лид-магниты',
  '',
  target ? 'Выбранный пост:' : 'Сначала выберите канал и пост, к которому нужно привязать подарок.',
  ...(target ? [`Канал: ${channelTitle(target, ctx.userId)}`, `Пост: ${postTitle(target)}`] : []),
  '',
  /Подарок для выбранного поста пока не создан/i.test(screen.text || '') ? 'Подарок для выбранного поста пока не создан.' : '',
  /Черновик:/i.test(screen.text || '') ? 'Есть незавершённый черновик подарка.' : '',
  '',
  'Доступные условия выдачи: подписка, промокод, ключевое слово, реакция, голос в опросе, первое получение и окно времени.'
].filter(Boolean).join('\n'); return { ...screen, text }; }
function cleanTechnicalText(screen = null, ctx = {}) { if (!screen) return screen; const target = targetFromState(ctx.userId); let text = String(screen.text || ''); text = text.replace(/Clean Core экран подарков[\s\S]*?(?=Канал:|Пост выбран:|Пост:|Подарок для выбранного|Черновик:|Всего сохранённых|Доступны условия|$)/i, ''); text = text.replace(/^Post ID:.*$/gmi, ''); text = text.replace(/\b(?:postId|channelId|commentKey|token|payload|trace)\b\s*[:=][^\n]*/gmi, ''); text = text.replace(/^Канал:\s*(-?\d{6,}|id\d{6,})\s*$/gmi, `Канал: ${channelTitle(target, ctx.userId)}`); text = text.replace(/\n{3,}/g, '\n\n').trim(); return { ...screen, text }; }
function rewriteScreen(screen = null, ctx = {}) { if (!screen) return screen; let text = String(screen.text || ''); if (isStartCreateScreen(screen)) { const target = targetFromState(ctx.userId); return { ...screen, id: 'adminkit_gift_step_1_material', text: ['🎁 Создание подарка', '', 'Шаг 1 — материал подарка', '', 'Пришлите ссылку на материал подарка.', '', ...(target ? [`Пост: ${postTitle(target)}`] : []), '', 'Условия получения настроим дальше.'].filter(Boolean).join('\n') }; }
  if (/Шаг 3 — текст получателю|Шаг 3\/4/i.test(text)) text = text.replace(/Шаг 3(?:\/4)?\s*[—.]?\s*текст получателю/i, 'Шаг 2 — текст получателю').replace(/Шаг 3\/4\. Напишите текст[^\n]*/i, 'Шаг 2 — текст получателю');
  if (/Шаг 4 — условия|Шаг 4\/4/i.test(text)) text = text.replace(/Шаг 4(?:\/4)?\s*[—.]?\s*условия[^\n]*/i, 'Шаг 3 — условия получения подарка');
  if (/Шаг 5 — проверить и сохранить/i.test(text)) text = text.replace(/Шаг 5 — проверить и сохранить/i, 'Шаг 4 — проверить и сохранить');
  if (/Шаг 5 — сохранение завершено/i.test(text)) text = text.replace(/Шаг 5 — сохранение завершено/i, 'Сохранение завершено');
  let next = { ...screen, text };
  next = cleanGiftHome(next, ctx);
  next = cleanTechnicalText(next, ctx);
  return next;
}
async function screenForPayload(menu, payload = {}, ctx = {}) { const action = clean(payload.action || payload.raw); const normalized = action === 'gift_admin_skip_message' ? { ...payload, action: 'gift_admin_message_default' } : payload; const normalizedAction = clean(normalized.action || normalized.raw); if ((normalizedAction === 'gift_admin_start_create' || normalizedAction === 'gift_admin_create_from_target' || normalizedAction === 'gift_admin_pick_file') && !targetFromState(ctx.userId)) { try { store.setSetupState(clean(ctx.userId), { giftTargetPost: null, commentTargetPost: null, giftFlow: null, activeAdminFlowKind: '' }); } catch {} } if (normalizedAction === 'gift_admin_confirm_delete') return handleConfirmDelete(menu, normalized, ctx); if (normalizedAction === 'gift_admin_commit_save') { const target = targetFromState(ctx.userId); const screen = rewriteScreen(await base.screenForPayload(menu, normalized, ctx), ctx); if (/Подарок сохран/i.test(clean(screen && screen.text))) { const patchResult = await patchGiftButton(ctx, target); return appendPatchResult(screen, patchResult, target, ctx); } return screen; } return rewriteScreen(await base.screenForPayload(menu, normalized, ctx), ctx); }
async function handleTextInput(menu, ctx = {}) { clearActiveGiftScreen(ctx.userId); return rewriteScreen(await base.handleTextInput(menu, ctx), ctx); }
function isCleanGiftAction(action = '') { return CLEAN_GIFT_ACTIONS.includes(clean(action)) || (base.isCleanGiftAction ? base.isCleanGiftAction(action) : false); }

module.exports = { ...base, RUNTIME, CLEAN_GIFT_ACTIONS, isCleanGiftAction, screenForPayload, handleTextInput, patchGiftButton };
