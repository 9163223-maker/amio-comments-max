'use strict';

const assert = require('assert');
const access = require('../services/clientAccessService');
const accountScreens = require('../features/account-screens-pr106');
const canonical = require('../features/menu-v3/canonical-menu');
const menuCore = require('../v3-menu-core-1539');
const routes = require('../v3-menu-routes-1539');
const debugExport = require('../src/core/debugExportAdapter');

process.env.ADMINKIT_ADMIN_MAX_USER_IDS = 'pr106-admin-user';
access._resetForTests();

function rows(screen) { return screen?.attachments?.[0]?.payload?.buttons || []; }
function labels(screen) { return rows(screen).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function textAndLabels(screen) { return [screen?.text || '', ...labels(screen)].join('\n'); }
function assertCleanClientScreen(screen, message) {
  const value = textAndLabels(screen);
  assert.ok(!/Debug|GitHub export|trace|token|payload|postId|channelId|commentKey/i.test(value), message || `client screen leaked technical text: ${value}`);
}
function createRouteRes() {
  const res = { statusCode: 200, body: '', headers: {} };
  res.set = (headers) => { res.headers = { ...res.headers, ...(headers || {}) }; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.type = (value) => { res.contentType = value; return res; };
  res.send = (body) => { res.body = body; return res; };
  return res;
}
function createJsonRes() {
  const res = { statusCode: 200, body: null, headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; res.headersSent = true; return res; };
  return res;
}
function payloadLabels(call) { return (call?.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }

const newUserScreen = accountScreens.gateMenuForUser('pr106-new-user');
assert.strictEqual(newUserScreen.id, 'pr106_activation_required', 'new user must see activation screen');
assert.deepStrictEqual(labels(newUserScreen), ['Активировать код', 'Что умеет АдминКИТ', 'Поддержка'], 'activation screen buttons must match PR106 contract');
assert.notDeepStrictEqual(labels(newUserScreen), canonical.clientSections.map((section) => section.title), 'new user must not see 12-section menu');
assertCleanClientScreen(newUserScreen, 'activation screen must not leak debug details');

access.createClientProfile({ maxUserId: 'pr106-active-user', name: 'Active', planId: 'pro', status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', maxChannels: 5 });
const activeScreen = accountScreens.gateMenuForUser('pr106-active-user');
assert.deepStrictEqual(labels(activeScreen), canonical.clientSections.map((section) => section.title), 'active user must see canonical 12-section menu');

access.createClientProfile({ maxUserId: 'pr106-expired-user', name: 'Expired', planId: 'start', status: 'active', expiresAt: '2000-01-01T00:00:00.000Z', maxChannels: 1 });
const expiredScreen = accountScreens.gateMenuForUser('pr106-expired-user');
assert.strictEqual(expiredScreen.id, 'pr106_access_expired', 'expired user must see renewal/account-only screen');
assert.deepStrictEqual(labels(expiredScreen), ['Мой доступ', 'Оплата / продление', 'Поддержка'], 'expired screen buttons must be account-only');
assertCleanClientScreen(expiredScreen, 'expired screen must not leak debug details');

const adminScreen = accountScreens.gateMenuForUser('pr106-admin-user');
assert.deepStrictEqual(labels(adminScreen), canonical.clientSections.map((section) => section.title), 'admin bypass must see full menu');
assert.strictEqual(access.isAdmin('pr106-admin-user'), true, 'admin id must be detected');

access.upsertActivationCode({ code: 'PR106-VALID', planId: 'start', durationDays: 10, maxChannels: 1, expiresAt: '2099-01-01T00:00:00.000Z', singleUse: true });
const activation = access.activateCode({ maxUserId: 'pr106-code-user', code: ' pr106-valid ' });
assert.strictEqual(activation.ok, true, 'valid code must activate access');
assert.strictEqual(access.getAccessState('pr106-code-user').active, true, 'activated profile must become active');
const reused = access.activateCode({ maxUserId: 'pr106-code-user-2', code: 'PR106-VALID' });
assert.strictEqual(reused.ok, false, 'used code must not be reusable');
assert.strictEqual(reused.error, 'code_used', 'used code must return friendly used error');
assert.ok(/уже использован/i.test(reused.message), 'used code message must be friendly');

access.upsertActivationCode({ code: 'PR106-EXPIRED', planId: 'pro', durationDays: 10, maxChannels: 5, expiresAt: '2000-01-01T00:00:00.000Z', singleUse: true });
const expiredCode = access.activateCode({ maxUserId: 'pr106-expired-code-user', code: 'PR106-EXPIRED' });
assert.strictEqual(expiredCode.ok, false, 'expired code must fail');
assert.strictEqual(expiredCode.error, 'code_expired', 'expired code must return code_expired');
assert.ok(/ист[ёе]к/i.test(expiredCode.message), 'expired code message must be friendly');

assert.strictEqual(access.canUseFeature('pr106-active-user', 'gifts').allowed, true, 'pro user can use gifts');
assert.strictEqual(access.canUseFeature('pr106-code-user', 'gifts').allowed, false, 'start user cannot use pro gifts');
assert.ok(/другом тарифе|скоро/i.test(access.canUseFeature('pr106-code-user', 'gifts').message), 'feature gate denial must be client-friendly');
assert.strictEqual(access.canUseFeature('pr106-new-user', 'comments').allowed, false, 'new user cannot use features before activation');

['account_my_access', 'account_activate_code', 'account_payment', 'account_limits', 'account_channels', 'account_support', 'account_capabilities'].forEach((action) => {
  const screen = accountScreens.screenForAction(action, 'pr106-code-user');
  assert.ok(screen, `${action} must render`);
  assertCleanClientScreen(screen, `${action} must be client-safe`);
});

const registered = {};
const fakeApp = { get(route, handler) { registered[Array.isArray(route) ? route.join('|') : route] = handler; return this; } };
routes.install(fakeApp);
assert.strictEqual(typeof registered['/debug/version'], 'function', '/debug/version must be registered');
assert.strictEqual(typeof registered['/debug/menu/audit'], 'function', '/debug/menu/audit must be registered');
const versionRes = createRouteRes();
registered['/debug/version']({}, versionRes);
const version = JSON.parse(versionRes.body);
assert.strictEqual(version.runtimeVersion, access.RUNTIME, '/debug/version must include PR106 marker');
assert.strictEqual(version.accessRuntimeVersion, access.RUNTIME, '/debug/version must include accessRuntimeVersion');
assert.strictEqual(version.menuCanonicalVersion, canonical.VERSION, '/debug/version must include PR105 menu canonical version');
assert.strictEqual(version.activeEntrypoint, 'clean-entrypoint-1.53.10-pr89.js', '/debug/version must show active entrypoint');
assert.strictEqual(version.staleEndpointDetected, false, '/debug/version must mark staleEndpointDetected false');
assert.ok(/no-store/i.test(versionRes.headers['Cache-Control'] || ''), '/debug/version must be no-store');

const auditRes = createRouteRes();
registered['/debug/menu/audit']({}, auditRes);
const audit = JSON.parse(auditRes.body);
assert.strictEqual(audit.canonicalVersion, canonical.VERSION, '/debug/menu/audit canonical version must stay PR105');
assert.strictEqual(audit.visibleMainMenuTotal, 12, '/debug/menu/audit must keep 12 sections');
assert.strictEqual(audit.checks.noDebugTopLevel, true, '/debug/menu/audit must keep noDebugTopLevel');
assert.strictEqual(audit.checks.noCtaLabel, true, '/debug/menu/audit must keep noCtaLabel');
assert.strictEqual(audit.accessRuntimeVersion, access.RUNTIME, '/debug/menu/audit must include accessRuntimeVersion');
assert.strictEqual(audit.accessGateEnabled, true, '/debug/menu/audit must include accessGateEnabled');
assert.strictEqual(audit.accountSectionReady, true, '/debug/menu/audit must include accountSectionReady');
assert.ok(/no-store/i.test(auditRes.headers['Cache-Control'] || ''), '/debug/menu/audit must be no-store');

const live = debugExport.buildStoreLive();
assert.strictEqual(live.runtimeVersion, access.RUNTIME, '/debug/store-live payload must include PR106 marker');
assert.strictEqual(live.menuCanonicalVersion, canonical.VERSION, '/debug/store-live payload must include menuCanonicalVersion');
assert.strictEqual(live.noCache, true, '/debug/store-live payload must advertise noCache');

(async () => {
  access.createClientProfile({ maxUserId: 'pr106-bot-active', name: 'Bot Active', planId: 'business', status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', maxChannels: 20 });
  const maxApi = require('../services/maxApi');
  const sent = [];
  maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async () => ({ ok: true });
  const entrypoint = require('../clean-entrypoint-1.53.10-pr89');
  entrypoint.applyEnv();
  entrypoint.installCleanBot();
  const bot = require('../bot');

  const newRes = createJsonRes();
  await bot.handleWebhook({ body: { update_type: 'message_created', message: { id: 'm-new', body: { text: '/start' }, sender: { user_id: 'pr106-bot-new' }, recipient: { chat_id: 'pr106-bot-new-chat', chat_type: 'user' } } } }, newRes, { botToken: 'test-token' });
  assert.strictEqual(newRes.statusCode, 200, 'new bot user /start must return 200');
  assert.deepStrictEqual(payloadLabels(sent.at(-1)), ['Активировать код', 'Что умеет АдминКИТ', 'Поддержка'], 'new bot user must receive activation screen');

  const activeRes = createJsonRes();
  await bot.handleWebhook({ body: { update_type: 'message_created', message: { id: 'm-active', body: { text: '/start' }, sender: { user_id: 'pr106-bot-active' }, recipient: { chat_id: 'pr106-bot-active-chat', chat_type: 'user' } } } }, activeRes, { botToken: 'test-token' });
  assert.strictEqual(activeRes.statusCode, 200, 'active bot user /start must return 200');
  assert.deepStrictEqual(payloadLabels(sent.at(-1)), canonical.clientSections.map((section) => section.title), 'active bot user must receive canonical menu');

  console.log('client access pr106 ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
