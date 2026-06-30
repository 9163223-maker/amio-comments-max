'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const canonical = require('../features/menu-v3/canonical-menu');
const contracts = require('../services/productFlowContractService');

const LEGACY_SOURCES = ['production-menu-map-v3-fixed', 'production-menu-v3-renderer'];
const ROOT = path.resolve(__dirname, '..');
const activeFiles = ['clean-entrypoint-1.53.10-pr89.js','features/menu-v3/adapter.js','v3-menu-routes-1539.js','bot.js','pr180-startup-log-bootstrap.js'];
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hasLegacyMenuImport(text) {
  return LEGACY_SOURCES.some((name) => text.includes(`require('./${name}`) || text.includes(`require('../${name}`) || text.includes(`require('../../${name}`) || text.includes(`require(\"./${name}`) || text.includes(`require(\"../${name}`) || text.includes(`require(\"../../${name}`));
}
for (const file of activeFiles) assert(!hasLegacyMenuImport(read(file)), `${file} imports legacy menu map/renderer`);
const canonicalIds = new Set(['main', ...canonical.clientSections.map((s)=>s.id)]);
for (const id of canonicalIds) assert(contracts.getContract(id), `${id} missing product flow contract`);
for (const c of contracts.contracts) assert(canonicalIds.has(c.id), `${c.id} contract without canonical section`);
const adapterText = read('features/menu-v3/adapter.js');
assert(adapterText.includes("require('./canonical-menu')"), 'adapter renders from canonical menu');
function walk(dir, out=[]) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules','.git','runtime'].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, out);
    else if (item.name.endsWith('.js')) out.push(full);
  }
  return out;
}
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('scripts/')) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('clientVisible: true')) assert.strictEqual(rel, 'features/menu-v3/canonical-menu.js', `${rel}: only canonical-menu may declare clientVisible sections`);
  assert(!hasLegacyMenuImport(text), `${rel}: active source imports legacy menu map/renderer`);
}
console.log('PR262 no menu multiplication PASS');
