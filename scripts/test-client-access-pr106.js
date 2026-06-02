'use strict';

const assert = require('assert');
process.env.ADMINKIT_ADMIN_MAX_USER_IDS = 'pr106-admin-user';
process.env.ADMINKIT_TEST_MODE = '1';
delete process.env.ADMINKIT_SUPPORT_CONTACT;
delete process.env.SUPPORT_CONTACT;

const access = require('../services/clientAccessService');
const accessGate = require('../services/accessGateService');
const accountScreens = require('../features/account-screens-pr106');
const canonical = require('../features/menu-v3/canonical-menu');
const routes = require('../v3-menu-routes-1539');
const debugExport = require('../src/core/debugExportAdapter');

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
function lastText(call) { return String(call?.text || ''); }
function messageUpdate(userId, text) { return { body: { update_type: 'message_created', message: { id: `m-${userId}-${text}`, body: { text }, sender: { user_id: userId }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } }; }
function callbackUpdate(userId, payload) { return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${userId}`, body: { mid: `mid-${userId}`, text: 'old' }, sender: { user_id: userId }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } }; }
async function sendBot(bot, sent, update, token = 'test-token') { const res = createJsonRes(); await bot.handleWebhook(update, res, { botToken: token, menuDeleteTimeoutMs: 1 }); assert.strictEqual(res.statusCode, 200); return { res, labels: payloadLabels(sent.at(-1)), text: lastText(sent.at(-1)), screenId: res.body?.screenId || '' }; }

const newUserScreen = accountScreens.gateMenuForUser('pr106-new-user');
assert.strictEqual(newUserScreen.id, 'pr106_activation_required', 'new user must see activation screen');
assert.deepStrictEqual(labels(newUserScreen), ['Активировать код', 'Что умеет АдминКИТ', 'Поддержка'], 'activation screen buttons must match PR106 contract');
assert.notDeepStrictEqual(labels(newUserScreen), canonical.clientSections.map((section) => section.title), 'new user must not see 12-section menu');
assertCleanClientScreen(newUserScreen, 'activation screen must not leak debug details');
assert.ok(/менеджеру/.test(accountScreens.supportScreen().text), 'support fallback must point to manager, not fake @support');

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
delete process.env.ADMINKIT_ADMIN_MAX_USER_IDS;
assert.strictEqual(access.isAdmin('pr106-admin-user'), false, 'admin must not default when env is empty');
process.env.ADMINKIT_ADMIN_MAX_USER_IDS = 'pr106-admin-user';

access.upsertActivationCode({ code: 'PR106-VALID', planId: 'start', durationDays: 10, maxChannels: 1, expiresAt: '2099-01-01T00:00:00.000Z', boundChannelId: 'tenant-bound-channel', singleUse: true });
const activation = access.activateCode({ maxUserId: 'pr106-code-user', code: ' pr106-valid ' });
assert.strictEqual(activation.ok, true, 'valid code must activate access');
assert.strictEqual(access.getAccessState('pr106-code-user').active, true, 'activated profile must become active');
const tenant = access.getTenantByMaxUserId('pr106-code-user');
assert.ok(tenant?.tenantId, 'activation must create tenant');
assert.strictEqual(tenant.planId, 'start', 'tenant must keep plan');
assert.ok(tenant.expiresAt, 'tenant must keep expiry');
assert.ok(access.getTenantUsers(tenant.tenantId).some((user) => user.maxUserId === 'pr106-code-user' && user.role === 'owner'), 'tenant must have owner user');
assert.ok(access.getClientChannels('pr106-code-user').some((channel) => channel.channelId === 'tenant-bound-channel'), 'bound channel must attach to tenant');
assert.ok(access.getAccessEvents(tenant.tenantId).some((event) => event.eventType === 'code_activated'), 'activation must write access event');
assert.strictEqual(access.bindTenantChannel({ tenantId: tenant.tenantId, channelId: 'second-channel', maxChannels: 1 }).ok, false, 'tenant channel limit must be enforced');

access.upsertActivationCode({ code: 'PR106-VALID-2', planId: 'pro', durationDays: 10, maxChannels: 5, expiresAt: '2099-01-01T00:00:00.000Z', singleUse: true });
assert.strictEqual(access.activateCode({ maxUserId: 'pr106-code-user-2', code: 'PR106-VALID-2' }).ok, true, 'second tenant activation ok');
const tenant2 = access.getTenantByMaxUserId('pr106-code-user-2');
const conflict = access.bindTenantChannel({ tenantId: tenant2.tenantId, channelId: 'tenant-bound-channel', maxChannels: 5 });
assert.strictEqual(conflict.ok, false, 'channel cannot silently belong to two tenants');
assert.strictEqual(conflict.error, 'channel_owned_by_another_tenant');

const reused = access.activateCode({ maxUserId: 'pr106-code-user-3', code: 'PR106-VALID' });
assert.strictEqual(reused.ok, false, 'used code must not be reusable');
assert.strictEqual(reused.error, 'code_used', 'used code must return friendly used error');
assert.ok(/уже использован/i.test(reused.message), 'used code message must be friendly');

access.upsertActivationCode({ code: 'PR106-EXPIRED', planId: 'pro', durationDays: 10, maxChannels: 5, expiresAt: '2000-01-01T00:00:00.000Z', singleUse: true });
const expiredCode = access.activateCode({ maxUserId: 'pr106-expired-code-user', code: 'PR106-EXPIRED' });
assert.strictEqual(expiredCode.ok, false, 'expired code must fail');
assert.strictEqual(expiredCode.error, 'code_expired', 'expired code must return code_expired');
assert.ok(/ист[ёе]к/i.test(expiredCode.message), 'expired code message must be friendly');
access.upsertActivationCode({ code: 'PR106-REVOKED', planId: 'pro', durationDays: 10, status: 'revoked', expiresAt: '2099-01-01T00:00:00.000Z' });
assert.strictEqual(access.activateCode({ maxUserId: 'pr106-revoked-code-user', code: 'PR106-REVOKED' }).error, 'code_revoked', 'revoked code must fail');
assert.ok(!JSON.stringify(access.sanitizedSnapshot()).includes('PR106-VALID'), 'debug/sanitized access snapshot must not expose full activation code');

assert.strictEqual(access.canUseFeature('pr106-active-user', 'gifts').allowed, true, 'pro user can use gifts');
assert.strictEqual(access.canUseFeature('pr106-code-user', 'gifts').allowed, false, 'start user cannot use pro gifts');
assert.ok(/другом тарифе|скоро/i.test(access.canUseFeature('pr106-code-user', 'gifts').message), 'feature gate denial must be client-friendly');
assert.strictEqual(access.canUseFeature('pr106-new-user', 'comments').allowed, false, 'new user cannot use features before activation');
assert.strictEqual(access.canUseFeature('pr106-active-user', 'export').allowed, false, 'business-only export must be denied for pro');
assert.strictEqual(accessGate.featureForAction('admin_stats_campaign_create'), 'ad_links', 'campaign create callback maps to ad_links');
assert.strictEqual(accessGate.featureForAction('admin_stats_campaigns'), 'ad_links', 'campaign list callback maps to ad_links');
assert.strictEqual(accessGate.featureForAction('admin_stats_campaign_disable'), 'ad_links', 'campaign disable callback maps to ad_links');
assert.strictEqual(accessGate.featureForAction('ad_link_copy'), 'ad_links', 'ad link copy callback maps to ad_links');
assert.strictEqual(accessGate.featureForAction('admin_stats_sources_cache'), 'advanced_stats', 'source tracking callback maps to advanced_stats');
assert.strictEqual(accessGate.featureForAction('source_tracking_report'), 'advanced_stats', 'source tracking report maps to advanced_stats');
assert.strictEqual(accessGate.featureForAction('attribution_report'), 'attribution', 'explicit attribution report maps to attribution');
assert.strictEqual(accessGate.featureForAction('admin_stats_export'), 'export', 'export callback maps to export');
assert.strictEqual(accessGate.featureForRoute('stats.export'), 'export', 'dot-delimited stats export route maps to export');
assert.strictEqual(accessGate.featureForAction('', { r: 'stats.referral_create' }), 'ad_links', 'r payload referral route maps to ad_links');
assert.strictEqual(accessGate.featureForRoute('stats.sources'), 'advanced_stats', 'dot-delimited stats sources route maps to advanced_stats');
assert.strictEqual(accessGate.featureForAction('admin_stats_comments_cache'), 'basic_stats', 'basic stats callback remains basic_stats');
assert.strictEqual(accessGate.checkAction('pr106-code-user', { action: 'gift_admin_start_create' }).allow, false, 'direct gift callback must be denied on Start');
assert.strictEqual(accessGate.checkAction('pr106-code-user', { action: 'admin_stats_campaign_create' }).allow, false, 'Start user direct campaign create callback denied');
assert.strictEqual(accessGate.checkAction('pr106-code-user', { action: 'admin_stats_campaigns' }).allow, false, 'Start user direct campaign list callback denied');
assert.strictEqual(accessGate.checkAction('pr106-active-user', { action: 'admin_stats_campaign_create' }).allow, true, 'Pro user campaign create callback allowed');
assert.strictEqual(accessGate.checkAction('pr106-code-user', { action: 'admin_stats_comments_cache' }).allow, true, 'Start user basic stats callback allowed');
assert.strictEqual(accessGate.checkRoute('pr106-code-user', 'stats.sources').allow, false, 'Start user source stats route denied');
assert.strictEqual(accessGate.checkRoute('pr106-active-user', 'stats.sources').allow, true, 'Pro user source stats route allowed as advanced stats');
assert.strictEqual(accessGate.checkAction('pr106-active-user', { action: 'admin_stats_export' }).allow, false, 'Pro user export callback denied');

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
['clientAccessStorageBackend','tenantStorageBackend','tenantTablesReady','postgresConfigured','postgresPersistent'].forEach((key) => assert.ok(Object.prototype.hasOwnProperty.call(version, key), `/debug/version must include ${key}`));
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
assert.ok(!JSON.stringify(live).includes('PR106-VALID'), '/debug/store-live must not expose full activation code');

(async () => {
  access.createClientProfile({ maxUserId: 'pr106-bot-active', name: 'Bot Active', planId: 'business', status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', maxChannels: 20 });
  access.createClientProfile({ maxUserId: 'pr106-start-user', name: 'Start User', planId: 'start', status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', maxChannels: 1 });
  access.createClientProfile({ maxUserId: 'pr106-pro-user', name: 'Pro User', planId: 'pro', status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', maxChannels: 5 });
  access.createClientProfile({ maxUserId: 'pr106-bot-expired', name: 'Expired Bot', planId: 'start', status: 'active', expiresAt: '2000-01-01T00:00:00.000Z', maxChannels: 1 });
  const maxApi = require('../services/maxApi');
  const sent = [];
  maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.getChat = async () => ({ title: 'Тестовый канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });
  const entrypoint = require('../clean-entrypoint-1.53.10-pr89');
  entrypoint.applyEnv();
  entrypoint.installCleanBot();
  const bot = require('../bot');

  assert.deepStrictEqual((await sendBot(bot, sent, messageUpdate('pr106-bot-new', '/start'))).labels, ['Активировать код', 'Что умеет АдминКИТ', 'Поддержка'], 'new user /start activation screen');
  assert.deepStrictEqual((await sendBot(bot, sent, messageUpdate('pr106-bot-new', '/menu'))).labels, ['Активировать код', 'Что умеет АдминКИТ', 'Поддержка'], 'new user /menu activation screen');
  assert.notStrictEqual((await sendBot(bot, sent, messageUpdate('pr106-bot-new', '/gifts'))).screenId, 'gifts:home', 'new user /gifts must not open gifts');
  assert.notStrictEqual((await sendBot(bot, sent, messageUpdate('pr106-bot-new', '/stats'))).screenId, 'stats:home', 'new user /stats must not open stats');
  assert.ok(!/Debug|GitHub export/i.test((await sendBot(bot, sent, messageUpdate('pr106-bot-new', '/debug'))).text), 'new user /debug must not show debug');
  assert.deepStrictEqual((await sendBot(bot, sent, callbackUpdate('pr106-bot-new', { action: 'comments_select_post' }))).labels, ['Активировать код', 'Что умеет АдминКИТ', 'Поддержка'], 'stale comments callback gated for new user');
  assert.deepStrictEqual((await sendBot(bot, sent, callbackUpdate('pr106-bot-new', { action: 'gift_admin_start_create' }))).labels, ['Активировать код', 'Что умеет АдминКИТ', 'Поддержка'], 'stale gift callback gated for new user');

  assert.deepStrictEqual((await sendBot(bot, sent, messageUpdate('pr106-bot-expired', '/menu'))).labels, ['Мой доступ', 'Оплата / продление', 'Поддержка'], 'expired user /menu account-only');
  assert.deepStrictEqual((await sendBot(bot, sent, messageUpdate('pr106-bot-expired', '/gifts'))).labels, ['Мой доступ', 'Оплата / продление', 'Поддержка'], 'expired user /gifts account-only');
  assert.deepStrictEqual((await sendBot(bot, sent, callbackUpdate('pr106-bot-expired', { action: 'gift_admin_start_create' }))).labels, ['Мой доступ', 'Оплата / продление', 'Поддержка'], 'expired stale callback account-only');

  assert.ok((await sendBot(bot, sent, messageUpdate('pr106-start-user', '/buttons'))).labels.some((label) => /Добавить кнопку|Текущие кнопки/.test(label)), 'Start user /buttons allowed');
  assert.ok(/Функция недоступна|другом тарифе|скоро/.test((await sendBot(bot, sent, messageUpdate('pr106-start-user', '/gifts'))).text), 'Start user /gifts denied');
  assert.ok(/Функция недоступна|другом тарифе|скоро/.test((await sendBot(bot, sent, messageUpdate('pr106-start-user', '/polls'))).text), 'Start user /polls denied');
  assert.ok((await sendBot(bot, sent, messageUpdate('pr106-start-user', '/stats'))).labels.length > 1, 'Start user /stats allowed by basic stats');
  assert.ok(/Функция недоступна|другом тарифе|скоро/.test((await sendBot(bot, sent, callbackUpdate('pr106-start-user', { action: 'gift_admin_start_create' }))).text), 'Start user direct gift callback denied');
  assert.ok(/Функция недоступна|другом тарифе|скоро/.test((await sendBot(bot, sent, callbackUpdate('pr106-start-user', { action: 'admin_stats_campaign_create' }))).text), 'Start user direct campaign create callback denied');
  assert.ok(/Функция недоступна|другом тарифе|скоро/.test((await sendBot(bot, sent, callbackUpdate('pr106-start-user', { action: 'admin_stats_campaigns' }))).text), 'Start user direct campaign list callback denied');
  assert.ok((await sendBot(bot, sent, callbackUpdate('pr106-start-user', { action: 'admin_stats_comments_cache' }))).labels.length > 1, 'Start user basic stats callback allowed');
  assert.ok(/Функция недоступна|другом тарифе|скоро/.test((await sendBot(bot, sent, callbackUpdate('pr106-start-user', { r: 'stats.sources' }))).text), 'Start user source stats route denied');

  assert.ok((await sendBot(bot, sent, messageUpdate('pr106-pro-user', '/gifts'))).labels.length > 1, 'Pro user /gifts allowed');
  assert.ok((await sendBot(bot, sent, callbackUpdate('pr106-pro-user', { action: 'admin_stats_campaign_create' }))).labels.length > 1, 'Pro user campaign create callback allowed');
  assert.ok((await sendBot(bot, sent, callbackUpdate('pr106-pro-user', { r: 'stats.sources' }))).labels.length > 1, 'Pro user source stats route allowed');
  assert.ok(/Функция недоступна|другом тарифе|скоро/.test((await sendBot(bot, sent, callbackUpdate('pr106-pro-user', { action: 'admin_stats_export' }))).text), 'Pro user export callback denied');
  assert.ok(/Функция недоступна|другом тарифе|скоро/.test((await sendBot(bot, sent, callbackUpdate('pr106-pro-user', { r: 'stats.export' }))).text), 'Pro user export route denied');
  assert.strictEqual(accessGate.checkFeature('pr106-pro-user', 'ad_links').allow, true, 'Pro ad_links allowed');
  assert.strictEqual(accessGate.checkFeature('pr106-pro-user', 'polls').allow, true, 'Pro polls allowed');
  assert.strictEqual(accessGate.checkFeature('pr106-pro-user', 'highlights').allow, true, 'Pro highlights allowed');
  assert.strictEqual(accessGate.checkFeature('pr106-pro-user', 'export').allow, false, 'Pro business-only export denied');

  assert.deepStrictEqual((await sendBot(bot, sent, messageUpdate('pr106-bot-active', '/start'))).labels, canonical.clientSections.map((section) => section.title), 'active bot user must receive canonical menu');
  assert.ok(/Debug|GitHub export/i.test((await sendBot(bot, sent, messageUpdate('pr106-admin-user', '/debug'))).text), 'explicit admin /debug allowed');
  console.log('client access pr106 ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
