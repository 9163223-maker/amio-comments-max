'use strict';

// CC6.5.2.4 production menu map debug/QA layer.
// Exposes production menu map v2 where every button has owner, tariffGate and status.

const Module = require('module');
const RUNTIME = 'CC6.5.2.4';
const SOURCE = 'adminkit-CC6.5.2.4-production-menu-map-v2';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}
function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function loadMap() { return require('./production-menu-map-v2'); }
function sendText(res, lines) { noCache(res); return res.type('text/plain').send(lines.join('\n') + '\n'); }
function sendProductionMenuSummary(req, res) {
  const map = loadMap();
  const lines = map.getProductionMenuSummaryLines();
  return sendText(res, [...lines, 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'debugJson: /debug/production-menu-map', 'debugOwner: /debug/production-menu-owner?owner=comments']);
}
function sendProductionMenuMap(req, res) {
  noCache(res);
  const map = loadMap();
  return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, validation: map.validateProductionMenuMap(), menu: map.getProductionMenuMap() });
}
function sendProductionMenuValidation(req, res) {
  noCache(res);
  const map = loadMap();
  const validation = map.validateProductionMenuMap();
  return res.json({ ok: validation.ok, runtimeVersion: RUNTIME, sourceMarker: SOURCE, validation });
}
function sendOwner(req, res) {
  noCache(res);
  const owner = norm(req.query?.owner || '').toLowerCase();
  const map = loadMap();
  if (!owner) return res.status(400).json({ ok: false, error: 'owner_required', example: '/debug/production-menu-owner?owner=comments', owners: map.OWNER_ORDER });
  return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, owner, items: map.getByOwner(owner) });
}
function sendRoute(req, res) {
  noCache(res);
  const route = norm(req.query?.route || '');
  const map = loadMap();
  if (!route) return res.status(400).json({ ok: false, error: 'route_required', example: '/debug/production-menu-route?route=comments:choose_post' });
  const item = map.getRoute(route);
  return res.json({ ok: Boolean(item), runtimeVersion: RUNTIME, sourceMarker: SOURCE, route, item });
}
function sendTariffMatrix(req, res) {
  noCache(res);
  const map = loadMap();
  const matrix = map.MENU_ITEMS.reduce((acc, item) => {
    const tariff = item.tariffGate || 'unknown';
    if (!acc[tariff]) acc[tariff] = [];
    acc[tariff].push({ route: item.route, owner: item.owner, title: item.title, status: item.status, visible: item.visible });
    return acc;
  }, {});
  return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, tariffs: map.TARIFF, matrix });
}
function installExpressPatch() {
  if (Module._load.__cc6524ProductionMenuMapPatch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6524Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6524ProductionMenuMap) {
          app.__cc6524ProductionMenuMap = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/production-menu-map.txt') return sendProductionMenuSummary(req, res);
            if (route === '/debug/production-menu-map') return sendProductionMenuMap(req, res);
            if (route === '/debug/production-menu-validation') return sendProductionMenuValidation(req, res);
            if (route === '/debug/production-menu-owner') return sendOwner(req, res);
            if (route === '/debug/production-menu-route') return sendRoute(req, res);
            if (route === '/debug/tariff-matrix') return sendTariffMatrix(req, res);
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6524Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6524ProductionMenuMapPatch = true;
  Module._load = patchedLoad;
}
function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  installExpressPatch();
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}
module.exports = { RUNTIME, SOURCE, install };
