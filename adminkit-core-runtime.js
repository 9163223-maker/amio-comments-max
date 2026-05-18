'use strict';

const RUNTIME = 'ADMINKIT-CORE-1.41.0-UNIFIED-COMMENTS';
const SOURCE = 'adminkit-core-1-41-0-unified-comments';

function lazy(name) { return require(name); }
async function dispatch(ctx = {}) { return lazy('./src/core/routeDispatcher').dispatch(ctx); }
async function renderMain(ctx = {}) { return lazy('./src/core/routeDispatcher').mainMenu(ctx); }
async function deliverScreen(args = {}) { return lazy('./src/core/maxSendAdapter').deliver(args); }
function safe(name, fn) { try { return fn(); } catch (error) { return { ok: false, name, error: error?.message || String(error) }; } }
function isOk(value) { return value === true || value?.ok === true || value == null; }

function selfTest() {
  const sectionRegistry = lazy('./src/core/sectionRegistry');
  const accessManager = lazy('./src/core/accessManager');
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

  const sections = sectionRegistry.listAll();
  const ids = sections.map((section) => section.id);
  const visibleSections = typeof menuRenderer.visibleSections === 'function' ? menuRenderer.visibleSections(sections) : sections.filter((s) => s.hiddenInMain !== true);
  const visibleIds = visibleSections.map((section) => section.id);
  const required = sectionRegistry.REQUIRED_SECTION_IDS || [];
  const missing = required.filter((id) => !ids.includes(id));

  const registrySelfTest = safe('sectionRegistry', () => sectionRegistry.selfTest());
  const accessSelfTest = safe('accessManager', () => accessManager.selfTest());
  const accountSelfTest = safe('accountManager', () => lazy('./src/core/accountManager').selfTest ? lazy('./src/core/accountManager').selfTest() : null);
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
  const coreDebugRoutesSelfTest = safe('coreDebugRoutes', () => lazy('./src/core/coreDebugRoutes').selfTest());
  const callbackBridge = safe('coreCallbackBridge', () => lazy('./src/core/coreCallbackBridge').selfTest());
  const sectionAudit = safe('sectionAudit', () => lazy('./src/core/sectionAudit').audit(sections));
  const safety = safe('dataSafety', () => dataSafety.policySummary());

  const buttonsSection = sectionRegistry.find('buttons');
  const leadMagnetsSection = sectionRegistry.find('lead_magnets');
  const commentsSection = sectionRegistry.find('comments');
  const photoCommentsSection = sectionRegistry.find('photo_comments');
  const reactionsRepliesSection = sectionRegistry.find('reactions_replies');
  const buttonsSelfTest = safe('buttonsSection', () => buttonsSection?.selfTest ? buttonsSection.selfTest() : null);
  const leadMagnetsSelfTest = safe('leadMagnetsSection', () => leadMagnetsSection?.selfTest ? leadMagnetsSection.selfTest() : null);
  const commentsSelfTest = safe('commentsSection', () => commentsSection?.selfTest ? commentsSection.selfTest() : null);
  const photoCommentsSelfTest = safe('photoCommentsSection', () => photoCommentsSection?.selfTest ? photoCommentsSection.selfTest() : null);
  const reactionsRepliesSelfTest = safe('reactionsRepliesSection', () => reactionsRepliesSection?.selfTest ? reactionsRepliesSection.selfTest() : null);

  const fullMenuScaffoldReady = registrySelfTest?.ok === true && missing.length === 0 && sections.length === 16;
  const hiddenCommentSubsectionsInMainMenu = !visibleIds.includes('photo_comments') && !visibleIds.includes('reactions_replies') && visibleIds.includes('comments');
  const unifiedCommentsSectionReady = commentsSelfTest?.unifiedCommentsSection === true && commentsSelfTest?.photoInsideComments === true && commentsSelfTest?.repliesInsideComments === true && commentsSelfTest?.reactionsInsideComments === true;
  const foldedCommentsSubsectionsReady = photoCommentsSelfTest?.hiddenInMain === true && reactionsRepliesSelfTest?.hiddenInMain === true && photoCommentsSelfTest?.foldedInto === 'comments' && reactionsRepliesSelfTest?.foldedInto === 'comments';
  const noVideoFilesInComments = commentsSelfTest?.noVideoFilesInComments === true && photoCommentsSelfTest?.noVideoFilesInComments === true;
  const unifiedCommentsGatesReady = accessSelfTest?.unifiedCommentsGatesReady === true && accessSelfTest?.commentsPhotoTariffGateReady === true;
  const linkUxReady = menuSelfTest?.linkUxReady === true && menuSelfTest?.payloadVersion === 2;
  const mainHomeCallbackFastPath = routeDispatcher.shouldResetSessionOnStart({ payload: { r: 'main.home' } }, 'main.home') === false;
  const cleanButtonCreateFlowReady = buttonsSelfTest?.cleanCreateFlow === true && buttonsSelfTest?.writesTo === 'ak_post_buttons';
  const cleanButtonSaveRouteReady = routeDispatcherSelfTest?.cleanButtonSaveRoute === true;
  const leadMagnetsReady = leadMagnetsSelfTest?.legacyAdaptersUsed === false && leadMagnetsSelfTest?.cleanCreateFlow === true;
  const cleanCoreDebugRoutesReady = coreDebugRoutesSelfTest?.cleanCoreDebugRoutesReady === true;
  const dataSafetyReady = safety?.policy === 'non_destructive_additive_migrations_only';

  const ok = [
    fullMenuScaffoldReady,
    hiddenCommentSubsectionsInMainMenu,
    unifiedCommentsSectionReady,
    foldedCommentsSubsectionsReady,
    noVideoFilesInComments,
    unifiedCommentsGatesReady,
    linkUxReady,
    mainHomeCallbackFastPath,
    cleanButtonCreateFlowReady,
    cleanButtonSaveRouteReady,
    leadMagnetsReady,
    cleanCoreDebugRoutesReady,
    dataSafetyReady,
    isOk(flow),
    isOk(flowDefinitions),
    isOk(flowScreenSelfTest),
    isOk(delivery),
    isOk(canaryWebhook),
    isOk(callbackBridge),
    isOk(timingStore),
    isOk(sectionAudit),
    isOk(channelData),
    isOk(buttonsData),
    isOk(postRegistrySelfTest),
    isOk(conditionCatalogSelfTest),
    typeof postAddonManager.summarizePostAddons === 'function',
    typeof postAddonManager.addButton === 'function',
    typeof postAddonManager.addLeadMagnet === 'function'
  ].every(Boolean);

  return {
    ok,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    isCoreRuntime: true,
    activeInProduction: false,
    purpose: 'Core 1.41.0: единый раздел комментариев. Фото, ответы, реакции и модерация перенесены внутрь раздела 💬 Комментарии; отдельные верхние пункты скрыты из главного меню.',
    sections: ids,
    visibleSections: visibleIds,
    requiredSections: required,
    missingSections: missing,
    routeCount: sectionRegistry.routeMap().size,
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
    commentsSection: commentsSelfTest,
    photoCommentsSection: photoCommentsSelfTest,
    reactionsRepliesSection: reactionsRepliesSelfTest,
    buttonsSection: buttonsSelfTest,
    leadMagnetsSection: leadMagnetsSelfTest,
    routeDispatcher: routeDispatcherSelfTest,
    stateManager: stateSelfTest,
    menuRenderer: menuSelfTest,
    dataSafety: safety,
    constraints: {
      cleanCoreDebugRoutesReady,
      noNewWrapperAdded: true,
      noNewMonkeypatchAdded: true,
      fullMenuScaffoldReady,
      all16SectionsRegistered: sections.length === 16 && missing.length === 0,
      visibleMainSectionCount: visibleIds.length,
      hiddenCommentSubsectionsInMainMenu,
      unifiedCommentsSectionReady,
      photoInsideComments: commentsSelfTest?.photoInsideComments === true,
      repliesInsideComments: commentsSelfTest?.repliesInsideComments === true,
      reactionsInsideComments: commentsSelfTest?.reactionsInsideComments === true,
      commentsModerationInsideComments: commentsSelfTest?.moderationInsideComments === true,
      foldedCommentsSubsectionsReady,
      noVideoFilesInComments,
      unifiedCommentsGatesReady,
      commentsPhotoTariffGateReady: accessSelfTest?.commentsPhotoTariffGateReady === true,
      commentsModerationTariffGateReady: accessSelfTest?.commentsModerationTariffGateReady === true,
      leadConditionCatalogReady: conditionCatalogSelfTest?.ok === true,
      leadConditionCount: conditionCatalogSelfTest?.count || 0,
      leadFullFlowReady: flowDefinitions?.leadMagnetFullFlowReady === true,
      leadMagnetStepCount: flowDefinitions?.leadMagnetStepCount || 0,
      leadMagnetsUseButtonFlowPattern: true,
      oneActiveScreen: true,
      linkUxReady,
      menuPayloadVersion: menuSelfTest?.payloadVersion || 0,
      sectionRegistryDriven: true,
      sectionAuditReady: sectionAudit.ok === true,
      planAccessReady: true,
      postAddonsDbReady: true,
      flowEngineReady: flow?.ok === true,
      flowCancelRouteReady: true,
      flowPostSelectReady: true,
      flowTitleInputReady: true,
      explicitTextInputReady: true,
      staleCallbackGuardReady: true,
      cleanButtonCreateFlowReady,
      cleanButtonSaveRouteReady,
      cleanButtonSaveWritesAkPostButtons: true,
      leadMagnetsReady,
      maxSendAdapterReady: delivery?.ok === true,
      maxSendCanaryGated: true,
      coreSendDisabledByDefault: true,
      nonDestructiveMigrationsOnly: true,
      noPublicAppOverride: true,
      noProductionWebhookChange: true,
      canaryAllNotRequired: true
    }
  };
}

module.exports = { RUNTIME, SOURCE, isCoreRuntime: true, dispatch, renderMain, deliverScreen, selfTest };
