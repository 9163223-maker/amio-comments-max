'use strict';
const assert = require('assert');
const canonical = require('../features/menu-v3/canonical-menu');
const svc = require('../services/productFlowContractService');
const canonicalIds = ['main', ...canonical.clientSections.map((s)=>s.id)].sort();
const contractIds = svc.contracts.map((c)=>c.id).sort();
assert.deepStrictEqual(contractIds, canonicalIds, 'contracts map exactly to canonical client-visible sections plus main');
for (const c of svc.contracts) {
  for (const key of ['id','title','productGoal','rootMode','requiredContext','rootActions','states','lifecycle','emptyStateRules','semanticAssertions']) assert(c[key] !== undefined, `${c.id} missing ${key}`);
  if ((c.allowedPlaceholders || []).length) assert.strictEqual(c.productReady, false, `${c.id} placeholder must not be productReady true`);
}
console.log('PR262 product flow contracts PASS');
