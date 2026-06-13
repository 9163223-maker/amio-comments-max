'use strict';

const path = require('path');
const { getBuildInfo } = require('../buildInfo');
const liveIdentity = require('./liveIdentityService');
const runtimeContract = require('./runtimeContractService');

const ROUTE_RUNTIME = 'CC8.3.51-PR165-PUSH-RUNTIME-WIRED-ROUTES';
const STARTED_AT = new Date().toISOString();

function clean(value) { return String(value || '').trim(); }
function bool(value) { return value === true; }
function liveRuntime() { return clean(process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || ROUTE_RUNTIME) || ROUTE_RUNTIME; }
function liveSourceMarker() { return clean(process.env.BUILD_SOURCE_MARKER) || 'adminkit-pr165-push-runtime-wired'; }
function safeInfo(pathName) {
  try {
    const mod = require(pathName);
    return mod && typeof mod.info === 'function' ? (mod.info() || {}) : {};
  } catch (error) {
    return { ok: false, error: clean(error && error.message || error).slice(0, 160) };
  }
}
function safeRuntimeContractSummary() {
  try {
    const contract = runtimeContract.buildContract();
    return {
      runtime: clean(contract.runtime),
      sourceMarker: clean(contract.sourceMarker),
      contractLiveOk: bool(contract.contractLiveOk),
      startupPathOk: bool(contract.startupPath && contract.startupPath.ok),
      dataProvidersOk: bool(contract.dataProviders && contract.dataProviders.ok),
      mismatches: Array.isArray(contract.mismatches) ? contract.mismatches.slice(0, 20).map((item) => clean(item).slice(0, 160)).filter(Boolean) : [],
      safe: true
    };
  } catch (error) {
    return {
      runtime: runtimeContract.RUNTIME || 'RUNTIME-CONTRACT-PR196',
      sourceMarker: runtimeContract.SOURCE || 'adminkit-runtime-contract-pr196',
      contractLiveOk: false,
      startupPathOk: false,
      dataProvidersOk: false,
      mismatches: ['runtime_contract_build_failed'],
      error: clean(error && error.message || error).slice(0, 160),
      safe: true
    };
  }
}

function summarize(snapshot = {}) {
  const wizard = snapshot.pr199ButtonsWizard || {};
  const guard = snapshot.pr199ButtonsMainMenuRouteGuard || {};
  const realShow = snapshot.pr202ButtonsRealShowPath || {};
  const pr199Gates = {
    pr199ButtonsWizardOk: bool(wizard.ok),
    pr199ButtonsMainMenuRouteGuardOk: bool(guard.ok),
    chatIdWizardEditForwardsBotToken: bool(guard.chatIdWizardEditForwardsBotToken),
    chatIdWizardEditFallsBackToSend: bool(guard.chatIdWizardEditFallsBackToSend),
    buttonsDuplicateSaveGuarded: bool(wizard.buttonsDuplicateSaveGuarded),
    buttonsPendingPreviewConsumedBeforeSave: bool(wizard.buttonsPendingPreviewConsumedBeforeSave),
    installOrderAfterPersistentStoreBootstrap: clean(wizard.installOrder) === 'after-persistent-store-bootstrap'
  };
  const pr202Gates = {
    pr202ButtonsRealShowPathOk: bool(realShow.ok),
    pr202ButtonsRealShowPathInstalled: bool(realShow.installed),
    buttonsWizardRealShowPathInplace: bool(realShow.buttonsWizardRealShowPathInplace),
    buttonsWizardTraceCoversShowPath: bool(realShow.buttonsWizardTraceCoversShowPath),
    plusSignWizardTextSupported: bool(realShow.plusSignWizardTextSupported),
    patchesMaxSendMessageAfterPr199: bool(realShow.patchesMaxSendMessageAfterPr199)
  };
  const pr199Ready = Object.values(pr199Gates).every(Boolean);
  const pr202Ready = Object.values(pr202Gates).every(Boolean);
  return {
    ok: snapshot.ok === true,
    runtimeVersion: clean(snapshot.runtimeVersion),
    buildVersion: clean(snapshot.buildVersion),
    sourceMarker: clean(snapshot.sourceMarker),
    gitCommit: clean(snapshot.gitCommit),
    activeEntrypoint: clean(snapshot.activeEntrypoint),
    staleEndpointDetected: bool(snapshot.staleEndpointDetected),
    debugVersionSource: clean(snapshot.debugVersionSource),
    runtimeContractLiveOk: bool(snapshot.runtimeContract && snapshot.runtimeContract.contractLiveOk),
    pr199Ready,
    pr202Ready,
    buttonsWizardPhysicalInplaceReady: pr199Ready && pr202Ready,
    ...pr199Gates,
    ...pr202Gates
  };
}

function buildLiveVersionSnapshot() {
  try {
    const build = getBuildInfo();
    const identity = liveIdentity.identity();
    const runtimeVersion = liveRuntime() || build.runtimeVersion;
    const warning = liveIdentity.warningForExpected('', identity.gitCommit);
    const wizard = safeInfo('../pr199-buttons-wizard-inplace-save-bootstrap');
    const guard = safeInfo('../pr199-buttons-main-menu-route-guard');
    const realShow = safeInfo('../pr202-buttons-real-show-path-inplace');
    const postStart = safeInfo('../pr202-post-start-bootstrap');
    const snapshot = {
      ok: true,
      runtimeVersion,
      buildVersion: identity.buildVersion || build.buildVersion || runtimeVersion,
      displayVersion: identity.displayVersion || build.displayVersion || runtimeVersion,
      packageVersion: identity.packageVersion || build.packageVersion || runtimeVersion,
      sourceMarker: identity.sourceMarker || liveSourceMarker() || build.sourceMarker,
      gitCommit: identity.gitCommit || build.gitCommit,
      pr131MergeCommit: build.pr131MergeCommit,
      activeEntrypoint: identity.activeEntrypoint || clean(process.argv && process.argv[1] ? path.basename(process.argv[1]) : process.env.ADMINKIT_CLEAN_ENTRYPOINT || build.activeEntrypoint || 'unknown'),
      activeBotModule: identity.activeBotModule,
      expectedRuntimeVersion: build.expectedRuntimeVersion || runtimeVersion,
      routeRuntimeVersion: ROUTE_RUNTIME,
      routeRuntimeCurrent: true,
      generatedAt: Date.now(),
      serverStartedAt: identity.serverStartedAt || process.env.ADMINKIT_SERVER_STARTED_AT || build.serverStartedAt || STARTED_AT,
      staleEndpointDetected: runtimeVersion !== (build.expectedRuntimeVersion || runtimeVersion),
      warning: warning || undefined,
      liveIdentity: identity,
      latestWebhookIdentity: liveIdentity.latestWebhookIdentity(),
      latestAdminCallback: liveIdentity.latestAdminCallback(),
      debugVersionSource: 'live-identity-service-pr141',
      runtimeContract: safeRuntimeContractSummary(),
      pr199ButtonsWizard: {
        ok: bool(wizard.ok),
        installed: bool(wizard.installed),
        installOrder: clean(wizard.installOrder),
        buttonsDuplicateSaveGuarded: bool(wizard.buttonsDuplicateSaveGuarded),
        buttonsPendingPreviewConsumedBeforeSave: bool(wizard.buttonsPendingPreviewConsumedBeforeSave)
      },
      pr199ButtonsMainMenuRouteGuard: {
        ok: bool(guard.ok),
        installed: bool(guard.installed),
        chatIdWizardEditForwardsBotToken: bool(guard.chatIdWizardEditForwardsBotToken),
        chatIdWizardEditFallsBackToSend: bool(guard.chatIdWizardEditFallsBackToSend)
      },
      pr202ButtonsRealShowPath: {
        ok: bool(realShow.ok),
        installed: bool(realShow.installed),
        runtime: clean(realShow.runtime),
        source: clean(realShow.source),
        buttonsWizardRealShowPathInplace: bool(realShow.buttonsWizardRealShowPathInplace),
        buttonsWizardTraceCoversShowPath: bool(realShow.buttonsWizardTraceCoversShowPath),
        plusSignWizardTextSupported: bool(realShow.plusSignWizardTextSupported),
        patchesMaxSendMessageAfterPr199: bool(realShow.patchesMaxSendMessageAfterPr199),
        already: bool(realShow.already),
        error: clean(realShow.error).slice(0, 160)
      },
      pr202PostStartInstaller: {
        ok: bool(postStart.ok),
        installed: bool(postStart.installed),
        scheduled: bool(postStart.scheduled),
        runtime: clean(postStart.runtime),
        reason: clean(postStart.reason),
        delayMs: Number(postStart.delayMs || 0),
        startupLogRefreshRequested: bool(postStart.startupLogRefreshRequested),
        startupLogRefreshReason: clean(postStart.startupLogRefreshReason),
        error: clean(postStart.error).slice(0, 160)
      },
      commentsMatrixSelftest: true,
      productionCommentsMatrixProbe: true,
      commentsTimingTraceV2: true,
      pr97ReconciledOnCc8344: true,
      autoTenantChannelBind: true,
      tenantChannelBinding: true,
      channelTitleResolver: true,
      hybridChannelRegistry: true,
      getChatChannelTitles: true,
      campaignAttributionSupported: true,
      trackingLinksSupported: true,
      clckShortLinksSupported: true,
      campaignRedirectRoute: '/r/:slug',
      safe: true,
      noDatabaseRead: true,
      noMaxApiCall: true
    };
    snapshot.liveVersionSummary = summarize(snapshot);
    return snapshot;
  } catch (error) {
    const fallback = {
      ok: false,
      safe: true,
      generatedAt: Date.now(),
      error: clean(error && error.message || error).slice(0, 160),
      debugVersionSource: 'live-identity-service-pr141',
      runtimeContract: safeRuntimeContractSummary(),
      pr199ButtonsWizard: { ok: false, installed: false, installOrder: '', buttonsDuplicateSaveGuarded: false, buttonsPendingPreviewConsumedBeforeSave: false },
      pr199ButtonsMainMenuRouteGuard: { ok: false, installed: false, chatIdWizardEditForwardsBotToken: false, chatIdWizardEditFallsBackToSend: false },
      pr202ButtonsRealShowPath: { ok: false, installed: false, buttonsWizardRealShowPathInplace: false, buttonsWizardTraceCoversShowPath: false, plusSignWizardTextSupported: false, patchesMaxSendMessageAfterPr199: false },
      pr202PostStartInstaller: { ok: false, installed: false, scheduled: false }
    };
    fallback.liveVersionSummary = summarize(fallback);
    return fallback;
  }
}

module.exports = { buildLiveVersionSnapshot, liveVersionPayload: buildLiveVersionSnapshot, summarize };
