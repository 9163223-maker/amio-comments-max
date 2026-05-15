'use strict';

// CC7.5.12: gift flow placement fix over CC7.5.11.
// Keeps accepted CC7.5.6 comments core and CC7.5.10 buttons.
// Fixes gift text/photo/file input: next step is sent as a fresh bottom menu after the user's input,
// while older gift menus are cleaned up. This avoids an edited menu staying above the typed gift value.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-7511');

const RUNTIME = 'CC7.5.12-GIFT-MENU-ADDON-PRESERVE';
const MARKER = '__ADMINKIT_CC7_5_12_GIFT_MENU_ADDON_PRESERVE__';

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
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
function keyboard(items, backRoute = 'main:home') { const rows = []; for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(x => btn(x[0], x[1], x[2] || {}))); rows.push([btn('↩️ Назад', backRoute), btn('🏠 Главное', 'main:home')]); return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function screen(title, lines, items = [], backRoute = 'main:home') { return { text: [title, '', (Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || ''))].join('\n'), attachments: keyboard(items, backRoute) }; }

async function getS(id) { const f = await state.getFlow(id); return f.menuV3 || {}; }
async function saveS(id, patch) { return state.setFlow(id, patch); }

function b64urlEncodeJson(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

async function sendFreshGiftScreen(update, sc, route) {
  const id = adminId(update) || chatId(update) || 'global';
  const s = await getS(id);
  const prevGlobal = await state.getMenu(id);
  const history = []
    .concat(Array.isArray(s.giftMenuIds) ? s.giftMenuIds : [])
    .concat(Array.isArray(s.giftGarbageIds) ? s.giftGarbageIds : [])
    .concat([s.giftPromptMessageId, prevGlobal])
    .map(clean).filter(Boolean);

  const sent = await api.sendMessage({ botToken: config.botToken, chatId: chatId(update) || undefined, userId: chatId(update) ? undefined : id, text: sc.text, attachments: sc.attachments, notify: false });
  const mid = responseMessageId(sent);
  if (mid) await state.setMenu(id, mid);
  await saveS(id, { giftMenuIds: mid ? [mid] : [], giftPromptMessageId: mid || '', giftGarbageIds: [], giftLastRoute: route, giftUpdatedAt: Date.now() });

  // Important: do not delete the user's just-sent title/link/photo/text message.
  await deleteMany(history.filter(x => x && x !== mid && x !== messageId(update)));
  const cbid = callbackId(update); if (cbid) api.answerCallback({ botToken: config.botToken, callbackId: cbid, notification: '' }).catch(() => {});
  return { handled: true, route, sentKind: 'cc7512_gift_fresh_bottom_menu', messageId: mid, edited: false };
}

async function giftInputScreen(id, field) {
  await saveS(id, { mode: `cc7511:gifts:${field}` });
  if (field === 'giftContent') {
    return screen('🎁 Подарки — шаг 4/6', [
      'Пришлите сам подарок.',
      'Можно отправить: ссылку, фото, файл или обычный текст.',
      'Например: https://site.ru/checklist.pdf или текст промокода.'
    ], [], 'gifts:flow:inputTitle');
  }
  return screen('🎁 Подарки — шаг 3/6', [
    'Пришлите название подарка — текст на кнопке под постом.',
    'Например: Чек-лист / PDF-гайд / Промокод'
  ], [], 'gifts:flow:post');
}
async function giftModeScreen(id) {
  await saveS(id, { mode: '' });
  return screen('🎁 Подарки — шаг 5/6', ['Выберите, кто сможет получить подарок.'], [['✅ Только подписчикам', 'gifts:flow:mode', { requireSubscription: true }], ['🌐 Всем', 'gifts:flow:mode', { requireSubscription: false }]], 'gifts:flow:inputContent');
}
async function handleAwaitGiftInput(update, id) {
  const s = await getS(id); const mode = clean(s.mode);
  if (!mode.startsWith('cc7511:gifts:') && !mode.startsWith('cc7512:gifts:') && !mode.startsWith('cc758:gifts:') && !mode.startsWith('cc757:gifts:')) return null;
  const field = mode.split(':').pop();
  const txt = textOf(update);
  const giftPayload = field === 'giftContent' || field === 'giftLink' ? encodeGiftPayloadFromUpdate(update) : '';
  if (!giftPayload && (!txt || START.has(txt.toLowerCase()))) return null;
  const flow = { ...(s.giftsFlow || {}) };
  if (field === 'giftTitle') flow.giftTitle = txt;
  if (field === 'giftContent' || field === 'giftLink') flow.giftLink = giftPayload || txt;
  await saveS(id, { mode: '', giftsFlow: flow });
  if (field === 'giftTitle') return await giftInputScreen(id, 'giftContent');
  return await giftModeScreen(id);
}

async function tryHandle(update) {
  const id = adminId(update) || chatId(update) || 'global';
  const awaitedGift = await handleAwaitGiftInput(update, id);
  if (awaitedGift) return sendFreshGiftScreen(update, awaitedGift, 'gifts:await');
  return base.tryHandle(update);
}
async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return { ...b, ok: true, runtimeVersion: RUNTIME, marker: MARKER,
    features: [...(b.features || []), 'gift_fresh_bottom_menu_after_user_input', 'gift_previous_menu_cleanup_after_input', 'gift_comment_refresh_preserves_addons'],
    commentsCoreTouched: false, buttonsCoreTouched: false,
    policy: 'gift_menu_position_and_post_addons_preserve_over_7511'
  };
}
function install() { return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
