'use strict';

const path = require('path');
const walkthroughTrace = require('./admin-walkthrough-trace');
const uiTrace = require('./v3-ui-trace-1539');
const timing = require('./v3-ui-timing-cc8');
const botAudit = require('./admin-bot-audit-trace');
const statsMonitoring = require('./stats-monitoring-service');
const growthService = require('./services/growthService');
const adCampaigns = require('./services/adCampaignService');
const store = require('./store');
const config = require('./config');
const { getBuildInfo } = require('./buildInfo');
const liveIdentity = require('./services/liveIdentityService');
const menu = require('./v3-menu-core-1539');

const RUNTIME = 'CC8.3.51-PR165-PUSH-RUNTIME-WIRED-ROUTES';
const STARTED_AT = new Date().toISOString();

function clean(value) { return String(value || '').trim(); }
function liveRuntime() { return clean(process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || RUNTIME) || RUNTIME; }
function liveSourceMarker() { return clean(process.env.BUILD_SOURCE_MARKER) || 'adminkit-pr165-push-runtime-wired'; }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0', 'Surrogate-Control': 'no-store' }); } catch {} }
function safeInt(value, fallback = 100, min = 1, max = 1000) { const n = Number(value); if (!Number.isFinite(n)) return fallback; return Math.max(min, Math.min(Math.floor(n), max)); }
function take(list, limit) { return (Array.isArray(list) ? list : []).slice(0, limit); }
function publicBase() { return clean(config.appBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || ''); }
function safeRedirectTarget(value = '') { const raw = clean(value); if (!/^https?:\/\//i.test(raw)) return ''; return raw; }
function resolveTrackingUserId(req) { return clean(req.query?.userId || req.query?.uid || req.query?.u || ''); }
function eventLite(event = {}) { return { type: clean(event.type), channelId: clean(event.channelId), userId: clean(event.userId), displayName: clean(event.displayName || event.username || [event.firstName, event.lastName].filter(Boolean).join(' ') || event.userId || 'Пользователь'), source: clean(event.source), attribution: event.attribution || {}, createdAt: event.createdAt || 0 }; }

function requireDebugAdmin(req, res) {
  if (clean(req.query?.token) === 'admin') return true;
  res.status(403).json({ ok: false, error: 'admin_token_required' });
  return false;
}
function buttonLabels(attachments = []) {
  const buttons = [];
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const rows = attachment?.payload?.buttons || attachment?.buttons || [];
    for (const row of Array.isArray(rows) ? rows : []) {
      for (const btn of Array.isArray(row) ? row : [row]) {
        const label = clean(btn?.text || btn?.label || btn?.title);
        if (label) buttons.push(label.slice(0, 80));
      }
    }
  }
  return buttons.slice(0, 40);
}
function routeProbeSource(action = '', screen = null) {
  const id = clean(screen?.id);
  if (action === 'gifts:home' && /gift|gifts/i.test(id)) return 'canonical_root';
  return 'canonical_or_menu_router';
}
function summarizeSetupState(userId = '') {
  const state = store.getSetupState(clean(userId)) || {};
  const giftFlow = state.giftFlow || null;
  const adminUi = state.adminUi || {};
  const activeAdminUi = state.activeAdminUi || {};
  const selected = state.selectedCard || state.selectedPost || state.commentTargetPost || state.giftTargetPost || state.giftsCurrentCard || null;
  return {
    userId: clean(userId),
    activeAdminFlowKind: clean(state.activeAdminFlowKind),
    adminUi: { section: clean(adminUi.section || state.adminUiSection) },
    activeAdminUi: { section: clean(activeAdminUi.section || state.activeAdminUiSection) },
    giftFlow: {
      exists: Boolean(giftFlow),
      mode: clean(giftFlow?.mode),
      stepIndex: Number.isFinite(Number(giftFlow?.stepIndex)) ? Number(giftFlow.stepIndex) : null,
      awaitingConfirmation: Boolean(giftFlow?.awaitingConfirmation)
    },
    giftsCurrentCard: { exists: Boolean(state.giftsCurrentCard) },
    giftTargetPost: { exists: Boolean(state.giftTargetPost) },
    selectedCard: {
      exists: Boolean(selected),
      source: selected === state.giftTargetPost ? 'giftTargetPost' : (selected === state.commentTargetPost ? 'commentTargetPost' : (selected === state.giftsCurrentCard ? 'giftsCurrentCard' : (selected ? 'selectedCard' : ''))),
      hasChannel: Boolean(selected?.channelId),
      hasPost: Boolean(selected?.postId),
      hasCommentKey: Boolean(selected?.commentKey),
      title: clean(selected?.title || selected?.postTitle || selected?.channelTitle || '').slice(0, 80)
    },
    updatedAt: clean(state.updatedAt || state.updated_at || giftFlow?.updatedAt || '')
  };
}

function liveVersionPayload() { const build = getBuildInfo(); const identity = liveIdentity.identity(); const runtimeVersion = liveRuntime() || build.runtimeVersion; const warning = liveIdentity.warningForExpected('', identity.gitCommit); return { ok: true, runtimeVersion, buildVersion: identity.buildVersion || build.buildVersion || runtimeVersion, displayVersion: identity.displayVersion || build.displayVersion || runtimeVersion, packageVersion: identity.packageVersion || build.packageVersion || runtimeVersion, sourceMarker: identity.sourceMarker || liveSourceMarker() || build.sourceMarker, gitCommit: identity.gitCommit || build.gitCommit, pr131MergeCommit: build.pr131MergeCommit, activeEntrypoint: identity.activeEntrypoint || clean(process.argv?.[1] ? path.basename(process.argv[1]) : process.env.ADMINKIT_CLEAN_ENTRYPOINT || build.activeEntrypoint || 'unknown'), activeBotModule: identity.activeBotModule, expectedRuntimeVersion: build.expectedRuntimeVersion || runtimeVersion, routeRuntimeVersion: RUNTIME, routeRuntimeCurrent: true, generatedAt: Date.now(), serverStartedAt: identity.serverStartedAt || process.env.ADMINKIT_SERVER_STARTED_AT || build.serverStartedAt || STARTED_AT, staleEndpointDetected: runtimeVersion !== (build.expectedRuntimeVersion || runtimeVersion), warning: warning || undefined, liveIdentity: identity, latestWebhookIdentity: liveIdentity.latestWebhookIdentity(), latestAdminCallback: liveIdentity.latestAdminCallback(), debugVersionSource: 'live-identity-service-pr141', commentsMatrixSelftest: true, productionCommentsMatrixProbe: true, commentsTimingTraceV2: true, pr97ReconciledOnCc8344: true, autoTenantChannelBind: true, tenantChannelBinding: true, channelTitleResolver: true, hybridChannelRegistry: true, getChatChannelTitles: true, campaignAttributionSupported: true, trackingLinksSupported: true, clckShortLinksSupported: true, campaignRedirectRoute: '/r/:slug', safe: true, noDatabaseRead: true, noMaxApiCall: true }; }

function install(app) {
  if (!app || app.__adminkitWalkthroughTraceRoutes) return app;
  app.__adminkitWalkthroughTraceRoutes = true;

  app.get('/debug/version', (req, res) => { noCache(res); return res.json(liveVersionPayload()); });
  app.get('/debug/version-live', (req, res) => { noCache(res); return res.json(liveVersionPayload()); });



  app.get('/debug/live-identity', (req, res) => {
    noCache(res);
    if (!requireDebugAdmin(req, res)) return;
    return res.json(liveIdentity.buildDiagnostic({ expectedCommit: req.query?.expectedCommit || '' }));
  });

  app.get('/debug/live-route-probe', async (req, res) => {
    noCache(res);
    if (!requireDebugAdmin(req, res)) return;
    const action = clean(req.query?.action || '');
    const userId = clean(req.query?.userId || '');
    if (!action) return res.status(400).json({ ok: false, probeSupported: false, error: 'action_required', liveIdentity: liveIdentity.fingerprint() });
    const safeProbeActions = new Set(['gifts:home', 'admin_section_gifts', 'admin_section_buttons', 'admin_section_comments', 'admin_section_posts', 'admin_section_stats', 'admin_section_archive', 'admin_section_polls', 'admin_section_highlights']);
    if (!safeProbeActions.has(action)) {
      return res.json({ ok: true, probeSupported: false, action, explanation: 'Only known non-destructive root/menu actions are supported by this live route probe.', liveIdentity: liveIdentity.fingerprint(), safe: true, noMaxApiCall: true });
    }
    try {
      let screen = null;
      let handler = 'v3-menu-core-1539.screenForPayload';
      if (typeof menu.asyncScreenForPayload === 'function') {
        screen = await menu.asyncScreenForPayload({ action }, { userId, config });
        handler = 'v3-menu-core-1539.asyncScreenForPayload';
      } else if (typeof menu.screenForPayload === 'function') {
        screen = menu.screenForPayload({ action });
      }
      if (!screen) return res.json({ ok: true, probeSupported: false, action, explanation: 'No non-destructive screen resolver returned a screen for this action.', liveIdentity: liveIdentity.fingerprint(), safe: true, noMaxApiCall: true });
      return res.json({ ok: true, probeSupported: true, action, userId, resolved: { screenId: clean(screen.id), visibleButtonLabels: buttonLabels(screen.attachments), handler, module: 'v3-menu-core-1539', routeSource: routeProbeSource(action, screen), canonicalRoot: routeProbeSource(action, screen) === 'canonical_root', resumedFlow: false }, liveIdentity: liveIdentity.fingerprint(), safe: true, noMaxApiCall: true });
    } catch (error) {
      return res.json({ ok: true, probeSupported: false, action, explanation: String(error && error.message || error).slice(0, 220), liveIdentity: liveIdentity.fingerprint(), safe: true, noMaxApiCall: true });
    }
  });

  app.get('/debug/live-user-state', (req, res) => {
    noCache(res);
    if (!requireDebugAdmin(req, res)) return;
    const userId = clean(req.query?.userId || '');
    if (!userId) return res.status(400).json({ ok: false, error: 'userId_required' });
    return res.json({ ok: true, state: summarizeSetupState(userId), liveIdentity: liveIdentity.fingerprint(), sanitized: true, safe: true, noMaxApiCall: true });
  });

  app.get('/debug/admin-walkthrough-trace', (req, res) => {
    noCache(res);
    const limit = safeInt(req.query?.limit || 100, 100, 1, 1000);
    const wt = walkthroughTrace.info();
    const ui = uiTrace.info ? uiTrace.info() : { events: uiTrace.list ? uiTrace.list() : [] };
    const tm = timing.info ? timing.info() : { events: timing.list ? timing.list() : [] };
    const audit = botAudit.info ? botAudit.info() : { events: [] };
    return res.json({ ok: true, runtimeVersion: liveRuntime(), appRuntimeVersion: liveRuntime(), mode: 'admin-walkthrough-trace-combined', generatedAt: Date.now(), limit, walkthrough: { total: wt.total, summary: wt.summary, events: take(wt.events, limit) }, uiTrace: { info: uiTrace.info ? uiTrace.info() : null, events: take(uiTrace.list ? uiTrace.list() : [], limit) }, timing: { info: tm, summary: tm.summary || [], events: take(timing.list ? timing.list() : [], limit) }, botAudit: { info: audit, summary: audit.summary || [], events: take(audit.events || [], limit) }, safe: true, noDatabaseRead: true, noMaxApiCall: true });
  });

  app.get('/debug/admin-walkthrough-trace-clear', (req, res) => {
    noCache(res);
    walkthroughTrace.clear();
    if (uiTrace.clear) uiTrace.clear();
    if (timing.clear) timing.clear();
    if (botAudit.clear) botAudit.clear();
    return res.json({ ok: true, runtimeVersion: liveRuntime(), appRuntimeVersion: liveRuntime(), mode: 'admin-walkthrough-trace-clear', cleared: ['walkthrough', 'uiTrace', 'timing', 'botAudit'], generatedAt: Date.now(), safe: true, noDatabaseRead: true, noMaxApiCall: true });
  });

  app.get('/debug/bot-audit-trace', (req, res) => { noCache(res); const limit = safeInt(req.query?.limit || 500, 500, 1, 1000); const audit = botAudit.info(); return res.json({ ok: true, runtimeVersion: liveRuntime(), generatedAt: Date.now(), limit, total: audit.total, summary: audit.summary, events: take(audit.events, limit), safe: true, noDatabaseRead: true, noMaxApiCall: true }); });
  app.get('/debug/bot-audit-trace-clear', (req, res) => { noCache(res); botAudit.clear(); return res.json({ ok: true, runtimeVersion: liveRuntime(), mode: 'bot-audit-trace-clear', cleared: ['botAudit'], generatedAt: Date.now(), safe: true, noDatabaseRead: true, noMaxApiCall: true }); });

  app.get('/debug/stats-monitoring-selftest', (req, res) => { noCache(res); return res.json({ ...statsMonitoring.selftest(), campaignLinks: adCampaigns.selftest({ ...config, appBaseUrl: publicBase() || config.appBaseUrl }), appRuntimeVersion: liveRuntime() }); });
  app.get('/debug/campaign-links-selftest', (req, res) => { noCache(res); return res.json({ ...adCampaigns.selftest({ ...config, appBaseUrl: publicBase() || config.appBaseUrl }), runtimeVersion: liveRuntime(), campaigns: adCampaigns.listCampaigns('').map((item) => ({ id: item.id, slug: item.slug, name: item.name, source: item.source, channelTitle: item.channelTitle, url: adCampaigns.campaignUrl(item, { ...config, appBaseUrl: publicBase() || config.appBaseUrl }) })).slice(0, 20) }); });

  app.get('/debug/stats-monitoring-live', (req, res) => {
    noCache(res);
    const snapshot = statsMonitoring.buildMonitoringSnapshot({ userId: clean(req.query?.userId || '') });
    const campaigns = adCampaigns.listCampaigns('').slice(0, 20).map((item) => ({ id: item.id, slug: item.slug, name: item.name, source: item.source, channelId: item.channelId, channelTitle: item.channelTitle, url: adCampaigns.campaignUrl(item, { ...config, appBaseUrl: publicBase() || config.appBaseUrl }), stats: adCampaigns.statsForCampaign(item) }));
    return res.json({ ok: true, runtimeVersion: liveRuntime(), generatedAt: Date.now(), counts: snapshot.counts, dataQuality: snapshot.dataQuality, campaigns, attribution: { clicks: snapshot.attribution.clicks, confirmedTotal: snapshot.attribution.confirmedTotal, probableTotal: snapshot.attribution.probableTotal, unknown: snapshot.attribution.unknown, sources: snapshot.attribution.sources, joinedEvents: (snapshot.attribution.joinedEvents || []).length, leftEvents: (snapshot.attribution.leftEvents || []).length, recentJoined: (snapshot.attribution.recentJoined || []).map(eventLite), recentLeft: (snapshot.attribution.recentLeft || []).map(eventLite) }, topPosts: snapshot.topPosts.map((item) => ({ title: item.title, comments: item.comments, clicks: item.clicks, votes: item.votes, reactions: item.reactions, score: item.score })).slice(0, 5), safe: true, noMaxApiCall: true });
  });

  app.get('/r/:slug', (req, res) => {
    const slug = clean(req.params.slug);
    const result = adCampaigns.recordCampaignClick({ slug, userId: resolveTrackingUserId(req), query: req.query || {}, config: { ...config, appBaseUrl: publicBase() || config.appBaseUrl } });
    botAudit.log('campaign.click_tracked', { slug, ok: Boolean(result.ok), campaign: result.campaign?.name || '', source: result.campaign?.source || '', channelId: result.campaign?.channelId || '', userId: resolveTrackingUserId(req), target: result.targetUrl || '', reason: result.reason || '' });
    if (!result.ok) return res.status(404).send('Campaign link not found');
    return res.redirect(302, safeRedirectTarget(result.targetUrl) || config.maxDeepLinkBase || config.appBaseUrl || '/');
  });

  app.get('/go/:channelId/:buttonId', (req, res, next) => {
    const channelId = clean(req.params.channelId);
    const buttonId = clean(req.params.buttonId);
    if (!channelId || !buttonId) return next();
    const targetOverride = safeRedirectTarget(req.query?.target || '');
    const buttonTextOverride = clean(req.query?.buttonText || '');
    const source = clean(req.query?.source || req.query?.utm_source || 'button') || 'button';
    const result = growthService.recordGrowthClick({ channelId, buttonId, postId: clean(req.query?.postId || ''), commentKey: store.normalizeKey(req.query?.commentKey || ''), userId: resolveTrackingUserId(req), config: { ...config, appBaseUrl: publicBase() || config.appBaseUrl }, source, buttonTextOverride, targetUrlOverride: targetOverride, campaign: clean(req.query?.campaign || ''), ad: clean(req.query?.ad || ''), placement: clean(req.query?.placement || ''), ref: clean(req.query?.ref || ''), sourceRef: clean(req.query?.sourceRef || req.query?.ref || ''), utmSource: clean(req.query?.utm_source || ''), utmMedium: clean(req.query?.utm_medium || ''), utmCampaign: clean(req.query?.utm_campaign || ''), utmContent: clean(req.query?.utm_content || ''), utmTerm: clean(req.query?.utm_term || '') });
    botAudit.log('growth.click_tracked', { channelId, buttonId, source, campaign: req.query?.campaign || req.query?.utm_campaign || '', ad: req.query?.ad || req.query?.utm_content || '', placement: req.query?.placement || '', userId: resolveTrackingUserId(req), target: targetOverride || result.targetUrl || '' });
    const redirectUrl = targetOverride || result.targetUrl || config.maxDeepLinkBase || config.appBaseUrl || '/';
    return res.redirect(302, redirectUrl);
  });

  app.get('/debug/admin-walkthrough', (req, res) => { req.url = '/debug/admin-walkthrough-trace' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''); return app._router.handle(req, res); });
  app.get('/debug/admin-walkthrough-clear', (req, res) => { req.url = '/debug/admin-walkthrough-trace-clear'; return app._router.handle(req, res); });
  return app;
}

module.exports = { install, RUNTIME };
