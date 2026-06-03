'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const buttons = require('../buttons-flow-cc8-clean');
const gifts = require('../gifts-flow-cc8-fast');
const archive = require('../archive-clean-flow-cc8311');

const TENANT_A_USER = 'pr115-tenant-a';
const TENANT_B_USER = 'pr115-tenant-b';
const TENANT_A_CHANNEL = '-pr115-tenant-a-channel';
const TENANT_B_CHANNEL = '-pr115-tenant-b-channel';

const menu = {
  button(text, action, extra = {}) { return { type: 'callback', text, payload: { action, ...extra } }; },
  keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
};

function screenText(screen) {
  const buttonText = (screen.attachments || [])
    .flatMap((attachment) => attachment?.payload?.buttons || [])
    .flat()
    .map((button) => button?.text || '')
    .join('\n');
  return `${screen.text || ''}\n${buttonText}`;
}

function assertTenantAScreen(screen, label) {
  const text = screenText(screen);
  assert.ok(/Tenant A Channel|Tenant A Public Post/.test(text), `${label} should include tenant A content`);
  assert.ok(!/Tenant B Channel|Tenant B Secret Post/.test(text), `${label} must not leak tenant B content`);
}

function activateTenant(userId, name) {
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr115-admin' });
  const activated = access.activateCode({ maxUserId: userId, name, code: code.code });
  assert.strictEqual(activated.ok, true, `${name} activation succeeds`);
  return access.getTenantByMaxUserId(userId);
}

async function main() {
  access._resetForTests();
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.channels = {};
  store.store.setup = {};
  store.saveStore();

  const tenantA = activateTenant(TENANT_A_USER, 'Tenant A');
  const tenantB = activateTenant(TENANT_B_USER, 'Tenant B');
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', maxChannels: 1 }).ok, true);
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantB.tenantId, channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', maxChannels: 1 }).ok, true);

  store.saveChannel(TENANT_A_CHANNEL, { channelId: TENANT_A_CHANNEL, title: 'Tenant A Channel', channelTitle: 'Tenant A Channel' });
  store.saveChannel(TENANT_B_CHANNEL, { channelId: TENANT_B_CHANNEL, title: 'Tenant B Channel', channelTitle: 'Tenant B Channel' });

  // Legacy unscoped posts are intentionally visible to the owner, but production
  // menus must still intersect them with the active client's tenant-visible channels.
  store.savePost(`${TENANT_A_CHANNEL}:post-a`, { channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a', originalText: 'Tenant A Public Post', createdAt: 1000, updatedAt: 1000 });
  store.savePost(`${TENANT_B_CHANNEL}:post-b`, { channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', postId: 'post-b', messageId: 'msg-b', originalText: 'Tenant B Secret Post', createdAt: 2000, updatedAt: 2000 });
  store.setSetupState(TENANT_A_USER, {
    canReadLegacyUnscoped: true,
    buttonTargetPost: { commentKey: `${TENANT_B_CHANNEL}:post-b`, channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', postId: 'post-b' },
    commentTargetPost: { commentKey: `${TENANT_B_CHANNEL}:post-b`, channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', postId: 'post-b' }
  });

  const buttonStartAdd = await buttons.screenForPayload(menu, { action: 'button_admin_start_add' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(buttonStartAdd, 'button_admin_start_add');

  const giftRecentPosts = await gifts.screenForPayload(menu, { action: 'gift_admin_recent_posts' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(giftRecentPosts, 'gift_admin_recent_posts');

  const archiveList = await archive.screenForPayload(menu, { action: 'archive_list' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(archiveList, 'archive_list');

  console.log('PR115 menu flow matrix tenant filtering assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
