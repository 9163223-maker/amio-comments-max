'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const canonical = require('../features/menu-v3/canonical-menu');
const adapter = require('../features/menu-v3/adapter');

const ADMIN_USER_ID = 'pr175-activated-admin';
const previousAdminIds = process.env.ADMINKIT_ADMIN_MAX_USER_IDS;
process.env.ADMINKIT_ADMIN_MAX_USER_IDS = [previousAdminIds, ADMIN_USER_ID].filter(Boolean).join(',');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const rows = (screen) => screen?.attachments?.[0]?.payload?.buttons || [];
const buttons = (screen) => rows(screen).flat();
const labels = (screen) => buttons(screen).map((item) => String(item.text || '').trim()).filter(Boolean);
const businessLabels = (screen) => labels(screen).filter((label) => !['❓ Помощь по разделу', 'Помощь по разделу', '🏠 Главное меню', 'Главное меню', '⬅️ Назад', 'Назад', '↩️ В начало раздела', 'В начало раздела'].includes(label));
const payloads = (screen) => buttons(screen).map((item) => String(item.payload || '')).filter(Boolean);

const expectedTop = [
  'Каналы', 'Комментарии', 'Подарки / лид-магниты', 'Кнопки под постами', 'Статистика',
  '🔔 Уведомления', 'Рекламные ссылки', 'Опросы / голосования', 'Выделение постов',
  'Редактор постов', 'Архив постов', 'Личный кабинет', 'Настройки'
];
const expectedItems = {
  channels: ['Подключить канал', 'Мои каналы', 'Инструкция'],
  comments: ['Автокомментарии', 'Включить к посту', 'Фото', 'Ответы', 'Реакции', 'Помощь'],
  gifts: ['Создать подарок', 'Текущий подарок', 'Список подарков'],
  buttons: ['Добавить кнопку', 'Текущие кнопки'],
  stats: ['Обзор', 'Подписчики', 'Посты', 'Комментарии', 'Реакции', 'Подарки', 'Кнопки под постами / клики', 'Рекламные ссылки', 'Источники подписчиков', 'Обновить данные'],
  push: ['Опубликовать приглашение', 'Как это работает'],
  ad_links: ['Создать рекламную ссылку', 'Мои рекламные ссылки'],
  polls: ['Создать опрос', 'Результаты опросов'],
  highlights: ['Поставить выделение', 'Снять выделение'],
  editor: ['Выбрать пост'],
  archive: ['Сохранённые посты', 'Лимиты хранения'],
  account: ['Мой доступ', 'Активировать код', 'Оплата / продление', 'Лимиты и функции', 'Мои каналы', 'Поддержка'],
  settings: ['Очистить чат', 'Помощь', 'Privacy / Terms']
};

assert.strictEqual(canonical.validate().ok, true, canonical.validate().errors.join(', '));
assert.strictEqual(canonical.clientSections.length, 13, 'exactly 13 client-visible sections');
assert.deepStrictEqual(canonical.clientSections.map((section) => section.title), expectedTop, 'approved top-level order');
assert.deepStrictEqual(labels(adapter.render('main:home')), expectedTop, 'rendered main menu matches canonical tree');
assert.ok(expectedTop.includes('🔔 Уведомления'), 'Push remains a top-level product section');

for (const section of canonical.clientSections) {
  const screen = adapter.render(section.route, section.id === 'account' ? { maxUserId: ADMIN_USER_ID } : {});
  const actualBusinessLabels = section.id === 'channels' ? businessLabels(screen).filter((label) => label !== 'Помощь') : businessLabels(screen);
  assert.deepStrictEqual(actualBusinessLabels, expectedItems[section.id], `${section.id}: exact visible business items`);
  for (const item of buttons(screen).filter((button) => actualBusinessLabels.includes(String(button.text || '').trim()))) {
    assert.ok(item.payload && String(item.payload).trim(), `${section.id}/${item.text}: non-empty callback`);
    const parsed = JSON.parse(item.payload);
    assert.ok(parsed.action || parsed.route, `${section.id}/${item.text}: reachable action or route`);
  }
}

const ordinaryAccount = adapter.render('account:home', { maxUserId: 'pr175-ordinary-customer' });
assert.deepStrictEqual(businessLabels(ordinaryAccount), ['🔔 Мои уведомления', '➕ Подключить чат', 'Помощь', 'Что умеет АдминКИТ для MAX'], 'ordinary account route uses the PR186 customer funnel without admin/payment leakage');
assert(!labels(ordinaryAccount).some((label) => ['Активировать код', 'Оплата / продление', 'Мой доступ', 'Мои каналы'].includes(label)), 'ordinary account route does not expose admin access controls');

const giftRoot = businessLabels(adapter.render('gifts:home'));
for (const material of ['Текст', 'Промокод', 'Файл', 'Фото', 'Изображение', 'Ссылка']) {
  assert.ok(!giftRoot.includes(material), `${material} is not a Gifts root item`);
}
const giftJourney = read('scripts/test-product-perfect-gifts-journey-pr142.js');
for (const kind of ["'link'", "'text'", "'photo'", "'file'"]) assert.ok(giftJourney.includes(kind), `gift journey covers ${kind}`);
assert.ok(/leadMagnetCode/.test(giftJourney), 'text material path preserves promo-code delivery');

const sample = { payload: { channelTitle: 'Канал продукта', postTitle: 'Пост продукта', commentKey: 'internal', postId: 'internal', channelId: 'internal' } };
const giftsSelected = adapter.render('gifts:post', sample);
assert.ok(/Канал продукта|Пост продукта/.test(giftsSelected.text), 'Gifts selected-post state identifies selected content safely');
assert.ok(businessLabels(giftsSelected).includes('Создать подарок'), 'Gifts selected-post creation remains reachable');
const editorEmpty = adapter.render('editor:home');
assert.deepStrictEqual(businessLabels(editorEmpty), ['Выбрать пост'], 'Editor without selection offers post choice');
const editorSelected = adapter.render('editor:post', sample);
assert.ok(/Пост продукта/.test(editorSelected.text), 'Editor selected state names selected post');
assert.ok(businessLabels(editorSelected).includes('Изменить текст выбранного поста'), 'Editor selected state exposes edit');
assert.ok(businessLabels(editorSelected).includes('Выбрать другой пост'), 'Editor selected state exposes reselection');

const commentsRoot = adapter.render('comments:home');
assert.strictEqual(new Set(businessLabels(commentsRoot)).size, businessLabels(commentsRoot).length, 'Comments root actions are non-duplicative');
const commentsAutoOn = adapter.render('comments:auto', { autoCommentsEnabled: true });
const commentsAutoOff = adapter.render('comments:auto', { autoCommentsEnabled: false });
assert.ok(labels(commentsAutoOn).includes('Выключить'), 'auto-comments disable action exists');
assert.ok(labels(commentsAutoOff).includes('Включить'), 'auto-comments enable action exists');
const botSource = read('bot.js');
for (const action of ['comments_auto_patch', 'comments_auto_patch_enable', 'comments_auto_patch_disable', 'comments_manual_patch', 'comments_photos', 'comments_reactions']) {
  assert.ok(botSource.includes(action), `${action}: production handler/callback is wired`);
}
assert.ok(/autoCommentsEnabled/.test(botSource), 'auto-comments preference is persisted in setup state');
assert.ok(/direct_channel_post_auto_patch_disabled/.test(botSource) && /!getAutoCommentsEnabled\(channelOwnerId, channelId\)/.test(botSource), 'disabled preference stops automatic patching of future channel posts');
assert.ok(/patchStoredPost\(/.test(botSource), 'manual selected-post patch calls the real post patcher');
assert.ok(/comments_manual_patch[\s\S]*patchStoredPost/.test(botSource), 'manual enable is independent from auto setting');

assert.deepStrictEqual(businessLabels(adapter.render('archive:home')), ['Сохранённые посты', 'Лимиты хранения'], 'Archive root hides restore/status technical clutter');
assert.deepStrictEqual(businessLabels(adapter.render('settings:home')), ['Очистить чат', 'Помощь', 'Privacy / Terms'], 'Settings root hides placeholders and navigation duplicate');

const visibleScreens = [adapter.render('main:home'), ...canonical.clientSections.map((section) => adapter.render(section.route)), commentsAutoOn, commentsAutoOff, giftsSelected, editorEmpty, editorSelected];
const visibleText = visibleScreens.flatMap((screen) => [screen.text, ...labels(screen)]).join('\n');
const unsafe = [/PUSH_ADMIN_TOKEN/i, /BOT_TOKEN/i, /VAPID private key/i, /endpoint/i, /p256dh/i, /\bauth\b/i, /\/debug\//i, /production_checklist/i, /landing_start/i, /internal diagnostic/i];
for (const pattern of unsafe) assert.ok(!pattern.test(visibleText), `visible client text excludes ${pattern}`);
for (const payload of visibleScreens.flatMap(payloads)) assert.ok(!/production_checklist|landing_start|\/debug\//i.test(payload), 'visible callbacks exclude debug/landing/production checklist routes');

const entrypoint = read('clean-entrypoint-1.53.10-pr89.js');
const pkg = JSON.parse(read('package.json'));
assert.strictEqual(pkg.buildVersion, 'CC8.3.57-PR191-PUSH-ADMIN-INVITE-TITLE-COMMANDS');
assert.strictEqual(pkg.sourceMarker, 'adminkit-pr191-push-admin-invite-title-commands');
assert.ok(entrypoint.includes("const RUNTIME='CC8.3.57-PR191-PUSH-ADMIN-INVITE-TITLE-COMMANDS'"));
assert.ok(entrypoint.includes("const SOURCE='adminkit-pr191-push-admin-invite-title-commands'"));

if (previousAdminIds === undefined) delete process.env.ADMINKIT_ADMIN_MAX_USER_IDS;
else process.env.ADMINKIT_ADMIN_MAX_USER_IDS = previousAdminIds;

console.log('PR175 canonical menu matrix assertions passed');
