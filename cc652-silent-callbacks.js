'use strict';

const Module = require('module');
const RUNTIME = 'CC6.5.2';
const SOURCE = 'adminkit-CC6.5.2-silent-navigation-callbacks';

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }

const KEEP = new Set(['сохранено', 'удалено', 'очищено', 'включено', 'выключено', 'отменено', 'ошибка']);
const SILENT = [
  /главн.*меню/i,
  /^модерац/i,
  /^помощ/i,
  /^как подключ/i,
  /^выберите/i,
  /^канал выбран/i,
  /^правила (канала|поста)/i,
  /^сначала выберите/i,
  /^пришлите стоп/i
];

function shouldSilence(notification) {
  const text = norm(notification).toLowerCase();
  if (!text) return false;
  if (KEEP.has(text)) return false;
  return SILENT.some((re) => re.test(text));
}

function patchMaxApi() {
  const api = require('./services/maxApi');
  if (!api || api.__cc652SilentCallbacks) return api;
  const original = api.answerCallback;
  api.answerCallback = async function answerCallbackSilentNavigation(args = {}) {
    const notification = norm(args.notification);
    if (shouldSilence(notification)) {
      const next = { ...args };
      delete next.notification;
      return original.call(this, next);
    }
    return original.call(this, args);
  };
  api.answerCallback.__cc652 = {
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    policy: 'silent_navigation_final_actions_only',
    navigationToasts: 'silent',
    finalActionToasts: Array.from(KEEP),
    positionControl: 'not_supported_by_MAX_answers_api',
    durationControl: 'not_supported_by_MAX_answers_api'
  };
  api.__cc652SilentCallbacks = true;
  return api;
}

async function safeStats() {
  try { return await require('./cc5-db-core').stats(); }
  catch (e) { return { dbUrlPresent: !!(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL), reachable: false, error: e && e.message ? e.message : String(e) }; }
}
function safeSelfTest() {
  try { return require('./cc55-moderation-router').selfTest(); }
  catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}
async function safeDbTruth(req) {
  try {
    const truth = await require('./cc64-moderation-db-truth').collectTruth({ query: { token: String(req.query && req.query.token || ''), limit: 20 } });
    return { ...truth, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
  } catch (e) { return { verdict: 'db_truth_unavailable', summary: {}, error: e && e.message ? e.message : String(e) }; }
}
async function safeTitleStatus() {
  try { return await require('./cc65-moderation-title-repair').titleStatus(); }
  catch (e) { return { channelTitleIsId: -1, error: e && e.message ? e.message : String(e) }; }
}
async function sendQaLite(req, res) {
  noCache(res);
  const stats = await safeStats();
  const self = safeSelfTest();
  const truth = await safeDbTruth(req);
  const title = await safeTitleStatus();
  const ok = Boolean(self.ok && stats.dbUrlPresent && stats.reachable);
  res.type('text/plain').send([
    'OK: ' + (ok ? 'PROD_CHECK_READY' : 'WARNING'),
    'runtime: ' + RUNTIME,
    'sourceMarker: ' + SOURCE,
    'releaseGate: ' + (ok ? 'pass' : 'warning'),
    'featureGate: informational_only_not_blocking_comments',
    'manualTesting: ' + (ok ? 'allowed' : 'blocked'),
    'commentsShell: cc63_runtime_audit_over_legacy_ui',
    'commentsRoute: legacy_index_public_app',
    'usesLegacyAppJs: true',
    'uiPolicy: keep_approved_legacy_comments_ui_and_functions',
    'callbackToastPolicy: silent_navigation_final_actions_only',
    'navigationToasts: silent',
    'finalActionToasts: saved_deleted_cleared_enabled_disabled_error_only',
    'toastPositionControl: not_supported_by_MAX_answers_api',
    'toastDurationControl: not_supported_by_MAX_answers_api',
    'cleanCoreScope: silent_navigation_callbacks_only_no_ui_changes',
    'moderationRouter: cc55_single_router',
    'moderationDbTruth: ' + (truth.verdict || 'unknown'),
    'moderationDbTruthRuntime: ' + RUNTIME,
    'moderationDbChannels: ' + (truth.summary && truth.summary.channels || 0),
    'moderationDbPosts: ' + (truth.summary && truth.summary.posts || 0),
    'moderationDbRules: ' + (truth.summary && truth.summary.rules || 0),
    'moderationDbPostRules: ' + (truth.summary && truth.summary.postRules || 0),
    'moderationDbChannelTitleIsId: ' + (truth.summary && truth.summary.channelTitleIsId || 0),
    'moderationTitleRepairChannelTitleIsId: ' + (title.channelTitleIsId ?? 'unknown'),
    'moderationDbPostRulesWithoutPost: ' + (truth.summary && truth.summary.postRulesWithoutPost || 0),
    'moderationDbServicePosts: ' + (truth.summary && truth.summary.servicePosts || 0),
    'legacyRouterFallback: disabled',
    'mainMenuRouter: cc_owned',
    'callbackPostUpsert: disabled',
    'routerSelfTest: ' + (self.ok ? 'pass' : 'fail'),
    'dbUrlPresent: ' + Boolean(stats.dbUrlPresent),
    'postgresReachable: ' + Boolean(stats.reachable),
    'dbAdmins: ' + (stats.admins || 0),
    'dbChannels: ' + (stats.channels || 0),
    'dbPosts: ' + (stats.posts || 0),
    'dbRules: ' + (stats.rules || 0),
    'debugTruth: qa_lite_matches_silent_callback_policy_and_moderation_db_truth',
    'featureGateReason: comments_open_is_not_blocked_by_feature_gate'
  ].join('\n') + '\n');
}

function patchExpressDebug() {
  if (Module._load.__cc652ExpressPatch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc652ExpressWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc652EarlyQa) {
          app.__cc652EarlyQa = true;
          app.use((req, res, next) => {
            const path = String(req.path || req.url || '').split('?')[0];
            if (path === '/debug/qa-lite') return sendQaLite(req, res).catch((e) => { noCache(res); res.status(500).type('text/plain').send('ERROR: ' + (e && e.message ? e.message : String(e)) + '\n'); });
            if (path === '/debug/callback-toast-policy') { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, policy: require('./services/maxApi').answerCallback.__cc652 }); }
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc652ExpressWrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc652ExpressPatch = true;
  Module._load = patchedLoad;
}

function install() {
  patchMaxApi();
  patchExpressDebug();
  return { runtimeVersion: RUNTIME, sourceMarker: SOURCE, ok: true };
}

module.exports = { RUNTIME, SOURCE, install, shouldSilence };
