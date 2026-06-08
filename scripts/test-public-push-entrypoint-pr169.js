'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const accountScreens = require('../features/account-screens-pr106');
const groupPush = require('../services/groupPushOnboardingService');
const pkg = require('../package.json');

const accountSource = fs.readFileSync(path.join(repoRoot, 'features', 'account-screens-pr106.js'), 'utf8');
const botSource = fs.readFileSync(path.join(repoRoot, 'bot.js'), 'utf8');
const cleanBotSource = fs.readFileSync(path.join(repoRoot, 'clean-bot-campaign-attribution-cc8336.js'), 'utf8');
const nativeSlashSource = fs.readFileSync(path.join(repoRoot, 'services', 'nativeSlashCommands.js'), 'utf8');
const pushRoutesSource = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');
const pushClientSource = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const entrypointSource = fs.readFileSync(path.join(repoRoot, 'clean-entrypoint-1.53.10-pr89.js'), 'utf8');

function labels(screen) {
  return (screen.attachments || [])
    .flatMap((attachment) => attachment && attachment.payload && Array.isArray(attachment.payload.buttons) ? attachment.payload.buttons : [])
    .flatMap((row) => row || [])
    .map((button) => button && button.text)
    .filter(Boolean);
}

function serialized(value) { return JSON.stringify(value); }
function assertNoLeak(label, value) {
  const text = typeof value === 'string' ? value : serialized(value);
  const forbidden = [
    'PUSH_ADMIN_TOKEN',
    'BOT_TOKEN_PR169_MUST_NOT_LEAK',
    'MAX_BOT_TOKEN_PR169_MUST_NOT_LEAK',
    '/push/join?t=',
    'clck.ru/pr169-personal',
    'endpoint-pr169-secret',
    'auth-pr169-secret',
    'p256dh-pr169-secret',
    'WEB_PUSH_PRIVATE_KEY',
    'VAPID_PRIVATE_KEY'
  ];
  for (const item of forbidden) assert(!text.includes(item), `${label} must not expose ${item}`);
}

process.env.BOT_TOKEN = 'BOT_TOKEN_PR169_MUST_NOT_LEAK';
process.env.MAX_BOT_TOKEN = 'MAX_BOT_TOKEN_PR169_MUST_NOT_LEAK';
process.env.PUSH_ADMIN_TOKEN = 'PUSH_ADMIN_TOKEN_PR169_MUST_NOT_LEAK';

const start = accountScreens.gateMenuForUser('new-user-without-activation-pr169');
assert.strictEqual(start.id, 'pr106_activation_required', 'new user without activation code sees public activation/start menu');
const startLabels = labels(start);
assert(startLabels.includes('🔔 Уведомления чатов'), 'public /start menu contains top-level Push entrypoint');
assert(startLabels.indexOf('🔔 Уведомления чатов') !== -1 && startLabels.indexOf('🔔 Уведомления чатов') < startLabels.indexOf('Активировать код'), 'Push entrypoint is placed before activation code action');
assertNoLeak('public /start menu', start);

const push = accountScreens.screenForAction('public_push_entry', 'new-user-without-activation-pr169');
assert.strictEqual(push.id, 'public_push_entry', 'public Push action opens B2C Push screen');
assert(push.text.includes('Получайте уведомления из MAX-чата на iPhone'), 'Push screen contains B2C value proposition');
assert(push.text.includes('напишите /push'), 'Push screen explains /push instruction');
assert(push.text.includes('чат ещё не выбран') && push.text.includes('самого MAX-чата или группы'), 'Push screen does not pretend a chat is selected from private DM');
const pushButtons = (push.attachments[0].payload.buttons || []).flat();
assert(pushButtons.some((button) => button.text === 'Открыть AdminKIT Push' && button.type === 'link' && button.url === '/push'), 'Push screen has safe public /push PWA open action');
assert(pushButtons.some((button) => button.text === 'Как подключить чат'), 'Push screen has how-to action');
assert(pushButtons.some((button) => button.text === 'Главное меню'), 'Push screen has main menu action');
assertNoLeak('public Push screen', push);

const how = accountScreens.screenForAction('public_push_how', 'new-user-without-activation-pr169');
assert(how.text.includes('Персональная ссылка отправляется только вам в личные сообщения'), 'how-to screen explains private-only personal links');
assertNoLeak('public Push how screen', how);

assert(accountSource.includes("if (a === 'public_push_entry') return publicPushScreen"), 'public Push callback is routed through account/public action routing before access gate');
assert(cleanBotSource.includes('const accountScreen = accountScreens.screenForAction(action, uid);'), 'active clean bot callback router handles account/public screens before feature access gate');
assert(cleanBotSource.includes('accountScreens.gateMenuForUser(uid)') && nativeSlashSource.includes('accountScreens.gateMenuForUser(userId)'), 'public /start menu uses account gate menu for normal users');
assert(!/public_push_entry[\s\S]{0,800}(activateCode|checkAction|tenant|isAdmin|PUSH_ADMIN_TOKEN)/.test(accountSource), 'public Push entrypoint requires no activation code, tenant, admin access, tariff, channel ownership, or manual token');

assert(pushRoutesSource.includes("app.get('/push'") && pushRoutesSource.includes("sendPushPage(req, res, { mode: 'client', joinMode: false })"), 'active public PWA landing is /push');
assert(pushRoutesSource.includes("app.get('/push/join'") && pushRoutesSource.includes("app.post('/api/push/link-chat'"), 'PR168 join/link-chat routes remain present');
assert(pushClientSource.includes("fetchJson('/api/push/link-chat'"), 'PR168 browser link-chat POST remains wired');

assert(botSource.includes('handleGroupPushCommandMessage') && botSource.includes('deleteGroupPushCommandMessage') && botSource.includes('sendMessage({\n      botToken: config.botToken,\n      userId,'), 'group /push command still sends personal link in DM and attempts command deletion');
assert(botSource.includes('groupPushOnboarding.isGroupPushEnablePayload(payload)') && botSource.includes('return performGroupPushOnboarding({ userId, chatId, chatTitle, config, callbackId })'), 'group_push_enable callback still routes through private onboarding');
const inviteKeyboard = groupPush.buildGroupInviteKeyboard();
const inviteButton = inviteKeyboard[0].payload.buttons[0][0];
assert.strictEqual(inviteButton.payload, 'group_push_enable', 'safe group invite uses group_push_enable callback');
assertNoLeak('group invite keyboard', inviteKeyboard);

assert.strictEqual(pkg.sourceMarker, 'adminkit-pr169-public-push-entrypoint', 'package source marker updated to PR169');
assert(entrypointSource.includes("const SOURCE='adminkit-pr169-public-push-entrypoint'"), 'entrypoint source marker updated to PR169');
assert(entrypointSource.includes('CC8.3.53-PR169-PUBLIC-PUSH-ENTRYPOINT'), 'entrypoint runtime marker updated to PR169');

console.log('PR169 public Push entrypoint tests passed');
