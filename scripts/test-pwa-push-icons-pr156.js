'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');

const repoRoot = path.join(__dirname, '..');
const files = {
  icon512: path.join(repoRoot, 'public', 'adminkit-push-icon-512.png'),
  icon192: path.join(repoRoot, 'public', 'adminkit-push-icon-192.png'),
  apple: path.join(repoRoot, 'public', 'apple-touch-icon.png'),
  favicon: path.join(repoRoot, 'public', 'favicon-32.png')
};
const pushHtmlPath = path.join(repoRoot, 'public', 'push.html');
const adminManifestPath = path.join(repoRoot, 'public', 'push-admin-manifest.json');
const swPath = path.join(repoRoot, 'public', 'push-sw.js');
const routesPath = path.join(repoRoot, 'web-push-routes.js');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ENV_KEYS = [
  'WEB_PUSH_PUBLIC_KEY',
  'WEB_PUSH_PRIVATE_KEY',
  'WEB_PUSH_SUBJECT',
  'PUSH_ADMIN_TOKEN',
  'PUSH_SUBSCRIBE_TOKEN',
  'PUSH_ALLOW_PUBLIC_SUBSCRIBE',
  'PUSH_PAIRING_SECRET',
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

function readPngDimensions(file) {
  assert(fs.existsSync(file), `${path.relative(repoRoot, file)} exists`);
  const buffer = fs.readFileSync(file);
  assert(buffer.length >= 24, `${path.relative(repoRoot, file)} is large enough to contain a PNG IHDR`);
  assert(buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), `${path.relative(repoRoot, file)} has valid PNG magic bytes`);
  assert.strictEqual(buffer.toString('ascii', 12, 16), 'IHDR', `${path.relative(repoRoot, file)} first chunk is IHDR`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function assertDimensions(label, file, width, height) {
  const actual = readPngDimensions(file);
  assert.deepStrictEqual(actual, { width, height }, `${label} IHDR is ${width}x${height}`);
}

function cleanEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function fresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  fresh('../web-push-routes').install(app);
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function withServer(fn) {
  const server = await listen(makeApp());
  try {
    return await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(server, route) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body };
}

function activeAppleTouchIcons(html) {
  return html.match(/<link\b[^>]*rel=["']apple-touch-icon["'][^>]*>/g) || [];
}

function assertNoSvgOrDataIconReferences(label, text) {
  assert.doesNotMatch(text, /(?:rel=["'][^"']*icon[^"']*["'][^>]*href=["'][^"']*\.svg|icons?\s*[:=][^\n;{}]*(?:\.svg|data:image)|badge\s*[:=][^\n;{}]*(?:\.svg|data:image))/i, `${label} has no SVG/data-url icon references`);
  assert.doesNotMatch(text, /data:image\/(?:png|svg\+xml|x-icon|jpeg|webp);base64/i, `${label} has no base64 image icon references`);
}

(async () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    cleanEnv();

    assertDimensions('512 icon', files.icon512, 512, 512);
    assertDimensions('192 icon', files.icon192, 192, 192);
    assertDimensions('apple touch icon', files.apple, 180, 180);
    assertDimensions('favicon', files.favicon, 32, 32);

    const pushHtml = fs.readFileSync(pushHtmlPath, 'utf8');
    assert(pushHtml.includes('/public/apple-touch-icon.png'), 'public/push.html references /public/apple-touch-icon.png');
    assert(pushHtml.includes('/public/favicon-32.png'), 'public/push.html references /public/favicon-32.png');
    assert(!activeAppleTouchIcons(pushHtml).some((tag) => tag.includes('/public/adminkit_start_logo.png')), 'public/push.html no longer references /public/adminkit_start_logo.png as apple-touch-icon');

    const adminManifest = JSON.parse(fs.readFileSync(adminManifestPath, 'utf8'));
    assert.deepStrictEqual(adminManifest.icons, [
      { src: '/public/adminkit-push-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/public/adminkit-push-icon-512.png', sizes: '512x512', type: 'image/png' }
    ], 'public/push-admin-manifest.json references the new 192 and 512 PNG icons');

    const sw = fs.readFileSync(swPath, 'utf8');
    assert(sw.includes("icon: payload.icon || '/public/adminkit-push-icon-192.png'"), 'public/push-sw.js uses /public/adminkit-push-icon-192.png as default notification icon');
    assert(sw.includes("badge: payload.badge || '/public/favicon-32.png'"), 'public/push-sw.js uses /public/favicon-32.png as default badge');

    const routes = fs.readFileSync(routesPath, 'utf8');
    assert(routes.includes("icon: clean(source.icon).slice(0, 300) || '/public/adminkit-push-icon-192.png'"), 'web-push-routes.js uses the new PNG as the server-side default notification icon');
    assert(routes.includes("badge: clean(source.badge).slice(0, 300) || '/public/favicon-32.png'"), 'web-push-routes.js uses the new PNG favicon as the server-side default badge');

    await withServer(async (server) => {
      const manifestResponse = await request(server, '/push/manifest.json');
      assert.strictEqual(manifestResponse.status, 200, '/push/manifest.json responds');
      assert.deepStrictEqual(manifestResponse.body.icons, [
        { src: '/public/adminkit-push-icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/public/adminkit-push-icon-512.png', sizes: '512x512', type: 'image/png' }
      ], '/push/manifest.json references the new 192 and 512 PNG icons');
      const manifestText = JSON.stringify(manifestResponse.body);
      assert(!manifestText.includes('/public/adminkit_start_logo.png'), '/push/manifest.json does not reference old adminkit_start_logo.png icon');
      assert(!manifestText.includes('/public/adminkit_chat_logo.png'), '/push/manifest.json does not reference old adminkit_chat_logo.png icon');
    });

    assertNoSvgOrDataIconReferences('public/push.html', pushHtml);
    assertNoSvgOrDataIconReferences('web-push-routes.js', routes);
    assertNoSvgOrDataIconReferences('public/push-admin-manifest.json', fs.readFileSync(adminManifestPath, 'utf8'));
    assertNoSvgOrDataIconReferences('public/push-sw.js', sw);

    console.log('pwa push icons pr156 ok');
  } finally {
    cleanEnv();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) process.env[key] = value;
    }
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
