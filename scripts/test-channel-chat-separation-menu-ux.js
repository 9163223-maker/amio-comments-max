'use strict';

const assert = require('assert');
const picker = require('../channel-post-picker-core');
const access = require('../services/clientAccessService');
const store = require('../store');
const menuAdapter = require('../features/menu-v3/adapter');
const buttonsFlow = require('../buttons-flow-cc8-clean');
const statsFlow = require('../stats-flow-cc8');

function menu() {
  return {
    button(text, action, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) }; },
    keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
  };
}
function texts(screen) { return (screen.attachments?.[0]?.payload?.buttons || []).flat().map((b) => b.text).join('\n'); }
function withPatch(obj, key, value, fn) { const prev = obj[key]; obj[key] = value; return Promise.resolve().then(fn).finally(() => { obj[key] = prev; }); }

(async () => {
  const channels = [
    { channelId: 'chan-1', title: 'Real Channel', type: 'channel', isChannel: true },
    { chatId: 'chat-1', title: 'Chat by chatId', type: 'chat', isChat: true },
    { id: 'grp-1', title: 'Group', chatType: 'group' },
    { id: 'priv-1', title: 'Private', kind: 'private_chat' },
    { id: 'ambiguous-1', title: 'Ambiguous object' }
  ];
  const posts = [{ channelId: 'chan-1', postId: 'p1', commentKey: 'chan-1:p1', originalText: 'Visible post' }];

  await withPatch(access, 'getClientChannels', () => channels, async () => {
    await withPatch(store, 'getPostsList', () => posts, async () => {
      const uiChannels = await picker.listUiChannelsForUser('u1', {});
      assert.deepStrictEqual(uiChannels.map((c) => c.channelId), ['chan-1']);
      assert.strictEqual(uiChannels[0].type, 'channel');
      assert.strictEqual(uiChannels.some((c) => c.channelId === 'chat-1' || c.title === 'Group'), false);

      const built = await picker.buildChannelPickerRows(menu(), 'u1', 'comments', {});
      assert.strictEqual(texts({ attachments: menu().keyboard(built.rows) }).includes('Real Channel'), true);
      assert.strictEqual(texts({ attachments: menu().keyboard(built.rows) }).includes('Chat by chatId'), false);

      const one = await buttonsFlow.screenForPayload(menu(), { action: 'button_admin_recent_posts' }, { userId: 'u1', config: {} });
      assert.match(one.text, /Канал: Real Channel/);
      assert.match(one.text, /Выберите пост/);
      assert.doesNotMatch(one.text + texts(one), /Chat by chatId|Group|Private/);
    });
  });

  await withPatch(access, 'getClientChannels', () => [
    { channelId: 'chan-1', title: 'Real Channel', type: 'channel', isChannel: true },
    { channelId: 'chan-2', title: 'Second Channel', type: 'channel', isChannel: true },
    { chatId: 'chat-1', title: 'Chat by chatId', type: 'chat', isChat: true }
  ], async () => {
    await withPatch(store, 'getPostsList', () => posts, async () => {
      const multi = await buttonsFlow.screenForPayload(menu(), { action: 'button_admin_recent_posts' }, { userId: 'u1', config: {} });
      assert.strictEqual(multi.id, 'buttons_clean_channel_picker');
      assert.match(texts(multi), /Real Channel/);
      assert.match(texts(multi), /Second Channel/);
      assert.doesNotMatch(texts(multi), /Chat by chatId/);
    });
  });

  await withPatch(access, 'getClientChannels', () => [{ chatId: 'chat-1', title: 'Chat only', type: 'chat', isChat: true }], async () => {
    await withPatch(store, 'getPostsList', () => [], async () => {
      const empty = await buttonsFlow.screenForPayload(menu(), { action: 'button_admin_recent_posts' }, { userId: 'u1', config: {} });
      assert.strictEqual(empty.id, 'buttons_clean_no_channels');
      assert.match(texts(empty), /Подключить канал/);
      assert.match(texts(empty), /Главное меню/);
    });
  });

  const channelsHome = menuAdapter.render('channels:home');
  assert.strictEqual((texts(channelsHome).match(/Инструкция/g) || []).length, 0);
  assert.strictEqual((texts(channelsHome).match(/Помощь/g) || []).length, 1);
  for (const route of ['buttons:home', 'ad_links:home', 'polls:home', 'highlights:home', 'editor:home', 'archive:home', 'settings:home']) {
    const screen = menuAdapter.render(route);
    assert.doesNotMatch(screen.text, /^.+\n\nВыберите действие\.$/);
  }
  assert.doesNotMatch(texts(menuAdapter.render('ad_links:home')), /Создать рекламную ссылку|Мои рекламные ссылки/);
  assert.match(texts(menuAdapter.render('ad_links:home')), /Создать ссылку|Мои ссылки/);
  assert.doesNotMatch(texts(menuAdapter.render('highlights:home')), /Поставить выделение|Снять выделение/);
  assert.match(texts(menuAdapter.render('highlights:home')), /Поставить метку|Снять метку/);

  const statsRoot = await statsFlow.screenForPayload(menu(), { action: 'admin_section_stats' }, { userId: 'u1', config: {} });
  assert.strictEqual(statsRoot.id, 'stats_root_menu_pr229');
  assert.doesNotMatch(statsRoot.text + texts(statsRoot), /Chat only|Выберите канал или чат/i);
  assert.match(texts(statsRoot), /Обзор/);
  assert.match(texts(statsRoot), /По каналу/);
  assert.match(texts(statsRoot), /По посту/);

  console.log('channel-chat separation and root menu UX tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
