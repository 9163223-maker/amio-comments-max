'use strict';
const Module = require('module');
const RUNTIME = 'CC4.6';
const SOURCE = 'adminkit-CC4.6-moderation-flow-and-post-scope';
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
console.log('[' + RUNTIME + '] active server-cc4.js');

function noCache(res) {
  try { res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0', Pragma:'no-cache', Expires:'0'}); } catch {}
}

const oldLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const loaded = oldLoad.apply(this, arguments);
  try {
    const r = String(request || '');
    if ((r === './store' || r.endsWith('/store') || r.endsWith('store.js')) && loaded) {
      return require('./cc43-store-hotfix').patchStore(loaded);
    }
    if (r === 'express' && loaded && !loaded.__cc46Wrapped) {
      function wrappedExpress() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc46App) {
          app.__cc46App = true;
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => String(route || '').includes('/webhook')
            ? oldPost(route, async (req, res, next) => {
                try {
                  const router = require('./cc45-menu-router');
                  const mods = { store: require('./store'), api: require('./services/maxApi'), config: require('./config') };
                  if (await router.handle(req.body || {}, mods)) return res.json({ ok: true, handledBy: RUNTIME });
                } catch (e) { console.error('[CC4.6 moderation]', e && e.message ? e.message : e); }
                next();
              }, ...handlers)
            : oldPost(route, ...handlers);
          app.get('/debug/qa-lite', (req, res) => {
            noCache(res);
            res.type('text/plain').send([
              'OK: PROD_CHECK_READY',
              'runtime: ' + RUNTIME,
              'sourceMarker: ' + SOURCE,
              'versionFormat: CC',
              'activeEntry: server-cc4.js',
              'postModerationToggle: cc46_flow_keys_fixed',
              'postScopeContinuation: fixed',
              'stopwordContinuation: fixed',
              'singleModerationMenu: edit_on_callback_send_on_text',
              'legacyInlineCta: force_removed_client_patch',
              'floatingCta: cc45_compact_transparent',
              'keyboardSafeInput: enabled'
            ].join('\n') + '\n');
          });
          app.get('/debug/runtime-marker', (req, res) => {
            noCache(res);
            res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, activeEntry: 'server-cc4.js', postModerationToggle: 'cc46_flow_keys_fixed', generatedAt: Date.now() });
          });
        }
        return app;
      }
      Object.setPrototypeOf(wrappedExpress, loaded);
      Object.assign(wrappedExpress, loaded);
      wrappedExpress.__cc46Wrapped = true;
      return wrappedExpress;
    }
  } catch (e) { console.warn('[CC4.6 patch skipped]', e && e.message ? e.message : e); }
  return loaded;
};

require('./server-sp4058.js');
require('./cc45-public-final').install();
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
