'use strict';

// AdminKIT V3 debug endpoints for the isolated feature adapter.
// Safe Core Freeze: no Express patching, no Module._load, no app.post, no webhook, no boot changes.

const adapter = require('./adapter');
const dataAdapter = require('./data-adapter');
const RUNTIME = 'CC6.5.5.0-MENU-V3-DATA-SELFTEST';
const SOURCE = 'adminkit-menu-v3-data-selftest-no-boot-hook';

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

function queryOptions(req) {
  return {
    adminId: String((req.query && (req.query.adminId || req.query.admin)) || ''),
    channelId: String((req.query && (req.query.channelId || req.query.channel)) || ''),
    limit: Number((req.query && req.query.limit) || 20),
  };
}

function install(app) {
  if (!app || app.__adminkitMenuV3AdapterDebug) return app;
  app.__adminkitMenuV3AdapterDebug = true;

  app.get('/debug/menu-v3-adapter-selftest', async (req, res) => {
    try {
      const result = adapter.selfTest();
      const dataResult = await dataAdapter.selfTest(queryOptions(req));
      return safeJson(res, {
        ok: Boolean(result.ok && dataResult.ok),
        endpoint: '/debug/menu-v3-adapter-selftest',
        adapterVersion: adapter.VERSION,
        adapterSource: adapter.SOURCE,
        dataAdapterVersion: dataAdapter.VERSION,
        dataAdapterSource: dataAdapter.SOURCE,
        validation: result,
        dataValidation: dataResult,
      });
    } catch (error) {
      return safeJson(res.status(500), {
        ok: false,
        endpoint: '/debug/menu-v3-adapter-selftest',
        error: error && error.message ? error.message : String(error),
      });
    }
  });

  app.get('/debug/menu-v3-adapter-render', async (req, res) => {
    try {
      const route = String(req.query.route || 'main:home');
      const options = queryOptions(req);
      const dataContext = route.endsWith(':choose_post') ? await dataAdapter.getPostContext(options) : null;
      const screen = adapter.render(route, { debug: true, dataContext });
      return safeJson(res, {
        ok: Boolean(screen && screen.text),
        endpoint: '/debug/menu-v3-adapter-render',
        route,
        dataContext,
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

  app.get('/debug/menu-v3-data-selftest', async (req, res) => {
    try {
      const result = await dataAdapter.selfTest(queryOptions(req));
      return safeJson(res, {
        ok: Boolean(result.ok),
        endpoint: '/debug/menu-v3-data-selftest',
        dataValidation: result,
      });
    } catch (error) {
      return safeJson(res.status(500), {
        ok: false,
        endpoint: '/debug/menu-v3-data-selftest',
        error: error && error.message ? error.message : String(error),
      });
    }
  });

  return app;
}

module.exports = { install, RUNTIME, SOURCE };
