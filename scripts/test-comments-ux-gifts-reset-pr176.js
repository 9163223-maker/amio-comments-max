'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const adapter = require('../features/menu-v3/adapter');
const canonicalMenu = require('../features/menu-v3/canonical-menu');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const rows = (screen) => screen?.attachments?.find((item) => item?.type === 'inline_keyboard')?.payload?.buttons || [];
const labels = (screen) => rows(screen).flat().map((item) => String(item?.text || '').trim()).filter(Boolean);

const comments = adapter.render('comments:home');
const expectedComments = ['Автокомментарии', 'Включить к посту', 'Фото', 'Ответы', 'Реакции', 'Помощь', 'Главное меню'];
assert.deepStrictEqual(labels(comments), expectedComments, 'Comments root uses the approved client labels');
assert.deepStrictEqual(rows(comments).map((row) => row.map((item) => item.text)), [
  ['Автокомментарии'],
  ['Включить к посту'],
  ['Фото', 'Ответы'],
  ['Реакции'],
  ['Помощь'],
  ['Главное меню']
], 'Comments root uses the approved MAX-safe row layout');
assert.ok(/Настройте комментарии в каналах/.test(comments.text), 'Comments root uses function-first client copy');
for (const forbidden of ['Пропатчить', 'Выбрать пост', 'Другой пост', 'Проверить', 'Список', 'Настройки кнопки комментариев']) {
  assert.ok(!labels(comments).some((label) => label.includes(forbidden)), `Comments root excludes ${forbidden}`);
}
assert.strictEqual(rows(comments).at(-2).length, 1, 'Help is a full-width footer row');
assert.strictEqual(rows(comments).at(-1).length, 1, 'Main Menu is a full-width footer row');
for (const label of labels(comments)) assert.ok(label.length <= 18, `${label}: root label is short enough for expected MAX/iPhone width`);

const bot = read('bot.js');
const canonical = read('features/menu-v3/canonical-menu.js');
const clientSources = `${bot}\n${canonical}\n${read('features/menu-v3/adapter.js')}`;
assert.ok(!/пропатч/i.test(clientSources), 'client UI sources contain no “пропатчить” wording');
assert.ok(/source: 'comments_manual'/.test(bot), 'manual enable starts with channel/post selection');
assert.ok(/buildManualCommentsConfirmationText/.test(bot) && /АдминКИТ добавит комментарии к этому посту/.test(bot), 'manual enable has a confirmation screen');
assert.ok(/patchStoredPost\(/.test(bot), 'manual enable remains wired to the real post action');
assert.ok(/autoCommentsByChannel/.test(bot), 'auto-comments preference supports channel scope');
assert.ok(/getAutoCommentsEnabled\(channelOwnerId, channelId\)/.test(bot), 'new channel posts use channel-scoped auto-comments state');
assert.ok(/Когда включено, АдминКИТ сам добавляет комментарии/.test(bot), 'auto-comments screen has approved clean copy');
assert.ok(/text: enabled \? 'Выключить' : 'Включить'/.test(bot), 'auto-comments screen has clean toggle controls');
assert.ok(/comments_option_channel/.test(bot) && /Отдельного переключателя для канала сейчас нет/.test(bot), 'photo option is a product-safe capability screen, not a debug placeholder');

const commentsHelp = adapter.render('comments:help');
for (const label of ['Автокомментарии', 'Включить к посту', 'Фото', 'Ответы', 'Реакции']) {
  assert.ok(commentsHelp.text.includes(label), `Comments help explains ${label}`);
}
assert.ok(/Выберите нужную функцию/.test(commentsHelp.text), 'Comments help follows function-first logic');

assert.ok(/resetContext: true/.test(bot), 'top-level Gifts button explicitly requests a clean entry');
assert.ok(/if \(payload\.resetContext === true\)[\s\S]*clearGiftFlow\(userId\);[\s\S]*clearGiftTargetPost\(userId\);/.test(bot), 'clean Gifts entry clears stale flow and target context');
assert.ok(/'Подарки \/ лид-магниты'[\s\S]*'Подарок создаётся для конкретного поста канала\.'/m.test(read('features/menu-v3/adapter.js')), 'Gifts canonical root uses context-first copy');
const semanticGiftRoot = adapter.render('gifts:home');
assert.deepStrictEqual(labels(semanticGiftRoot), ['Выбрать пост', 'Все подарки', 'Помощь', 'Главное меню'], 'adapter Gifts root uses semantic context-first labels');
const giftRootBlock = bot.slice(bot.indexOf("} else {\n    rows.push([{ type: 'callback', text: 'Выбрать пост'"), bot.indexOf("\n  rows = appendAdminFooterRows", bot.indexOf("} else {\n    rows.push([{ type: 'callback', text: 'Выбрать пост'")));
for (const label of ['Выбрать пост', 'Все подарки', 'Помощь', 'Главное меню']) assert.ok(giftRootBlock.includes(`text: '${label}'`), `Gifts clean root contains ${label}`);
for (const forbidden of ['Текущий подарок', 'Создать подарок', 'Список подарков', 'Выбранный пост', 'Выбрать другой пост', 'промокод', 'файл', 'картинку', 'ссылку']) assert.ok(!giftRootBlock.includes(`text: '${forbidden}'`), `Gifts clean root has no ${forbidden} button`);
assert.ok(/if \(hasTarget && existingCampaign\)/.test(bot) && /Выбрать другой пост/.test(bot), 'selected-post context remains available only after Gifts has a target');
assert.ok(/GIFT_WIZARD_STEPS/.test(bot) && /giftAsset/.test(bot), 'gift material handling remains inside the creation wizard');

const canonicalGiftAll = canonicalMenu.allActions().find((item) => item.id === 'gifts.all');
assert.strictEqual(canonicalGiftAll?.existingAction, 'gift_admin_list_campaigns', 'canonical Gifts all uses the list campaigns action');
const hiddenGiftList = canonicalMenu.allActions().find((item) => item.id === 'gifts.list');
assert.strictEqual(hiddenGiftList?.clientVisible, false, 'ambiguous Gifts list is hidden from root');
const adapterGiftListButton = rows(adapter.render('gifts:home')).flat().find((item) => item.text === 'Все подарки');
assert.ok(adapterGiftListButton, 'adapter Gifts root renders the scoped all-gifts button');
const adapterGiftPayload = JSON.parse(adapterGiftListButton.payload);
assert.strictEqual(adapterGiftPayload.route, 'gifts:all', 'adapter Gifts all routes to the explicit all-gifts screen');
assert.strictEqual(adapterGiftPayload.canonicalAction, 'gifts.all', 'adapter Gifts all keeps canonical action identity');

const pkg = JSON.parse(read('package.json'));
assert.strictEqual(pkg.buildVersion, pkg.version);
assert(/^adminkit-pr\d+-/.test(pkg.sourceMarker), 'package source marker uses current PR marker');

console.log('PR176 Comments UX and Gifts reset assertions passed');
