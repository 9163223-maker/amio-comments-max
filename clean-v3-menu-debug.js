'use strict';

const Module = require('module');
const hardRoot = require('./menu-v3-hard-root');

const RUNTIME = 'HARD-V3-MENU-DEBUG-1.0';

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
          app.get('/debug/menu-v3-hard', (req, res) => { noCache(res); res.json({ ok: true, runtimeVersion: RUNTIME, hardRoot: hardRoot.selfTest() }); });
          app.get('/debug/menu-v3-hard-render', (req, res) => { noCache(res); res.json({ ok: true, runtimeVersion: RUNTIME, route: req.query?.route || 'main:home', screen: hardRoot.render(req.query?.route || 'main:home') }); });
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
