'use strict';

const modules = [
  require('../modules/channels'),
  require('../modules/comments'),
  require('../modules/photoComments'),
  require('../modules/reactionsReplies'),
  require('../modules/leadMagnets'),
  require('../modules/buttons'),
  require('../modules/postHighlights'),
  require('../modules/polls'),
  require('../modules/postEditor'),
  require('../modules/moderation'),
  require('../modules/stats'),
  require('../modules/navigation'),
  require('../modules/startLanding'),
  require('../modules/debugDiagnostics'),
  require('../modules/productionChecklist')
];

const RUNTIME = 'ADMINKIT-CORE-SECTION-REGISTRY-1.32-FULL-15-SECTIONS';
const REQUIRED_SECTION_IDS = [
  'channels',
  'comments',
  'photo_comments',
  'reactions_replies',
  'lead_magnets',
  'buttons',
  'post_highlights',
  'polls',
  'post_editor',
  'moderation',
  'stats',
  'navigation',
  'start_landing',
  'debug_diagnostics',
  'production_checklist'
];

function listAll() {
  return modules.slice().sort((a, b) => Number(a.order || 100) - Number(b.order || 100));
}

function find(sectionId) {
  return listAll().find((section) => section.id === sectionId) || null;
}

function routeMap() {
  const map = new Map();
  for (const section of listAll()) {
    const routes = section.routes || {};
    Object.values(routes).forEach((route) => map.set(route, section));
  }
  return map;
}

function selfTest() {
  const sections = listAll();
  const ids = sections.map((section) => section.id);
  const missing = REQUIRED_SECTION_IDS.filter((id) => !ids.includes(id));
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  return {
    ok: missing.length === 0 && duplicates.length === 0 && sections.length === 15,
    runtimeVersion: RUNTIME,
    sectionCount: sections.length,
    requiredSectionCount: REQUIRED_SECTION_IDS.length,
    ids,
    missing,
    duplicates,
    fullMenuScaffoldReady: true
  };
}

module.exports = { RUNTIME, REQUIRED_SECTION_IDS, listAll, find, routeMap, selfTest };
