'use strict';

const Module = require('module');
const menuMap = require('./production-menu-map-v3');

const RUNTIME = 'CC6.5.4.3';
const SOURCE = 'adminkit-CC6.5.4.3-production-menu-map-v3-debug';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function compactValidation() {
  const validation = menuMap.validateMenuMapV3();
  return {
    ok: validation.ok,
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    version: validation.version,
    testMode: validation.testMode,
    totalSections: validation.totalSections,
    totalRoutes: validation.totalRoutes,
    visibleRoutes: validation.visibleRoutes,
    mainMenuRoutes: validation.mainMenuRoutes,
    errors: validation.errors.length,
    warnings: validation.warnings.length,
    countsByOwner: validation.countsByOwner,
    countsByTariff: validation.countsByTariff,
    countsByStatus: validation.countsByStatus,
    rules: validation.rules,
    debugJson: '/debug/production-menu-map-v3',
    debugOwner: '/debug/production-menu-owner-v3?owner=comments'
  };
}

function install() {
  if (Module._load.__productionMenuMapV3Debug) return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, alreadyInstalled: true };
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__productionMenuMapV3DebugWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__productionMenuMapV3Debug) {
          app.__productionMenuMapV3Debug = true;
          app.use((req, res, next) => {
            const path = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (path === '/debug/production-menu-map-v3-summary') {
              noCache(res);
              return res.json(compactValidation());
            }
            if (path === '/debug/production-menu-map-v3') {
              noCache(res);
              return res.json({ ok: true, runtime: RUNTIME, sourceMarker: SOURCE, ...menuMap.getMenuMapV3() });
            }
            if (path === '/debug/production-menu-owner-v3') {
              noCache(res);
              const owner = String(req.query?.owner || '').trim();
              return res.json({ ok: true, runtime: RUNTIME, sourceMarker: SOURCE, owner, routes: menuMap.getOwnerRoutes(owner) });
            }
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__productionMenuMapV3DebugWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__productionMenuMapV3Debug = true;
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, compactValidation };
