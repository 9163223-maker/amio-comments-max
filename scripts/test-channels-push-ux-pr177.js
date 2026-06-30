'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const canonical = require('../features/menu-v3/canonical-menu');
const adapter = require('../features/menu-v3/adapter');
const publishing = require('../services/groupPushAdminPublishingService');
const onboarding = require('../services/groupPushOnboardingService');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const rows = (screen) => screen?.attachments?.[0]?.payload?.buttons || [];
const labels = (screen) => rows(screen).flat().map((item) => String(item?.text || '').trim()).filter(Boolean);
const visible = (screen) => [String(screen?.text || ''), ...labels(screen)].join('\n');
const rawId = /(?:^|\n)-\d{6,}(?:$|\n)|\b\d{10,}\b/;

const channelActions = canonical.clientActions('channels').map((item) => item.title);
assert.deepStrictEqual(channelActions, ['Подключить канал', 'Мои каналы']);
assert(!channelActions.includes('Инструкция'));
assert(!channelActions.includes('Проверить права бота'));

const channelsRoot = adapter.render('channels:home');
assert.deepStrictEqual(labels(channelsRoot), ['Подключить канал', 'Мои каналы', 'Помощь', 'Главное меню']);
assert(channelsRoot.text.includes('Подключите канал, чтобы управлять комментариями, подарками, кнопками и статистикой через АдминКИТ.'));
assert(!visible(channelsRoot).includes('Инструкция'));
assert(!visible(channelsRoot).includes('Проверить права бота'));

const channelsHelp = adapter.render('channels:help');
assert(channelsHelp.text.includes('Помощь: Каналы'));
for (const forbidden of ['MAX API', 'client profile', 'technical identifiers', 'internal id', 'debug']) {
  assert(!channelsHelp.text.toLowerCase().includes(forbidden.toLowerCase()), `Channels help excludes ${forbidden}`);
}

const channelsList = adapter.render('channels:list', {
  channels: [
    { channelId: '-75643106932142', title: '-75643106932142', type: 'channel' },
    { channelId: '-70251029837230', title: '', type: 'channel' },
    { channelId: '-73175958664622', title: 'Канал продукта', type: 'channel' },
    { channelId: '-79999999999999', title: 'Обычный чат', type: 'chat' }
  ]
});
assert(!rawId.test(visible(channelsList)), 'My Channels never exposes raw identifiers');
assert(labels(channelsList).includes('Канал 1'));
assert(labels(channelsList).includes('Канал 2'));
assert(labels(channelsList).includes('Канал продукта'));
assert(!labels(channelsList).includes('Обычный чат'), 'unconfirmed chat is hidden from Channels');

const emptyChannels = adapter.render('channels:list');
assert(emptyChannels.text.includes('Каналы пока не подключены.'));
assert(emptyChannels.text.includes('Добавьте бота администратором в MAX-канал и перешлите сюда любой пост.'));
const channelCard = adapter.render('channels:card', { payload: { channelId: '-75643106932142', channelTitle: 'Канал продукта', botAccess: true } });
assert(channelCard.text.includes('Канал: Канал продукта'));
assert(channelCard.text.includes('Статус: подключён'));
assert(labels(channelCard).includes('Обновить статус'));
assert(!labels(channelsRoot).includes('Обновить статус'));
assert(!rawId.test(visible(channelCard)));

const pushRoot = adapter.render('push:home');
assert.deepStrictEqual(labels(pushRoot), ['Опубликовать приглашение', 'Как это работает', 'Главное меню']);
assert(!visible(pushRoot).includes('Опубликовать приглашение в чат'));
assert(pushRoot.text.includes('MAX-чате или канале'));
const pushHelp = adapter.render('push:help');
assert(pushHelp.text.includes('Как это работает'));
assert(pushHelp.text.includes('администратор или владелец выбранного чата/канала'));
for (const forbidden of ['Админ-панель', 'MAX API', 'endpoint', '/push/join?t=', 'token', 'clck']) {
  assert(!visible(pushHelp).toLowerCase().includes(forbidden.toLowerCase()), `Push help excludes ${forbidden}`);
}

const bot = read('bot.js');
assert(bot.includes('Выберите чат или канал, где нужно опубликовать кнопку подключения.'));
assert(bot.includes("text: buildPushPublishResultText({ ok: Boolean(result?.ok)"), 'selection renders a final result');
assert(bot.includes('Приглашение опубликовано в «'));
assert(bot.includes("text: ok ? 'Опубликовать ещё' : 'Выбрать другой чат'"));
assert(bot.includes("text: 'Главное меню'"));
assert(bot.includes('Публиковать кнопку может только администратор или владелец выбранного чата/канала.'));
assert(bot.includes('Не удалось проверить права в выбранном чате/канале.'));
assert(!/text:\s*\[note,\s*'',\s*buildPushAdminSectionText\(\)\]/.test(bot), 'publish handler no longer loops to Push root');
assert(bot.includes('getSafeClientDestinationTitle(item, index)'), 'selector titles are client-safe');

function api(role = 'owner') {
  const calls = [];
  return {
    calls,
    getChat: async ({ chatId }) => ({ chat_id: chatId, title: 'Канал продукта' }),
    getBotChatMember: async () => ({ user_id: 'bot', role: 'administrator' }),
    getChatMembers: async () => ({ members: [{ user_id: 'admin-pr177', role }] }),
    sendMessage: async (message) => { calls.push(message); return { ok: true }; }
  };
}

(async () => {
  const allowedApi = api('owner');
  const success = await publishing.publishGroupPushInvite({
    botToken: 'test', requesterId: 'admin-pr177', chatId: '-75643106932142', title: 'Канал продукта', api: allowedApi,
    buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
  });
  assert.strictEqual(success.ok, true);
  const publicInvite = allowedApi.calls[0];
  const serialized = JSON.stringify({ text: publicInvite.text, attachments: publicInvite.attachments });
  assert(!/\/push\/join\?t=|clck|token|endpoint/i.test(serialized), 'public invite has no personal links or tokens');
  assert.strictEqual(publicInvite.attachments[0].payload.buttons[0][0].payload, 'group_push_enable');
  assert.strictEqual(publicInvite.attachments[0].payload.buttons[0][0].action, 'group_push_enable');

  const deniedApi = api('member');
  const failure = await publishing.publishGroupPushInvite({
    botToken: 'test', requesterId: 'admin-pr177', chatId: '-75643106932142', title: 'Канал продукта', api: deniedApi,
    buildInviteText: onboarding.buildGroupInviteText, buildInviteKeyboard: onboarding.buildGroupInviteKeyboard
  });
  assert.strictEqual(failure.error, 'requester_not_admin');
  assert.strictEqual(deniedApi.calls.length, 0);
  assert(publishing.NON_ADMIN_MESSAGE.includes('администратор или владелец'));
  assert(publishing.VERIFICATION_FAILURE_MESSAGE.includes('бот добавлен туда администратором'));

  assert(bot.includes('return performGroupPushOnboarding({ userId, chatId, chatTitle, message'));
  assert(onboarding.createPersonalJoinLinkForMessage, 'personal onboarding remains DM-only after callback');
  console.log('PR177 Channels and Push UX assertions passed');
})().catch((error) => { console.error(error?.stack || error); process.exit(1); });
