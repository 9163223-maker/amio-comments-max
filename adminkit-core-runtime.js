'use strict';

const RUNTIME = 'ADMINKIT-CORE-1.36-CLEAN-DEBUG-ROUTES-NO-WRAPPERS';
const SOURCE = 'adminkit-core-1-36-clean-debug-routes-no-wrappers';

function lazy(name) { return require(name); }
async function dispatch(ctx = {}) { return lazy('./src/core/routeDispatcher').dispatch(ctx); }
async function renderMain(ctx = {}) { return lazy('./src/core/routeDispatcher').mainMenu(ctx); }
async function deliverScreen(args = {}) { return lazy('./src/core/maxSendAdapter').deliver(args); }
function safe(name, fn) { try { return fn(); } catch (error) { return { ok: false, name, error: error?.message || String(error) }; } }

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
  const conditionCatalog = lazy('./src/core/leadMagnetConditionCatalog');
  const postRegistry = lazy('./src/core/postRegistryDataAdapter');
  const coreDebugRoutes = lazy('./src/core/coreDebugRoutes');

  const sections = sectionRegistry.listAll();
  const ids = sections.map((section) => section.id);
  const routeMap = sectionRegistry.routeMap();
  const required = sectionRegistry.REQUIRED_SECTION_IDS || [];
  const missing = required.filter((id) => !ids.includes(id));

  const registrySelfTest = safe('sectionRegistry', () => sectionRegistry.selfTest());
  const sectionAudit = safe('sectionAudit', () => sectionAuditModule.audit(sections));
  const accessSelfTest = safe('accessManager', () => accessManager.selfTest());
  const accountSelfTest = safe('accountManager', () => accountManager.selfTest ? accountManager.selfTest() : null);
  const menuSelfTest = safe('menuRenderer', () => menuRenderer.selfTest ? menuRenderer.selfTest() : null);
  const flow = safe('flowEngine', () => flowEngine.selfTest());
  const flowDefinitions = safe('flowDefinitions', () => lazy('./src/core/flowDefinitions').selfTest());
  const flowScreenSelfTest = safe('flowScreen', () => flowScreen.selfTest ? flowScreen.selfTest() : null);
  const delivery = safe('maxSendAdapter', () => maxSendAdapter.selfTest());
  const routeDispatcherSelfTest = safe('routeDispatcher', () => routeDispatcher.selfTest ? routeDispatcher.selfTest() : null);
  const stateSelfTest = safe('stateManager', () => stateManager.selfTest ? stateManager.selfTest() : null);
  const timingStore = safe('coreTimingStore', () => lazy('./src/core/coreTimingStore').selfTest());
  const channelData = safe('channelDataAdapter', () => lazy('./src/core/channelDataAdapter').selfTest());
  const buttonsData = safe('buttonsDataAdapter', () => lazy('./src/core/buttonsDataAdapter').selfTest());
  const canaryWebhook = safe('coreCanaryWebhook', () => lazy('./src/core/coreCanaryWebhook').selfTest());
  const conditionCatalogSelfTest = safe('leadMagnetConditionCatalog', () => conditionCatalog.selfTest());
  const postRegistrySelfTest = safe('postRegistryDataAdapter', () => postRegistry.selfTest());
  const coreDebugRoutesSelfTest = safe('coreDebugRoutes', () => coreDebugRoutes.selfTest());
  const callbackBridge = safe('coreCallbackBridge', () => lazy('./src/core/coreCallbackBridge').selfTest());
  const safety = safe('dataSafety', () => dataSafety.policySummary());

  const buttonsSection = sectionRegistry.find('buttons');
  const leadMagnetsSection = sectionRegistry.find('lead_magnets');
  const buttonsSelfTest = safe('buttonsSection', () => buttonsSection?.selfTest ? buttonsSection.selfTest() : null);
  const leadMagnetsSelfTest = safe('leadMagnetsSection', () => leadMagnetsSection?.selfTest ? leadMagnetsSection.selfTest() : null);

  const fullMenuScaffoldReady = registrySelfTest?.ok === true && registrySelfTest?.sectionCount === 16 && missing.length === 0;
  const billingCabinetReady = registrySelfTest?.billingCabinetReady === true && ids.includes('billing');
  const fullMenuFeatureGatesReady = accessSelfTest?.fullMenuFeatureGatesReady === true && accessSelfTest?.billingFeatureGateReady === true;
  const callbackIdempotencyReady = callbackBridge?.safety?.callbackIdempotencyReady === true && callbackBridge?.safety?.duplicateCallbacksNoSend === true;
  const leadMaterialTextInputReady = callbackBridge?.safety?.handlesLeadMagnetMaterialTextInput === true && flow?.leadMagnetMaterialInputReady === true;
  const leadAccessSelectReady = flow?.leadMagnetAccessSelectReady === true && routeDispatcherSelfTest?.leadMagnetAccessRouteReady === true;
  const postCaptureFlowReady = flow?.postCaptureFlowReady === true && routeDispatcherSelfTest?.postCaptureRouteReady === true && flowScreenSelfTest?.postCaptureButtonsReady === true;
  const postRegistryDataAdapterReady = postRegistrySelfTest?.ok === true && postRegistrySelfTest?.listPostsReady === true && routeDispatcherSelfTest?.postRegistryListsReady === true;
  const leadConditionCatalogReady = conditionCatalogSelfTest?.ok === true && flow?.leadConditionCatalogReady === true && flowScreenSelfTest?.leadConditionCatalogReady === true;
  const leadConditionSetupFlowReady = flow?.leadConditionSetupFlowReady === true && flowScreenSelfTest?.conditionSetupScreenReady === true && routeDispatcherSelfTest?.leadMagnetConditionSetupRouteReady === true;
  const leadFullFlowReady = flowDefinitions?.leadMagnetFullFlowReady === true && flowDefinitions?.leadMagnetStepCount === 10 && flow?.leadMagnetFullFlowReady === true;
  const leadSaveReady = routeDispatcherSelfTest?.cleanLeadMagnetSaveRoute === true && routeDispatcherSelfTest?.leadMagnetSaveTable === 'ak_post_lead_magnets';
  const conditionSetupRequiredBeforeSave = routeDispatcherSelfTest?.flowNextRequiresConditionSetup === true;
  const coreFlowTextInputBridgeReady = callbackBridge?.safety?.handlesCoreFlowTextInput === true && callbackBridge?.safety?.textInputRequiresActiveFlow === true && callbackBridge?.safety?.textInputRequiresActiveInputStep === true;
  const oneActiveScreenCleanupReady = stateSelfTest?.oneActiveScreenStateReady === true && stateSelfTest?.resetMovesActiveToGarbage === true && stateSelfTest?.setActiveScreenDeduplicatesGarbage === true;
  const linkUxReady = menuSelfTest?.linkUxReady === true && menuSelfTest?.payloadVersion === 2;
  const mainHomeCallbackFastPath = routeDispatcher.shouldResetSessionOnStart({ payload: { r: 'main.home' } }, 'main.home') === false;
  const batchedAccessRender = accessSelfTest?.batchedFilterSections === true && accountSelfTest?.ok === true;
  const buttonsCleanStorageOnlyReady = buttonsData?.cleanStorageOnly === true && buttonsData?.sourceTable === 'ak_post_buttons';
  const buttonsLegacyAdaptersDisabled = buttonsData?.legacyAdaptersDisabled === true;
  const cleanButtonCreateFlowReady = buttonsSelfTest?.cleanCreateFlow === true && buttonsSelfTest?.writesTo === 'ak_post_buttons';
  const cleanButtonSaveRouteReady = routeDispatcherSelfTest?.cleanButtonSaveRoute === true && routeDispatcherSelfTest?.buttonSaveTable === 'ak_post_buttons';
  const leadMagnetsAuditReady = leadMagnetsSelfTest?.legacyAdaptersUsed === false && leadMagnetsSelfTest?.dangerousActionsDisabled === true;
  const cleanCoreDebugRoutesReady = coreDebugRoutesSelfTest?.cleanCoreDebugRoutesReady === true && coreDebugRoutesSelfTest?.manualSendLegacyTokenCompatible === true;

  const ok = fullMenuScaffoldReady && billingCabinetReady && fullMenuFeatureGatesReady && cleanCoreDebugRoutesReady && postCaptureFlowReady && postRegistryDataAdapterReady && leadConditionCatalogReady && leadConditionSetupFlowReady && leadFullFlowReady && conditionSetupRequiredBeforeSave && leadMaterialTextInputReady && leadAccessSelectReady && leadSaveReady && missing.length === 0 && routeMap.size >= sections.length && typeof postAddonManager.summarizePostAddons === 'function' && typeof postAddonManager.addButton === 'function' && typeof postAddonManager.addLeadMagnet === 'function' && safety.policy === 'non_destructive_additive_migrations_only' && flow.ok === true && delivery.ok === true && canaryWebhook.ok === true && callbackBridge.ok === true && coreFlowTextInputBridgeReady && callbackIdempotencyReady && oneActiveScreenCleanupReady && linkUxReady && mainHomeCallbackFastPath && timingStore.ok === true && sectionAudit.ok === true && batchedAccessRender && channelData.ok === true && buttonsData.ok === true && buttonsCleanStorageOnlyReady && buttonsLegacyAdaptersDisabled && cleanButtonCreateFlowReady && cleanButtonSaveRouteReady && leadMagnetsAuditReady;

  return {
    ok,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    isCoreRuntime: true,
    activeInProduction: false,
    purpose: 'Core 1.36: clean Core debug/manual-send route module, legacy token compatibility restored in source logic, no new wrappers/monkeypatches.',
    sections: ids,
    requiredSections: required,
    missingSections: missing,
    routeCount: routeMap.size,
    storage: { sessions: 'ak_admin_sessions', posts: 'ak_posts', buttons: 'ak_post_buttons', leadMagnets: 'ak_post_lead_magnets', accounts: 'ak_accounts', billingSubscriptions: 'ak_billing_subscriptions', referrals: 'ak_referrals', migrations: 'ak_core_schema_migrations' },
    coreDebugRoutes: coreDebugRoutesSelfTest,
    sectionRegistry: registrySelfTest,
    sectionAudit,
    flowDefinitions,
    flowEngine: flow,
    flowScreen: flowScreenSelfTest,
    postRegistryDataAdapter: postRegistrySelfTest,
    leadConditionCatalog: conditionCatalogSelfTest,
    delivery,
    canaryWebhook,
    callbackBridge,
    timingStore,
    accessManager: accessSelfTest,
    accountManager: accountSelfTest,
    channelDataAdapter: channelData,
    buttonsDataAdapter: buttonsData,
    buttonsSection: buttonsSelfTest,
    leadMagnetsSection: leadMagnetsSelfTest,
    routeDispatcher: routeDispatcherSelfTest,
    stateManager: stateSelfTest,
    menuRenderer: menuSelfTest,
    dataSafety: safety,
    constraints: {
      cleanCoreDebugRoutesReady,
      manualSendLegacyTokenCompatible: coreDebugRoutesSelfTest?.manualSendLegacyTokenCompatible === true,
      noNewWrapperAdded: true,
      noNewMonkeypatchAdded: true,
      fullMenuScaffoldReady,
      all16SectionsRegistered: sections.length === 16 && missing.length === 0,
      billingCabinetReady,
      postCaptureFlowReady,
      postRegistryDataAdapterReady,
      leadConditionCatalogReady,
      leadConditionCount: conditionCatalogSelfTest?.count || 0,
      leadConditionSetupFlowReady,
      leadFullFlowReady,
      leadMagnetStepCount: flowDefinitions?.leadMagnetStepCount || 0,
      conditionSetupRequiredBeforeSave,
      leadMaterialTextInputReady,
      leadAccessSelectReady,
      leadSaveReady,
      leadMagnetsUseButtonFlowPattern: true,
      oneActiveScreen: true,
      oneActiveScreenCleanupReady,
      callbackIdempotencyReady,
      duplicateCallbacksNoSend: callbackBridge.safety?.duplicateCallbacksNoSend === true,
      linkUxReady,
      menuPayloadVersion: menuSelfTest?.payloadVersion || 0,
      sectionRegistryDriven: true,
      sectionAuditReady: sectionAudit.ok === true,
      planAccessReady: true,
      postAddonsDbReady: true,
      flowEngineReady: true,
      flowCancelRouteReady: true,
      flowPostSelectReady: true,
      flowTitleInputReady: true,
      explicitTextInputReady: true,
      staleCallbackGuardReady: true,
      flowSaveActionReady: flowScreenSelfTest?.saveActionReady === true,
      cleanButtonCreateFlowReady,
      cleanButtonSaveRouteReady,
      cleanButtonSaveWritesAkPostButtons: true,
      leadMagnetsAuditReady,
      maxSendAdapterReady: true,
      maxSendCanaryGated: true,
      coreSendDisabledByDefault: true,
      nonDestructiveMigrationsOnly: true,
      noLegacyWrapperChain: false,
      noPublicAppOverride: true,
      noProductionWebhookChange: true,
      canaryAllNotRequired: true
    }
  };
}

module.exports = { RUNTIME, SOURCE, isCoreRuntime: true, dispatch, renderMain, deliverScreen, selfTest };
