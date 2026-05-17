'use strict';

const v3 = require('./coreStressTestV3');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.40.1-COMPACT-GLOBAL-REPORT';

function boolOpt(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}
function compactError(item = {}) {
  return {
    name: item.name || '',
    ms: Number(item.ms || 0),
    error: item.error || '',
    stackHead: item.stackHead || ''
  };
}
function uniq(items = []) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
function compactSection(item = {}) {
  const routes = Array.isArray(item.routes) ? item.routes : [];
  return {
    sectionId: item.sectionId || String(item.name || '').replace(/^graph\.section\./, ''),
    ok: item.ok !== false,
    checkedPaths: Number(item.checkedPaths || routes.length || 0),
    maxDepth: Number(item.maxDepth || 0),
    routeCount: uniq(routes.map((r) => r.route)).length,
    routes: uniq(routes.map((r) => r.route)).slice(0, 18),
    error: item.error || ''
  };
}
function sectionGraphStep(full = {}) {
  return (full.tests || []).find((x) => x.name === 'global.sectionGraph.all') || null;
}
function compactReport(full = {}) {
  const graph = sectionGraphStep(full) || {};
  const perSection = Array.isArray(graph.perSection) ? graph.perSection.map(compactSection) : [];
  const failed = Array.isArray(full.failed) ? full.failed.map(compactError) : [];
  const slow = Array.isArray(full.slow) ? full.slow : [];
  const failedSections = perSection.filter((x) => !x.ok);
  const slowSections = (Array.isArray(graph.perSection) ? graph.perSection : [])
    .filter((x) => Number(x.ms || 0) > 700)
    .map((x) => ({ sectionId: x.sectionId || String(x.name || '').replace(/^graph\.section\./, ''), ms: Number(x.ms || 0), checkedPaths: Number(x.checkedPaths || 0) }));
  return {
    ok: full.ok === true && failed.length === 0 && failedSections.length === 0,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: full.runtimeVersion || v3.RUNTIME,
    generatedAt: full.generatedAt,
    durationMs: Number(full.durationMs || 0),
    actor: full.actor || {},
    summary: {
      totalChecks: Number(full.summary?.total || 0),
      failed: failed.length,
      slow: slow.length,
      sectionCount: Number(graph.sectionCount || perSection.length || 0),
      sectionGraphCheckedPaths: Number(graph.checkedPaths || full.summary?.sectionGraphCheckedPaths || 0),
      sectionGraphFailedSections: failedSections.length,
      seed: full.summary?.seed === true,
      cleanup: full.summary?.cleanup === true,
      global: full.summary?.global === true
    },
    status: failed.length || failedSections.length ? 'FAILED — см. failed и failedSections' : 'OK — все разделы Core прошли глобальный обход',
    failed,
    failedSections,
    slowSections,
    sections: perSection,
    notes: [
      'Компактный отчёт по умолчанию: без огромного raw JSON и без полного списка повторяющихся путей.',
      'Для полного старого дампа добавьте query verbose=1.',
      'Деструктивные действия тест не нажимает: delete/save/production/export.',
      'Живая сессия администратора восстанавливается после теста.'
    ]
  };
}

async function run(options = {}) {
  const full = await v3.run(options);
  if (boolOpt(options.verbose, false) || boolOpt(options.raw, false)) {
    return { ...full, runtimeVersion: RUNTIME, baseRuntimeVersion: full.runtimeVersion || v3.RUNTIME, compactReportReady: true };
  }
  return compactReport(full);
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: v3.RUNTIME,
    compactReportReady: true,
    verboseModeAvailable: true,
    noRawRouteDumpByDefault: true,
    failedOnlyFirstClass: true
  };
}

module.exports = { RUNTIME, run, selfTest, compactReport };
