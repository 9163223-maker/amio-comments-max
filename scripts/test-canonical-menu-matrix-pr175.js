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
const businessLabels = (screen) => labels(screen).filter((label) => !['❓ Помощь по разделу', 'Помощь по разделу', 'Помощь', '🏠 Главное меню', 'Главное меню', '⬅️ Назад', 'Назад', '↩️ В начало раздела', 'В начало раздела'].includes(label));
const payloads = (screen) => buttons(screen).map((item) => String(item.payload || '')).filter(Boolean);

const expectedTop = [
  'Каналы', 'Комментарии', 'Подарки / лид-магниты', 'Кнопки под постами', 'Статистика',
  '🔔 Уведомления', 'Рекламные ссылки', 'Опросы / голосования', 'Выделение постов',
  'Редактор постов', 'Архив постов', 'Личный кабинет', 'Настройки'
];
const expectedItems = {
  channels: ['Подключить канал', 'Мои каналы'],
  comments: ['Автокомментарии', 'Включить к посту', 'Фото', 'Ответы', 'Реакции'],
  gifts: ['Выбрать пост', 'Все подарки'],
  buttons: ['Выбрать пост'],
  stats: ['Обзор', 'По каналу', 'По посту', 'Рекламные ссылки', 'Источники', 'Обновить данные'],
  push: ['Опубликовать приглашение', 'Как это работает'],
  ad_links: ['Создать ссылку', 'Мои ссылки'],
  polls: ['Выбрать пост', 'Результаты опросов'],
  highlights: ['Выбрать пост'],
  editor: ['Выбрать пост'],
  archive: ['Сохранённые посты', 'Лимиты хранения'],
  account: ['Мой доступ', 'Диагностика привязки', 'Активировать код', 'Оплата / продление', 'Лимиты и функции', 'Мои каналы', 'Поддержка'],
  settings: ['Очистить чат', 'Privacy / Terms']
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

for (const [route, forbidden] of Object.entries({
  'buttons:home': ['Добавить кнопку','Текущие кнопки'],
  'polls:home': ['Создать опрос'],
  'highlights:home': ['Поставить метку','Снять метку']
})) {
  const rootLabels = businessLabels(adapter.render(route));
  assert(rootLabels.includes('Выбрать пост'), `${route}: root is a context gate`);
  for (const label of forbidden) assert(!rootLabels.includes(label), `${route}: ${label} hidden until selected post context`);
}

const ordinaryAccount = adapter.render('account:home', { maxUserId: 'pr175-ordinary-customer' });
assert.deepStrictEqual(businessLabels(ordinaryAccount), ['🔔 Мои уведомления', '➕ Подключить чат', 'Что умеет АдминКИТ для MAX'], 'ordinary account route uses the PR186 customer funnel without admin/payment leakage');
assert(!labels(ordinaryAccount).some((label) => ['Активировать код', 'Оплата / продление', 'Мой доступ', 'Мои каналы', 'Диагностика привязки'].includes(label)), 'ordinary account route does not expose admin access controls');

const giftRoot = businessLabels(adapter.render('gifts:home'));
for (const material of ['Текст', 'Промокод', 'Файл', 'Фото', 'Изображение', 'Ссылка', 'Текущий подарок', 'Создать подарок', 'Список подарков']) {
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