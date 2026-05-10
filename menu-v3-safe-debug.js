'use strict';

// Safe debug endpoints for V3 adapter.
// Installed by existing debug-routes module; no boot hooks and no debug/store or debug/ping changes.

const bridge = require('./menu-v3-feature-adapter');
const menuMap = require('./production-menu-map-v3-fixed');

const RUNTIME = 'CC6.5.5.1-MENU-V3-LIVE-BRIDGE-DEBUG';
const SOURCE = 'adminkit-CC6.5.5.1-menu-v3-safe-debug';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}
function tokenOk(req) {
  const expected = String(process.env.DEBUG_TOKEN || process.env.GIFT_ADMIN_TOKEN || 'admin');
  return String(req.query.token || '') === expected;
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
    errorList: validation.errors,
    warningList: validation.warnings,
    countsByOwner: validation.countsByOwner,
    countsByTariff: validation.countsByTariff,
    countsByStatus: validation.countsByStatus,
    rules: validation.rules,
    debugJson: '/debug/production-menu-map-v3',
    debugOwner: '/debug/production-menu-owner-v3?owner=comments'
  };
}

function install(app) {
  if (!app || app.__menuV3SafeDebug) return app;
  app.__menuV3SafeDebug = true;

  app.get('/debug/menu-v3-live-bridge-selftest', (req, res) => {
    noCache(res);
    if (!tokenOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    res.json({
      ...bridge.selfTest(),
      runtime: RUNTIME,
      sourceMarker: SOURCE,
      endpoint: '/debug/menu-v3-live-bridge-selftest'
    });
  });

  app.get('/debug/menu-v3-data-selftest', async (req, res) => {
    noCache(res);
    if (!tokenOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    try {
      res.json({
        runtime: RUNTIME,
        sourceMarker: SOURCE,
        endpoint: '/debug/menu-v3-data-selftest',
        ...(await bridge.dataSelfTest(String(req.query.adminId || '')))
      });
    } catch (error) {
      res.status(500).json({ ok: false, runtime: RUNTIME, sourceMarker: SOURCE, error: error && error.message ? error.message : String(error) });
    }
  });

  app.get('/debug/menu-v3-adapter-render', async (req, res) => {
    noCache(res);
    if (!tokenOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    try {
      res.json({
        runtime: RUNTIME,
        sourceMarker: SOURCE,
        endpoint: '/debug/menu-v3-adapter-render',
        ...(await bridge.renderDebug(String(req.query.route || 'main:home'), String(req.query.adminId || '')))
      });
    } catch (error) {
      res.status(500).json({ ok: false, runtime: RUNTIME, sourceMarker: SOURCE, error: error && error.message ? error.message : String(error) });
    }
  });

  app.get('/debug/production-menu-map-v3-summary', (req, res) => {
    noCache(res);
    if (!tokenOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    res.json(compactValidation());
  });

  app.get('/debug/production-menu-map-v3', (req, res) => {
    noCache(res);
    if (!tokenOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    res.json({ ok: true, runtime: RUNTIME, sourceMarker: SOURCE, ...menuMap.getMenuMapV3() });
  });

  app.get('/debug/production-menu-owner-v3', (req, res) => {
    noCache(res);
    if (!tokenOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const owner = String(req.query.owner || '').trim();
    res.json({ ok: true, runtime: RUNTIME, sourceMarker: SOURCE, owner, routes: menuMap.getOwnerRoutes(owner) });
  });

  return app;
}

module.exports = { RUNTIME, SOURCE, install, compactValidation };
