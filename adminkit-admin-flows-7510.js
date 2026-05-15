'use strict';

// CC7.5.10 button UX cleanup over CC7.5.9.
// Fixes: after entering link/command, previous step menu is edited into review instead of creating a second menu.
// Wording: remove unclear word "action" from user flow; use "where the button leads" / "link or command".
// Comments core and gifts are delegated unchanged.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-759');

const RUNTIME = 'CC7.5.10-BUTTON-UX-CLEANUP';
const MARKER = '__ADMINKIT_CC7_5_10_BUTTON_UX_CLEANUP__';

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
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: route, ...extra }) }; }
function keyboard(items, backRoute = 'main:home') { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {}))); rows.push([btn('↩️ Назад', backRoute), btn('🏠 Главное', 'main:home')]); return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function screen(title, lines, items = [], backRoute = 'main:home') { return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: keyboard(items, backRoute) }; }
function valueSet(v) { return clean(v) ? 'задано' : 'не задано'; }
function postLabel(p = {}) { return cut(p.title || p.raw?.title || p.raw?.originalText || p.raw?.text || p.postId || 'Пост', 50); }
async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }
async function listChannels(id) { return (await state.listChannels(id)) || []; }
async function listPostsForChannel(id, channelId) { return state.listPosts(id, channelId, 30); }
async function activeChannel(id) { return state.activeChannel(id); }

function deleteLater(messageIdValue, delayMs) {
  if (!messageIdValue || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId: messageIdValue, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}
async function deleteMany(ids = []) {
  const uniq = [...new Set(ids.map(clean).filter(Boolean))];
  uniq.forEach((mid) => {
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 700);
    deleteLater(mid, 1800);
    deleteLater(mid, 4200);
  });
}
async function sendButtonScreen(update, sc, route, opts = {}) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id);
  const currentMessageId = messageId(update);
  const prevGlobal = await state.getMenu(id);
  const promptId = clean(opts.editMessageId || s.buttonPromptMessageId || '');
  const history = []
    .concat(Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds : [])
    .concat(Array.isArray(s.buttonGarbageIds) ? s.buttonGarbageIds : [])
    .concat([s.buttonPromptMessageId, prevGlobal])
    .map(clean).filter(Boolean);

  let mid = '';
  let edited = false;
  const canEditCallbackMessage = opts.preferEdit !== false && currentMessageId && callbackId(update);
  const editTarget = clean(opts.editMessageId || (canEditCallbackMessage ? currentMessageId : ''));
  if (editTarget) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: editTarget, text: sc.text, attachments: sc.attachments, notify: false });
      mid = editTarget;
      edited = true;
    } catch {}
  }
  if (!mid) {
    const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false });
    mid = responseMessageId(sent);
  }
  if (mid) await state.setMenu(id, mid);
  await saveS(id, { buttonMenuIds: mid ? [mid] : [], buttonPromptMessageId: mid || promptId, buttonGarbageIds: [], buttonLastRoute: route, buttonUpdatedAt: Date.now() });

  const toDelete = history.concat([currentMessageId]);
  if (edited && mid === currentMessageId) toDelete.splice(toDelete.indexOf(currentMessageId), 1);
  await deleteMany(toDelete.filter(x => x && x !== mid));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7510_button_ux_cleanup', messageId: mid, edited };
}

async function chooseChannelScreen(id) {
  const channels = await listChannels(id);
  return screen('🔘 Кнопки — шаг 1/5', ['Выберите канал, где находится пост.'], channels.slice(0, 10).map((c, i) => [`${i + 1}. ${state.channelTitle(c.channelId, c.title)}`, 'buttons:flow:channel', { channelId: c.channelId, channelTitle: c.title }]), 'main:home');
}
async function choosePostScreen(id) {
  const s = await getS(id); const f = s.buttonsFlow || {}; const chId = f.channelId || (await activeChannel(id)).channelId;
  const posts = await listPostsForChannel(id, chId);
  return screen('🔘 Кнопки — шаг 2/5', ['Выберите пост, к которому добавить кнопку.'], posts.slice(0, 10).map((p, i) => [`${i + 1}. ${postLabel(p)}`, 'buttons:flow:post', { postId: p.postId, commentKey: p.commentKey, title: p.title, channelId: p.channelId }]), 'buttons:start');
}
async function inputScreen(id, field) {
  await saveS(id, { mode: `cc7510:buttons:${field}` });
  if (field === 'buttonText') return screen('🔘 Кнопки — шаг 3/5', ['Пришлите название кнопки — текст, который увидит подписчик.', 'Например: Купить / Записаться / Скачать чек-лист'], [], 'buttons:flow:post');
  return screen('🔘 Кнопки — шаг 4/5', ['Куда должна вести кнопка?', 'Пришлите ссылку, например: https://site.ru', 'Позже добавим действия внутри MAX: выдать подарок, записать заявку, показать сообщение.'], [], 'buttons:flow:inputText');
}
async function reviewScreen(id, afterPatch = null) {
  const s = await getS(id); const f = s.buttonsFlow || {};
  const hasText = !!clean(f.buttonText);
  const hasTarget = !!clean(f.buttonAction);
  const ready = !!(clean(f.commentKey) && hasText && hasTarget);
  const items = ready
    ? [['💾 Сохранить', 'buttons:flow:save'], ['✏️ Название', 'buttons:flow:inputText'], ['🔗 Ссылка', 'buttons:flow:inputAction']]
    : [['✏️ Название', 'buttons:flow:inputText'], ['🔗 Ссылка', 'buttons:flow:inputAction']];
  return screen('🔘 Кнопки — шаг 5/5', [
    `Канал: ${state.channelTitle(f.channelId, f.channelTitle)}`,
    `Пост: ${cut(f.title || f.postId || 'не выбран')}`,
    `Название кнопки: ${clean(f.buttonText) || 'не задано'}`,
    `Куда ведёт: ${valueSet(f.buttonAction)}`,
    `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`,
    !hasText ? 'Нужно задать название кнопки.' : '',
    !hasTarget ? 'Нужно задать ссылку или команду кнопки.' : '',
    afterPatch ? `Применение к посту: ${afterPatch.ok ? 'успешно' : 'ошибка ' + (afterPatch.reason || afterPatch.error || '')}` : ''
  ], items, 'buttons:start');
}
async function resetButtonsFlow(id) {
  const s = await getS(id);
  await saveS(id, { mode: '', buttonsFlow: {}, buttonGarbageIds: Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds : [], buttonMenuIds: [], buttonPromptMessageId: '' });
}

async function handleButtonsRoute(route, id, p) {
  if (route === 'buttons:home' || route === 'buttons:start') { await resetButtonsFlow(id); return chooseChannelScreen(id); }
  if (route === 'buttons:flow:channel') { await saveS(id, { mode: '', buttonsFlow: { channelId: p.channelId, channelTitle: p.channelTitle } }); return choosePostScreen(id); }
  if (route === 'buttons:flow:post') {
    const s = await getS(id); const prev = s.buttonsFlow || {};
    await saveS(id, { mode: '', buttonsFlow: { channelId: p.channelId || prev.channelId, channelTitle: prev.channelTitle, postId: p.postId, commentKey: p.commentKey, title: p.title, buttonText: '', buttonAction: '' } });
    return inputScreen(id, 'buttonText');
  }
  if (route === 'buttons:flow:inputText') return inputScreen(id, 'buttonText');
  if (route === 'buttons:flow:inputAction') return inputScreen(id, 'buttonAction');
  if (route === 'buttons:flow:save') {
    const s = await getS(id); const f = s.buttonsFlow || {}; const post = await state.getPostByCommentKey(id, f.commentKey);
    if (!post || !clean(f.buttonText) || !clean(f.buttonAction)) return reviewScreen(id, { ok: false, reason: 'flow_not_complete' });
    await state.savePostSetting(id, post, { buttonsEnabled: true, ctaButtonText: clean(f.buttonText), ctaButtonLink: clean(f.buttonAction) });
    const patched = await base.forceRepatchPost(id, f.commentKey);
    const result = screen('✅ Кнопка добавлена к посту', [`Пост: ${cut(f.title || f.postId)}`, `Название кнопки: ${clean(f.buttonText)}`, `Куда ведёт: ${valueSet(f.buttonAction)}`, `Применение к посту: ${patched.ok ? 'успешно' : 'ошибка ' + (patched.reason || '')}`], [['🔘 Настроить ещё кнопку', 'buttons:start']], 'main:home');
    await saveS(id, { mode: '', buttonsFlow: {} });
    return result;
  }
  return null;
}
async function handleAwaitButtonsInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode);
  if (!mode.startsWith('cc7510:buttons:') && !mode.startsWith('cc759:buttons:') && !mode.startsWith('cc757:buttons:')) return null;
  const value = textOf(update);
  if (!value || START.has(value.toLowerCase())) return null;
  const field = mode.split(':').pop();
  const flow = { ...(s.buttonsFlow || {}) };
  if (field === 'buttonText') flow.buttonText = value;
  if (field === 'buttonAction') flow.buttonAction = value;
  await saveS(id, { mode: '', buttonsFlow: flow });
  const editMessageId = clean(s.buttonPromptMessageId || (Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds[0] : '') || await state.getMenu(id));
  if (field === 'buttonText') return { screen: await inputScreen(id, 'buttonAction'), editMessageId };
  return { screen: await reviewScreen(id), editMessageId };
}
async function handleButtonAction(update, p) {
  const target = clean(p.action);
  const cbid = callbackId(update);
  if (cbid) await api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: target ? `Открываю: ${cut(target, 80)}` : 'Ссылка кнопки не задана' }).catch(() => {});
  return { handled: true, route: 'buttons:action', sentKind: 'button_target_ack' };
}

async function tryHandle(update) {
  const route = routeOf(update); const id = adminId(update) || chatId(update) || 'global'; const p = payloadOf(update);
  if (route === 'buttons:action') return handleButtonAction(update, p);
  const awaited = await handleAwaitButtonsInput(update, id);
  if (awaited) return sendButtonScreen(update, awaited.screen, 'buttons:await', { preferEdit: false, editMessageId: awaited.editMessageId });
  if (route.startsWith('buttons:')) {
    const sc = await handleButtonsRoute(route, id, p);
    if (sc) return sendButtonScreen(update, sc, route, { preferEdit: true });
  }
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() { const b = base.selfTest ? base.selfTest() : {}; return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER, features: [...(b.features || []), 'button_prompt_edit_after_user_input', 'button_ux_target_wording', 'button_menu_cleanup_retries'], commentsCoreTouched: false, giftsCoreTouched: false, policy: 'button_ux_cleanup_only_over_759' }; }
function install() { return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
