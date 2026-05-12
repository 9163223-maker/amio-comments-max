'use strict';

const Module = require('module');
const { audit } = require('./handlers');
const { tree } = require('./tree');

const RUNTIME = 'V3-CLEAN-MENU-SUMMARY-0.1';
let installed = false;
let expressWrapped = false;

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function buildSummary() {
  const rows = audit();
  const missing = rows.filter((x) => !x.handlerExists);
  const byParent = {};
  for (const row of rows) {
    const key = row.parent || 'root';
    byParent[key] = (byParent[key] || 0) + 1;
  }
  return {
    ok: missing.length === 0,
    runtimeVersion: RUNTIME,
    screens: Object.keys(tree).length,
    routes: rows.length,
    missing: missing.length,
    byParent,
    firstMissing: missing.slice(0, 10).map((x) => x.route)
  };
}

function install() {
  if (installed) return selfTest();
  installed = true;
  if (Module._load.__adminkitCleanV3MenuSummary) return selfTest();
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitCleanV3MenuSummaryWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitCleanV3MenuSummaryRoutes) {
          app.__adminkitCleanV3MenuSummaryRoutes = true;
          app.get(['/debug/menu-v3-short', '/debug/menu-v3-summary-short'], (req, res) => {
            noCache(res);
            res.json(buildSummary());
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitCleanV3MenuSummaryWrap = true;
      expressWrapped = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitCleanV3MenuSummary = true;
  return selfTest();
}

function selfTest() { return { ok: installed, runtimeVersion: RUNTIME, installed, expressWrapped, endpoint: '/debug/menu-v3-short' }; }

module.exports = { RUNTIME, install, selfTest, buildSummary };
