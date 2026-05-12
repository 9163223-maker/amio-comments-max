'use strict';

// АдминКИТ V3 menu stress-test.
// Offline renderer test: walks all declared menu routes, renders every screen, checks buttons,
// navigation anchors and accidental fallbacks. Does not call MAX API and does not patch posts.

const Module = require('module');

const RUNTIME = 'CC6.7.0-V3-MENU-STRESS-TEST';
const SOURCE = 'adminkit-v3-menu-tree-offline-stress-test-v1';

let installed = false;
let expressWrapped = false;
let lastRun = null;
let lastError = '';

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

function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function parsePayload(value) {
  if (value && typeof value === 'object') return value;
  const s = norm(value);
  if (!s) return {};
  try { const parsed = JSON.parse(s); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}
function attachmentsButtons(screen) {
  const out = [];
  const attachments = Array.isArray(screen?.attachments) ? screen.attachments : [];
  for (const attachment of attachments) {
    const rows = attachment?.payload?.buttons;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const button of row) out.push(button);
    }
  }
  return out;
}
function buttonRoute(button) {
  const payload = parsePayload(button?.payload || button?.data || button?.callback_data || '');
  return norm(payload.r || payload.route || payload.action || payload.command || '');
}
function owner(route) { return norm(route).split(':')[0] || 'main'; }
function isNavRoute(route) { return route === 'main:home' || /^help:/.test(route) || route.endsWith(':home') || route.endsWith(':section_home') || route.endsWith(':main_menu'); }
function isDevOwner(o) { return ['highlight', 'polls', 'billing', 'referrals'].includes(o); }
function isMainRoute(route) { return route === 'main:home'; }

function declaredRoutes() {
  const routes = new Set(['main:home']);
  try {
    const map = require('./production-menu-map-v3-fixed');
    for (const item of map.items || []) {
      if (item && item.visible !== false && item.status !== 'internal' && item.route) routes.add(norm(item.route));
    }
  } catch {}
  try {
    const actions = require('./v3-menu-actions-adapter');
    if (actions && actions.CHILDREN) {
      Object.values(actions.CHILDREN).flat().forEach((pair) => pair?.[0] && routes.add(pair[0]));
    }
  } catch {}
  return [...routes].filter(Boolean).sort();
}

async function render(route, adminId) {
  const actions = require('./v3-menu-actions-adapter');
  if (actions && typeof actions.renderScreen === 'function') return actions.renderScreen(route, adminId, {});
  const clean = require('./clean-v3-menu-core-db');
  return clean.renderScreen(route, adminId, {});
}

async function runStressTest({ adminId = '17507246', sample = false } = {}) {
  const startedAt = new Date().toISOString();
  const routes = declaredRoutes();
  const failures = [];
  const warnings = [];
  const screens = [];
  const allButtonRoutes = new Set();
  const renderedRoutes = new Set();

  let maxButtons = 0;
  for (const route of routes) {
    try {
      const screen = await render(route, adminId);
      renderedRoutes.add(route);
      const text = norm(screen?.text || '');
      const buttons = attachmentsButtons(screen);
      maxButtons = Math.max(maxButtons, buttons.length);
      const routesFromButtons = buttons.map(buttonRoute).filter(Boolean);
      routesFromButtons.forEach((r) => allButtonRoutes.add(r));

      if (!text) failures.push({ route, code: 'empty_text' });
      if (!Array.isArray(screen?.attachments)) failures.push({ route, code: 'attachments_missing' });
      if (!buttons.length && route !== 'help:main_menu') warnings.push({ route, code: 'no_buttons' });
      if (/Маршрут:\s*/i.test(text)) failures.push({ route, code: 'raw_route_fallback_visible', text: text.slice(0, 200) });
      if (/Раздел открыт\. Функция привязана к V3-дереву/i.test(text)) failures.push({ route, code: 'generic_fallback_visible', text: text.slice(0, 200) });
      if (/undefined|null|\[object Object\]/i.test(text)) failures.push({ route, code: 'bad_text_token', text: text.slice(0, 200) });

      const o = owner(route);
      if (!isMainRoute(route) && !isNavRoute(route)) {
        const hasHome = routesFromButtons.includes('main:home');
        const hasSection = routesFromButtons.includes(`${o}:home`) || routesFromButtons.includes('comments:home') || route.startsWith('comments_');
        if (!hasHome) failures.push({ route, code: 'main_menu_anchor_missing', buttons: routesFromButtons });
        if (!hasSection && o !== 'help') warnings.push({ route, code: 'section_anchor_missing', buttons: routesFromButtons });
      }

      if (isDevOwner(o) && !/в разработке/i.test(text) && !route.endsWith(':home')) {
        warnings.push({ route, code: 'dev_route_without_in_development_label' });
      }

      if (sample || failures.length || warnings.length) {
        screens.push({ route, text: text.slice(0, 500), buttons: buttons.map((button) => ({ text: button.text, route: buttonRoute(button) })) });
      }
    } catch (error) {
      failures.push({ route, code: 'render_exception', error: error?.message || String(error) });
    }
  }

  for (const br of [...allButtonRoutes]) {
    if (br && !routes.includes(br) && br !== 'main:home' && !/^help:/.test(br)) {
      // Dynamic post cards are valid but not always visible in the static map.
      if (!/:post$/.test(br) && !/:choose_post$/.test(br)) failures.push({ route: br, code: 'button_points_to_unknown_route' });
    }
  }

  const result = {
    ok: failures.length === 0,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    startedAt,
    finishedAt: new Date().toISOString(),
    adminId,
    totals: {
      declaredRoutes: routes.length,
      renderedRoutes: renderedRoutes.size,
      uniqueButtonRoutes: allButtonRoutes.size,
      maxButtons,
      failures: failures.length,
      warnings: warnings.length
    },
    failures,
    warnings,
    sampleScreens: screens.slice(0, 120),
    policy: {
      offlineOnly: true,
      noMaxApiCalls: true,
      noPostPatch: true,
      checksEveryVisibleButtonRoute: true,
      checksMainMenuAndSectionAnchors: true,
      checksNoGenericFallbacks: true
    }
  };
  lastRun = result;
  return result;
}

function installExpress() {
  if (Module._load.__adminkitV3MenuStressTestExpress) return;
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitV3MenuStressTestWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitV3MenuStressTestRoutes) {
          app.__adminkitV3MenuStressTestRoutes = true;
          app.get(['/debug/v3-menu-stress-test', '/debug/menu-v3-stress'], async (req, res) => {
            noCache(res);
            try {
              const adminId = norm(req.query?.adminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
              const sample = String(req.query?.sample || '') === '1';
              res.json(await runStressTest({ adminId, sample }));
            } catch (error) {
              lastError = error?.message || String(error);
              res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: lastError });
            }
          });
          app.get('/debug/v3-menu-stress-last', (req, res) => { noCache(res); res.json(lastRun || selfTest()); });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitV3MenuStressTestWrap = true;
      expressWrapped = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitV3MenuStressTestExpress = true;
}

function install() {
  if (installed) return selfTest();
  installed = true;
  installExpress();
  return selfTest();
}

function selfTest() {
  return { ok: installed, runtimeVersion: RUNTIME, sourceMarker: SOURCE, installed, expressWrapped, lastError, hasLastRun: !!lastRun, endpoint: '/debug/v3-menu-stress-test' };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, runStressTest, declaredRoutes };
