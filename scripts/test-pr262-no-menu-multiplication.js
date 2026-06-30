'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const canonical = require('../features/menu-v3/canonical-menu');
const contracts = require('../services/productFlowContractService');
const activeFiles = ['clean-entrypoint-1.53.10-pr89.js','features/menu-v3/adapter.js','v3-menu-routes-1539.js','bot.js'];
for (const file of activeFiles) {
  const text = fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert(!/require\([^)]*production-menu-map-v3-fixed|require\([^)]*production-menu-v3-renderer/.test(text), `${file} imports legacy menu map/renderer`);
}
const canonicalIds = new Set(['main', ...canonical.clientSections.map((s)=>s.id)]);
for (const id of canonicalIds) assert(contracts.getContract(id), `${id} missing product flow contract`);
for (const c of contracts.contracts) assert(canonicalIds.has(c.id), `${c.id} contract without canonical section`);
const adapterText = fs.readFileSync(path.join(__dirname,'..','features/menu-v3/adapter.js'),'utf8');
assert(adapterText.includes("require('./canonical-menu')"), 'adapter renders from canonical menu');
console.log('PR262 no menu multiplication PASS');
