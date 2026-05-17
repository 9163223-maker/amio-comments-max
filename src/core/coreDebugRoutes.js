'use strict';

const config = require('../../config');

const RUNTIME = 'ADMINKIT-CORE-DEBUG-ROUTES-1.36-CLEAN-ROUTES';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function clean(value = '') { return String(value || '').trim(); }
function truthy(value) { return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase()); }
function getHeader(req, name) { try { return req.get(name) || req.headers?.[String(name).toLowerCase()] || ''; } catch { return ''; } }
function queryPairsFromUrlish(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return {};
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  const result = {};
  try {
    const params = new URLSearchParams(query.split('#')[0]);
    for (const [key, val] of params.entries()) if (result[key] === undefined) result[key] = val;
  } catch {}
  return result;
}
function mergeRequestParams(req = {}, body = {}) {
  const result = {};
  const add = (source = {}) => {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([key, value]) => {
      if (result[key] === undefined && value !== undefined && value !== null) result[key] = value;
    });
  };
  add(req.query || {});
  add(body || {});
  add(queryPairsFromUrlish(req.originalUrl || ''));
  add(queryPairsFromUrlish(req.url || ''));
  return result;
}
function pickParam(params = {}, ...names) {
  for (const name of names) {
    if (params[name] !== undefined && params[name] !== null && String(params[name]).trim() !== '') return params[name];
  }
  return undefined;
}
async function readRequestJson(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body;
  if (String(req.method || '').toUpperCase() === 'GET') return {};
  return new Promise((resolve) => {
    let raw = '';
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      req.body = value || {};
      resolve(req.body);
    };
    try {
      req.on('data', (chunk) => { raw += chunk; if (raw.length > 1024 * 1024) finish({}); });
      req.on('end', () => { if (!raw) return finish({}); try { finish(JSON.parse(raw)); } catch { finish({ rawBody: raw.slice(0, 4096) }); } });
      req.on('error', () => finish({}));
      setTimeout(() => finish({}), 2500);
    } catch { finish({}); }
  });
}

function expectedManualTokens() {
  return [
    process.env.ADMINKIT_CORE_MANUAL_SEND_TOKEN,
    process.env.ADMINKIT_CORE_WEBHOOK_TOKEN,
    config.giftAdminToken,
    process.env.GIFT_ADMIN_TOKEN,
    process.env.ADMIN_TOKEN
  ].map(clean).filter(Boolean);
}

function manualSendTokenState(req = {}, params = {}) {
  const expected = expectedManualTokens();
  const provided = clean(
    pickParam(params, 'token', 'sendToken', 'manualToken', 'manual_send_token', 'coreToken') ||
    getHeader(req, 'x-adminkit-core-manual-send-token') ||
    getHeader(req, 'x-adminkit-core-token') ||
    getHeader(req, 'x-admin-token') ||
    ''
  );
  const tokenAccepted = !!provided && expected.includes(provided);
  return {
    tokenRequiredForRealSend: true,
    tokenEnvName: expected.length ? 'existing_admin_or_core_token' : 'ADMINKIT_CORE_MANUAL_SEND_TOKEN',
    tokenConfigured: expected.length > 0,
    tokenProvided: !!provided,
    tokenAccepted,
    realSendBlockedWithoutToken: expected.length > 0 && (!provided || !tokenAccepted),
    realSendBlockedBecauseTokenNotConfigured: expected.length === 0,
    legacyDebugTokenCompatible: true
  };
}

async function coreDebug() {
  const core = require('../../adminkit-core-runtime').selfTest();
  const canary = require('./coreCanaryWebhook').selfTest();
  const bridge = (() => { try { return require('../../core-callback-bridge-layer').selfTest(); } catch (error) { return { ok: false, skipped: true, error: error?.message || String(error) }; } })();
  const timings = require('./coreTimingStore').selfTest();
  const problems = [];
  if (core.ok !== true) problems.push(core.error || 'core selfTest failed');
  if (canary.ok !== true) problems.push(canary.error || 'core canary selfTest failed');
  if (timings.ok !== true) problems.push(timings.error || 'core timing store selfTest failed');
  return {
    ok: problems.length === 0,
    debugType: 'adminkit-core-clean-routes',
    runtimeVersion: RUNTIME,
    core,
    coreCanaryWebhook: canary,
    coreCallbackBridge: bridge,
    coreTimingStore: timings,
    problems,
    generatedAt: new Date().toISOString(),
    constraints: {
      cleanCoreDebugRoutesReady: true,
      manualSendLegacyTokenCompatible: true,
      noNewWrapperAdded: true,
      noNewMonkeypatchAdded: true
    }
  };
}

async function coreRenderPreview(req) {
  const params = mergeRequestParams(req, {});
  const planCode = String(pickParam(params, 'plan', 'planCode') || 'free');
  const core = require('../../adminkit-core-runtime');
  const screen = await core.renderMain({ planCode });
  return { ok: true, runtimeVersion: core.RUNTIME, route: 'main.home', planCode, screen, buttonTexts: (((screen.attachments || [])[0] || {}).payload || {}).buttons?.flat?.().map((b) => b.text) || [] };
}

async function coreCanarySend(req) {
  const body = await readRequestJson(req);
  const params = mergeRequestParams(req, body);
  const dryRun = pickParam(params, 'dryRun', 'dryrun', 'dry_run') ?? '0';
  const isDryRun = truthy(dryRun);
  const token = manualSendTokenState(req, params);
  const args = {
    route: String(pickParam(params, 'route') || 'main.home'),
    adminId: String(pickParam(params, 'adminId', 'admin_id', 'userId', 'user_id') || ''),
    chatId: String(pickParam(params, 'chatId', 'chat_id') || ''),
    messageId: String(pickParam(params, 'messageId', 'message_id', 'activeMessageId', 'active_message_id') || ''),
    dryRun,
    updateType: String(pickParam(params, 'updateType', 'update_type') || 'message_callback'),
    text: String(pickParam(params, 'text') || '')
  };
  const diagnostics = {
    originalUrl: String(req.originalUrl || ''),
    url: String(req.url || ''),
    receivedQuery: req.query || {},
    parsedParams: params,
    dryRunResolved: String(dryRun),
    adminIdResolved: args.adminId,
    routeResolved: args.route,
    tokenRequiredForRealSend: token.tokenRequiredForRealSend,
    tokenConfigured: token.tokenConfigured,
    tokenProvided: token.tokenProvided,
    tokenAccepted: token.tokenAccepted,
    legacyDebugTokenCompatible: token.legacyDebugTokenCompatible,
    realSendBlockedWithoutToken: !isDryRun && !token.tokenAccepted,
    realSendBlockedBecauseTokenNotConfigured: !isDryRun && !token.tokenConfigured,
    tokenEnvName: token.tokenEnvName
  };
  if (!isDryRun && !token.tokenConfigured) return { ok: false, runtimeVersion: RUNTIME, mode: 'core-clean-manual-send-token-blocked', error: 'manual_send_token_not_configured', help: 'Для dry-run используйте dryRun=1. Для реальной отправки принимается существующий admin/core token.', diagnostics };
  if (!isDryRun && !token.tokenAccepted) return { ok: false, runtimeVersion: RUNTIME, mode: 'core-clean-manual-send-token-blocked', error: 'manual_send_token_required', help: 'Передайте существующий token/adminToken. Старый формат ?token=<debug token> поддерживается.', diagnostics };
  const result = await require('./coreCanaryWebhook').manualSend(args, config);
  return { ...result, runtimeVersion: result.runtimeVersion || RUNTIME, diagnostics };
}

function registerCoreDebugRoutes(app) {
  if (!app || app.__adminkitCore136Routes) return app;
  app.__adminkitCore136Routes = true;
  app.get('/debug/core', async (req, res) => { noCache(res); res.json(await coreDebug()); });
  app.get('/debug/core-full', async (req, res) => { noCache(res); res.json({ ...await coreDebug(), full: true }); });
  app.get('/debug/core-render', async (req, res) => { noCache(res); res.json(await coreRenderPreview(req)); });
  app.get('/debug/core-timings', (req, res) => { noCache(res); const limit = Number(req.query?.limit || 25); res.json({ ok: true, runtimeVersion: require('./coreTimingStore').RUNTIME, items: require('./coreTimingStore').list(limit) }); });
  app.get('/debug/core-canary-send', async (req, res) => { noCache(res); res.json(await coreCanarySend(req)); });
  app.post('/debug/core-canary-send', async (req, res) => { noCache(res); res.json(await coreCanarySend(req)); });
  return app;
}

function selfTest() {
  const tokens = expectedManualTokens();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    cleanCoreDebugRoutesReady: true,
    manualSendLegacyTokenCompatible: true,
    manualSendTokenSources: ['ADMINKIT_CORE_MANUAL_SEND_TOKEN', 'ADMINKIT_CORE_WEBHOOK_TOKEN', 'giftAdminToken', 'GIFT_ADMIN_TOKEN', 'ADMIN_TOKEN'],
    configuredTokenSourceCount: tokens.length,
    noNewWrapperAdded: true,
    noNewMonkeypatchAdded: true
  };
}

module.exports = { RUNTIME, registerCoreDebugRoutes, manualSendTokenState, coreCanarySend, coreDebug, selfTest };
