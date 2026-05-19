'use strict';

const RUNTIME = 'CC7.5.34-CORE-1.53.4-V3-MENU-ROUTE-FIX';
const SOURCE = 'adminkit-cc7-5-34-core-1-53-4-v3-menu-route-fix';
const PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const ACTIVE_PRODUCTION_RUNTIME = './index';
const SAFE_ROLLBACK_RUNTIME = './clean-entrypoint-1.53.3';

function applyRuntimeEnv() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  process.env.ADMINKIT_PUBLIC_BASE_URL = process.env.ADMINKIT_PUBLIC_BASE_URL || PUBLIC_BASE_URL;
  process.env.ADMINKIT_DISABLE_MENU_LOGO_ATTACHMENT = '1';
  process.env.ADMINKIT_FORCE_V3_PRODUCTION_MENU = '1';
  process.env.ADMINKIT_EARLY_V3_MENU_AUDIT = '1';
  process.env.ADMINKIT_V3_ROUTE_FIX = '1';
}

function installLegacySafeLayers() {
  const previous = require(SAFE_ROLLBACK_RUNTIME);
  const result = {};
  result.menuAudit = previous.installEarlyMenuAuditRoutes ? previous.installEarlyMenuAuditRoutes() : { ok: false, skipped: true };
  result.debugLite = previous.installDebugLiteLayer ? previous.installDebugLiteLayer() : { ok: false, skipped: true };
  result.logoGuard = previous.installLogoGuard ? previous.installLogoGuard() : { ok: false, skipped: true };
  result.menuGuard = previous.installMenuGuard ? previous.installMenuGuard() : { ok: false, skipped: true };
  return result;
}

function installRouteFix() {
  const fix = require('./v3-route-fix-1534');
  return fix && typeof fix.install === 'function' ? fix.install() : { ok: false, error: 'v3_route_fix_missing' };
}

function getCleanEntrypointInfo() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    activeProductionRuntime: 'index.js',
    safeRollbackRuntime: SAFE_ROLLBACK_RUNTIME + '.js',
    routeFixes: ['navigation', 'landing_start', 'debug', 'production_checklist', 'highlights', 'polls'],
    safe: true
  };
}

function start() {
  applyRuntimeEnv();
  const routeFix = installRouteFix();
  const layers = installLegacySafeLayers();
  process.env.ADMINKIT_V3_ROUTE_FIX_OK = routeFix && routeFix.ok !== false ? '1' : '0';
  process.env.ADMINKIT_EARLY_MENU_AUDIT_OK = layers.menuAudit && layers.menuAudit.ok !== false ? '1' : '0';
  process.env.ADMINKIT_DEBUG_LITE_LAYER_OK = layers.debugLite && layers.debugLite.ok !== false ? '1' : '0';
  process.env.ADMINKIT_MENU_LOGO_GUARD_OK = layers.logoGuard && layers.logoGuard.ok !== false ? '1' : '0';
  process.env.ADMINKIT_V3_MENU_GUARD_OK = layers.menuGuard && layers.menuGuard.ok !== false ? '1' : '0';
  return require(ACTIVE_PRODUCTION_RUNTIME);
}

if (require.main === module) start();

module.exports = { RUNTIME, SOURCE, PUBLIC_BASE_URL, applyRuntimeEnv, installRouteFix, getCleanEntrypointInfo, start };
