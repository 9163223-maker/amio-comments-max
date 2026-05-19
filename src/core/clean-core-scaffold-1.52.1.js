'use strict';

/**
 * АдминКИТ 1.52.1 / CLEAN-CORE-SCAFFOLD
 *
 * This file is intentionally low-risk and side-effect-light.
 * It documents the future clean boot contract without replacing the proven runtime yet.
 *
 * Current safety rule:
 * - do not import legacy loader chain from here;
 * - do not install Module._load hooks from here;
 * - do not read DB/store/MAX/GitHub;
 * - do not start HTTP server from here;
 * - expose only metadata helpers for the next migration step.
 */

const RUNTIME = 'ADMINKIT-CORE-1.52.1-CLEAN-CORE-SCAFFOLD';
const DISPLAY_VERSION = 'CC7.5.34';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

const PASSED_CORE_SECTIONS = Object.freeze([
  '1.41 comments',
  '1.42 moderation',
  '1.43 stats',
  '1.44 post editor + archive',
  '1.45 post highlights',
  '1.46 polls',
  '1.47 channel connection',
  '1.48 navigation v3'
]);

const STABILIZATION_SECTIONS = Object.freeze([
  '1.49 emergency CPU rollback',
  '1.50 debug lite',
  '1.51 segmented production checklist',
  '1.52 clean core scaffold'
]);

const CLEAN_CORE_RULES = Object.freeze({
  oneEntrypoint: true,
  noLoaderChainAsFinalArchitecture: true,
  noHeavyDebugInProduction: true,
  noStressTestInProduction: true,
  noStoreSnapshotInLiteDiagnostics: true,
  noMaxApiCallInLiteDiagnostics: true,
  noGithubExportInLiteDiagnostics: true,
  noSecretsInDiagnostics: true,
  commentsPolicy: 'text + photos only; no video/files in comments',
  hintsPolicy: 'native inline hints only; no overlay/float hints',
  flowPolicy: 'one active screen / one active flow / cleanup pipeline'
});

function getCleanCoreScaffoldInfo() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    displayVersion: DISPLAY_VERSION,
    canonicalPublicBaseUrl: CANONICAL_PUBLIC_BASE_URL,
    mode: 'clean-core-scaffold-metadata-only',
    passedCoreSections: PASSED_CORE_SECTIONS,
    stabilizationSections: STABILIZATION_SECTIONS,
    cleanCoreRules: CLEAN_CORE_RULES,
    activeRuntimeChange: false,
    nextStep: '1.52.2 can switch package start to a clean entrypoint after manual confirmation.'
  };
}

module.exports = {
  RUNTIME,
  DISPLAY_VERSION,
  CANONICAL_PUBLIC_BASE_URL,
  PASSED_CORE_SECTIONS,
  STABILIZATION_SECTIONS,
  CLEAN_CORE_RULES,
  getCleanCoreScaffoldInfo
};
