'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const originalFetch = global.fetch;

function fresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function webhookBody({ text = '/push', userId = 'sender-secret-1234567890', chatId = 'chat-secret-0987654321', title = 'Тестовый чат', extra = {} } = {}) {
  return {
    update_type: 'message_created',
    message: {
      body: { text },
      sender: { user_id: userId, first_name: 'PR160' },
      recipient: { chat_id: chatId, chat_type: 'chat', title }
    },
    ...extra
  };
}

function textOf(value) {
  return JSON.stringify(value, null, 2);
}

function assertSafeNoSecrets(value, secrets) {
  const haystack = typeof value === 'string' ? value : textOf(value);
  for (const secret of secrets) {
    assert(!haystack.includes(secret), `diagnostics must not expose secret value: ${secret}`);
  }
  assert(!haystack.includes('/push/join?t=personal-token-secret'), 'diagnostics redact personal /push/join URL');
  assert(!haystack.includes('/push/join?t=personal-secret-token'), 'diagnostics redact audit probe /push/join URL');
  assert(!haystack.includes('personal-secret-token'), 'diagnostics redact audit probe /push/join token');
  assert(!haystack.includes('https://clck.ru/personalSecret'), 'diagnostics redact clck.ru URL');
  assert(!haystack.includes('https://clck.ru/actionPersonalSecret'), 'diagnostics redact action clck.ru URL');
  assert(!haystack.includes('endpoint=https://push.example/secret'), 'diagnostics redact endpoint value');
  assert(!haystack.includes('endpoint=https://push.example/action-secret'), 'diagnostics redact action endpoint value');
  assert(!haystack.includes('auth=auth-secret'), 'diagnostics redact auth value');
  assert(!haystack.includes('auth=action-auth-secret'), 'diagnostics redact action auth value');
  assert(!haystack.includes('p256dh=p256dh-secret'), 'diagnostics redact p256dh value');
  assert(!haystack.includes('p256dh=action-p256dh-secret'), 'diagnostics redact action p256dh value');
  assert(!haystack.includes('access_token=secret-token-1234'), 'diagnostics redact raw access_token query');
}

async function waitForServer(child, port) {
  const deadline = Date.now() + 8000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const res = await originalFetch(`http://127.0.0.1:${port}/debug/version`);
      if (res.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('server did not start');
}

async function httpJson(port, target, options = {}) {
  const res = await originalFetch(`http://127.0.0.1:${port}${target}`, options);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, text, body, headers: res.headers };
}

(async () => {
  const ENV_KEYS = ['BOT_TOKEN', 'MAX_BOT_TOKEN', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_PAIRING_SECRET', 'WEB_PUSH_PRIVATE_KEY', 'VAPID_PRIVATE_KEY', 'ADMIN_TOKEN'];
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    process.env.BOT_TOKEN = 'BOT_TOKEN_PR160_SECRET';
    process.env.MAX_BOT_TOKEN = 'MAX_BOT_TOKEN_PR160_SECRET';
    process.env.PUSH_ADMIN_TOKEN = 'PUSH_ADMIN_TOKEN_PR160_SECRET';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'PUSH_SUBSCRIBE_TOKEN_PR160_SECRET';
    process.env.PUSH_PAIRING_SECRET = 'PUSH_PAIRING_SECRET_PR160_SECRET';
    process.env.WEB_PUSH_PRIVATE_KEY = 'WEB_PUSH_PRIVATE_KEY_PR160_SECRET';
    process.env.VAPID_PRIVATE_KEY = 'VAPID_PRIVATE_KEY_PR160_SECRET';
    process.env.ADMIN_TOKEN = 'ADMIN_TOKEN_PR160_SECRET';

    const diagnostics = fresh('../services/maxWebhookEdgeDiagnostics');
    diagnostics.clear();

    let event = diagnostics.record({ method: 'POST', path: '/webhook/max', contentType: 'application/json', body: webhookBody({ text: '/push' }), handedToBot: false });
    assert.strictEqual(event.matchedPushCommand, true, '/push is detected at HTTP edge');
    assert.strictEqual(event.normalizedText, '/push', '/push normalized text is stored safely');
    assert.strictEqual(event.textPreview, '/push', '/push preview is stored');

    event = diagnostics.record({ method: 'POST', path: '/webhook/max', contentType: 'application/json', body: webhookBody({ text: 'Включить уведомления' }), handedToBot: false });
    assert.strictEqual(event.matchedPushCommand, true, 'message button text is detected at HTTP edge');
    assert.strictEqual(event.textPreview, 'Включить уведомления', 'message button preview is stored');

    event = diagnostics.record({ method: 'POST', path: '/webhook/max', contentType: 'application/json', body: webhookBody({ text: 'hello unrelated' }), handedToBot: false });
    assert.strictEqual(event.matchedPushCommand, false, 'unrelated text is not matched as push command');

    event = diagnostics.record({
      method: 'POST',
      path: '/webhook/max',
      contentType: 'application/json',
      body: webhookBody({
        text: `long ${'x'.repeat(120)} BOT_TOKEN_PR160_SECRET https://example.test/push/join?t=personal-token-secret https://clck.ru/personalSecret endpoint=https://push.example/secret auth=auth-secret p256dh=p256dh-secret`,
        userId: 'raw-sender-user-id-1234567890',
        chatId: 'raw-chat-id-0987654321',
        extra: { token: 'body-token-secret', secret: 'body-secret-value', customKey: true }
      }),
      handedToBot: false
    });
    assert(event.topLevelKeys.includes('update_type'), 'topLevelKeys include safe webhook keys');
    assert(event.topLevelKeys.includes('[redacted-key]'), 'sensitive topLevelKeys are redacted');
    assert.strictEqual(event.senderUserIdLast4, '7890', 'sender user id is masked to last4 only');
    assert.strictEqual(event.chatIdLast4, '4321', 'chat id is masked to last4 only');
    assert(event.textPreview.length <= 80, 'long text preview is truncated');

    process.env.BOT_TOKEN = 'secret-token-1234';
    event = diagnostics.record({
      method: 'POST',
      path: '/webhook/max?access_token=secret-token-1234',
      body: {
        update_type: 'message_callback',
        callback: {
          payload: 'https://example.test/push/join?t=personal-secret-token'
        }
      }
    });
    assert.strictEqual(event.path, '/webhook/max?[redacted-query]', 'path query string is redacted in summary event');
    assert(!event.action.includes('/push/join?t=personal-secret-token'), 'action redacts personal push join URLs');
    assert(!event.action.includes('personal-secret-token'), 'action redacts personal push join token');
    let snapshot = JSON.stringify(diagnostics.summary());
    assert(!snapshot.includes('secret-token-1234'), 'audit probe summary redacts env secret value');
    assert(!snapshot.includes('access_token=secret-token-1234'), 'audit probe summary redacts access_token query');
    assert(!snapshot.includes('/push/join?t=personal-secret-token'), 'audit probe summary redacts push/join URL');
    assert(!snapshot.includes('personal-secret-token'), 'audit probe summary redacts personal push token');

    event = diagnostics.record({
      method: 'POST',
      path: '/webhook/max?endpoint=https://push.example/path&auth=query-auth-secret&p256dh=query-p256dh-secret',
      body: {
        update_type: 'message_callback',
        callback: {
          payload: `https://clck.ru/actionPersonalSecret secret-token-1234 endpoint=https://push.example/action-secret auth=action-auth-secret p256dh=action-p256dh-secret`
        }
      }
    });
    assert.strictEqual(event.path, '/webhook/max?[redacted-query]', 'secret query fields are redacted from path');
    assertSafeNoSecrets(diagnostics.summary(), ['secret-token-1234', 'query-auth-secret', 'query-p256dh-secret']);
    assertSafeNoSecrets(diagnostics.renderHtml(diagnostics.summary()), ['secret-token-1234', 'query-auth-secret', 'query-p256dh-secret']);

    assertSafeNoSecrets(diagnostics.summary(), [
      'BOT_TOKEN_PR160_SECRET',
      'MAX_BOT_TOKEN_PR160_SECRET',
      'PUSH_ADMIN_TOKEN_PR160_SECRET',
      'PUSH_SUBSCRIBE_TOKEN_PR160_SECRET',
      'PUSH_PAIRING_SECRET_PR160_SECRET',
      'WEB_PUSH_PRIVATE_KEY_PR160_SECRET',
      'VAPID_PRIVATE_KEY_PR160_SECRET',
      'ADMIN_TOKEN_PR160_SECRET',
      'body-token-secret',
      'body-secret-value'
    ]);

    const html = diagnostics.renderHtml(diagnostics.summary());
    assert(html.includes('<title>MAX webhook edge debug</title>'), 'HTML endpoint renderer has safe title');
    assert(html.includes('MAX webhook edge debug'), 'HTML renderer includes page heading');
    assertSafeNoSecrets(html, ['BOT_TOKEN_PR160_SECRET', 'personal-token-secret']);

    const indexSource = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8');
    assert(indexSource.includes("app.get('/debug/webhook-edge.json'"), 'JSON endpoint is registered');
    assert(indexSource.includes("app.get('/debug/webhook-edge'"), 'HTML endpoint is registered');
    assert(indexSource.includes('maxWebhookEdgeDiagnostics.record({ req, handedToBot: false })'), 'webhook route records before bot handler');
    assert(indexSource.includes('maxWebhookEdgeDiagnostics.update(edgeDiagnostic'), 'webhook route updates after bot handler');
    assert(indexSource.includes('maxWebhookEdgeDiagnostics: getMaxWebhookEdgeDiagnosticsBlock()'), 'debug/export payload includes maxWebhookEdgeDiagnostics');
    assert(indexSource.includes('webhookRouteRegistrationDiagnostics'), 'debug/export payload includes route registration diagnostics');
    assert(indexSource.includes('return result;'), 'instrumentation preserves bot handler return path');

    const maxApiSource = fs.readFileSync(path.join(repoRoot, 'services/maxApi.js'), 'utf8');
    assert(maxApiSource.includes('WEBHOOK_UPDATE_TYPES') && maxApiSource.includes('"message_created"'), 'desired webhook update types include message_created');

    const port = 18000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, ['index.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        ADMIN_TOKEN: 'ADMIN_TOKEN_PR160_SECRET',
        BOT_TOKEN: 'secret-token-1234',
        MAX_BOT_TOKEN: '',
        WEBHOOK_PATH: '/webhook/max',
        DEBUG_EXPORT_ALLOW_PUBLIC: '0'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const logs = [];
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));
    try {
      await waitForServer(child, port);
      const webhookRes = await httpJson(port, '/webhook/max', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ update_type: 'edge_probe_no_message', probe: true })
      });
      assert.strictEqual(webhookRes.status, 200, 'simulated webhook preserves handler 200 return path');
      assert.strictEqual(webhookRes.body && webhookRes.body.reason, 'no_message', 'simulated webhook body comes from bot handler unchanged');

      const redactionWebhookRes = await httpJson(port, '/webhook/max?access_token=secret-token-1234&auth=debug-auth-secret&p256dh=debug-p256dh-secret', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          update_type: 'message_callback',
          callback: {
            payload: 'https://example.test/push/join?t=personal-secret-token https://clck.ru/actionPersonalSecret secret-token-1234 endpoint=https://push.example/action-secret auth=action-auth-secret p256dh=action-p256dh-secret'
          }
        })
      });
      assert.strictEqual(redactionWebhookRes.status, 200, 'redaction probe preserves handler return path');

      const jsonRes = await httpJson(port, '/debug/webhook-edge.json?token=ADMIN_TOKEN_PR160_SECRET');
      assert.strictEqual(jsonRes.status, 200, 'JSON endpoint returns 200');
      assert.strictEqual(jsonRes.body.ok, true, 'JSON endpoint returns ok');
      assert(jsonRes.body.maxWebhookEdgeDiagnostics.count >= 1, 'JSON endpoint exposes safe diagnostics');
      assert(jsonRes.body.maxWebhookEdgeDiagnostics.latest.some((item) => item.updateType === 'edge_probe_no_message' && item.handedToBot === true), 'JSON endpoint includes simulated edge request handed to bot');
      assertSafeNoSecrets(jsonRes.body, ['secret-token-1234', 'debug-auth-secret', 'debug-p256dh-secret', 'personal-secret-token']);

      const htmlRes = await httpJson(port, '/debug/webhook-edge?token=ADMIN_TOKEN_PR160_SECRET');
      assert.strictEqual(htmlRes.status, 200, 'HTML endpoint returns 200');
      assert(htmlRes.text.includes('MAX webhook edge debug'), 'HTML endpoint renders safe page');
      assertSafeNoSecrets(htmlRes.text, ['ADMIN_TOKEN_PR160_SECRET', 'secret-token-1234', 'debug-auth-secret', 'debug-p256dh-secret', 'personal-secret-token']);
    } finally {
      child.kill('SIGTERM');
    }

    console.log('PR160 webhook edge diagnostics tests passed');
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
