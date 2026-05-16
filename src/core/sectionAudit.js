'use strict';

const RUNTIME = 'ADMINKIT-CORE-SECTION-AUDIT-1.0-READONLY-MATRIX';

function clean(value) { return String(value ?? '').trim(); }

const EXPECTED = {
  channels: { mode: 'read-only', writesAllowed: false, cleanTables: ['ak_admin_channels', 'ak_channels'], risk: 'connect flow still legacy-held until migrated' },
  comments: { mode: 'read-only', writesAllowed: false, cleanTables: ['ak_posts', 'ak_admin_channels', 'ak_admin_sessions'], risk: 'do not add compatibility layer for old patched links' },
  buttons: { mode: 'clean-flow', writesAllowed: true, cleanTables: ['ak_post_buttons'], risk: 'MAX post patch pipeline not enabled yet' },
  lead_magnets: { mode: 'clean-flow-planned', writesAllowed: false, cleanTables: ['ak_post_lead_magnets'], risk: 'reuse flowEngine/text-input bridge after buttons are verified' },
  moderation: { mode: 'read-only', writesAllowed: false, cleanTables: ['ak_moderation_rules', 'ak_posts', 'ak_admin_channels'], risk: 'ban/delete/hide require dry-run + confirm flow' },
  archive: { mode: 'read-only', writesAllowed: false, cleanTables: ['ak_posts', 'ak_post_buttons', 'ak_post_lead_magnets'], risk: 'restore requires preview + confirm; no hard delete' },
  stats: { mode: 'read-only', writesAllowed: false, cleanTables: ['ak_posts', 'ak_post_buttons', 'ak_post_lead_magnets', 'ak_admin_channels'], risk: 'aggregations need limits/cache; no raw id clutter' },
  settings: { mode: 'read-only', writesAllowed: false, cleanTables: ['ak_accounts', 'ak_account_admins', 'ak_admin_channels', 'ak_plan_events'], risk: 'settings writes require audit events and confirm flow' }
};

function auditSection(section = {}) {
  const id = clean(section.id);
  const expected = EXPECTED[id] || { mode: 'unknown', writesAllowed: false, cleanTables: [], risk: 'section is not in expected audit matrix' };
  let self = null;
  try { self = typeof section.selfTest === 'function' ? section.selfTest() : null; } catch (error) { self = { ok: false, error: error?.message || String(error) }; }
  const hasSelfTest = !!self;
  const legacyAdaptersUsed = self?.legacyAdaptersUsed === true;
  const dangerousActionsDisabled = self?.dangerousActionsDisabled !== false;
  const writesEnabled = self?.writesEnabled === true || self?.cleanCreateFlow === true;
  const cleanCoreOnly = legacyAdaptersUsed !== true;
  const ok = cleanCoreOnly && dangerousActionsDisabled && (expected.writesAllowed || writesEnabled !== true || id === 'buttons') && (hasSelfTest || ['channels', 'buttons', 'lead_magnets'].includes(id) === false);
  return {
    id,
    title: section.title || id,
    runtimeVersion: self?.runtimeVersion || '',
    expectedMode: expected.mode,
    actualMode: self?.mode || (writesEnabled ? 'clean-flow' : 'read-only'),
    status: self?.status || '',
    hasSelfTest,
    ok,
    routeCount: Object.keys(section.routes || {}).length,
    routes: section.routes || {},
    cleanTables: self?.cleanTables || expected.cleanTables,
    writesAllowedByPlan: expected.writesAllowed,
    writesEnabled,
    legacyAdaptersUsed,
    cleanCoreOnly,
    dangerousActionsDisabled,
    risk: expected.risk,
    nextStep: self?.nextStep || ''
  };
}

function audit(sections = []) {
  const items = (sections || []).map(auditSection);
  const problems = [];
  for (const item of items) {
    if (!item.ok) problems.push(`${item.id}: audit not ok`);
    if (item.legacyAdaptersUsed) problems.push(`${item.id}: legacy adapter is used`);
    if (!item.dangerousActionsDisabled && item.id !== 'buttons') problems.push(`${item.id}: dangerous actions are not disabled`);
  }
  return {
    ok: problems.length === 0,
    runtimeVersion: RUNTIME,
    sectionCount: items.length,
    items,
    problems,
    policy: 'read-only sections stay read-only; writes only through explicit Core flows; no legacy adapters'
  };
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, expectedSectionIds: Object.keys(EXPECTED), policy: 'clean-core-section-audit-matrix' };
}

module.exports = { RUNTIME, EXPECTED, audit, auditSection, selfTest };