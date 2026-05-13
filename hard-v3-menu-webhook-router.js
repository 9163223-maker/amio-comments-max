'use strict';

const hardRoot = require('./menu-v3-hard-root');

const RUNTIME = 'HARD-V3-MENU-WEBHOOK-ROUTER-1.0';
const MARKER = '__HARD_V3_MENU_WEBHOOK_ROUTER__';

function isWebhookPath(path) {
  if (Array.isArray(path)) return path.some(isWebhookPath);
  if (path instanceof RegExp) return true;
  const s = String(path || '').toLowerCase();
  return s.includes('webhook') || s === '/' || s.includes('/bot');
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;

  const Module = require('module');
  const oldLoad = Module._load;

  Module._load = function hardV3MenuWebhookRouterLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__hardV3MenuWebhookWrapped) return loaded;

    function wrappedExpress(...args) {
      const app = loaded(...args);
      if (!app || app.__hardV3MenuWebhookAppWrapped) return app;
      app.__hardV3MenuWebhookAppWrapped = true;

      const oldPost = app.post.bind(app);
      app.post = function hardV3PostWrapper(path, ...handlers) {
        if (!isWebhookPath(path)) return oldPost(path, ...handlers);
        const guard = async function hardV3MenuWebhookGuard(req, res, next) {
          try {
            const result = await hardRoot.tryHandleExpress(req);
            if (result && result.handled) {
              return res.status(200).json({ ok: true, runtimeVersion: RUNTIME, hardRootRuntime: hardRoot.RUNTIME, route: result.route, sentKind: result.sentKind || '', menuHandled: true });
            }
          } catch (error) {
            console.error('[hard-v3-menu-webhook-router] failed:', error && error.message ? error.message : error, error && error.stack ? error.stack : '');
          }
          return next();
        };
        return oldPost(path, guard, ...handlers);
      };
      return app;
    }

    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__hardV3MenuWebhookWrapped = true;
    return wrappedExpress;
  };

  return selfTest(false);
}

function selfTest(already = false) {
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already, hardRoot: hardRoot.selfTest ? hardRoot.selfTest() : null, policy: 'intercept_webhook_posts_before_legacy_handlers_and_handle_only_hard_v3_routes' };
}

module.exports = { RUNTIME, MARKER, install, selfTest };
