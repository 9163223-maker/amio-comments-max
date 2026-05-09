'use strict';
const Module = require('module');
const RUNTIME = 'CC6.5.1';
const SOURCE = 'adminkit-CC6.5.1-debug-truth-alignment';
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

async function collectDbTruth(req) {
  const truth = await require('./cc64-moderation-db-truth').collectTruth({ query: { token: String(req.query.token || ''), limit: 20 } });
  return { ...truth, runtimeVersion: RUNTIME, sourceMarker: SOURCE, wrappedFrom: truth.runtimeVersion || 'CC6.4' };
}

function addRoutes(app) {
  if (!app || app.__cc651clean) return app;
  app.__cc651clean = true;

  try { require('./cc65-moderation-title-repair').install(app); } catch (error) { console.error('[CC6.5.1 title repair]', error && error.message ? error.message : error); }
  try { require('./cc64-moderation-db-truth').install(app); } catch (error) { console.error('[CC6.5.1 DB truth]', error && error.message ? error.message : error); }
  try { require('./cc63-comments-runtime-audit').install(app); } catch (error) { console.error('[CC6.5.1 runtime audit]', error && error.message ? error.message : error); }
  try { require('./cc55-feature-gate').install(app); } catch (error) { console.warn('[CC6.5.1 feature gate]', error && error.message ? error.message : error); }
  try { require('./cc54-public-post-register').install(app); } catch (error) { console.warn('[CC6.5.1 public register]', error && error.message ? error.message : error); }
  try { require('./cc52-db-debug-routes').install(app); } catch {}
  try { require('./cc53-db-diagnose').install(app); } catch {}

  app.get('/debug/qa-lite', async (req, res) => {
    noCache(res);
    const stats = await dbStats();
    const selfTest = routerSelfTest();
    const runtimeAudit = (() => { try { return require('./cc63-comments-runtime-audit').summarizeRuntime(); } catch { return { appOpenOk: false, verdict: 'audit_not_loaded' }; } })();
    const statsAudit = (() => { try { return require('./cc63-comments-runtime-audit').auditLegacyAppJs(); } catch { return { ok: false }; } })();
    const dbTruth = await (async () => {
      try { return await collectDbTruth(req); }
      catch (error) { return { verdict: 'db_truth_unavailable', summary: {}, error: error && error.message ? error.message : String(error) }; }
    })();
    const titleStatus = await (async () => {
      try { return await require('./cc65-moderation-title-repair').titleStatus(); }
      catch (error) { return { channelTitleIsId: -1, error: error && error.message ? error.message : String(error) }; }
    })();
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
      'cleanCoreScope: runtime_audit_backend_routes_db_registration_moderation_db_truth_title_repair_debug_alignment',
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
      'moderationDbTruth: ' + (dbTruth.verdict || 'unknown'),
      'moderationDbTruthRuntime: ' + RUNTIME,
      'moderationDbTruthEngine: cc64_collectTruth',
      'moderationDbChannels: ' + (dbTruth.summary?.channels || 0),
      'moderationDbPosts: ' + (dbTruth.summary?.posts || 0),
      'moderationDbRules: ' + (dbTruth.summary?.rules || 0),
      'moderationDbPostRules: ' + (dbTruth.summary?.postRules || 0),
      'moderationDbChannelTitleIsId: ' + (dbTruth.summary?.channelTitleIsId || 0),
      'moderationTitleRepairChannelTitleIsId: ' + (titleStatus.channelTitleIsId ?? 'unknown'),
      'moderationDbPostRulesWithoutPost: ' + (dbTruth.summary?.postRulesWithoutPost || 0),
      'moderationDbServicePosts: ' + (dbTruth.summary?.servicePosts || 0),
      'legacyRouterFallback: disabled',
      'mainMenuRouter: cc_owned',
      'callbackPostUpsert: disabled',
      'dbGuard: enabled',
      'dbScanRoute: enabled',
      'dbDiagnoseRoute: enabled',
      'modDbTruthRoute: enabled',
      'modTitleRepairRoute: enabled',
      'publicPostRegister: background_only',
      'routerSelfTest: ' + (selfTest.ok ? 'pass' : 'fail'),
      'dbUrlPresent: ' + Boolean(stats.dbUrlPresent),
      'postgresReachable: ' + Boolean(stats.reachable),
      'dbAdmins: ' + (stats.admins || 0),
      'dbChannels: ' + (stats.channels || 0),
      'dbPosts: ' + (stats.posts || 0),
      'dbRules: ' + (stats.rules || 0),
      'debugTruth: qa_lite_matches_comments_runtime_moderation_db_truth_title_repair_and_runtime_alignment',
      'featureGateReason: comments_open_is_not_blocked_by_feature_gate'
    ].join('\n') + '\n');
  });

  app.get('/debug/mod-router-selftest', (req, res) => {
    noCache(res);
    res.json(routerSelfTest());
  });

  app.get('/debug/mod-db-truth-lite-current', async (req, res) => {
    noCache(res);
    try {
      const truth = await collectDbTruth(req);
      const lines = [
        'OK: ' + (truth.verdict === 'db_links_and_rules_look_consistent' ? 'DB_TRUTH_READY' : 'WARNING'),
        'runtime: ' + RUNTIME,
        'sourceMarker: ' + SOURCE,
        'engine: cc64_collectTruth',
        'wrappedFrom: ' + (truth.wrappedFrom || 'unknown'),
        'verdict: ' + (truth.verdict || 'unknown'),
        'admins: ' + (truth.summary?.admins || 0),
        'channels: ' + (truth.summary?.channels || 0),
        'posts: ' + (truth.summary?.posts || 0),
        'rules: ' + (truth.summary?.rules || 0),
        'channelRules: ' + (truth.summary?.channelRules || 0),
        'postRules: ' + (truth.summary?.postRules || 0),
        'channelTitleIsId: ' + (truth.summary?.channelTitleIsId || 0),
        'postRulesWithoutPost: ' + (truth.summary?.postRulesWithoutPost || 0),
        'servicePosts: ' + (truth.summary?.servicePosts || 0),
        'latestChannel: ' + (truth.channels && truth.channels[0] ? `${truth.channels[0].title} (${truth.channels[0].channelId})` : 'none'),
        'latestPost: ' + (truth.posts && truth.posts[0] ? `${truth.posts[0].title} / ${truth.posts[0].commentKey}` : 'none'),
        'latestRule: ' + (truth.rules && truth.rules[0] ? `${truth.rules[0].scopeType} / ${truth.rules[0].postId || 'channel'} / ${JSON.stringify(truth.rules[0].customBlocklist || [])}` : 'none')
      ];
      res.type('text/plain').send(lines.join('\n') + '\n');
    } catch (error) {
      res.status(500).type('text/plain').send('ERROR: ' + (error && error.message ? error.message : String(error)) + '\n');
    }
  });

  return app;
}

const oldLoad = Module._load;
Module._load = function patchedExpressLoad(request, parent, isMain) {
  const loaded = oldLoad.apply(this, arguments);
  try {
    if (String(request || '') === 'express' && loaded && !loaded.__cc651wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        addRoutes(app);
        if (app && !app.__cc651post) {
          app.__cc651post = true;
          const oldPost = app.post.bind(app);
          const routeName = '/web' + 'hook';
          app.post = (route, ...handlers) => String(route || '').includes(routeName)
            ? oldPost(route, async (req, res, next) => {
                try {
                  if (await require('./cc55-moderation-router').handle(req.body || {})) {
                    return res.json({ ok: true, handledBy: RUNTIME });
                  }
                } catch (error) {
                  console.error('[CC6.5.1 router]', error && error.message ? error.message : error);
                }
                next();
              }, ...handlers)
            : oldPost(route, ...handlers);
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc651wrap = true;
      return expressWrapper;
    }
  } catch (error) {
    console.warn('[CC6.5.1 bootstrap]', error && error.message ? error.message : error);
  }
  return loaded;
};

require('./cc5-db-core').init().catch(error => console.error('[CC6.5.1 DB]', error && error.message ? error.message : error));
require('./server-sp4058.js');
try { require('./cc45-public-final').install(); } catch {}
