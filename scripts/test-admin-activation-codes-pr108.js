'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_ADMIN_MAX_USER_IDS = 'pr108-admin';
delete process.env.DEBUG_ADMIN_ID;
delete process.env.ADMIN_ID;

const access = require('../services/clientAccessService');
const adminScreens = require('../features/admin-activation-screens-pr108');
const accountScreens = require('../features/account-screens-pr106');
const canonical = require('../features/menu-v3/canonical-menu');
const routes = require('../v3-menu-routes-1539');
const maxApi = require('../services/maxApi');

access._resetForTests();

function rows(screen) { return screen?.attachments?.[0]?.payload?.buttons || []; }
function labels(screen) { return rows(screen).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function createJsonRes() { const res = { statusCode: 200, body: null, headersSent: false }; res.status = (code) => { res.statusCode = code; return res; }; res.json = (body) => { res.body = body; res.headersSent = true; return res; }; return res; }
function createRouteRes() { const res = { statusCode: 200, body: '', headers: {} }; res.set = (headers) => { res.headers = { ...res.headers, ...(headers || {}) }; return res; }; res.status = (code) => { res.statusCode = code; return res; }; res.type = (value) => { res.contentType = value; return res; }; res.send = (body) => { res.body = body; return res; }; return res; }
function messageUpdate(userId, text, chatType = 'user', chatId = `${userId}-chat`, recipientExtra = {}) { return { body: { update_type: 'message_created', message: { id: `m-${userId}-${Date.now()}`, body: { text }, sender: { user_id: userId }, recipient: { chat_id: chatId, chat_type: chatType, ...recipientExtra } } } }; }
function callbackUpdate(userId, payload, chatType = 'user', chatId = `${userId}-chat`, recipientExtra = {}) { return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${userId}`, body: { mid: `mid-${userId}`, text: 'old' }, sender: { user_id: userId }, recipient: { chat_id: chatId, chat_type: chatType, ...recipientExtra } } } }; }
function payloadLabels(call) { return (call?.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
async function sendBot(bot, sent, update) { const before = sent.length; const res = createJsonRes(); await bot.handleWebhook(update, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 }); assert.strictEqual(res.statusCode, 200); const newCalls = sent.slice(before); return { res, call: sent.at(-1), newCalls, labels: payloadLabels(sent.at(-1)), text: String(sent.at(-1)?.text || '') }; }

(async () => {
  const entrypoint = require('../clean-entrypoint-1.53.10-pr89');
  entrypoint.applyEnv();
  entrypoint.installCleanBot();
  const bot = require('../bot');
  const sent = [];
  maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.getChat = async () => ({ title: 'Тестовый канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });

  const nonAdmin = await sendBot(bot, sent, messageUpdate('pr108-normal', '/admin'));
  assert.strictEqual(nonAdmin.res.body.screenId, 'pr108_admin_denied', 'non-admin /admin is denied');
  assert.ok(/Недоступно/.test(nonAdmin.text), 'non-admin denial is friendly');

  const maxPrivateNonAdmin = await sendBot(bot, sent, messageUpdate('pr108-normal', '/admin', 'chat', 'visible-private-chat-108', { user_id: 'pr108-normal' }));
  assert.strictEqual(maxPrivateNonAdmin.res.body.screenId, 'pr108_admin_denied', 'non-admin /admin in MAX private recipient.user_id dialog is denied');
  assert.strictEqual(maxPrivateNonAdmin.res.body.privateChatRequired, false, 'non-admin MAX private recipient.user_id dialog must pass private-chat detection before admin validation');

  process.env.DEBUG_ADMIN_ID = 'pr108-debug-admin';
  assert.strictEqual(access.isAdmin('pr108-debug-admin'), true, 'DEBUG_ADMIN_ID must be honored alongside ADMINKIT_ADMIN_MAX_USER_IDS');
  delete process.env.DEBUG_ADMIN_ID;

  const admin = await sendBot(bot, sent, messageUpdate('pr108-admin', '/admin'));
  assert.strictEqual(admin.res.body.screenId, 'pr108_admin_panel', 'explicit env admin can open /admin in private chat');
  assert.deepStrictEqual(admin.labels, ['Создать код', 'Коды доступа', 'Клиенты / tenants', 'Главное меню'], 'admin panel buttons');

  const maxPrivateAdmin = await sendBot(bot, sent, messageUpdate('pr108-admin', '/admin', 'chat', 'visible-private-chat-108', { user_id: 'pr108-admin' }));
  assert.strictEqual(maxPrivateAdmin.res.body.screenId, 'pr108_admin_panel', 'explicit env admin can open /admin in MAX private recipient.user_id dialog');
  assert.strictEqual(maxPrivateAdmin.res.body.privateChatRequired, false, 'MAX private recipient.user_id dialog is recognized as private');

  const dialogAdmin = await sendBot(bot, sent, messageUpdate('pr108-admin', '/admin', 'dialog', 'dialog-chat-108'));
  assert.strictEqual(dialogAdmin.res.body.screenId, 'pr108_admin_panel', 'explicit env admin can open /admin in MAX dialog chat_type');

  const plainChatAdmin = await sendBot(bot, sent, messageUpdate('pr108-admin', '/admin', 'chat', 'plain-chat-108'));
  assert.strictEqual(plainChatAdmin.res.body.screenId, 'pr108_admin_private_chat_required', 'plain chat_type=chat without recipient.user_id is not enough for private admin access');

  const groupAdmin = await sendBot(bot, sent, messageUpdate('pr108-admin', '/admin', 'group', 'group-chat-108'));
  assert.strictEqual(groupAdmin.res.body.screenId, 'pr108_admin_private_chat_required', 'admin /admin in group/shared chat must not open admin panel');
  assert.ok(/личном чате/.test(groupAdmin.text), 'group /admin gets safe private-chat message');
  assert.ok(!groupAdmin.labels.includes('Создать код'), 'group /admin must not show admin buttons');

  const channelAdmin = await sendBot(bot, sent, messageUpdate('pr108-admin', '/admin', 'channel', '-channel-108'));
  assert.strictEqual(channelAdmin.res.body.screenId, 'pr108_admin_private_chat_required', 'admin /admin in channel must not open admin panel');
  assert.ok(/личном чате/.test(channelAdmin.text), 'channel /admin gets safe private-chat message');

  const beforeGroupCallbackCodes = access.listActivationCodes({ limit: 100 }).length;
  const beforeGroupSent = sent.length;
  const groupCreate = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_confirm_create', planId: 'pro', durationDays: 14, maxChannels: 5 }, 'group', 'group-chat-108'));
  assert.strictEqual(groupCreate.res.body.screenId, 'pr108_admin_private_chat_required', 'admin create callback in group/shared chat must be blocked');
  assert.strictEqual(access.listActivationCodes({ limit: 100 }).length, beforeGroupCallbackCodes, 'group admin callback must not create a code');
  const groupTexts = sent.slice(beforeGroupSent).map((call) => String(call.text || '')).join('\n');
  assert.ok(!/AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}/.test(groupTexts), 'raw activation code must not be sent to group/shared chat');

  const beforeChannelCallbackCodes = access.listActivationCodes({ limit: 100 }).length;
  const beforeChannelSent = sent.length;
  const channelCreate = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_confirm_create', planId: 'pro', durationDays: 14, maxChannels: 5 }, 'channel', '-channel-108'));
  assert.strictEqual(channelCreate.res.body.screenId, 'pr108_admin_private_chat_required', 'admin create callback in channel must be blocked');
  assert.strictEqual(access.listActivationCodes({ limit: 100 }).length, beforeChannelCallbackCodes, 'channel admin callback must not create a code');
  const channelTexts = sent.slice(beforeChannelSent).map((call) => String(call.text || '')).join('\n');
  assert.ok(!/AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}/.test(channelTexts), 'raw activation code must not be sent to channel');

  const durationScreen = adminScreens.screenForAction('admin_code_plan_start', 'pr108-admin', {});
  assert.ok(!labels(durationScreen).includes('Ввести вручную'), 'admin create duration screen must not include manual input');
  const channelsScreen = adminScreens.screenForAction('admin_code_duration_30', 'pr108-admin', { planId: 'start' });
  assert.ok(!labels(channelsScreen).includes('Ввести вручную'), 'admin create channels screen must not include manual input');
  const bindScreen = adminScreens.screenForAction('admin_code_channels_3', 'pr108-admin', { planId: 'start', durationDays: 30 });
  assert.ok(!labels(bindScreen).includes('Привязать к channelId вручную'), 'admin bind screen must not include manual channel binding');

  const beforeStaleManualCodes = access.listActivationCodes({ limit: 100 }).length;
  const staleDuration = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_duration_manual', planId: 'start' }));
  assert.strictEqual(staleDuration.res.body.screenId, 'pr108_admin_manual_deferred', 'stale manual duration action must not confirm with default 30 days');
  assert.ok(/Ручной ввод будет добавлен позже/.test(staleDuration.text), 'stale manual duration gets friendly deferred message');
  assert.deepStrictEqual(staleDuration.labels, ['Создать код', 'Админ-панель'], 'stale manual duration buttons');
  assert.strictEqual(access.listActivationCodes({ limit: 100 }).length, beforeStaleManualCodes, 'stale manual duration must not create a code');

  const staleChannels = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_channels_manual', planId: 'start', durationDays: 30 }));
  assert.strictEqual(staleChannels.res.body.screenId, 'pr108_admin_manual_deferred', 'stale manual channel action must not confirm with default 1 channel');
  assert.strictEqual(access.listActivationCodes({ limit: 100 }).length, beforeStaleManualCodes, 'stale manual channels must not create a code');

  const staleBind = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_bind_manual', planId: 'start', durationDays: 30, maxChannels: 3 }));
  assert.strictEqual(staleBind.res.body.screenId, 'pr108_admin_manual_deferred', 'stale manual bind action must not confirm empty channel binding');
  assert.strictEqual(access.listActivationCodes({ limit: 100 }).length, beforeStaleManualCodes, 'stale manual bind must not create a code');

  const staleInvalidDuration = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_duration_31', planId: 'start' }));
  assert.strictEqual(staleInvalidDuration.res.body.screenId, 'pr108_admin_manual_deferred', 'invalid duration callback must not default to 30 days');
  const staleInvalidChannels = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_channels_2', planId: 'start', durationDays: 30 }));
  assert.strictEqual(staleInvalidChannels.res.body.screenId, 'pr108_admin_manual_deferred', 'invalid channel callback must not default to 1 channel');
  const staleDirectCreate = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_confirm_create', planId: 'start' }));
  assert.strictEqual(staleDirectCreate.res.body.screenId, 'pr108_admin_manual_deferred', 'malformed direct create callback must not create default code');
  const staleBoundConfirm = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_bind_none', planId: 'start', durationDays: 30, maxChannels: 3, boundChannelId: 'stale-channel' }));
  assert.strictEqual(staleBoundConfirm.res.body.screenId, 'pr108_admin_code_confirm', 'bind none must sanitize stale boundChannelId before confirm');
  assert.ok(!/stale-channel/.test(staleBoundConfirm.text), 'bind none confirm must not preserve stale boundChannelId');
  const staleBoundCreate = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_confirm_create', planId: 'start', durationDays: 30, maxChannels: 3, boundChannelId: 'stale-channel' }));
  assert.strictEqual(staleBoundCreate.res.body.screenId, 'pr108_admin_manual_deferred', 'direct create with boundChannelId must not create a bound code');
  assert.strictEqual(access.listActivationCodes({ limit: 100 }).length, beforeStaleManualCodes, 'invalid stale callbacks must not create codes');

  const created = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 3, createdByMaxUserId: 'pr108-admin' });
  assert.ok(/^AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(created.code), 'admin can create production-safe activation code');
  const rawCode = created.code;
  assert.strictEqual(created.planId, 'start', 'created code plan');

  const listed = access.listActivationCodes({ limit: 10 });
  assert.ok(listed.some((item) => item.codeHashPrefix === created.codeHashPrefix), 'created code is in safe list');
  assert.ok(!JSON.stringify(listed).includes(rawCode), 'list codes shows masked/safe code only, not raw code');
  assert.ok(listed.every((item) => item.safeCodeLabel && !item.codeHash), 'list omits full code hash');
  assert.strictEqual(access.getActivationCodeInfo({ codeHashOrSafeId: created.codeHashPrefix }).code, undefined, 'raw activation code is returned only on creation');
  const stored = access.getActivationCode(rawCode);
  assert.ok(stored.codeHash && stored.codeHash !== rawCode, 'code is stored hashed');
  assert.ok(!JSON.stringify(access.sanitizedSnapshot()).includes(rawCode), 'sanitized snapshot does not leak raw code');

  const activation = access.activateCode({ maxUserId: 'pr108-client', name: 'Client', code: rawCode });
  assert.strictEqual(activation.ok, true, 'created code can activate a new user');
  assert.strictEqual(access.activateCode({ maxUserId: 'pr108-client-2', code: rawCode }).ok, false, 'single-use code cannot be reused');
  const tenant = access.getTenantByMaxUserId('pr108-client');
  assert.ok(tenant?.tenantId, 'code creates tenant/client in repository');
  assert.strictEqual(tenant.planId, 'start', 'tenant gets correct plan');
  assert.strictEqual(tenant.maxChannels, 3, 'tenant gets correct maxChannels');
  assert.ok(Date.parse(tenant.expiresAt) > Date.now(), 'tenant gets expiry');
  assert.ok(access.getAccessEvents(tenant.tenantId).some((event) => event.eventType === 'code_activated'), 'access event is written');

  const revoked = access.createActivationCode({ planId: 'pro', durationDays: 7, maxChannels: 5, createdByMaxUserId: 'pr108-admin' });
  access.revokeActivationCode({ codeHashOrSafeId: revoked.codeHashPrefix, revokedByMaxUserId: 'pr108-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr108-revoked-client', code: revoked.code }).ok, false, 'revoked code cannot be activated');

  const expired = access.createActivationCode({ planId: 'business', durationDays: 7, maxChannels: 10, expiresAt: '2000-01-01T00:00:00.000Z', createdByMaxUserId: 'pr108-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr108-expired-client', code: expired.code }).ok, false, 'expired code cannot be activated');

  const versionRoutes = {};
  const fakeApp = { get(route, handler) { versionRoutes[route] = handler; return this; } };
  routes.install(fakeApp);
  const versionRes = createRouteRes();
  versionRoutes['/debug/version']({}, versionRes);
  const version = JSON.parse(versionRes.body);
  assert.strictEqual(version.adminAccessRuntimeVersion, access.ADMIN_ACCESS_RUNTIME, '/debug/version includes PR108 marker');
  assert.strictEqual(version.accessRuntimeVersion, access.RUNTIME, '/debug/version keeps PR106 marker');
  assert.strictEqual(version.menuCanonicalVersion, canonical.VERSION, '/debug/version keeps PR105 menu marker');
  assert.strictEqual(version.adminActivationCodesReady, true, '/debug/version adminActivationCodesReady');
  assert.strictEqual(version.adminCodeToolsHiddenFromClient, true, '/debug/version adminCodeToolsHiddenFromClient');
  assert.ok(!JSON.stringify(version).includes(rawCode), '/debug/version does not leak raw code');

  const auditRes = createRouteRes();
  versionRoutes['/debug/menu/audit']({}, auditRes);
  const audit = JSON.parse(auditRes.body);
  assert.strictEqual(audit.visibleMainMenuTotal, 12, '/debug/menu/audit keeps 12 sections');
  assert.strictEqual(audit.checks.noDebugTopLevel, true, '/debug/menu/audit noDebugTopLevel');
  assert.strictEqual(audit.checks.noTechnicalIdsVisible, true, '/debug/menu/audit noTechnicalIdsVisible');
  assert.strictEqual(audit.accessGateEnabled, true, '/debug/menu/audit accessGateEnabled');
  assert.strictEqual(audit.accountSectionReady, true, '/debug/menu/audit accountSectionReady');

  access.createClientProfile({ maxUserId: 'pr108-active-menu', planId: 'business', status: 'active', expiresAt: '2099-01-01T00:00:00.000Z', maxChannels: 20 });
  assert.strictEqual(labels(accountScreens.gateMenuForUser('pr108-active-menu')).length, 12, 'client main menu still has 12 sections for active user');
  assert.deepStrictEqual(labels(accountScreens.gateMenuForUser('pr108-no-access')), ['Активировать код', 'Что умеет АдминКИТ', 'Поддержка'], 'normal no-access user still sees activation screen');
  assert.ok(!labels(accountScreens.gateMenuForUser('pr108-active-menu')).some((label) => /Admin|Debug|Коды доступа|GitHub export/i.test(label)), 'admin tools are hidden from client menu');

  const adminFlow = await sendBot(bot, sent, callbackUpdate('pr108-admin', { action: 'admin_code_confirm_create', planId: 'pro', durationDays: 14, maxChannels: 5 }));
  assert.strictEqual(adminFlow.res.body.screenId, 'pr108_admin_code_created', 'admin bot flow creates code');
  assert.ok(/Код создан: AK-/.test(adminFlow.text), 'admin sees generated raw code once');
  const flowRaw = adminFlow.text.match(/AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}/)[0];
  const listScreen = adminScreens.codesListScreen('pr108-admin');
  assert.ok(!JSON.stringify(listScreen).includes(flowRaw), 'admin code list does not show raw created code');
  const tenantScreen = adminScreens.tenantDetailsScreen ? adminScreens.tenantDetailsScreen('pr108-admin', tenant.tenantId) : adminScreens.screenForAction('admin_tenant_details', 'pr108-admin', { tenantId: tenant.tenantId });
  assert.ok(/Recent access events/.test(tenantScreen.text), 'admin can inspect client/tenant after activation');

  console.log('PR108 admin activation code tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
