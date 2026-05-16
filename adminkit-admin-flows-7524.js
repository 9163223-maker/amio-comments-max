'use strict';

// CC7.5.24: hard reset stale admin flow state on /start/main-menu entry.
// Purpose: when admin clears chat history or presses Start while a lead-magnet flow is half-open,
// never resurrect old step 4/5/6 menus. Also keeps CC7.5.23 lead wording/menu cleanup active.

const config = require('./config');
const api = require('./services/maxApi');
const db = require('./cc5-db-core');
const state = require('./db-v3-state');
const base = require('./adminkit-admin-flows-7523');

const RUNTIME = 'CC7.5.24-START-RESET-LEAD-MENU-CLEAN';
const MARKER = '__ADMINKIT_CC7_5_24_START_RESET_LEAD_MENU_CLEAN__';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const START = new Set(['/start', 'start', 'старт', 'меню', 'menu', 'главное меню', '🏠 главное меню']);

function body(u) { return u?.body || u?.data || u || {}; }
function msg(u) { return body(u).message || u?.message || body(u).callback?.message || null; }
function cb(u) { return body(u).callback || u?.callback || null; }
function textOf(u) { const m = msg(u); return clean(m?.body?.text || m?.text || body(u).text || ''); }
function payloadOf(u) { const raw = cb(u)?.payload || cb(u)?.data || ''; if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { r: raw }; } } return raw && typeof raw === 'object' ? raw : {}; }
function routeOf(u) { const p = payloadOf(u); return clean(p.r || p.route || textOf(u)); }
function adminId(u) { try { return db.adminId(u) || db.chatId(u) || ''; } catch { return clean(cb(u)?.user?.user_id || msg(u)?.sender?.user_id || body(u).user_id || ''); } }
function messageId(u) { try { return db.messageId(u) || ''; } catch { return clean(cb(u)?.message?.message_id || msg(u)?.message_id || msg(u)?.id || ''); } }
function callbackId(u) { try { return db.callbackId(u); } catch { return clean(cb(u)?.callback_id || cb(u)?.id || ''); } }

function isStartOrHome(update) {
  const route = routeOf(update).toLowerCase();
  const txt = textOf(update).toLowerCase();
  return START.has(route) || START.has(txt) || route === 'main:home' || route === 'home' || route === 'main';
}

function menuIdsFromState(s = {}, globalMenu = '', current = '') {
  return []
    .concat(Array.isArray(s.giftMenuIds) ? s.giftMenuIds : [])
    .concat(Array.isArray(s.giftGarbageIds) ? s.giftGarbageIds : [])
    .concat(Array.isArray(s.buttonMenuIds) ? s.buttonMenuIds : [])
    .concat(Array.isArray(s.buttonGarbageIds) ? s.buttonGarbageIds : [])
    .concat([s.giftPromptMessageId, s.giftLastPromptMessageId, s.buttonPromptMessageId, s.buttonLastPromptMessageId, globalMenu, current])
    .map(clean)
    .filter(Boolean);
}

function deleteLater(mid, delayMs) {
  if (!mid || !config.botToken) return;
  setTimeout(() => api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {}), delayMs);
}

async function neutralizeAndDelete(ids = []) {
  for (const mid of [...new Set(ids.map(clean).filter(Boolean))]) {
    try { await api.editMessage({ botToken: config.botToken, messageId: mid, text: '✅ Меню закрыто', attachments: [], notify: false }); } catch {}
    api.deleteMessage({ botToken: config.botToken, messageId: mid, timeoutMs: config.menuDeleteTimeoutMs || 1800 }).catch(() => {});
    deleteLater(mid, 350); deleteLater(mid, 900); deleteLater(mid, 1800); deleteLater(mid, 3600);
  }
}

async function resetAdminFlow(update) {
  const id = adminId(update) || 'global';
  const old = await state.getFlow(id);
  const s = old.menuV3 || {};
  const globalMenu = await state.getMenu(id);
  const current = messageId(update);
  const staleMenus = menuIdsFromState(s, globalMenu, callbackId(update) ? '' : current);

  await state.setFlow(id, {
    mode: '',
    activeFlow: '',
    currentSection: '',
    giftsFlow: null,
    buttonsFlow: null,
    giftEditMode: '',
    giftMenuIds: [],
    giftGarbageIds: [],
    giftPromptMessageId: '',
    giftLastPromptMessageId: '',
    giftLastRoute: '',
    buttonMenuIds: [],
    buttonGarbageIds: [],
    buttonPromptMessageId: '',
    buttonLastPromptMessageId: '',
    buttonLastRoute: '',
    leadAccessMode: '',
    leadConditions: null,
    leadConditionsEnabled: false,
    startResetAt: Date.now(),
    startResetRuntime: RUNTIME
  });
  await neutralizeAndDelete(staleMenus);
  return { id, staleMenus: staleMenus.length };
}

async function tryHandle(update) {
  if (isStartOrHome(update)) {
    try { await resetAdminFlow(update); } catch (error) { console.warn('[cc7.5.24] start reset failed:', error?.message || error); }
  }
  return base.tryHandle(update);
}

async function tryHandleExpress(req) { return tryHandle(req.body || req); }
function render(route = 'main:home') { return base.render(route); }
function selfTest() {
  const b = base.selfTest ? base.selfTest() : {};
  return {
    ...b,
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    sectionLabel: 'Подарки / Лид-магниты',
    professionalTermInside: 'Лид-магниты',
    startResetClearsLeadGiftButtonFlow: true,
    startDoesNotResumeStep456: true,
    hardRootMustPointHere: true,
    commentsCoreTouched: false,
    buttonsCoreTouched: false,
    giftsCoreTouched: true,
    policy: 'start_resets_stale_lead_magnet_button_flow_over_7523'
  };
}
function install() { return selfTest(); }

module.exports = { RUNTIME, MARKER, install, selfTest, render, tryHandle, tryHandleExpress, forceRepatchPost: base.forceRepatchPost };
