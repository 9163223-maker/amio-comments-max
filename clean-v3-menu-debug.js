'use strict';

const Module = require('module');
const hardRoot = require('./menu-v3-hard-root');

const RUNTIME = 'HARD-V3-MENU-DEBUG-1.2-ASYNC-SELFTEST';

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function install() {
  if (Module._load.__hardV3DebugOnly) return selfTest();
  const oldLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__hardV3DebugOnlyWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__hardV3DebugRoutes) {
          app.__hardV3DebugRoutes = true;
          app.get('/debug/menu-v3-hard', async (req, res) => {
            noCache(res);
            try {
              const adminId = String(req.query?.adminId || req.query?.admin || '').trim();
              const asyncTest = hardRoot.selfTestAsync ? await hardRoot.selfTestAsync(adminId) : null;
              res.json({ ok: true, runtimeVersion: RUNTIME, hardRoot: hardRoot.selfTest(), asyncTest });
            } catch (error) {
              res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error) });
            }
          });
          app.get('/debug/menu-v3-hard-render', async (req, res) => {
            noCache(res);
            try {
              const route = String(req.query?.route || 'main:home').trim() || 'main:home';
              const adminId = String(req.query?.adminId || req.query?.admin || '').trim();
              const screen = hardRoot.renderAsync ? await hardRoot.renderAsync(route, adminId, {}) : hardRoot.render(route);
              res.json({ ok: true, runtimeVersion: RUNTIME, route, screen });
            } catch (error) {
              res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error) });
            }
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__hardV3DebugOnlyWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__hardV3DebugOnly = true;
  return selfTest();
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, hardRoot: hardRoot.selfTest() }; }
module.exports = { RUNTIME, install, selfTest };
