'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedPairingFile = path.join(repoRoot, 'data', 'push-pairing-used.json');
const originalFetch = global.fetch;
const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_PAIRING_SECRET', 'BOT_TOKEN', 'PUBLIC_BASE_URL', 'ADMINKIT_PUBLIC_BASE_URL', 'APP_BASE_URL'];

function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function restoreEnv(originalEnv) { for (const key of ENV_KEYS) delete process.env[key]; for (const [key, value] of Object.entries(originalEnv)) if (value !== undefined) process.env[key] = value; }
function responseStub() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function validSubscription(suffix) { return { endpoint: `https://push.example.test/send/${suffix}`, expirationTime: null, keys: { p256dh: `p256dh-${suffix}`, auth: `auth-${suffix}` } }; }
function extractJoinToken(text) { const match = String(text || '').match(/\/push\/join\?t=([^\s"']+)/); return match ? decodeURIComponent(match[1]) : ''; }
function assertNoSecretLeak(value, label) { assert(!/(PAIRING_SECRET|PRIVATE_KEY|BOT_TOKEN|p256dh-|auth-|\/push\/join\?t=ey|https:\/\/clck\.ru\/pr166)/.test(JSON.stringify(value)), `${label} is sanitized`); }

function callbackUpdate({ callbackId = 'cb-pr166', userId = 'click-user-pr166', otherUserId = 'other-user-pr166', chatId = 'group-chat-pr166', title = 'PR166 Group' } = {}) {
  return {
    update_type: 'message_callback',
    callback: {
      id: callbackId,
      payload: 'group_push_enable',
      user: { user_id: userId, first_name: 'Clicker' },
      message: {
        sender: { user_id: otherUserId, first_name: 'Pinned Author' },
        recipient: { chat_id: chatId, chat_type: 'chat', title },
        body: { text: 'Pinned invite' }
      }
    }
  };
}

function messageUpdate({ id = 'cmd-pr166', text = '/push', userId = 'typed-user-pr166', chatId = 'typed-chat-pr166', title = 'Typed Group' } = {}) {
  return {
    update_type: 'message_created',
    message: {
      id,
      body: { text },
      sender: userId ? { user_id: userId, first_name: 'Typed' } : {},
      recipient: chatId ? { chat_id: chatId, chat_type: 'chat', title } : {}
    }
  };
}

(async () => {
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedPairingFile);
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalMaxApi = require.cache[require.resolve('../services/maxApi')];
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    try { fs.unlinkSync(storageFile); } catch {}
    try { fs.unlinkSync(usedPairingFile); } catch {}
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR166';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR166_MUST_NOT_LEAK';
    process.env.WEB_PUSH_SUBJECT = 'mailto:pr166@example.test';
    process.env.PUSH_PAIRING_SECRET = 'PAIRING_SECRET_PR166_MUST_NOT_LEAK';
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR166_MUST_NOT_LEAK';
    process.env.PUBLIC_BASE_URL = 'https://push.example.test';

    const groupPush = fresh('../services/groupPushOnboardingService');
    const inviteText = groupPush.buildGroupInviteText('PR166 Group');
    const inviteKeyboard = groupPush.buildGroupInviteKeyboard();
    const inviteButton = inviteKeyboard[0].payload.buttons[0][0];
    assert(inviteText.includes('Нажмите кнопку — бот отправит персональную ссылку в личные сообщения.'), 'invite text promotes private callback onboarding');
    assert.strictEqual(inviteButton.type, 'callback', 'group invite button is callback');
    assert.notStrictEqual(inviteButton.type, 'message', 'group invite button is not message');
    assert.strictEqual(inviteButton.payload, 'group_push_enable', 'group invite payload is group_push_enable');
    assert.strictEqual(inviteButton.action, 'group_push_enable', 'group invite action is group_push_enable');
    assert.notStrictEqual(inviteButton.payload, '/push', 'group invite button does not send /push');

    const sentMessages = [];
    const answers = [];
    const deletes = [];
    const maxApiPath = require.resolve('../services/maxApi');
    require.cache[maxApiPath] = {
      id: maxApiPath,
      filename: maxApiPath,
      loaded: true,
      exports: {
        sendMessage: async (args) => { sentMessages.push(args); if (args.userId === 'dm-fails-pr166') throw new Error('dm_forbidden'); return { ok: true }; },
        answerCallback: async (args) => { answers.push(args); return { ok: true }; },
        editMessage: async () => ({ ok: true }),
        deleteMessage: async (args) => { deletes.push(args); if (args.messageId === 'cmd-delete-fails-pr166') throw new Error('delete_forbidden'); return { ok: true }; },
        getBotChatMember: async () => ({ ok: true }),
        getChat: async () => ({ ok: true }),
        createUpload: async () => ({ url: 'https://upload.example.test' }),
        uploadBinaryToUrl: async () => ({ token: 'upload-token' }),
        buildUploadAttachmentPayload: () => ({ type: 'image', payload: { token: 'upload-token' } })
      }
    };

    const clckCalls = [];
    global.fetch = async (url) => { clckCalls.push(String(url)); return { ok: true, status: 200, async text() { return `https://clck.ru/pr166-${clckCalls.length}`; } }; };

    const bot = fresh('../bot');
    const storage = fresh('../services/webPushStorage');
    const pairing = fresh('../services/pushPairingService');

    let res = responseStub();
    await bot.handleWebhook({ get: () => '', body: callbackUpdate() }, res, { botToken: 'BOT_TOKEN_PR166_MUST_NOT_LEAK', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(res.statusCode, 200, 'callback returns HTTP 200');
    assert.strictEqual(sentMessages.length, 1, 'callback sends exactly one DM');
    assert.strictEqual(sentMessages[0].userId, 'click-user-pr166', 'callback DM goes to clicking user');
    assert.notStrictEqual(sentMessages[0].userId, 'other-user-pr166', 'callback does not DM pinned-message author');
    assert(!sentMessages[0].chatId, 'callback DM is not sent to group');
    assert.strictEqual(sentMessages.filter((msg) => msg.chatId === 'group-chat-pr166').length, 0, 'callback posts no public group message');
    assert.strictEqual(deletes.length, 0, 'callback button creates no /push command message to delete');
    assert(answers.some((answer) => answer.notification === 'Ссылка отправлена в личные сообщения.'), 'callback answer is short and ephemeral');
    assert(!answers.some((answer) => /\/push\/join\?t=|clck\.ru/.test(String(answer.notification || ''))), 'callback answer exposes no link');
    let firstToken = extractJoinToken(new URL(clckCalls[0]).searchParams.get('url'));
    assert.strictEqual(pairing.verifyPairingToken(firstToken, { allowUsed: true }).maxUserId, 'click-user-pr166', 'callback token is issued for clicking user');
    assert.strictEqual(pairing.verifyPairingToken(firstToken, { allowUsed: true }).chatId, 'group-chat-pr166', 'callback token is issued for source group chat');

    await storage.savePairedDevice(validSubscription('active-existing'), { maxUserId: 'click-user-pr166', chatId: 'group-chat-pr166', status: 'active' });
    sentMessages.length = 0; answers.length = 0;
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: callbackUpdate({ callbackId: 'cb-pr166-repeat' }) }, res, { botToken: 'BOT_TOKEN_PR166_MUST_NOT_LEAK', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(sentMessages.length, 1, 'existing active device still gets a new private DM');
    assert(sentMessages[0].text.includes('уже есть подключённое устройство'), 'existing active device private DM explains another-device link');
    const secondToken = extractJoinToken(new URL(clckCalls[1]).searchParams.get('url'));
    assert(secondToken && secondToken !== firstToken, 'repeated callback creates a fresh unused join token');
    assert.strictEqual(await storage.isChatBoundForUser('click-user-pr166', 'group-chat-pr166'), true, 'existing active device remains bound to the chat');

    sentMessages.length = 0; answers.length = 0; deletes.length = 0;
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ id: 'cmd-ok-pr166' }) }, res, { botToken: 'BOT_TOKEN_PR166_MUST_NOT_LEAK', appBaseUrl: 'https://push.example.test', webPushClient: { sendNotification: async () => { throw new Error('must_not_dispatch_push_command'); } } });
    assert.strictEqual(res.statusCode, 200, 'typed /push returns HTTP 200');
    assert.strictEqual(sentMessages.filter((msg) => msg.userId === 'typed-user-pr166').length, 1, 'typed /push sends fresh link in private DM');
    assert.strictEqual(sentMessages.filter((msg) => msg.chatId === 'typed-chat-pr166').length, 0, 'typed /push sends no public status/link to group on success');
    assert(deletes.some((item) => item.messageId === 'cmd-ok-pr166'), 'typed /push attempts best-effort command deletion');
    const dispatchSummary = bot.getPushDispatchDiagnostics(10);
    assert(dispatchSummary.latest.some((item) => item.skippedReason === 'push_command'), '/push is recorded as skipped and not dispatched as web push');

    sentMessages.length = 0; deletes.length = 0;
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ id: 'cmd-delete-fails-pr166', userId: 'delete-fail-user-pr166', chatId: 'delete-fail-chat-pr166' }) }, res, { botToken: 'BOT_TOKEN_PR166_MUST_NOT_LEAK', appBaseUrl: 'https://push.example.test' });
    assert.strictEqual(res.statusCode, 200, 'delete failure still returns HTTP 200');
    assert(sentMessages.some((msg) => msg.userId === 'delete-fail-user-pr166'), 'delete failure does not block private onboarding');
    const latestDeleteDiag = bot.getGroupPushInboundDiagnostics(10).latest.slice(-1)[0];
    assert.strictEqual(latestDeleteDiag.commandDeleteAttempted, true, 'diagnostics record delete attempt');
    assert.strictEqual(latestDeleteDiag.commandDeleteOk, false, 'diagnostics record delete failure');
    assert.strictEqual(latestDeleteDiag.commandDeleteFailedReason, 'delete_forbidden', 'diagnostics record sanitized delete failure reason');

    sentMessages.length = 0;
    res = responseStub();
    await bot.handleWebhook({ get: () => '', body: messageUpdate({ id: 'cmd-dm-fails-pr166', userId: 'dm-fails-pr166', chatId: 'dm-fails-chat-pr166' }) }, res, { botToken: 'BOT_TOKEN_PR166_MUST_NOT_LEAK', appBaseUrl: 'https://push.example.test' });
    const safeFallback = sentMessages.find((msg) => msg.chatId === 'dm-fails-chat-pr166');
    assert(safeFallback, 'typed /push DM failure may post minimal safe fallback');
    assert.strictEqual(safeFallback.text, 'Откройте бота в личке и нажмите «Подключить уведомления».', 'typed /push fallback is minimal and safe');
    assert(!/\/push\/join\?t=|clck\.ru/.test(safeFallback.text), 'typed /push fallback exposes no link');

    const diagnostics = { inbound: bot.getGroupPushInboundDiagnostics(30), dispatch: bot.getPushDispatchDiagnostics(30) };
    assertNoSecretLeak(diagnostics, 'PR166 diagnostics');

    const entrypoint = fresh('../clean-entrypoint-1.53.10-pr89.js');
    entrypoint.applyEnv();
    const install = entrypoint.installCleanBot();
    assert.strictEqual(install.pr165LiveChatPushRuntime, true, 'active production entrypoint still wires PR165 push runtime');
    assert(entrypoint.RUNTIME.includes('PR176'), 'active production entrypoint advances to PR176 while preserving PR166 onboarding');

    console.log('group push private onboarding pr166 ok');
  } finally {
    global.fetch = originalFetch;
    if (originalMaxApi) require.cache[require.resolve('../services/maxApi')] = originalMaxApi;
    else delete require.cache[require.resolve('../services/maxApi')];
    restore(storageFile, originalStorage);
    restore(usedPairingFile, originalUsed);
    restoreEnv(originalEnv);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
