'use strict';

const assert = require('assert');
const pkg = require('../package.json');
const entrypoint = require('../clean-entrypoint-1.53.10-pr89.js');
const fresh = require('../pr189-push-fresh-pwa-bootstrap.js');

assert.strictEqual(pkg.version, 'CC8.3.55-PR189-PUSH-FRESH-PWA-PENDING');
assert.strictEqual(pkg.sourceMarker, 'adminkit-pr189-push-fresh-pwa-pending');
assert.strictEqual(pkg.pr189PushFreshPwaPending, true);
assert.strictEqual(entrypoint.RUNTIME, 'CC8.3.55-PR189-PUSH-FRESH-PWA-PENDING');
assert.strictEqual(entrypoint.SOURCE, 'adminkit-pr189-push-fresh-pwa-pending');

const html = '<!doctype html><html><head></head><body><script src="/public/push-client.js"></script></body></html>';
const patched = fresh.patchPushHtml(html);
assert(patched.includes('window.__ADMINKIT_PUSH_CLIENT_VERSION__'));
assert(patched.includes('CC8.3.55-PR189-PUSH-FRESH-PWA-PENDING'));
assert(patched.includes('/public/push-client.js?v=CC8.3.55-PR189-PUSH-FRESH-PWA-PENDING'));
assert(!patched.includes('<script src="/public/push-client.js"></script>'));

const oldCopy = '<p>Персональная ссылка найдена. Теперь нажмите «Включить уведомления».</p>';
const copyPatched = fresh.patchPushHtml(`${oldCopy}<script src="/public/push-client.js"></script>`);
assert(copyPatched.includes('Откройте АдминКИТ PUSH с экрана Домой'));
assert(copyPatched.includes('Подключить этот чат'));
assert(!copyPatched.includes('Персональная ссылка найдена'));

const headers = new Map();
fresh.setNoCacheHeaders({ setHeader: (name, value) => headers.set(name, value) });
assert.strictEqual(headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
assert.strictEqual(headers.get('Pragma'), 'no-cache');
assert.strictEqual(headers.get('Expires'), '0');
assert.strictEqual(headers.get('X-Adminkit-Push-Fresh-PWA'), 'CC8.3.55-PR189-PUSH-FRESH-PWA-PENDING');
assert.strictEqual(headers.get('X-Adminkit-Push-Source'), 'adminkit-pr189-push-fresh-pwa-pending');

const info = fresh.info();
assert.strictEqual(info.runtimeVersion, 'CC8.3.55-PR189-PUSH-FRESH-PWA-PENDING');
assert.strictEqual(info.sourceMarker, 'adminkit-pr189-push-fresh-pwa-pending');
assert(info.state && typeof info.state === 'object');

console.log('PR189 fresh PWA pending tests passed');
