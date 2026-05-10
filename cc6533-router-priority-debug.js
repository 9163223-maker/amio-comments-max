'use strict';

// CC6.5.3.3 router priority debug marker.
// The fix is in main-cc6526.js require order: generic routers are installed first,
// specific routers are installed later and therefore handle callbacks first.

const Module = require('module');
const RUNTIME = 'CC6.5.3.3';
const SOURCE = 'adminkit-CC6.5.3.3-router-priority-fix';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function installExpressPatch() {
  if (Module._load.__cc6533PriorityDebugPatch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6533Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6533PriorityDebug) {
          app.__cc6533PriorityDebug = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/router-priority') {
              noCache(res);
              return res.type('text/plain').send([
                'OK: ROUTER_PRIORITY_READY',
                'runtime: ' + RUNTIME,
                'sourceMarker: ' + SOURCE,
                'rule: generic_routers_first_specific_routers_last',
                'moderationPriority: cc6532_handles_moderation_before_cc6526',
                'accessPriority: cc6528_handles_access_before_cc6526',
                'reason: callback_actions_must_not_fall_to_older_router'
              ].join('\n') + '\n');
            }
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6533Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6533PriorityDebugPatch = true;
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
