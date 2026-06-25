'use strict';

const assert = require('assert');
const store = require('../store');
const menu = require('../v3-menu-core-1539');
const statsTargets = require('../services/statsTargetsService');

function rows(screen) {
  return screen?.attachments?.[0]?.payload?.buttons || screen?.attachments?.payload?.buttons || screen?.attachments?.rows || [];
}
function labels(screen) {
  return rows(screen).flat().map((button) => String(button.text || '').trim()).filter(Boolean);
}
function text(screen) {
  return String(screen && screen.text || '');
}
function assertRenderable(screen, label) {
  assert.ok(screen, `${label} must return a screen`);
  assert.ok(text(screen).trim(), `${label} must have visible text`);
  assert.ok(rows(screen).length > 0, `${label} must have buttons`);
}

(async function run() {
  const original = JSON.parse(JSON.stringify(store.store));
  try {
    const userA = 'pr241-user-a';
    const userB = 'pr241-user-b';

    // Gifts root must never be silent for both canonical and legacy section actions.
    const syncGifts = menu.screenForPayload({ action: 'gifts:home' });
    assertRenderable(syncGifts, 'sync gifts:home');
    assert.ok(/Подарки|лид-магниты/i.test(text(syncGifts)), 'sync gifts:home must render Gifts section text');

    const syncLegacyGifts = menu.screenForPayload({ action: 'admin_section_gifts' });
    assertRenderable(syncLegacyGifts, 'sync admin_section_gifts');
    assert.ok(/Подарки|лид-магниты/i.test(text(syncLegacyGifts)), 'sync admin_section_gifts must render Gifts section text');

    const asyncGifts = await menu.asyncScreenForPayload({ action: 'gifts:home' }, { userId: userA, config: {} });
    assertRenderable(asyncGifts, 'async gifts:home');
    assert.ok(/Подарки|лид-магниты/i.test(text(asyncGifts)), 'async gifts:home must render Gifts section text');

    const asyncLegacyGifts = await menu.asyncScreenForPayload({ action: 'admin_section_gifts' }, { userId: userA, config: {} });
    assertRenderable(asyncLegacyGifts, 'async admin_section_gifts');
    assert.ok(/Подарки|лид-магниты/i.test(text(asyncLegacyGifts)), 'async admin_section_gifts must render Gifts section text');

    // Stats target selector must be tenant/user-scoped and must not leak foreign channels/chats.
    store.replaceStoreInPlace({
      ...original,
      channels: {},
      posts: {},
      comments: {},
      likes: {},
      reactions: {},
      setupState: {}
    });

    store.saveChannel('pr241-own-channel', { channelId: 'pr241-own-channel', title: 'PR241 Own Channel', linkedByUserId: userA });
    store.saveChannel('pr241-post-bound-channel', { channelId: 'pr241-post-bound-channel', title: 'PR241 Post Bound Channel' });
    store.saveChannel('pr241-foreign-channel', { channelId: 'pr241-foreign-channel', title: 'PR241 Foreign Channel', linkedByUserId: userB });
    store.saveChannel('pr241-unbound-channel', { channelId: 'pr241-unbound-channel', title: 'PR241 Unbound Channel' });

    store.savePost('pr241-post-bound-channel:post-1', {
      channelId: 'pr241-post-bound-channel',
      postId: 'post-1',
      commentKey: 'pr241-post-bound-channel:post-1',
      originalText: 'Owned post-bound channel post',
      ownerUserId: userA
    });
    store.savePost('pr241-foreign-channel:post-1', {
      channelId: 'pr241-foreign-channel',
      postId: 'post-1',
      commentKey: 'pr241-foreign-channel:post-1',
      originalText: 'Foreign post',
      ownerUserId: userB
    });

    const result = statsTargets.listStatsTargetsForUser(userA, {
      chats: [
        { chatId: 'pr241-own-chat', title: 'PR241 Own Chat', linkedByUserId: userA },
        { chatId: 'pr241-foreign-chat', title: 'PR241 Foreign Chat', linkedByUserId: userB },
        { chatId: 'pr241-unbound-chat', title: 'PR241 Unbound Chat' }
      ]
    });

    const channelIds = result.channels.map((item) => item.channelId).sort();
    const chatIds = result.chats.map((item) => item.chatId).sort();
    assert.deepStrictEqual(channelIds, ['pr241-own-channel', 'pr241-post-bound-channel'], 'stats targets must include only own/post-bound channels');
    assert.deepStrictEqual(chatIds, ['pr241-own-chat'], 'stats targets must include only own chats');
    assert.ok(!result.targets.some((item) => /Foreign|Unbound/i.test(item.title)), 'stats target titles must not include foreign or unbound objects');

    const statsScreen = await menu.asyncScreenForPayload({ action: 'admin_section_stats' }, {
      userId: userA,
      config: {
        chats: [
          { chatId: 'pr241-own-chat', title: 'PR241 Own Chat', linkedByUserId: userA },
          { chatId: 'pr241-foreign-chat', title: 'PR241 Foreign Chat', linkedByUserId: userB },
          { chatId: 'pr241-unbound-chat', title: 'PR241 Unbound Chat' }
        ]
      }
    });
    assertRenderable(statsScreen, 'admin_section_stats tenant selector');
    const visibleStats = [text(statsScreen), ...labels(statsScreen)].join('\n');
    assert.ok(/PR241 Own Channel/.test(visibleStats), 'stats selector must show own channel');
    assert.ok(/PR241 Post Bound Channel/.test(visibleStats), 'stats selector must show post-bound own channel');
    assert.ok(/PR241 Own Chat/.test(visibleStats), 'stats selector must show own chat');
    assert.ok(!/PR241 Foreign|PR241 Unbound/i.test(visibleStats), 'stats selector must not show foreign or unbound targets');

    console.log('PR241 gifts/stats tenant contract ok');
  } finally {
    store.replaceStoreInPlace(original);
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
