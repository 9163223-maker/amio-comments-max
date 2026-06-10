'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const accountScreens = require('../features/account-screens-pr106');
const groupPush = require('../services/groupPushOnboardingService');
const slash = require('../services/nativeSlashCommands');

function buttons(screen) {
  return (screen.attachments?.[0]?.payload?.buttons || []).flat().map((item) => item.text);
}

(function run() {
  const start = accountScreens.activationScreen();
  const startButtons = buttons(start);
  assert(start.text.includes('подключить уведомления для MAX-чатов'), 'ordinary /start is client-safe');
  assert.strictEqual(startButtons[0], '🔔 Уведомления чатов', 'notifications are the primary ordinary-user action');
  assert(startButtons.includes('Я администратор'), 'admin activation is secondary');
  for (const forbidden of ['Комментарии', 'Подарки', 'Каналы', 'Статистика', 'Debug']) assert(!startButtons.some((text) => text.includes(forbidden)), `${forbidden} is absent from ordinary /start`);

  const empty = accountScreens.pushNotificationsScreen('ordinary-user');
  assert(empty.text.includes('1. Откройте MAX-чат'), 'private notification flow explains group-first connection');
  assert(empty.text.includes('/push'), 'private notification flow names the simple command');
  assert(!/API|token|endpoint|binding|handoff|device id|auth|p256dh/i.test(empty.text), 'private notification flow is non-technical');

  const existing = accountScreens.pushNotificationsScreen('ordinary-user', { chats: [{ chatTitle: 'Мож Хвост 3' }, { title: 'Все свои MAX' }, { chatTitle: 'Мож Хвост 3' }] });
  assert(existing.text.includes('У вас уже подключены уведомления для чатов:'), 'existing chats have a simple heading');
  assert.strictEqual((existing.text.match(/Мож Хвост 3/g) || []).length, 1, 'existing chat names are unique');
  assert(buttons(existing).includes('Как добавить ещё чат'), 'existing-chat flow explains adding another chat');

  const first = groupPush.buildPrivateJoinMessage({ chatTitle: 'Мож Хвост 3', joinUrl: 'https://example.test/join' });
  assert(first.includes('АдминКИТ PUSH') && first.includes('экран Домой'), 'first-device group flow uses unified friendly install copy');
  assert(!/API|token|endpoint|binding|handoff|PWA|auth|p256dh/i.test(first), 'first-device group flow is non-technical');
  assert.strictEqual(groupPush.buildPrivateJoinKeyboard('https://example.test/join')[0].payload.buttons[0][0].text, 'Открыть подключение', 'first-device CTA opens connection');

  const later = groupPush.buildPrivateJoinMessage({ chatTitle: 'Все свои MAX', joinUrl: 'https://example.test/join', alreadyHadActiveDevice: true });
  assert(later.includes('Подключить этот чат'), 'existing-device flow explains adding this chat');
  assert(!later.includes('переустанов'), 'existing-device flow does not request reinstall');
  assert.strictEqual(groupPush.buildPrivateJoinKeyboard('https://example.test/join', { alreadyHadActiveDevice: true })[0].payload.buttons[0][0].text, 'Подключить этот чат', 'existing-device CTA is explicit');

  const already = groupPush.buildPrivateJoinMessage({ chatTitle: 'Все свои MAX', joinUrl: 'https://example.test/join', alreadyHadActiveDevice: true, alreadyBound: true });
  assert(already.includes('Этот чат уже подключён к уведомлениям.'), 'already-connected group flow is explicit');
  assert.strictEqual(groupPush.buildPrivateJoinKeyboard('https://example.test/join', { alreadyBound: true })[0].payload.buttons[0][0].text, 'Открыть АдминКИТ PUSH', 'already-connected CTA opens the app');

  assert.deepStrictEqual(slash.PUBLIC_GROUP_COMMANDS, ['/push', '/help'], 'group-visible command model is client-safe only');
  for (const command of ['/menu', '/channels', '/comments', '/gifts', '/debug']) assert(slash.ADMIN_PRIVATE_COMMANDS.includes(command), `${command} remains available in private/admin handling`);
  const groupMessage = { recipient: { chat_id: 'group-1', chat_type: 'chat' }, sender: { user_id: 'ordinary-user' } };
  for (const command of ['/menu', '/channels', '/comments', '/gifts', '/debug']) assert.strictEqual(slash.isCommandAllowedInContext({ command, message: groupMessage, userId: 'ordinary-user' }), false, `${command} fails closed for ordinary group user`);
  assert.strictEqual(slash.isCommandAllowedInContext({ command: '/help', message: groupMessage, userId: 'ordinary-user' }), true, '/help remains available in groups');
  assert.strictEqual(slash.getNativeSlashCommand('/menu'), '/menu', 'private/admin command parser remains intact');

  const repo = path.join(__dirname, '..');
  const commandRegistry = fs.readFileSync(path.join(repo, 'performance-debug-routes-pr73.js'), 'utf8');
  const registryBlock = commandRegistry.slice(commandRegistry.indexOf('const ADMINKIT_MAX_COMMANDS'), commandRegistry.indexOf('function clean'));
  assert(registryBlock.includes("name: 'push'") && registryBlock.includes("name: 'help'"), 'global MAX suggestions contain /push and /help');
  for (const command of ['menu', 'channels', 'comments', 'gifts', 'stats', 'debug', 'clear']) assert(!registryBlock.includes(`name: '${command}'`), `global MAX suggestions exclude /${command}`);
  assert(commandRegistry.includes("global-only-undocumented-patch-me"), 'MAX scoped-command limitation is documented in runtime diagnostics');

  const html = fs.readFileSync(path.join(repo, 'public', 'push.html'), 'utf8');
  const client = fs.readFileSync(path.join(repo, 'public', 'push-client.js'), 'utf8');
  assert(html.includes('<h1>АдминКИТ PUSH</h1>') && html.includes('apple-mobile-web-app-title" content="АдминКИТ PUSH'), 'PWA visible name is unified');
  assert(client.includes("const JOIN_SUCCESS_MESSAGE = 'Готово — уведомления подключены.'"), 'first success has one clear message');
  assert(client.includes("const LINK_CHAT_SUCCESS_MESSAGE = 'Готово — чат добавлен.'"), 'later chat success is distinct');
  assert(!client.includes("setText('enableBtn', 'Уведомления подключены')"), 'success is not rendered as a primary CTA');
  assert(html.includes('.chat-card { display: flex;') && html.includes('padding: 9px 11px'), 'connected chat rows are compact');
  assert(client.includes("status: 'включены'") && client.includes('uniqueChatItems'), 'compact connected chat items are unique and readable');

  console.log('push group ux polish pr185 ok');
})();
