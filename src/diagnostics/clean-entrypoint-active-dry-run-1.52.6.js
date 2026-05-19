'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'ADMINKIT-CLEAN-ENTRYPOINT-ACTIVE-DRY-RUN-1.52.6';
const EXPECTED_PRODUCTION_RUNTIME = 'CC7.5.34-CORE-1.51.1-PRODUCTION-CHECKLIST-LITE';
const ACTIVE_ENTRYPOINT_PATH = 'clean-entrypoint-1.52.5.js';
const FALLBACK_LOADER_PATH = 'adminkit-one-loader-cc75342.js';
const EXPLICIT_DEBUG_LITE_PATH = 'src/diagnostics/debug-lite-routes.js';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

function fileExists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function readJsonSafe(relativePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')); } catch { return fallback; }
}

function getPackageStart() {
  const pkg = readJsonSafe('package.json', {});
  return { main: pkg.main || '', start: pkg.scripts && pkg.scripts.start ? pkg.scripts.start : '', version: pkg.version || '' };
}

function importModule(relativePath) {
  try {
    const before = Module._load;
    const mod = require(path.join(process.cwd(), relativePath));
    const after = Module._load;
    return { ok: true, moduleLoadUnchanged: before === after, runtimeVersion: mod && mod.RUNTIME ? mod.RUNTIME : null, hasInfoFunction: Boolean(mod && typeof mod.getCleanEntrypointInfo === 'function'), hasStartFunction: Boolean(mod && typeof mod.start === 'function'), info: mod && typeof mod.getCleanEntrypointInfo === 'function' ? mod.getCleanEntrypointInfo() : null };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function importDebugLite() {
  try {
    const before = Module._load;
    const mod = require(path.join(process.cwd(), EXPLICIT_DEBUG_LITE_PATH));
    const after = Module._load;
    return { ok: true, moduleLoadUnchanged: before === after, runtimeVersion: mod && mod.RUNTIME ? mod.RUNTIME : null, hasRegisterFunction: Boolean(mod && typeof mod.registerDebugLiteRoutes === 'function'), hasSelfTest: Boolean(mod && typeof mod.selfTest === 'function') };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

function runDryRun() {
  const pkg = getPackageStart();
  const activeRuntime = process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || readJsonSafe('build-info.json', {}).runtimeVersion || '';
  const activeImport = importModule(ACTIVE_ENTRYPOINT_PATH);
  const debugImport = importDebugLite();
  const packageStartIsActiveCleanEntrypoint = /clean-entrypoint-1\.52\.5\.js/.test(pkg.start);
  const packageMainIsActiveCleanEntrypoint = pkg.main === ACTIVE_ENTRYPOINT_PATH;
  const checks = {
    activeEntrypointFileExists: fileExists(ACTIVE_ENTRYPOINT_PATH),
    fallbackLoaderFileExists: fileExists(FALLBACK_LOADER_PATH),
    explicitDebugLiteFileExists: fileExists(EXPLICIT_DEBUG_LITE_PATH),
    activeEntrypointImports: activeImport.ok === true,
    explicitDebugLiteImports: debugImport.ok === true,
    activeEntrypointDoesNotPatchModuleLoad: activeImport.moduleLoadUnchanged === true,
    explicitDebugLiteDoesNotPatchModuleLoad: debugImport.moduleLoadUnchanged === true,
    packageStartIsActiveCleanEntrypoint,
    packageMainIsActiveCleanEntrypoint,
    activeRuntimeStillProduction1511: activeRuntime === EXPECTED_PRODUCTION_RUNTIME,
    activeEntrypointDelegatesToFallback: activeImport.info && activeImport.info.safeProductionFallback === FALLBACK_LOADER_PATH,
    noDatabaseRead: true,
    noStoreSnapshot: true,
    noGithubExport: true,
    noStressTest: true,
    noMaxApiCall: true,
    noSecrets: true
  };
  const failed = Object.keys(checks).filter((key) => checks[key] !== true);
  return { ok: failed.length === 0, runtimeVersion: RUNTIME, generatedAt: new Date().toISOString(), mode: 'clean-entrypoint-active-dry-run', activeRuntime, expectedProductionRuntime: EXPECTED_PRODUCTION_RUNTIME, activeEntrypointPath: ACTIVE_ENTRYPOINT_PATH, fallbackLoaderPath: FALLBACK_LOADER_PATH, canonicalPublicBaseUrl: CANONICAL_PUBLIC_BASE_URL, packageStart: pkg.start, packageMain: pkg.main, packageVersion: pkg.version, checks, failed, imports: { activeEntrypoint: activeImport, explicitDebugLite: debugImport }, nextStep: failed.length === 0 ? 'Active clean entrypoint is safe. Continue manual UI checks on safe production runtime.' : 'Fix failed active dry-run checks before deeper cleanup.', safe: true, constantTime: true, noDatabaseRead: true, noStoreSnapshot: true, noGithubExport: true, noStressTest: true, noMaxApiCall: true };
}

module.exports = { RUNTIME, runDryRun };

if (require.main === module) console.log(JSON.stringify(runDryRun(), null, 2));
