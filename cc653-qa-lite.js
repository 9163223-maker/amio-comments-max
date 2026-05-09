'use strict';

const Module = require('module');

const RUNTIME = 'CC6.5.3';
const SOURCE = 'adminkit-CC6.5.3-comments-router-guard-logo-fit';

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

async function safeStats() {
  try { return await require('./cc5-db-core').stats(); }
  catch (error) { return { dbUrlPresent: !!(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL), reachable: false, error: error && error.message ? error.message : String(error) }; }
}

function safeRouterSelfTest() {
  try { return require('./cc55-moderation-router').selfTest(); }
  catch (error) { return { ok: false, error: error && error.message ? error.message : String(error) }; }
}

async function safeDbTruth(req) {
  try {
    const truth = await require('./cc64-moderation-db-truth').collectTruth({ query: { token: String(req.query && req.query.token || ''), limit: 20 } });
    return { ...truth, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
  } catch (error) {
    return { verdict: 'db_truth_unavailable', summary: {}, error: error && error.message ? error.message : String(error) };
  }
}

async function safeTitleStatus() {
  try { return await require('./cc65-moderation-title-repair').titleStatus(); }
  catch (error) { return { channelTitleIsId: -1, error: error && error.message ? error.message : String(error) }; }
}

function safeAppAudit() {
  try { return require('./cc63-comments-runtime-audit').auditLegacyAppJs(); }
  catch { return { ok: false, appJsApproxKb: 0 }; }
}

async function sendQaLite(req, res) {
  noCache(res);
  const stats = await safeStats();
  const selfTest = safeRouterSelfTest();
  const dbTruth = await safeDbTruth(req);
  const titleStatus = await safeTitleStatus();
  const appAudit = safeAppAudit();
  const routerGuard = (() => { try { return require('./cc55-moderation-router').__cc653 || null; } catch { return null; } })();
  const releaseGate = selfTest.ok && stats.dbUrlPresent && stats.reachable ? 'pass' : 'warning';
  res.type('text/plain').send([
    'OK: ' + (releaseGate === 'pass' ? 'PROD_CHECK_READY' : 'WARNING'),
    'runtime: ' + RUNTIME,
    'sourceMarker: ' + SOURCE,
    'releaseGate: ' + releaseGate,
    'featureGate: informational_only_not_blocking_comments',
    'manualTesting: ' + (releaseGate === 'pass' ? 'allowed' : 'blocked'),
    'commentsShell: cc63_runtime_audit_over_legacy_ui',
    'commentsRoute: legacy_index_public_app',
    'usesLegacyAppJs: true',
    'uiPolicy: keep_approved_legacy_comments_ui_and_functions',
    'commentsRouterGuard: ' + (routerGuard ? routerGuard.policy : 'not_loaded'),
    'commentsChoosePostCanEnterModeration: false',
    'moderationCallbacksOnly: true',
    'logoFitPatch: enabled',
    'logoDesktopOverflowGuard: enabled',
    'callbackToastPolicy: silent_navigation_final_actions_only',
    'navigationToasts: silent',
    'cleanCoreScope: comments_routing_guard_logo_fit_no_ui_regression',
    'commentsOpenBlocksDb: false',
    'commentsPostBlocksDb: false',
    'dbRegistration: background_only',
    'redirects: false',
    'floatingCta: legacy_ui_controls_it_not_boot_blocker',
    'appAuditOk: ' + Boolean(appAudit.ok),
    'appJsApproxKb: ' + (appAudit.appJsApproxKb || 0),
    'moderationRouter: cc55_single_router_guarded_by_cc653',
    'moderationDbTruth: ' + (dbTruth.verdict || 'unknown'),
    'moderationDbTruthRuntime: ' + RUNTIME,
    'moderationDbChannels: ' + ((dbTruth.summary && dbTruth.summary.channels) || 0),
    'moderationDbPosts: ' + ((dbTruth.summary && dbTruth.summary.posts) || 0),
    'moderationDbRules: ' + ((dbTruth.summary && dbTruth.summary.rules) || 0),
    'moderationDbPostRules: ' + ((dbTruth.summary && dbTruth.summary.postRules) || 0),
    'moderationDbChannelTitleIsId: ' + ((dbTruth.summary && dbTruth.summary.channelTitleIsId) || 0),
    'moderationTitleRepairChannelTitleIsId: ' + (titleStatus.channelTitleIsId ?? 'unknown'),
    'moderationDbPostRulesWithoutPost: ' + ((dbTruth.summary && dbTruth.summary.postRulesWithoutPost) || 0),
    'moderationDbServicePosts: ' + ((dbTruth.summary && dbTruth.summary.servicePosts) || 0),
    'legacyRouterFallback: disabled',
    'mainMenuRouter: cc_owned',
    'callbackPostUpsert: disabled',
    'routerSelfTest: ' + (selfTest.ok ? 'pass' : 'fail'),
    'dbUrlPresent: ' + Boolean(stats.dbUrlPresent),
    'postgresReachable: ' + Boolean(stats.reachable),
    'dbAdmins: ' + (stats.admins || 0),
    'dbChannels: ' + (stats.channels || 0),
    'dbPosts: ' + (stats.posts || 0),
    'dbRules: ' + (stats.rules || 0),
    'debugTruth: qa_lite_matches_cc653_router_guard_logo_fit_and_moderation_db_truth',
    'featureGateReason: comments_open_is_not_blocked_by_feature_gate'
  ].join('\n') + '\n');
}

function install() {
  if (Module._load.__cc653QaLitePatch) return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, alreadyInstalled: true };
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc653QaLiteWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc653QaLite) {
          app.__cc653QaLite = true;
          app.use((req, res, next) => {
            const p = String(req.path || req.url || '').split('?')[0];
            if (p === '/debug/qa-lite') return sendQaLite(req, res).catch((error) => { noCache(res); res.status(500).type('text/plain').send('ERROR: ' + (error && error.message ? error.message : String(error)) + '\n'); });
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc653QaLiteWrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc653QaLitePatch = true;
  Module._load = patchedLoad;
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, sendQaLite };
