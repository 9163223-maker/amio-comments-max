'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const webPushRoutes = require('../web-push-routes');

const repoRoot = path.join(__dirname, '..');
const pushHtml = fs.readFileSync(path.join(repoRoot, 'public', 'push.html'), 'utf8');
const pushClient = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const routesSource = fs.readFileSync(path.join(repoRoot, 'web-push-routes.js'), 'utf8');
const groupPush = require('../services/groupPushOnboardingService');

function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
function request(server, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const body = options.body ? JSON.stringify(options.body) : '';
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: pathname, method: options.method || 'GET', headers: { 'Content-Type': 'application/json', ...(options.headers || {}), ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const app = express();
  app.use(express.json());
  webPushRoutes.install(app);
  const server = await listen(app);
  try {
    const normalPush = await request(server, '/push');
    assert.strictEqual(normalPush.status, 200, '/push client page is served');
    const joinPush = await request(server, '/push/join');
    assert.strictEqual(joinPush.status, 400, '/push/join without token is safe error page');

    for (const page of [normalPush.text, joinPush.text]) {
      assert(page.includes('АдминКИТ Push'), 'normal Push UI keeps product title');
      assert(page.includes('Включить уведомления') || page.includes('Откройте новую ссылку из MAX') || page.includes('Откройте ссылку из MAX') || page.includes('Вернитесь в MAX'), 'normal Push UI is human-facing');
      assert(!page.includes('Последний результат'), 'normal Push UI hides last result diagnostics');
      assert(!page.includes('endpoint'), 'normal Push UI hides endpoint diagnostics');
      assert(!page.includes('p256dh'), 'normal Push UI hides p256dh diagnostics');
      assert(!page.includes('auth'), 'normal Push UI hides auth diagnostics');
      assert(!page.includes('/push/join?t='), 'normal Push UI does not render full join links');
      assert(!page.includes('PUSH_ADMIN_TOKEN') && !page.includes('PUSH_SUBSCRIBE_TOKEN'), 'normal Push UI hides token fields');
      assert(!page.includes('Персональная ссылка найдена'), 'normal Push UI hides technical personal-link wording');
    }
    assert(normalPush.text.includes('Подключённые чаты'), '/push shows connected chats section');
    assert(normalPush.text.includes('Откройте ссылку из MAX или нажмите кнопку подключения в чате.'), '/push shows clean empty state');
    assert(normalPush.text.includes('/public/adminkit-push-icon-192.png?v=pr167'), '/push references AdminKIT Push app icon');
    assert(normalPush.text.includes('rel="apple-touch-icon"') && normalPush.text.includes('adminkit-push-icon-192.png?v=pr167'), 'iOS apple touch icon uses AdminKIT Push icon');

    const manifest = (await request(server, '/push/manifest.json')).json();
    assert(manifest.icons.some((icon) => icon.src === '/public/adminkit-push-icon-192.png?v=pr167' && /maskable/.test(icon.purpose || '')), 'manifest contains cache-busted maskable 192 icon');
    assert(manifest.icons.some((icon) => icon.src === '/public/adminkit-push-icon-512.png?v=pr167' && /maskable/.test(icon.purpose || '')), 'manifest contains cache-busted maskable 512 icon');

    const adminPush = await request(server, '/push/admin');
    assert.strictEqual(adminPush.status, 200, '/push/admin page is served');
    assert(adminPush.text.includes('Опубликовать приглашение Push в чат'), 'admin UI exposes Push invite action');
    assert(pushClient.includes("fetchJsonUnsafeAdmin('/internal/max/group-push-invite'"), 'admin action posts to existing group invite endpoint');
    assert(pushClient.includes('Приглашение опубликовано в чат.'), 'admin action shows safe success message');
    assert(pushClient.includes('Не удалось определить чат. Выберите чат вручную.'), 'admin action has safe chat-selection error');

    const inviteText = groupPush.buildGroupInviteText('PR167 Group');
    const keyboard = groupPush.buildGroupInviteKeyboard();
    const button = keyboard[0].payload.buttons[0][0];
    assert(inviteText.includes('Включите уведомления этого чата на iPhone. Нажмите кнопку — бот отправит персональную ссылку в личные сообщения.'), 'group invite uses clean product copy');
    assert(!/\/push\/join\?t=|clck\.ru|access_token|PUSH_ADMIN_TOKEN|BOT_TOKEN/.test(inviteText), 'group invite text contains no personal link or token');
    assert.strictEqual(button.type, 'callback', 'published group invite keeps callback button');
    assert.notStrictEqual(button.type, 'message', 'published group invite is not a message button');
    assert.strictEqual(button.payload, 'group_push_enable', 'published group invite payload is group_push_enable');
    assert.strictEqual(button.action, 'group_push_enable', 'published group invite action is group_push_enable');

    assert(routesSource.includes("app.post('/internal/max/group-push-invite'"), 'existing server endpoint remains active');
    assert(routesSource.includes('storage.listChatBindingsForUser'), 'client status returns safe connected chat list');
    assert(pushHtml.includes('connectedChatsList') && pushClient.includes('renderConnectedChats'), 'PWA renders connected chat list without secrets');
    assert(!/access_token|VAPID private key|pairing secret/i.test(normalPush.text), 'normal PWA shell does not expose secret labels');
    console.log('push product ux admin invite pr167 ok');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exit(1); });
