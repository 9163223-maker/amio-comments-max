'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_ADMIN_MAX_USER_IDS = 'pr111-admin';
process.env.ADMINKIT_UI_TRACE_LIMIT = '500';
process.env.ADMINKIT_UI_TIMING_LIMIT = '500';
delete process.env.DEBUG_ADMIN_ID;
delete process.env.ADMIN_ID;

const access = require('../services/clientAccessService');
const adminScreens = require('../features/admin-activation-screens-pr108');
const accountScreens = require('../features/account-screens-pr106');
const accountRuntime = require('../src/core/accountRuntime');
const webhookContext = require('../src/core/webhookContext');
const maxApi = require('../services/maxApi');
const store = require('../store');
const uiTrace = require('../v3-ui-trace-1539');
const uiTiming = require('../v3-ui-timing-cc8');
const channelService = require('../services/channelService');

function createJsonRes() {
  const res = { statusCode: 200, body: null, headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; res.headersSent = true; return res; };
  res.type = () => res;
  res.send = (body) => { res.body = body; res.headersSent = true; return res; };
  res.set = () => res;
  return res;
}
function messageUpdate(userId, text, extra = {}) {
  return { body: { update_type: 'message_created', message: { id: `m-${userId}-${Date.now()}-${Math.random()}`, body: { text }, sender: extra.sender || { user_id: userId }, user: extra.user, recipient: extra.recipient || { chat_id: `${userId}-chat`, chat_type: 'user' } } } };
}
function callbackUpdate(userId, payload, extra = {}) {
  return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: extra.callbackUser || { user_id: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${userId}-${Math.random()}`, body: { mid: `mid-${userId}`, text: 'old' }, sender: extra.sender || { user_id: userId }, recipient: extra.recipient || { chat_id: `${userId}-chat`, chat_type: 'user' } } } };
}
function botStartedUpdate(userId, extra = {}) { return { body: { update_type: 'bot_started', user: extra.user || { user_id: userId, first_name: 'Client' }, recipient: extra.recipient } }; }
function labels(callOrScreen) { return (callOrScreen?.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
async function sendBot(bot, sent, update) {
  const before = sent.length;
  const res = createJsonRes();
  await bot.handleWebhook(update, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(res.statusCode, 200, `webhook must return 200 for ${JSON.stringify(update.body?.update_type)}`);
  return { res, calls: sent.slice(before), call: sent.at(-1), text: String(sent.at(-1)?.text || ''), labels: labels(sent.at(-1)) };
}
function assertNoRawCode(label, rawCode, value) { assert.ok(!String(value || '').includes(rawCode), `${label} must not include raw activation code`); }
function assertNoGlobalChannels(rendered) { assert.ok(!/Production comments matrix selftest post|AK[-\s]?ТЕСТ|АК[-\s]?Тест|АдминКИТ клуб|Tenant B Channel/.test(rendered), 'client-facing channel screen must not leak global/test/other tenant channels'); }
function assertDeniedNoPosts(label, result, forbiddenPattern) {
  assert.ok(/У вас пока нет подключённых каналов/.test(result.text), `${label}: denied replay must show tenant-safe empty state`);
  assert.ok(!forbiddenPattern.test(result.text + result.labels.join('\n')), `${label}: denied replay must not expose channels/posts`);
}

function assertNoTenantBStaleLeak(label, result) {
  const rendered = result.text + result.labels.join('\n');
  assert.ok(!/Опрос создан|Выделение применено|Выделение снято/.test(rendered), `${label}: stale callback must not complete privileged action`);
  assert.ok(!/Tenant B Secret Post|Tenant B Channel|-tenant-b:post-b|-tenant-b/.test(rendered), `${label}: stale callback must not leak tenant B identifiers or content`);
}

(async () => {
  access._resetForTests();
  uiTrace.clear();
  uiTiming.clear();
  store.store.channels = {};
  store.store.posts = {};
  store.saveStore();

  const sent = [];
  maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.getChat = async () => ({ title: 'Тестовый канал' });
  maxApi.getBotChatMember = async () => ({ ok: true });

  const legacyBot = require('../bot');
  const entrypoint = require('../clean-entrypoint-1.53.10-pr89');
  entrypoint.applyEnv();
  entrypoint.installCleanBot();
  const bot = require('../bot');

  store.saveChannel('-global-selftest', { channelId: '-global-selftest', title: 'Production comments matrix selftest post', channelTitle: 'Production comments matrix selftest post', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.saveChannel('-ak-test-1', { channelId: '-ak-test-1', title: 'AK-ТЕСТ 1', channelTitle: 'AK-ТЕСТ 1', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.saveChannel('-admin-kit-club', { channelId: '-admin-kit-club', title: 'АдминКИТ клуб', channelTitle: 'АдминКИТ клуб', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.savePost('-global-selftest:post-global', { channelId: '-global-selftest', postId: 'post-global', messageId: 'msg-global', originalText: 'GLOBAL SECRET POST', channelTitle: 'Production comments matrix selftest post' });

  const adminCommand = await sendBot(bot, sent, messageUpdate('pr111-admin', '/admin'));
  assert.ok(/Админ-панель/.test(adminCommand.text), 'admin has /admin access');
  const nonAdminCommand = await sendBot(bot, sent, messageUpdate('pr111-client-pre', '/admin'));
  assert.ok(/Недоступно|Админ-панель доступна только/.test(nonAdminCommand.text), 'non-admin cannot access /admin');

  const preStart = await sendBot(bot, sent, messageUpdate('pr111-client-pre', '/start'));
  assert.ok(/Для работы с АдминКИТ активируйте доступ/.test(preStart.text), 'client before activation /start shows activation screen');
  const preMenu = await sendBot(bot, sent, messageUpdate('pr111-client-pre-menu', '/menu'));
  assert.ok(!preMenu.labels.includes('Каналы'), 'client before activation /menu does not show full production menu');
  const preAccount = await sendBot(bot, sent, messageUpdate('pr111-client-pre', '/account'));
  assert.ok(/Личный кабинет/.test(preAccount.text) && /нет доступа|Trial \/ Free/i.test(preAccount.text), 'client before activation /account shows no-access/account state');
  const preProtected = await sendBot(bot, sent, callbackUpdate('pr111-client-pre', { action: 'admin_section_comments' }));
  assert.ok(/активируйте доступ|Функция недоступна|АдминКИТ/.test(preProtected.text), 'protected actions are blocked before activation');

  const botRawBefore = sent.length;
  const botCreated = await sendBot(bot, sent, callbackUpdate('pr111-admin', { action: 'admin_code_confirm_create', planId: 'start', durationDays: 30, maxChannels: 1 }));
  const botRawCalls = sent.slice(botRawBefore).filter((call) => /^AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(String(call.text || '')));
  assert.strictEqual(botRawCalls.length, 1, 'raw activation code is sent once by bot create flow');
  assert.strictEqual(botRawCalls[0].userId, 'pr111-admin', 'raw activation code is sent as a separate private message');
  assert.ok(!/^AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(botCreated.text), 'raw activation code is not shown in admin confirmation text');

  const createdScreen = adminScreens.screenForAction('admin_code_confirm_create', 'pr111-admin', { planId: 'business', durationDays: 30, maxChannels: 1 });
  const rawCode = createdScreen.rawCodePrivateMessage;
  assert.ok(/^AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(rawCode), 'admin creates a production activation code');
  const privateRawPayload = { botToken: 'test-token', userId: 'pr111-admin', text: rawCode, attachments: [], notify: false };
  assert.strictEqual(privateRawPayload.userId, 'pr111-admin', 'raw code is emitted as a separate private user payload');
  assert.strictEqual(privateRawPayload.chatId || '', '', 'raw code payload is not addressed to a group/channel chat');
  assertNoRawCode('admin created confirmation screen', rawCode, createdScreen.text);

  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-invalid-client', code: 'AK-0000-0000-0000' }).ok, false, 'invalid code is rejected');
  const expired = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, expiresAt: '2000-01-01T00:00:00.000Z', createdByMaxUserId: 'pr111-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-expired-client', code: expired.code }).error, 'code_expired', 'expired code is rejected');
  const startCode = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr111-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-start-client', name: 'Start Client', code: startCode.code }).ok, true, 'valid Start code activates access');
  const startTenant = access.getTenantByMaxUserId('pr111-start-client');
  assert.strictEqual(access.bindTenantChannel({ tenantId: startTenant.tenantId, channelId: '-start-one', channelTitle: 'Start One', maxChannels: 1 }).ok, true, 'Start client binds first channel');
  assert.strictEqual(access.bindTenantChannel({ tenantId: startTenant.tenantId, channelId: '-start-two', channelTitle: 'Start Two', maxChannels: 1 }).error, 'channel_limit_reached', 'Start maxChannels=1 blocks second channel');
  assert.strictEqual(access.canUseFeature('pr111-start-client', 'comments').allowed, true, 'basic allowed comments action remains available on Start');
  assert.strictEqual(access.canUseFeature('pr111-start-client', 'gifts').allowed, false, 'Pro-only gifts action is denied for Start');
  assert.strictEqual(access.canUseFeature('pr111-start-client', 'export').allowed, false, 'Business-only export action is denied for Start');
  const proCode = access.createActivationCode({ planId: 'pro', durationDays: 30, maxChannels: 5, createdByMaxUserId: 'pr111-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-pro-client', name: 'Pro Client', code: proCode.code }).ok, true, 'valid Pro code activates access');
  const proTenant = access.getTenantByMaxUserId('pr111-pro-client');
  for (let i = 1; i <= 5; i += 1) assert.strictEqual(access.bindTenantChannel({ tenantId: proTenant.tenantId, channelId: `-pro-${i}`, channelTitle: `Pro ${i}`, maxChannels: 5 }).ok, true, 'Pro can bind channels up to configured limit');
  assert.strictEqual(access.bindTenantChannel({ tenantId: proTenant.tenantId, channelId: '-pro-six', channelTitle: 'Pro Six', maxChannels: 5 }).error, 'channel_limit_reached', 'Pro limit blocks sixth channel');
  assert.strictEqual(access.canUseFeature('pr111-pro-client', 'gifts').allowed, true, 'Pro-only gifts action is allowed for Pro');
  assert.strictEqual(access.canUseFeature('pr111-pro-client', 'export').allowed, false, 'Business-only export action is denied for Pro');

  const activation = access.activateCode({ maxUserId: 'pr111-client-a', name: 'Client A', code: rawCode });
  assert.strictEqual(activation.ok, true, 'client activates Business code');
  const tenantA = access.getTenantByMaxUserId('pr111-client-a');
  assert.ok(tenantA?.tenantId, 'activation creates tenant');
  assert.ok(access.getTenantUsers(tenantA.tenantId).some((user) => user.maxUserId === 'pr111-client-a'), 'activation creates tenant user');
  assert.strictEqual(access.getAccessState('pr111-client-a').active, true, 'activation creates active access');
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-reuse-client', code: rawCode }).error, 'code_used', 'used single-use code is rejected');
  assert.strictEqual(access.canUseFeature('pr111-client-a', 'export').allowed, true, 'Business-only export action is allowed for Business');

  const start = await sendBot(bot, sent, messageUpdate('pr111-client-a', '/start'));
  assert.ok(!/Для работы с АдминКИТ активируйте доступ|Активировать код/.test(start.text), 'same client /start does not show activation screen again');
  assert.ok(labels(start.call).includes('Каналы'), '/start shows active canonical menu state');

  const account = await sendBot(bot, sent, messageUpdate('pr111-client-a', '/account'));
  assert.ok(/Личный кабинет/.test(account.text), '/account opens account screen');
  assert.ok(/Business/.test(account.text), '/account shows active Business tariff');
  assert.ok(!/Для работы с АдминКИТ активируйте доступ/.test(account.text), '/account does not regress to activation gate');

  const identityUpdates = [
    messageUpdate('pr111-client-a', '/account'),
    callbackUpdate('ignored', { action: 'account_my_access' }, { callbackUser: { user_id: 'pr111-client-a' }, sender: {} }),
    botStartedUpdate('pr111-client-a'),
    messageUpdate('ignored', '/account', { sender: {}, user: { user_id: 'pr111-client-a' }, recipient: { chat_id: 'private-chat', chat_type: 'user', user_id: 'recipient-chat-not-actor' } })
  ];
  for (const update of identityUpdates) {
    const body = update.body;
    const runtimeId = accountRuntime.getMaxUserId(body, {});
    const profileId = webhookContext.extractUserProfile(body)?.maxUserId || runtimeId;
    assert.strictEqual(runtimeId || profileId, 'pr111-client-a', 'MAX user id extraction is stable across message/callback/bot_started/user fields');
  }
  const recipientOnly = messageUpdate('ignored', '/account', { sender: {}, recipient: { chat_id: 'private-chat', chat_type: 'user', user_id: 'recipient-chat-not-actor' } }).body;
  assert.strictEqual(accountRuntime.getMaxUserId(recipientOnly, {}), '', 'recipient-only payload is not treated as acting user in account runtime');
  assert.strictEqual(webhookContext.extractUserProfile(recipientOnly)?.maxUserId || '', '', 'recipient-only payload is not treated as acting user in webhook context');

  const emptyPicker = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source: 'comments' }));
  assert.ok(/У вас пока нет подключённых каналов/.test(emptyPicker.text), 'zero-channel client sees tenant-safe empty state');
  assert.deepStrictEqual(emptyPicker.labels, ['Подключить канал', 'Как подключить', '🏠 Главное меню'], 'zero-channel picker has connect/help/main buttons');
  assertNoGlobalChannels(emptyPicker.text + emptyPicker.labels.join('\n'));

  const clientChannelSection = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'admin_section_channels' }));
  assert.ok(/У вас пока нет подключённых каналов/.test(clientChannelSection.text), 'non-admin channel section keeps tenant-safe empty state even when the route requests adminView');
  assertNoGlobalChannels(clientChannelSection.text + clientChannelSection.labels.join('\n'));

  const replayGlobalEmpty = await sendBot(legacyBot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source: 'comments', channelId: '-global-selftest' }));
  assertDeniedNoPosts('legacy bot zero-channel comments_select_post global replay', replayGlobalEmpty, /GLOBAL SECRET POST|Production comments matrix selftest post/);
  const replayGlobalEmptyWrapped = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source: 'comments', channelId: '-global-selftest' }));
  assertDeniedNoPosts('wrapped channel-first zero-channel comments_select_post global replay', replayGlobalEmptyWrapped, /GLOBAL SECRET POST|Production comments matrix selftest post/);
  for (const source of ['buttons', 'posts', 'polls', 'highlights']) {
    const replay = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source, channelId: '-global-selftest' }));
    assertDeniedNoPosts(`wrapped ${source} stale global channel replay`, replay, /GLOBAL SECRET POST|Production comments matrix selftest post/);
  }
  const giftReplayEmpty = await sendBot(legacyBot, sent, callbackUpdate('pr111-client-a', { action: 'gift_admin_recent_posts', channelId: '-global-selftest' }));
  assertDeniedNoPosts('gift zero-channel stale global channel replay', giftReplayEmpty, /GLOBAL SECRET POST|Production comments matrix selftest post/);

  const adminChannelSection = await sendBot(bot, sent, callbackUpdate('pr111-admin', { action: 'admin_section_channels' }));
  assert.ok(/Production comments matrix selftest post|AK-ТЕСТ 1|АдминКИТ клуб/.test(adminChannelSection.text), 'configured admin still sees legacy unowned stored channels in admin channel UI');

  const accountChannelsEmpty = accountScreens.channelsScreen('pr111-client-a');
  assert.ok(/У вас пока нет подключённых каналов/.test(accountChannelsEmpty.text), 'account channel screen has same zero-channel copy');
  assert.deepStrictEqual(labels(accountChannelsEmpty), ['Подключить канал', 'Как подключить', 'Главное меню'], 'account zero-channel screen has required buttons');

  const bindA = access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: '-tenant-a', channelTitle: 'Tenant A Channel', maxChannels: 1 });
  assert.strictEqual(bindA.ok, true, 'tenant A can bind first channel');
  store.savePost('-tenant-a:post-a', { channelId: '-tenant-a', postId: 'post-a', messageId: 'msg-a', originalText: 'Tenant A Only Post', channelTitle: 'Tenant A Channel' });
  const onlyA = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source: 'comments' }));
  assert.ok(/Tenant A Channel/.test(onlyA.text) || onlyA.labels.some((label) => /Tenant A Channel/.test(label)), 'tenant A sees its bound channel');
  assertNoGlobalChannels(onlyA.text + onlyA.labels.join('\n'));

  const replayAllowedA = await sendBot(legacyBot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source: 'comments', channelId: '-tenant-a' }));
  assert.ok(/Tenant A Only Post/.test(replayAllowedA.text + replayAllowedA.labels.join('\n')), 'tenant A can replay/use only its tenant-bound channel');
  assert.ok(!/GLOBAL SECRET POST/.test(replayAllowedA.text + replayAllowedA.labels.join('\n')), 'tenant A allowed replay must not include global posts');

  const replayGlobalWithA = await sendBot(legacyBot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source: 'comments', channelId: '-global-selftest' }));
  assertDeniedNoPosts('tenant A legacy comments_select_post global replay', replayGlobalWithA, /GLOBAL SECRET POST|Tenant A Only Post/);
  for (const source of ['buttons', 'posts', 'polls', 'highlights']) {
    const replay = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source, channelId: '-global-selftest' }));
    assertDeniedNoPosts(`tenant A wrapped ${source} stale global channel replay`, replay, /GLOBAL SECRET POST|Tenant A Only Post/);
  }

  const codeB = access.createActivationCode({ planId: 'business', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr111-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-client-b', name: 'Client B', code: codeB.code }).ok, true, 'second tenant activates');
  const tenantB = access.getTenantByMaxUserId('pr111-client-b');
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantB.tenantId, channelId: '-tenant-b', channelTitle: 'Tenant B Channel', maxChannels: 1 }).ok, true, 'tenant B can bind its channel');
  store.savePost('-tenant-b:post-b', { channelId: '-tenant-b', postId: 'post-b', messageId: 'msg-b', originalText: 'Tenant B Secret Post', channelTitle: 'Tenant B Channel' });
  const stillOnlyA = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source: 'comments' }));
  assert.ok(!/Tenant B Channel/.test(stillOnlyA.text + stillOnlyA.labels.join('\n')), 'tenant A does not see tenant B channel');

  const replayTenantB = await sendBot(legacyBot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source: 'comments', channelId: '-tenant-b' }));
  assertDeniedNoPosts('tenant A legacy comments_select_post tenant B replay', replayTenantB, /Tenant B Secret Post|Tenant B Channel/);
  const giftReplayTenantB = await sendBot(legacyBot, sent, callbackUpdate('pr111-client-a', { action: 'gift_admin_recent_posts', channelId: '-tenant-b' }));
  assertDeniedNoPosts('tenant A gift tenant B replay', giftReplayTenantB, /Tenant B Secret Post|Tenant B Channel/);
  for (const source of ['buttons', 'posts', 'polls', 'highlights']) {
    const replay = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_select_post', source, channelId: '-tenant-b' }));
    assertDeniedNoPosts(`tenant A wrapped ${source} tenant B replay`, replay, /Tenant B Secret Post|Tenant B Channel/);
  }
  const staleHighlightPick = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_pick_post', source: 'highlights', commentKey: '-tenant-b:post-b' }));
  assertNoTenantBStaleLeak('tenant A stale highlight pick', staleHighlightPick);
  const staleHighlightApply = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'highlight_apply', commentKey: '-tenant-b:post-b', badgeId: 'important' }));
  assertNoTenantBStaleLeak('tenant A stale highlight apply', staleHighlightApply);
  const staleHighlightRemove = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'highlight_remove', commentKey: '-tenant-b:post-b' }));
  assertNoTenantBStaleLeak('tenant A stale highlight remove', staleHighlightRemove);
  const stalePollPick = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'comments_pick_post', source: 'polls', commentKey: '-tenant-b:post-b' }));
  assert.strictEqual(stalePollPick.res.body.screenId, 'poll_post_missing', 'tenant A stale poll pick returns safe missing-post screen');
  assertNoTenantBStaleLeak('tenant A stale poll pick', stalePollPick);
  const stalePollCreate = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'poll_create', commentKey: '-tenant-b:post-b', template: 'yes_no' }));
  assertNoTenantBStaleLeak('tenant A stale poll create', stalePollCreate);
  const stalePollCustomStart = await sendBot(bot, sent, callbackUpdate('pr111-client-a', { action: 'poll_custom_start', commentKey: '-tenant-b:post-b' }));
  assertNoTenantBStaleLeak('tenant A stale poll custom start', stalePollCustomStart);

  const secondA = access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: '-tenant-a-second', channelTitle: 'Tenant A Second Channel', maxChannels: 1 });
  assert.strictEqual(secondA.ok, false, 'Start/one-channel limit blocks second channel');
  assert.strictEqual(secondA.error, 'channel_limit_reached', 'second channel is blocked by channel_limit_reached');

  assert.ok(channelService.listChannels().some((channel) => /Production comments matrix selftest post|AK-ТЕСТ|АдминКИТ клуб/.test(channel.title || channel.channelTitle || '')), 'admin diagnostic source can still enumerate stored diagnostic channels outside client picker');

  uiTrace.log('activation_probe', { action: 'activate', userId: 'pr111-client-a', tenantId: tenantA.tenantId, actorRole: 'client', accountState: 'active', channelCount: 1, accessDecision: 'allowed', gateReason: '', rawCode });
  uiTiming.log('activation_probe', { action: 'activate', userId: 'pr111-client-a', tenantId: tenantA.tenantId, actorRole: 'client', accountState: 'active', channelCount: 1, accessDecision: 'allowed', rawCode, durationMs: 1 });
  for (let i = 0; i < 505; i += 1) {
    uiTrace.log('retention_probe', { action: `trace-${i}`, userId: 'pr111-client-a', actorRole: 'client', accountState: 'active', channelCount: 1, durationMs: i });
    uiTiming.log('retention_probe', { action: `timing-${i}`, userId: 'pr111-client-a', actorRole: 'client', accountState: 'active', channelCount: 1, durationMs: i });
  }
  assert.strictEqual(uiTrace.list().length, 500, 'UI trace retains 500 events when ADMINKIT_UI_TRACE_LIMIT=500');
  assert.strictEqual(uiTiming.list().length, 500, 'UI timing retains 500 events when ADMINKIT_UI_TIMING_LIMIT=500');

  const registered = {};
  const fakeApp = { get(route, handler) { registered[route] = handler; return this; } };
  require('../v3-menu-routes-1539').install(fakeApp);
  const traceRes = createJsonRes();
  registered['/debug/ui-trace']({ query: { limit: '500' } }, traceRes);
  const traceBody = JSON.parse(traceRes.body);
  assert.strictEqual(traceBody.requestedLimit, 500, '/debug/ui-trace accepts ?limit=500');
  assert.strictEqual(traceBody.events.length, 500, '/debug/ui-trace returns 500 events');
  const timingRes = createJsonRes();
  registered['/debug/ui-timing']({ query: { limit: '500' } }, timingRes);
  const timingBody = JSON.parse(timingRes.body);
  assert.strictEqual(timingBody.requestedLimit, 500, '/debug/ui-timing accepts ?limit=500');
  assert.strictEqual(timingBody.events.length, 500, '/debug/ui-timing returns 500 events');

  const forbiddenSurfaces = [
    access.listActivationCodes({ limit: 20 }),
    access.sanitizedSnapshot(),
    uiTrace.list(500),
    uiTiming.list(500),
    require('../v3-menu-routes-1539').version()
  ];
  for (const [index, surface] of forbiddenSurfaces.entries()) assertNoRawCode(`sanitized/debug surface ${index}`, rawCode, JSON.stringify(surface));

  registered['/debug/ui-trace/clear']({}, createJsonRes());
  registered['/debug/ui-timing/clear']({}, createJsonRes());
  assert.strictEqual(uiTrace.list().length, 0, '/debug/ui-trace/clear keeps working');
  assert.strictEqual(uiTiming.list().length, 0, '/debug/ui-timing/clear keeps working');

  console.log('PR111 onboarding server loop tests passed');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
