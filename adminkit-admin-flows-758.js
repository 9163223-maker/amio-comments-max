'use strict';

// CC7.5.8 gift flow/claim fix over accepted CC7.5.7 admin flows and CC7.5.6 comments core.
// Fixes: file/photo gift input should not fall through to main menu; gift button should answer; post repatch preserves comment count.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-757');

const RUNTIME = 'CC7.5.8-GIFT-FLOW-CLAIM-FIX';
const MARKER = '__ADMINKIT_CC7_5_8_GIFT_FLOW_CLAIM_FIX__';

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 80) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const START = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню']);

function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function textOf(u) { const m = msg(u); return clean(m?.body?.text || m?.text || body(u).text || ''); }
function payloadOf(u) { const raw = cb(u)?.payload || cb(u)?.data || ''; if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { r: raw }; } } return raw && typeof raw === 'object' ? raw : {}; }
function routeOf(u) { const p = payloadOf(u); return clean(p.r || p.route || textOf(u)); }
function adminId(u) { try { return db.adminId(u) || db.chatId(u) || ''; } catch { return clean(cb(u)?.user?.user_id || msg(u)?.sender?.user_id || body(u).user_id || ''); } }
function chatId(u) { try { return db.chatId(u) || ''; } catch { return clean(msg(u)?.recipient?.chat_id || msg(u)?.chat_id || body(u).chat_id || ''); } }
function callbackId(u) { try { return db.callbackId(u); } catch { return clean(cb(u)?.callback_id || cb(u)?.id || ''); } }
function messageId(u) { try { return db.messageId(u) || ''; } catch { return clean(cb(u)?.message?.message_id || msg(u)?.message_id || msg(u)?.id || ''); } }
function responseMessageId(d = {}) { return clean(d.message_id || d.messageId || d.id || d.message?.message_id || d.message?.id || d.data?.message_id || d.data?.id || ''); }
function userIdFromCallback(u) { return clean(cb(u)?.user?.user_id || cb(u)?.user_id || body(u).user?.user_id || body(u).user_id || adminId(u)); }
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: route, ...extra }) }; }
function keyboard(items, backRoute = 'main:home') { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {}))); rows.push([btn('↩️ Назад', backRoute), btn('🏠 Главное', 'main:home')]); return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function screen(title, lines, items = [], backRoute = 'main:home') { return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: keyboard(items, backRoute) }; }
function isHttpUrl(v) { return /^https?:\/\//i.test(clean(v)) || /^https:\/\/max\.ru\//i.test(clean(v)); }
function valueSet(v) { return clean(v) ? 'задано' : 'не задано'; }

async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }

function b64urlEncodeJson(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecodeJson(value) {
  try {
    const s = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
  } catch { return null; }
}
function getIncomingAttachments(update) {
  const m = msg(update) || {};
  const b = m.body && typeof m.body === 'object' ? m.body : {};
  const candidates = [b.attachments, m.attachments, body(update).attachments, body(update).message?.attachments, body(update).message?.body?.attachments];
  for (const x of candidates) if (Array.isArray(x) && x.length) return x;
  return [];
}
function encodeGiftPayloadFromUpdate(update) {
  const attachments = getIncomingAttachments(update).filter((a) => a && typeof a === 'object' && a.type !== 'inline_keyboard');
  if (!attachments.length) return '';
  return 'akgift_' + b64urlEncodeJson({ kind: 'max_attachments', attachments: attachments.slice(0, 5), savedAt: Date.now() });
}
function parseGiftPayload(value) {
  const raw = clean(value);
  if (!raw.startsWith('akgift_')) return null;
  return b64urlDecodeJson(raw.slice('akgift_'.length));
}
function stripInlineKeyboard(attachments) { return (Array.isArray(attachments) ? attachments : []).filter(a => a?.type !== 'inline_keyboard'); }
function isCommentButton(button = {}) { const text = clean(button.text || '').toLowerCase(); const payload = JSON.stringify(button.payload || button.data || ''); return text.includes('комментар') || payload.includes('comments') || payload.includes('commentKey'); }
function withoutCommentButtons(attachments = []) {
  return stripInlineKeyboard(attachments).concat((Array.isArray(attachments) ? attachments : []).filter(a => a?.type === 'inline_keyboard').map((item) => {
    const payload = item.payload && typeof item.payload === 'object' ? JSON.parse(JSON.stringify(item.payload)) : {};
    const rows = Array.isArray(payload.buttons) ? payload.buttons : [];
    const nextRows = rows.map((row) => (Array.isArray(row) ? row : []).filter((b) => !isCommentButton(b))).filter((row) => row.length);
    return nextRows.length ? { ...item, payload: { ...payload, buttons: nextRows } } : null;
  }).filter(Boolean));
}
function customRowsFromPost(post = {}) {
  const rows = [];
  if (post.buttonsEnabled && clean(post.ctaButtonText) && clean(post.ctaButtonLink)) {
    const action = clean(post.ctaButtonLink);
    rows.push([isHttpUrl(action) ? { type: 'link', text: clean(post.ctaButtonText).slice(0, 64), url: action } : { type: 'callback', text: clean(post.ctaButtonText).slice(0, 64), payload: JSON.stringify({ r: 'buttons:action', commentKey: post.commentKey, action }) }]);
  }
  if (post.giftsEnabled && clean(post.giftTitle) && clean(post.giftLink)) {
    const target = clean(post.giftLink);
    rows.push([isHttpUrl(target) ? { type: 'link', text: ('🎁 ' + clean(post.giftTitle)).slice(0, 64), url: target } : { type: 'callback', text: ('🎁 ' + clean(post.giftTitle)).slice(0, 64), payload: JSON.stringify({ r: 'gifts:claim', commentKey: post.commentKey }) }]);
  }
  return rows;
}
function extractPostSnapshot(post = {}) {
  const raw = post.raw && typeof post.raw === 'object' ? post.raw : {};
  return { text: String(raw.originalText || raw.text || post.title || ''), link: raw.originalLink || null, format: raw.originalFormat !== undefined ? raw.originalFormat : undefined, attachments: Array.isArray(raw.sourceAttachments) ? raw.sourceAttachments.filter(a => a?.type !== 'inline_keyboard') : [] };
}
function commentCount(commentKey) {
  try { return require('./services/commentService').listComments(commentKey, '').length || 0; } catch { return 0; }
}
async function forceRepatchPost(id, commentKey) {
  const post = await state.getPostByCommentKey(id, commentKey);
  if (!post) return { ok: false, reason: 'post_not_found' };
  if (!config.botToken) return { ok: false, reason: 'bot_token_missing' };
  const messageIdValue = clean(post.messageId || post.postId);
  if (!messageIdValue) return { ok: false, reason: 'message_id_missing' };
  const snap = extractPostSnapshot(post);
  let liveBody = {};
  try { const live = await api.getMessage({ botToken: config.botToken, messageId: messageIdValue }); liveBody = live?.body && typeof live.body === 'object' ? live.body : {}; } catch {}
  const baseAttachments = withoutCommentButtons(Array.isArray(liveBody.attachments) && liveBody.attachments.length ? liveBody.attachments : snap.attachments);
  const extraRows = customRowsFromPost(post);
  const commentsRows = api.buildCommentsKeyboard({ appBaseUrl: config.appBaseUrl, botUsername: config.botUsername, maxDeepLinkBase: config.maxDeepLinkBase, handoffToken: '', postId: post.postId, channelId: post.channelId, commentKey: post.commentKey, messageId: messageIdValue, count: commentCount(post.commentKey), extraRows, showPrimaryButton: post.commentsEnabled !== false });
  const payload = { botToken: config.botToken, messageId: messageIdValue, attachments: [...baseAttachments, ...commentsRows], notify: false };
  const text = String(liveBody.text || snap.text || ''); if (text) payload.text = text;
  const link = liveBody.link || snap.link; if (link && typeof link === 'object') payload.link = JSON.parse(JSON.stringify(link));
  const format = liveBody.format !== undefined ? liveBody.format : snap.format; if (format !== undefined && format !== null) payload.format = format;
  const result = await api.editMessage(payload);
  return { ok: true, runtimeVersion: RUNTIME, commentKey, postId: post.postId, commentCount: commentCount(post.commentKey), extraRows: extraRows.length, result };
}
async function sendScreen(update, sc, route) {
  const id = adminId(update) || chatId(update) || 'global';
  const prev = await state.getMenu(id);
  const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false });
  const mid = responseMessageId(sent);
  if (mid) await state.setMenu(id, mid);
  [...new Set([prev, messageId(update)].filter(x => x && x !== mid))].forEach(x => api.deleteMessage({ botToken: config.botToken, messageId: x, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc758_gift_fix', messageId: mid };
}
async function giftReviewScreen(id, afterPatch = null) {
  const s = await getS(id); const f = s.giftsFlow || {};
  const ready = clean(f.giftTitle) && clean(f.giftLink);
  return screen('🎁 Подарки — шаг 6/6', [`Канал: ${state.channelTitle(f.channelId, f.channelTitle)}`, `Пост: ${cut(f.title || f.postId || 'не выбран')}`, `Подарок: ${clean(f.giftTitle) || 'не задан'}`, `Файл/ссылка: ${valueSet(f.giftLink)}`, `Только подписчикам: ${f.requireSubscription === false ? 'нет' : 'да'}`, `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`, afterPatch ? `Применение к посту: ${afterPatch.ok ? 'успешно' : 'ошибка ' + (afterPatch.reason || afterPatch.error || '')}` : ''], ready ? [['💾 Сохранить', 'gifts:flow:save'], ['✏️ Название', 'gifts:flow:inputTitle'], ['🔗 Файл/ссылка', 'gifts:flow:inputLink'], ['⚙️ Режим', 'gifts:flow:inputMode']] : [['✏️ Название', 'gifts:flow:inputTitle'], ['🔗 Файл/ссылка', 'gifts:flow:inputLink'], ['⚙️ Режим', 'gifts:flow:inputMode']], 'gifts:start');
}
async function handleGiftAttachmentInput(update, id) {
  const s = await getS(id);
  if (clean(s.mode) !== 'cc757:gifts:giftLink') return null;
  const giftPayload = encodeGiftPayloadFromUpdate(update);
  const txt = textOf(update);
  if (!giftPayload && (!txt || START.has(txt.toLowerCase()))) return null;
  const giftLink = giftPayload || txt;
  await saveS(id, { mode: '', giftsFlow: { ...(s.giftsFlow || {}), giftLink } });
  return giftReviewScreen(id);
}
async function handleGiftSave(update, id) {
  const s = await getS(id); const f = s.giftsFlow || {}; const post = await state.getPostByCommentKey(id, f.commentKey);
  if (!post || !clean(f.giftTitle) || !clean(f.giftLink)) return giftReviewScreen(id, { ok: false, reason: 'flow_not_complete' });
  await state.savePostSetting(id, post, { giftsEnabled: true, giftTitle: clean(f.giftTitle), giftLink: clean(f.giftLink), giftsRequireSubscription: f.requireSubscription !== false });
  const patched = await forceRepatchPost(id, f.commentKey);
  return screen('✅ Подарок добавлен к посту', [`Пост: ${cut(f.title || f.postId)}`, `Подарок: ${clean(f.giftTitle)}`, `Файл/ссылка: ${valueSet(f.giftLink)}`, `Только подписчикам: ${f.requireSubscription === false ? 'нет' : 'да'}`, `Комментариев сохранено: ${patched.commentCount ?? 0}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`], [['🎁 Настроить ещё подарок', 'gifts:start']], 'main:home');
}
async function findGiftPost(commentKey) {
  await db.init();
  const { rows } = await db.query('select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title, s.gifts_enabled as "giftsEnabled", s.gift_title as "giftTitle", s.gift_link as "giftLink", s.gift_message as "giftMessage", s.gifts_require_subscription as "giftsRequireSubscription" from ak_posts p join ak_post_settings s on s.comment_key=p.comment_key where p.comment_key=$1 and s.gifts_enabled=true order by s.updated_at desc limit 1', [commentKey]);
  return rows[0] || null;
}
async function handleGiftClaim(update, p) {
  const commentKey = clean(p.commentKey);
  const post = await findGiftPost(commentKey);
  const uid = userIdFromCallback(update);
  const cbid = callbackId(update);
  if (!post || !clean(post.giftLink)) {
    if (cbid) await api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: 'Подарок не найден' }).catch(() => {});
    return { handled: true, route: 'gifts:claim', sentKind: 'gift_not_found' };
  }
  const title = clean(post.giftTitle) || 'Подарок';
  const parsed = parseGiftPayload(post.giftLink);
  if (parsed?.attachments?.length) {
    await api.sendMessage({ botToken: config.botToken, userId: uid, text: `🎁 ${title}`, attachments: parsed.attachments, notify: false });
  } else if (isHttpUrl(post.giftLink)) {
    await api.sendMessage({ botToken: config.botToken, userId: uid, text: `🎁 ${title}\n${clean(post.giftLink)}`, notify: false });
  } else {
    await api.sendMessage({ botToken: config.botToken, userId: uid, text: `🎁 ${title}\n${clean(post.giftLink)}`, notify: false });
  }
  if (cbid) await api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: 'Подарок отправлен в чат с ботом' }).catch(() => {});
  return { handled: true, route: 'gifts:claim', sentKind: 'gift_sent' };
}
async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  if (route === 'gifts:claim') return handleGiftClaim(update, p);
  const attachmentScreen = await handleGiftAttachmentInput(update, id);
  if (attachmentScreen) return sendScreen(update, attachmentScreen, 'gifts:flow:inputLink:file');
  if (route === 'gifts:flow:save') return sendScreen(update, await handleGiftSave(update, id), route);
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() { const b = base.selfTest ? base.selfTest() : {}; return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER, features: [...(b.features || []), 'gift_file_attachment_input', 'gift_claim_send_to_user', 'preserve_comment_count_on_repatch'], commentsCoreTouched: false, policy: 'gift_flow_claim_fix_only_comments_core_untouched' }; }
function install() { return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost };
