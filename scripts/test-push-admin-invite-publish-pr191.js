'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const onboarding = require('../services/groupPushOnboardingService');
const publishing = require('../services/groupPushAdminPublishingService');
const adapter = require('../features/menu-v3/adapter');

function apiFor(role) {
  const sent = [];
  return {
    sent,
    getChat: async () => ({ title: 'Мож Хвост 3', type: 'chat' }),
    getBotChatMember: async () => ({ role: 'administrator', can_send_messages: true }),
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

  const pickerFunction = botSource.slice(botSource.indexOf('function buildPushAdminChatPickerKeyboard'), botSource.indexOf('function buildPushPublishResultText'));
  assert(pickerFunction.includes('getSafeClientDestinationTitle'));
  assert(!pickerFunction.includes('text: String(item.channelId'));
  assert(botSource.includes('return performGroupPushOnboarding({ userId, chatId, chatTitle, message'));
  console.log('PR191 push admin invite publishing: OK');
})().catch((error) => { console.error(error); process.exit(1); });
