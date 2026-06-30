'use strict';

const assert = require('assert');
const picker = require('../channel-post-picker-core');
const access = require('../services/clientAccessService');
const maxApi = require('../services/maxApi');
const store = require('../store');
const menuAdapter = require('../features/menu-v3/adapter');
const buttonsFlow = require('../buttons-flow-cc8-clean');
const statsFlow = require('../stats-flow-cc8');
const channelFirstWrapper = require('../clean-bot-channel-first-post-picker-pr90');

function menu() {
  return {
    button(text, action, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) }; },
    keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
  };
}
function texts(screen) { return (screen.attachments?.[0]?.payload?.buttons || []).flat().map((b) => b.text).join('\n'); }
function withPatch(obj, key, value, fn) { const prev = obj[key]; obj[key] = value; return Promise.resolve().then(fn).finally(() => { obj[key] = prev; }); }
function response() { return { code: 0, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return body; } }; }
function callbackUpdate(action, source = 'comments', extra = {}) {
  return {
    update_type: 'callback',
    callback: { callback_id: `cb_${action}_${source}`, user_id: 'u1', payload: JSON.stringify({ action, source, ...extra }) },
    message: { id: `msg_${action}_${source}`, recipient: { chat_id: 'u1', chat_type: 'dialog' }, sender: { user_id: 'u1' }, body: { text: 'АдминКИТ' } }
  };
}
async function renderWrapper(action, source = 'comments', extra = {}) {
  const sent = { text: '', attachments: [] };
  await withPatch(maxApi, 'answerCallback', async () => ({ ok: true }), async () => {
    await withPatch(maxApi, 'editMessage', async (payload) => { sent.text = payload.text || ''; sent.attachments = payload.attachments || []; return { ok: true, message: { id: 'edited' } }; }, async () => {
      await withPatch(maxApi, 'sendMessage', async (payload) => { sent.text = payload.text || ''; sent.attachments = payload.attachments || []; return { ok: true, message: { id: 'sent' } }; }, async () => {
        const bot = channelFirstWrapper.createCleanBot({});
        const res = response();
        await bot.handleWebhook({ body: callbackUpdate(action, source, extra) }, res, { botToken: 'test-token' });
        assert.strictEqual(res.code, 200, `wrapper response ${action}`);
        assert(res.body && res.body.ok, `wrapper ok ${action}`);
      });
    });
  });
  return sent;
}

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

  await withPatch(access, 'getClientChannels', () => channels, async () => {
    channelFirstWrapper._private.installStrictChannelAccessPatch();
    await withPatch(store, 'getPostsList', () => posts, async () => {
      const wrapperOne = await renderWrapper('comments_select_post', 'comments');
      assert.match(wrapperOne.text, /Канал: Real Channel/);
      assert.match(wrapperOne.text, /Выберите пост/);
      assert.doesNotMatch(wrapperOne.text + texts(wrapperOne), /Chat by chatId|Group|Private|Ambiguous object/);
    });
  });

  await withPatch(access, 'getClientChannels', () => [
    { channelId: 'chan-1', title: 'Real Channel', type: 'channel', isChannel: true },
    { channelId: 'chan-2', title: 'Second Channel', type: 'channel', isChannel: true },
    { chatId: 'chat-1', title: 'Chat by chatId', type: 'chat', isChat: true }
  ], async () => {
    channelFirstWrapper._private.installStrictChannelAccessPatch();
    await withPatch(store, 'getPostsList', () => posts, async () => {
      const wrapperMulti = await renderWrapper('admin_stats_post', 'stats');
      assert.match(wrapperMulti.text, /Выберите канал/);
      assert.match(texts(wrapperMulti), /Real Channel/);
      assert.match(texts(wrapperMulti), /Second Channel/);
      assert.doesNotMatch(wrapperMulti.text + texts(wrapperMulti), /Chat by chatId/);
    });
  });

  await withPatch(access, 'getClientChannels', () => [{ chatId: 'chat-1', title: 'Chat only', type: 'chat', isChat: true }], async () => {
    channelFirstWrapper._private.installStrictChannelAccessPatch();
    await withPatch(store, 'getPostsList', () => [], async () => {
      const wrapperEmpty = await renderWrapper('admin_posts_picker', 'posts');
      assert.match(wrapperEmpty.text, /У вас пока нет подключённых каналов/);
      assert.match(texts(wrapperEmpty), /Подключить канал/);
      assert.match(texts(wrapperEmpty), /Главное меню/);
      assert.doesNotMatch(wrapperEmpty.text + texts(wrapperEmpty), /Chat only/);
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
