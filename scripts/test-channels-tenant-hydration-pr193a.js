'use strict';

const assert = require('assert');
const path = require('path');

function installFakeModule(relativePath, exportsValue) {
  const resolved = require.resolve(path.join('..', relativePath));
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue
  };
  return resolved;
}

const dbRowsByUser = {
  owner_user: [
    { channelId: '-100100', title: 'Мой Хвост', updatedAt: '2026-06-10T20:00:00Z' }
  ],
  other_user: [
    { channelId: '-200200', title: 'Чужой закрытый канал', updatedAt: '2026-06-10T20:01:00Z' }
  ]
};

installFakeModule('store', {
  getChannelsList: () => [],
  getPostsList: () => [],
  saveChannel: () => true
});

installFakeModule('services/clientAccessService', {
  getClientChannels: (maxUserId) => (maxUserId === 'tenant_user'
    ? [{ channelId: '-300300', title: 'Tenant канал' }]
    : []),
  getTenantByMaxUserId: () => null,
  bindTenantChannel: () => ({ ok: true })
});

installFakeModule('cc5-db-core', {
  getChannels: async (adminId) => dbRowsByUser[adminId] || []
});

installFakeModule('services/maxApi', {
  getChat: async () => { throw new Error('getChat must not be needed for titled DB channels'); }
});

installFakeModule('human-channel-title-helper', {
  UNTITLED_CHANNEL: 'Канал без названия'
});

delete require.cache[require.resolve('../channel-post-picker-core')];
const picker = require('../channel-post-picker-core');

(async () => {
  const ownerChannels = await picker.listUiChannelsForUser('owner_user', {});
  assert.equal(ownerChannels.length, 1, 'owner should see own DB-linked channel');
  assert.equal(ownerChannels[0].channelId, '-100100');
  assert.equal(ownerChannels[0].title, 'Мой Хвост');
  assert(!JSON.stringify(ownerChannels).includes('Чужой закрытый канал'), 'owner must not see another user channel');

  const otherChannels = await picker.listUiChannelsForUser('other_user', {});
  assert.equal(otherChannels.length, 1, 'other user should see only own channel');
  assert.equal(otherChannels[0].channelId, '-200200');
  assert.equal(otherChannels[0].title, 'Чужой закрытый канал');
  assert(!JSON.stringify(otherChannels).includes('Мой Хвост'), 'other user must not see owner channel');

  const tenantChannels = await picker.listUiChannelsForUser('tenant_user', {});
  assert.equal(tenantChannels.length, 1, 'tenant storage channel should still work');
  assert.equal(tenantChannels[0].channelId, '-300300');
  assert.equal(tenantChannels[0].title, 'Tenant канал');

  const emptyChannels = await picker.listUiChannelsForUser('empty_user', {});
  assert.deepEqual(emptyChannels, [], 'empty user should remain empty');

  console.log('PR193A tenant channel hydration: OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
