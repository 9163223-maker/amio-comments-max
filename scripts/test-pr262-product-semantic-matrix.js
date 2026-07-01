'use strict';
const assert = require('assert');
const canonical = require('../features/menu-v3/canonical-menu');
const contracts = require('../services/productFlowContractService');
const matrix = require('../services/productSemanticMatrixService').buildMatrix();
const ids = ['main', ...canonical.clientSections.map((s)=>s.id)].sort();
assert.strictEqual(matrix.ok, true, `product semantic matrix must be green: ${JSON.stringify(matrix.violations.filter((v)=>v.severity==='block'), null, 2)}`);
assert.strictEqual(matrix.summary.blockCount, 0, 'semantic matrix has no block violations');
assert.deepStrictEqual(matrix.sections.map((s)=>s.section).sort(), ids);
assert(matrix.summary && Array.isArray(matrix.summary.table));
assert(Array.isArray(matrix.routeCoverage), 'matrix exposes routeCoverage');
assert.strictEqual(matrix.summary.postScopedSectionsChecked, contracts.POST_SCOPED.length, 'all post-scoped sections have route coverage');
assert(!contracts.POST_SCOPED.includes('stats'), 'stats is dashboard-scoped in product semantic matrix, not a whole post-scoped section');
for (const sectionId of contracts.POST_SCOPED) {
  const row = matrix.sections.find((s)=>s.section===sectionId);
  assert(row, `${sectionId}: section exists`);
  for (const scenario of ['root','zero_channels','multiple_channels','zero_posts','selected_post']) {
    assert(row.routesCovered.some((item)=>item.startsWith(`${scenario}:`)), `${sectionId}: ${scenario} route covered`);
  }
}
for (const [sectionId, forbidden] of Object.entries({ buttons:['Добавить кнопку','Текущие кнопки'], polls:['Создать опрос'], highlights:['Поставить метку','Снять метку'] })) {
  const row = matrix.sections.find((s)=>s.section===sectionId);
  assert(row.actualRootButtons.includes('Выбрать пост'), `${sectionId}: root is a post-selection gate`);
  for (const label of forbidden) assert(!row.actualRootButtons.includes(label), `${sectionId}: root hides ${label}`);
}
const stats = matrix.sections.find((s)=>s.section==='stats');
assert(stats && stats.expectedRootMode === 'dashboard', 'stats remains dashboard-scoped');
assert.strictEqual(stats.postScopedRouteCoverage, 0, 'stats root is not classified as a whole post-scoped section');
const gifts = matrix.sections.find((s)=>s.section==='gifts');
assert(gifts, 'gifts section exists');
assert(!gifts.forbiddenButtonsVisible.includes('Текущий подарок'));
assert(!gifts.forbiddenButtonsVisible.includes('Создать подарок'));
assert(gifts.routesCovered.some((item)=>item === 'all_gifts_account_scope:gifts:all'), 'gifts all account scope covered');
assert(!matrix.violations.some((v)=>v.section==='gifts' && v.severity==='block' && /current_entity_visible_without_context|root_action_requires_context_visible|list_action_unclear_scope|create_leads|gifts_list_scope_missing/.test(v.reason)), 'no P0 gifts root/context/list blockers');
assert(matrix.violations.some((v)=>v.severity==='warn' && v.reason==='client_visible_product_ready_false'), 'matrix honestly flags partial sections');
assert(!matrix.sections.some((s)=>s.classification==='PASS' && s.placeholderAsPassRisk), 'placeholder-only section cannot PASS');
assert(!matrix.violations.some((v)=>v.reason==='product_ready_lifecycle_incomplete'), 'productReady lifecycle uses required lifecycle, not irrelevant global steps');
console.log('PR262 product semantic matrix PASS');
