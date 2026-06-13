'use strict';

const path = require('path');
const { getBuildInfo } = require('../buildInfo');
const liveIdentity = require('./liveIdentityService');
const runtimeContract = require('./runtimeContractService');

const RUNTIME_CONTRACT_ENDPOINT = '/internal/runtime/contract';
const DEBUG_VERSION_SOURCE = 'live-version-snapshot-service-pr200';
const DEFAULT_ENTRYPOINT = 'clean-entrypoint-1.53.10-pr89.js';
const PR199_INSTALL_ORDER = 'after-persistent-store-bootstrap';

function clean(value) { return String(value || '').trim(); }
function short(value, max = 160) { return clean(value).replace(/\s+/g, ' ').slice(0, max); }
function bool(value) { return value === true; }
function activeEntrypointFrom(build = {}, identity = {}) {
  return short(identity.activeEntrypoint || (process.argv && process.argv[1] ? path.basename(process.argv[1]) : '') || process.env.ADMINKIT_CLEAN_ENTRYPOINT || build.activeEntrypoint || DEFAULT_ENTRYPOINT, 120);
}
function envGitCommit() { return clean(process.env.GIT_COMMIT || process.env.COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION); }
function safeError(error) {
  const code = short(error && (error.code || error.status || error.name) || 'live_version_snapshot_failed', 80);
  const message = short(error && error.message || error || 'live_version_snapshot_failed', 200)
    .replace(/(token|secret|password|authorization|cookie)=([^\s&]+)/ig, '$1=[redacted]')
    .replace(/Bearer\s+[^\s]+/ig, 'Bearer [redacted]');
  return { code, message };
}
function moduleInfo(modulePath) {
  try {
    const mod = require(modulePath);
    return typeof mod.info === 'function' ? (mod.info() || {}) : {};
  } catch (error) {
    return { ok: false, installed: false, error: short(error && error.message || error, 160) };
  }
}
function pr199WizardSnapshot(info = {}) {
  return {
    ok: bool(info.ok),
    installOrder: short(info.installOrder, 80),
    buttonsDuplicateSaveGuarded: bool(info.buttonsDuplicateSaveGuarded),
    buttonsPendingPreviewConsumedBeforeSave: bool(info.buttonsPendingPreviewConsumedBeforeSave),
    buttonsSaveGuardClearedOnExit: bool(info.buttonsSaveGuardClearedOnExit),
    callbackFlatMessageIdSupported: bool(info.callbackFlatMessageIdSupported)
  };
}
function pr199MainMenuSnapshot(info = {}) {
  return {
    ok: bool(info.ok),
    mainMenuUsesPublicRoute: bool(info.mainMenuUsesPublicRoute),
    chatIdWizardSendGuard: bool(info.chatIdWizardSendGuard),
    chatIdWizardEditForwardsBotToken: bool(info.chatIdWizardEditForwardsBotToken),
    chatIdWizardEditFallsBackToSend: bool(info.chatIdWizardEditFallsBackToSend)
  };
}
function pr199Ready(snapshot = {}) {
  const wizard = snapshot.pr199ButtonsWizard || {};
  const guard = snapshot.pr199ButtonsMainMenuRouteGuard || {};
  return wizard.ok === true &&
    guard.ok === true &&
    guard.chatIdWizardEditForwardsBotToken === true &&
    guard.chatIdWizardEditFallsBackToSend === true &&
    wizard.buttonsDuplicateSaveGuarded === true &&
    wizard.buttonsPendingPreviewConsumedBeforeSave === true &&
    wizard.installOrder === PR199_INSTALL_ORDER;
}
function runtimeContractSummary(contract = {}) {
  const startupPath = contract && contract.startupPath || {};
  return {
    contractLiveOk: bool(contract && contract.contractLiveOk),
    startupPath: {
      ok: bool(startupPath.ok),
      activeEntrypoint: short(startupPath.activeEntrypoint, 120),
      entrypointExpected: short(startupPath.entrypointExpected, 120)
    }
  };
}
function buildLiveVersionSnapshot(options = {}) {
  try {
    const build = getBuildInfo();
    const identity = liveIdentity.identity();
    const contract = options.runtimeContract || runtimeContract.buildContract();
    const runtimeVersion = short(identity.runtimeVersion || process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || build.runtimeVersion, 120);
    const buildVersion = short(identity.buildVersion || build.buildVersion || runtimeVersion, 120);
    const displayVersion = short(identity.displayVersion || build.displayVersion || runtimeVersion, 120);
    const sourceMarker = short(identity.sourceMarker || process.env.BUILD_SOURCE_MARKER || build.sourceMarker, 160);
    const activeEntrypoint = activeEntrypointFrom(build, identity);
    const entrypoint = short(options.entrypoint || activeEntrypoint || build.activeEntrypoint || DEFAULT_ENTRYPOINT, 120);
    const gitCommit = short(identity.gitCommit || build.gitCommit || envGitCommit() || options.gitCommit, 80);
    const snapshot = {
      ok: true,
      generatedAt: new Date().toISOString(),
      runtimeVersion,
      buildVersion,
      displayVersion,
      sourceMarker,
      entrypoint,
      activeEntrypoint,
      gitCommit,
      githubMainHeadSha: short(options.githubMainHeadSha, 80),
      commitSource: short(options.commitSource || (gitCommit ? 'runtime-env' : (options.githubMainHeadSha ? 'github-main-head' : 'unknown')), 80),
      staleEndpointDetected: bool(build.staleEndpointDetected || runtimeVersion !== (build.expectedRuntimeVersion || runtimeVersion)),
      debugVersionSource: DEBUG_VERSION_SOURCE,
      runtimeContractEndpoint: RUNTIME_CONTRACT_ENDPOINT,
      runtimeContract: runtimeContractSummary(contract),
      pr199ButtonsWizard: pr199WizardSnapshot(moduleInfo('../pr199-buttons-wizard-inplace-save-bootstrap')),
      pr199ButtonsMainMenuRouteGuard: pr199MainMenuSnapshot(moduleInfo('../pr199-buttons-main-menu-route-guard')),
      safe: true,
      noPublicHttpCall: true,
      noDatabaseRead: true,
      noMaxApiCall: true
    };
    snapshot.pr199Ready = pr199Ready(snapshot);
    return snapshot;
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      debugVersionSource: DEBUG_VERSION_SOURCE,
      runtimeContractEndpoint: RUNTIME_CONTRACT_ENDPOINT,
      staleEndpointDetected: false,
      error: safeError(error),
      safe: true,
      noPublicHttpCall: true
    };
  }
}
function buildLiveVersionSummary(snapshot = {}) {
  const contract = snapshot.runtimeContract || {};
  return {
    ok: snapshot.ok === true,
    generatedAt: short(snapshot.generatedAt, 64),
    runtimeVersion: short(snapshot.runtimeVersion, 120),
    sourceMarker: short(snapshot.sourceMarker, 160),
    entrypoint: short(snapshot.entrypoint, 120),
    activeEntrypoint: short(snapshot.activeEntrypoint, 120),
    gitCommit: short(snapshot.gitCommit, 80),
    githubMainHeadSha: short(snapshot.githubMainHeadSha, 80),
    commitSource: short(snapshot.commitSource, 80),
    contractLiveOk: bool(contract.contractLiveOk),
    startupPathOk: bool(contract.startupPath && contract.startupPath.ok),
    pr199Ready: pr199Ready(snapshot)
  };
}

module.exports = { buildLiveVersionSnapshot, buildLiveVersionSummary, pr199Ready, DEBUG_VERSION_SOURCE, RUNTIME_CONTRACT_ENDPOINT, PR199_INSTALL_ORDER };
