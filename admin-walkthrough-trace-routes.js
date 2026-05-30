'use strict';

const walkthroughTrace = require('./admin-walkthrough-trace');
const uiTrace = require('./v3-ui-trace-1539');
const timing = require('./v3-ui-timing-cc8');

const RUNTIME = 'CC8.3.1-ADMIN-WALKTHROUGH-TRACE';

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

function safeInt(value, fallback = 100, min = 1, max = 300) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.floor(n), max));
}

function take(list, limit) {
  return (Array.isArray(list) ? list : []).slice(0, limit);
}

function install(app) {
  if (!app || app.__adminkitWalkthroughTraceRoutes) return app;
  app.__adminkitWalkthroughTraceRoutes = true;

  app.get('/debug/admin-walkthrough-trace', (req, res) => {
    noCache(res);
    const limit = safeInt(req.query?.limit || 100, 100);
    const wt = walkthroughTrace.info();
    const ui = uiTrace.info ? uiTrace.info() : { events: uiTrace.list ? uiTrace.list() : [] };
    const tm = timing.info ? timing.info() : { events: timing.list ? timing.list() : [] };
    return res.json({
      ok: true,
      runtimeVersion: RUNTIME,
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
    return res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      mode: 'admin-walkthrough-trace-clear',
      cleared: ['walkthrough', 'uiTrace', 'timing'],
      generatedAt: Date.now(),
      safe: true,
      noDatabaseRead: true,
      noMaxApiCall: true
    });
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
