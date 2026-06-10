'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const onboarding = require('../services/groupPushOnboardingService');
const publishing = require('../services/groupPushAdminPublishingService');
const adapter = require('../features/menu-v3/adapter');
const bot = require('../bot');

function apiFor(role, options = {}) {
  const sent = [];
  return {
    sent,
    getChat: async () => ({ title: 'Мож Хвост 3', type: options.chatType || 'chat' }),
    getBotChatMember: async () => options.botMember || ({ role: 'administrator', can_send_messages: true }),
    getChatMembers: async () => ({ members: [{ user_id: '42', role }] }),
    sendMessage: async (message) => { sent.push(message); return { ok: true }; }
  };
}

(async () => {
  const screen = adapter.render('push:home');
  assert(screen.text.includes('🔔 Уведомления MAX'));
  assert(JSON.stringify(screen.attachments).includes('Опубликовать приглашение'));

  const botSource = fs.readFileSync(path.join(__dirname, '..', 'bot.js'), 'utf8');
  assert(botSource.includes('getSafeClientDestinationTitle'));
  assert(botSource.includes("buildAdminCallbackPayload('admin_push_publish_invite'"));
  assert(botSource.includes('groupPushOnboarding.resolveChatTitle'));
  assert(botSource.includes('Откройте личный чат с ботом и нажмите Старт, затем повторите подключение.'));

  const scoped = [{ channelId: 'owned-chat', title: 'Свой чат', type: 'chat' }];
  const global = [{ channelId: 'foreign-chat', title: 'Чужой закрытый чат', type: 'chat' }];
  const ordinaryDestinations = bot.__testMergePushPublishDestinations({ scoped, global, allowGlobal: false });
  assert.deepEqual(ordinaryDestinations.map((item) => item.title), ['Свой чат']);
  assert(!JSON.stringify(ordinaryDestinations).includes('Чужой закрытый чат'));
  assert(!JSON.stringify(screen).includes('owned-chat'));
  assert(!JSON.stringify(screen).includes('foreign-chat'));
  const operatorDestinations = bot.__testMergePushPublishDestinations({ scoped, global, allowGlobal: true });
  assert.deepEqual(operatorDestinations.map((item) => item.title), ['Свой чат', 'Чужой закрытый чат']);
  assert(botSource.includes('if (!operatorView) return mergePushPublishDestinations({ scoped });'));
  assert(botSource.includes('options.operatorView === true && clientAccessService.isAdmin(userId)'));
  assert(botSource.includes('getPushPublishDestinations(config, userId);'), 'ordinary picker does not request operator view');

  const deniedApi = apiFor('member');
  const denied = await publishing.publishGroupPushInvite({
    botToken: 'token', requesterId: '42', chatId: '-100000000001', title: 'Мож Хвост 3', api: deniedApi,
    buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error, 'requester_not_admin');
  assert.equal(deniedApi.sent.length, 0);

  for (const role of ['owner', 'administrator']) {
    const api = apiFor(role);
    const published = await publishing.publishGroupPushInvite({
      botToken: 'token', requesterId: '42', chatId: '-100000000001', title: 'Мож Хвост 3', chatType: 'chat', api,
      buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
    });
    assert.equal(published.ok, true);
    const publicPayload = JSON.stringify(api.sent[0]);
    for (const forbidden of ['/push/join?t=', 'pairingToken', 'endpoint', 'p256dh', '"auth"', 'clck.ru']) assert(!publicPayload.includes(forbidden));
    assert(publicPayload.includes('group_push_enable'));
    assert(publicPayload.includes('🔔 Подключить уведомления'));
  }


  const botBlockedApi = apiFor('owner', { chatType: 'channel', botMember: { role: 'member', can_send_messages: false } });
  const botBlocked = await publishing.publishGroupPushInvite({
    botToken: 'token', requesterId: '42', chatId: '-100000000003', title: 'Канал без права записи', chatType: 'channel', api: botBlockedApi,
    buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
  });
  assert.equal(botBlocked.ok, false);
  assert.equal(botBlocked.error, 'bot_cannot_publish');
  assert.equal(botBlockedApi.sent.length, 0);
  assert(publishing.BOT_CANNOT_PUBLISH_MESSAGE.includes('Бот не может опубликовать приглашение'));
  assert(botSource.includes("botCannotPublish: result?.error === 'bot_cannot_publish'"));

  const pickerFunction = botSource.slice(botSource.indexOf('function buildPushAdminChatPickerKeyboard'), botSource.indexOf('function buildPushPublishResultText'));
  assert(pickerFunction.includes('getSafeClientDestinationTitle'));
  assert(!pickerFunction.includes('text: String(item.channelId'));
  assert(botSource.includes('return performGroupPushOnboarding({ userId, chatId, chatTitle, message'));
  console.log('PR191 push admin invite publishing: OK');
})().catch((error) => { console.error(error); process.exit(1); });
