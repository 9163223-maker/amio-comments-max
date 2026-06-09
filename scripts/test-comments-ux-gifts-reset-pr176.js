'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const adapter = require('../features/menu-v3/adapter');

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

assert.ok(/resetContext: true/.test(bot), 'top-level Gifts button explicitly requests a clean entry');
assert.ok(/if \(payload\.resetContext === true\)[\s\S]*clearGiftFlow\(userId\);[\s\S]*clearGiftTargetPost\(userId\);/.test(bot), 'clean Gifts entry clears stale flow and target context');
assert.ok(/'Подарки \/ лид-магниты'[\s\S]*'Создавайте подарки для постов: промокод, текст, файл, картинку или ссылку\.'[\s\S]*'Сначала выберите действие\.'/m.test(bot), 'Gifts root uses approved clean text');
const giftRootBlock = bot.slice(bot.indexOf("} else {\n    rows.push([{ type: 'callback', text: 'Создать подарок'"), bot.indexOf("\n  rows = appendAdminFooterRows", bot.indexOf("} else {\n    rows.push([{ type: 'callback', text: 'Создать подарок'")));
for (const label of ['Создать подарок', 'Текущий подарок', 'Список подарков', 'Главное меню']) assert.ok(giftRootBlock.includes(`text: '${label}'`), `Gifts clean root contains ${label}`);
for (const forbidden of ['Выбранный пост', 'Выбрать другой пост', 'промокод', 'файл', 'картинку', 'ссылку']) assert.ok(!giftRootBlock.includes(`text: '${forbidden}'`), `Gifts clean root has no ${forbidden} button`);
assert.ok(/if \(hasTarget && existingCampaign\)/.test(bot) && /Выбрать другой пост/.test(bot), 'selected-post context remains available only after Gifts has a target');
assert.ok(/GIFT_WIZARD_STEPS/.test(bot) && /giftAsset/.test(bot), 'gift material handling remains inside the creation wizard');

const pkg = JSON.parse(read('package.json'));
assert.strictEqual(pkg.buildVersion, 'CC8.3.52-PR176-COMMENTS-UX-GIFTS-RESET');
assert.strictEqual(pkg.sourceMarker, 'adminkit-pr176-comments-ux-gifts-reset');

console.log('PR176 Comments UX and Gifts reset assertions passed');
