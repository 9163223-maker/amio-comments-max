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
function resolveLocalRequire(fromRel, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(ROOT, path.dirname(fromRel), spec);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  const found = candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  return found ? path.relative(ROOT, found).replace(/\\/g, '/') : null;
}
function reachableFrom(entryRel, seen = new Set()) {
  if (!entryRel || seen.has(entryRel)) return seen;
  if (!fs.existsSync(path.join(ROOT, entryRel))) return seen;
  seen.add(entryRel);
  const text = read(entryRel);
  for (const match of text.matchAll(/require\(['\"]([^'\"]+)['\"]\)/g)) {
    const child = resolveLocalRequire(entryRel, match[1]);
    if (child && !child.startsWith('scripts/') && !child.startsWith('runtime/')) reachableFrom(child, seen);
  }
  return seen;
}
const reachable = new Set();
for (const file of activeFiles) for (const rel of reachableFrom(file)) reachable.add(rel);
for (const file of reachable) assert(!hasLegacyMenuImport(read(file)), `${file}: reachable runtime source imports legacy menu map/renderer`);
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
}
console.log('PR262 no menu multiplication PASS');
