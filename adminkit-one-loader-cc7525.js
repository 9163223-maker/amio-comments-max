'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.5.25-LEAD-WORDING-PRELOAD-PATCH';
const SOURCE = 'adminkit-cc7-5-25-lead-wording-preload-patch';
const MARKER = '__ADMINKIT_CC7_5_25_LEAD_WORDING_PRELOAD_PATCH_LOADER__';
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (process.env.ADMINKIT_USE_OPEN_APP_BUTTON === undefined) process.env.ADMINKIT_USE_OPEN_APP_BUTTON = '1';

let installedAt = '';
const loadedLayers = [];
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function readBuildInfo() { try { return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'build-info.json'), 'utf8')); } catch { return null; } }
function fileInfo(relPath, marker) { try { const file = path.resolve(__dirname, relPath); const stat = fs.statSync(file); const text = fs.readFileSync(file, 'utf8').slice(0, 5000); return { exists: true, bytes: stat.size, markerFound: marker ? text.includes(marker) : true }; } catch (error) { return { exists: false, bytes: 0, markerFound: false, error: error?.message || String(error) }; } }
function loadLayer(pathName) { const item = { path: pathName, ok: false, at: new Date().toISOString(), error: '' }; try { const mod = require(pathName); const result = mod && typeof mod.install === 'function' ? mod.install() : null; item.ok = result?.ok !== false; item.runtimeVersion = result?.runtimeVersion || mod?.RUNTIME || ''; item.marker = result?.marker || mod?.MARKER || ''; item.result = result || null; } catch (error) { item.error = error?.message || String(error); console.warn('[cc7.5.25] layer failed:', pathName, item.error); } loadedLayers.push(item); return item; }
function safe(name, fn) { try { return fn(); } catch (e) { return { ok: false, error: e?.message || String(e), name }; } }
function adminFlowInfo() { return safe('adminFlow', () => require('./adminkit-admin-flows-7525').selfTest()); }
function postPatcherInfo() { return safe('postPatcher', () => require('./db-v3-post-patcher').selfTest()); }
function commentRouteInfo() { return safe('commentOpenStateRoute', () => require('./routes/commentOpenState').selfTest()); }
function coreRuntimeInfo() { return safe('adminkitCore', () => require('./adminkit-core-runtime').selfTest()); }
function coreCanaryInfo() { return safe('coreCanaryWebhook', () => require('./src/core/coreCanaryWebhook').selfTest()); }
function coreBridgeInfo() { return safe('coreCallbackBridgeLayer', () => require('./core-callback-bridge-layer').selfTest()); }
async function readRequestJson(req) { if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body; if (String(req.method || '').toUpperCase() === 'GET') return {}; return new Promise((resolve) => { let raw = ''; let done = false; const finish = (value) => { if (done) return; done = true; req.body = value || {}; resolve(req.body); }; try { req.on('data', (chunk) => { raw += chunk; if (raw.length > 1024 * 1024) finish({}); }); req.on('end', () => { if (!raw) return finish({}); try { finish(JSON.parse(raw)); } catch { finish({ rawBody: raw.slice(0, 4096) }); } }); req.on('error', () => finish({})); setTimeout(() => finish({}), 2500); } catch { finish({}); } }); }
function queryPairsFromUrlish(value = '') { const raw = String(value || '').trim(); if (!raw) return {}; const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw; const clean = query.split('#')[0]; const result = {}; try { const params = new URLSearchParams(clean); for (const [key, val] of params.entries()) { if (result[key] === undefined) result[key] = val; } } catch {} return result; }
function mergeRequestParams(req = {}, body = {}) { const result = {}; const add = (source = {}) => { if (!source || typeof source !== 'object') return; Object.entries(source).forEach(([key, value]) => { if (result[key] === undefined && value !== undefined && value !== null) result[key] = value; }); }; add(req.query || {}); add(body || {}); add(queryPairsFromUrlish(req.originalUrl || '')); add(queryPairsFromUrlish(req.url || '')); add(queryPairsFromUrlish(req._parsedUrl?.query || '')); return result; }
function pickParam(params = {}, ...names) { for (const name of names) { if (params[name] !== undefined && params[name] !== null && String(params[name]).trim() !== '') return params[name]; } return undefined; }
function truthy(value) { return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase()); }
function clean(value) { return String(value || '').trim(); }
function getHeader(req, name) { try { return req.get(name) || req.headers?.[String(name).toLowerCase()] || ''; } catch { return ''; } }
function manualSendTokenState(req = {}, params = {}) {
  const expected = clean(process.env.ADMINKIT_CORE_MANUAL_SEND_TOKEN || process.env.ADMINKIT_CORE_WEBHOOK_TOKEN || '');
  const provided = clean(pickParam(params, 'token', 'manualToken', 'manual_send_token', 'coreToken') || getHeader(req, 'x-adminkit-core-manual-send-token') || getHeader(req, 'x-adminkit-core-token') || '');
  return {
    tokenRequiredForRealSend: true,
    tokenEnvName: process.env.ADMINKIT_CORE_MANUAL_SEND_TOKEN ? 'ADMINKIT_CORE_MANUAL_SEND_TOKEN' : (process.env.ADMINKIT_CORE_WEBHOOK_TOKEN ? 'ADMINKIT_CORE_WEBHOOK_TOKEN' : 'ADMINKIT_CORE_MANUAL_SEND_TOKEN'),
    tokenConfigured: !!expected,
    tokenProvided: !!provided,
    tokenAccepted: !!expected && !!provided && provided === expected,
    realSendBlockedWithoutToken: !!expected && (!provided || provided !== expected),
    realSendBlockedBecauseTokenNotConfigured: !expected
  };
}
async function coreRenderPreview(planCode = 'free') { try { const core = require('./adminkit-core-runtime'); const screen = await core.renderMain({ planCode }); return { ok: true, runtimeVersion: core.RUNTIME, planCode, screen, buttonTexts: (((screen.attachments || [])[0] || {}).payload || {}).buttons?.flat?.().map((b) => b.text) || [] }; } catch (e) { return { ok: false, error: e?.message || String(e) }; } }
async function coreUpdatePreview(req) { try { const body = await readRequestJson(req); const params = mergeRequestParams(req, body); const route = String(pickParam(params, 'route') || 'main.home'); const planCode = String(pickParam(params, 'plan', 'planCode') || 'free'); const update = { ...params, text: route, planCode }; return await require('./src/core/updateAdapter').preview(update, { ...params, route, planCode }); } catch (e) { return { ok: false, error: e?.message || String(e) }; } }
async function coreDeliverPreview(req) { try { const body = await readRequestJson(req); const params = mergeRequestParams(req, body); const updatePreview = await coreUpdatePreview(req); if (!updatePreview.ok) return updatePreview; const sendAdapter = require('./src/core/maxSendAdapter'); const adminId = String(pickParam(params, 'adminId') || updatePreview.ctx?.adminId || 'debug-admin'); const userId = String(pickParam(params, 'userId') || ''); const chatId = String(pickParam(params, 'chatId') || ''); const activeMessageId = String(pickParam(params, 'activeMessageId', 'messageId') || ''); const delivery = await sendAdapter.deliver({ adminId, userId, chatId, activeMessageId, screen: updatePreview.screen, dryRun: true }); return { ok: true, runtimeVersion: updatePreview.runtimeVersion, mode: 'core-deliver-preview-dry-run-only', update: updatePreview, delivery, note: 'Этот endpoint не отправляет сообщения в MAX. Реальная отправка будет подключаться отдельно через canary-gated adapter.' }; } catch (e) { return { ok: false, error: e?.message || String(e) }; } }
async function coreCanaryPreview(req) { try { const body = await readRequestJson(req); const params = mergeRequestParams(req, body); const route = String(pickParam(params, 'route') || 'main.home'); const adminId = String(pickParam(params, 'adminId') || 'debug-admin'); const updateType = String(pickParam(params, 'updateType', 'update_type', 'type') || 'message_callback'); const update = Object.keys(body || {}).length ? body : { update_type: updateType, callback: { payload: JSON.stringify({ r: route }), user: { user_id: adminId }, callback_id: 'debug-callback' }, message: { body: { mid: String(pickParam(params, 'messageId') || '') }, recipient: { chat_id: String(pickParam(params, 'chatId') || '') } } }; const canary = require('./src/core/coreCanaryWebhook'); const config = require('./config'); return await canary.preview(update, config); } catch (e) { return { ok: false, error: e?.message || String(e) }; } }
async function coreCanarySend(req) { try { const body = await readRequestJson(req); const params = mergeRequestParams(req, body); const canary = require('./src/core/coreCanaryWebhook'); const config = require('./config'); const dryRun = pickParam(params, 'dryRun', 'dryrun', 'dry_run') ?? '0'; const isDryRun = truthy(dryRun); const args = { route: String(pickParam(params, 'route') || 'main.home'), adminId: String(pickParam(params, 'adminId', 'admin_id', 'userId', 'user_id') || ''), chatId: String(pickParam(params, 'chatId', 'chat_id') || ''), messageId: String(pickParam(params, 'messageId', 'message_id', 'activeMessageId', 'active_message_id') || ''), dryRun, updateType: String(pickParam(params, 'updateType', 'update_type') || 'message_callback'), text: String(pickParam(params, 'text') || '') }; const token = manualSendTokenState(req, params); const diagnostics = { originalUrl: String(req.originalUrl || ''), url: String(req.url || ''), receivedQuery: req.query || {}, receivedBodyKeys: Object.keys(body || {}), parsedParams: params, dryRunResolved: String(dryRun), adminIdResolved: args.adminId, routeResolved: args.route, tokenRequiredForRealSend: token.tokenRequiredForRealSend, tokenConfigured: token.tokenConfigured, tokenProvided: token.tokenProvided, tokenAccepted: token.tokenAccepted, realSendBlockedWithoutToken: !isDryRun && !token.tokenAccepted, realSendBlockedBecauseTokenNotConfigured: !isDryRun && !token.tokenConfigured, tokenEnvName: token.tokenEnvName };
  if (!isDryRun && !token.tokenConfigured) return { ok: false, runtimeVersion: 'core-canary-send-route-token-guard', mode: 'core-canary-manual-send-token-blocked', error: 'manual_send_token_not_configured', help: 'Задайте ADMINKIT_CORE_MANUAL_SEND_TOKEN перед реальной ручной отправкой. dryRun=1 разрешён без токена.', diagnostics };
  if (!isDryRun && !token.tokenAccepted) return { ok: false, runtimeVersion: 'core-canary-send-route-token-guard', mode: 'core-canary-manual-send-token-blocked', error: 'manual_send_token_required', help: 'Для реальной ручной отправки передайте корректный token. dryRun=1 разрешён без токена.', diagnostics };
  const result = await canary.manualSend(args, config); return { ...result, diagnostics }; } catch (e) { return { ok: false, error: e?.message || String(e), runtimeVersion: 'core-canary-send-route-wrapper' }; } }
async function coreCanaryWebhook(req, res) { try { await readRequestJson(req); const canary = require('./src/core/coreCanaryWebhook'); const config = require('./config'); return canary.handleWebhook(req, res, config); } catch (e) { noCache(res); return res.status(500).json({ ok: false, error: e?.message || String(e), runtimeVersion: 'core-canary-route-wrapper' }); } }
function layerSummary() { return loadedLayers.map((x) => ({ path: x.path, ok: !!x.ok, runtimeVersion: x.runtimeVersion || '', error: x.error || '' })); }
function compactDebug() {
  const buildInfo = readBuildInfo() || {};
  const hardRootFile = fileInfo('menu-v3-hard-root.js', 'adminkit-admin-flows-7525');
  const publicApp = fileInfo('public/app.js', 'CC7.5.6-PUBLIC-APP-COMMENT-UI-SEND-GUARD');
  const appOnepass = fileInfo('public/app-onepass.js', 'CC7.5.6-COMMENT-UI-SEND-GUARD');
  const coreAdapter = safe('maxSendAdapter', () => require('./src/core/maxSendAdapter').selfTest());
  const coreCanary = coreCanaryInfo();
  const coreBridge = coreBridgeInfo();
  const adminFlow = adminFlowInfo();
  const postPatcher = postPatcherInfo();
  const commentRoute = commentRouteInfo();
  const core = coreRuntimeInfo();
  const checks = { runtime: RUNTIME, packageVersion: buildInfo.packageVersion || 'unknown', hardRoot7525: !!hardRootFile.markerFound, adminFlow7525: adminFlow.runtimeVersion === RUNTIME, menuPatchReady: !!adminFlow.mainMenuLeadLabelPatch && !!adminFlow.leadStepTitleStaysProfessional, publicAppStable: !!publicApp.markerFound && !!appOnepass.markerFound, appJsOverrideRemoved: true, postPatcherOk: postPatcher.ok !== false, commentOpenStateOk: commentRoute.ok !== false, coreReady: core.ok === true && core.isCoreRuntime === true, coreMaxSendAdapterReady: coreAdapter.ok === true, coreCanaryWebhookReady: coreCanary.ok === true, coreManualSendReady: coreCanary.safety?.supportsManualCanarySend === true, coreManualSendTokenGuardReady: coreCanary.safety?.manualSendRealRequiresRouteToken === true, coreCallbackBridgeReady: coreBridge.ok === true };
  const problems = [];
  if (!checks.hardRoot7525) problems.push('menu-v3-hard-root не указывает на 7525');
  if (!checks.adminFlow7525) problems.push('adminFlow не 7525');
  if (!checks.menuPatchReady) problems.push('патч названий лид-магнитов не активен');
  if (!checks.publicAppStable) problems.push('public app markers не совпали');
  if (!checks.postPatcherOk) problems.push('post patcher selfTest не ok');
  if (!checks.commentOpenStateOk) problems.push('comment open state route не ok');
  if (!checks.coreReady) problems.push('adminkit core scaffold не готов');
  if (!checks.coreMaxSendAdapterReady) problems.push('core max send adapter не готов');
  if (!checks.coreCanaryWebhookReady) problems.push('core canary webhook не готов');
  if (!checks.coreManualSendReady) problems.push('core manual send не готов');
  if (!checks.coreManualSendTokenGuardReady) problems.push('core manual send token guard не готов');
  if (!checks.coreCallbackBridgeReady) problems.push('core callback bridge не готов');
  return { ok: problems.length === 0, runtimeVersion: RUNTIME, displayVersion: 'CC7.5.25', sourceMarker: SOURCE, generatedAt: new Date().toISOString(), checks, problems, expectedUi: { mainMenuButton: '🎁 Подарки / Лид-магниты', leadFlowTitle: '🎁 Лид-магниты — шаг ...', managerButtons: ['Добавить новый лид-магнит', 'Изменить лид-магнит 1', 'Удалить лид-магнит 1'] }, core: { runtimeVersion: core.runtimeVersion || '', activeInProduction: core.activeInProduction === true, sections: core.sections || [], constraints: core.constraints || {}, delivery: core.delivery || coreAdapter, canaryWebhook: coreCanary, callbackBridge: coreBridge }, note: 'Короткий debug. Полный legacy: /debug/cc7-full или /debug/cc7?full=1. Core: /debug/core, /debug/core-render, /debug/core-update, /debug/core-deliver, /debug/core-canary, /debug/core-canary-preview, /debug/core-canary-send' };
}
function coreDebug() { const core = coreRuntimeInfo(); const coreCanary = coreCanaryInfo(); const coreBridge = coreBridgeInfo(); const problems = []; if (core.ok !== true) problems.push(core.error || 'core selfTest failed'); if (core.activeInProduction === true) problems.push('core неожиданно включён в production'); if (coreCanary.ok !== true) problems.push(coreCanary.error || 'core canary webhook selfTest failed'); if (coreCanary.safety?.supportsManualCanarySend !== true) problems.push('core manual send selfTest failed'); if (coreCanary.safety?.manualSendRealRequiresRouteToken !== true) problems.push('core manual send token guard selfTest failed'); if (coreBridge.ok !== true) problems.push(coreBridge.error || 'core callback bridge selfTest failed'); return { ok: problems.length === 0, debugType: 'adminkit-core-short', generatedAt: new Date().toISOString(), productionRuntime: RUNTIME, productionStillLegacyLayered: true, core, coreCanaryWebhook: coreCanary, coreCallbackBridge: coreBridge, problems, nextMigrationStep: 'нажать Core inline-кнопки в MAX и проверить, что callback обработан bridge для canary admin' }; }
function fullDebug() { return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installedAt, policy: 'lead_wording_preload_patch_old_gift_labels_no_longer_visible', publicApp: fileInfo('public/app.js', 'CC7.5.6-PUBLIC-APP-COMMENT-UI-SEND-GUARD'), appOnepass: fileInfo('public/app-onepass.js', 'CC7.5.6-COMMENT-UI-SEND-GUARD'), appJsOverride: { ok: false, removed: true }, hardRootFile: fileInfo('menu-v3-hard-root.js', 'adminkit-admin-flows-7525'), adminFlow: adminFlowInfo(), core: coreRuntimeInfo(), coreMaxSendAdapter: safe('maxSendAdapter', () => require('./src/core/maxSendAdapter').selfTest()), coreCanaryWebhook: coreCanaryInfo(), coreCallbackBridge: coreBridgeInfo(), postPatcher: postPatcherInfo(), buildInfo: readBuildInfo(), loadedLayers, audit: { commentsCore: 'unchanged from accepted CC7.5.6', buttonsCore: 'unchanged from accepted CC7.5.16+', leadMagnetsCore: 'CC7.5.25 patches visible wording before legacy/base modules are imported', adminkitCore: 'ADMINKIT-CORE-1.15 exists with callback bridge layer; production runtime is still legacy CC7.5.25', expected: ['Core menu can be sent manually to canary admin', 'Core callback bridge handles payload.r callbacks only for canary admin', 'Non-core callbacks fall through to legacy', 'Core canary webhook path exists but does not auto-register in MAX'], stillLayered: true, optimizationNote: 'after canary acceptance merge wrappers into one clean core module' }, commentOpenStateRoute: commentRouteInfo(), generatedAt: Date.now() }; }
function installRoutes(app) {
  if (!app || app.__adminkitCc7525Routes) return app;
  app.__adminkitCc7525Routes = true;
  registerCommentOpenStateRoutes(app);
  app.get('/debug/cc7', (req, res) => { noCache(res); res.json(String(req.query?.full || '') === '1' ? fullDebug() : compactDebug()); });
  app.get('/debug/cc7-full', (req, res) => { noCache(res); res.json(fullDebug()); });
  app.get('/debug/core', (req, res) => { noCache(res); res.json(coreDebug()); });
  app.get('/debug/core-full', (req, res) => { noCache(res); res.json({ ...coreDebug(), full: true, legacyLayers: layerSummary(), buildInfo: readBuildInfo() }); });
  app.get('/debug/core-render', async (req, res) => { noCache(res); res.json(await coreRenderPreview(String((mergeRequestParams(req, {}) || {}).plan || 'free'))); });
  app.get('/debug/core-update', async (req, res) => { noCache(res); res.json(await coreUpdatePreview(req)); });
  app.post('/debug/core-update', async (req, res) => { noCache(res); res.json(await coreUpdatePreview(req)); });
  app.get('/debug/core-deliver', async (req, res) => { noCache(res); res.json(await coreDeliverPreview(req)); });
  app.post('/debug/core-deliver', async (req, res) => { noCache(res); res.json(await coreDeliverPreview(req)); });
  app.get('/debug/core-canary', (req, res) => { noCache(res); res.json(coreCanaryInfo()); });
  app.get('/debug/core-canary-preview', async (req, res) => { noCache(res); res.json(await coreCanaryPreview(req)); });
  app.post('/debug/core-canary-preview', async (req, res) => { noCache(res); res.json(await coreCanaryPreview(req)); });
  app.get('/debug/core-canary-send', async (req, res) => { noCache(res); res.json(await coreCanarySend(req)); });
  app.post('/debug/core-canary-send', async (req, res) => { noCache(res); res.json(await coreCanarySend(req)); });
  app.all(process.env.ADMINKIT_CORE_WEBHOOK_PATH || '/webhook/adminkit-core-canary', coreCanaryWebhook);
  app.get(['/debug/ping', '/debug/version', '/debug/build-info'], (req, res) => { noCache(res); res.json({ ok: true, runtimeVersion: RUNTIME, displayVersion: 'CC7.5.25', sourceMarker: SOURCE, buildInfo: readBuildInfo(), layers: layerSummary(), core: coreRuntimeInfo(), coreCanaryWebhook: coreCanaryInfo(), coreCallbackBridge: coreBridgeInfo(), generatedAt: new Date().toISOString() }); });
  return app;
}
function installExpressWrap() { if (Module.__adminkitCc7525ExpressWrap) return; Module.__adminkitCc7525ExpressWrap = true; const prev = Module._load; Module._load = function adminkitCc7525Load(request, parent, isMain) { const loaded = prev.apply(this, arguments); if (String(request) === 'express' && loaded && !loaded.__adminkitCc7525Wrapped) { function wrappedExpress(...args) { return installRoutes(loaded(...args)); } Object.setPrototypeOf(wrappedExpress, loaded); Object.assign(wrappedExpress, loaded); wrappedExpress.__adminkitCc7525Wrapped = true; return wrappedExpress; } return loaded; }; }
function boot() { if (global[MARKER]) return; global[MARKER] = true; installedAt = new Date().toISOString(); installExpressWrap(); loadLayer('./db-v3-store-comment-guard'); loadLayer('./db-v3-comment-guard'); loadLayer('./core-callback-bridge-layer'); loadLayer('./hard-v3-menu-webhook-router'); loadLayer('./clean-v3-menu-debug'); require('./index'); }
boot();
module.exports = { RUNTIME, SOURCE, MARKER };
