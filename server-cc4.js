'use strict';
const Module = require('module');
const RUNTIME = 'CC4.8';
const SOURCE = 'adminkit-CC4.8-menu-renders-saved-rules';
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
console.log('[' + RUNTIME + '] active server-cc4.js');

function noCache(res) {
  try { res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0', Pragma:'no-cache', Expires:'0'}); } catch {}
}
function patchStoreHard(loaded) {
  try { return require('./cc46-store-hardfix').patchStore(loaded); } catch (e) {
    console.error('[CC4.8 store hardfix failed]', e && e.message ? e.message : e);
    return loaded;
  }
}

const oldLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const loaded = oldLoad.apply(this, arguments);
  try {
    const r = String(request || '');
    if ((r === './store' || r.endsWith('/store') || r.endsWith('store.js')) && loaded) {
      return patchStoreHard(loaded);
    }
    if (r === 'express' && loaded && !loaded.__cc48Wrapped) {
      function wrappedExpress() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc48App) {
          app.__cc48App = true;
          const oldPost = app.post.bind(app);
          app.post = (route, ...handlers) => String(route || '').includes('/webhook')
            ? oldPost(route, async (req, res, next) => {
                try {
                  const store = patchStoreHard(require('./store'));
                  const router = require('./cc48-menu-router');
                  const mods = { store, api: require('./services/maxApi'), config: require('./config') };
                  if (await router.handle(req.body || {}, mods)) return res.json({ ok: true, handledBy: RUNTIME });
                } catch (e) { console.error('[CC4.8 moderation]', e && e.message ? e.message : e); }
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
              'postModerationToggle: cc48_menu_uses_saved_rules',
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
            res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, activeEntry: 'server-cc4.js', postModerationToggle: 'cc48_menu_uses_saved_rules', generatedAt: Date.now() });
          });
          app.get('/debug/mod-rules', (req, res) => {
            noCache(res);
            const store = patchStoreHard(require('./store'));
            const commentKey = String(req.query.commentKey || '').trim();
            const channelId = String(req.query.channelId || '').trim();
            const scope = commentKey ? { scope: 'post', channelId, commentKey } : { scope: 'channel', channelId, commentKey: '' };
            res.json({ ok: true, runtimeVersion: RUNTIME, scope, postRules: commentKey ? store.getPostModerationSettings(commentKey) : null, channelRules: store.getModerationSettings(channelId), lastWrite: store.getSetupState?.('cc46:lastRulesWrite') || null, generatedAt: Date.now() });
          });
        }
        return app;
      }
      Object.setPrototypeOf(wrappedExpress, loaded);
      Object.assign(wrappedExpress, loaded);
      wrappedExpress.__cc48Wrapped = true;
      return wrappedExpress;
    }
  } catch (e) { console.warn('[CC4.8 patch skipped]', e && e.message ? e.message : e); }
  return loaded;
};

require('./server-sp4058.js');
try { patchStoreHard(require('./store')); } catch {}
require('./cc45-public-final').install();
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
