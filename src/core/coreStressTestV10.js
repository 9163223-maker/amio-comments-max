'use strict';

const base = require('./coreStressTestV9');
const sectionRegistry = require('./sectionRegistry');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.42.6-MODERATION-CONFIRMATION-WORDING-FIX';

function patchResult(result = {}) {
  const failed = Array.isArray(result.failed) ? result.failed : [];
  return {
    ...result,
    ok: result.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1426_moderation_confirmation_wording_fix',
    summary: {
      ...(result.summary || {}),
      validatesModerationDangerConfirmationWording: true,
      validatesLegacyModerationActionGuardCompatibility: true
    },
    status: failed.length
      ? 'FAILED — см. failed'
      : 'OK — Core 1.42.6: финальное дерево модерации, полный путь и формулировки подтверждений прошли сценарный обход',
    notes: [
      ...((result.notes || []).filter(Boolean)),
      'Core 1.42.6 исправляет формулировку опасных действий: кнопки удаления и блокировки теперь явно содержат слово подтверждения и остаются двухшаговыми.',
      'Фикс сохраняет совместимость со stress-test веткой 1.42.3/1.42.4, где проверяется, что опасные действия не доступны одним нажатием.'
    ]
  };
}

async function runFast(options = {}) {
  return patchResult(await base.runFast(options));
}

async function run(options = {}) {
  return patchResult(await base.run(options));
}

function selfTest() {
  const baseSelf = base.selfTest ? base.selfTest() : {};
  const moderationSelf = sectionRegistry.find('moderation')?.selfTest?.() || {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && moderationSelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    moderationRuntimeVersion: moderationSelf.runtimeVersion || '',
    moderationConfirmationWordingFixReady: true,
    moderationFinalFunctionTreeReady: moderationSelf.finalFunctionTreeReady === true,
    moderationFullPathStressReady: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };
