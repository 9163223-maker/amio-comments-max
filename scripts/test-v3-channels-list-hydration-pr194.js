'use strict';

const assert = require('assert');

const pickerPath = require.resolve('../channel-post-picker-core');
const menuPath = require.resolve('../v3-menu-core-1539');

delete require.cache[pickerPath];
delete require.cache[menuPath];

require.cache[pickerPath] = {
  id: pickerPath,
  filename: pickerPath,
  loaded: true,
  exports: {
    RUNTIME: 'test-picker-runtime',
    isKnownChannelRecord: () => true,
    listUiChannelsForUser: async (userId, config = {}) => {
      assert.strictEqual(userId, 'admin-pr194');
      assert.strictEqual(config.botToken, 'test-token');
      return [
        {
          channelId: '-100194001',
          title: 'Tenant Live Channel',
          type: 'channel',
          isChannel: true,
          botAccess: true
        }
      ];
    }
  }
};

const menu = require('../v3-menu-core-1539');

(async () => {
  const syncScreen = menu.screenForPayload({ action: 'channels:list' }, { userId: 'admin-pr194', config: { botToken: 'test-token' } });
  assert(syncScreen.text.includes('Каналы пока не подключены.'), 'sync route remains safe without async hydration');

  const screen = await menu.asyncScreenForPayload({ action: 'channels:list' }, { userId: 'admin-pr194', config: { botToken: 'test-token' } });
  const labels = (screen.attachments?.[0]?.payload?.buttons || []).flat().map((item) => String(item.text || '').trim()).filter(Boolean);
  const visible = [screen.text, ...labels].join('\n');

  assert(screen.text.includes('Мои каналы'), 'unified channels list opens the My channels screen');
  assert(!screen.text.includes('Каналы пока не подключены.'), 'async unified channels list must not render empty state when shared picker returns channels');
  assert(labels.includes('Tenant Live Channel'), 'tenant channel from shared picker is rendered');
  assert(labels.includes('Назад'), 'navigation is preserved');
  assert(labels.includes('Главное меню'), 'main menu navigation is preserved');
  assert(!/channelId|commentKey|postId|token|payload/i.test(visible), 'technical identifiers stay hidden');

  console.log('PR194 unified channels list hydration assertions passed');
})().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
