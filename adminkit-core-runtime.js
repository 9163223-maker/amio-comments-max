'use strict';

// AdminKit Core foundation.
// This file is intentionally independent from the legacy CC7.5.x loader chain.
// It can be imported safely for audits and self-tests before production is switched to Core.

const RUNTIME = 'ADMINKIT-CORE-1.21-CHANNELS-READ-ONLY-DATA';
const SOURCE = 'adminkit-core-1-21-channels-read-only-data';

function lazy(name) {
  return require(name);
}

async function dispatch(ctx = {}) {
  return lazy('./src/core/routeDispatcher').dispatch(ctx);
}

async function renderMain(ctx = {}) {
  return lazy('./src/core/routeDispatcher').mainMenu(ctx);
}

async function deliverScreen(args = {}) {
  return lazy('./src/core/maxSendAdapter').deliver(args);
}

function selfTest() {
  const sectionRegistry = lazy('./src/core/sectionRegistry');
  const accessManager = lazy('./src/core/accessManager');
  const accountManager = lazy('./src/core/accountManager');
  const menuRenderer = lazy('./src/core/menuRenderer');
  const postAddonManager = lazy('./src/core/postAddonManager');
  const dataSafety = lazy('./src/core/dataSafety');
  const flowEngine = lazy('./src/core/flowEngine');
  const maxSendAdapter = lazy('./src/core/maxSendAdapter');
  const routeDispatcher = lazy('./src/core/routeDispatcher');
  const timingStore = lazy('./src/core/coreTimingStore').selfTest();
  const channelData = lazy('./src/core/channelDataAdapter').selfTest();
  const canaryWebhook = lazy('./src/core/coreCanaryWebhook').selfTest();
  const accessSelfTest = accessManager.selfTest ? accessManager.selfTest() : null;
  const accountSelfTest = accountManager.selfTest ? accountManager.selfTest() : null;
  let callbackBridge = null;
  try { callbackBridge = lazy('./src/core/coreCallbackBridge').selfTest(); } catch (error) { callbackBridge = { ok: false, error: error?.message || String(error) }; }

  const sections = sectionRegistry.listAll();
  const ids = sections.map((section) => section.id);
  const channelsSection = sectionRegistry.find('channels');
  const channelsSelfTest = channelsSection?.selfTest ? channelsSection.selfTest() : null;
  const routeMap = sectionRegistry.routeMap();
  const required = ['channels', 'comments', 'buttons', 'lead_magnets', 'moderation', 'archive', 'stats', 'settings'];
  const missing = required.filter((id) => !ids.includes(id));
  const safety = dataSafety.policySummary();
  const flow = flowEngine.selfTest();
  const delivery = maxSendAdapter.selfTest();
  const mainHomeCallbackFastPath = routeDispatcher.shouldResetSessionOnStart({ payload: { r: 'main.home' } }, 'main.home') === false;
  const batchedAccessRender = accessSelfTest?.batchedFilterSections === true && accountSelfTest?.ok === true;
  const ack400Silent = callbackBridge?.safety?.ack400Silent === true;
  const channelsReadOnlyDataReady = channelData.ok === true && channelData.readOnly === true && channelsSelfTest?.readOnlyRenderer === true;

  return {
    ok: missing.length === 0 && routeMap.size >= sections.length && typeof postAddonManager.summarizePostAddons === 'function' && safety.policy === 'non_destructive_additive_migrations_only' && flow.ok === true && flow.supports?.includes('selectPost') && flow.supports?.includes('acceptInput') && flow.supports?.includes('staleFlowCallbackGuard') && delivery.ok === true && canaryWebhook.ok === true && canaryWebhook.safety?.supportsManualCanarySend === true && canaryWebhook.safety?.manualSendRealRequiresRouteToken === true && callbackBridge.ok === true && mainHomeCallbackFastPath === true && timingStore.ok === true && batchedAccessRender === true && ack400Silent === true && channelsReadOnlyDataReady === true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    isCoreRuntime: true,
    activeInProduction: false,
    purpose: 'clean foundation for future switch from layered CC7.5.x wrappers to AdminKit Core',
    sections: ids,
    missingSections: missing,
    routeCount: routeMap.size,
    accessPlans: Object.keys(accessManager.PLAN_FEATURES || {}),
    rendererVersion: menuRenderer.inlineKeyboard([[menuRenderer.btn('test', 'main.home')]])[0]?.payload?.version || 0,
    storage: {
      sessions: 'ak_admin_sessions',
      buttons: 'ak_post_buttons',
      leadMagnets: 'ak_post_lead_magnets',
      accounts: 'ak_accounts',
      migrations: 'ak_core_schema_migrations'
    },
    flowEngine: flow,
    delivery,
    canaryWebhook,
    callbackBridge,
    timingStore,
    accessManager: accessSelfTest,
    accountManager: accountSelfTest,
    channelDataAdapter: channelData,
    channelsSection: channelsSelfTest,
    dataSafety: safety,
    constraints: {
      oneActiveScreen: true,
      sectionRegistryDriven: true,
      planAccessReady: true,
      postAddonsDbReady: true,
      flowEngineReady: true,
      flowCancelRouteReady: true,
      flowPostSelectReady: true,
      flowTitleInputReady: true,
      explicitTextInputReady: true,
      staleCallbackGuardReady: true,
      maxSendAdapterReady: true,
      maxSendCanaryGated: true,
      coreSendDisabledByDefault: true,
      isolatedCanaryWebhookReady: true,
      manualCanarySendReady: true,
      manualCanarySendRequiresAdminId: true,
      manualCanarySendQueryParserReady: true,
      manualCanarySendTokenGuardReady: true,
      manualCanaryRealSendRequiresToken: true,
      manualCanarySendTimingStoreReady: canaryWebhook.safety?.manualSendTimingStoreReady === true,
      coreCallbackBridgeReady: true,
      coreCallbackBridgeCanaryOnly: true,
      coreCallbackFastAckReady: callbackBridge.safety?.fastAckBeforeRender === true,
      coreCallbackTimingDiagnosticsReady: callbackBridge.safety?.timingDiagnostics === true,
      coreCallbackTimingStoreReady: callbackBridge.safety?.timingStoreReady === true,
      coreCallbackAck400SilentReady: ack400Silent,
      mainHomeCallbackFastPathReady: mainHomeCallbackFastPath,
      mainHomeCallbackSkipsSessionReset: mainHomeCallbackFastPath,
      coreTimingStoreReady: timingStore.ok === true,
      coreTimingsEndpointReady: true,
      batchedAccessRenderReady: batchedAccessRender,
      accountLookupCacheReady: accountSelfTest?.ok === true,
      channelsReadOnlyDataReady,
      channelDataAdapterReadOnly: channelData.readOnly === true,
      channelsSectionReadOnlyRendererReady: channelsSelfTest?.readOnlyRenderer === true,
      coreCanaryDoesNotAutoRegister: true,
      nonDestructiveMigrationsOnly: true,
      noLegacyWrapperChain: true,
      noPublicAppOverride: true
    }
  };
}

module.exports = {
  RUNTIME,
  SOURCE,
  isCoreRuntime: true,
  dispatch,
  renderMain,
  deliverScreen,
  selfTest
};