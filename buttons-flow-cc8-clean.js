'use strict';

const store = require('./store');
const tenant = require('./tenant-scope');
const db = require('./cc5-db-core');
const max = require('./services/maxApi');
const postPatcher = require('./services/postPatcher');
const clientAccessService = require('./services/clientAccessService');
const channelTitles = require('./human-channel-title-helper');
const pickerCore = require('./channel-post-picker-core');
const postFeatureBinding = require('./post-feature-binding');

const RUNTIME = 'CC8.3.62-PR222-FLOW-LAYER-AUDIT-BUTTONS-GIFTS';
const MAX_POSTS = 8;
const CLEAN_BUTTON_ACTIONS = [
  'admin_section_buttons', 'button_admin_recent_posts', 'button_admin_channel_pick', 'button_admin_select_post', 'button_admin_show_current',
  'button_admin_start_add', 'button_admin_save', 'button_admin_preview_back', 'button_admin_cancel', 'button_admin_delete', 'button_admin_delete_confirm', 'button_admin_edit', 'button_admin_edit_text', 'button_admin_edit_url', 'button_admin_reorder_up', 'button_admin_reorder_down'
];

function clean(value) { return String(value || '').trim(); }
function n(value) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }
function array(value) { return Array.isArray(value) ? value : []; }
function safeCall(fn, fallback) { try { return fn(); } catch { return fallback; } }
function short(value, max = 72) { const s = clean(value).replace(/\s+/g, ' '); return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trim() + '…'; }
function looksTechnicalId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^id\d{6,}$/i.test(s); }
function button(menu, text, action, extra) { return menu.button(text, action, extra || {}); }
function keyboard(menu, rows) { return menu.keyboard(rows); }
function footer(menu) { return [[button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]; }
function screen(menu, id, title, lines, rows) { return { id, text: [title, '', ...(lines || [])].filter(Boolean).join('\n'), attachments: keyboard(menu, rows || footer(menu)) }; }
function getTenant(userId = '') { return tenant.ensureTenantContext(userId); }
function getSetup(userId = '') { getTenant(userId); return safeCall(() => store.getSetupState(clean(userId)), {}) || {}; }
function storedChannelTitle(channelId = '', userId = '') { return channelTitles.resolveHumanChannelTitle(channelId, userId); }
function channelTitle(post = {}, userId = '') { const id = clean(post.channelId || post.requiredChatId || ''); const stored = storedChannelTitle(id, userId); if (stored && !looksTechnicalId(stored)) return stored; const explicit = clean(post.channelTitle || post.channelName || post.chatTitle || post.chat_title || ''); if (explicit && !looksTechnicalId(explicit) && explicit !== postTitle(post)) return explicit; return id || 'Канал без названия'; }

function titleFromChatResponse(chat = {}) {
  return clean(chat.title || chat.name || chat.chatTitle || chat.chat_title || chat?.chat?.title || chat?.body?.title || chat?.body?.name || chat?.payload?.title || '');
}
async function hydrateChannelTitle(post = {}, ctx = {}) {
  const channelId = clean(post.channelId || post.requiredChatId || '');
  if (!channelId || (clean(post.channelTitle) && !looksTechnicalId(post.channelTitle))) return post;
  const cached = storedChannelTitle(channelId, ctx.userId || '');
  if (cached) return { ...post, channelTitle: cached };
  if (!ctx.config?.botToken) return post;
  const chat = await max.getChat({ botToken: ctx.config.botToken, chatId: channelId, timeoutMs: 1200 }).catch(() => null);
  const title = titleFromChatResponse(chat);
  if (!title || looksTechnicalId(title)) return post;
  safeCall(() => store.saveChannel(channelId, { title, channelTitle: title, chatTitle: title }), null);
  return { ...post, channelTitle: title };
}
function postTitle(post = {}) {
  const text = clean(post.originalText || post.postText || post.text || post.caption || post.title || post.preview || '');
  if (text) return short(text, 58);
  const attachments = array(post.sourceAttachments || post.attachments);
  if (attachments.length) return attachments.some((item) => /image|photo/i.test(clean(item.type))) ? 'Пост с фото' : 'Пост с вложением';
  return 'Пост без текста';
}
function postTime(post = {}) { const ts = n(post.updatedAt || post.createdAt || post.ts || 0); if (!ts) return ''; try { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); } catch { return ''; } }
function targetRecord(post = {}, userId = '') { const identity = postFeatureBinding.normalizePostFeatureIdentity(post, userId); return tenant.stampRecord({ ...identity, channelTitle: channelTitle({ ...post, channelId: identity.channelId }, userId), originalText: clean(post.originalText || post.postText || post.text || post.title || identity.preview || ''), linkedAt: Date.now() }, getTenant(userId), post); }
function postLooksInternal(post = {}) { return pickerCore.looksInternal([post.channelId, post.requiredChatId, post.channelTitle, post.title, post.originalText, post.postText, post.text, post.caption, post.commentKey].join(' ')); }
function storePostsSnapshot() { const raw = store && store.store && store.store.posts && typeof store.store.posts === 'object' ? Object.values(store.store.posts) : []; return array(raw).filter((item) => item && typeof item === 'object'); }
function tenantPostChannelIds(userId = '') { const ctx = getTenant(userId); return storePostsSnapshot().filter((post) => post && tenant.belongsToTenant(post, ctx) && !postLooksInternal(post)).map((post) => clean(post.channelId || post.requiredChatId || '')).filter(Boolean); }
function visibleChannelIds(userId = '') { const ids = safeCall(() => clientAccessService.getClientChannels(userId), []).map((channel) => clean(channel.channelId || channel.id)).filter(Boolean); tenantPostChannelIds(userId).forEach((id) => ids.push(id)); return new Set(ids); }
function channelVisibleToClient(post = {}, channelIds = new Set(), userId = '') { return !clean(userId) || channelIds.has(clean(post.channelId || post.requiredChatId || '')); }
function findPost(commentKey = '', userId = '') { const key = clean(commentKey); if (!key) return null; const ctx = getTenant(userId); const channelIds = visibleChannelIds(userId); const post = safeCall(() => store.getPost(key), null) || storePostsSnapshot().find((item) => clean(item && item.commentKey) === key) || null; return post && tenant.belongsToTenant(post, ctx) && channelVisibleToClient(post, channelIds, userId) && !postLooksInternal(post) ? post : null; }

function sameTargetIdentity(a = {}, b = {}) {
  if (!a || !b) return false;
  const ac = clean(a.commentKey); const bc = clean(b.commentKey);
  if (ac && bc && ac !== bc) return false;
  const ach = clean(a.channelId || a.requiredChatId); const bch = clean(b.channelId || b.requiredChatId);
  if (ach && bch && ach !== bch) return false;
  const ap = clean(a.postId); const bp = clean(b.postId);
  if (ap && bp && ap !== bp) return false;
  return Boolean((ac && bc) || (ach && bch && ap && bp));
}
function activePreviewTarget(state = {}) {
  return {
    userId: clean(state.buttonsActivePreviewUserId),
    commentKey: clean(state.buttonsActivePreviewCommentKey),
    channelId: clean(state.buttonsActivePreviewChannelId),
    postId: clean(state.buttonsActivePreviewPostId)
  };
}
function markPreviewSent(userId = '', flow = null, messageId = '') {
  const uid = clean(userId); const mid = clean(messageId); const target = flow && flow.targetPost || {};
  if (!uid || !flow || !mid || !clean(flow.flowId) || !clean(target.commentKey)) return false;
  safeCall(() => store.setSetupState(uid, {
    buttonsActivePreviewMessageId: mid,
    buttonsActivePreviewFlowId: clean(flow.flowId),
    buttonsActivePreviewUserId: uid,
    buttonsActivePreviewCommentKey: clean(target.commentKey),
    buttonsActivePreviewChannelId: clean(target.channelId || target.requiredChatId),
    buttonsActivePreviewPostId: clean(target.postId),
    buttonsActivePreviewAt: Date.now(),
    buttonsActivePreviewRuntime: RUNTIME
  }), null);
  return true;
}
function callbackSaveMatchesActivePreview(state = {}, payload = {}, ctx = {}) {
  const uid = clean(ctx.userId);
  const activeUser = clean(state.buttonsActivePreviewUserId);
  if (activeUser && activeUser !== uid) return false;
  const activeFlowId = clean(state.buttonsActivePreviewFlowId);
  const payloadFlowId = clean(payload.flowId);
  if (activeFlowId && payloadFlowId && activeFlowId === payloadFlowId) return true;
  const callbackMid = clean(ctx.callbackMessageId || '');
  const activeMid = clean(state.buttonsActivePreviewMessageId || '');
  if (callbackMid && activeMid && callbackMid === activeMid) return true;
  const payloadTarget = { commentKey: payload.commentKey, channelId: payload.channelId, postId: payload.postId };
  if (sameTargetIdentity(activePreviewTarget(state), payloadTarget)) return true;
  return false;
}
function buttonAlreadyExists(buttons = [], draft = {}) {
  const text = clean(draft.text).toLowerCase();
  const url = normalizeButtonUrl(draft.url || '').toLowerCase();
  return array(buttons).some((item) => clean(item.text || item.title).toLowerCase() === text && normalizeButtonUrl(item.url || item.href || item.targetUrl || '').toLowerCase() === url);
}
function saveInFlightScreen() { return { id: 'buttons_clean_save_inflight', text: 'Сохранение кнопки уже выполняется. Подождите результат.', attachments: [] }; }
function saveInFlightActive(state = {}, ctx = {}) {
  if (!Number(state.buttonsPendingPreviewSaveInFlightAt || 0)) return false;
  const activeToken = clean(state.buttonsPendingPreviewSaveInFlightToken || '');
  const allowedToken = clean(ctx.allowCurrentSaveInFlightToken || '');
  return !(activeToken && allowedToken && activeToken === allowedToken);
}
function lastSavedPreviewMatches(state = {}, payload = {}, ctx = {}) {
  const last = state.buttonsLastSavedPreview || null;
  if (!last) return false;
  if (clean(last.userId) && clean(last.userId) !== clean(ctx.userId)) return false;
  const callbackMid = clean(ctx.callbackMessageId || '');
  if (callbackMid && clean(last.messageId) && callbackMid === clean(last.messageId)) return true;
  if (clean(payload.flowId) && clean(last.flowId) && clean(payload.flowId) === clean(last.flowId)) return true;
  return sameTargetIdentity(last.targetPost || {}, { commentKey: payload.commentKey, channelId: payload.channelId, postId: payload.postId });
}

function sameStoredTarget(stored = {}, post = {}) { const storedChannelId = clean(stored.channelId || stored.requiredChatId); const postChannelId = clean(post.channelId || post.requiredChatId); if (!clean(stored.commentKey) || clean(stored.commentKey) !== clean(post.commentKey)) return false; if (storedChannelId && postChannelId && storedChannelId !== postChannelId) return false; if (clean(stored.postId) && clean(post.postId) && clean(stored.postId) !== clean(post.postId)) return false; if (clean(stored.messageId) && clean(post.messageId) && clean(stored.messageId) !== clean(post.messageId)) return false; return true; }
function clearButtonState(userId = '') { const uid = clean(userId); if (!uid) return; safeCall(() => { const prev = getSetup(uid); store.setSetupState(uid, { buttonTargetPost: null, buttonFlow: null, buttonsCurrentCard: null, buttonTargetDiagnostics: recordTargetDiagnostic(prev, 'stale_saved_target'), activeAdminFlowKind: clean(prev.activeAdminFlowKind) === 'button' ? '' : prev.activeAdminFlowKind }); }, null); }
function recordTargetDiagnostic(prev = {}, status = '', extra = {}) { const diagnostics = array(prev.buttonTargetDiagnostics).slice(-9); diagnostics.push({ status: clean(status), at: Date.now(), ...extra }); return diagnostics; }
function recordRouteTrace(userId = '', step = '', extra = {}) { const uid = clean(userId); if (!uid || !step) return; safeCall(() => { const prev = getSetup(uid); const trace = array(prev.buttonSaveRouteTrace).slice(-11); trace.push({ step: clean(step), at: Date.now(), ...extra }); store.setSetupState(uid, { buttonSaveRouteTrace: trace }); }, null); }
function clearCurrentCard(userId = '', status = '') { const uid = clean(userId); if (!uid) return; safeCall(() => { const prev = getSetup(uid); store.setSetupState(uid, { buttonsCurrentCard: null, ...(status ? { buttonTargetDiagnostics: recordTargetDiagnostic(prev, status) } : {}) }); }, null); }
function currentCardId() { return `buttons_card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function targetIsValid(target = {}, userId = '') { return Boolean(target && clean(target.commentKey) && clean(target.channelId || target.requiredChatId) && tenant.belongsToTenant(target, getTenant(userId)) && !postLooksInternal(target)); }
function getCurrentCard(userId = '') { const card = getSetup(userId).buttonsCurrentCard || null; if (!targetIsValid(card, userId) || !card.cardId) return null; return card; }
function bindCurrentCard(userId = '', post = {}) { const uid = clean(userId); const card = { ...targetRecord(post, uid), cardId: currentCardId(), createdAt: Date.now(), source: 'buttons_selected_post_card' }; safeCall(() => { const prev = getSetup(uid); store.setSetupState(uid, { buttonsCurrentCard: card, buttonTargetDiagnostics: recordTargetDiagnostic(prev, 'current_card', { commentKey: card.commentKey }) }); }, null); return card; }
function dbPost(row = {}, channelId = '', userId = '') { const raw = row.raw && typeof row.raw === 'object' ? row.raw : {}; const sample = raw.sample && typeof raw.sample === 'object' ? raw.sample : {}; const id = clean(channelId || row.channelId || row.channel_id || ''); const title = clean(row.title || row.postTitle || row.preview || row.originalText || row.postId || 'Пост'); const updatedAtRaw = row.updatedAt || row.updated_at || row.updated || 0; const updatedAt = updatedAtRaw instanceof Date ? updatedAtRaw.getTime() : (Date.parse(updatedAtRaw) || n(updatedAtRaw)); return { channelId: id, channelTitle: storedChannelTitle(id, userId) || id, postId: clean(row.postId || row.post_id || ''), messageId: clean(row.messageId || row.message_id || raw.messageId || raw.message_id || sample?.message?.id || sample?.callback?.message?.id || ''), commentKey: clean(row.commentKey || row.comment_key || raw.commentKey || ''), title, originalText: title, postText: title, customKeyboard: raw.customKeyboard || raw.custom_keyboard || sample.customKeyboard || sample.custom_keyboard || null, raw, updatedAt, source: 'cc5-db-core' }; }
async function dbPosts(channelId = '', userId = '') { const channel = clean(channelId); const admin = clean(userId); if (!channel || !admin || !db || typeof db.getPosts !== 'function') return []; try { return array(await db.getPosts(admin, channel, MAX_POSTS)).map((row) => dbPost(row, channel, admin)).filter((post) => clean(post.commentKey) && clean(post.postId) && !postLooksInternal(post)); } catch { return []; } }
function listAllPosts(userId = '') { const ctx = getTenant(userId); const channelIds = visibleChannelIds(userId); const seen = new Set(); return storePostsSnapshot().filter((post) => post && clean(post.commentKey) && clean(post.channelId) && clean(post.postId) && tenant.belongsToTenant(post, ctx) && channelVisibleToClient(post, channelIds, userId) && !postLooksInternal(post)).filter((post) => { const key = clean(post.commentKey); if (!key || seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => n(b.updatedAt || b.createdAt || b.ts) - n(a.updatedAt || a.createdAt || a.ts)); }
function listPosts(channelId = '', userId = '') { const channel = clean(channelId); return listAllPosts(userId).filter((post) => !channel || clean(post.channelId) === channel).slice(0, MAX_POSTS); }
async function listPostsForChannel(channelId = '', userId = '') { const fromDb = await dbPosts(channelId, userId); return fromDb.length ? fromDb : listPosts(channelId, userId); }
async function findPostForSelection(commentKey = '', userId = '', channelId = '') { const key = clean(commentKey); const channel = clean(channelId); if (!key) return null; if (channel) { const posts = await dbPosts(channel, userId); const found = posts.find((post) => clean(post.commentKey) === key); if (found) return found; } return findPost(key, userId); }
async function listChannelsFromPosts(userId = '', config = {}) { return pickerCore.listUiChannelsForUser(userId, config); }
function getStoredTarget(userId = '') { const state = getSetup(userId); const stored = state.buttonTargetPost || state.commentTargetPost || null; if (!targetIsValid(stored, userId)) { if (stored && stored.commentKey) clearButtonState(userId); return null; } return stored; }
function getValidatedFlowTarget(flow = null, userId = '') { const target = flow && flow.targetPost ? flow.targetPost : null; return targetIsValid(target, userId) ? target : null; }
function bindTarget(userId = '', post = {}, options = {}) { const uid = clean(userId); const target = targetRecord(post, uid); if (!uid || !target.commentKey) return target; safeCall(() => { const prev = getSetup(uid); const adminUi = { ...(prev.adminUi || {}), section: 'buttons', backAction: 'admin_section_buttons', rootAction: 'admin_section_buttons', selectMode: 'buttons' }; const patch = { tenantKey: target.tenantKey, ownerUserId: target.ownerUserId, buttonTargetPost: target, commentTargetPost: target, adminUi, activeAdminUi: adminUi }; if (!options.keepFlow) { patch.buttonFlow = null; patch.activeAdminFlowKind = ''; } store.setSetupState(uid, patch); }, null); return target; }
function buttonIdAt(buttons = [], index = 0) { const item = array(buttons)[index] || {}; return clean(item.id) || `btn_${index + 1}`; }
function selectedCardRows(menu, card = null, buttons = []) { const count = array(buttons).length; const cardId = clean(card?.cardId); const rows = []; rows.push([button(menu, count ? '➕ Добавить ещё кнопку' : '➕ Добавить кнопку', 'button_admin_start_add', { cardId })]); if (count === 1) { const data = { cardId, buttonId: buttonIdAt(buttons, 0) }; rows.push([button(menu, '✏️ Изменить кнопку', 'button_admin_edit', data)]); rows.push([button(menu, '🗑 Удалить кнопку', 'button_admin_delete_confirm', data)]); } else if (count > 1) { rows.push([button(menu, '✏️ Изменить кнопку', 'button_admin_edit', { cardId })]); rows.push([button(menu, '🗑 Удалить кнопку', 'button_admin_delete_confirm', { cardId })]); } rows.push([button(menu, '📌 Выбрать другой пост', 'button_admin_recent_posts', { page: 0 })], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]); return rows; }
function buttonCountText(count = 0) { const value = Math.abs(Number(count) || 0); const mod10 = value % 10; const mod100 = value % 100; if (mod10 === 1 && mod100 !== 11) return `${count} кнопка`; if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} кнопки`; return `${count} кнопок`; }
function selectedPostLines(target = null, buttons = [], userId = '') { const count = array(buttons).length; return [`Пост выбран: «${postTitle(target)}»`, ...targetLines(target, userId), '', count ? `Текущие кнопки (${count}):` : 'Текущие кнопки: пока нет кнопок', ...(count ? buttonsLines(buttons) : []), '', count ? 'Что сделать?' : 'Добавьте первую кнопку для этого поста.']; }
function selectedCardScreen(menu, target = null, card = null, buttons = [], note = '', userId = '') { return screen(menu, 'buttons_clean_selected_post', '🔘 Пост для кнопок выбран', [clean(note), ...selectedPostLines(target, buttons, userId)].filter(Boolean), selectedCardRows(menu, card, buttons)); }
function channelStore(channelId = '') { const id = clean(channelId); if (!store.store.growth) store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} }; if (!store.store.growth.byChannel) store.store.growth.byChannel = {}; if (!store.store.growth.byChannel[id]) store.store.growth.byChannel[id] = { channelId: id }; if (!store.store.growth.byChannel[id].buttonSets) store.store.growth.byChannel[id].buttonSets = {}; return store.store.growth.byChannel[id]; }
function buttonsFromStoredPost(target = null, userId = '') { const post = findPost(clean(target && target.commentKey), userId) || safeCall(() => store.getPost(clean(target && target.commentKey)), null) || target || null; const rows = array(post && post.customKeyboard && post.customKeyboard.rows); const buttons = []; rows.forEach((row) => array(row.buttons).forEach((btn) => { if (clean(btn.text) && clean(btn.url || btn.href || btn.targetUrl)) buttons.push(tenant.stampRecord({ id: clean(btn.id), text: clean(btn.text), url: normalizeButtonUrl(btn.url || btn.href || btn.targetUrl), commentKey: clean(target.commentKey), channelId: clean(target.channelId || target.requiredChatId), source: 'canonical_stored_post_customKeyboard' }, getTenant(userId), btn)); })); return buttons; }
function getButtonSet(target = null, userId = '') { if (!target || !target.channelId || !target.commentKey) return []; const ctx = getTenant(userId); const set = array(channelStore(target.channelId).buttonSets[clean(target.commentKey)]).filter((item) => tenant.belongsToTenant(item, ctx)); const fromPost = buttonsFromStoredPost(target, userId); const merged = [...set]; fromPost.forEach((item) => { if (!buttonAlreadyExists(merged, { text: item.text || item.title, url: item.url || item.href || item.targetUrl })) merged.push(item); }); return merged; }
function normalizeButtonUrl(value = '') { return clean(value).replace(/^https?:\/\//i, (m) => m.toLowerCase()); }
function customKeyboardFromButtons(buttons = []) { const rows = array(buttons).map((item, index) => { const text = clean(item.text || item.title || 'Кнопка').slice(0, 64); const url = normalizeButtonUrl(item.url || item.href || item.targetUrl || ''); return { id: `custom_button_row_${index + 1}`, buttons: [{ id: clean(item.id) || `btn_${index + 1}`, text, type: 'link', url, enabled: Boolean(text && url) }] }; }).filter((row) => row.buttons.some((item) => item.enabled)); return { enabled: rows.length > 0, rows }; }
function saveButtonSet(target = null, buttons = [], userId = '') { if (!target || !target.channelId || !target.commentKey) return []; const ctx = getTenant(userId); const key = clean(target.commentKey); const stamped = array(buttons).map((item, index) => tenant.stampRecord({ ...item, url: normalizeButtonUrl(item.url || ''), id: clean(item.id) || `btn_${index + 1}`, postIds: [clean(target.postId)].filter(Boolean), commentKey: key, channelId: clean(target.channelId), order: index + 1 }, ctx, item)); const bucket = channelStore(target.channelId); const existing = array(bucket.buttonSets[key]); const otherTenants = existing.filter((item) => !tenant.belongsToTenant(item, ctx)); bucket.buttonSets[key] = [...otherTenants, ...stamped]; safeCall(() => store.savePost(key, { customKeyboard: customKeyboardFromButtons(stamped), lastCustomKeyboardUpdatedAt: Date.now(), lastCustomKeyboardRuntime: RUNTIME }), null); safeCall(() => store.saveStore(store.store), null); return stamped; }
function setButtonFlow(userId = '', flow = null) { const uid = clean(userId); if (!uid) return null; const ctx = getTenant(uid); safeCall(() => { const prev = getSetup(uid); const adminUi = { ...(prev.adminUi || {}), section: 'buttons', backAction: 'admin_section_buttons', rootAction: 'admin_section_buttons', selectMode: 'buttons' }; store.setSetupState(uid, { tenantKey: ctx.tenantKey, ownerUserId: ctx.ownerUserId, buttonFlow: flow, giftFlow: null, commentAdminFlow: null, postEditFlow: null, activeAdminFlowKind: flow ? 'button' : '', adminUi, activeAdminUi: adminUi }); }, null); return flow; }
function targetLines(target = null, userId = '') { if (!target || !target.commentKey) return ['Пост пока не выбран.']; const channel = channelTitle(target, userId); const channelText = clean(channel) && !looksTechnicalId(channel) ? channel : clean(target.channelId || target.requiredChatId || 'канал не определён'); return [`Канал: ${channelText}`, `Пост: ${postTitle(target)}`]; }
function buttonsLines(buttons = []) { if (!buttons.length) return ['Текущие кнопки: пока нет кнопок']; return buttons.map((item, index) => `${index + 1}. ${clean(item.text || 'Кнопка')} → ${short(item.url || item.action || 'без ссылки', 90)}`); }
function patchOptions(target = null, ctx = {}) { const storedPost = safeCall(() => store.getPost(clean(target?.commentKey)), null) || {}; const diag = postFeatureBinding.patchIdDiagnostics(target || {}, storedPost); if (diag.patchMessageId && clean(target?.commentKey)) safeCall(() => store.savePost(clean(target.commentKey), { messageId: diag.patchMessageId, postId: clean(target.postId || storedPost.postId || diag.patchMessageId), channelId: clean(target.channelId || target.requiredChatId || storedPost.channelId), lastButtonPatchIdentity: diag }), null); return { botToken: ctx.config?.botToken, appBaseUrl: ctx.config?.appBaseUrl, botUsername: ctx.config?.botUsername, maxDeepLinkBase: ctx.config?.maxDeepLinkBase, commentKey: clean(target?.commentKey), buttonPatchIdentity: diag }; }
function patchDiagnostic(result = null) {
  if (!result) return 'unknown_patch_result';
  if (result.reason) return clean(result.reason);
  const status = clean(result.error?.status || '');
  const message = clean(result.error?.message || result.error || 'patch_failed');
  return status ? `${message} (status ${status})` : message;
}
function storePatchDiagnostic(userId = '', result = null) {
  const uid = clean(userId);
  if (!uid) return;
  safeCall(() => {
    const prev = getSetup(uid);
    store.setSetupState(uid, {
      lastButtonPatchResult: result || null,
      lastButtonPatchError: result?.ok ? null : { reason: patchDiagnostic(result), at: Date.now(), result: result || null },
      buttonTargetDiagnostics: result?.ok ? prev.buttonTargetDiagnostics : recordTargetDiagnostic(prev, 'patch_failed', { reason: patchDiagnostic(result) })
    });
  }, null);
}
async function repatchTarget(target = null, ctx = {}) { if (!target || !target.commentKey) return { ok: false, skipped: true, reason: 'target_missing' }; const options = patchOptions(target, ctx); if (!options.buttonPatchIdentity.patchMessageId) return { ok: false, reason: 'message_id_missing', diagnostic: options.buttonPatchIdentity }; try { const result = await postPatcher.patchStoredPost(options); storePatchDiagnostic(ctx.userId, result); return result; } catch (error) { const result = { ok: false, error: { message: clean(error?.message || error || 'patch_failed'), status: error?.status || 0, data: error?.data || null } }; storePatchDiagnostic(ctx.userId, result); return result; } }
function patchNote(result = null, savedText = 'Кнопка сохранена') { if (result?.ok) return result.skipped ? `${savedText}. Пост уже был в актуальном состоянии.` : `${savedText}. Пост обновлён.`; return `${savedText}, но пост не обновился: ${patchDiagnostic(result)}`; }
function homeRows(menu, target = null, flow = null, userId = '') { const rows = []; if (flow) rows.push([button(menu, '❌ Отменить черновик', 'button_admin_cancel')]); else if (target && target.commentKey) return selectedCardRows(menu, target, getButtonSet(target, userId)); else rows.push([button(menu, '📌 Выбрать пост для кнопок', 'button_admin_recent_posts', { page: 0 })]); rows.push([button(menu, '🏠 Главное меню', 'admin_section_main')]); return rows; }
async function home(menu, payload = {}, ctx = {}) { const state = getSetup(ctx.userId); let savedTarget = getStoredTarget(ctx.userId); const flow = state.buttonFlow && getValidatedFlowTarget(state.buttonFlow, ctx.userId) ? state.buttonFlow : null; if (savedTarget && !flow) savedTarget = await hydrateChannelTitle(savedTarget, ctx); if (!savedTarget && !flow) clearCurrentCard(ctx.userId); const currentButtons = savedTarget && !flow ? getButtonSet(savedTarget, ctx.userId) : []; const lines = savedTarget && !flow ? ['Выбранный пост:', ...targetLines(savedTarget, ctx.userId), '', 'Текущие кнопки:', ...buttonsLines(currentButtons)] : ['Сначала выберите канал и пост, к которому нужно добавить пользовательскую кнопку.', '', ...buttonsLines([])]; if (payload.note) lines.unshift(clean(payload.note), ''); return screen(menu, 'buttons_clean_home', '🔘 Кнопки под постами', lines, homeRows(menu, savedTarget, flow, ctx.userId)); }
async function channelPicker(menu, payload = {}, ctx = {}) { const built = await pickerCore.buildChannelPickerRows(menu, ctx.userId, 'buttons', ctx.config || {}); const rows = built.rows.length ? built.rows : [[button(menu, 'Подключить канал', 'admin_bind_channel')]]; rows.push(...footer(menu)); return screen(menu, 'buttons_clean_channel_picker', '📺 Канал для кнопок', ['Выберите канал. После этого будут показаны только посты этого канала.'], rows); }
async function picker(menu, payload = {}, ctx = {}) { const page = Math.max(0, Number(payload.page || 0)); const channelId = clean(payload.channelId || ''); const channels = await listChannelsFromPosts(ctx.userId, ctx.config || {}); if (!channelId && channels.length > 1 && clean(payload.skipChannels || '') !== '1') return channelPicker(menu, payload, ctx); const posts = await listPostsForChannel(channelId, ctx.userId); if (channelId && posts[0]) await hydrateChannelTitle(posts[0], ctx); const rows = posts.map((post, index) => [button(menu, `${index + 1 + page * MAX_POSTS}. ${pickerCore.safePostPreview(post)}`, 'button_admin_select_post', { commentKey: clean(post.commentKey), channelId, postId: clean(post.postId) })]); if (!rows.length) rows.push([button(menu, 'В этом канале пока нет сохранённых постов.', 'admin_section_buttons')]); rows.push(...footer(menu)); const resolvedTitle = channelId ? (channels.find((item) => clean(item.channelId) === channelId)?.title || channelTitle(posts[0] || { channelId }, ctx.userId)) : ''; const lines = [channelId ? `Канал: ${resolvedTitle}` : 'Выберите пост.', '']; if (posts.length) { posts.forEach((post, index) => { const meta = [postTime(post)].filter(Boolean).join(' · '); lines.push(`${index + 1}. ${pickerCore.safePostPreview(post)}${meta ? '\n   ' + meta : ''}`); }); } else if (channelId) lines.push('В этом канале пока нет сохранённых постов.'); return screen(menu, 'buttons_clean_picker', '📌 Выбор поста для кнопок', lines, rows); }
async function selectPost(menu, payload = {}, ctx = {}) { let post = await findPostForSelection(payload.commentKey || '', ctx.userId, payload.channelId || ''); if (!post || !post.commentKey) return screen(menu, 'buttons_clean_not_found', '🔘 Кнопки под постами', ['Пост не найден для выбранного канала.'], [[button(menu, '📌 Выбрать пост', 'button_admin_recent_posts', { page: 0 })], ...footer(menu)]); post = await hydrateChannelTitle(post, ctx); bindTarget(ctx.userId, post); const card = bindCurrentCard(ctx.userId, post); const imported = getButtonSet(post, ctx.userId); return selectedCardScreen(menu, post, card, imported, imported.length ? `Пост для кнопок выбран. Найдены текущие кнопки: ${imported.length}.` : 'Пост для кнопок выбран. Кнопок пока нет.', ctx.userId); }
function currentRows(menu, target = null, buttons = []) { return selectedCardRows(menu, target, buttons); }

async function targetFromPayload(payload = {}, ctx = {}) {
  const commentKey = clean(payload.commentKey || payload.key || '');
  const channelId = clean(payload.channelId || payload.requiredChatId || '');
  const postId = clean(payload.postId || '');
  if (!commentKey) return null;
  let post = await findPostForSelection(commentKey, ctx.userId, channelId);
  if (!post && findPost(commentKey, ctx.userId)) post = findPost(commentKey, ctx.userId);
  if (!post) return null;
  const postChannelId = clean(post.channelId || post.requiredChatId || '');
  if (channelId && postChannelId && channelId !== postChannelId) return null;
  if (postId && clean(post.postId) && postId !== clean(post.postId)) return null;
  const target = targetRecord(post, ctx.userId);
  return targetIsValid(target, ctx.userId) ? target : null;
}
async function currentTarget(payload = {}, ctx = {}) {
  const fromPayload = await targetFromPayload(payload, ctx);
  if (fromPayload) return fromPayload;
  const card = getCurrentCard(ctx.userId);
  if (card) return card;
  return getStoredTarget(ctx.userId);
}

async function resolveSelectedButtonsContext(ctx = {}, payload = {}) {
  const userId = clean(ctx.userId);
  const sourceDiagnostics = [];
  const tenantCtx = getTenant(userId);
  let target = await targetFromPayload(payload, ctx);
  if (target) sourceDiagnostics.push({ source: 'payload', ok: true });
  const card = getCurrentCard(userId);
  const payloadCardId = clean(payload.cardId || payload.currentCardId || '');
  if (!target && card) { target = card; sourceDiagnostics.push({ source: 'current_card', ok: true }); }
  if (payloadCardId && (!card || payloadCardId !== clean(card.cardId))) sourceDiagnostics.push({ source: 'current_card', ok: false, reason: 'stale_card_ignored', requestedCardId: payloadCardId, currentCardId: clean(card?.cardId || '') });
  if (!target) { target = getStoredTarget(userId); if (target) sourceDiagnostics.push({ source: 'stored_target', ok: true }); }
  if (target) target = await hydrateChannelTitle(target, ctx);
  if (!target || !target.commentKey) return { ok: false, userId, tenantKey: tenantCtx.tenantKey, ownerUserId: tenantCtx.ownerUserId, channelId: '', channelTitle: '', postId: '', commentKey: '', postTitle: '', target: null, buttons: [], sourceDiagnostics };
  target = bindTarget(userId, target, { keepFlow: Boolean(getSetup(userId).buttonFlow) });
  const buttons = loadButtonsFeatureState({ userId, target });
  return { ok: true, userId, tenantKey: tenantCtx.tenantKey, ownerUserId: tenantCtx.ownerUserId, channelId: clean(target.channelId || target.requiredChatId), channelTitle: channelTitle(target, userId), postId: clean(target.postId), commentKey: clean(target.commentKey), postTitle: postTitle(target), target, buttons, sourceDiagnostics };
}
function loadButtonsFeatureState(context = {}) { return getButtonSet(context.target, context.userId); }
function renderButtonsSelectedPostScreen(menu, context = {}, note = '') { const card = bindCurrentCard(context.userId, context.target); const buttons = array(context.buttons).length === loadButtonsFeatureState(context).length ? context.buttons : loadButtonsFeatureState(context); return selectedCardScreen(menu, context.target, card, buttons, note, context.userId); }
async function mutateButtonsFeatureState(context = {}, operation = {}) { const buttons = array(context.buttons); let next = buttons; if (operation.type === 'replace') next = buttons.map((item, index) => index === Number(operation.index) ? { ...item, ...(operation.patch || {}) } : item); if (operation.type === 'delete') next = buttons.filter((_, index) => index !== Number(operation.index)); if (operation.type === 'append') next = [...buttons, operation.button].filter(Boolean); const saved = saveButtonSet(context.target, next, context.userId); const patch = await repatchTarget(context.target, operation.ctx || {}); bindTarget(context.userId, context.target); return { ...context, buttons: saved, patch }; }

async function showCurrent(menu, payload = {}, ctx = {}) { const context = await resolveSelectedButtonsContext(ctx, payload); if (!context.ok) return picker(menu, { page: 0 }, ctx); return renderButtonsSelectedPostScreen(menu, context, clean(payload.note || '')); }
function findButtonIndex(buttons = [], buttonId = '') { const id = clean(buttonId); if (!id) return array(buttons).length === 1 ? 0 : -1; return array(buttons).findIndex((item, index) => (clean(item.id) || `btn_${index + 1}`) === id); }
async function selectedTargetFromCardOrStore(payload = {}, ctx = {}) { const context = await resolveSelectedButtonsContext(ctx, payload); return context.ok ? context.target : null; }
async function renderEdit(menu, payload = {}, ctx = {}) {
  const context = await resolveSelectedButtonsContext(ctx, payload);
  if (!context.ok) return picker(menu, { page: 0 }, ctx);
  const target = context.target;
  const buttons = context.buttons;
  const index = findButtonIndex(buttons, payload.buttonId);
  if (buttons.length > 1 && index < 0) {
    const rows = buttons.map((item, i) => [button(menu, `${i + 1}. ${short(item.text || item.title || 'Кнопка', 48)}`, 'button_admin_edit', { buttonId: buttonIdAt(buttons, i), cardId: clean(payload.cardId || '') })]);
    rows.push([button(menu, '↩️ Назад', 'button_admin_show_current')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]);
    return screen(menu, 'buttons_clean_edit_pick', '✏️ Какую кнопку изменить?', [...targetLines(target, ctx.userId), '', ...buttonsLines(buttons)], rows);
  }
  const buttonIndex = index >= 0 ? index : 0;
  const item = buttons[buttonIndex];
  if (!item) return selectedCardScreen(menu, target, bindCurrentCard(ctx.userId, target), buttons, 'Кнопка для изменения не найдена.', ctx.userId);
  const data = { buttonId: buttonIdAt(buttons, buttonIndex), cardId: clean(payload.cardId || '') };
  return screen(menu, 'buttons_clean_edit_actions', '✏️ Изменить кнопку', [...targetLines(target, ctx.userId), '', `Кнопка: ${clean(item.text || item.title || 'Кнопка')}`, `Ссылка: ${clean(item.url || item.action || '')}`, '', 'Что изменить?'], [[button(menu, '✏️ Изменить текст', 'button_admin_edit_text', data)], [button(menu, '🔗 Изменить URL', 'button_admin_edit_url', data)], [button(menu, '↩️ Назад', 'button_admin_show_current')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]);
}
async function startEditInput(menu, payload = {}, ctx = {}, field = 'text') {
  const context = await resolveSelectedButtonsContext(ctx, payload);
  if (!context.ok) return picker(menu, { page: 0 }, ctx);
  const target = context.target;
  const buttons = context.buttons;
  const index = findButtonIndex(buttons, payload.buttonId);
  const item = index >= 0 ? buttons[index] : null;
  if (!item) return renderEdit(menu, payload, ctx);
  const flow = tenant.stampRecord({ mode: 'button_edit', editField: field, editButtonId: buttonIdAt(buttons, index), stepIndex: 0, targetPost: target, flowId: currentCardId(), runtimeVersion: RUNTIME }, getTenant(ctx.userId), item);
  setButtonFlow(ctx.userId, flow);
  return screen(menu, field === 'url' ? 'buttons_clean_edit_url' : 'buttons_clean_edit_text', field === 'url' ? '🔗 Изменить URL кнопки' : '✏️ Изменить текст кнопки', [...targetLines(target, ctx.userId), '', `Сейчас: ${field === 'url' ? clean(item.url || '') : clean(item.text || item.title || '')}`, '', field === 'url' ? 'Пришлите новую ссылку https:// или http://' : 'Пришлите новый текст кнопки.'], [[button(menu, '❌ Отменить', 'button_admin_cancel')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]);
}
async function renderDeleteConfirm(menu, payload = {}, ctx = {}) {
  const context = await resolveSelectedButtonsContext(ctx, payload);
  if (!context.ok) return picker(menu, { page: 0 }, ctx);
  const target = context.target;
  const buttons = context.buttons;
  const index = findButtonIndex(buttons, payload.buttonId);
  if (buttons.length > 1 && index < 0) {
    const rows = buttons.map((item, i) => [button(menu, `${i + 1}. ${short(item.text || item.title || 'Кнопка', 48)}`, 'button_admin_delete_confirm', { buttonId: buttonIdAt(buttons, i), cardId: clean(payload.cardId || '') })]);
    rows.push([button(menu, '↩️ Назад', 'button_admin_show_current')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]);
    return screen(menu, 'buttons_clean_delete_pick', '🗑 Какую кнопку удалить?', [...targetLines(target, ctx.userId), '', ...buttonsLines(buttons)], rows);
  }
  const buttonIndex = index >= 0 ? index : 0;
  const item = buttons[buttonIndex];
  if (!item) return selectedCardScreen(menu, target, bindCurrentCard(ctx.userId, target), buttons, 'Кнопка для удаления не найдена.', ctx.userId);
  return screen(menu, 'buttons_clean_delete_confirm', '🗑 Удалить кнопку?', [...targetLines(target, ctx.userId), '', `Кнопка: ${clean(item.text || item.title || 'Кнопка')}`, `Ссылка: ${clean(item.url || '')}`, '', 'Подтвердите удаление.'], [[button(menu, '✅ Да, удалить', 'button_admin_delete', { buttonId: buttonIdAt(buttons, buttonIndex), cardId: clean(payload.cardId || '') })], [button(menu, '↩️ Назад', 'button_admin_show_current')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]);
}
async function startAdd(menu, payload = {}, ctx = {}) { const card = getCurrentCard(ctx.userId); const payloadCardId = clean(payload.cardId || payload.currentCardId || ''); let sourceTarget = null; if (payloadCardId) { if (!card || payloadCardId !== clean(card.cardId)) { safeCall(() => { const prev = getSetup(ctx.userId); store.setSetupState(ctx.userId, { buttonFlow: null, activeAdminFlowKind: clean(prev.activeAdminFlowKind) === 'button' ? '' : prev.activeAdminFlowKind, buttonTargetDiagnostics: recordTargetDiagnostic(prev, 'denied_no_current_card', { requestedCardId: payloadCardId }) }); }, null); return picker(menu, { page: 0 }, ctx); } sourceTarget = card; } else { sourceTarget = getStoredTarget(ctx.userId); if (!sourceTarget && card) sourceTarget = card; } if (!sourceTarget || !sourceTarget.commentKey) return picker(menu, { page: 0 }, ctx); let target = await hydrateChannelTitle(sourceTarget, ctx); const flow = tenant.stampRecord({ mode: 'button_wizard', stepIndex: 0, targetPost: target, flowId: currentCardId(), draft: { id: `btn_${Date.now().toString(36)}`, text: '', url: '', style: 'primary' }, runtimeVersion: RUNTIME }, getTenant(ctx.userId)); setButtonFlow(ctx.userId, flow); const existing = getButtonSet(target, ctx.userId); const existingSummary = existing.length ? ['Шаг 1/3. Напишите текст кнопки.', '', `У этого поста уже есть ${buttonCountText(existing.length)}:`, '', ...buttonsLines(existing), '', 'Новая кнопка будет добавлена к существующим.', 'Введите текст новой кнопки:'] : ['Шаг 1/3. Напишите текст кнопки.', '', 'У этого поста пока нет кнопок.', 'Введите текст новой кнопки:']; return screen(menu, 'buttons_clean_add_label', '➕ Добавление кнопки', [...existingSummary, '', ...targetLines(target, ctx.userId), '', 'Например: Записаться / Получить консультацию / Открыть сайт'], [[button(menu, '❌ Отменить', 'button_admin_cancel')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]); }

async function flowFromSafePreviewFallback(state = {}, payload = {}, ctx = {}) {
  const preview = state.buttonsPendingPreview || state.buttonsActivePreview || null;
  if (!preview || !preview.draft) return null;
  const payloadFlowId = clean(payload.flowId);
  const previewFlowId = clean(preview.flowId);
  if (payloadFlowId && previewFlowId && payloadFlowId !== previewFlowId) return null;
  const target = await targetFromPayload(payload, ctx) || getValidatedFlowTarget(preview, ctx.userId);
  if (!target) return null;
  const draft = preview.draft || {};
  if (!clean(draft.text) || !clean(draft.url)) return null;
  return { ...preview, flowId: previewFlowId || payloadFlowId, targetPost: target, draft: { ...draft }, stepIndex: 2 };
}

async function saveDraft(menu, ctx = {}) { recordRouteTrace(ctx.userId, 'saveDraft'); const state = getSetup(ctx.userId); const flow = state.buttonFlow || null; if (!flow || !flow.draft) return home(menu, { note: 'Черновик кнопки не найден.' }, ctx); let target = getValidatedFlowTarget(flow, ctx.userId); if (!target) { setButtonFlow(ctx.userId, null); return home(menu, { note: 'Сохранение не выполнено: выбранный пост потерян или больше не принадлежит текущему tenant.' }, ctx); } target = await hydrateChannelTitle(target, ctx); bindTarget(ctx.userId, target, { keepFlow: true }); const existing = getButtonSet(target, ctx.userId); const duplicate = buttonAlreadyExists(existing, flow.draft); const next = duplicate ? existing : [...existing, flow.draft]; let saved = []; try { saved = saveButtonSet(target, next, ctx.userId); } catch (error) { return home(menu, { note: `Сохранение не выполнено: ${short(error?.message || error || 'ошибка записи', 120)}` }, ctx); } const patch = duplicate ? { ok: true, skipped: true, reason: 'button_already_exists' } : await repatchTarget(target, ctx); safeCall(() => store.setSetupState(ctx.userId, { buttonsLastSavedPreview: { userId: clean(ctx.userId), messageId: clean(ctx.callbackMessageId || state.buttonsActivePreviewMessageId || ''), flowId: clean(flow.flowId), targetPost: targetRecord(target, ctx.userId), draft: { ...flow.draft }, savedAt: Date.now(), runtime: RUNTIME } }), null); setButtonFlow(ctx.userId, null); bindTarget(ctx.userId, target); const storedAfterSave = getButtonSet(target, ctx.userId); if (!storedAfterSave.length || saved.length !== next.length) return home(menu, { note: 'Сохранение не выполнено: кнопка не найдена в хранилище после записи.' }, ctx); return home(menu, { note: duplicate ? 'Кнопка уже сохранена для этого поста.' : patchNote(patch, 'Кнопка сохранена') }, ctx); }
async function removeLast(menu, payload = {}, ctx = {}) { const context = await resolveSelectedButtonsContext(ctx, payload); if (!context.ok) return picker(menu, { page: 0 }, ctx); const existing = context.buttons; if (!existing.length) return home(menu, { note: 'Кнопок для удаления нет.' }, ctx); const index = findButtonIndex(existing, payload.buttonId); if (index < 0) return renderDeleteConfirm(menu, payload, ctx); const mutated = await mutateButtonsFeatureState(context, { type: 'delete', index, ctx }); return renderButtonsSelectedPostScreen(menu, mutated, patchNote(mutated.patch, 'Кнопка удалена')); }
async function cancel(menu, payload = {}, ctx = {}) { setButtonFlow(ctx.userId, null); return home(menu, { note: 'Черновик кнопки отменён.' }, ctx); }
function extractUrl(value = '') { const m = clean(value).match(/https?:\/\/\S+/i); return m ? normalizeButtonUrl(m[0].replace(/[)\],.]+$/, '')) : ''; }
function previewScreen(menu, flow = {}) { const draft = flow.draft || {}; return screen(menu, 'buttons_clean_add_preview', '👀 Предпросмотр кнопки', ['Шаг 3/3. Проверьте пользовательскую кнопку перед сохранением.', '', `Текст: ${clean(draft.text)}`, `Ссылка: ${clean(draft.url)}`, '', 'Сохранение начнётся только после подтверждения.'], [[button(menu, '✅ Сохранить кнопку', 'button_admin_save', { flowId: clean(flow.flowId), commentKey: clean(flow.targetPost && flow.targetPost.commentKey), channelId: clean(flow.targetPost && (flow.targetPost.channelId || flow.targetPost.requiredChatId)), postId: clean(flow.targetPost && flow.targetPost.postId) })], [button(menu, '⬅️ Изменить ссылку', 'button_admin_preview_back')], [button(menu, '❌ Отменить', 'button_admin_cancel')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]); }
async function handleTextInput(menu, ctx = {}) { const userId = clean(ctx.userId); const state = getSetup(userId); const flow = state.buttonFlow || null; if (!flow || clean(state.activeAdminFlowKind) !== 'button') return null; let target = getValidatedFlowTarget(flow, userId); if (!target) { setButtonFlow(userId, null); return home(menu, { note: 'Черновик кнопки сброшен: выбранный пост больше не принадлежит текущему tenant.' }, { userId, config: ctx.config }); } target = await hydrateChannelTitle(target, ctx); const input = clean(ctx.text || ''); if (flow.mode === 'button_edit') { const existing = getButtonSet(target, userId); const index = findButtonIndex(existing, flow.editButtonId); if (index < 0) { setButtonFlow(userId, null); return selectedCardScreen(menu, target, bindCurrentCard(userId, target), existing, 'Кнопка для изменения не найдена.', userId); } if (flow.editField === 'url') { const url = extractUrl(input); if (!url) return screen(menu, 'buttons_clean_need_url', '🔗 Изменить URL кнопки', ['Нужна ссылка в формате https://...', '', 'Пришлите ссылку ещё раз или отмените изменение.'], [[button(menu, '❌ Отменить', 'button_admin_cancel')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]); existing[index] = { ...existing[index], url }; } else { if (!input) return null; existing[index] = { ...existing[index], text: input.slice(0, 64), title: input.slice(0, 64) }; } saveButtonSet(target, existing, userId); const patch = await repatchTarget(target, { ...ctx, userId }); setButtonFlow(userId, null); bindTarget(userId, target); const context = await resolveSelectedButtonsContext({ ...ctx, userId }, { commentKey: target.commentKey, channelId: target.channelId, postId: target.postId }); return renderButtonsSelectedPostScreen(menu, context, patchNote(patch, 'Кнопка обновлена')); } const draft = flow.draft || {}; if (Number(flow.stepIndex || 0) <= 0) { if (!input) return null; draft.text = input.slice(0, 64); flow.targetPost = target; flow.draft = draft; flow.stepIndex = 1; setButtonFlow(userId, flow); return screen(menu, 'buttons_clean_add_url', '➕ Добавление кнопки', ['Шаг 2/3. Пришлите ссылку для кнопки.', '', `Текст: ${draft.text}`, '', 'Ссылка должна начинаться с https:// или http://'], [[button(menu, '❌ Отменить', 'button_admin_cancel')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]); } const url = extractUrl(input); if (!url) return screen(menu, 'buttons_clean_need_url', '➕ Добавление кнопки', ['Нужна ссылка в формате https://...', '', 'Пришлите ссылку ещё раз или отмените черновик.'], [[button(menu, '❌ Отменить', 'button_admin_cancel')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]); draft.url = url; flow.targetPost = target; flow.draft = draft; flow.stepIndex = 2; setButtonFlow(userId, flow); return previewScreen(menu, flow); }
async function backToUrl(menu, payload = {}, ctx = {}) { const state = getSetup(ctx.userId); const flow = state.buttonFlow || null; if (!flow || !flow.draft) return home(menu, { note: 'Черновик кнопки не найден.' }, ctx); flow.stepIndex = 1; flow.draft = { ...flow.draft, url: '' }; setButtonFlow(ctx.userId, flow); return screen(menu, 'buttons_clean_add_url', '➕ Добавление кнопки', ['Шаг 2/3. Пришлите ссылку для кнопки.', '', `Текст: ${clean(flow.draft.text)}`, '', 'Ссылка должна начинаться с https:// или http://'], [[button(menu, '❌ Отменить', 'button_admin_cancel')], [button(menu, '🔘 В начало кнопок', 'admin_section_buttons')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]); }
function staleSaveScreen(menu, ctx = {}) { recordRouteTrace(ctx.userId, 'staleSaveScreen'); return screen(menu, 'buttons_clean_stale_save', '🔘 Кнопки под постами', ['Этот предпросмотр устарел: черновик уже закрыт или заменён.', '', 'Вернитесь к выбранному посту или добавьте кнопку заново.'], [[button(menu, '↩️ К кнопкам поста', 'button_admin_show_current')], [button(menu, '➕ Добавить кнопку', 'button_admin_start_add')], ...footer(menu)]); }
async function confirmSave(menu, payload = {}, ctx = {}) { recordRouteTrace(ctx.userId, 'confirmSave', { callbackMessageId: clean(ctx.callbackMessageId || ''), hasPayloadFlowId: Boolean(clean(payload.flowId)) }); const state = getSetup(ctx.userId); let flow = state.buttonFlow || null; if (!flow) { const fallbackFlow = await flowFromSafePreviewFallback(state, payload, ctx); if (fallbackFlow) { setButtonFlow(ctx.userId, fallbackFlow); flow = fallbackFlow; recordRouteTrace(ctx.userId, 'preview_fallback_flow_restored', { flowId: clean(fallbackFlow.flowId) }); } } const draft = flow?.draft || {}; if (!flow) { if (lastSavedPreviewMatches(state, payload, ctx)) return home(menu, { note: 'Кнопка уже сохранена: этот предпросмотр закрыт.' }, ctx); recordRouteTrace(ctx.userId, 'staleSaveScreen_returned', { reason: 'missing_flow' }); return staleSaveScreen(menu, ctx); } const activeFlowId = clean(flow.flowId); const payloadFlowId = clean(payload.flowId); const matchesActive = callbackSaveMatchesActivePreview(state, payload, ctx); if (activeFlowId && payloadFlowId && payloadFlowId !== activeFlowId && !matchesActive) { recordRouteTrace(ctx.userId, 'staleSaveScreen_returned', { reason: 'mismatched_flowId', activeFlowId, payloadFlowId }); return staleSaveScreen(menu, ctx); } if (activeFlowId && !payloadFlowId && !matchesActive) { recordRouteTrace(ctx.userId, 'staleSaveScreen_returned', { reason: 'missing_payload_flowId', activeFlowId }); return staleSaveScreen(menu, ctx); } if (Number(flow.stepIndex || 0) < 2 || !clean(draft.text) || !clean(draft.url)) return home(menu, { note: 'Сначала проверьте пользовательскую кнопку на предпросмотре.' }, ctx); if (saveInFlightActive(state, ctx)) return saveInFlightScreen(); return saveDraft(menu, ctx); }
async function screenForPayload(menu, payload = {}, ctx = {}) { getTenant(ctx.userId); const action = clean(payload.action); if (action === 'admin_section_buttons') return home(menu, payload, ctx); if (action === 'button_admin_recent_posts') return picker(menu, payload, ctx); if (action === 'button_admin_channel_pick') return picker(menu, { ...payload, skipChannels: '1' }, ctx); if (action === 'button_admin_select_post') return selectPost(menu, payload, ctx); if (action === 'button_admin_show_current') return showCurrent(menu, payload, ctx); if (action === 'button_admin_edit') return renderEdit(menu, payload, ctx); if (action === 'button_admin_edit_text') return startEditInput(menu, payload, ctx, 'text'); if (action === 'button_admin_edit_url') return startEditInput(menu, payload, ctx, 'url'); if (action === 'button_admin_delete_confirm') return renderDeleteConfirm(menu, payload, ctx); if (action === 'button_admin_start_add') return startAdd(menu, payload, ctx); if (action === 'button_admin_save') { recordRouteTrace(ctx.userId, 'screenForPayload', { action }); return confirmSave(menu, payload, ctx); } if (action === 'button_admin_preview_back') return backToUrl(menu, payload, ctx); if (action === 'button_admin_delete') return removeLast(menu, payload, ctx); if (action === 'button_admin_cancel') return cancel(menu, payload, ctx); return null; }
function isCleanButtonAction(action = '') { return CLEAN_BUTTON_ACTIONS.includes(clean(action)); }
module.exports = { RUNTIME, CLEAN_BUTTON_ACTIONS, isCleanButtonAction, screenForPayload, handleTextInput, listPosts, listPostsForChannel, findPost, resolveSelectedButtonsContext, loadButtonsFeatureState, renderButtonsSelectedPostScreen, mutateButtonsFeatureState };
