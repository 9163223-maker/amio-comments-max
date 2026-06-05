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

const RUNTIME = 'CC8.3.50-PR131-LIVE-SYNC-AUDIT-ROUTES';
const STARTED_AT = new Date().toISOString();

function clean(value) { return String(value || '').trim(); }
function liveRuntime() { return clean(process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || RUNTIME) || RUNTIME; }
function liveSourceMarker() { return clean(process.env.BUILD_SOURCE_MARKER) || 'adminkit-cc8-3-50-pr131-live-sync-audit-5a39d1f'; }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0', 'Surrogate-Control': 'no-store' }); } catch {} }
function safeInt(value, fallback = 100, min = 1, max = 1000) { const n = Number(value); if (!Number.isFinite(n)) return fallback; return Math.max(min, Math.min(Math.floor(n), max)); }
function take(list, limit) { return (Array.isArray(list) ? list : []).slice(0, limit); }
function publicBase() { return clean(config.appBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || ''); }
function safeRedirectTarget(value = '') { const raw = clean(value); if (!/^https?:\/\//i.test(raw)) return ''; return raw; }
function resolveTrackingUserId(req) { return clean(req.query?.userId || req.query?.uid || req.query?.u || ''); }
function eventLite(event = {}) { return { type: clean(event.type), channelId: clean(event.channelId), userId: clean(event.userId), displayName: clean(event.displayName || event.username || [event.firstName, event.lastName].filter(Boolean).join(' ') || event.userId || 'Пользователь'), source: clean(event.source), attribution: event.attribution || {}, createdAt: event.createdAt || 0 }; }
function liveVersionPayload() { const build = getBuildInfo(); const runtimeVersion = liveRuntime() || build.runtimeVersion; return { ok: true, runtimeVersion, buildVersion: build.buildVersion || runtimeVersion, displayVersion: build.displayVersion || runtimeVersion, packageVersion: build.packageVersion || runtimeVersion, sourceMarker: liveSourceMarker() || build.sourceMarker, gitCommit: build.gitCommit, pr131MergeCommit: build.pr131MergeCommit, activeEntrypoint: clean(process.argv?.[1] ? path.basename(process.argv[1]) : process.env.ADMINKIT_CLEAN_ENTRYPOINT || build.activeEntrypoint || 'unknown'), expectedRuntimeVersion: build.expectedRuntimeVersion || runtimeVersion, routeRuntimeVersion: RUNTIME, routeRuntimeCurrent: true, generatedAt: Date.now(), serverStartedAt: process.env.ADMINKIT_SERVER_STARTED_AT || build.serverStartedAt || STARTED_AT, staleEndpointDetected: runtimeVersion !== (build.expectedRuntimeVersion || runtimeVersion), debugVersionSource: 'live-env-plus-build-info-pr131-audit', commentsMatrixSelftest: true, productionCommentsMatrixProbe: true, commentsTimingTraceV2: true, pr97ReconciledOnCc8344: true, autoTenantChannelBind: true, tenantChannelBinding: true, channelTitleResolver: true, hybridChannelRegistry: true, getChatChannelTitles: true, campaignAttributionSupported: true, trackingLinksSupported: true, clckShortLinksSupported: true, campaignRedirectRoute: '/r/:slug', safe: true, noDatabaseRead: true, noMaxApiCall: true }; }

function install(app) {
  if (!app || app.__adminkitWalkthroughTraceRoutes) return app;
  app.__adminkitWalkthroughTraceRoutes = true;

  app.get('/debug/version', (req, res) => { noCache(res); return res.json(liveVersionPayload()); });
  app.get('/debug/version-live', (req, res) => { noCache(res); return res.json(liveVersionPayload()); });

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
