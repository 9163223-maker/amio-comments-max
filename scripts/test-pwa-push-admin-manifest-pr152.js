'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const adminManifestPath = path.join(repoRoot, 'public', 'push-admin-manifest.json');
const storageFile = path.join(repoRoot, 'data', 'web-push-subscriptions.json');
const usedFile = path.join(repoRoot, 'data', 'push-pairing-used.json');

const ENV_KEYS = ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_ADMIN_TOKEN', 'PUSH_SUBSCRIBE_TOKEN', 'PUSH_ALLOW_PUBLIC_SUBSCRIBE', 'PUSH_PAIRING_SECRET', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URL', 'PGURI', 'NF_POSTGRES_URI', 'NF_POSTGRES_URL', 'DB_URL', 'DB_CONNECTION_STRING'];
function cleanEnv() { for (const key of ENV_KEYS) delete process.env[key]; }
function backup(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function restore(file, content) { if (content === null) { try { fs.unlinkSync(file); } catch {} } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); } }
function resetStores() { try { fs.unlinkSync(storageFile); } catch {} try { fs.unlinkSync(usedFile); } catch {} }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function makeApp() { const app = express(); app.use(express.json({ limit: '1mb' })); fresh('../web-push-routes').install(app); return app; }
function listen(app) { return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
async function withServer(fn) { const server = await listen(makeApp()); try { return await fn(server); } finally { await new Promise((resolve) => server.close(resolve)); } }
async function request(server, target, options = {}) { const res = await fetch(`http://127.0.0.1:${server.address().port}${target}`, options); const text = await res.text(); return { status: res.status, headers: res.headers, text }; }

function countActiveManifest(html, href) {
  const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<link\\s+rel=["']manifest["']\\s+href=["']${escapedHref}["']`, 'g');
  return (html.match(pattern) || []).length;
}

function assertClientSafe(html, label) {
  assert(!html.includes('placeholder="PUSH_SUBSCRIBE_TOKEN"'), `${label} hides subscribe token field`);
  assert(!html.includes('placeholder="PUSH_ADMIN_TOKEN"'), `${label} hides admin token field`);
  assert(!html.includes('Отправить тестовое уведомление'), `${label} hides test-send button`);
  assert(!html.includes('Проверить статус'), `${label} hides admin status button`);
  assert(!html.includes('id="subscribeSteps"'), `${label} hides raw diagnostics by default`);
  assert(!html.includes('<h2>Диагностика</h2>'), `${label} hides raw diagnostic table by default`);
  assert(html.includes('id="clientStatus"'), `${label} keeps visible client-safe status`);
  assert.strictEqual((html.match(/<button\b/g) || []).length, 1, `${label} remains one-button/client-safe`);
}

function assertAdminControls(html) {
  assert(html.includes('placeholder="PUSH_SUBSCRIBE_TOKEN"'), '/push/admin keeps subscribe token placeholder');
  assert(html.includes('placeholder="PUSH_ADMIN_TOKEN"'), '/push/admin keeps admin token placeholder');
  assert(html.includes('Отправить тестовое уведомление'), '/push/admin keeps test-send control');
  assert(html.includes('Проверить статус'), '/push/admin keeps status control');
  assert(html.includes('Сбросить push-подписку'), '/push/admin keeps reset control');
  assert(html.includes('<h2>Диагностика</h2>'), '/push/admin keeps diagnostics section');
}

(async () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalStorage = backup(storageFile);
  const originalUsed = backup(usedFile);
  try {
    cleanEnv();
    resetStores();
    process.env.WEB_PUSH_PUBLIC_KEY = 'PUBLIC_KEY_PR152';
    process.env.WEB_PUSH_PRIVATE_KEY = 'PRIVATE_KEY_PR152';
    process.env.WEB_PUSH_SUBJECT = 'mailto:push-pr152@example.test';
    process.env.PUSH_PAIRING_SECRET = 'SECRET_VALUE_PR152';
    process.env.PUSH_ADMIN_TOKEN = 'ADMIN_TOKEN_VALUE_PR152';
    process.env.PUSH_SUBSCRIBE_TOKEN = 'SUBSCRIBE_TOKEN_VALUE_PR152';

    assert(fs.existsSync(adminManifestPath), 'public/push-admin-manifest.json exists');
    const adminManifest = JSON.parse(fs.readFileSync(adminManifestPath, 'utf8'));
    assert.strictEqual(adminManifest.start_url, '/push/admin', 'admin manifest start_url is /push/admin');
    assert.strictEqual(adminManifest.id, '/push-admin', 'admin manifest id is /push-admin');
    assert.strictEqual(adminManifest.scope, '/push/', 'admin manifest scope is /push/');

    const pairing = fresh('../services/pushPairingService');
    const token = pairing.createPairingToken({ maxUserId: 'user-pr152', chatId: 'chat-pr152', channelId: 'channel-pr152', issuedByAdminId: 'admin-pr152', ttlMinutes: 30 });

    await withServer(async (server) => {
      const admin = await request(server, '/push/admin?token=ADMIN_TOKEN_VALUE_PR152&PUSH_ADMIN_TOKEN=ADMIN_TOKEN_VALUE_PR152');
      assert.strictEqual(admin.status, 200, '/push/admin renders');
      assert.strictEqual(countActiveManifest(admin.text, '/public/push-admin-manifest.json'), 1, '/push/admin contains admin manifest as the active manifest');
      assert.strictEqual(countActiveManifest(admin.text, '/push/manifest.json'), 0, '/push/admin does not use client manifest as its active manifest');
      assert(admin.text.includes('<title>АдминКИТ PUSH</title>'), '/push/admin uses admin-specific title');
      assert(admin.text.includes('<meta name="apple-mobile-web-app-title" content="АдминКИТ PUSH">'), '/push/admin uses unified service apple title');
      assert(!admin.text.includes('ADMIN_TOKEN_VALUE_PR152'), '/push/admin does not expose admin token query value');
      assertAdminControls(admin.text);

      const publicPush = await request(server, '/push');
      assert.strictEqual(publicPush.status, 200, '/push renders');
      assert.strictEqual(countActiveManifest(publicPush.text, '/push/manifest.json'), 1, '/push contains client manifest');
      assert.strictEqual(countActiveManifest(publicPush.text, '/public/push-admin-manifest.json'), 0, '/push does not contain admin manifest');
      assertClientSafe(publicPush.text, '/push');

      const join = await request(server, `/push/join?t=${encodeURIComponent(token)}`);
      assert.strictEqual(join.status, 200, '/push/join?t=valid token renders');
      assert(/<link\s+rel=["']manifest["']\s+href=["']\/push\/manifest\//.test(join.text), '/push/join contains token-scoped client manifest');
      assert.strictEqual(countActiveManifest(join.text, '/public/push-admin-manifest.json'), 0, '/push/join does not contain admin manifest');
      assertClientSafe(join.text, '/push/join');
    });

    console.log('pwa push admin manifest pr152 ok');
  } finally {
    cleanEnv();
    for (const [key, value] of Object.entries(originalEnv)) { if (value !== undefined) process.env[key] = value; }
    restore(storageFile, originalStorage);
    restore(usedFile, originalUsed);
  }
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
