'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sha256 = (file) => crypto.createHash('sha256').update(read(file)).digest('hex');

// These hashes pin the PR191 admin identity and tenant router implementations.
// PR192 is a PUSH-only change and must not carry the separate emergency bridge fix.
assert.strictEqual(sha256('cc5-db-core.js'), '3da04acd70049ca798236d79ea9de3bf7b7258fa615f7085c1471899be9fe32c', 'PR192 must not change cc5-db-core.js');
assert.strictEqual(sha256('cc6540-functional-canonical-router.js'), 'e76a9a529db0c41b63e1a6a105a898222d717dbdfb9ed730b37442e7774ea9b0', 'PR192 must not change the canonical tenant router');

const db = require('../cc5-db-core');
assert.strictEqual(db.adminId({ callback: { user: { user_id: 'admin-callback-192' } } }), 'admin-callback-192');
assert.strictEqual(db.adminId({ message: { sender: { user_id: 'admin-message-192' } } }), 'admin-message-192');
assert.strictEqual(db.adminId({ user: { user_id: 'admin-update-192' } }), 'admin-update-192');
assert.strictEqual(db.adminId({ maxUserId: 'push-user-must-not-be-admin' }), '', 'PUSH maxUserId is not an admin identity source');
assert.strictEqual(db.adminId({ subscription: { maxUserId: 'push-subscription-user' } }), '', 'push subscription context is not used for admin data access');

const pushFiles = [
  'web-push-routes.js',
  'pr178-push-pairing-bootstrap.js',
  'services/pushPairingService.js',
  'services/pushConnectedChatsService.js',
  'services/webPushStorage.js',
  'public/push-client.js',
  'features/account-screens-pr106.js'
];
const pushSource = pushFiles.map((file) => read(file)).join('\n');
for (const table of ['ak_admin_channels', 'ak_posts', 'ak_admins']) {
  assert(!pushSource.includes(table), `PR192 PUSH code must not read or modify ${table}`);
}
assert(!/adminId\s*[:=]\s*maxUserId|(?:const|let|var)\s+adminId\s*=\s*[^;]*maxUserId|adminId\s*\(\s*maxUserId/i.test(pushSource), 'PR192 must not map PUSH maxUserId to admin adminId');
assert(!/\bgetChats\s*\(/.test(pushSource), 'PR192 adds no global getChats fallback to PUSH/admin UI code');
assert(!/create table[^;]*(?:ak_admin_channels|ak_posts|ak_admins)/i.test(pushSource), 'PR192 adds no admin Postgres schema changes');

const accountScreen = read('features/account-screens-pr106.js');
assert(!/\bgetChats\s*\(/.test(accountScreen), 'notification account screen does not bypass tenant isolation with getChats');
assert(!accountScreen.includes('maxUserId: adminId') && !accountScreen.includes('adminId: maxUserId'));

console.log('PR192 admin identity/tenant bridge isolation: OK');
