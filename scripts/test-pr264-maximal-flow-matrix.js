'use strict';

const assert = require('assert');
const matrixService = require('../services/maximalFlowMatrixService');
const canonical = require('../features/menu-v3/canonical-menu');
const contracts = require('../services/productFlowContractService');

(async () => {
  const matrix = await matrixService.buildMatrix();
  assert.strictEqual(matrix.ok, true, `maximal flow matrix must be green: ${JSON.stringify(matrix.violations, null, 2)}`);
  assert.strictEqual(matrix.summary.blockCount, 0, 'no block violations');
  assert.strictEqual(matrix.summary.sectionCount, canonical.clientSections.length + 1, 'main plus all client sections covered');
  assert.strictEqual(matrix.summary.postScopedSectionCount, contracts.POST_SCOPED.length, 'all post-scoped sections covered');
  assert(matrix.summary.routeCount >= 80, 'matrix renders broad route/scenario coverage');
  for (const sectionId of ['gifts', 'buttons', 'polls', 'highlights', 'editor', 'comments']) {
    for (const scenario of ['zero_channels', 'one_channel', 'multiple_channels', 'dangerous_chat_records', 'zero_posts', 'selected_post', 'malformed_payload', 'missing_payload', 'missing_required_id', 'post_from_other_channel', 'stale_or_deleted_post']) {
      assert(matrix.routes.some((route) => route && route.route && route.route.startsWith(`${sectionId}:`) && route.scenario === scenario), `${sectionId}: ${scenario} covered`);
    }
  }
  const giftsRoot = matrix.sections.find((section) => section.section === 'gifts');
  assert(giftsRoot.rootLabels.includes('Выбрать пост'), 'gifts root has post gate');
  assert(giftsRoot.rootLabels.includes('Все подарки'), 'gifts root has all gifts account path');
  for (const forbidden of ['Создать подарок', 'Текущий подарок', 'Список подарков']) assert(!giftsRoot.rootLabels.includes(forbidden), `gifts root hides ${forbidden}`);
  const buttonsRoot = matrix.sections.find((section) => section.section === 'buttons');
  assert.deepStrictEqual(buttonsRoot.rootLabels.filter((label) => ['Выбрать пост', 'Помощь', 'Главное меню'].includes(label)), ['Выбрать пост', 'Помощь', 'Главное меню'], 'buttons root is gated');
  assert(!buttonsRoot.rootLabels.includes('Добавить кнопку') && !buttonsRoot.rootLabels.includes('Текущие кнопки'), 'buttons root hides post actions');
  const pollsRoot = matrix.sections.find((section) => section.section === 'polls');
  assert(pollsRoot.rootLabels.includes('Выбрать пост'), 'polls root has post gate');
  assert(pollsRoot.rootLabels.includes('Результаты опросов'), 'polls root has results');
  assert(!pollsRoot.rootLabels.includes('Создать опрос'), 'polls root hides create');
  const highlightsRoot = matrix.sections.find((section) => section.section === 'highlights');
  assert(highlightsRoot.rootLabels.includes('Выбрать пост'), 'highlights root has post gate');
  assert(!highlightsRoot.rootLabels.includes('Поставить метку') && !highlightsRoot.rootLabels.includes('Снять метку'), 'highlights root hides entity actions');
  assert(matrix.tenantBinding, 'tenant binding matrix is embedded');
  assert(!matrix.violations.some((item) => item.area === 'tenant'), 'embedded tenant matrix residue is not a PR264 block');
  assert(matrix.manualChecklist.length >= 12, 'manual checklist contains selective MAX routes');
  for (const id of ['M02', 'M03', 'M05', 'M07', 'M08', 'M11']) assert(matrix.manualChecklist.some((item) => item.id === id), `manual checklist includes ${id}`);
  assert(matrix.coverage.scenarios.includes('dangerous_chat_records'), 'chat leakage scenario covered');
  assert(matrix.coverage.scenarios.includes('post_from_other_channel'), 'foreign post scenario covered');
  assert(matrix.coverage.scenarios.includes('stale_or_deleted_post'), 'stale/deleted post scenario covered');
  console.log('PR264 maximal flow matrix PASS');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });