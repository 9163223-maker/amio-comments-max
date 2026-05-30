'use strict';

const path = require('path');
const walkthroughTrace = require('./admin-walkthrough-trace');
const uiTrace = require('./v3-ui-trace-1539');
const timing = require('./v3-ui-timing-cc8');
const botAudit = require('./admin-bot-audit-trace');

const RUNTIME = 'CC8.3.13-BOT-AUDIT-TRACE';
const STARTED_AT = new Date().toISOString();

function clean(value) { return String(value || '').trim(); }

function liveRuntime() {
  return clean(process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || RUNTIME) || RUNTIME;
}

function liveSourceMarker() {
  return clean(process.env.BUILD_SOURCE_MARKER) || 'adminkit-cc8-3-13-bot-audit-trace';
}

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

function safeInt(value, fallback = 100, min = 1, max = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.floor(n), max));
}

function take(list, limit) {
  return (Array.isArray(list) ? list : []).slice(0, limit);
}

function liveVersionPayload() {
  const runtimeVersion = liveRuntime();
  return {
    ok: true,
    runtimeVersion,
    buildVersion: runtimeVersion,
    displayVersion: runtimeVersion,
    packageVersion: runtimeVersion,
    sourceMarker: liveSourceMarker(),
    activeEntrypoint: clean(process.argv?.[1] ? path.basename(process.argv[1]) : process.env.ADMINKIT_CLEAN_ENTRYPOINT || 'unknown'),
    expectedRuntimeVersion: runtimeVersion,
    routeRuntimeVersion: RUNTIME,
    generatedAt: Date.now(),
    serverStartedAt: process.env.ADMINKIT_SERVER_STARTED_AT || STARTED_AT,
    staleEndpointDetected: false,
    debugVersionSource: 'live-env-override-before-index-routes',
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}

function install(app) {
  if (!app || app.__adminkitWalkthroughTraceRoutes) return app;
  app.__adminkitWalkthroughTraceRoutes = true;

  app.get('/debug/version', (req, res) => {
    noCache(res);
    return res.json(liveVersionPayload());
  });

  app.get('/debug/version-live', (req, res) => {
    noCache(res);
    return res.json(liveVersionPayload());
  });

  app.get('/debug/admin-walkthrough-trace', (req, res) => {
    noCache(res);
    const limit = safeInt(req.query?.limit || 100, 100, 1, 1000);
    const wt = walkthroughTrace.info();
    const ui = uiTrace.info ? uiTrace.info() : { events: uiTrace.list ? uiTrace.list() : [] };
    const tm = timing.info ? timing.info() : { events: timing.list ? timing.list() : [] };
    const audit = botAudit.info ? botAudit.info() : { events: [] };
    return res.json({
      ok: true,
      runtimeVersion: liveRuntime(),
      appRuntimeVersion: liveRuntime(),
      mode: 'admin-walkthrough-trace-combined',
      generatedAt: Date.now(),
      limit,
      walkthrough: {
        total: wt.total,
        summary: wt.summary,
        events: take(wt.events, limit)
      },
      uiTrace: {
        info: uiTrace.info ? uiTrace.info() : null,
        events: take(uiTrace.list ? uiTrace.list() : [], limit)
      },
      timing: {
        info: tm,
        summary: tm.summary || [],
        events: take(timing.list ? timing.list() : [], limit)
      },
      botAudit: {
        info: audit,
        summary: audit.summary || [],
        events: take(audit.events || [], limit)
      },
      safe: true,
      noDatabaseRead: true,
      noMaxApiCall: true
    });
  });

  app.get('/debug/admin-walkthrough-trace-clear', (req, res) => {
    noCache(res);
    walkthroughTrace.clear();
    if (uiTrace.clear) uiTrace.clear();
    if (timing.clear) timing.clear();
    if (botAudit.clear) botAudit.clear();
    return res.json({
      ok: true,
      runtimeVersion: liveRuntime(),
      appRuntimeVersion: liveRuntime(),
      mode: 'admin-walkthrough-trace-clear',
      cleared: ['walkthrough', 'uiTrace', 'timing', 'botAudit'],
      generatedAt: Date.now(),
      safe: true,
      noDatabaseRead: true,
      noMaxApiCall: true
    });
  });

  app.get('/debug/bot-audit-trace', (req, res) => {
    noCache(res);
    const limit = safeInt(req.query?.limit || 500, 500, 1, 1000);
    const audit = botAudit.info();
    return res.json({ ok: true, runtimeVersion: liveRuntime(), generatedAt: Date.now(), limit, total: audit.total, summary: audit.summary, events: take(audit.events, limit), safe: true, noDatabaseRead: true, noMaxApiCall: true });
  });

  app.get('/debug/bot-audit-trace-clear', (req, res) => {
    noCache(res);
    botAudit.clear();
    return res.json({ ok: true, runtimeVersion: liveRuntime(), mode: 'bot-audit-trace-clear', cleared: ['botAudit'], generatedAt: Date.now(), safe: true, noDatabaseRead: true, noMaxApiCall: true });
  });

  app.get('/debug/admin-walkthrough', (req, res) => {
    req.url = '/debug/admin-walkthrough-trace' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    return app._router.handle(req, res);
  });

  app.get('/debug/admin-walkthrough-clear', (req, res) => {
    req.url = '/debug/admin-walkthrough-trace-clear';
    return app._router.handle(req, res);
  });

  return app;
}

module.exports = { install, RUNTIME };
