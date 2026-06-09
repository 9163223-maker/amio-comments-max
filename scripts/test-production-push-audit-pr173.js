'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const publishing = require('../services/groupPushAdminPublishingService');
const onboarding = require('../services/groupPushOnboardingService');
const pkg = require('../package.json');

function apiFor({ role = 'owner', fail = '' } = {}) {
  const calls = [];
  return {
    calls,
    async getChat({ chatId }) { calls.push(['getChat', chatId]); if (fail === 'getChat') throw new Error('offline'); return { chat_id: chatId }; },
    async getBotChatMember({ chatId }) { calls.push(['getBotChatMember', chatId]); if (fail === 'getBotChatMember') throw new Error('offline'); return { user_id: 'bot', role: 'administrator' }; },
    async getChatMembers({ chatId }) { calls.push(['getChatMembers', chatId]); if (fail === 'getChatMembers') throw new Error('offline'); return { members: [{ user_id: 'requester-pr173', role }] }; },
    async sendMessage(args) { calls.push(['sendMessage', args.chatId, args]); return { ok: true }; }
  };
}

(async () => {
  const bot = read('bot.js');
  const routes = read('web-push-routes.js');
  const client = read('public/push-client.js');
  const html = read('public/push.html');
  const entrypoint = read('clean-entrypoint-1.53.10-pr89.js');
  const buildInfo = require('../buildInfo').getBuildInfo();

  assert(bot.includes("text: '🔔 Push-уведомления'") && bot.includes("buildAdminCallbackPayload('admin_section_push')"), 'real admin menu exposes visible Push section');
  for (const label of ['Опубликовать приглашение в чат', 'Как это работает', 'Главное меню']) assert(bot.includes(`text: '${label}'`), `visible Push section contains ${label}`);
  assert(bot.includes('text: `🔔 ${truncateText(chatTitle, 52)}`'), 'multi-chat publish choices include a safe chat/channel title');
  assert(bot.includes("const selectedChatId = String(payload.chatId || '').trim()"), 'product publish callback requires an explicitly selected chat');
  assert(bot.includes('groupPushAdminPublishing.publishGroupPushInvite({'), 'product UI uses chat-scoped publishing service');

  const ownerApi = apiFor({ role: 'owner' });
  const published = await publishing.publishGroupPushInvite({
    botToken: 'test-bot-token', requesterId: 'requester-pr173', chatId: 'chat-pr173', title: 'Audit chat', api: ownerApi,
    buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
  });
  assert.strictEqual(published.ok, true, 'owner can publish after chat-scoped verification');
  assert(ownerApi.calls.slice(0, 3).every((call) => call[1] === 'chat-pr173'), 'all permission checks are scoped to selected chat');

  const memberApi = apiFor({ role: 'member' });
  const denied = await publishing.publishGroupPushInvite({
    botToken: 'test-bot-token', requesterId: 'requester-pr173', chatId: 'chat-pr173', api: memberApi,
    buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
  });
  assert.strictEqual(denied.error, 'requester_not_admin', 'non-admin cannot publish');
  assert(!memberApi.calls.some((call) => call[0] === 'sendMessage'), 'non-admin denial posts no public message');
  for (const fail of ['getChat', 'getBotChatMember', 'getChatMembers']) {
    const result = await publishing.verifyRequesterCanPublish({ botToken: 'test-bot-token', requesterId: 'requester-pr173', chatId: 'chat-pr173', api: apiFor({ fail }) });
    assert.strictEqual(result.error, 'verification_failed', `${fail} failure fails closed`);
  }
  assert.strictEqual(publishing.NON_ADMIN_MESSAGE, 'Опубликовать приглашение может только администратор этого чата или канала.');
  assert.strictEqual(publishing.VERIFICATION_FAILURE_MESSAGE, 'Не удалось проверить права администратора. Проверьте, что бот добавлен в чат и имеет нужные права.');

  assert(routes.includes('Diagnostic/operator-only endpoint for /push/admin'), 'internal group invite endpoint is explicitly diagnostic-only');
  assert(routes.includes("app.post('/internal/max/group-push-invite', requireAdminToken"), 'diagnostic endpoint requires admin token');
  assert(client.includes("if (!state.adminMode) throw new Error('Публикация доступна только в диагностическом режиме администратора.')"), 'diagnostic client publish path is blocked outside admin mode');
  assert(routes.includes("html = stripMarkedHtml(html, 'admin-diagnostics')"), 'normal /push removes diagnostic publishing controls');

  const sent = ownerApi.calls.find((call) => call[0] === 'sendMessage')[2];
  const serializedInvite = JSON.stringify(sent);
  const inviteButton = sent.attachments[0].payload.buttons[0][0];
  assert.strictEqual(inviteButton.text, '🔔 Подключить уведомления');
  assert.strictEqual(inviteButton.payload, 'group_push_enable');
  assert.strictEqual(inviteButton.action, 'group_push_enable');
  assert(!/\/push\/join\?t=|clck\.ru|personal.?token|endpoint|p256dh|PUSH_ADMIN_TOKEN|BOT_TOKEN|VAPID|private.?key/i.test(serializedInvite), 'public invite has no personal link, subscription material, or secret');
  assert(!/"auth"\s*:|\bauth=/.test(serializedInvite), 'public invite has no auth material');

  assert(onboarding.isGroupPushCommandText('/push'), 'ordinary group /push remains supported');
  assert(onboarding.isGroupPushEnablePayload('group_push_enable'), 'ordinary callback remains supported');
  assert(bot.includes('return performGroupPushOnboarding({ userId, chatId, chatTitle, config, callbackId });'), 'callback onboarding remains DM-only');
  assert(bot.includes('await sendMessage({\n      botToken: config.botToken,\n      userId,'), 'personal join link is sent to user DM');
  assert(bot.includes("if (groupPushOnboarding.isGroupPushCommandText(normalized)) return 'push_command';"), '/push command is excluded from live dispatch');
  assert(routes.includes("app.post('/api/push/link-chat'"), 'PR168 link-chat route remains present');
  assert(client.includes("fetchJson('/api/push/link-chat', { method: 'POST', body: JSON.stringify({}) })"), 'existing-device add-chat client path remains unchanged');
  assert(client.includes('Подключить этот чат'), 'link-chat product label remains present');

  assert.strictEqual(pkg.version, 'CC8.3.52-PR176-COMMENTS-UX-GIFTS-RESET');
  assert.strictEqual(pkg.sourceMarker, 'adminkit-pr176-comments-ux-gifts-reset');
  assert.strictEqual(buildInfo.runtimeVersion, pkg.version);
  assert.strictEqual(buildInfo.buildVersion, pkg.version);
  assert.strictEqual(buildInfo.sourceMarker, pkg.sourceMarker);
  assert(entrypoint.includes("const RUNTIME='CC8.3.52-PR176-COMMENTS-UX-GIFTS-RESET'"));
  assert(entrypoint.includes("const SOURCE='adminkit-pr176-comments-ux-gifts-reset'"));

  console.log('production push audit pr173 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
