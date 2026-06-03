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
const accessGate = require('../services/accessGateService');
const webhookContext = require('../src/core/webhookContext');
const store = require('../store');
const maxApi = require('../services/maxApi');
const menu = require('../v3-menu-core-1539');
const trace = require('../v3-ui-trace-1539');
const timing = require('../v3-ui-timing-cc8');
const routes = require('../v3-menu-routes-1539');
const buttonsFlow = require('../buttons-flow-cc8-clean');
const giftsFlow = require('../gifts-flow-cc812-bottom');
const postsFlow = require('../posts-flow-cc8-clean-wrapper');
const tenantScope = require('../tenant-scope');

function reset() {
  access._resetForTests();
  store.store.channels = {};
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.setup = {};
  store.saveStore();
  trace.clear();
  timing.clear();
}
function createJsonRes() { const res = { statusCode: 200, body: null, headersSent: false }; res.status = (code) => { res.statusCode = code; return res; }; res.json = (body) => { res.body = body; res.headersSent = true; return res; }; return res; }
function createRouteRes() { const res = { statusCode: 200, headers: {}, body: '', set(h) { this.headers = { ...this.headers, ...(h || {}) }; return this; }, status(c) { this.statusCode = c; return this; }, type(t) { this.typeValue = t; return this; }, send(b) { this.body = b; this.headersSent = true; return this; } }; return res; }
function callbackUpdate(userId, payload, chatType = 'user', chatId = `${userId}-chat`) { return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${userId}`, body: { mid: `mid-${userId}`, text: 'old' }, sender: { user_id: userId }, recipient: { chat_id: chatId, chat_type: chatType } } } }; }
function messageUpdate(userId, text) { return { body: { update_type: 'message_created', message: { id: `m-${userId}-${Date.now()}`, body: { text }, sender: { user_id: userId }, recipient: { chat_id: `${userId}-chat`, chat_type: 'user' } } } }; }
function labels(callOrScreen) { return (callOrScreen?.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
async function sendBot(bot, sent, update) { const before = sent.length; const res = createJsonRes(); await bot.handleWebhook(update, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 }); assert.strictEqual(res.statusCode, 200); const newCalls = sent.slice(before); return { res, call: sent.at(-1), newCalls, labels: labels(sent.at(-1)), text: String(sent.at(-1)?.text || '') }; }
function seedPost({ userId, channelId, postId, text, title }) {
  const ctx = tenantScope.ensureTenantContext(userId);
  const key = `${channelId}:${postId}`;
  store.savePost(key, tenantScope.stampRecord({ channelId, channelTitle: title, postId, messageId: postId, commentKey: key, originalText: text, linkedByUserId: userId }, ctx));
  return key;
}

(async () => {
  reset();
  const entrypoint = require('../clean-entrypoint-1.53.10-pr89');
  entrypoint.applyEnv();
  entrypoint.installCleanBot();
  const bot = require('../bot');
  const sent = [];
  maxApi.sendMessage = async (payload) => { sent.push(payload); return { message: { id: `sent-${sent.length}`, body: { mid: `sent-${sent.length}` } } }; };
  maxApi.editMessage = async (payload) => { sent.push(payload); return { message: { id: `edit-${sent.length}`, body: { mid: `edit-${sent.length}` } } }; };
  maxApi.answerCallback = async () => ({ ok: true });
  maxApi.deleteMessage = async () => ({ ok: true });
  maxApi.getChat = async () => ({ title: 'Tenant chat' });
  maxApi.getBotChatMember = async () => ({ ok: true });

  assert.strictEqual(adminScreens.adminPanel('pr111-admin').id, 'pr108_admin_panel', 'admin has /admin access');
  assert.strictEqual(adminScreens.adminPanel('pr111-not-admin').id, 'pr108_admin_denied', 'non-admin cannot access /admin');
  const createdByService = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr111-admin' });
  assert.ok(/^AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(createdByService.code), 'admin can create activation code');
  assert.ok(!JSON.stringify(access.listActivationCodes({ limit: 20 })).includes(createdByService.code), 'raw code is absent from code list');
  assert.ok(!JSON.stringify(access.sanitizedSnapshot()).includes(createdByService.code), 'raw code is absent from debug snapshot');

  const preStart = await sendBot(bot, sent, messageUpdate('pr111-pre', '/start'));
  assert.strictEqual(preStart.res.body.screenId, 'pr106_activation_required', '/start shows activation screen before activation');
  const preMenu = await sendBot(bot, sent, messageUpdate('pr111-pre', '/menu'));
  assert.strictEqual(preMenu.res.body.screenId, 'pr106_activation_required', '/menu does not show production menu before activation');
  assert.strictEqual(accountScreens.myAccessScreen('pr111-pre').id, 'account_my_access', '/account screen renders no-access state');
  assert.ok(/нет доступа|Trial|базовый доступ/i.test(accountScreens.myAccessScreen('pr111-pre').text), '/account describes no-access state');
  assert.strictEqual(accessGate.checkAction('pr111-pre', { action: 'admin_section_gifts' }).allow, false, 'protected action is blocked before activation');

  const startCode = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr111-admin' });
  const businessCode = access.createActivationCode({ planId: 'business', durationDays: 30, maxChannels: 20, createdByMaxUserId: 'pr111-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-client-empty', name: 'Empty', code: startCode.code }).ok, true, 'valid Start code activates access');
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-business', name: 'Business', code: businessCode.code }).ok, true, 'valid Business code activates access');
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-invalid', code: 'AK-0000-0000-0000' }).ok, false, 'invalid code is rejected');
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-reuse', code: startCode.code }).ok, false, 'used single-use code is rejected');
  const expired = access.createActivationCode({ planId: 'pro', durationDays: 1, expiresAt: '2000-01-01T00:00:00.000Z', createdByMaxUserId: 'pr111-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr111-expired', code: expired.code }).ok, false, 'expired code is rejected');
  const repeatStart = await sendBot(bot, sent, messageUpdate('pr111-client-empty', '/start'));
  assert.notStrictEqual(repeatStart.res.body.screenId, 'pr106_activation_required', 'repeated /start after activation does not ask to activate again');
  assert.strictEqual(webhookContext.extractUserProfile(messageUpdate('stable-user', '/start').body).maxUserId, 'stable-user', 'identity is stable for message sender');
  assert.strictEqual(webhookContext.extractUserProfile(callbackUpdate('stable-user', { action: 'x' }).body).maxUserId, 'stable-user', 'identity is stable for callback user');
  assert.strictEqual(webhookContext.extractUserProfile({ update_type: 'bot_started', user: { user_id: 'stable-user' } }).maxUserId, 'stable-user', 'identity is stable for bot_started user');
  assert.strictEqual(webhookContext.extractUserProfile({ message: { recipient: { user_id: 'stable-user' }, sender: { user_id: 'stable-user' } } }).maxUserId, 'stable-user', 'identity is stable for recipient/sender-shaped updates');

  store.saveChannel('-global-selftest', { channelId: '-global-selftest', title: 'Production comments matrix selftest post', channelTitle: 'Production comments matrix selftest post', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.saveChannel('-ak-test', { channelId: '-ak-test', title: 'AK-ТЕСТ', channelTitle: 'AK-ТЕСТ', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.saveChannel('-ak-test-ru', { channelId: '-ak-test-ru', title: 'АК Тест', channelTitle: 'АК Тест', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.saveChannel('-club', { channelId: '-club', title: 'АдминКИТ клуб', channelTitle: 'АдминКИТ клуб', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.savePost('-global-selftest:old', { channelId: '-global-selftest', postId: 'old', messageId: 'old', commentKey: '-global-selftest:old', originalText: 'Production comments matrix selftest post' });

  const emptyPicker = await sendBot(bot, sent, callbackUpdate('pr111-client-empty', { action: 'comments_select_post', source: 'comments' }));
  assert.ok(/У вас пока нет подключённых каналов/.test(emptyPicker.text), 'new activated client with zero channels sees only empty channel state');
  assert.ok(!/Production comments matrix selftest post|AK-ТЕСТ|АК Тест|АдминКИТ клуб/.test(emptyPicker.text + emptyPicker.labels.join('\n')), 'new client does not see legacy/global/admin channels');
  const emptyReplay = await sendBot(bot, sent, callbackUpdate('pr111-client-empty', { action: 'comments_channel_pick', source: 'comments', channelId: '-global-selftest' }));
  assert.ok(/У вас пока нет подключённых каналов/.test(emptyReplay.text), 'zero-channel stale comments_select_post/channel pick replay is denied');
  assert.ok(!/Production comments matrix selftest post|Пост выбран|Выберите пост/.test(emptyReplay.text), 'zero-channel stale replay does not show posts');

  const codeA = access.createActivationCode({ planId: 'business', durationDays: 30, maxChannels: 20, createdByMaxUserId: 'pr111-admin' });
  const codeB = access.createActivationCode({ planId: 'business', durationDays: 30, maxChannels: 20, createdByMaxUserId: 'pr111-admin' });
  access.activateCode({ maxUserId: 'pr111-tenant-a', name: 'Tenant A', code: codeA.code });
  access.activateCode({ maxUserId: 'pr111-tenant-b', name: 'Tenant B', code: codeB.code });
  const tenantA = access.getTenantByMaxUserId('pr111-tenant-a');
  const tenantB = access.getTenantByMaxUserId('pr111-tenant-b');
  access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: '-tenant-a', channelTitle: 'Tenant A Channel', maxChannels: 20 });
  access.bindTenantChannel({ tenantId: tenantB.tenantId, channelId: '-tenant-b', channelTitle: 'Tenant B Channel', maxChannels: 20 });
  const postA = seedPost({ userId: 'pr111-tenant-a', channelId: '-tenant-a', postId: 'post-a', title: 'Tenant A Channel', text: 'Tenant A post' });
  const postB = seedPost({ userId: 'pr111-tenant-b', channelId: '-tenant-b', postId: 'post-b', title: 'Tenant B Channel', text: 'Tenant B post' });
  const oneChannel = await sendBot(bot, sent, callbackUpdate('pr111-tenant-a', { action: 'comments_select_post', source: 'comments' }));
  assert.ok(/Tenant A Channel|Tenant A post/.test(oneChannel.text + oneChannel.labels.join('\n')), 'client with one tenant-bound channel sees only that channel/post');
  assert.ok(!/Tenant B Channel|Tenant B post/.test(oneChannel.text + oneChannel.labels.join('\n')), 'tenant A does not see tenant B channel');
  const replayB = await sendBot(bot, sent, callbackUpdate('pr111-tenant-a', { action: 'comments_channel_pick', source: 'comments', channelId: '-tenant-b' }));
  assert.ok(/У вас пока нет подключённых каналов/.test(replayB.text), 'tenant A replaying tenant B channelId is denied');
  assert.ok(!/Tenant B Channel|Tenant B post|Выберите пост/.test(replayB.text), 'foreign channel replay does not show posts');

  const deniedSources = ['comments', 'gifts', 'buttons', 'polls', 'highlights', 'posts'];
  for (const source of deniedSources) {
    const action = source === 'posts' ? 'comments_channel_pick' : 'comments_channel_pick';
    const stale = await sendBot(bot, sent, callbackUpdate('pr111-tenant-a', { action, source, channelId: '-tenant-b' }));
    assert.ok(/У вас пока нет подключённых каналов/.test(stale.text), `stale callback for ${source} cannot open unowned channel`);
    assert.ok(!/Tenant B post|Выберите пост/.test(stale.text), `stale callback for ${source} does not show posts`);
  }
  assert.ok(/У вас пока нет подключённых каналов/.test((await buttonsFlow.screenForPayload(menu, { action: 'button_admin_channel_pick', channelId: '-tenant-b' }, { userId: 'pr111-tenant-a', config: {} })).text), 'buttons direct channel-first path validates requested channelId');
  assert.ok(/У вас пока нет подключённых каналов/.test((await giftsFlow.screenForPayload(menu, { action: 'gift_admin_channel_pick', channelId: '-tenant-b' }, { userId: 'pr111-tenant-a', config: {} })).text), 'gifts direct channel-first path validates requested channelId');
  assert.ok(/У вас пока нет подключённых каналов/.test((await postsFlow.screenForPayload(menu, { action: 'admin_posts_open', commentKey: postB }, { userId: 'pr111-tenant-a', config: {} })).text), 'editor direct post callback validates foreign commentKey/channel');
  assert.ok(/Tenant A Channel/.test(adminScreens.tenantDetailsScreen('pr111-admin', tenantA.tenantId).text), 'admin can inspect tenant-bound channels in diagnostics');
  assert.ok(/Production comments matrix selftest post|AK-ТЕСТ|АК Тест|АдминКИТ клуб/.test(adminScreens.tenantDetailsScreen('pr111-admin', tenantA.tenantId).text), 'admin can still see legacy/unowned/global stored channels in admin diagnostics');
  assert.ok(!access.getClientChannels('pr111-tenant-a').some((ch) => /Production comments matrix selftest post|AK-ТЕСТ|АК Тест|АдминКИТ клуб/.test(ch.title || ch.channelTitle || '')), 'normal client cannot trigger admin channel visibility bypass');

  assert.strictEqual(access.bindTenantChannel({ tenantId: access.getTenantByMaxUserId('pr111-client-empty').tenantId, channelId: '-second-start', channelTitle: 'Second Start', maxChannels: 1 }).ok, true, 'Start maxChannels=1 allows first channel');
  assert.strictEqual(access.bindTenantChannel({ tenantId: access.getTenantByMaxUserId('pr111-client-empty').tenantId, channelId: '-third-start', channelTitle: 'Third Start', maxChannels: 1 }).ok, false, 'Start maxChannels=1 blocks second channel');
  assert.ok(access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: '-tenant-a-2', channelTitle: 'Tenant A Channel 2', maxChannels: 20 }).ok, 'Business limit allows second channel');
  assert.strictEqual(accessGate.checkAction('pr111-client-empty', { action: 'admin_section_gifts' }).allow, false, 'Pro/Business-only gifts are denied for Start');
  assert.strictEqual(accessGate.checkAction('pr111-client-empty', { action: 'admin_section_comments' }).allow, true, 'basic comments action remains available on Start');
  assert.strictEqual(accessGate.checkAction('pr111-business', { action: 'admin_section_gifts' }).allow, true, 'Business-only/pro action is available on Business');

  for (let i = 0; i < 520; i += 1) { trace.log('pr111_trace', { userId: `user-${i}`, tenantId: `tenant-${i}`, action: 'x', gate: 'allowed', rawCode: createdByService.code, token: 'secret-token', payload: JSON.stringify({ code: createdByService.code }) }); timing.log('pr111_timing', { userId: `user-${i}`, tenantId: `tenant-${i}`, action: 'x', gate: 'allowed', rawCode: createdByService.code, token: 'secret-token', payload: JSON.stringify({ code: createdByService.code }), durationMs: i }); }
  assert.strictEqual(trace.info().limit, 500, 'UI trace supports limit=500');
  assert.strictEqual(timing.info().limit, 500, 'UI timing supports limit=500');
  assert.ok(trace.list().length <= 500 && trace.list().length >= 500, 'UI trace stores 500 events');
  assert.ok(timing.list().length <= 500 && timing.list().length >= 500, 'UI timing stores 500 events');
  const traceJson = JSON.stringify(trace.list());
  const timingJson = JSON.stringify(timing.list());
  assert.ok(/userId|tenantId|action|gate/.test(traceJson), 'trace contains safe user/tenant/action/gate shape');
  assert.ok(!traceJson.includes(createdByService.code) && !timingJson.includes(createdByService.code), 'trace/timing do not leak raw activation codes');
  assert.ok(!traceJson.includes('secret-token') && !timingJson.includes('secret-token'), 'trace/timing do not leak tokens');

  const fakeApp = { routes: {}, get(route, handler) { this.routes[route] = handler; return this; } };
  routes.install(fakeApp);
  const traceRes = createRouteRes(); fakeApp.routes['/debug/ui-trace']({}, traceRes);
  assert.strictEqual(JSON.parse(traceRes.body).limit, 500, '/debug/ui-trace reports limit=500');
  const timingRes = createRouteRes(); fakeApp.routes['/debug/ui-timing']({}, timingRes);
  assert.strictEqual(JSON.parse(timingRes.body).limit, 500, '/debug/ui-timing reports limit=500');

  const adminFlow = await sendBot(bot, sent, callbackUpdate('pr111-admin', { action: 'admin_code_confirm_create', planId: 'start', durationDays: 30, maxChannels: 1 }));
  assert.strictEqual(adminFlow.res.body.screenId, 'pr108_admin_code_created', 'admin bot flow creates code');
  assert.ok(/Код отправлен отдельным сообщением/.test(adminFlow.text), 'raw code is sent as separate private message instruction');
  const rawCalls = adminFlow.newCalls.filter((call) => /^AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(String(call.text || '')));
  assert.strictEqual(rawCalls.length, 1, 'raw activation code is shown only once as a separate message');
  assert.strictEqual(rawCalls[0].userId, 'pr111-admin', 'raw activation code is sent privately to admin');
  assert.strictEqual(rawCalls[0].chatId || '', '', 'raw activation code is not sent to shared chat');
  assert.ok(!JSON.stringify(access.listActivationCodes({ limit: 100 })).includes(rawCalls[0].text), 'raw code is not present in code list/history');
  assert.ok(!JSON.stringify(access.sanitizedSnapshot()).includes(rawCalls[0].text), 'raw code is not present in debug snapshot');
  assert.ok(!JSON.stringify(trace.list()).includes(rawCalls[0].text) && !JSON.stringify(timing.list()).includes(rawCalls[0].text), 'raw code is not present in trace/timing');
  assert.ok(!/\bCTA\b/i.test(oneChannel.text + oneChannel.labels.join('\n') + buttonsFlow.screenForPayload.toString()), 'client-facing flow labels do not reintroduce CTA wording');

  console.log('PR111 onboarding server loop tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
