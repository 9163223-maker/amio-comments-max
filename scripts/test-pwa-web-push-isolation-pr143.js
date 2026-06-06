'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');

const ENV_KEYS = [
  'WEB_PUSH_PUBLIC_KEY',
  'WEB_PUSH_PRIVATE_KEY',
  'WEB_PUSH_SUBJECT',
  'PUSH_ADMIN_TOKEN',
  'PUSH_SUBSCRIBE_TOKEN',
  'PUSH_ALLOW_PUBLIC_SUBSCRIBE',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_URI',
  'PG_URL',
  'PGURI',
  'NF_POSTGRES_URI',
  'NF_POSTGRES_URL',
  'DB_URL',
  'DB_CONNECTION_STRING'
];

function cleanEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  require('../web-push-routes').install(app);
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, route, options = {}) {
  const url = `http://127.0.0.1:${server.address().port}${route}`;
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body, headers: response.headers };
}

async function withServer(fn) {
  const server = await listen(makeApp());
  try {
    return await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function validSubscription() {
  return {
    endpoint: 'https://example.test/push/pr143-isolation',
    keys: { p256dh: 'p256dh-test-key', auth: 'auth-test-key' }
  };
}

(async () => {
  const originalStorage = fs.existsSync(storageFile) ? fs.readFileSync(storageFile, 'utf8') : null;
  try {
    cleanEnv();

    await withServer(async (server) => {
      const status = await request(server, '/api/push/status');
      assert.strictEqual(status.status, 200, 'status must work without WEB_PUSH_* env');
      assert.strictEqual(status.body.ok, true, 'status ok without WEB_PUSH_* env');
      assert.strictEqual(status.body.webPushConfigured, false, 'web push is off when env is missing');

      const pushPage = await request(server, '/push');
      assert.strictEqual(pushPage.status, 200, '/push opens');
      assert.match(pushPage.body, /АдминКИТ Push/, '/push contains title');
      assert.match(pushPage.body, /\/push\/manifest\.json/, '/push references isolated manifest');
      assert.doesNotMatch(pushPage.body, /href="\/manifest\.json"/, '/push must not reference global manifest');

      const manifest = await request(server, '/push/manifest.json');
      assert.strictEqual(manifest.status, 200, 'isolated manifest route works');
      assert.strictEqual(manifest.body.start_url, '/push', 'manifest start_url is /push');
      assert.strictEqual(manifest.body.scope, '/', 'manifest scope remains app metadata only');

      const sw = await request(server, '/push/sw.js');
      assert.strictEqual(sw.status, 200, 'isolated service worker route works');
      assert.strictEqual(sw.headers.get('service-worker-allowed'), null, 'isolated SW must not set Service-Worker-Allowed: /');

      const rootSw = await request(server, '/sw.js');
      assert.strictEqual(rootSw.status, 404, 'root /sw.js must not be installed by push module');
    });

    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_STATUS';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_VAPID_KEY_MUST_NOT_LEAK';
    process.env.WEB_PUSH_SUBJECT = 'https://private-owner.example/secret-subject';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_MUST_NOT_LEAK';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'SUBSCRIBE_TOKEN_MUST_NOT_LEAK';
    process.env.DATABASE_URL = 'postgres://private-user:private-pass@private-db.example:5432/private-db';

    await withServer(async (server) => {
      const status = await request(server, '/api/push/status');
      assert.strictEqual(status.status, 200, 'public status works with env');
      assert.strictEqual(status.body.publicKey, 'PUBLIC_KEY_FOR_STATUS', 'public key is available for PushManager');
      const publicStatusText = JSON.stringify(status.body);
      for (const forbidden of [
        'PRIVATE_VAPID_KEY_MUST_NOT_LEAK',
        'ADMIN_TOKEN_MUST_NOT_LEAK',
        'SUBSCRIBE_TOKEN_MUST_NOT_LEAK',
        'private-owner.example',
        'private-pass',
        'adminkit_web_push_subscriptions',
        'web-push-subscriptions.json',
        '/workspace/'
      ]) {
        assert(!publicStatusText.includes(forbidden), `public status leaked ${forbidden}`);
      }

      const subscribeNoToken = await request(server, '/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubscription())
      });
      assert.strictEqual(subscribeNoToken.status, 403, 'subscribe requires PUSH_SUBSCRIBE_TOKEN when configured');
    });

    cleanEnv();
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_CLOSED_SUBSCRIBE';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_FOR_CLOSED_SUBSCRIBE';
    process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
    await withServer(async (server) => {
      const subscribeClosed = await request(server, '/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubscription())
      });
      assert.strictEqual(subscribeClosed.status, 403, 'public subscribe is blocked by default');
      assert.strictEqual(subscribeClosed.body.error, 'push_subscribe_closed', 'closed subscribe explains safe status');
    });

    process.env.PUSH_ALLOW_PUBLIC_SUBSCRIBE = '1';
    await withServer(async (server) => {
      const subscribeAllowed = await request(server, '/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validSubscription())
      });
      assert.strictEqual(subscribeAllowed.status, 200, 'public subscribe can be explicitly enabled');
      assert.strictEqual(subscribeAllowed.body.ok, true, 'explicit public subscribe stores subscription');
    });

    cleanEnv();
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_FOR_ADMIN_TEST';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_FOR_ADMIN_TEST';
    process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_FOR_TEST';
    await withServer(async (server) => {
      const noToken = await request(server, '/api/push/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.strictEqual(noToken.status, 403, 'admin send requires PUSH_ADMIN_TOKEN');

      const queryToken = await request(server, '/api/push/test?token=ADMIN_TOKEN_FOR_TEST', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.strictEqual(queryToken.status, 403, 'admin token in query string is rejected');

      const headerToken = await request(server, '/internal/push/status', { headers: { authorization: 'Bearer ADMIN_TOKEN_FOR_TEST' } });
      assert.strictEqual(headerToken.status, 200, 'admin bearer token is accepted for internal status');
      assert.strictEqual(typeof headerToken.body.storedSubscriptionsCount, 'number', 'internal status can expose detailed count');
    });

    const missingPackage = spawnSync(process.execPath, ['-e', `
      const Module = require('module');
      const originalResolve = Module._resolveFilename;
      Module._resolveFilename = function(request, parent, isMain, options) {
        if (request === 'web-push') throw new Error('simulated missing web-push');
        return originalResolve.call(this, request, parent, isMain, options);
      };
      const express = require('express');
      const app = express();
      app.use(express.json());
      require('./web-push-routes').install(app);
      const server = app.listen(0, '127.0.0.1', async () => {
        const base = 'http://127.0.0.1:' + server.address().port;
        const status = await fetch(base + '/api/push/status').then((res) => res.json());
        if (status.pushSupported.webPushPackageAvailable !== false) throw new Error('package availability leaked true');
        server.close(() => process.exit(0));
      });
    `], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, WEB_PUSH_PUBLIC_KEY: 'x', WEB_PUSH_PRIVATE_KEY: 'y', WEB_PUSH_SUBJECT: 'mailto:test@example.com' } });
    assert.strictEqual(missingPackage.status, 0, `missing web-push package must not crash startup: ${missingPackage.stderr || missingPackage.stdout}`);

    console.log('pwa web push isolation pr143 ok');
  } finally {
    cleanEnv();
    if (originalStorage === null) {
      try { fs.unlinkSync(storageFile); } catch {}
    } else {
      fs.mkdirSync(path.dirname(storageFile), { recursive: true });
      fs.writeFileSync(storageFile, originalStorage, 'utf8');
    }
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
