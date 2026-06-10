'use strict';

const assert = require('assert');
const pkg = require('../package.json');
const fresh = require('../pr189-push-fresh-pwa-bootstrap.js');

assert.strictEqual(pkg.version, 'CC8.3.58-PR192-PUSH-DEVICE-AUTOCONNECT-UNSUBSCRIBE');
assert.strictEqual(pkg.sourceMarker, 'adminkit-pr192-push-device-autoconnect-unsubscribe');
assert.strictEqual(pkg.pr189PushFreshPwaPending, true);
assert.strictEqual(pkg.pr190PushPolishAutorefresh, true);
assert.strictEqual(pkg.pr191PushAdminInviteTitleCommands, true);
assert.strictEqual(pkg.pr192PushDeviceAutoconnectUnsubscribe, true);
const buildInfo = require('../buildInfo').getBuildInfo();
assert.strictEqual(buildInfo.pushRuntimeSourceMarker, 'adminkit-pr192-push-device-autoconnect-unsubscribe');
assert.strictEqual(buildInfo.pushPairingSourceMarker, 'adminkit-pr192-push-device-autoconnect-unsubscribe');
assert.strictEqual(buildInfo.pushPairingBaseSourceMarker, 'adminkit-pr188-push-multi-chat-handoff');

const html = '<!doctype html><html><head></head><body><script src="/public/push-client.js"></script></body></html>';
const patched = fresh.patchPushHtml(html);
assert(patched.includes('window.__ADMINKIT_PUSH_CLIENT_VERSION__'));
assert(patched.includes('CC8.3.58-PR192-PUSH-DEVICE-AUTOCONNECT-UNSUBSCRIBE'));
assert(patched.includes('/public/push-client.js?v=CC8.3.58-PR192-PUSH-DEVICE-AUTOCONNECT-UNSUBSCRIBE'));
assert(patched.includes('adminkit-pr190-focus-refresh'));
assert(!patched.includes('<script src="/public/push-client.js"></script>'));

const informationalHtml = '<!doctype html><html><head></head><body><script>window.__ADMINKIT_PUSH_JOIN__={"joinMode":true,"informationalJoin":true};</script><script src="/public/push-client.js"></script></body></html>';
const informationalPatched = fresh.patchPushHtml(informationalHtml);
assert(informationalPatched.includes('adminkit-pr190-compact-join'));

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
assert.strictEqual(headers.get('X-Adminkit-Push-Fresh-PWA'), 'CC8.3.58-PR192-PUSH-DEVICE-AUTOCONNECT-UNSUBSCRIBE');
assert.strictEqual(headers.get('X-Adminkit-Push-Source'), 'adminkit-pr192-push-device-autoconnect-unsubscribe');

const info = fresh.info();
assert.strictEqual(info.runtimeVersion, 'CC8.3.58-PR192-PUSH-DEVICE-AUTOCONNECT-UNSUBSCRIBE');
assert.strictEqual(info.sourceMarker, 'adminkit-pr192-push-device-autoconnect-unsubscribe');
assert.strictEqual(info.compactJoin, true);
assert.strictEqual(info.focusRefresh, true);
assert(info.state && typeof info.state === 'object');

console.log('PR189/PR190 fresh PWA pending tests passed');
