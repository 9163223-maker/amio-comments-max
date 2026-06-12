'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const dbPath = require.resolve('../cc5-db-core');
const buttonsPath = require.resolve('../buttons-flow-cc8-clean');
const pickerPath = require.resolve('../channel-post-picker-core');

delete require.cache[dbPath];
delete require.cache[buttonsPath];
delete require.cache[pickerPath];

const USER_ID = 'pr197-admin-user';
const CHANNEL_ID = 'pr197-db-channel';
const COMMENT_KEY = `${CHANNEL_ID}:db-post-1`;

let getPostsCalls = [];

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    getPosts: async (adminId, channelId, limit) => {
      getPostsCalls.push({ adminId, channelId, limit });
      assert.strictEqual(adminId, USER_ID);
      assert.strictEqual(channelId, CHANNEL_ID);
      return [{
        postId: 'db-post-1',
        commentKey: COMMENT_KEY,
        title: 'DB backed post is visible',
        messageId: 'db-message-1',
        updatedAt: new Date('2026-06-12T12:00:00Z').toISOString()
      }];
    }
  }
};

require.cache[pickerPath] = {
  id: pickerPath,
  filename: pickerPath,
  loaded: true,
  exports: {
    looksInternal: () => false,
    safePostPreview: (post) => String(post.originalText || post.title || post.postText || 'post'),
    listUiChannelsForUser: async () => [{ channelId: CHANNEL_ID, title: 'DB Channel', type: 'channel', isChannel: true }],
    buildChannelPickerRows: async (menu) => ({
      channels: [{ channelId: CHANNEL_ID, title: 'DB Channel' }],
      rows: [[menu.button('DB Channel', 'button_admin_channel_pick', { channelId: CHANNEL_ID })]],
      diagnostics: []
    })
  }
};

const store = require('../store');
const access = require('../services/clientAccessService');
const buttons = require('../buttons-flow-cc8-clean');

if (typeof access._resetForTests === 'function') access._resetForTests();
store.store.posts = {};
store.store.channels = {};
store.store.setup = {};
store.store.setupState = {};
store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
store.saveStore();

const menu = {
  button(text, action, extra = {}) { return { text, payload: JSON.stringify({ action, ...extra }) }; },
  keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
};
function visible(screen) {
  const labels = (screen.attachments?.[0]?.payload?.buttons || []).flat().map((item) => String(item.text || '').trim()).filter(Boolean);
  return [String(screen.text || ''), ...labels].join('\n');
}

(async () => {
  const pickerScreen = await buttons.screenForPayload(menu, {
    action: 'button_admin_channel_pick',
    channelId: CHANNEL_ID,
    skipChannels: '1'
  }, { userId: USER_ID, config: { botToken: '' } });

  const pickerText = visible(pickerScreen);
  assert.strictEqual(pickerScreen.id, 'buttons_clean_picker');
  assert.ok(pickerText.includes('DB backed post is visible'), 'DB post is rendered in post picker');
  assert.ok(!pickerText.includes('В этом канале пока нет сохранённых постов.'), 'empty state is not shown');
  assert.ok(getPostsCalls.some((call) => call.adminId === USER_ID && call.channelId === CHANNEL_ID), 'db.getPosts was called with adminId + channelId');

  const selectScreen = await buttons.screenForPayload(menu, {
    action: 'button_admin_select_post',
    channelId: CHANNEL_ID,
    commentKey: COMMENT_KEY
  }, { userId: USER_ID, config: { botToken: '' } });

  const selectText = visible(selectScreen);
  assert.strictEqual(selectScreen.id, 'buttons_clean_selected_post');
  assert.ok(selectText.includes('Пост для кнопок выбран'), 'DB post can be selected');
  assert.ok(selectText.includes('DB backed post is visible'), 'selected screen keeps DB post title');
  assert.ok(!/commentKey|postId|payload|token|trace/i.test(selectText), 'technical identifiers stay hidden');

  console.log('PR197 DB-backed buttons post picker assertions passed');
})().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
