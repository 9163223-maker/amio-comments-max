'use strict';

const ads = require('./services/adCampaignService');
const statsPr226 = require('./services/statsProductPerfectPr226');

const RUNTIME = 'CC8.3.25-ADS-TRACKING-LINKS';

function clean(value) { return String(value || '').trim(); }
function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}
function baseUrl(config = {}) {
  return clean(config.appBaseUrl || config.publicBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
}
function safeQuery(req = {}) {
  const out = { ...((req && req.query) || {}) };
  // Не даём внешнему query-параметру подменить цель редиректа.
  delete out.target;
  delete out.url;
  delete out.redirect;
  delete out.to;
  return out;
}
function userIdFromQuery(req = {}) {
  const q = (req && req.query) || {};
  return clean(q.userId || q.user_id || q.uid || q.u || '');
}
function sendJson(res, status, payload) {
  noCache(res);
  return res.status(status).type('application/json').send(JSON.stringify(payload, null, 2));
}
function recordStatsTrackingClick(result = {}, req = {}, slug = '') {
  const c = result.campaign || result.item || result || {};
  const tenantKey = clean(c.tenantKey || c.ownerUserId || c.createdByUserId || '');
  const ownerUserId = clean(c.ownerUserId || c.createdByUserId || '');
  const linkId = clean(c.id || c.linkId || slug);
  return statsPr226.trackLinkClick({ tenantKey, ownerUserId, channelId: clean(c.channelId) }, {
    linkId, slug, userId: userIdFromQuery(req), source: clean(c.source), medium: clean(c.medium), campaign: clean(c.campaign || c.name), content: clean(c.content || c.ad), term: clean(c.term || c.placement),
    confidence: tenantKey ? 'exact' : 'unavailable', payload: { query: safeQuery(req), slug }
  });
}
function redirectHandler(req, res) {
  const slug = clean(req && req.params && req.params.slug);
  noCache(res);
  try {
    const result = ads.recordCampaignClick({
      slug,
      userId: userIdFromQuery(req),
      query: safeQuery(req),
      config: { appBaseUrl: baseUrl() }
    });
    if (result && result.ok !== false) { try { recordStatsTrackingClick(result, req, slug); } catch {} }
    if (!result || result.ok === false || !result.targetUrl) {
      return sendJson(res, 404, {
        ok: false,
        runtimeVersion: RUNTIME,
        error: clean(result && result.reason) || 'campaign_not_found_or_target_missing',
        slug,
        safe: true,
        noCache: true
      });
    }
    return res.redirect(302, result.targetUrl);
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      runtimeVersion: RUNTIME,
      error: clean(error && error.message || error) || 'campaign_redirect_failed',
      slug,
      safe: true,
      noCache: true
    });
  }
}
function install(app) {
  if (!app || app.__adminkitCampaignRedirectRoute8325) return app;
  app.__adminkitCampaignRedirectRoute8325 = true;
  app.get('/r/:slug', redirectHandler);
  app.get('/debug/campaign-redirect-route', (req, res) => sendJson(res, 200, {
    ok: true,
    runtimeVersion: RUNTIME,
    route: '/r/:slug',
    policy: 'records campaign click and redirects to the saved MAX invite/public URL; query cannot override target URL',
    safe: true,
    noCache: true
  }));
  return app;
}

module.exports = { RUNTIME, install, redirectHandler, recordStatsTrackingClick };
