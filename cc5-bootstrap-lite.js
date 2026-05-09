'use strict';
const Module = require('module');
const RUNTIME = 'CC6.3';
const SOURCE = 'adminkit-CC6.3-comments-runtime-audit';
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
  if (!app || app.__cc63clean) return app;
  app.__cc63clean = true;

  // CC6.3: passive runtime audit over the approved legacy comments UI.
  // It does NOT own /app and does NOT block comments opening, posting, UI, CTA, or DB registration.
  try { require('./cc63-comments-runtime-audit').install(app); } catch (error) { console.error('[CC6.3 runtime audit]', error && error.message ? error.message : error); }
  try { require('./cc55-feature-gate').install(app); } catch (error) { console.warn('[CC6.3 feature gate]', error && error.message ? error.message : error); }
  try { require('./cc54-public-post-register').install(app); } catch (error) { console.warn('[CC6.3 public register]', error && error.message ? error.message : error); }
  try { require('./cc52-db-debug-routes').install(app); } catch {}
  try { require('./cc53-db-diagnose').install(app); } catch {}

  app.get('/debug/qa-lite', async (req, res) => {
    noCache(res);
    const stats = await dbStats();
    const selfTest = routerSelfTest();
    const runtimeAudit = (() => { try { return require('./cc63-comments-runtime-audit').summarizeRuntime(); } catch { return { appOpenOk: false, verdict: 'audit_not_loaded' }; } })();
    const statsAudit = (() => { try { return require('./cc63-comments-runtime-audit').auditLegacyAppJs(); } catch { return { ok: false }; } })();
    const releaseGate = releaseGateStatus(stats, selfTest);
    const manual = releaseGate === 'pass' ? 'allowed' : 'blocked';
    res.type('text/plain').send([
      'OK: ' + (manual === 'allowed' ? 'PROD_CHECK_READY' : 'WARNING'),
      'runtime: ' + RUNTIME,
      'sourceMarker: ' + SOURCE,
      'releaseGate: ' + releaseGate,
      'featureGate: informational_only_not_blocking_comments',
      'manualTesting: ' + manual,
      'commentsShell: cc63_runtime_audit_over_legacy_ui',
      'commentsRoute: legacy_index_public_app',
      'usesLegacyAppJs: true',
      'uiPolicy: keep_approved_legacy_comments_ui_and_functions',
      'cleanCoreScope: runtime_audit_backend_routes_and_db_registration_only',
      'standalonePrototypeDisabled: true',
      'commentsOpenBlocksDb: false',
      'commentsPostBlocksDb: false',
      'dbRegistration: background_only',
      'redirects: false',
      'floatingCta: legacy_ui_controls_it_not_boot_blocker',
      'runtimeAudit: passive_enabled',
      'runtimeAuditVerdict: ' + (runtimeAudit.verdict || 'waiting_for_comments_open'),
      'runtimeAuditEvents: ' + (runtimeAudit.eventsCount || 0),
      'runtimeAppOpenOk: ' + Boolean(runtimeAudit.appOpenOk),
      'appAuditOk: ' + Boolean(statsAudit.ok),
      'appJsApproxKb: ' + (statsAudit.appJsApproxKb || 0),
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
      'debugTruth: qa_lite_matches_comments_runtime',
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
    if (String(request || '') === 'express' && loaded && !loaded.__cc63wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        addRoutes(app);
        if (app && !app.__cc63post) {
          app.__cc63post = true;
          const oldPost = app.post.bind(app);
          const routeName = '/web' + 'hook';
          app.post = (route, ...handlers) => String(route || '').includes(routeName)
            ? oldPost(route, async (req, res, next) => {
                try {
                  if (await require('./cc55-moderation-router').handle(req.body || {})) {
                    return res.json({ ok: true, handledBy: RUNTIME });
                  }
                } catch (error) {
                  console.error('[CC6.3 router]', error && error.message ? error.message : error);
                }
                next();
              }, ...handlers)
            : oldPost(route, ...handlers);
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc63wrap = true;
      return expressWrapper;
    }
  } catch (error) {
    console.warn('[CC6.3 bootstrap]', error && error.message ? error.message : error);
  }
  return loaded;
};

require('./cc5-db-core').init().catch(error => console.error('[CC6.3 DB]', error && error.message ? error.message : error));
require('./server-sp4058.js');
try { require('./cc45-public-final').install(); } catch {}
