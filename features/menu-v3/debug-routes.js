'use strict';

// AdminKIT V3 debug endpoints for the isolated feature adapter.
// Safe Core Freeze: no Express patching, no Module._load, no app.post, no webhook, no boot changes.

const adapter = require('./adapter');
const RUNTIME = 'CC6.5.4.9-MENU-V3-ADAPTER-SELFTEST';
const SOURCE = 'adminkit-menu-v3-adapter-selftest-no-boot-hook';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    });
  } catch {}
}

function safeJson(res, data) {
  noCache(res);
  return res.json({
    ok: Boolean(data && data.ok),
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    safeCoreFreeze: true,
    touchesBoot: false,
    patchesExpress: false,
    patchesModuleLoad: false,
    patchesAppPost: false,
    touchesDebugStore: false,
    touchesDebugPing: false,
    attachedToWebhook: false,
    generatedAt: Date.now(),
    ...data,
  });
}

function install(app) {
  if (!app || app.__adminkitMenuV3AdapterDebug) return app;
  app.__adminkitMenuV3AdapterDebug = true;

  app.get('/debug/menu-v3-adapter-selftest', (req, res) => {
    try {
      const result = adapter.selfTest();
      return safeJson(res, {
        ok: Boolean(result.ok),
        endpoint: '/debug/menu-v3-adapter-selftest',
        adapterVersion: adapter.VERSION,
        adapterSource: adapter.SOURCE,
        validation: result,
      });
    } catch (error) {
      return safeJson(res.status(500), {
        ok: false,
        endpoint: '/debug/menu-v3-adapter-selftest',
        error: error && error.message ? error.message : String(error),
      });
    }
  });

  app.get('/debug/menu-v3-adapter-render', (req, res) => {
    try {
      const route = String(req.query.route || 'main:home');
      const screen = adapter.render(route, { debug: true });
      return safeJson(res, {
        ok: Boolean(screen && screen.text),
        endpoint: '/debug/menu-v3-adapter-render',
        route,
        screen,
      });
    } catch (error) {
      return safeJson(res.status(500), {
        ok: false,
        endpoint: '/debug/menu-v3-adapter-render',
        route: String(req.query.route || ''),
        error: error && error.message ? error.message : String(error),
      });
    }
  });

  return app;
}

module.exports = { install, RUNTIME, SOURCE };
