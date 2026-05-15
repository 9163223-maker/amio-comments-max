'use strict';

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-7512');

const RUNTIME = 'CC7.5.13-BUTTON-MENU-BOTTOM-FLOW';
const MARKER = '__ADMINKIT_CC7_5_13_BUTTON_MENU_BOTTOM_FLOW__';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 80) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const START = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню']);

function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function textOf(u) { const m = msg(u); return clean(m?.body?.text || m?.text || body(u).text || ''); }
function adminId(u) { try { return db.adminId(u) || db.chatId(u) || ''; } catch { return clean(cb(u)?.user?.user_id || msg(u)?.sender?.user_id || body(u).user_id || ''); } }
function chatId(u) { try { return db.chatId(u) || ''; } catch { return clean(msg(u)?.recipient?.chat_id || msg(u)?.chat_id || body(u).chat_id || ''); } }
function messageId(u) { try { return db.messageId(u) || ''; } catch { return clean(cb(u)?.message?.message_id || msg(u)?.message_id || msg(u)?.id || ''); } }
function callbackId(u) { try { return db.callbackId(u); } catch { return clean(cb(u)?.callback_id || cb(u)?.id || ''); } }
function responseMessageId(d = {}) { return clean(d.message_id || d.messageId || d.id || d.message?.message_id || d.message?.id || d.data?.message_id || d.data?.id || ''); }
function btn(text, route, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ r: route, ...extra }) }; }
function keyboard(items, backRoute = 'main:home') {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {})));
  rows.push([btn('↩️ Назад', backRoute), btn('🏠 Главное', 'main:home')]);
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}
function screen(title, lines, items = [], backRoute = 'main:home') { return { text: [title, '', lines.filter(Boolean).join('\n')].join('\n'), attachments: keyboard(items, backRoute) }; }
function valueSet(v) { return clean(v) ? 'задано' : 'не задано'; }
async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }

function deleteLater(mid, delayMs) {
  if (!mid || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}
async function deleteMany(ids = []) {
  [...new Set(ids.map(clean).filter(Boolean))].forEach((mid) => {
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 700); deleteLater(mid, 1800); deleteLater(mid, 4200);
  });
}
async function sendFresh(update, sc, route) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id);
  const prevGlobal = await state.getMenu(id);
  const history = []
    .concat(Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds : [])
    .concat(Array.isArray(s.buttonGarbageIds) ? s.buttonGarbageIds : [])
    .concat([s.buttonPromptMessageId, prevGlobal])
    .map(clean).filter(Boolean);
  const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false });
  const mid = responseMessageId(sent);
  if (mid) await state.setMenu(id, mid);
  await saveS(id, { buttonMenuIds: mid ? [mid] : [], buttonPromptMessageId: mid || '', buttonGarbageIds: [], buttonLastRoute: route, buttonUpdatedAt: Date.now() });
  await deleteMany(history.filter(x => x && x !== mid && x !== messageId(update)));
  const cid = callbackId(update); if (cid) api.answerCallback({ botToken: config.botToken, callbackId: cid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7513_button_bottom_menu', messageId: mid, edited: false };
}
async function inputScreen(id, field) {
  await saveS(id, { mode: `cc7513:buttons:${field}` });
  if (field === 'buttonText') return screen('🔘 Кнопки — шаг 3/5', ['Пришлите название кнопки — текст, который увидит подписчик.', 'Например: Купить / Записаться / Скачать чек-лист'], [], 'buttons:flow:post');
  return screen('🔘 Кнопки — шаг 4/5', ['Куда должна вести кнопка?', 'Сейчас поддерживается ссылка.', 'Пришлите ссылку в формате https://...', 'Действия внутри MAX добавим позже отдельным режимом.'], [], 'buttons:flow:inputText');
}
async function reviewScreen(id) {
  const s = await getS(id); const f = s.buttonsFlow || {};
  const ready = !!(clean(f.commentKey) && clean(f.buttonText) && clean(f.buttonAction));
  const items = ready ? [['💾 Сохранить', 'buttons:flow:save'], ['✏️ Название', 'buttons:flow:inputText'], ['🔗 Ссылка', 'buttons:flow:inputAction']] : [['✏️ Название', 'buttons:flow:inputText'], ['🔗 Ссылка', 'buttons:flow:inputAction']];
  return screen('🔘 Кнопки — шаг 5/5', [
    `Канал: ${state.channelTitle(f.channelId, f.channelTitle)}`,
    `Пост: ${cut(f.title || f.postId || 'не выбран')}`,
    `Название кнопки: ${clean(f.buttonText) || 'не задано'}`,
    `Ссылка: ${valueSet(f.buttonAction)}`,
    `Статус: ${ready ? 'готово к сохранению' : 'не завершено'}`,
    !clean(f.buttonText) ? 'Нужно задать название кнопки.' : '',
    !clean(f.buttonAction) ? 'Нужно задать ссылку кнопки.' : ''
  ], items, 'buttons:start');
}
async function handleAwaitButtonsInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode);
  if (!mode.startsWith('cc7513:buttons:') && !mode.startsWith('cc7510:buttons:') && !mode.startsWith('cc759:buttons:') && !mode.startsWith('cc757:buttons:')) return null;
  const value = textOf(update);
  if (!value || START.has(value.toLowerCase())) return null;
  const field = mode.split(':').pop();
  const flow = { ...(s.buttonsFlow || {}) };
  if (field === 'buttonText') flow.buttonText = value;
  if (field === 'buttonAction') flow.buttonAction = value;
  await saveS(id, { mode: '', buttonsFlow: flow });
  return field === 'buttonText' ? inputScreen(id, 'buttonAction') : reviewScreen(id);
}
async function tryHandle(update) {
  const id = adminId(update) || chatId(update) || 'global';
  const awaited = await handleAwaitButtonsInput(update, id);
  if (awaited) return sendFresh(update, awaited, 'buttons:await');
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER, features: [...(b.features || []), 'button_menu_after_input_goes_bottom', 'button_action_wording_clean'], commentsCoreTouched: false, giftsCoreTouched: false, policy: 'button_input_menu_bottom_only_over_7512' };
}
function install() { return selfTest(); }
module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
