'use strict';

const base = require('./gifts-flow-cc812-summary');
const store = require('./store');
const config = require('./config');
const { patchStoredPost } = require('./services/postPatcher');
const channelTitles = require('./human-channel-title-helper');
const pickerCore = require('./channel-post-picker-core');
const tenant = require('./tenant-scope');
const giftService = require('./services/giftService');
const adminActionLog = require('./admin-action-log-live');

const RUNTIME = 'CC8.3.65-PR225-GIFTS-CANONICAL-BUTTONS-HARDENING';
const EXTRA_ACTIONS = ['gift_admin_skip_message'];
const CLEAN_GIFT_ACTIONS = Array.from(new Set([...(base.CLEAN_GIFT_ACTIONS || []), ...EXTRA_ACTIONS]));

// PR225 gifts flow audit: canonical gift state is resolved through resolveGiftContext(ctx,payload), loaded by tenant/channel/post/commentKey via loadGiftFeatureState(context), and mutated only through commitGiftFeatureState(context,nextGiftState). Drafts/current cards are fallback target hints, not final gift state. Delete writes a tombstone that blocks legacy/migration re-import for the same canonical key.
const GIFTS_FLOW_AUDIT_PR223 = Object.freeze({
  marker: RUNTIME,
  canonicalPath: ['resolveGiftContext(ctx,payload)', 'loadGiftFeatureState(context)', 'commitGiftFeatureState(context,nextGiftState)'],
  selectedPostStoredIn: ['canonical gift target: tenant/user -> channel -> post/commentKey', 'setup.giftTargetPost as retained target hint', 'setup.giftsCurrentCard/giftFlow as fallback hints only'],
  giftStateLoadedFrom: ['canonical_gift_state exact tenant/channel/post/commentKey', 'campaign_commentKey migration source stamped into canonical', 'migration_channel_post source stamped into canonical when no tombstone exists', 'empty'],
  keyedBy: 'tenantKey/ownerUserId + channelId + postId + commentKey; channelId+postId is migration-only and blocked by delete tombstone',
  wrongPostRisk: 'guarded by tenant ownership, exact commentKey/channel/post verification, canonical read-back, and delete tombstone anti-resurrection',
  canLoseSelectedPostAcrossCallbacks: 'cancel clears draft only; explicit reset is required to clear a retained valid gift target',
  fullyCanonical: true,
  remainingLimitations: ['MAX patch can still fail after canonical commit if live channel/bot permissions are unavailable; UI reports partial success and continues rendering canonical read-back state.'],
  remainingTodo: [],
  todo: 'Keep PR225 tests wired in CI for BTN-065..BTN-067 and GIFT-026..GIFT-036.'
});
const GIFTS_FLOW_AUDIT_PR222 = GIFTS_FLOW_AUDIT_PR223;

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
function cleanGiftHome(screen = null, ctx = {}) { if (!screen || !/(^|_)gifts_clean_home$/.test(clean(screen.id))) return screen; const target = targetFromState(ctx.userId); const sourceText = clean(screen.text); const safeNotice = /Удаление доступно только из карточки текущего подарка/i.test(sourceText) ? 'Удаление доступно только из карточки текущего подарка. Откройте карточку подарка и удалите его оттуда.' : (/Замена материала доступна только из карточки текущего подарка/i.test(sourceText) ? 'Замена материала доступна только из карточки текущего подарка.' : ''); const text = ['Подарки / лид-магниты', '', safeNotice, safeNotice ? '' : '', 'Создавайте подарки для постов: промокод, текст, файл, картинку или ссылку.', '', 'Сначала выберите действие.'].filter(Boolean).join('\n'); return { ...screen, text }; }
function cleanTechnicalText(screen = null, ctx = {}) { if (!screen) return screen; const target = targetFromState(ctx.userId); let text = String(screen.text || ''); text = text.replace(/Clean Core экран подарков[\s\S]*?(?=Канал:|Пост выбран:|Пост:|Подарок для выбранного|Черновик:|Всего сохранённых|Доступны условия|$)/i, ''); text = text.replace(/^Post ID:.*$/gmi, ''); text = text.replace(/\b(?:postId|channelId|commentKey|token|payload|trace)\b\s*[:=][^\n]*/gmi, ''); text = text.replace(/^Канал:\s*(-?\d{6,}|id\d{6,})\s*$/gmi, `Канал: ${channelTitle(target, ctx.userId)}`); text = text.replace(/\n{3,}/g, '\n\n').trim(); return { ...screen, text }; }

function withGiftSectionRoot(screen = null) {
  if (!screen || !screen.attachments) return screen;
  const rootButton = { type: 'callback', text: '↩️ В раздел «Подарки»', payload: { action: 'admin_section_gifts' } };
  const addRows = (rows = []) => {
    const flat = arr(rows).flat();
    if (flat.some((btn) => /В раздел «Подарки»|В начало подарков/.test(clean(btn && btn.text)))) return rows;
    return [...arr(rows), [rootButton]];
  };
  if (Array.isArray(screen.attachments)) return { ...screen, attachments: screen.attachments.map((att) => att && att.type === 'inline_keyboard' ? { ...att, payload: att.payload && Array.isArray(att.payload.buttons) ? { ...att.payload, buttons: addRows(att.payload.buttons) } : att.payload, rows: Array.isArray(att.rows) ? addRows(att.rows) : att.rows } : att) };
  if (screen.attachments.type === 'inline_keyboard') return { ...screen, attachments: { ...screen.attachments, rows: Array.isArray(screen.attachments.rows) ? addRows(screen.attachments.rows) : screen.attachments.rows, payload: screen.attachments.payload && Array.isArray(screen.attachments.payload.buttons) ? { ...screen.attachments.payload, buttons: addRows(screen.attachments.payload.buttons) } : screen.attachments.payload } };
  return screen;
}

function rewriteScreen(screen = null, ctx = {}) { if (!screen) return screen; let text = String(screen.text || ''); if (isStartCreateScreen(screen)) { const target = targetFromState(ctx.userId); return { ...screen, id: 'adminkit_gift_step_1_material', text: ['🎁 Создание подарка', '', 'Шаг 1 — материал подарка', '', 'Пришлите ссылку на материал подарка.', '', ...(target ? [`Пост: ${postTitle(target)}`] : []), '', 'Условия получения настроим дальше.'].filter(Boolean).join('\n') }; }
  if (/Шаг 3 — текст получателю|Шаг 3\/4/i.test(text)) text = text.replace(/Шаг 3(?:\/4)?\s*[—.]?\s*текст получателю/i, 'Шаг 2 — текст получателю').replace(/Шаг 3\/4\. Напишите текст[^\n]*/i, 'Шаг 2 — текст получателю');
  if (/Шаг 4 — условия|Шаг 4\/4/i.test(text)) text = text.replace(/Шаг 4(?:\/4)?\s*[—.]?\s*условия[^\n]*/i, 'Шаг 3 — условия получения подарка');
  if (/Шаг 5 — проверить и сохранить/i.test(text)) text = text.replace(/Шаг 5 — проверить и сохранить/i, 'Шаг 4 — проверить и сохранить');
  if (/Шаг 5 — сохранение завершено/i.test(text)) text = text.replace(/Шаг 5 — сохранение завершено/i, 'Сохранение завершено');
  let next = { ...screen, text };
  next = cleanGiftHome(next, ctx);
  next = cleanTechnicalText(next, ctx);
  return withGiftSectionRoot(next);
}

function giftScreen(menu, id, title, lines, rows) { return { id, text: [title, '', ...(lines || [])].filter(Boolean).join('\n'), attachments: menu.keyboard(rows || []) }; }
function giftCanonicalKey(context = {}) { const target = context.target || {}; return { tenantKey: clean(context.tenantKey), ownerUserId: clean(context.ownerUserId || context.userId), userId: clean(context.userId), channelId: clean(target.channelId || target.requiredChatId || context.channelId), postId: clean(target.postId || context.postId), commentKey: clean(target.commentKey || context.commentKey) }; }
function giftKeyString(key = {}) { return [key.tenantKey, key.ownerUserId || key.userId, key.channelId, key.postId, key.commentKey].map(clean).join('|'); }
function targetRecord(post = {}, userId = '') { const ctx = tenant.ensureTenantContext(userId); return tenant.stampRecord({ channelId: clean(post.channelId || post.requiredChatId), requiredChatId: clean(post.channelId || post.requiredChatId), channelTitle: channelTitle(post, userId), postId: clean(post.postId), messageId: clean(post.messageId), commentKey: clean(post.commentKey), originalText: clean(post.originalText || post.postText || post.text || post.caption || ''), sourceAttachments: arr(post.sourceAttachments || post.attachments || post.media || post.photos || post.files), linkedAt: Date.now() }, ctx, post); }
function findPostForGift(commentKey = '', userId = '') { const key = clean(commentKey); if (!key) return null; const post = store.getPost(key) || arr(store.getPostsList && store.getPostsList()).find((p) => clean(p && p.commentKey) === key) || null; return post && tenant.belongsToTenant(post, tenant.ensureTenantContext(userId)) ? post : null; }
function bindGiftTarget(userId = '', target = {}) { const uid = clean(userId); if (!uid || !clean(target.commentKey)) return null; const record = targetRecord(target, uid); store.setSetupState(uid, { tenantKey: record.tenantKey, ownerUserId: record.ownerUserId, giftTargetPost: record, activeAdminUi: { section: 'gifts', backAction: 'admin_section_gifts', rootAction: 'admin_section_gifts', selectMode: 'gifts' }, adminUi: { section: 'gifts', backAction: 'admin_section_gifts', rootAction: 'admin_section_gifts', selectMode: 'gifts' } }); return record; }
function getGiftTarget(userId = '') { const state = setup(userId); const t = state.giftTargetPost || state.giftsCurrentCard || state.giftFlow?.targetPost || null; if (!t || !clean(t.commentKey)) return null; const post = findPostForGift(t.commentKey, userId); return post ? targetRecord(post, userId) : (tenant.belongsToTenant(t, tenant.ensureTenantContext(userId)) ? t : null); }
function clearGiftDraftOnly(userId = '') { const uid = clean(userId); if (uid) store.setSetupState(uid, { giftFlow: null, activeAdminFlowKind: setup(uid).activeAdminFlowKind === 'gift' ? '' : setup(uid).activeAdminFlowKind }); }
function clearGiftTargetOnlyOnExplicitReset(userId = '') { const uid = clean(userId); if (uid) store.setSetupState(uid, { giftTargetPost: null, giftsCurrentCard: null, giftFlow: null, activeAdminFlowKind: '' }); }
function currentGiftCard(userId = '', target = {}) { const prev = setup(userId).giftsCurrentCard || null; if (prev && clean(prev.cardId) && clean(prev.commentKey) === clean(target.commentKey)) return prev; const card = { ...targetRecord(target, userId), cardId: `gifts_card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, source: 'canonical_gift_card' }; store.setSetupState(clean(userId), { giftsCurrentCard: card }); return card; }
async function resolveGiftContext(ctx = {}, payload = {}) { const userId = clean(ctx.userId); const tenantCtx = tenant.ensureTenantContext(userId); const diagnostics = []; let target = null; if (clean(payload.commentKey)) { const post = findPostForGift(payload.commentKey, userId); if (post) { target = targetRecord(post, userId); diagnostics.push({ source: 'payload', ok: true }); } else diagnostics.push({ source: 'payload', ok: false }); }
  if (!target) { target = getGiftTarget(userId); if (target) diagnostics.push({ source: 'stored_target', ok: true }); }
  if (!target || !clean(target.commentKey)) return { ok: false, userId, tenantKey: tenantCtx.tenantKey, ownerUserId: tenantCtx.ownerUserId, target: null, channelId: '', postId: '', commentKey: '', channelTitle: '', postTitle: '', diagnostics };
  return { ok: true, userId, tenantKey: tenantCtx.tenantKey, ownerUserId: tenantCtx.ownerUserId, target, selectedPostTarget: target, channelId: clean(target.channelId || target.requiredChatId), postId: clean(target.postId), commentKey: clean(target.commentKey), channelTitle: channelTitle(target, userId), postTitle: postTitle(target), giftId: clean(payload.giftId || payload.campaignId), campaignId: clean(payload.campaignId || payload.giftId), diagnostics };
}
function normalizeGiftState(raw = null, context = {}, source = '') { if (!raw) return null; const id = clean(raw.id || raw.campaignId || context.campaignId) || `gift_${Date.now().toString(36)}`; return tenant.stampRecord({ ...raw, id, campaignId: id, channelId: context.channelId, requiredChatId: context.channelId, postIds: context.postId ? [context.postId] : [], commentKey: context.commentKey, source, enabled: raw.enabled !== false }, tenant.ensureTenantContext(context.userId), raw); }
function exactGiftMatch(c = {}, context = {}) { return clean(c.commentKey) === context.commentKey && clean(c.channelId || c.requiredChatId) === context.channelId && arr(c.postIds).map(clean).includes(context.postId) && tenant.belongsToTenant(c, tenant.ensureTenantContext(context.userId)); }
function giftReimportBlocked(context = {}, candidate = null) { const post = store.getPost(clean(context.commentKey)) || {}; const deleted = post.deletedGiftCanonicalKey || {}; const keyMatches = Boolean(post.giftLegacyReimportBlocked && clean(deleted.commentKey) === clean(context.commentKey) && clean(deleted.channelId) === clean(context.channelId) && (!clean(deleted.postId) || clean(deleted.postId) === clean(context.postId)) && (!clean(deleted.tenantKey) || clean(deleted.tenantKey) === clean(context.tenantKey))); if (!keyMatches) return false; if (candidate) { const candidateAt = Number(candidate.updatedAt || candidate.createdAt || 0); const deletedAt = Number(post.deletedGiftCampaignAt || post.updatedAt || 0); if (candidateAt && deletedAt && candidateAt > deletedAt) return false; } return true; }
function loadGiftFeatureState(context = {}) { const diagnostics = []; const all = Object.values(store.store?.gifts?.campaigns || {}); let gift = all.find((c) => c && c.canonicalGiftState === true && exactGiftMatch(c, context)); diagnostics.push({ source: 'canonical_gift_state', count: gift ? 1 : 0 }); if (gift) return { gift: normalizeGiftState(gift, context, 'canonical_gift_state'), source: 'canonical_gift_state', imported: false, sourceDiagnostics: diagnostics, keyMatchOk: true };
  gift = all.find((c) => c && clean(c.commentKey) === context.commentKey && tenant.belongsToTenant(c, tenant.ensureTenantContext(context.userId))); diagnostics.push({ source: 'campaign_commentKey', count: gift ? 1 : 0 });
  if (!gift) { gift = all.find((c) => c && clean(c.channelId || c.requiredChatId) === context.channelId && arr(c.postIds).map(clean).includes(context.postId) && tenant.belongsToTenant(c, tenant.ensureTenantContext(context.userId))); diagnostics.push({ source: 'migration_channel_post', count: gift ? 1 : 0 }); }
  if (giftReimportBlocked(context, gift)) { diagnostics.push({ reason: 'legacy_reimport_blocked_by_delete_tombstone' }); return { gift: null, source: 'empty', imported: false, sourceDiagnostics: diagnostics, keyMatchOk: true }; }
  if (!gift && giftReimportBlocked(context)) { diagnostics.push({ reason: 'legacy_reimport_blocked_by_delete_tombstone' }); return { gift: null, source: 'empty', imported: false, sourceDiagnostics: diagnostics, keyMatchOk: true }; }
  if (gift) { const stamped = normalizeGiftState({ ...gift, canonicalGiftState: true }, context, 'canonical_import'); store.store.gifts.campaigns[stamped.id] = stamped; store.saveStore(store.store); return { gift: stamped, source: 'canonical_import', imported: true, sourceDiagnostics: diagnostics, keyMatchOk: exactGiftMatch(stamped, context) }; }
  diagnostics.push({ source: 'empty', count: 0 }); return { gift: null, source: 'empty', imported: false, sourceDiagnostics: diagnostics, keyMatchOk: true };
}
function giftComparable(g = null) { if (!g) return null; return { title: clean(g.title), giftUrl: clean(g.giftUrl), giftMessage: clean(g.giftMessage), enabled: g.enabled !== false, commentKey: clean(g.commentKey), channelId: clean(g.channelId || g.requiredChatId), postIds: arr(g.postIds).map(clean).join(',') }; }
function giftContentMatch(a = null, b = null) { return JSON.stringify(giftComparable(a)) === JSON.stringify(giftComparable(b)); }
async function patchGiftFromCanonical(context = {}, commit = {}, ctx = {}) { if (!commit.ok) return { attempted: false, ok: false, error: 'commit_not_ok' }; const target = context.target; store.savePost(context.commentKey, { giftCampaignId: clean(commit.giftAfterReadBack?.id || ''), lastGiftCanonicalPatchedAt: Date.now(), lastGiftPatchSource: 'canonical_gift_read_back', lastGiftRowsCount: commit.giftAfterReadBack ? 1 : 0 }); const result = await patchGiftButton(ctx, target); return { ...result, attempted: true, ok: !!result?.ok, error: clean(result?.error?.message || result?.reason || '') }; }
async function commitGiftFeatureState(context = {}, nextGiftState = null, options = {}) { const operation = clean(options.operation || (nextGiftState ? 'save' : 'delete')); const canonicalKey = giftCanonicalKey(context); const before = loadGiftFeatureState(context); const expected = nextGiftState ? normalizeGiftState({ ...nextGiftState, canonicalGiftState: true }, context, 'canonical_commit') : null; let writeOk = false, error = ''; try { if (options.forceFailure || context.forceGiftCommitFailure) throw new Error('forced_gift_commit_failure'); if (expected) { Object.keys(store.store.gifts.campaigns || {}).forEach((id) => { const c = store.store.gifts.campaigns[id]; if (c && id !== expected.id && exactGiftMatch(c, context)) delete store.store.gifts.campaigns[id]; }); store.store.gifts.campaigns[expected.id] = expected; } else if (before.gift?.id) { delete store.store.gifts.campaigns[before.gift.id]; store.savePost(context.commentKey, { deletedGiftCampaignId: before.gift.id, deletedGiftCanonicalKey: canonicalKey, giftLegacyReimportBlocked: true, deletedGiftCampaignAt: Date.now(), giftCampaignId: '', lastGiftRowsCount: 0, patchedAttachments: stripGiftCampaignRowsFromAttachments((store.getPost(context.commentKey) || {}).patchedAttachments, before.gift.id), customKeyboard: stripGiftCampaignRowsFromKeyboard((store.getPost(context.commentKey) || {}).customKeyboard, before.gift.id) }); } store.saveStore(store.store); writeOk = true; } catch (e) { error = clean(e?.message || e || 'write_failed'); }
  const after = (options.forceReadBackFailure || context.forceGiftReadBackFailure) ? { gift: null, source: 'forced_failure', keyMatchOk: false, sourceDiagnostics: [{ reason: 'forced_read_back_failure' }] } : loadGiftFeatureState(context); const keyMatchOk = Boolean(canonicalKey.tenantKey && canonicalKey.channelId && canonicalKey.postId && canonicalKey.commentKey) && (!after.gift || exactGiftMatch(after.gift, context)); const readBackOk = writeOk && (expected ? !!after.gift : !after.gift); const contentMatchOk = writeOk && (expected ? giftContentMatch(expected, after.gift) : !after.gift); const contractViolation = writeOk && (!readBackOk || !keyMatchOk || !contentMatchOk) || (!writeOk && expected) ? 'gift_expected_state_missing_after_canonical_commit' : ''; return { ok: !!(writeOk && readBackOk && keyMatchOk && contentMatchOk), canonicalKey, canonicalKeyString: giftKeyString(canonicalKey), operation, giftBefore: before.gift, giftAfterExpected: expected, giftAfterReadBack: after.gift, writeOk, readBackOk, keyMatchOk, contentMatchOk, patchOk: false, diagnostics: [...(before.sourceDiagnostics || []), ...(after.sourceDiagnostics || []), ...(error ? [{ reason: error }] : [])], contractViolation, error };
}
function giftErrorScreen(menu, commit = {}) { return giftScreen(menu, 'gifts_canonical_commit_error', '🎁 Подарки / лид-магниты', ['Подарок не сохранён. Повторите действие.'], [[{ type: 'callback', text: '🎁 В начало подарков', payload: { action: 'admin_section_gifts' } }], [{ type: 'callback', text: '📌 Выбрать другой пост', payload: { action: 'gift_admin_recent_posts', page: 0 } }], [{ type: 'callback', text: '🏠 Главное меню', payload: { action: 'admin_section_main' } }]]); }

function recoveryGiftActionScreen(menu, message = '') { const text = clean(message) || 'Подарок не найден для этого действия. Откройте текущий подарок заново.'; const out = giftScreen(menu, 'gifts_canonical_stale_action', '🎁 Подарки / лид-магниты', [text], [[menu.button('🎁 В начало подарков', 'admin_section_gifts')], [menu.button('📌 Выбрать другой пост', 'gift_admin_recent_posts', { page: 0 })], [menu.button('🏠 Главное меню', 'admin_section_main')]]); out.__trace = { context: { ok: false, diagnostics: [{ reason: 'stale_action' }] }, commit: { attempted: false, contractViolation: 'stale_action' }, patch: { attempted: false }, contractViolation: 'stale_action' }; return out; }
function renderedGiftActionIsValid(context = {}, payload = {}) { const cardId = clean(payload.cardId || payload.currentCardId || ''); if (!cardId) return true; const card = setup(context.userId).giftsCurrentCard || null; if (!card || clean(card.cardId) !== cardId) return false; if (clean(card.commentKey) && clean(card.commentKey) !== clean(context.commentKey)) return false; if (clean(card.channelId || card.requiredChatId) && clean(card.channelId || card.requiredChatId) !== clean(context.channelId)) return false; if (clean(card.postId) && clean(card.postId) !== clean(context.postId)) return false; return true; }
function canonicalGiftPayload(context = {}, state = {}, card = {}, extra = {}) { const gift = state.gift || {}; return { source: 'gift_card', cardId: clean(card.cardId), currentCardId: clean(card.cardId), campaignId: clean(gift.id || gift.campaignId), giftId: clean(gift.id || gift.campaignId), commentKey: clean(context.commentKey), channelId: clean(context.channelId), postId: clean(context.postId), ...extra }; }
function renderGiftDeleteConfirmScreen(menu, context = {}, state = {}, payload = {}) { const card = currentGiftCard(context.userId, context.target); const data = canonicalGiftPayload(context, state, card, { action: 'gift_admin_confirm_delete' }); const out = giftScreen(menu, 'adminkit_gifts_clean_delete_confirm', '🗑 Удалить подарок', ['Подтвердите удаление подарка.', '', `Канал: ${context.channelTitle}`, `Пост: ${context.postTitle}`, '', `Подарок: ${clean(state.gift?.title || state.gift?.id || 'Подарок')}`], [[menu.button('🗑 Да, удалить', 'gift_admin_confirm_delete', data)], [menu.button('↩️ Отмена', 'gift_admin_show_current', { commentKey: context.commentKey, channelId: context.channelId, postId: context.postId })], [menu.button('🏠 Главное меню', 'admin_section_main')]]); out.__trace = { context: { ...context, giftState: giftComparable(state.gift), giftSource: state.source, imported: state.imported, diagnostics: state.sourceDiagnostics }, commit: { attempted: false }, patch: { attempted: false } }; return out; }
function startCanonicalReplacement(menu, context = {}, state = {}, payload = {}) { const gift = state.gift || {}; const flow = tenant.stampRecord({ mode: 'gift_wizard', stepIndex: 0, awaitingConfirmation: false, replacingCampaignId: clean(gift.id || gift.campaignId), targetPost: context.target, startedAt: Date.now(), runtimeVersion: RUNTIME, draft: { ...gift, id: clean(gift.id || gift.campaignId), title: clean(gift.title) || `Подарок к посту (${context.postTitle})`, channelId: context.channelId, requiredChatId: context.channelId, postIds: context.postId ? [context.postId] : [], commentKey: context.commentKey, giftUrl: '', giftAttachment: null, leadMagnetCode: '', giftMessage: clean(gift.giftMessage) || 'Спасибо за подписку! Забирайте подарок ниже.', giftButtonText: clean(gift.giftButtonText) || '🎁 Получить подарок', dmButtonText: clean(gift.dmButtonText) || 'Открыть подарок', deliverToDm: gift.deliverToDm !== false, conditions: gift.conditions || {} } }, tenant.ensureTenantContext(context.userId), gift); store.setSetupState(clean(context.userId), { giftFlow: flow, activeAdminFlowKind: 'gift' }); const out = giftScreen(menu, 'adminkit_gift_step_1_material', '🎁 Замена подарка', ['Шаг 1 — материал подарка', '', 'Пришлите новую ссылку на материал подарка.', '', `Канал: ${context.channelTitle}`, `Пост: ${context.postTitle}`], [[menu.button('❌ Отменить', 'gift_admin_cancel')], [menu.button('🎁 В начало подарков', 'admin_section_gifts')], [menu.button('🏠 Главное меню', 'admin_section_main')]]); out.__trace = { context: { ...context, giftState: giftComparable(gift), giftSource: state.source, imported: state.imported, diagnostics: state.sourceDiagnostics }, commit: { attempted: false, operation: 'replace' }, patch: { attempted: false } }; return out; }

function giftRows(menu, context = {}, state = {}) { const card = currentGiftCard(context.userId, context.target); const rows = []; if (state.gift) rows.push([menu.button('🔁 Заменить материал', 'gift_admin_replace_existing', canonicalGiftPayload(context, state, card))], [menu.button('🗑 Удалить подарок', 'gift_admin_delete_existing', canonicalGiftPayload(context, state, card))]); else rows.push([menu.button('🎁 Создать подарок для этого поста', 'gift_admin_start_create', { source: 'gift_card', cardId: card.cardId })]); rows.push([menu.button('📌 Выбрать другой пост', 'gift_admin_recent_posts', { page: 0 })], [menu.button('🎁 В начало подарков', 'admin_section_gifts')], [menu.button('🏠 Главное меню', 'admin_section_main')]); return rows; }
async function renderCurrentGiftScreen(menu, context = {}, note = '') { const state = loadGiftFeatureState(context); const lines = [clean(note), state.gift ? 'Для выбранного поста уже сохранён подарок.' : 'В выбранном посте подарок не найден.', '', `Канал: ${context.channelTitle}`, `Пост: ${context.postTitle}`, '', state.gift ? `Подарок: ${clean(state.gift.title || state.gift.id)}` : 'Можно создать подарок для этого поста.'].filter(Boolean); const out = giftScreen(menu, 'gifts_clean_current', '🧾 Текущий подарок', lines, giftRows(menu, context, state)); out.__trace = { context: { ...context, giftState: state.gift ? giftComparable(state.gift) : null, giftSource: state.source, imported: state.imported, diagnostics: state.sourceDiagnostics }, commit: { attempted: false }, patch: { attempted: false } }; return out; }
function traceGiftAction(ctx = {}, payload = {}, result = null) { const tr = result?.__trace || {}; adminActionLog.add({ userId: ctx.userId, action: clean(payload.action), payload, feature: 'gifts', screenId: result?.id, canonicalKey: tr.commit?.canonicalKey || (tr.context ? giftCanonicalKey(tr.context) : null), resolved: { ...(tr.context || {}), giftSource: tr.context?.giftSource, imported: !!tr.context?.imported, diagnostics: tr.context?.diagnostics || [] }, commit: tr.commit || { attempted: false }, patch: tr.patch || { attempted: false }, contractViolation: tr.commit?.contractViolation || '', note: result?.text }); }

function homeScreen(menu, payload = {}, ctx = {}) { return rewriteScreen(base.homeScreen ? base.homeScreen(menu, payload, ctx) : null, ctx); }
async function screenForPayload(menu, payload = {}, ctx = {}) { const action = clean(payload.action || payload.raw); let result = null; if ((action === 'gifts:home' || action === 'admin_section_gifts') && payload.resetContext === true) clearGiftTargetOnlyOnExplicitReset(ctx.userId); const normalized = action === 'gift_admin_skip_message' ? { ...payload, action: 'gift_admin_message_default' } : payload; const normalizedAction = clean(normalized.action || normalized.raw);
  if (normalizedAction === 'gift_admin_select_post') { const post = findPostForGift(normalized.commentKey, ctx.userId); if (post) { bindGiftTarget(ctx.userId, post); const c = await resolveGiftContext(ctx, normalized); result = await renderCurrentGiftScreen(menu, c, 'Пост для подарка выбран.'); } }
  else if (normalizedAction === 'admin_section_gifts' || normalizedAction === 'gifts:home') { result = rewriteScreen(await base.screenForPayload(menu, normalized, ctx), ctx); }
  else if (normalizedAction === 'gift_admin_show_current') { const c = await resolveGiftContext(ctx, normalized); result = c.ok ? await renderCurrentGiftScreen(menu, c, clean(normalized.note || '')) : rewriteScreen(await base.screenForPayload(menu, normalized, ctx), ctx); }
  else if (normalizedAction === 'gift_admin_delete_existing') { if (!clean(normalized.source) && !clean(normalized.cardId || normalized.currentCardId || '')) result = recoveryGiftActionScreen(menu, 'Удаление доступно только из карточки текущего подарка. Откройте карточку подарка и удалите его оттуда.'); else { const c = await resolveGiftContext(ctx, normalized); const state = c.ok ? loadGiftFeatureState(c) : { gift: null, sourceDiagnostics: [] }; if (!c.ok || !state.gift || !renderedGiftActionIsValid(c, normalized)) result = recoveryGiftActionScreen(menu, 'Подарок не найден для этого действия. Откройте текущий подарок заново.'); else result = renderGiftDeleteConfirmScreen(menu, c, state, normalized); } }
  else if (normalizedAction === 'gift_admin_replace_existing') { if (!clean(normalized.source) && !clean(normalized.cardId || normalized.currentCardId || '')) result = recoveryGiftActionScreen(menu, 'Замена материала доступна только из карточки текущего подарка.'); else { const c = await resolveGiftContext(ctx, normalized); const state = c.ok ? loadGiftFeatureState(c) : { gift: null, sourceDiagnostics: [] }; if (!c.ok || !state.gift || !renderedGiftActionIsValid(c, normalized)) result = recoveryGiftActionScreen(menu, 'Подарок не найден для замены. Откройте текущий подарок заново.'); else result = startCanonicalReplacement(menu, c, state, normalized); } }
  else if (normalizedAction === 'gift_admin_cancel') { clearGiftDraftOnly(ctx.userId); const c = await resolveGiftContext(ctx, normalized); result = c.ok ? await renderCurrentGiftScreen(menu, c, 'Черновик подарка отменён.') : rewriteScreen(await base.screenForPayload(menu, normalized, ctx), ctx); }
  else if (normalizedAction === 'gift_admin_confirm_delete') { const c = await resolveGiftContext(ctx, normalized); if (c.ok) { const commit = await commitGiftFeatureState(c, null, { operation: 'delete', forceFailure: ctx.forceGiftCommitFailure, forceReadBackFailure: ctx.forceGiftReadBackFailure }); if (!commit.ok) result = giftErrorScreen(menu, commit); else { const patch = await patchGiftFromCanonical(c, commit, ctx); result = await renderCurrentGiftScreen(menu, c, patch.ok ? 'Подарок удалён. Кнопка под постом обновлена/удалена.' : 'Подарок удалён, но обновление кнопки под постом не подтверждено.'); commit.patchOk = !!patch.ok; result.__trace = { context: { ...c, giftState: null, giftSource: 'canonical_gift_state', imported: false, diagnostics: commit.diagnostics }, commit: { ...commit, attempted: true }, patch }; } if (!result.__trace) result.__trace = { context: c, commit: { ...commit, attempted: true }, patch: { attempted: false } }; } }
  else if (normalizedAction === 'gift_admin_save' || normalizedAction === 'gift_admin_commit_save') { const c = await resolveGiftContext(ctx, normalized); const flow = setup(ctx.userId).giftFlow || {}; const draft = flow.draft || {}; if (normalizedAction === 'gift_admin_save' && c.ok && draft && ctx.config?.botToken && flow.awaitingConfirmation !== true) { flow.awaitingConfirmation = true; flow.stepIndex = 3; store.setSetupState(clean(ctx.userId), { giftFlow: flow, activeAdminFlowKind: 'gift' }); result = giftScreen(menu, 'gifts_clean_review', '🎁 Проверка подарка', ['Шаг 4/4. Проверьте подарок и сохраните.', '', `Подарок: ${clean(draft.title || 'Подарок')}`, `Пост: ${c.postTitle}`], [[menu.button('✅ Сохранить подарок', 'gift_admin_save')], [menu.button('❌ Отменить', 'gift_admin_cancel')], [menu.button('🏠 Главное меню', 'admin_section_main')]]); } else if (c.ok && draft) { const next = { ...draft, id: clean(flow.replacingCampaignId || draft.id) || `gift_${Date.now().toString(36)}`, title: clean(draft.title) || `Подарок к посту (${c.postTitle})`, giftMessage: clean(draft.giftMessage) || 'Спасибо за подписку! Забирайте подарок ниже.', giftButtonText: clean(draft.giftButtonText) || '🎁 Получить подарок', dmButtonText: clean(draft.dmButtonText) || 'Открыть подарок', giftUrl: clean(draft.giftUrl), conditions: draft.conditions || {}, enabled: true }; const commit = await commitGiftFeatureState(c, next, { operation: flow.replacingCampaignId ? 'replace' : 'save', forceFailure: ctx.forceGiftCommitFailure, forceReadBackFailure: ctx.forceGiftReadBackFailure }); if (!commit.ok) result = giftErrorScreen(menu, commit); else { clearGiftDraftOnly(ctx.userId); const patch = await patchGiftFromCanonical(c, commit, ctx); const note = patch.ok ? [(flow.replacingCampaignId ? 'Подарок заменён. Пост обновлён.' : 'Подарок сохранён. Пост обновлён.'), patchLine(patch, c.target, ctx.userId)].filter(Boolean).join('\n') : ['Подарок сохранён, но пост не обновился:', patchLine(patch, c.target, ctx.userId)].filter(Boolean).join('\n'); result = await renderCurrentGiftScreen(menu, c, note); commit.patchOk = !!patch.ok; result.__trace = { context: { ...c, giftState: giftComparable(commit.giftAfterReadBack), giftSource: 'canonical_gift_state', imported: false, diagnostics: commit.diagnostics }, commit: { ...commit, attempted: true }, patch }; } if (!result.__trace) result.__trace = { context: c, commit: { ...commit, attempted: true }, patch: { attempted: false } }; } }
  if (!result) { if ((normalizedAction === 'gift_admin_start_create' || normalizedAction === 'gift_admin_replace_existing') && !(await resolveGiftContext(ctx, normalized)).ok) return rewriteScreen(await base.screenForPayload(menu, normalized, ctx), ctx); result = rewriteScreen(await base.screenForPayload(menu, normalized, ctx), ctx); }
  if (CLEAN_GIFT_ACTIONS.includes(normalizedAction) || normalizedAction === 'gift_admin_save') traceGiftAction(ctx, { action: normalizedAction, ...normalized }, result); return result; }
async function handleTextInput(menu, ctx = {}) { clearActiveGiftScreen(ctx.userId); return rewriteScreen(await base.handleTextInput(menu, ctx), ctx); }
function isCleanGiftAction(action = '') { return CLEAN_GIFT_ACTIONS.includes(clean(action)) || (base.isCleanGiftAction ? base.isCleanGiftAction(action) : false); }

module.exports = { ...base, RUNTIME, CLEAN_GIFT_ACTIONS, GIFTS_FLOW_AUDIT_PR223, GIFTS_FLOW_AUDIT_PR222, isCleanGiftAction, screenForPayload, handleTextInput, homeScreen, patchGiftButton, resolveGiftContext, loadGiftFeatureState, commitGiftFeatureState, clearGiftDraftOnly, bindGiftTarget, getGiftTarget, clearGiftTargetOnlyOnExplicitReset, traceGiftAction };
