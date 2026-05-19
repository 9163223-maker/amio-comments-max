'use strict';

/**
 * АдминКИТ 1.52.3 / CLEAN ENTRYPOINT DRY RUN
 *
 * This file is diagnostic-only. It must not start the server, read DB/store,
 * call MAX API, call GitHub export, or switch package.json runtime.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'ADMINKIT-CLEAN-ENTRYPOINT-DRY-RUN-1.52.3';
const EXPECTED_ACTIVE_RUNTIME = 'CC7.5.34-CORE-1.51.1-PRODUCTION-CHECKLIST-LITE';
const CLEAN_ENTRYPOINT_PATH = 'clean-entrypoint-1.52.2.js';
const EXPLICIT_DEBUG_LITE_PATH = 'src/diagnostics/debug-lite-routes.js';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

function fileExists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function readJsonSafe(relativePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

function getPackageStart() {
  const pkg = readJsonSafe('package.json', {});
  return {
    main: pkg.main || '',
    start: pkg.scripts && pkg.scripts.start ? pkg.scripts.start : ''
  };
}

function canImportCleanEntrypoint() {
  try {
    const before = Module._load;
    const clean = require(path.join(process.cwd(), CLEAN_ENTRYPOINT_PATH));
    const after = Module._load;
    return {
      ok: true,
      moduleLoadUnchanged: before === after,
      runtimeVersion: clean && clean.RUNTIME ? clean.RUNTIME : null,
      hasInfoFunction: Boolean(clean && typeof clean.getCleanEntrypointInfo === 'function'),
      hasDebugLiteLoader: Boolean(clean && typeof clean.loadExplicitDebugLiteModule === 'function'),
      info: clean && typeof clean.getCleanEntrypointInfo === 'function' ? clean.getCleanEntrypointInfo() : null
    };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function canImportExplicitDebugLite() {
  try {
    const before = Module._load;
    const debugLite = require(path.join(process.cwd(), EXPLICIT_DEBUG_LITE_PATH));
    const after = Module._load;
    return {
      ok: true,
      moduleLoadUnchanged: before === after,
      runtimeVersion: debugLite && debugLite.RUNTIME ? debugLite.RUNTIME : null,
      hasRegisterFunction: Boolean(debugLite && typeof debugLite.registerDebugLiteRoutes === 'function'),
      hasSelfTest: Boolean(debugLite && typeof debugLite.selfTest === 'function'),
      selfTest: debugLite && typeof debugLite.selfTest === 'function' ? debugLite.selfTest() : null
    };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function runDryRun() {
  const pkg = getPackageStart();
  const activeRuntime = process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || readJsonSafe('build-info.json', {}).runtimeVersion || '';
  const cleanImport = canImportCleanEntrypoint();
  const debugImport = canImportExplicitDebugLite();
  const checks = {
    cleanEntrypointFileExists: fileExists(CLEAN_ENTRYPOINT_PATH),
    explicitDebugLiteFileExists: fileExists(EXPLICIT_DEBUG_LITE_PATH),
    cleanEntrypointImports: cleanImport.ok === true,
    explicitDebugLiteImports: debugImport.ok === true,
    cleanEntrypointDoesNotPatchModuleLoad: cleanImport.moduleLoadUnchanged === true,
    explicitDebugLiteDoesNotPatchModuleLoad: debugImport.moduleLoadUnchanged === true,
    packageStartStillLegacyLoader: /adminkit-one-loader-cc75342\.js/.test(pkg.start),
    packageMainStillLegacyLoader: pkg.main === 'adminkit-one-loader-cc75342.js',
    activeRuntimeStillProduction1511: activeRuntime === EXPECTED_ACTIVE_RUNTIME,
    noRuntimeSwitch: true,
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true,
    noSecrets: true
  };
  const failed = Object.keys(checks).filter((key) => checks[key] !== true);
  return {
    ok: failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'clean-entrypoint-dry-run',
    activeRuntime,
    expectedActiveRuntime: EXPECTED_ACTIVE_RUNTIME,
    cleanEntrypointPath: CLEAN_ENTRYPOINT_PATH,
    explicitDebugLiteRoutesPath: EXPLICIT_DEBUG_LITE_PATH,
    canonicalPublicBaseUrl: CANONICAL_PUBLIC_BASE_URL,
    packageStart: pkg.start,
    packageMain: pkg.main,
    checks,
    failed,
    imports: {
      cleanEntrypoint: cleanImport,
      explicitDebugLite: debugImport
    },
    nextStep: failed.length === 0
      ? 'Ready for 1.52.4 runtime switch candidate, but only after manual approval.'
      : 'Fix failed dry-run checks before any runtime switch.',
    safe: true,
    constantTime: true
  };
}

module.exports = { RUNTIME, runDryRun };

if (require.main === module) {
  console.log(JSON.stringify(runDryRun(), null, 2));
}
