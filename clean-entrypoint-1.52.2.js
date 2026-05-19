'use strict';

/**
 * АдминКИТ 1.52.2 / CLEAN ENTRYPOINT SCAFFOLD
 *
 * Safe by design:
 * - not used by package.json yet;
 * - does not start the current production server automatically when required;
 * - does not import the legacy loader chain unless explicitly run as main with ADMINKIT_CLEAN_ENTRYPOINT_DELEGATE=1;
 * - provides a future explicit registration point for Debug Lite routes.
 */

const RUNTIME = 'CC7.5.34-CORE-1.52.2-CLEAN-ENTRYPOINT-SCAFFOLD';
const SOURCE = 'adminkit-cc7-5-34-core-1-52-2-clean-entrypoint-scaffold';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

function applyRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

function getCleanEntrypointInfo() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    canonicalPublicBaseUrl: CANONICAL_PUBLIC_BASE_URL,
    activeRuntimeEntrypoint: false,
    packageJsonSwitched: false,
    legacyRuntimeFallback: 'adminkit-one-loader-cc75342.js',
    explicitDebugLiteModule: 'src/diagnostics/debug-lite-routes.js',
    noModuleLoadPatchInThisFile: true,
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true,
    nextStep: 'Only after manual approval: switch package.json start to this file or to final server.js.'
  };
}

function loadExplicitDebugLiteModule() {
  return require('./src/diagnostics/debug-lite-routes');
}

function delegateToLegacyRuntime() {
  applyRuntimeEnv();
  return require('./adminkit-one-loader-cc75342');
}

if (require.main === module) {
  if (process.env.ADMINKIT_CLEAN_ENTRYPOINT_DELEGATE === '1') {
    delegateToLegacyRuntime();
  } else {
    console.log(JSON.stringify(getCleanEntrypointInfo(), null, 2));
  }
}

module.exports = {
  RUNTIME,
  SOURCE,
  CANONICAL_PUBLIC_BASE_URL,
  applyRuntimeEnv,
  getCleanEntrypointInfo,
  loadExplicitDebugLiteModule,
  delegateToLegacyRuntime
};
