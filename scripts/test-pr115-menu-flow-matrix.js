'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const postPatcher = require('../services/postPatcher');
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

function buttonLabels(screen) {
  return (screen.attachments || [])
    .flatMap((attachment) => attachment?.payload?.buttons || [])
    .flat()
    .map((button) => button?.text || '')
    .filter(Boolean);
}

function assertTenantAScreen(screen, label) {
  const text = screenText(screen);
  assert.ok(/Tenant A Channel|Tenant A Public Post/.test(text), `${label} should include tenant A content`);
  assert.ok(!/Tenant B Channel|Tenant B Secret Post/.test(text), `${label} must not leak tenant B content`);
}

function assertNoButtonsCta(screen, label) {
  assert.ok(!/\bCTA\b/i.test(screenText(screen)), `${label} must not expose CTA wording`);
}

function assertNoDelete(screen, label) {
  assert.ok(!buttonLabels(screen).some((text) => /Удалить последнюю кнопку/i.test(text)), `${label} must not expose delete`);
}

function assertHasDelete(screen, label) {
  assert.ok(buttonLabels(screen).some((text) => /Удалить последнюю кнопку/i.test(text)), `${label} must expose delete`);
}

function deletePayload(screen) {
  return (screen.attachments || [])
    .flatMap((attachment) => attachment?.payload?.buttons || [])
    .flat()
    .find((button) => /Удалить последнюю кнопку/i.test(button?.text || ''))?.payload || null;
}

function buttonSet(commentKey) {
  return store.store.growth?.byChannel?.[TENANT_A_CHANNEL]?.buttonSets?.[commentKey] || [];
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
  store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
  store.saveStore();
  postPatcher.patchStoredPost = async () => ({ ok: true, skipped: true });

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

  const buttonHomeWithoutTarget = await buttons.screenForPayload(menu, { action: 'admin_section_buttons' }, { userId: TENANT_A_USER, config: {} });
  assertNoButtonsCta(buttonHomeWithoutTarget, 'buttons:home');
  assertNoDelete(buttonHomeWithoutTarget, 'buttons:home without target');

  const buttonStartAdd = await buttons.screenForPayload(menu, { action: 'button_admin_start_add' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(buttonStartAdd, 'button_admin_start_add');
  assertNoButtonsCta(buttonStartAdd, 'button_admin_start_add');

  const commentKeyA = `${TENANT_A_CHANNEL}:post-a`;
  store.setSetupState(TENANT_A_USER, {
    buttonTargetPost: { commentKey: commentKeyA, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a' },
    commentTargetPost: { commentKey: commentKeyA, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a' }
  });
  const buttonCurrentEmpty = await buttons.screenForPayload(menu, { action: 'button_admin_show_current' }, { userId: TENANT_A_USER, config: {} });
  assertNoDelete(buttonCurrentEmpty, 'button_admin_show_current without existing buttons');
  store.store.growth.byChannel[TENANT_A_CHANNEL] = {
    channelId: TENANT_A_CHANNEL,
    buttonSets: {
      [commentKeyA]: [{ id: 'existing-button', text: 'Подробнее', url: 'https://example.com/a', tenantKey: tenantA.tenantKey, ownerUserId: TENANT_A_USER }]
    }
  };

  const buttonHomeWithTarget = await buttons.screenForPayload(menu, { action: 'admin_section_buttons' }, { userId: TENANT_A_USER, config: {} });
  assertNoButtonsCta(buttonHomeWithTarget, 'buttons:home with target');
  assertNoDelete(buttonHomeWithTarget, 'buttons:home with existing buttons');

  const buttonCurrent = await buttons.screenForPayload(menu, { action: 'button_admin_show_current' }, { userId: TENANT_A_USER, config: {} });
  assertNoButtonsCta(buttonCurrent, 'button_admin_show_current');
  assertHasDelete(buttonCurrent, 'button_admin_show_current with selected post buttons');

  const addLabel = await buttons.screenForPayload(menu, { action: 'button_admin_start_add' }, { userId: TENANT_A_USER, config: {} });
  assertNoButtonsCta(addLabel, 'button_admin_start_add selected post');
  assert.strictEqual(addLabel.id, 'buttons_clean_add_label', 'button_admin_start_add starts text entry for selected post');
  const addUrl = await buttons.handleTextInput(menu, { userId: TENANT_A_USER, text: 'Купить', config: {} });
  assert.strictEqual(addUrl.id, 'buttons_clean_add_url', 'button text input should ask for URL next');
  const beforeUrlInputCount = buttonSet(commentKeyA).length;
  const preview = await buttons.handleTextInput(menu, { userId: TENANT_A_USER, text: 'https://example.com/buy', config: {} });
  assert.strictEqual(preview.id, 'buttons_clean_add_preview', 'URL input must show preview before save');
  assert.ok(/Купить/.test(screenText(preview)) && /https:\/\/example.com\/buy/.test(screenText(preview)), 'preview must show button text and link');
  assert.strictEqual(buttonSet(commentKeyA).length, beforeUrlInputCount, 'URL input must not save immediately');
  const saved = await buttons.screenForPayload(menu, { action: 'button_admin_save' }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(buttonSet(commentKeyA).length, beforeUrlInputCount + 1, 'preview confirmation must save the draft button');
  assert.ok(/Кнопка сохранена/.test(screenText(saved)), 'preview confirmation should return saved state');

  const beforeRawDeleteCount = buttonSet(commentKeyA).length;
  const rawDelete = await buttons.screenForPayload(menu, { action: 'button_admin_delete' }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(buttonSet(commentKeyA).length, beforeRawDeleteCount, 'raw button_admin_delete without card marker must not delete');
  assert.ok(/Текущие кнопки/.test(screenText(rawDelete)), 'raw delete should tell user to open current-buttons card');
  assertNoButtonsCta(rawDelete, 'raw delete rejection');

  const currentAfterSave = await buttons.screenForPayload(menu, { action: 'button_admin_show_current' }, { userId: TENANT_A_USER, config: {} });
  assertHasDelete(currentAfterSave, 'button_admin_show_current after save');
  assert.deepStrictEqual(deletePayload(currentAfterSave), { action: 'button_admin_delete', source: 'current_buttons_card' }, 'delete button must carry current-buttons card marker');
  const cardDelete = await buttons.screenForPayload(menu, deletePayload(currentAfterSave), { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(buttonSet(commentKeyA).length, beforeRawDeleteCount - 1, 'card-marked button_admin_delete must delete exactly one button');
  assert.ok(/Последняя кнопка удалена/.test(screenText(cardDelete)), 'card-marked delete should confirm removal');

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
