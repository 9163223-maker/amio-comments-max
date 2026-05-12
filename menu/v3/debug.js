'use strict';

const Module = require('module');
const { VERSION, audit } = require('./handlers');
const { tree } = require('./tree');

const RUNTIME = 'V3-CLEAN-MENU-DEBUG-0.1';
let installed = false;
let expressWrapped = false;

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function install() {
  if (installed) return selfTest();
  installed = true;
  if (Module._load.__adminkitCleanV3MenuDebug) return selfTest();
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitCleanV3MenuDebugWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitCleanV3MenuDebugRoutes) {
          app.__adminkitCleanV3MenuDebugRoutes = true;
          app.get('/debug/menu-v3-tree', (req, res) => {
            noCache(res);
            const rows = audit();
            res.json({
              ok: rows.every((x) => x.handlerExists),
              runtimeVersion: RUNTIME,
              handlersVersion: VERSION,
              screens: Object.keys(tree).length,
              routes: rows.length,
              missing: rows.filter((x) => !x.handlerExists),
              rows
            });
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitCleanV3MenuDebugWrap = true;
      expressWrapped = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitCleanV3MenuDebug = true;
  return selfTest();
}

function selfTest() { return { ok: installed, runtimeVersion: RUNTIME, installed, expressWrapped, endpoint: '/debug/menu-v3-tree' }; }

module.exports = { RUNTIME, install, selfTest };
