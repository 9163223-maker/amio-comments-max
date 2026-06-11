'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const tenant = require('../tenant-scope');
const access = require('../services/clientAccessService');
const buttons = require('../buttons-flow-cc8-clean');

const USER_ID = 'pr195-admin-user';
const CHANNEL_ID = 'pr195_picker_visible_channel';
const COMMENT_KEY = `${CHANNEL_ID}:post-1`;

const menu = {
  button(text, action, extra = {}) { return { text, payload: JSON.stringify({ action, ...extra }) }; },
  keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
};

function resetState() {
  if (typeof access._resetForTests === 'function') access._resetForTests();
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.channels = {};
  store.store.setup = {};
  store.store.setupState = {};
  store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
  store.store.gifts = { campaigns: {}, claims: {}, settings: {} };
  store.saveStore();
}

function visible(screen) {
  const labels = (screen.attachments?.[0]?.payload?.buttons || []).flat().map((button) => String(button.text || '').trim()).filter(Boolean);
  return [String(screen.text || ''), ...labels].join('\n');
}

(async () => {
  resetState();

  const ctx = tenant.ensureTenantContext(USER_ID);
  assert.deepStrictEqual(access.getClientChannels(USER_ID), [], 'fixture keeps clientAccess channel list empty');

  store.saveChannel(CHANNEL_ID, {
    channelId: CHANNEL_ID,
    title: 'Picker Visible Channel',
    channelTitle: 'Picker Visible Channel',
    ownerUserId: USER_ID
  });

  store.savePost(COMMENT_KEY, tenant.stampRecord({
    channelId: CHANNEL_ID,
    channelTitle: 'Picker Visible Channel',
    postId: 'post-1',
    messageId: 'msg-post-1',
    commentKey: COMMENT_KEY,
    originalText: 'Post visible only through tenant-owned post channel'
  }, ctx));

  const posts = buttons.listPosts(CHANNEL_ID, USER_ID);
  assert.strictEqual(posts.length, 1, 'buttons listPosts includes tenant-owned post even when clientAccess channels are empty');
  assert.strictEqual(posts[0].commentKey, COMMENT_KEY, 'expected tenant post is returned');

  const screen = await buttons.screenForPayload(menu, {
    action: 'button_admin_channel_pick',
    channelId: CHANNEL_ID,
    skipChannels: '1'
  }, { userId: USER_ID, config: { botToken: '' } });

  const text = visible(screen);
  assert.strictEqual(screen.id, 'buttons_clean_picker', 'channel choice opens buttons post picker');
  assert.ok(text.includes('Post visible only through tenant-owned post channel'), 'post picker renders tenant-owned post');
  assert.ok(!text.includes('В этом канале пока нет сохранённых постов.'), 'post picker does not show empty state');
  assert.ok(!/commentKey|channelId|postId|payload|token|trace/i.test(text), 'technical identifiers stay hidden');

  console.log('PR195 buttons tenant post picker channel linkage assertions passed');
})().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
