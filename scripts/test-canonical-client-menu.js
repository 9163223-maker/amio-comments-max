'use strict';

const assert = require('assert');
const canonical = require('../features/menu-v3/canonical-menu');
const adapter = require('../features/menu-v3/adapter');
const menuCore = require('../v3-menu-core-1539');

function rows(screen) { return screen?.attachments?.[0]?.payload?.buttons || []; }
function labels(screen) { return rows(screen).flat().map((button) => String(button.text || '').trim()).filter(Boolean); }
function sectionRootLabels() { return canonical.clientSections.flatMap((section) => labels(adapter.render(section.route))); }
function assertNo(pattern, values, message) {
  const hits = values.filter((value) => pattern.test(value));
  assert.deepStrictEqual(hits, [], message);
}

const expectedSections = [
  'Каналы',
  'Комментарии',
  'Подарки / лид-магниты',
  'Кнопки под постами',
  'Статистика',
  'Рекламные ссылки',
  'Опросы / голосования',
  'Выделение постов',
  'Редактор постов',
  'Архив постов',
  'Личный кабинет',
  'Настройки',
];

const validation = canonical.validate();
assert.strictEqual(validation.ok, true, `canonical menu validation failed: ${validation.errors.join(', ')}`);
assert.strictEqual(canonical.clientSections.length, 12, 'client production menu must have exactly 12 top-level sections');
assert.deepStrictEqual(canonical.clientSections.map((section) => section.title), expectedSections, 'client top-level sections must match PR105 approved order');

const main = adapter.render('main:home');
const mainLabels = labels(main);
assert.deepStrictEqual(mainLabels, expectedSections, 'main menu render must match canonical client sections');

const allVisibleLabels = [...canonical.visibleLabels(), ...mainLabels, ...sectionRootLabels()];
assertNo(/\bCTA\b/i, allVisibleLabels, 'client-facing labels must not contain CTA');
assertNo(/Debug|GitHub export|selftests|trace|production checklist/i, allVisibleLabels, 'debug/admin-only labels must not be client-visible');
assertNo(/видео|файл/i, allVisibleLabels, 'video/files comments labels must not be client-visible');
assertNo(/postId|channelId|commentKey|token|payload|trace/i, allVisibleLabels, 'technical ids must not be client-visible labels');

const flowSteps = ['Выбрать канал', 'Выбрать пост', 'Материал подарка', 'Текст получателю', 'Условия'];
for (const step of flowSteps) assert.ok(!allVisibleLabels.some((label) => label.toLowerCase() === step.toLowerCase()), `${step} must not be a section-root menu item`);

assert.ok(!labels(adapter.render('buttons:home')).some((label) => /удалить/i.test(label)), 'delete button must stay inside current buttons, not section root');
assert.ok(!labels(adapter.render('ad_links:home')).some((label) => /отключить/i.test(label)), 'disable ad link must stay inside ad link card, not section root');
assert.ok(!labels(adapter.render('polls:home')).some((label) => /остановить/i.test(label)), 'stop poll must stay inside active poll card, not section root');
assert.ok(!labels(adapter.render('ad_links:home')).some((label) => /источники|статистик/i.test(label)), 'ad link/source statistics must stay in Stats section');

for (const item of canonical.allActions().filter((action) => action.clientVisible && action.requiresPost)) {
  assert.strictEqual(item.requiresChannel, true, `${item.id} requires post and must require channel first`);
}

const hiddenDebugScreen = adapter.render('debug:home');
assertNo(/Debug|GitHub export|trace|production checklist/i, labels(hiddenDebugScreen), 'debug route must not render client-visible debug buttons');

const adapterSelfTest = adapter.selfTest();
assert.strictEqual(adapterSelfTest.ok, true, `adapter selfTest failed: ${JSON.stringify(adapterSelfTest)}`);

const coreAudit = menuCore.audit('');
assert.strictEqual(coreAudit.ok, true, `menu core audit failed: ${JSON.stringify(coreAudit.canonicalValidation || coreAudit)}`);
assert.strictEqual(coreAudit.visibleMainMenuTotal, 12, 'debug menu audit must report 12 client sections');
assert.strictEqual(coreAudit.checks.noDebugTopLevel, true, 'debug must be hidden from client top-level audit');
assert.strictEqual(coreAudit.checks.noCtaLabel, true, 'audit must reject CTA labels');

console.log('canonical client menu ok');
