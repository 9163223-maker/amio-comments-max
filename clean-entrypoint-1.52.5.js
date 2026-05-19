'use strict';

const RUNTIME = 'CC7.5.34-CORE-1.52.5-CLEAN-ENTRYPOINT-ACTIVE-SWITCH';
const SOURCE = 'adminkit-cc7-5-34-core-1-52-5-clean-entrypoint-active-switch';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const SAFE_PRODUCTION_FALLBACK = './adminkit-one-loader-cc75342';

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
    activeRuntimeEntrypoint: true,
    packageJsonSwitched: true,
    safeProductionFallback: 'adminkit-one-loader-cc75342.js',
    noModuleLoadPatchInThisFile: true,
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true,
    rollback: 'Set package.json start back to node adminkit-one-loader-cc75342.js'
  };
}

function start() {
  applyRuntimeEnv();
  return require(SAFE_PRODUCTION_FALLBACK);
}

if (require.main === module) {
  start();
}

module.exports = { RUNTIME, SOURCE, CANONICAL_PUBLIC_BASE_URL, SAFE_PRODUCTION_FALLBACK, applyRuntimeEnv, getCleanEntrypointInfo, start };
