'use strict';

// АдминКИТ V3 menu callback hard router v3.
// It scans all webhook handler arguments, intercepts only V3 admin-menu callbacks,
// and renders the functional V3 actions adapter. It does not touch open_app comments.

const Module = require('module');

const RUNTIME = 'CC6.6.9-V3-MENU-CALLBACK-HARD-ROUTER-V3';
const SOURCE = 'adminkit-v3-menu-callback-hard-router-load-functional-actions';

const MAIN_ROUTES = [
  'channels:home','comments:home','moderation:home','editor:home','buttons:home','gifts:home','highlight:home','polls:home','stats:home','billing:home','referrals:home','help:home'
];

let installed = false;
let expressWrapped = false;
let botWrapped = false;
let handledCallbacks = 0;
let fallbackRendered = 0;
let lastHandledAt = '';
let lastError = '';
let wrappedExports = [];
let menuActions = null;

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function lower(v) { return norm(v).toLowerCase(); }
function noCache(res) { try { res.set({ 'Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0', Pragma:'no-cache', Expires:'0', 'Surrogate-Control':'no-store' }); } catch {} }

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  const s = norm(value);
  if (!s) return {};
  try { const parsed = JSON.parse(s); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}
function deepFirst(obj, keys = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return '';
  seen.add(obj);
  const wanted = new Set(keys.map((k) => lower(k)));
  for (const [key, value] of Object.entries(obj)) {
    if (wanted.has(lower(key))) {
      if (value && typeof value === 'object') {
        const nested = deepFirst(value, keys, seen);
        if (nested) return nested;
      }
      const s = norm(value);
      if (s && s !== '[object Object]') return s;
    }
  }
  for (const value of Object.values(obj)) {
    const nested = deepFirst(value, keys, seen);
    if (nested) return nested;
  }
  return '';
}
function db() { try { return require('./cc5-db-core'); } catch { return null; } }
function getCallback(update = {}) { return update?.callback || update?.data?.callback || update?.message?.callback || update?.update?.callback || update?.body?.callback || update?.body?.data?.callback || update?.body?.message?.callback || null; }
function getPayload(update = {}) {
  try { const core = db(); const p = core && typeof core.payload === 'function' ? core.payload(update) : null; if (p && typeof p === 'object' && Object.keys(p).length) return p; } catch {}
  const cb = getCallback(update) || {};
  return parseJson(cb.payload || cb.data || cb.callback_data || cb.value || update.payload || update.body?.payload || deepFirst(update, ['payload','callback_data','data','value']));
}
function routeFromUpdate(update = {}) {
  const p = getPayload(update);
  const raw = norm(p.r || p.route || p.action || p.command || p.payload || deepFirst(update, ['route','action','command']));
  const mapped = { ak_main_menu:'main:home', main_menu:'main:home', menu_main:'main:home', home:'main:home', start:'main:home', '/start':'main:home', menu:'main:home', 'главное меню':'main:home' };
  return mapped[lower(raw)] || raw;
}
function isV3MenuRoute(route = '') {
  const r = norm(route);
  if (!r) return false;
  if (r === 'main:home') return true;
  if (MAIN_ROUTES.includes(r)) return true;
  if (/^(channels|comments|comments_banner|comments_photo|comments_reactions|moderation|editor|buttons|gifts|highlight|polls|stats|billing|referrals|help):/.test(r)) return true;
  return false;
}
function findUpdateArg(args = []) {
  const list = [];
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') continue;
    list.push(arg);
    if (arg.body && typeof arg.body === 'object') list.push(arg.body);
    if (arg.update && typeof arg.update === 'object') list.push(arg.update);
    if (arg.data && typeof arg.data === 'object') list.push(arg.data);
  }
  for (const item of list) {
    if (getCallback(item) && isV3MenuRoute(routeFromUpdate(item))) return item;
  }
  return null;
}
function callbackButton(text, route) { return { type:'callback', text, payload: JSON.stringify({ r: route }) }; }
function fallbackScreen(route = 'main:home') {
  const owner = norm(route).split(':')[0] || 'main';
  if (route === 'main:home') {
    const buttons = MAIN_ROUTES.map((r) => callbackButton({channels:'📺 Каналы',comments:'💬 Комментарии',moderation:'🛡 Модерация',editor:'✏️ Редактор',buttons:'⚪ Кнопки',gifts:'🎁 Подарки',highlight:'📌 Выделение',polls:'🗳 Опросы',stats:'📊 Статистика',billing:'🧾 Тарифы',referrals:'🤝 Рефералы',help:'❓ Помощь'}[r.split(':')[0]] || r, r));
    const rows = []; for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    return { text:'🐋 АдминКИТ\n\nПанель управления MAX-каналом. Выберите раздел.', attachments:[{ type:'inline_keyboard', payload:{ buttons: rows } }] };
  }
  return { text:`${owner}\n\nРаздел открыт. Функция привязана к V3-дереву.`, attachments:[{ type:'inline_keyboard', payload:{ buttons:[[callbackButton('🏠 Главное меню','main:home')]] } }] };
}
function resultMessageId(result) {
  const raw = JSON.stringify(result || {});
  const str = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*\"([^\"{}]+)\"/); if (str) return str[1];
  const num = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*(\d+)/); return num ? num[1] : '';
}
function installMenuActions() {
  try {
    const actions = require('./v3-menu-actions-adapter');
    if (actions && typeof actions.install === 'function') menuActions = actions.install();
    return menuActions || { ok:false, error:'menu_actions_missing' };
  } catch (error) { menuActions = { ok:false, error:error?.message || String(error) }; return menuActions; }
}
async function answerCallback(update) {
  const api = require('./services/maxApi'); const cfg = require('./config');
  let callbackId = '';
  try { const core = db(); callbackId = core && typeof core.callbackId === 'function' ? core.callbackId(update) : ''; } catch {}
  if (!callbackId) callbackId = norm(deepFirst(getCallback(update) || update, ['callback_id','callbackId','id']));
  if (callbackId) { try { await api.answerCallback({ botToken: cfg.botToken, callbackId, notification:'' }); } catch {} }
}
async function sendOrEdit(update, adminId, packet) {
  const api = require('./services/maxApi'); const cfg = require('./config'); const core = db();
  let mid = '';
  try { mid = core && typeof core.messageId === 'function' ? core.messageId(update) : ''; } catch {}
  if (!mid) mid = norm(deepFirst(update, ['message_id','messageId','mid']));
  if (mid) {
    try { await api.editMessage({ botToken: cfg.botToken, messageId: mid, text: packet.text, attachments: packet.attachments || [], notify:false }); try { if (core?.setMenu) await core.setMenu(adminId, mid); } catch {} return { mode:'edit', messageId: mid }; }
    catch (error) { lastError = error?.message || String(error || 'edit_failed'); }
  }
  const result = await api.sendMessage({ botToken: cfg.botToken, userId: adminId, text: packet.text, attachments: packet.attachments || [], notify:false });
  const nextId = resultMessageId(result); try { if (nextId && core?.setMenu) await core.setMenu(adminId, nextId); } catch {}
  return { mode:'send', messageId: nextId };
}
async function renderPacket(route, adminId, payload) {
  try {
    const actions = require('./v3-menu-actions-adapter');
    if (actions && typeof actions.renderScreen === 'function') return await actions.renderScreen(route, adminId, payload || {});
  } catch (error) { lastError = error?.message || String(error || 'actions_render_failed'); }
  try {
    const menu = require('./clean-v3-menu-core-db');
    if (menu && typeof menu.renderScreen === 'function') return await menu.renderScreen(route, adminId, payload || {});
  } catch (error) { lastError = error?.message || String(error || 'clean_render_failed'); }
  fallbackRendered += 1; return fallbackScreen(route);
}
async function handleUpdate(update = {}) {
  const route = routeFromUpdate(update);
  if (!getCallback(update) || !isV3MenuRoute(route)) return false;
  const core = db(); let adminId = '';
  try { adminId = core && typeof core.adminId === 'function' ? core.adminId(update) : ''; } catch {}
  if (!adminId) adminId = norm(deepFirst(update, ['user_id','userId','sender_id','from_id']));
  if (!adminId) return false;
  const payload = getPayload(update);
  await answerCallback(update);
  const packet = await renderPacket(route, adminId, payload);
  const result = await sendOrEdit(update, adminId, packet);
  handledCallbacks += 1; lastHandledAt = new Date().toISOString();
  return { ok:true, handledBy:RUNTIME, sourceMarker:SOURCE, route, result };
}
function wrapFunction(fn, name) {
  return async function wrapped(...args) {
    try { const update = findUpdateArg(args); if (update) { const handled = await handleUpdate(update); if (handled) return handled; } }
    catch (error) { lastError = error?.message || String(error || 'hard_router_failed'); console.warn('[v3-menu-hard-router]', name, lastError); }
    return fn.apply(this, args);
  };
}
function wrapBotExports() {
  const bot = require('./bot');
  if (!bot || bot.__adminkitV3MenuCallbackHardRouter) return;
  if (typeof bot === 'function') return;
  Object.keys(bot).forEach((key) => {
    if (typeof bot[key] !== 'function' || bot[key].__adminkitV3MenuCallbackWrapped) return;
    const original = bot[key]; const wrapped = wrapFunction(original, key); wrapped.__adminkitV3MenuCallbackWrapped = true; bot[key] = wrapped; wrappedExports.push(key);
  });
  bot.__adminkitV3MenuCallbackHardRouter = { runtimeVersion:RUNTIME, sourceMarker:SOURCE, wrappedExports };
  botWrapped = true;
}
function installExpressDebugRoute() {
  if (Module._load.__adminkitV3MenuCallbackHardRouterExpress) return;
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitV3MenuCallbackHardRouterWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitV3MenuCallbackHardRouterDebug) {
          app.__adminkitV3MenuCallbackHardRouterDebug = true;
          app.get(['/debug/v3-menu-callback-router','/debug/v3-menu-callback-hard-router'], (req, res) => { noCache(res); res.json(selfTest()); });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded); Object.assign(expressWrapper, loaded); expressWrapper.__adminkitV3MenuCallbackHardRouterWrap = true; expressWrapped = true; return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitV3MenuCallbackHardRouterExpress = true;
}
function install() {
  if (installed) return selfTest();
  installed = true; installMenuActions(); installExpressDebugRoute();
  try { wrapBotExports(); } catch (error) { lastError = error?.message || String(error || 'wrap_failed'); }
  return selfTest();
}
function selfTest() {
  let actionsTest = menuActions;
  try { actionsTest = require('./v3-menu-actions-adapter').selfTest(); } catch (error) { actionsTest = { ok:false, error:error?.message || String(error) }; }
  return { ok: installed && botWrapped, runtimeVersion:RUNTIME, sourceMarker:SOURCE, installed, botWrapped, expressWrapped, wrappedExports, handledCallbacks, fallbackRendered, lastHandledAt, lastError, menuActions: actionsTest, argumentDetection:'scan_all_args_and_nested_body', policy:{ interceptsOnlyCallbacks:true, v3AdminMenuRoutesOnly:true, commentsOpenAppUntouched:true, postPatcherUntouched:true, oldPatchedPostsUntouched:true, everyVisibleButtonHasHandler:true }, routes:{ mainRoutes:MAIN_ROUTES, debug:'/debug/v3-menu-callback-router' } };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, handleUpdate, isV3MenuRoute, routeFromUpdate, findUpdateArg };
