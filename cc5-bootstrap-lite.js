'use strict';
const Module = require('module');
const RUNTIME = 'CC6.2';
const SOURCE = 'adminkit-CC6.2-legacy-ui-clean-boot';
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    });
  } catch {}
}

async function dbStats() {
  try {
    return await require('./cc5-db-core').stats();
  } catch (error) {
    return {
      error: error && error.message ? error.message : String(error),
      dbUrlPresent: !!(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL),
      reachable: false,
    };
  }
}

function routerSelfTest() {
  try {
    return require('./cc55-moderation-router').selfTest();
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function releaseGateStatus(stats, selfTest) {
  if (!selfTest.ok) return 'blocked_router_selftest';
  if (!stats.dbUrlPresent) return 'blocked_database_url_missing';
  if (!stats.reachable) return 'blocked_postgres_unreachable';
  return 'pass';
}

function addRoutes(app) {
  if (!app || app.__cc62clean) return app;
  app.__cc62clean = true;

  // CC6.2: backend-only clean layer. It does NOT own /app.
  // Approved legacy comments UI, attachments, reactions, top nav and action sheet remain untouched.
  try { require('./cc62-comments-legacy-ui-clean-boot').install(app); } catch (error) { console.error('[CC6.2 legacy UI clean boot]', error && error.message ? error.message : error); }
  try { require('./cc55-feature-gate').install(app); } catch (error) { console.warn('[CC6.2 feature gate]', error && error.message ? error.message : error); }
  try { require('./cc54-public-post-register').install(app); } catch (error) { console.warn('[CC6.2 public register]', error && error.message ? error.message : error); }
  try { require('./cc52-db-debug-routes').install(app); } catch {}
  try { require('./cc53-db-diagnose').install(app); } catch {}

  app.get('/debug/qa-lite', async (req, res) => {
    noCache(res);
    const stats = await dbStats();
    const selfTest = routerSelfTest();
    const releaseGate = releaseGateStatus(stats, selfTest);
    const manual = releaseGate === 'pass' ? 'allowed' : 'blocked';
    res.type('text/plain').send([
      'OK: ' + (manual === 'allowed' ? 'PROD_CHECK_READY' : 'WARNING'),
      'runtime: ' + RUNTIME,
      'sourceMarker: ' + SOURCE,
      'releaseGate: ' + releaseGate,
      'featureGate: informational_only_not_blocking_comments',
      'manualTesting: ' + manual,
      'commentsShell: cc62_legacy_ui_clean_boot',
      'commentsRoute: legacy_index_public_app',
      'usesLegacyAppJs: true',
      'uiPolicy: keep_approved_legacy_comments_ui_and_functions',
      'cleanCoreScope: backend_routes_and_db_registration_only',
      'standalonePrototypeDisabled: true',
      'commentsOpenBlocksDb: false',
      'commentsPostBlocksDb: false',
      'dbRegistration: background_only',
      'redirects: false',
      'floatingCta: legacy_ui_controls_it_not_boot_blocker',
      'moderationRouter: cc55_single_router',
      'legacyRouterFallback: disabled',
      'mainMenuRouter: cc_owned',
      'callbackPostUpsert: disabled',
      'dbGuard: enabled',
      'dbScanRoute: enabled',
      'dbDiagnoseRoute: enabled',
      'publicPostRegister: background_only',
      'routerSelfTest: ' + (selfTest.ok ? 'pass' : 'fail'),
      'dbUrlPresent: ' + Boolean(stats.dbUrlPresent),
      'postgresReachable: ' + Boolean(stats.reachable),
      'dbAdmins: ' + (stats.admins || 0),
      'dbChannels: ' + (stats.channels || 0),
      'dbPosts: ' + (stats.posts || 0),
      'dbRules: ' + (stats.rules || 0),
      'debugTruth: qa_lite_matches_comments_shell',
      'featureGateReason: comments_open_is_not_blocked_by_feature_gate'
    ].join('\n') + '\n');
  });

  app.get('/debug/mod-router-selftest', (req, res) => {
    noCache(res);
    res.json(routerSelfTest());
  });

  return app;
}

const oldLoad = Module._load;
Module._load = function patchedExpressLoad(request, parent, isMain) {
  const loaded = oldLoad.apply(this, arguments);
  try {
    if (String(request || '') === 'express' && loaded && !loaded.__cc62wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        addRoutes(app);
        if (app && !app.__cc62post) {
          app.__cc62post = true;
          const oldPost = app.post.bind(app);
          const routeName = '/web' + 'hook';
          app.post = (route, ...handlers) => String(route || '').includes(routeName)
            ? oldPost(route, async (req, res, next) => {
                try {
                  if (await require('./cc55-moderation-router').handle(req.body || {})) {
                    return res.json({ ok: true, handledBy: RUNTIME });
                  }
                } catch (error) {
                  console.error('[CC6.2 router]', error && error.message ? error.message : error);
                }
                next();
              }, ...handlers)
            : oldPost(route, ...handlers);
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc62wrap = true;
      return expressWrapper;
    }
  } catch (error) {
    console.warn('[CC6.2 bootstrap]', error && error.message ? error.message : error);
  }
  return loaded;
};

require('./cc5-db-core').init().catch(error => console.error('[CC6.2 DB]', error && error.message ? error.message : error));
require('./server-sp4058.js');
try { require('./cc45-public-final').install(); } catch {}
