'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const publishing = require('../services/groupPushAdminPublishingService');
const onboarding = require('../services/groupPushOnboardingService');
const pkg = require('../package.json');
const canonicalMenu = require('../features/menu-v3/canonical-menu');
const menuAdapter = require('../features/menu-v3/adapter');

const repoRoot = path.join(__dirname, '..');
const botSource = fs.readFileSync(path.join(repoRoot, 'bot.js'), 'utf8');
const entrypoint = fs.readFileSync(path.join(repoRoot, 'clean-entrypoint-1.53.10-pr89.js'), 'utf8');
const linkChatSource = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');
const publicEntrySource = fs.readFileSync(path.join(repoRoot, 'features', 'account-screens-pr106.js'), 'utf8');

function apiFor({ role = 'administrator', requesterId = 'user-pr172', members = null, fail = '' } = {}) {
  const calls = [];
  const maybeFail = (name) => { if (fail === name) throw new Error(`${name}_unavailable`); };
  return {
    calls,
    getChat: async ({ chatId }) => { calls.push(['getChat', chatId]); maybeFail('getChat'); return { chat_id: chatId, title: 'Selected Chat' }; },
    getBotChatMember: async ({ chatId }) => { calls.push(['getBotChatMember', chatId]); maybeFail('getBotChatMember'); return { user_id: 'bot-pr172', role: 'administrator' }; },
    getChatMembers: async ({ chatId, userIds }) => {
      calls.push(['getChatMembers', chatId, userIds]);
      maybeFail('getChatMembers');
      return { members: members === null ? [{ user_id: requesterId, role }] : members };
    },
    sendMessage: async (message) => { calls.push(['sendMessage', message.chatId, message]); maybeFail('sendMessage'); return { message: { body: { mid: 'published-pr172' } } }; }
  };
}

(async () => {
  assert(canonicalMenu.clientSections.some((section) => section.title === '🔔 Push-уведомления' && section.route === 'push:home'), 'active canonical menu exposes visible Push section');
  const activePushScreen = menuAdapter.render('push:home');
  const activePushLabels = activePushScreen.attachments[0].payload.buttons.flat().map((button) => button.text);
  assert.deepStrictEqual(activePushLabels, ['Опубликовать приглашение', 'Как это работает', 'Главное меню'], 'active Push section has the required three buttons');
  assert(activePushScreen.text.includes('Опубликуйте кнопку подключения в MAX-чат или канал, чтобы участники могли получать уведомления на iPhone через АдминКИТ PUSH.'), 'active canonical Push screen has required product copy');
  assert(botSource.includes("text: '🔔 Push-уведомления'") && botSource.includes("buildAdminCallbackPayload('admin_section_push')"), 'legacy activated/admin main menu also exposes visible Push section');
  assert(botSource.includes("'🔔 Push-уведомления'") && botSource.includes('Опубликуйте кнопку подключения в MAX-чат или канал, чтобы участники могли получать уведомления на iPhone через АдминКИТ PUSH.'), 'Push section has required title and product copy');
  for (const label of ['Опубликовать приглашение', 'Как это работает', 'Главное меню']) assert(botSource.includes(`text: '${label}'`), `Push section includes ${label}`);
  assert(botSource.includes("buildAdminCallbackPayload('admin_push_select_chat')"), 'publish action opens a chat/channel picker');
  assert(botSource.includes("buildAdminCallbackPayload('admin_push_publish_invite', {"), 'selected chat id is embedded in scoped publish callback');
  assert(botSource.includes("const selectedChatId = String(payload.chatId || '').trim()"), 'publish handler never falls back to the current/public chat');

  const adminApi = apiFor({ role: 'owner' });
  const published = await publishing.publishGroupPushInvite({
    botToken: 'safe-test-token', requesterId: 'user-pr172', chatId: 'selected-chat-pr172', title: 'Selected Chat', api: adminApi,
    buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
  });
  assert.strictEqual(published.ok, true, 'owner can publish');
  assert(adminApi.calls.every((call) => call[1] === 'selected-chat-pr172'), 'all MAX checks and publication are scoped to selected chat');
  const sent = adminApi.calls.find((call) => call[0] === 'sendMessage')[2];
  const button = sent.attachments[0].payload.buttons[0][0];
  assert.strictEqual(button.text, '🔔 Подключить уведомления', 'public invite has required callback label');
  assert.strictEqual(button.payload, 'group_push_enable', 'public invite has required callback payload');
  assert.strictEqual(button.action, 'group_push_enable', 'public invite has required callback action');
  const serializedInvite = JSON.stringify(sent);
  assert(!/\/push\/join\?t=|clck\.ru|endpoint|p256dh|PUSH_ADMIN_TOKEN|BOT_TOKEN|VAPID|private[_ -]?key/i.test(serializedInvite), 'public invite contains no personal link or secret material');
  assert(!/"auth"\s*:|\bauth=/.test(serializedInvite), 'public invite contains no auth material');

  const ordinaryApi = apiFor({ role: 'member' });
  const denied = await publishing.publishGroupPushInvite({
    botToken: 'safe-test-token', requesterId: 'user-pr172', chatId: 'selected-chat-pr172', api: ordinaryApi,
    buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
  });
  assert.strictEqual(denied.error, 'requester_not_admin', 'ordinary member cannot publish');
  assert(!ordinaryApi.calls.some((call) => call[0] === 'sendMessage'), 'ordinary member denial publishes nothing');
  assert.strictEqual(publishing.NON_ADMIN_MESSAGE, 'Не удалось опубликовать приглашение. Публиковать кнопку может только администратор или владелец выбранного чата/канала.', 'non-admin sees required copy');

  for (const scenario of [
    { name: 'missing requester', requesterId: '' },
    { name: 'missing chat', chatId: '' },
    { name: 'MAX chat unavailable', fail: 'getChat' },
    { name: 'bot member unavailable', fail: 'getBotChatMember' },
    { name: 'members unavailable', fail: 'getChatMembers' },
    { name: 'members missing', members: [] },
    { name: 'requester missing from members', members: [{ user_id: 'someone-else', role: 'owner' }] },
    { name: 'role unavailable', role: '' }
  ]) {
    const api = apiFor(scenario);
    const result = await publishing.verifyRequesterCanPublish({ botToken: 'safe-test-token', requesterId: scenario.requesterId === undefined ? 'user-pr172' : scenario.requesterId, chatId: scenario.chatId === undefined ? 'selected-chat-pr172' : scenario.chatId, api });
    assert.strictEqual(result.error, 'verification_failed', `${scenario.name} fails closed`);
  }
  assert.strictEqual(publishing.VERIFICATION_FAILURE_MESSAGE, 'Не удалось проверить права в выбранном чате/канале. Проверьте, что бот добавлен туда администратором, и попробуйте ещё раз.', 'verification failure has required copy');

  assert(onboarding.isGroupPushCommandText('/push'), 'ordinary members retain /push');
  assert(onboarding.isGroupPushEnablePayload('group_push_enable'), 'ordinary members retain group_push_enable callback');
  assert(botSource.includes('return performGroupPushOnboarding({ userId, chatId, chatTitle, config, callbackId });'), 'group callback still enters private onboarding');
  assert(botSource.includes('sentPrivate') && botSource.includes('commandDeleteAttempted'), 'private onboarding safeguards remain wired');

  assert(linkChatSource.includes("app.post('/api/push/link-chat'"), 'PR168 /api/push/link-chat remains unchanged and present');
  assert(publicEntrySource.includes('🔔 Уведомления чатов'), 'PR170 public B2C entrypoint remains visible');
  assert(publicEntrySource.includes('Чтобы подключить уведомления:') && publicEntrySource.includes('Откройте MAX-чат, где установлен бот.'), 'public chat-specific connection copy remains client-safe');
  assert.strictEqual(pkg.buildVersion, 'CC8.3.52-PR177-CHANNELS-PUSH-UX', 'runtime marker advances to PR173');
  assert.strictEqual(pkg.sourceMarker, 'adminkit-pr177-channels-push-ux', 'source marker advances to PR173');
  assert(entrypoint.includes("const RUNTIME='CC8.3.52-PR177-CHANNELS-PUSH-UX'"), 'active entrypoint has PR173 runtime marker');
  assert(entrypoint.includes("const SOURCE='adminkit-pr177-channels-push-ux'"), 'active entrypoint has PR173 source marker');

  console.log('visible push admin flow pr172 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
