'use strict';

const assert = require('assert');
process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_ADMIN_MAX_USER_IDS = 'pr110-admin';
delete process.env.DEBUG_ADMIN_ID;
delete process.env.ADMIN_ID;

const access = require('../services/clientAccessService');
const adminScreens = require('../features/admin-activation-screens-pr108');
const accountScreens = require('../features/account-screens-pr106');
const maxApi = require('../services/maxApi');
const store = require('../store');

access._resetForTests();
store.store.channels = {};
store.saveStore();

function createJsonRes() { const res = { statusCode: 200, body: null, headersSent: false }; res.status = (code) => { res.statusCode = code; return res; }; res.json = (body) => { res.body = body; res.headersSent = true; return res; }; return res; }
function messageUpdate(userId, text, chatType = 'user', chatId = `${userId}-chat`, recipientExtra = {}) { return { body: { update_type: 'message_created', message: { id: `m-${userId}-${Date.now()}`, body: { text }, sender: { user_id: userId }, recipient: { chat_id: chatId, chat_type: chatType, ...recipientExtra } } } }; }
function callbackUpdate(userId, payload, chatType = 'user', chatId = `${userId}-chat`, recipientExtra = {}) { return { body: { update_type: 'message_callback', callback: { callback_id: `cb-${userId}-${Date.now()}-${Math.random()}`, user: { user_id: userId }, payload: JSON.stringify(payload) }, message: { id: `msg-${userId}`, body: { mid: `mid-${userId}`, text: 'old' }, sender: { user_id: userId }, recipient: { chat_id: chatId, chat_type: chatType, ...recipientExtra } } } }; }
function labels(call) { return (call?.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
async function sendBot(bot, sent, update) { const before = sent.length; const res = createJsonRes(); await bot.handleWebhook(update, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 }); assert.strictEqual(res.statusCode, 200); const newCalls = sent.slice(before); return { res, call: sent.at(-1), newCalls, labels: labels(sent.at(-1)), text: String(sent.at(-1)?.text || '') }; }

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

  store.saveChannel('-global-selftest', { channelId: '-global-selftest', title: 'Production comments matrix selftest post', channelTitle: 'Production comments matrix selftest post', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.saveChannel('-ak-test-1', { channelId: '-ak-test-1', title: 'AK-ТЕСТ 1', channelTitle: 'AK-ТЕСТ 1', isMaxChannel: true, isChannel: true, type: 'channel' });
  store.saveChannel('-admin-kit-club', { channelId: '-admin-kit-club', title: 'АдминКИТ клуб', channelTitle: 'АдминКИТ клуб', isMaxChannel: true, isChannel: true, type: 'channel' });

  const startCode = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr110-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr110-client-empty', name: 'Empty Client', code: startCode.code }).ok, true, 'Start code activates a new client');

  const emptyPicker = await sendBot(bot, sent, callbackUpdate('pr110-client-empty', { action: 'comments_select_post', source: 'comments' }));
  assert.strictEqual(emptyPicker.res.body.screenId, 'channel_first_comments_channels', 'client opens channel picker');
  assert.ok(/У вас пока нет подключённых каналов/.test(emptyPicker.text), 'empty client sees tenant-safe empty state');
  assert.deepStrictEqual(emptyPicker.labels, ['Подключить канал', 'Как подключить', '🏠 Главное меню'], 'empty state has connect/help/main buttons');
  assert.ok(!/Production comments matrix selftest post|AK-ТЕСТ|АдминКИТ клуб/.test(emptyPicker.text), 'global/selftest channels are not rendered for empty client');

  const tenantEmpty = access.getTenantByMaxUserId('pr110-client-empty');
  const limitScreen = accountScreens.channelsScreen('pr110-client-empty');
  assert.ok(/У вас пока нет подключённых каналов/.test(limitScreen.text), 'account channels screen uses same empty copy');

  access.bindTenantChannel({ tenantId: tenantEmpty.tenantId, channelId: '-tenant-a', channelTitle: 'Tenant A Channel', maxChannels: 1 });
  const onlyMinePicker = await sendBot(bot, sent, callbackUpdate('pr110-client-empty', { action: 'comments_select_post', source: 'comments' }));
  assert.ok(/Tenant A Channel/.test(onlyMinePicker.text) || onlyMinePicker.labels.some((label) => /Tenant A Channel/.test(label)), 'client with one bound channel sees that channel');
  assert.ok(!/Production comments matrix selftest post|AK-ТЕСТ|АдминКИТ клуб/.test(onlyMinePicker.text + onlyMinePicker.labels.join('\n')), 'selftest/global channels stay hidden when one tenant channel exists');
  const reachedScreen = accountScreens.channelsScreen('pr110-client-empty');
  assert.ok(/Лимит каналов достигнут/.test(reachedScreen.text), 'Start client with one channel sees limit reached');
  assert.ok(!labels(reachedScreen).includes('Подключить канал'), 'limit reached screen does not offer connecting another channel');

  const codeB = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr110-admin' });
  assert.strictEqual(access.activateCode({ maxUserId: 'pr110-client-b', name: 'Tenant B', code: codeB.code }).ok, true, 'second tenant activates');
  const tenantB = access.getTenantByMaxUserId('pr110-client-b');
  access.bindTenantChannel({ tenantId: tenantB.tenantId, channelId: '-tenant-b', channelTitle: 'Tenant B Channel', maxChannels: 1 });
  const tenantAPicker = await sendBot(bot, sent, callbackUpdate('pr110-client-empty', { action: 'comments_select_post', source: 'comments' }));
  assert.ok(!/Tenant B Channel/.test(tenantAPicker.text + tenantAPicker.labels.join('\n')), 'tenant A does not see tenant B channel');

  store.saveChannel('-explicit-user', { channelId: '-explicit-user', title: 'Explicit User Channel', channelTitle: 'Explicit User Channel', linkedByUserId: 'pr110-linked-user', isMaxChannel: true, isChannel: true, type: 'channel' });
  assert.deepStrictEqual(access.getClientChannels('pr110-linked-user').map((channel) => channel.channelTitle || channel.title), ['Explicit User Channel'], 'explicit same-user channel link is allowed without global fallback');

  const adminDiag = adminScreens.tenantDetailsScreen('pr110-admin', tenantEmpty.tenantId);
  assert.ok(/Tenant A Channel/.test(adminDiag.text), 'admin can still inspect tenant channel diagnostics');

  const adminFlow = await sendBot(bot, sent, callbackUpdate('pr110-admin', { action: 'admin_code_confirm_create', planId: 'start', durationDays: 30, maxChannels: 1 }));
  assert.strictEqual(adminFlow.res.body.screenId, 'pr108_admin_code_created', 'admin create flow returns created screen');
  assert.ok(/Код отправлен отдельным сообщением/.test(adminFlow.text), 'main screen tells admin that code was sent separately');
  assert.ok(!/AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}/.test(adminFlow.text), 'raw code is absent from main created screen');
  const rawCalls = adminFlow.newCalls.filter((call) => /^AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(String(call.text || '')));
  assert.strictEqual(rawCalls.length, 1, 'raw activation code is one short separate private message');
  assert.strictEqual(rawCalls[0].userId, 'pr110-admin', 'raw code goes only to admin userId');
  assert.strictEqual(rawCalls[0].chatId || '', '', 'raw code is not sent to a shared chat');
  assert.ok(!JSON.stringify(access.listActivationCodes({ limit: 50 })).includes(rawCalls[0].text), 'raw code is not shown in code list');
  assert.ok(!JSON.stringify(access.sanitizedSnapshot()).includes(rawCalls[0].text), 'raw code is not shown in sanitized debug snapshot');

  const groupCreate = await sendBot(bot, sent, callbackUpdate('pr110-admin', { action: 'admin_code_confirm_create', planId: 'start', durationDays: 30, maxChannels: 1 }, 'group', 'group-pr110'));
  assert.strictEqual(groupCreate.res.body.screenId, 'pr108_admin_private_chat_required', 'PR108 private-chat admin security still blocks group create');
  assert.ok(!groupCreate.newCalls.some((call) => /AK-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}/.test(String(call.text || ''))), 'blocked group create does not receive raw code');

  console.log('PR110 activation copy and tenant channel picker tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
