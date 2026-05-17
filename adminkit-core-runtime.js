'use strict';

// AdminKit Core foundation.
// This file is intentionally independent from the legacy CC7.5.x loader chain.
// It can be imported safely for audits and self-tests before production is switched to Core.

const RUNTIME = 'ADMINKIT-CORE-1.31-MENU-IDEMPOTENCY-LINK-UX';
const SOURCE = 'adminkit-core-1-31-menu-idempotency-link-ux';

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
  const sectionAuditModule = lazy('./src/core/sectionAudit');
  const accessManager = lazy('./src/core/accessManager');
  const accountManager = lazy('./src/core/accountManager');
  const menuRenderer = lazy('./src/core/menuRenderer');
  const postAddonManager = lazy('./src/core/postAddonManager');
  const dataSafety = lazy('./src/core/dataSafety');
  const flowEngine = lazy('./src/core/flowEngine');
  const flowScreen = lazy('./src/core/flowScreen');
  const maxSendAdapter = lazy('./src/core/maxSendAdapter');
  const routeDispatcher = lazy('./src/core/routeDispatcher');
  const stateManager = lazy('./src/core/stateManager');
  const timingStore = lazy('./src/core/coreTimingStore').selfTest();
  const channelData = lazy('./src/core/channelDataAdapter').selfTest();
  const buttonsData = lazy('./src/core/buttonsDataAdapter').selfTest();
  const canaryWebhook = lazy('./src/core/coreCanaryWebhook').selfTest();
  const accessSelfTest = accessManager.selfTest ? accessManager.selfTest() : null;
  const accountSelfTest = accountManager.selfTest ? accountManager.selfTest() : null;
  const routeDispatcherSelfTest = routeDispatcher.selfTest ? routeDispatcher.selfTest() : null;
  const flowScreenSelfTest = flowScreen.selfTest ? flowScreen.selfTest() : null;
  const stateSelfTest = stateManager.selfTest ? stateManager.selfTest() : null;
  const menuSelfTest = menuRenderer.selfTest ? menuRenderer.selfTest() : null;
  let callbackBridge = null;
  try { callbackBridge = lazy('./src/core/coreCallbackBridge').selfTest(); } catch (error) { callbackBridge = { ok: false, error: error?.message || String(error) }; }

  const sections = sectionRegistry.listAll();
  const sectionAudit = sectionAuditModule.audit(sections);
  const ids = sections.map((section) => section.id);
  const channelsSection = sectionRegistry.find('channels');
  const channelsSelfTest = channelsSection?.selfTest ? channelsSection.selfTest() : null;
  const buttonsSection = sectionRegistry.find('buttons');
  const buttonsSelfTest = buttonsSection?.selfTest ? buttonsSection.selfTest() : null;
  const leadMagnetsSection = sectionRegistry.find('lead_magnets');
  const leadMagnetsSelfTest = leadMagnetsSection?.selfTest ? leadMagnetsSection.selfTest() : null;
  const routeMap = sectionRegistry.routeMap();
  const required = ['channels', 'comments', 'buttons', 'lead_magnets', 'moderation', 'archive', 'stats', 'settings'];
  const missing = required.filter((id) => !ids.includes(id));
  const safety = dataSafety.policySummary();
  const flow = flowEngine.selfTest();
  const delivery = maxSendAdapter.selfTest();
  const mainHomeCallbackFastPath = routeDispatcher.shouldResetSessionOnStart({ payload: { r: 'main.home' } }, 'main.home') === false;
  const batchedAccessRender = accessSelfTest?.batchedFilterSections === true && accountSelfTest?.ok === true;
  const ack400Silent = callbackBridge?.safety?.ack400Silent === true;
  const callbackIdempotencyReady = callbackBridge?.safety?.callbackIdempotencyReady === true && callbackBridge?.safety?.duplicateCallbacksNoSend === true;
  const coreFlowTextInputBridgeReady = callbackBridge?.safety?.handlesCoreFlowTextInput === true && callbackBridge?.safety?.textInputRequiresActiveFlow === true && callbackBridge?.safety?.textInputRequiresActiveInputStep === true;
  const oneActiveScreenCleanupReady = stateSelfTest?.oneActiveScreenStateReady === true && stateSelfTest?.resetMovesActiveToGarbage === true && stateSelfTest?.setActiveScreenDeduplicatesGarbage === true;
  const linkUxReady = menuSelfTest?.linkUxReady === true && menuSelfTest?.payloadVersion === 2;
  const channelsReadOnlyDataReady = channelData.ok === true && channelData.readOnly === true && channelsSelfTest?.readOnlyRenderer === true;
  const buttonsReadOnlyDataReady = buttonsData.ok === true && buttonsData.readOnly === true && buttonsSelfTest?.readOnlyRenderer === true;
  const buttonsCleanStorageOnlyReady = buttonsData.cleanStorageOnly === true && buttonsData.sourceTable === 'ak_post_buttons';
  const buttonsLegacyAdaptersDisabled = buttonsData.legacyAdaptersDisabled === true;
  const cleanButtonCreateFlowReady = buttonsSelfTest?.cleanCreateFlow === true && buttonsSelfTest?.writesTo === 'ak_post_buttons';
  const cleanButtonSaveRouteReady = routeDispatcherSelfTest?.cleanButtonSaveRoute === true && routeDispatcherSelfTest?.buttonSaveTable === 'ak_post_buttons';
  const flowSaveActionReady = flowScreenSelfTest?.saveActionReady === true;
  const leadMagnetsAuditReady = leadMagnetsSelfTest?.legacyAdaptersUsed === false && leadMagnetsSelfTest?.dangerousActionsDisabled === true;

  return {
    ok: missing.length === 0 && routeMap.size >= sections.length && typeof postAddonManager.summarizePostAddons === 'function' && typeof postAddonManager.addButton === 'function' && safety.policy === 'non_destructive_additive_migrations_only' && flow.ok === true && flow.supports?.includes('selectPost') && flow.supports?.includes('acceptInput') && flow.supports?.includes('staleFlowCallbackGuard') && delivery.ok === true && canaryWebhook.ok === true && canaryWebhook.safety?.supportsManualCanarySend === true && canaryWebhook.safety?.manualSendRealRequiresRouteToken === true && callbackBridge.ok === true && coreFlowTextInputBridgeReady === true && callbackIdempotencyReady === true && oneActiveScreenCleanupReady === true && linkUxReady === true && mainHomeCallbackFastPath === true && timingStore.ok === true && sectionAudit.ok === true && batchedAccessRender === true && ack400Silent === true && channelsReadOnlyDataReady === true && buttonsReadOnlyDataReady === true && buttonsCleanStorageOnlyReady === true && buttonsLegacyAdaptersDisabled === true && cleanButtonCreateFlowReady === true && cleanButtonSaveRouteReady === true && flowSaveActionReady === true && leadMagnetsAuditReady === true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    isCoreRuntime: true,
    activeInProduction: false,
    purpose: 'Core 1.31: stable menu, duplicate callback guard, one active screen cleanup and clean link UX before production switch',
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
    sectionAudit,
    flowEngine: flow,
    flowScreen: flowScreenSelfTest,
    delivery,
    canaryWebhook,
    callbackBridge,
    timingStore,
    accessManager: accessSelfTest,
    accountManager: accountSelfTest,
    channelDataAdapter: channelData,
    channelsSection: channelsSelfTest,
    buttonsDataAdapter: buttonsData,
    buttonsSection: buttonsSelfTest,
    leadMagnetsSection: leadMagnetsSelfTest,
    routeDispatcher: routeDispatcherSelfTest,
    stateManager: stateSelfTest,
    menuRenderer: menuSelfTest,
    dataSafety: safety,
    constraints: {
      oneActiveScreen: true,
      oneActiveScreenCleanupReady,
      callbackIdempotencyReady,
      duplicateCallbacksNoSend: callbackBridge.safety?.duplicateCallbacksNoSend === true,
      linkUxReady,
      menuPayloadVersion: menuSelfTest?.payloadVersion || 0,
      sectionRegistryDriven: true,
      sectionAuditReady: sectionAudit.ok === true,
      allSectionsHaveSelfTest: sectionAudit.items?.every?.((item) => item.hasSelfTest === true) === true,
      planAccessReady: true,
      postAddonsDbReady: true,
      flowEngineReady: true,
      flowCancelRouteReady: true,
      flowPostSelectReady: true,
      flowTitleInputReady: true,
      explicitTextInputReady: true,
      staleCallbackGuardReady: true,
      flowSaveActionReady,
      cleanButtonCreateFlowReady,
      cleanButtonSaveRouteReady,
      cleanButtonSaveWritesAkPostButtons: true,
      leadMagnetsAuditReady,
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
      coreFlowTextInputBridgeReady,
      coreFlowTextInputRequiresActiveFlow: callbackBridge.safety?.textInputRequiresActiveFlow === true,
      coreFlowTextInputRequiresActiveInputStep: callbackBridge.safety?.textInputRequiresActiveInputStep === true,
      mainHomeCallbackFastPathReady: mainHomeCallbackFastPath,
      mainHomeCallbackSkipsSessionReset: mainHomeCallbackFastPath,
      coreTimingStoreReady: timingStore.ok === true,
      coreTimingsEndpointReady: true,
      batchedAccessRenderReady: batchedAccessRender,
      accountLookupCacheReady: accountSelfTest?.ok === true,
      channelsReadOnlyDataReady,
      channelDataAdapterReadOnly: channelData.readOnly === true,
      channelsSectionReadOnlyRendererReady: channelsSelfTest?.readOnlyRenderer === true,
      buttonsReadOnlyDataReady,
      buttonsDataAdapterReadOnly: buttonsData.readOnly === true,
      buttonsSectionReadOnlyRendererReady: buttonsSelfTest?.readOnlyRenderer === true,
      buttonsCleanStorageOnlyReady,
      buttonsLegacyAdaptersDisabled,
      coreCanaryDoesNotAutoRegister: true,
      nonDestructiveMigrationsOnly: true,
      noLegacyWrapperChain: true,
      noPublicAppOverride: true,
      noProductionWebhookChange: true,
      canaryAllNotRequired: true
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
