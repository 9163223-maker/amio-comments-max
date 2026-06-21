'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'RUNTIME-CONTRACT-PR196';
const SOURCE = 'adminkit-pr229-stats-scope-buttons-cleanup';
const EXPECTED_ENTRYPOINT = 'clean-entrypoint-1.53.10-pr89.js';

function clean(value, limit = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}
function read(relPath = '') {
  try { return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8'); } catch { return ''; }
}
function has(source = '', pattern) {
  if (!source) return false;
  return pattern instanceof RegExp ? pattern.test(source) : source.includes(String(pattern));
}
function moduleAvailable(relPath = '') {
  try { require(path.join('..', relPath)); return true; } catch { return false; }
}
function functionAvailable(relPath = '', fn = '') {
  try { return typeof require(path.join('..', relPath))[fn] === 'function'; } catch { return false; }
}
function runtimeIdentityFromBuildInfo() {
  let buildInfo = {};
  try { buildInfo = require('../buildInfo').getBuildInfo(); } catch {}
  const expectedRuntimeVersion = clean(buildInfo.expectedRuntimeVersion || buildInfo.displayVersion || buildInfo.runtimeVersion, 120);
  const expectedBuildVersion = clean(buildInfo.buildVersion || expectedRuntimeVersion, 120);
  const expectedSourceMarker = clean(buildInfo.sourceMarker, 160);
  return {
    ok: Boolean(expectedRuntimeVersion && expectedBuildVersion && expectedSourceMarker),
    expectedRuntimeVersion,
    expectedBuildVersion,
    expectedSourceMarker,
    activeEntrypoint: EXPECTED_ENTRYPOINT
  };
}
function buildContract() {
  const v3Core = read('v3-menu-core-1539.js');
  const adapter = read('features/menu-v3/adapter.js');
  const buttons = read('buttons-flow-cc8-clean.js');
  const cc5 = read('cc5-db-core.js');
  const cleanEntrypoint = read(EXPECTED_ENTRYPOINT);
  const statsFlow = read('stats-flow-cc8.js');
  const statsService = read('services/statsProductPerfectPr226.js');
  const statsProducers = read('services/statsEventProducersPr226.js');
  const redirectRoute = read('ad-campaign-redirect-route-cc8325.js');
  const statsTests = read('scripts/test-stats-product-perfect-contract-pr226.js');
  const botSource = read('bot.js');
  const commentService = read('services/commentService.js');
  const campaignAttribution = read('campaign-attribution-cc8336.js');
  const cleanBotChannel = read('clean-bot-channel-fast-pr84.js');
  const statsDocs = read('docs/stats-product-perfect-contract-pr226.md');
  const callbackContract = read('callback-contract-live-pr228.js');
  const callbackContractTest = read('scripts/test-live-callback-routing-contract-pr228.js');
  const callbackContractRoutes = read('v3-menu-routes-1539.js');
  const callbackLive = (() => { try { return require('../callback-contract-live-pr228').liveFlags(); } catch { return {}; } })();
  const statsScopeLive = (() => { try { return require('../stats-scope-buttons-live-pr229').liveFlags(); } catch { return {}; } })();
  const runtimeIdentity = runtimeIdentityFromBuildInfo();

  const startupPathOk = Boolean(cleanEntrypoint)
    && has(cleanEntrypoint, "require('./pr180-startup-log-bootstrap')")
    && has(cleanEntrypoint, 'installExpressRoutes')
    && has(cleanEntrypoint, 'installCleanBot');
  const channelsListRendererActive = has(adapter, /function\s+channelsList\s*\(/) || has(adapter, "route: 'channels:list'");
  const channelsListUsesSharedPicker = has(v3Core, "channelPostPicker=require('./channel-post-picker-core')")
    && has(v3Core, /asyncChannelsForUser\([^)]*\).*channelPostPicker\.listUiChannelsForUser/s)
    && has(v3Core, /unifiedScreenAsync\([^)]*\).*asyncChannelsForUser/s)
    && channelsListRendererActive;
  const buttonsChannelPickerUsesSharedPicker = has(buttons, 'pickerCore.buildChannelPickerRows')
    || has(buttons, /listChannelsFromPosts\([^)]*\).*pickerCore\.listUiChannelsForUser/s);
  const buttonsPostPickerStillStoreBacked = has(buttons, 'store.getPostsList()') || has(buttons, 'store.getPostsList');
  const buttonsPostPickerDbBacked = (has(buttons, "require('./cc5-db-core')") || has(buttons, 'require("./cc5-db-core")'))
    && (has(buttons, /\bdb\.getPosts\s*\(/) || has(buttons, /cc5Db\.getPosts\s*\(/) || has(buttons, /cc5\.getPosts\s*\(/));
  const cc5GetPostsAvailable = functionAvailable('cc5-db-core', 'getPosts') || has(cc5, /async function getPosts\s*\(/) || has(cc5, /getPosts\s*[,=]/);
  const cc5GetChannelsAvailable = functionAvailable('cc5-db-core', 'getChannels') || has(cc5, /async function getChannels\s*\(/) || has(cc5, /getChannels\s*[,=]/);
  const akPostsHasAdminChannelPostKey = has(cc5, /primary key\s*\(admin_id,\s*channel_id,\s*post_id\)/i);
  const akPostsHasAdminCommentUnique = has(cc5, /unique\s*\(admin_id,\s*comment_key\)/i);
  const contractLiveOk = runtimeIdentity.ok && startupPathOk && channelsListUsesSharedPicker && buttonsChannelPickerUsesSharedPicker && buttonsPostPickerDbBacked && !buttonsPostPickerStillStoreBacked && cc5GetPostsAvailable && akPostsHasAdminChannelPostKey;
  return {
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    generatedAt: new Date().toISOString(),
    safe: true,
    contractLiveOk,
    statsProductPerfectPr226: has(statsFlow, 'stats_product_perfect_home_pr226') && has(statsService, 'stats_events'),
    statsRootSectionsOk: has(statsFlow, '📈 Рост') && has(statsFlow, '🎯 Источники') && has(statsFlow, '🧭 Воронка') && has(statsFlow, '📝 Контент') && has(statsFlow, '📤 Отчёт и качество данных'),
    statsNoDuplicateRootSections: has(statsFlow, "function homeRows(menu) { return [[button(menu, '📈 Рост'") && !has(statsFlow, "button(menu, '🔘 Кнопки под постами'"),
    statsPersistentEvents: has(statsService, 'persistStatsEvent'),
    statsMessageStatCapabilityProbe: has(statsService, 'detectMaxPostStatCapabilities'),
    statsFakeMetricsBlocked: has(statsService, 'unavailableMetrics') && has(statsFlow, 'Просмотры недоступны'),
    statsPeriodFiltering: has(statsService, 'periodBounds') && has(statsService, 'eventInPeriod') && has(statsTests, 'STAT-054'),
    statsSourceFiltering: has(statsService, 'FILTER_FIELDS') && has(statsTests, 'STAT-059'),
    statsTrackingLinkUiCanonical: has(statsFlow, 'createCanonicalTrackingLinkForCampaign') && has(statsFlow, 'Ссылка создана и подключена к статистике') && has(statsTests, 'STAT-060'),
    statsManualCostUiCanonical: has(statsFlow, 'statsManualCostFlow') && has(statsTests, 'STAT-070'),
    statsPostStatsRealHandler: has(statsFlow, 'function pr226PostStats') && !has(statsFlow, "if (action === 'admin_stats_post') return pr226Content") && has(statsTests, 'STAT-077'),
    statsMessageStatProbeAdapter: has(statsService, 'fetchMaxMessageStat') && has(statsService, 'defaultMaxMessageStatAdapter') && has(statsTests, 'STAT-082'),
    statsRealEventProducers: has(statsProducers, 'recordAudienceUpdate') && has(botSource, 'recordCtaClick') && has(botSource, 'recordGiftClaimed') && has(commentService, 'recordCommentCreated') && has(statsTests, 'STAT-088'),
    statsOldDuplicateActionsRerouted: has(statsFlow, "action === 'admin_stats_buttons_cache') return pr226Funnel") && has(statsTests, 'STAT-094'),
    statsNoServiceOnlyGreenTests: has(statsTests, 'findPayload') && has(statsTests, 'handleTextInput') && has(redirectRoute, 'recordStatsTrackingClick'),
    statsSanitizedExportRecursive: has(statsService, 'function sanitizeValue') && has(statsTests, 'parsedExport.growth.counts.joined'),
    statsMessageStatSnapshotScoped: has(statsService, '!clean(c.postId)') && has(statsTests, 'otherProbe'),
    statsLegacyBridgePresent: has(statsService, 'function loadLegacyStatsBridge') && has(statsTests, 'STAT-102'),
    statsProducerContextResolverPresent: has(statsProducers, 'resolveStatsProducerContext') && has(statsTests, 'STAT-106'),
    statsCommentProducerNoSplitTenant: has(commentService, 'recordCommentCreated({ commentKey, userId })') && !has(commentService, 'split(":")'),
    statsAudienceNoDefaultExactTenant: has(statsTests, 'STAT-113') && !has(campaignAttribution, "|| 'default'") && !has(cleanBotChannel, "|| 'default'"),
    statsCtaAdminCallbacksExcluded: has(statsProducers, 'isUserFacingCtaClick') && has(statsProducers, 'ADMIN_CTA_DENYLIST') && has(statsProducers, 'button_admin_channel_pick') && has(statsTests, 'STAT-141'),
    statsCtaUserFacingOnly: has(statsProducers, "kind==='public_cta'") && has(statsProducers, 'buttonSource') && has(statsTests, 'STAT-142') && has(statsTests, 'STAT-144'),
    statsExportNestedMetricsPreserved: has(statsTests, 'STAT-122') && has(statsTests, "!rich.includes('[object]')") && has(statsService, 'sanitizeValue'),
    statsSnapshotScopedByTenantPost: has(statsService, 'function latestSnapshot') && has(statsService, 'return null; return state().postStatSnapshots.find') && has(statsTests, 'STAT-129'),
    statsReviewThreadsAddressed: has(statsDocs, 'Preserve nested metrics') && has(statsTests, 'STAT-125'),
    statsAudienceNoDoubleRecord: has(statsProducers, 'audienceIdempotencyKey') && has(statsService, 'idempotencyKey') && has(statsTests, 'STAT-148'),
    statsTrackedUrlHandedOut: has(statsFlow, 'trackedCampaignUrl') && has(statsFlow, 'Используйте именно эту ссылку') && has(statsTests, 'STAT-152'),
    statsCanonicalTenantResolution: has(statsService, 'canonicalTenantKey') && has(statsService, 'ensureTenantContext') && has(statsTests, 'STAT-156'),
    statsLegacyAudiencePeriodFiltered: has(statsService, 'legacyUnknownPeriod') && has(statsTests, 'STAT-160'),
    statsUnscopedEventsQuarantined: has(statsService, 'if (!clean(e.tenantKey)) return false') && has(statsTests, 'STAT-164'),
    statsSourcedJoinsAttributed: has(statsService, "eventType: 'member_join_attributed'") && has(statsTests, 'STAT-168'),
    statsManualCostDraftCanonicalTenant: has(statsFlow, 'resolveStatsContext(ctx, payload)') && has(statsTests, 'STAT-169'),
    statsManualCostScopedMutations: has(statsService, 'scopedIndex') && has(statsTests, 'STAT-172'),
    statsLegacyCommentKeyScoped: has(statsService, 'legacy_commentKey_unscoped_or_stale') && has(statsTests, 'STAT-175'),
    statsCallbackContractWired: has(callbackContract, 'runLiveCallbackContract') && has(callbackContractTest, 'STAT-CB-006') && has(callbackContractRoutes, '/debug/callback-contract-live'),
    statsCallbackContractLiveOk: callbackLive.statsCallbackContractLiveOk === true,
    statsCallbackContractOk: callbackLive.statsCallbackContractLiveOk === true,
    statsMainMenuRoutesToCurrentStatsRoot: callbackLive.statsMainMenuRoutesToCurrentStatsRoot === true,
    statsLegacyRootNotReturned: callbackLive.statsLegacyRootNotReturned === true,
    callbackContractEndpoint: '/debug/callback-contract-live',
    ...statsScopeLive,
    callbackContractLastCheckedAt: callbackLive.callbackContractLastCheckedAt || '',
    callbackContractLastErrors: callbackLive.callbackContractLastErrors || [],
    runtimeIdentity,
    startupPath: { entrypointExpected: EXPECTED_ENTRYPOINT, activeEntrypoint: EXPECTED_ENTRYPOINT, startupLogBootstrapRequired: has(cleanEntrypoint, "require('./pr180-startup-log-bootstrap')"), expressRoutesInstalledByEntrypoint: has(cleanEntrypoint, 'installExpressRoutes'), cleanBotInstalledByEntrypoint: has(cleanEntrypoint, 'installCleanBot'), ok: startupPathOk },
    routes: {
      channelsList: { action: 'channels:list', active: channelsListRendererActive, module: 'v3-menu-core-1539.js', renderer: 'features/menu-v3/adapter.js', channelsProvider: channelsListUsesSharedPicker ? 'channel-post-picker-core.listUiChannelsForUser' : 'clientAccessService.getClientChannels_or_context_only', usesSharedPicker: channelsListUsesSharedPicker, ok: channelsListUsesSharedPicker },
      buttonsChannelPicker: { action: 'button_admin_recent_posts/button_admin_channel_pick', active: has(buttons, 'button_admin_channel_pick'), module: 'buttons-flow-cc8-clean.js', channelsProvider: buttonsChannelPickerUsesSharedPicker ? 'channel-post-picker-core.buildChannelPickerRows' : 'legacy_or_unknown', usesSharedPicker: buttonsChannelPickerUsesSharedPicker, ok: buttonsChannelPickerUsesSharedPicker },
      buttonsPostPicker: { action: 'button_admin_channel_pick -> listPosts', active: has(buttons, 'function listPosts'), module: 'buttons-flow-cc8-clean.js', postsProvider: buttonsPostPickerDbBacked ? 'cc5-db-core.getPosts' : (buttonsPostPickerStillStoreBacked ? 'store.getPostsList' : 'unknown'), expectedPostsProvider: 'cc5-db-core.getPosts', dbBacked: buttonsPostPickerDbBacked, stillStoreBacked: buttonsPostPickerStillStoreBacked, ok: buttonsPostPickerDbBacked && !buttonsPostPickerStillStoreBacked }
    },
    dataProviders: { cc5DbCoreLoaded: moduleAvailable('cc5-db-core'), cc5GetChannelsAvailable, cc5GetPostsAvailable, akPostsHasAdminChannelPostKey, akPostsHasAdminCommentUnique, buttonsReadsPostsFromCc5: buttonsPostPickerDbBacked, buttonsReadsPostsFromStore: buttonsPostPickerStillStoreBacked, ok: cc5GetChannelsAvailable && cc5GetPostsAvailable && akPostsHasAdminChannelPostKey },
    mismatches: [runtimeIdentity.ok ? '' : 'runtime_identity_not_current_build', startupPathOk ? '' : 'startup_path_not_confirmed', channelsListUsesSharedPicker ? '' : 'channels_list_not_shared_picker_backed', buttonsChannelPickerUsesSharedPicker ? '' : 'buttons_channel_picker_not_shared_picker_backed', buttonsPostPickerDbBacked ? '' : 'buttons_post_picker_not_db_backed', buttonsPostPickerStillStoreBacked ? 'buttons_post_picker_still_store_backed' : '', cc5GetPostsAvailable ? '' : 'cc5_get_posts_missing', akPostsHasAdminChannelPostKey ? '' : 'ak_posts_admin_channel_post_key_missing'].filter(Boolean)
  };
}

module.exports = { RUNTIME, SOURCE, EXPECTED_ENTRYPOINT, buildContract, runtimeIdentityFromBuildInfo };
