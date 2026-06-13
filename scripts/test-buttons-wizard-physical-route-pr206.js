'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';
process.env.ADMINKIT_DISABLE_AUTOSTART = '1';

const store = require('../store');
const tenant = require('../tenant-scope');
const max = require('../services/maxApi');
const access = require('../services/clientAccessService');

const USER_ID = 'real-user-1';
const CHAT_ID = 'chat-1';
const MESSAGE_ID = 'wizard-host-msg';
const CARD_ID = 'card-pr206';

const editCalls = [];
const sendCalls = [];
const deleteCalls = [];
const answerCalls = [];

max.editMessage = async function editMessageStub(args = {}) {
  editCalls.push(args);
  return { message: { id: args.messageId, body: { mid: args.messageId } } };
};
max.sendMessage = async function sendMessageStub(args = {}) {
  sendCalls.push(args);
  return { message: { id: `sent-${sendCalls.length}`, body: { mid: `sent-${sendCalls.length}` } } };
};
max.deleteMessage = async function deleteMessageStub(args = {}) {
  deleteCalls.push(args);
  return { ok: true };
};
max.answerCallback = async function answerCallbackStub(args = {}) {
  answerCalls.push(args);
  return { ok: true };
};
max.getChat = async function getChatStub() { return { title: 'Olga Style' }; };

function resetState() {
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.channels = {};
  store.store.setup = {};
  store.store.setupState = {};
  store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
  store.saveStore();
}
function wizardSendCalls() {
  return sendCalls.filter((call) => /Добавление кнопки|Предпросмотр кнопки/i.test(String(call.text || '')));
}
function closedWizardEdits() {
  return editCalls.filter((call) => call.messageId === MESSAGE_ID && /Предыдущий шаг закрыт/i.test(String(call.text || '')));
}
function callbackUpdate() {
  return {
    update_type: 'message_callback',
    callback: {
      callback_id: 'cb-step-1',
      user_id: USER_ID,
      payload: JSON.stringify({ action: 'button_admin_start_add', cardId: CARD_ID }),
      message: {
        id: MESSAGE_ID,
        body: { mid: MESSAGE_ID, text: 'selected post card' },
        recipient: { chat_id: CHAT_ID, chat_type: 'dialog' }
      }
    }
  };
}
function textUpdate(text) {
  return {
    update_type: 'message_created',
    message: {
      id: `user-msg-${text.length}`,
      body: { mid: `user-msg-${text.length}`, text },
      sender: { user_id: USER_ID },
      recipient: { chat_id: CHAT_ID, chat_type: 'dialog' }
    }
  };
}
function resCollector() {
  return {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
}
async function drive(bot, body) {
  const res = resCollector();
  await bot.handleWebhook({ body }, res, { botToken: 'test-token', menuDeleteTimeoutMs: 1 });
  assert.strictEqual(res.statusCode, 200);
  return res.payload;
}

(async () => {
  resetState();
  access._resetForTests();
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 3, createdByMaxUserId: 'test-admin' });
  const activated = access.activateCode({ maxUserId: USER_ID, name: 'Real User', code: code.code });
  assert.strictEqual(activated.ok, true, 'user activation succeeds');
  assert.strictEqual(access.bindTenantChannel({ tenantId: activated.tenant.tenantId, channelId: 'channel-olga', channelTitle: 'Olga Style', maxChannels: 3 }).ok, true, 'channel bind succeeds');
  await require('../persistent-store-bootstrap').install();
  require('../pr199-buttons-wizard-inplace-save-bootstrap').install();
  require('../pr199-buttons-main-menu-route-guard').install();
  require('../pr202-buttons-real-show-path-inplace').install();

  const ctx = tenant.ensureTenantContext(USER_ID);
  const target = tenant.stampRecord({
    channelId: 'channel-olga',
    channelTitle: 'Olga Style',
    postId: 'post-1',
    messageId: 'post-message-1',
    commentKey: 'channel-olga:post-1',
    originalText: 'Olga Style launch post',
    cardId: CARD_ID,
    createdAt: Date.now(),
    source: 'buttons_selected_post_card'
  }, ctx);
  store.setSetupState(USER_ID, { buttonsCurrentCard: target, buttonTargetPost: target, commentTargetPost: target, activeAdminFlowKind: '' });

  const legacy = require('../bot');
  const adapter = require('../clean-bot-campaign-links-pr91');
  const bot = adapter.createCleanBot(legacy);

  await drive(bot, callbackUpdate());
  assert.strictEqual(editCalls.length, 1, 'Step 1 uses editMessage');
  assert.strictEqual(editCalls[0].messageId, MESSAGE_ID, 'Step 1 edits callback message');
  assert(/Шаг 1\/3/.test(editCalls[0].text), 'Step 1 text rendered');
  assert.strictEqual(wizardSendCalls().length, 0, 'Step 1 does not send wizard message');
  assert.strictEqual(store.getSetupState(USER_ID).buttonsWizardScreenMessageId, MESSAGE_ID, 'Step 1 records canonical wizard owner');

  await drive(bot, textUpdate('Кнопка'));
  assert.strictEqual(wizardSendCalls().length, 0, 'Step 2 does not send wizard message');
  assert(editCalls.some((call) => call.messageId === MESSAGE_ID && /Шаг 2\/3/.test(call.text)), 'Step 2 edits same wizard message');
  assert.strictEqual(closedWizardEdits().length, 0, 'Step 2 does not close active wizard message');
  assert(!deleteCalls.some((call) => call.messageId === MESSAGE_ID), 'Step 2 does not delete active wizard message');

  await drive(bot, textUpdate('https://olga.style'));
  assert.strictEqual(wizardSendCalls().length, 0, 'Step 3 does not send wizard message');
  assert(editCalls.some((call) => call.messageId === MESSAGE_ID && /Шаг 3\/3/.test(call.text)), 'Step 3 edits same wizard message');
  assert.strictEqual(closedWizardEdits().length, 0, 'Step 3 does not close active wizard message');
  assert(!deleteCalls.some((call) => call.messageId === MESSAGE_ID), 'Step 3 does not delete active wizard message');

  const finalState = store.getSetupState(USER_ID);
  assert.strictEqual(finalState.buttonsWizardScreenMessageId, MESSAGE_ID, 'canonical wizard owner remains stable');
  assert.notStrictEqual(finalState.buttonsWizardRealShowPathLastDecision, 'send_new', 'no PR202 send_new decision for wizard steps');
  assert.notStrictEqual(finalState.buttonsWizardRealShowPathLastDecision, 'fallback_send_after_edit_failed', 'no fallback send decision for wizard steps');
  assert(!finalState.buttonsWizardEditFailedAt, 'no wizard edit failure diagnostic');

  console.log('test-buttons-wizard-physical-route-pr206 ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
