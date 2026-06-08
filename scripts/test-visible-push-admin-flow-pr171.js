'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'features/menu-v3/adapter.js'), 'utf8');
const canonicalSource = fs.readFileSync(path.join(root, 'features/menu-v3/canonical-menu.js'), 'utf8');
const hiddenAdminSource = fs.readFileSync(path.join(root, 'features/admin-activation-screens-pr108.js'), 'utf8');
const accountSource = fs.readFileSync(path.join(root, 'features/account-screens-pr106.js'), 'utf8');
const routesSource = fs.readFileSync(path.join(root, 'web-push-routes.js'), 'utf8');
const groupPush = require('../services/groupPushOnboardingService');
const permission = require('../services/pushInvitePermissionService');
const menu = require('../v3-menu-core-1539');

function buttons(screen) {
  return (screen?.attachments?.[0]?.payload?.buttons || []).flat();
}

(async () => {
  const main = menu.mainScreen();
  assert(buttons(main).some((item) => item.text === '🔔 Push-уведомления'), 'activated/admin canonical main menu exposes Push notifications');
  const section = menu.screenForPayload({ action: 'push_notifications:home' });
  assert(section && section.text.includes('🔔 Push-уведомления'), 'visible Push admin section renders from canonical menu runtime');
  assert(section.text.includes('Опубликуйте кнопку подключения в MAX-чат'), 'Push section explains the publishing product flow');
  assert(buttons(section).some((item) => item.text === 'Опубликовать приглашение в чат'), 'Push section contains publish action');
  assert(canonicalSource.includes("title: '🔔 Push-уведомления'") && adapterSource.includes('function pushNotificationsHome'), 'feature lives in active canonical menu files');
  assert(botSource.includes("text: '🔔 Push-уведомления'") && botSource.includes("payload.action === 'admin_push_select_chat'"), 'feature also lives in active callback execution path');
  assert(!hiddenAdminSource.includes('function pushNotificationsHome'), 'feature is not implemented only in hidden admin activation screens');

  const admin = await permission.verifyPushInvitePermission({
    requesterUserId: 'owner-171', targetChatId: 'chat-171', botToken: 'test-token',
    getChatMembers: async () => ({ members: [{ user_id: 'owner-171', role: 'owner' }] })
  });
  assert.strictEqual(admin.allowed, true, 'selected chat owner passes scoped permission check');
  const adminByFlag = await permission.canPublishPushInvite({
    requesterUserId: 'admin-171', targetChatId: 'chat-171', botToken: 'test-token',
    getChatMembers: async () => ({ members: [{ userId: 'admin-171', permissions: { is_admin: true } }] })
  });
  assert.strictEqual(adminByFlag, true, 'selected chat admin passes normalized permission check');

  const member = await permission.verifyPushInvitePermission({
    requesterUserId: 'member-171', targetChatId: 'chat-171', botToken: 'test-token',
    getChatMembers: async () => ({ members: [{ user_id: 'member-171', role: 'member' }] })
  });
  assert.deepStrictEqual(member, { allowed: false, result: permission.RESULT_NOT_ADMIN }, 'ordinary member cannot publish');
  const unknown = await permission.verifyPushInvitePermission({
    requesterUserId: 'unknown-171', targetChatId: 'chat-171', botToken: 'test-token',
    getChatMembers: async () => ({ members: [{ user_id: 'unknown-171' }] })
  });
  assert.deepStrictEqual(unknown, { allowed: false, result: permission.RESULT_UNVERIFIABLE }, 'unknown role fails closed');
  const failed = await permission.verifyPushInvitePermission({
    requesterUserId: 'failed-171', targetChatId: 'chat-171', botToken: 'test-token',
    getChatMembers: async () => { throw new Error('MAX unavailable'); }
  });
  assert.deepStrictEqual(failed, { allowed: false, result: permission.RESULT_UNVERIFIABLE }, 'MAX API failure fails closed');
  assert.strictEqual(await permission.canPublishPushInvite({ requesterUserId: '', targetChatId: 'chat-171', botToken: 'test-token' }), false, 'missing requester fails closed');
  assert.strictEqual(await permission.canPublishPushInvite({ requesterUserId: 'owner-171', targetChatId: '', botToken: 'test-token' }), false, 'missing selected chat fails closed');

  const maxApi = require('../services/maxApi');
  const originalSend = maxApi.sendMessage;
  const originalMembers = maxApi.getChatMembers;
  const sent = [];
  try {
    maxApi.sendMessage = async (payload) => { sent.push(payload); return { ok: true }; };
    delete require.cache[require.resolve('../bot')];
    const bot = require('../bot');

    maxApi.getChatMembers = async () => ({ members: [{ user_id: 'owner-publish-171', is_owner: true }] });
    const allowedPublish = await bot.__testPublishAdminGroupPushInvite({ config: { botToken: 'test-token' }, userId: 'owner-publish-171', chatId: 'chat-publish-171', title: 'Безопасный чат' });
    assert.strictEqual(allowedPublish.ok, true, 'chat owner can publish through the real bot publisher');
    assert.strictEqual(sent.length, 1, 'allowed publisher sends exactly one public message');

    maxApi.getChatMembers = async () => ({ members: [{ user_id: 'member-publish-171', role: 'member' }] });
    const blockedPublish = await bot.__testPublishAdminGroupPushInvite({ config: { botToken: 'test-token' }, userId: 'member-publish-171', chatId: 'chat-publish-171', title: 'Безопасный чат' });
    assert.strictEqual(blockedPublish.ok, false, 'non-admin publisher is blocked');
    assert.strictEqual(blockedPublish.error, permission.RESULT_NOT_ADMIN, 'non-admin gets safe authorization classification');
    assert.strictEqual(sent.length, 1, 'blocked publisher sends nothing publicly');

    maxApi.getChatMembers = async () => { throw new Error('MAX unavailable'); };
    const failedPublish = await bot.__testPublishAdminGroupPushInvite({ config: { botToken: 'test-token' }, userId: 'owner-publish-171', chatId: 'chat-publish-171', title: 'Безопасный чат' });
    assert.strictEqual(failedPublish.ok, false, 'unverifiable publisher is blocked');
    assert.strictEqual(failedPublish.error, permission.RESULT_UNVERIFIABLE, 'verification failure gets safe classification');
    assert.strictEqual(sent.length, 1, 'verification failure sends nothing publicly');
  } finally {
    maxApi.sendMessage = originalSend;
    maxApi.getChatMembers = originalMembers;
    delete require.cache[require.resolve('../bot')];
  }

  const inviteText = groupPush.buildGroupInviteText('Безопасный чат');
  const inviteButton = groupPush.buildGroupInviteKeyboard()[0].payload.buttons[0][0];
  assert.strictEqual(inviteButton.text, '🔔 Подключить уведомления', 'public invite has product CTA');
  assert.strictEqual(inviteButton.payload, 'group_push_enable', 'public invite uses group_push_enable callback');
  assert.strictEqual(inviteButton.action, 'group_push_enable', 'public invite callback action is explicit');
  assert(!/\/push\/join\?t=|clck\.ru|endpoint|p256dh|access_token|PUSH_ADMIN_TOKEN|BOT_TOKEN|VAPID|auth/i.test(inviteText + JSON.stringify(inviteButton)), 'public invite exposes no personal links, push keys, or secrets');

  assert(botSource.includes('performGroupPushOnboarding({ userId, chatId, chatTitle, config'), '/push and group callback keep private onboarding implementation');
  assert(botSource.includes('groupPushOnboarding.isGroupPushEnablePayload(payload)'), 'ordinary group_push_enable callback remains active');
  assert(botSource.includes("Не удалось проверить права администратора. Проверьте, что бот добавлен в чат и имеет нужные права."), 'verification failure shows required safe private error');
  assert(botSource.includes('Опубликовать приглашение может только администратор этого чата или канала.'), 'non-admin shows required safe private error');
  assert(routesSource.includes('verifyPushInvitePermission') && routesSource.includes('requesterUserId'), 'legacy internal endpoint also requires selected-chat requester verification');
  assert(accountSource.includes('🔔 Уведомления чатов'), 'PR170 free public B2C entrypoint remains');
  assert(accountSource.includes('Подключение конкретного чата начинается из самого MAX-чата, где установлен бот.'), 'public entrypoint clarifies that /push alone does not select a chat');
  assert(accountSource.includes('Открыть приложение / проверить чаты'), 'public app link is renamed as a secondary status action');

  console.log('visible push admin flow pr171 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
