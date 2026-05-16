'use strict';

const Module = require('module');
const coreBridge = require('./src/core/coreCallbackBridge');

const RUNTIME = 'CORE-CALLBACK-BRIDGE-LAYER-1.0-CANARY-ONLY';
const MARKER = '__ADMINKIT_CORE_CALLBACK_BRIDGE_LAYER__';

function isWebhookPath(path) {
  if (Array.isArray(path)) return path.some(isWebhookPath);
  if (path instanceof RegExp) return true;
  const s = String(path || '').toLowerCase();
  return s.includes('webhook') || s === '/' || s.includes('/bot');
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const oldLoad = Module._load;

  Module._load = function adminkitCoreCallbackBridgeLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__adminkitCoreCallbackBridgeWrapped) return loaded;

    function wrappedExpress(...args) {
      const app = loaded(...args);
      if (!app || app.__adminkitCoreCallbackBridgeAppWrapped) return app;
      app.__adminkitCoreCallbackBridgeAppWrapped = true;
      const oldPost = app.post.bind(app);

      app.post = function coreCallbackBridgePost(path, ...handlers) {
        if (!isWebhookPath(path)) return oldPost(path, ...handlers);
        const bridgeGuard = async function coreCallbackBridgeGuard(req, res, next) {
          try {
            const result = await coreBridge.tryHandleExpress(req);
            if (result && result.handled) {
              return res.status(200).json({
                ok: true,
                runtimeVersion: RUNTIME,
                bridgeRuntime: coreBridge.RUNTIME,
                coreHandled: true,
                route: result.route,
                deliveryMode: result.deliveryMode,
                sent: result.sent,
                gate: result.gate
              });
            }
          } catch (error) {
            console.error('[core-callback-bridge-layer] bridge failed:', error?.message || error);
          }
          return next();
        };
        return oldPost(path, bridgeGuard, ...handlers);
      };
      return app;
    }

    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__adminkitCoreCallbackBridgeWrapped = true;
    return wrappedExpress;
  };

  return selfTest(false);
}

function selfTest(already = false) {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    already,
    bridge: coreBridge.selfTest ? coreBridge.selfTest() : null,
    policy: 'core callback bridge is canary-only; non-core callbacks fall through to legacy'
  };
}

module.exports = { RUNTIME, MARKER, install, selfTest };
