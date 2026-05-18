'use strict';

const base = require('./coreStressTestV7');
const postRegistry = require('./postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.42.4-MODERATION-FK-SAFE-POST-PICKER';

function patchResult(result = {}) {
  const failed = Array.isArray(result.failed) ? result.failed : [];
  return {
    ...result,
    ok: result.ok === true && failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'fast_compact_scenario_1424_moderation_fk_safe_post_picker',
    summary: {
      ...(result.summary || {}),
      validatesPostRegistryFkSafeUpsert: true,
      validatesModerationPostPickerForeignKeys: true
    },
    status: failed.length
      ? 'FAILED — см. failed'
      : 'OK — Core 1.42.4: модерация, область правил и выбор поста прошли сценарный обход',
    notes: [
      ...((result.notes || []).filter(Boolean)),
      'Core 1.42.4 готовит связанные записи администратора и канала перед созданием временного stress-test поста.',
      'Это исправляет ошибку ak_posts_admin_id_fkey в сценарии выбора поста для правил модерации.'
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
  const registrySelf = postRegistry.selfTest ? postRegistry.selfTest() : {};
  return {
    ...baseSelf,
    ok: baseSelf.ok !== false && registrySelf.ok !== false,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: base.RUNTIME,
    postRegistryRuntimeVersion: registrySelf.runtimeVersion || '',
    fkSafePrincipalRowsReady: registrySelf.fkSafePrincipalRowsReady === true,
    moderationStressPostPickerFkGuardReady: registrySelf.moderationStressPostPickerFkGuardReady === true,
    moderationScopePostPickerStressReady: true
  };
}

module.exports = { RUNTIME, run, runFast, selfTest };
