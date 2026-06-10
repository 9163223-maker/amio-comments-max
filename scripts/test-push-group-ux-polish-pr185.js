'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const accountScreens = require('../features/account-screens-pr106');
const groupPush = require('../services/groupPushOnboardingService');
const slash = require('../services/nativeSlashCommands');
const maxCommandRegistry = require('../services/maxCommandRegistryService');

function buttons(screen) {
  return (screen.attachments?.[0]?.payload?.buttons || []).flat().map((item) => item.text);
}

(function run() {
  const start = accountScreens.activationScreen();
  const startButtons = buttons(start);
  assert(start.text.includes('подключить уведомления для MAX-чатов'), 'ordinary /start is client-safe');
  assert.strictEqual(startButtons[0], '🔔 Мои уведомления', 'notifications are the primary ordinary-user action');
  assert(startButtons.includes('Что умеет АдминКИТ для MAX'), 'sales funnel is secondary without exposing activation on the first screen');
  for (const forbidden of ['Комментарии', 'Подарки', 'Каналы', 'Статистика', 'Debug']) assert(!startButtons.some((text) => text.includes(forbidden)), `${forbidden} is absent from ordinary /start`);

  const empty = accountScreens.pushNotificationsScreen('ordinary-user');
  assert(empty.text.includes('Подключённые чаты хранятся отдельно на каждом устройстве.'), 'notification status stays device-scoped');
  const connectHelp = accountScreens.pushNotificationsHelpScreen('ordinary-user');
  assert(connectHelp.text.includes('1. Откройте MAX-чат') && connectHelp.text.includes('/push'), 'separate connection screen explains group-first connection');
  assert(!/API|token|endpoint|binding|handoff|device id|auth|p256dh/i.test(connectHelp.text), 'private notification flow is non-technical');

  const existing = accountScreens.pushNotificationsScreen('ordinary-user', { chats: [{ chatTitle: 'Мож Хвост 3', enabledOnThisDevice: true }, { title: 'Все свои MAX', needsReconnect: true }, { chatTitle: 'Мож Хвост 3', enabledOnThisDevice: true }] });
  assert(existing.text.includes('Подключённые чаты хранятся отдельно на каждом устройстве.'), 'MAX screen delegates the device-scoped list to the PWA');
  assert(!existing.text.includes('Другие доступные чаты:'));
  assert(!existing.text.includes('Мож Хвост 3') && !existing.text.includes('Все свои MAX'), 'MAX screen does not aggregate chat names across devices');
  assert(existing.text.includes('Откройте ссылку на устройстве, где нужны уведомления.'), 'connection instruction remains device-scoped');
  assert(buttons(existing).includes('➕ Подключить чат'), 'screen keeps the connect action');

  const first = groupPush.buildPrivateJoinMessage({ chatTitle: 'Мож Хвост 3', joinUrl: 'https://example.test/join' });
  assert(first.includes('АдминКИТ PUSH') && first.includes('включите уведомления'), 'first-device group flow uses unified friendly install copy');
  assert(!/API|token|endpoint|binding|handoff|PWA|auth|p256dh/i.test(first), 'first-device group flow is non-technical');
  assert.strictEqual(groupPush.buildPrivateJoinKeyboard('https://example.test/join')[0].payload.buttons[0][0].text, 'Открыть подключение', 'first-device CTA opens connection');

  const later = groupPush.buildPrivateJoinMessage({ chatTitle: 'Все свои MAX', joinUrl: 'https://example.test/join', alreadyHadActiveDevice: true });
  assert(later.includes('подключите этот чат'), 'existing-device flow always issues a fresh enable flow');
  assert(!later.includes('переустанов'), 'existing-device flow does not request reinstall');
  assert.strictEqual(groupPush.buildPrivateJoinKeyboard('https://example.test/join', { alreadyHadActiveDevice: true })[0].payload.buttons[0][0].text, 'Открыть подключение', 'existing-device CTA always opens a fresh connection');

  const already = groupPush.buildPrivateJoinMessage({ chatTitle: 'Все свои MAX', joinUrl: 'https://example.test/join', alreadyHadActiveDevice: true, alreadyBound: true });
  assert(!already.includes('уже подключ'), 'old bindings never block a fresh link');
  assert.strictEqual(groupPush.buildPrivateJoinKeyboard('https://example.test/join', { alreadyBound: true })[0].payload.buttons[0][0].text, 'Открыть подключение', 'already-connected state still opens a fresh connection');

  assert.deepStrictEqual(slash.PUBLIC_GROUP_COMMANDS, ['/push', '/help'], 'group-visible command model is client-safe only');
  for (const command of ['/menu', '/channels', '/comments', '/gifts', '/debug']) assert(slash.ADMIN_PRIVATE_COMMANDS.includes(command), `${command} remains available in private/admin handling`);
  const groupMessage = { recipient: { chat_id: 'group-1', chat_type: 'chat' }, sender: { user_id: 'ordinary-user' } };
  for (const command of ['/menu', '/channels', '/comments', '/gifts', '/debug']) assert.strictEqual(slash.isCommandAllowedInContext({ command, message: groupMessage, userId: 'ordinary-user' }), false, `${command} fails closed for ordinary group user`);
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/help', message: groupMessage, userId: 'ordinary-user' }), true, '/help remains available in groups');
  assert.strictEqual(slash.getNativeSlashCommand('/menu'), '/menu', 'private/admin command parser remains intact');

  const repo = path.join(__dirname, '..');
  assert.deepStrictEqual(maxCommandRegistry.GLOBAL_COMMAND_NAMES, ['/push', '/help'], 'global MAX suggestions contain only /push and /help');
  assert.strictEqual(maxCommandRegistry.SCOPE_SUPPORT, 'global-only-no-public-scopes', 'MAX public API has no command scopes, so admin commands are not global');

  const html = fs.readFileSync(path.join(repo, 'public', 'push.html'), 'utf8');
  const client = fs.readFileSync(path.join(repo, 'public', 'push-client.js'), 'utf8');
  assert(html.includes('<h1>АдминКИТ PUSH</h1>') && html.includes('apple-mobile-web-app-title" content="АдминКИТ PUSH'), 'PWA visible name is unified');
  assert(client.includes("const JOIN_SUCCESS_MESSAGE = 'Готово. Уведомления включены.'"), 'first success has one clear message');
  assert(client.includes('Готово. Уведомления включены для чата'), 'chat success names the linked chat');
  assert(!client.includes("setText('enableBtn', 'Уведомления подключены')"), 'success is not rendered as a primary CTA');
  assert(html.includes('.chat-card { display: flex;') && html.includes('padding: 9px 11px'), 'connected chat rows are compact');
  assert(client.includes('uniqueChatItems') && client.includes("button.textContent = '×'"), 'compact connected chat items are unique and can be disconnected');

  console.log('push group ux polish pr185 ok');
})();
