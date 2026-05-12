'use strict';

// АдминКИТ V3 menu callback hard router.
// Purpose: V3 main menu can be rendered by output guards, but legacy webhook code may not
// route callback payloads like { r: 'comments:home' }. This layer intercepts only V3 admin
// menu callback routes, renders the Clean V3 screen, and leaves comments/openApp/post launch
// logic untouched.

const Module = require('module');

const RUNTIME = 'CC6.6.7-V3-MENU-CALLBACK-HARD-ROUTER';
const SOURCE = 'adminkit-v3-menu-callback-hard-router-render-only';

const MAIN_ROUTES = [
  'channels:home',
  'comments:home',
  'moderation:home',
  'editor:home',
  'buttons:home',
  'gifts:home',
  'highlight:home',
  'polls:home',
  'stats:home',
  'billing:home',
  'referrals:home',
  'help:home'
];

const MAIN_LABELS = {
  'channels:home': '📺 Каналы',
  'comments:home': '💬 Комментарии',
  'moderation:home': '🛡 Модерация',
  'editor:home': '✏️ Редактор',
  'buttons:home': '⚪ Кнопки',
  'gifts:home': '🎁 Подарки',
  'highlight:home': '📌 Выделение',
  'polls:home': '🗳 Опросы',
  'stats:home': '📊 Статистика',
  'billing:home': '🧾 Тарифы',
  'referrals:home': '🤝 Рефералы',
  'help:home': '❓ Помощь'
};

const FALLBACK_BODIES = {
  'channels:home': 'Подключение канала, список каналов и проверка прав бота.',
  'comments:home': 'Комментарии под постами. Старые пропатченные посты не переписываем без отдельного действия.',
  'moderation:home': 'Модерация комментариев: стоп-слова, ссылки, инвайты и правила постов.',
  'editor:home': 'Редактор постов: изменение текста без потери ссылок, медиа и кнопок.',
  'buttons:home': 'Пользовательские кнопки под постами.',
  'gifts:home': 'Подарки и лид-магниты за подписку.',
  'highlight:home': 'Выделение важных постов.',
  'polls:home': 'Голосования и опросы для вовлечения.',
  'stats:home': 'Статистика канала, постов, комментариев и реакций.',
  'billing:home': 'Тарифы и доступы.',
  'referrals:home': 'Реферальные ссылки и бонусы.',
  'help:home': 'Помощь по разделам АдминКИТ.'
};

let installed = false;
let expressWrapped = false;
let botWrapped = false;
let handledCallbacks = 0;
let fallbackRendered = 0;
let lastHandledAt = '';
let lastError = '';
let wrappedExports = [];

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return norm(value).toLowerCase();
}

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}

function callbackButton(text, route, extra = {}) {
  const payload = { r: route };
  Object.entries(extra || {}).forEach(([key, value]) => {
    const k = norm(key);
    if (!k || ['r', 'route', 'action', 'command', 'payload'].includes(k)) return;
    const v = norm(value);
    if (v) payload[k] = v;
  });
  return { type: 'callback', text, payload: JSON.stringify(payload) };
}

function keyboard(rows) {
  return [{ type: 'inline_keyboard', payload: { buttons: rows.filter((row) => Array.isArray(row) && row.length) } }];
}

function rows2(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

function safeDb() {
  try { return require('./cc5-db-core'); } catch { return null; }
}

function safeMenu() {
  try { return require('./clean-v3-menu-core-db'); } catch { return null; }
}

function safeMenuMapRoutes() {
  try {
    const menuMap = require('./production-menu-map-v3-fixed');
    const items = Array.isArray(menuMap.items) ? menuMap.items : [];
    return new Set(items.map((item) => norm(item.route)).filter(Boolean));
  } catch {
    return new Set();
  }
}

const MAP_ROUTES = safeMenuMapRoutes();

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  const s = norm(value);
  if (!s) return {};
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function deepFirst(obj, keys = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return '';
  seen.add(obj);
  const wanted = new Set(keys.map((key) => lower(key)));
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

function getCallback(update = {}) {
  return update?.callback || update?.data?.callback || update?.message?.callback || update?.update?.callback || null;
}

function getPayload(update = {}) {
  const db = safeDb();
  try {
    const p = db && typeof db.payload === 'function' ? db.payload(update) : null;
    if (p && typeof p === 'object' && Object.keys(p).length) return p;
  } catch {}
  const cb = getCallback(update) || {};
  return parseJson(cb.payload || cb.data || cb.callback_data || cb.value || update.payload || deepFirst(update, ['payload', 'callback_data', 'data', 'value']));
}

function routeFromUpdate(update = {}) {
  const menu = safeMenu();
  try {
    if (menu && typeof menu.routeFromUpdate === 'function') return norm(menu.routeFromUpdate(update));
  } catch {}
  const p = getPayload(update);
  const raw = norm(p.r || p.route || p.action || p.command || p.payload || deepFirst(update, ['route', 'action', 'command']));
  const mapped = {
    ak_main_menu: 'main:home',
    main_menu: 'main:home',
    menu_main: 'main:home',
    home: 'main:home',
    start: 'main:home',
    '/start': 'main:home',
    menu: 'main:home',
    'главное меню': 'main:home'
  };
  return mapped[lower(raw)] || raw;
}

function isV3MenuRoute(route = '') {
  const r = norm(route);
  if (!r) return false;
  if (r === 'main:home') return true;
  if (MAIN_ROUTES.includes(r)) return true;
  if (MAP_ROUTES.has(r)) return true;
  if (/^help:(channels|comments|moderation|editor|buttons|gifts|highlight|polls|stats|billing|referrals|main)$/.test(r)) return true;
  if (/^(comments_banner|comments_photo|comments_reactions):/.test(r)) return true;
  return false;
}

function navRows(owner = 'main') {
  if (!owner || owner === 'main') return [];
  return [
    [callbackButton('❓ Помощь', `help:${owner}`), callbackButton('↩️ Раздел', `${owner}:home`)],
    [callbackButton('🏠 Главное меню', 'main:home')]
  ];
}

function fallbackMainScreen() {
  const buttons = MAIN_ROUTES.map((route) => callbackButton(MAIN_LABELS[route] || route, route));
  return {
    text: '🐋 АдминКИТ\n\nПанель управления MAX-каналом. Выберите раздел.',
    attachments: keyboard(rows2(buttons))
  };
}

function fallbackScreen(route = 'main:home') {
  const r = norm(route) || 'main:home';
  if (r === 'main:home') return fallbackMainScreen();
  const owner = r.split(':')[0] || 'main';
  const homeRoute = MAIN_ROUTES.includes(`${owner}:home`) ? `${owner}:home` : r;
  const title = MAIN_LABELS[homeRoute] || MAIN_LABELS[r] || 'АдминКИТ';
  const body = FALLBACK_BODIES[homeRoute] || FALLBACK_BODIES[r] || 'Раздел открыт. Функции подключаются по V3-карте.';
  return {
    text: [title, '', body, '', 'Выберите действие.'].join('\n'),
    attachments: keyboard([...navRows(owner)])
  };
}

function resultMessageId(result) {
  const raw = JSON.stringify(result || {});
  const str = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*\"([^\"{}]+)\"/);
  if (str) return str[1];
  const num = raw.match(/\"(?:message_id|messageId|id)\"\s*:\s*(\d+)/);
  return num ? num[1] : '';
}

async function answerCallback(update) {
  const db = safeDb();
  const api = require('./services/maxApi');
  const config = require('./config');
  let callbackId = '';
  try { callbackId = db && typeof db.callbackId === 'function' ? db.callbackId(update) : ''; } catch {}
  if (!callbackId) callbackId = norm(deepFirst(getCallback(update) || {}, ['callback_id', 'callbackId', 'id']));
  if (!callbackId) return;
  try { await api.answerCallback({ botToken: config.botToken, callbackId, notification: '' }); } catch {}
}

async function sendOrEdit(update, adminId, packet) {
  const db = safeDb();
  const api = require('./services/maxApi');
  const config = require('./config');
  let messageId = '';
  try { messageId = db && typeof db.messageId === 'function' ? db.messageId(update) : ''; } catch {}
  if (!messageId) messageId = norm(deepFirst(update, ['message_id', 'messageId', 'mid']));

  if (messageId) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId, text: packet.text, attachments: packet.attachments || [], notify: false });
      try { if (db && typeof db.setMenu === 'function') await db.setMenu(adminId, messageId); } catch {}
      return { mode: 'edit', messageId };
    } catch (error) {
      lastError = error && error.message ? error.message : String(error || 'edit_failed');
    }
  }

  const result = await api.sendMessage({ botToken: config.botToken, userId: adminId, text: packet.text, attachments: packet.attachments || [], notify: false });
  const nextId = resultMessageId(result);
  try { if (nextId && db && typeof db.setMenu === 'function') await db.setMenu(adminId, nextId); } catch {}
  return { mode: 'send', messageId: nextId };
}

async function renderPacket(route, adminId, payload) {
  const menu = safeMenu();
  if (menu && typeof menu.renderScreen === 'function') {
    try {
      const packet = await menu.renderScreen(route, adminId, payload || {});
      if (packet && packet.text) return packet;
    } catch (error) {
      lastError = error && error.message ? error.message : String(error || 'render_failed');
    }
  }
  fallbackRendered += 1;
  return fallbackScreen(route);
}

async function handleUpdate(update = {}) {
  const cb = getCallback(update);
  if (!cb) return false;
  const route = routeFromUpdate(update);
  if (!isV3MenuRoute(route)) return false;

  const db = safeDb();
  let adminId = '';
  try { adminId = db && typeof db.adminId === 'function' ? db.adminId(update) : ''; } catch {}
  if (!adminId) adminId = norm(deepFirst(update, ['user_id', 'userId', 'sender_id', 'from_id']));
  if (!adminId) return false;

  const payload = getPayload(update);
  await answerCallback(update);
  const packet = await renderPacket(route, adminId, payload);
  const result = await sendOrEdit(update, adminId, packet);
  try {
    const menu = safeMenu();
    if (menu && typeof menu.logEvent === 'function') {
      await menu.logEvent({ adminId, route, owner: route.split(':')[0] || 'main', eventType: 'hard_router_callback', payload, messageId: result.messageId || '' });
    }
  } catch {}
  handledCallbacks += 1;
  lastHandledAt = new Date().toISOString();
  return { ok: true, handledBy: RUNTIME, sourceMarker: SOURCE, route, result };
}

function wrapFunction(fn, name) {
  return async function v3MenuCallbackHardRouterWrapper(...args) {
    try {
      const handled = await handleUpdate(args[0] || {});
      if (handled) return handled;
    } catch (error) {
      lastError = error && error.message ? error.message : String(error || 'hard_router_failed');
      console.warn('[v3-menu-callback-hard-router] fallback to original:', name, lastError);
    }
    return fn.apply(this, args);
  };
}

function wrapBotExports() {
  const bot = require('./bot');
  if (!bot || bot.__adminkitV3MenuCallbackHardRouter) return;
  if (typeof bot === 'function') return;
  Object.keys(bot).forEach((key) => {
    if (typeof bot[key] !== 'function') return;
    if (bot[key].__adminkitV3MenuCallbackWrapped) return;
    const original = bot[key];
    const wrapped = wrapFunction(original, key);
    wrapped.__adminkitV3MenuCallbackWrapped = true;
    bot[key] = wrapped;
    wrappedExports.push(key);
  });
  bot.__adminkitV3MenuCallbackHardRouter = { runtimeVersion: RUNTIME, sourceMarker: SOURCE, wrappedExports };
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
          app.get(['/debug/v3-menu-callback-router', '/debug/v3-menu-callback-hard-router'], (req, res) => {
            noCache(res);
            res.json(selfTest());
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitV3MenuCallbackHardRouterWrap = true;
      expressWrapped = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitV3MenuCallbackHardRouterExpress = true;
}

function install() {
  if (installed) return selfTest();
  installed = true;
  installExpressDebugRoute();
  try { wrapBotExports(); } catch (error) { lastError = error && error.message ? error.message : String(error || 'wrap_failed'); }
  return selfTest();
}

function selfTest() {
  return {
    ok: installed && botWrapped,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed,
    botWrapped,
    expressWrapped,
    wrappedExports,
    handledCallbacks,
    fallbackRendered,
    lastHandledAt,
    lastError,
    policy: {
      interceptsOnlyCallbacks: true,
      v3AdminMenuRoutesOnly: true,
      commentsOpenAppUntouched: true,
      postPatcherUntouched: true,
      oldPatchedPostsUntouched: true
    },
    routes: {
      mainRoutes: MAIN_ROUTES,
      debug: '/debug/v3-menu-callback-router'
    }
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, handleUpdate, isV3MenuRoute, routeFromUpdate };
