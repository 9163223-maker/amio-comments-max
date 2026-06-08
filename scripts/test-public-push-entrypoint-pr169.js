'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const accountScreens = require('../features/account-screens-pr106');
const accountRuntime = require('../src/core/accountRuntime');
const access = require('../services/clientAccessService');

function buttonsOf(screen) {
  return (screen?.attachments?.[0]?.payload?.buttons || []).flat();
}

function actionOf(item = {}) {
  if (!item.payload) return '';
  try { return JSON.parse(item.payload).action || ''; } catch { return ''; }
}

(async () => {
  const maxUserId = `pr169-new-user-${Date.now()}`;
  const previousBaseUrl = process.env.ADMINKIT_PUBLIC_BASE_URL;
  const secretEnvNames = ['PUSH_ADMIN_TOKEN', 'BOT_TOKEN', 'MAX_BOT_TOKEN', 'WEB_PUSH_PRIVATE_KEY'];
  const previousSecrets = Object.fromEntries(secretEnvNames.map((name) => [name, process.env[name]]));

  try {
    process.env.ADMINKIT_PUBLIC_BASE_URL = 'https://public-push.example.test';
    for (const name of secretEnvNames) delete process.env[name];

    assert.strictEqual(access.getClientByMaxUserId(maxUserId), null, 'test user has no registration or tenant-backed client profile');
    assert.strictEqual(access.getAccessState(maxUserId).active, false, 'test user has no active access');
    assert.strictEqual(access.getAccessState(maxUserId).admin, false, 'test user has no admin access');
    assert.deepStrictEqual(access.getClientChannels(maxUserId), [], 'test user owns no channels');

    const gate = accountScreens.accessGateScreen(maxUserId);
    const gateButtons = buttonsOf(gate);
    const pushIndex = gateButtons.findIndex((item) => item.text === '🔔 Уведомления чатов' && actionOf(item) === 'account_push_notifications');
    const activateIndex = gateButtons.findIndex((item) => item.text === 'Активировать код' && actionOf(item) === 'account_activate_code');
    assert(pushIndex === 0, 'new access-gated activation screen shows Push as the first button');
    assert(activateIndex > pushIndex, 'Push button appears before Activate code');
    assert.strictEqual(buttonsOf(accountScreens.expiredScreen(maxUserId))[0].text, '🔔 Уведомления чатов', 'expired access screen shows Push first');
    assert.strictEqual(buttonsOf(accountScreens.activationPrompt(maxUserId))[0].text, '🔔 Уведомления чатов', 'activation prompt shows Push first');
    assert.strictEqual(buttonsOf(accountScreens.accountHome(maxUserId))[0].text, '🔔 Уведомления чатов', 'account home shows Push first');

    assert(accountRuntime.ACCOUNT_ACTIONS.has('account_push_notifications'), 'account runtime recognizes public Push action');
    assert(accountRuntime.ACCOUNT_ACTIONS.has('account_push_notifications_help'), 'account runtime recognizes public Push help action');

    const result = await accountRuntime.buildAccountScreenForUpdate({
      update: {
        callback: {
          payload: JSON.stringify({ action: 'account_push_notifications' }),
          user: { user_id: maxUserId },
          message: { recipient: { chat_id: 'dm-pr169', chat_type: 'dialog' } }
        }
      },
      context: {}
    });
    assert.strictEqual(result.ok, true, 'public Push screen resolves without active access, admin, tenant, or channel');
    assert.strictEqual(result.screen.id, 'account_push_notifications', 'public Push action renders its public screen');
    assert(result.screen.text.includes('Получайте уведомления из MAX-чата на iPhone'), 'public Push screen contains required product copy');
    assert(result.screen.text.includes('Код доступа и регистрация в админке не требуются.'), 'public Push screen states that access and registration are not required');

    const pushButtons = buttonsOf(result.screen);
    const openPush = pushButtons.find((item) => ['Открыть AdminKIT Push', 'Открыть приложение / проверить чаты'].includes(item.text));
    assert(openPush && openPush.type === 'link', 'public Push screen has a direct link button');
    assert(openPush.url.startsWith('https://'), 'public Push link uses an absolute HTTPS URL');
    assert(openPush.url.endsWith('/push'), 'public Push link ends with the public /push route');
    assert(!openPush.url.includes('/push/join?t='), 'public Push link is not a personal join link');
    assert(!/PUSH_ADMIN_TOKEN|(?:bot|BOT)[ _-]?token|endpoint|p256dh|access_token|auth|VAPID|private[_ -]?key/i.test(openPush.url), 'public Push link exposes no token, endpoint, auth, or private key material');
    assert.strictEqual(openPush.url, 'https://public-push.example.test/push', 'public Push button links to the configured public /push route');
    delete process.env.ADMINKIT_PUBLIC_BASE_URL;
    const fallbackOpenPush = buttonsOf(accountScreens.pushNotificationsScreen(maxUserId)).find((item) => ['Открыть AdminKIT Push', 'Открыть приложение / проверить чаты'].includes(item.text));
    assert.strictEqual(fallbackOpenPush.url, 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run/push', 'public Push button uses the required safe fallback /push URL');
    process.env.ADMINKIT_PUBLIC_BASE_URL = 'https://public-push.example.test';
    assert(pushButtons.some((item) => actionOf(item) === 'account_push_notifications_help'), 'public Push screen includes chat connection help');
    assert(pushButtons.some((item) => actionOf(item) === 'account_activate_code'), 'public Push screen keeps code activation available');
    assert(pushButtons.some((item) => item.text === 'Поддержка' && actionOf(item) === 'account_support'), 'access-gated public Push screen returns to support rather than admin menu');

    const serialized = JSON.stringify(result.screen);
    assert(!/\/push\/join\?t=|clck\.ru|PUSH_ADMIN_TOKEN|(?:bot|BOT)[ _-]?token|endpoint|p256dh|access_token|VAPID private key/i.test(serialized), 'public Push screen exposes no personal link, token, endpoint, key, or subscription secret');
    assert(!/"auth"\s*:|\bauth=|\bauth\b/i.test(serialized), 'public Push screen exposes no auth field or credential');

    const fallbackSource = fs.readFileSync(path.join(repoRoot, 'features', 'account-screens-pr106.js'), 'utf8');
    assert(fallbackSource.includes('https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run'), 'public Push screen has the required safe fallback base URL');

    const pkg = require('../package.json');
    const entrypoint = fs.readFileSync(path.join(repoRoot, 'clean-entrypoint-1.53.10-pr89.js'), 'utf8');
    assert.strictEqual(pkg.buildVersion, 'CC8.3.52-PR171-VISIBLE-PUSH-ADMIN-FLOW', 'package build marker advances to PR171');
    assert.strictEqual(pkg.sourceMarker, 'adminkit-pr171-visible-push-admin-flow', 'package source marker advances to PR171');
    assert(entrypoint.includes("const RUNTIME='CC8.3.52-PR171-VISIBLE-PUSH-ADMIN-FLOW'"), 'active entrypoint runtime marker is PR171');
    assert(entrypoint.includes("const SOURCE='adminkit-pr171-visible-push-admin-flow'"), 'active entrypoint source marker is PR171');

    console.log('public push entrypoint pr169 ok');
  } finally {
    if (previousBaseUrl === undefined) delete process.env.ADMINKIT_PUBLIC_BASE_URL;
    else process.env.ADMINKIT_PUBLIC_BASE_URL = previousBaseUrl;
    for (const name of secretEnvNames) {
      if (previousSecrets[name] === undefined) delete process.env[name];
      else process.env[name] = previousSecrets[name];
    }
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
