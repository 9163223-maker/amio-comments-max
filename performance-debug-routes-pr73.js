'use strict';

const timing = require('./v3-ui-timing-cc8');
const postPatcher = require('./services/postPatcher');

const RUNTIME = 'CC8.1.14-PERFORMANCE-TRACE-PR73';
const MINI_LIMIT = 100;
const miniEvents = [];

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
}
function send(res, payload, status) {
  noCache(res);
  res.status(status || 200).type('application/json').send(JSON.stringify(payload, null, 2));
}
function pushMiniEvent(payload = {}) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const name = clean(safe.name || safe.event || 'miniapp.event').replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);
  const durationMs = Number(safe.durationMs ?? safe.elapsedMs ?? 0) || 0;
  const item = {
    seq: miniEvents.length ? miniEvents[miniEvents.length - 1].seq + 1 : 1,
    at: nowIso(),
    runtimeVersion: RUNTIME,
    name,
    durationMs,
    route: clean(safe.route || safe.path || ''),
    appRuntime: clean(safe.appRuntime || safe.runtime || ''),
    assetVersion: clean(safe.assetVersion || ''),
    commentKey: clean(safe.commentKey || ''),
    postId: clean(safe.postId || ''),
    channelId: clean(safe.channelId || ''),
    status: clean(safe.status || ''),
    details: {
      navStartMs: Number(safe.navStartMs || 0) || 0,
      sinceLoaderStartMs: Number(safe.sinceLoaderStartMs || 0) || 0,
      sinceScriptStartMs: Number(safe.sinceScriptStartMs || 0) || 0
    }
  };
  miniEvents.push(item);
  if (miniEvents.length > MINI_LIMIT) miniEvents.splice(0, miniEvents.length - MINI_LIMIT);
  timing.log('miniapp.' + name, { durationMs, route: item.route, appRuntime: item.appRuntime, assetVersion: item.assetVersion, commentKey: item.commentKey, postId: item.postId, channelId: item.channelId, status: item.status });
  return item;
}
function miniSummary() {
  const byName = {};
  for (const e of miniEvents) {
    const key = e.name || 'miniapp.event';
    if (!byName[key]) byName[key] = { name: key, count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
    const row = byName[key];
    const ms = Number(e.durationMs || 0) || 0;
    row.count += 1;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
    row.lastMs = ms;
  }
  return Object.values(byName).map((row) => ({ ...row, avgMs: row.count ? Math.round(row.totalMs / row.count) : 0 })).sort((a, b) => b.maxMs - a.maxMs);
}
function patchTimingInfo() {
  const patch = typeof postPatcher.getPatchCoalescingSnapshot === 'function' ? postPatcher.getPatchCoalescingSnapshot() : null;
  const events = timing.list().filter((e) => /^(patch\.|edit_message_|webhook_total|delegate_legacy|posts_text_flow_guard)/.test(clean(e.name))).slice(0, 80);
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    mode: 'patch-timing-lite',
    patchCoalescingRuntime: postPatcher.PATCH_COALESCE_RUNTIME || '',
    patchCoalescing: patch,
    summary: timing.info().summary.filter((row) => /^(patch\.|edit_message_|webhook_total|delegate_legacy|posts_text_flow_guard)/.test(clean(row.name))),
    recent: events,
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}
function miniappTimingInfo() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    mode: 'miniapp-client-timing-lite',
    total: miniEvents.length,
    limit: MINI_LIMIT,
    summary: miniSummary(),
    recent: miniEvents.slice().reverse().slice(0, MINI_LIMIT),
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}
function install(app) {
  if (!app || app.__adminkitPerformanceDebugRoutesPr73) return app;
  app.__adminkitPerformanceDebugRoutesPr73 = true;
  if (typeof postPatcher.setPostPatchTraceHook === 'function') {
    postPatcher.setPostPatchTraceHook((name, payload = {}) => {
      const eventName = clean(name || 'patch.event');
      timing.log(eventName, { ...(payload || {}), source: 'postPatcher', durationMs: Number(payload.durationMs || 0) || 0 });
    });
  }
  app.get('/debug/patch-timing', (req, res) => send(res, patchTimingInfo()));
  app.get('/debug/miniapp-timing', (req, res) => send(res, miniappTimingInfo()));
  app.get('/debug/miniapp-timing/clear', (req, res) => { miniEvents.splice(0, miniEvents.length); send(res, { ok: true, runtimeVersion: RUNTIME, mode: 'miniapp-timing-cleared', safe: true }); });
  app.post('/api/debug/miniapp-timing', (req, res) => {
    try {
      const item = pushMiniEvent(req.body || {});
      send(res, { ok: true, runtimeVersion: RUNTIME, accepted: true, seq: item.seq, safe: true });
    } catch (error) {
      send(res, { ok: false, runtimeVersion: RUNTIME, error: String(error && error.message || error), safe: true }, 500);
    }
  });
  return app;
}

module.exports = { RUNTIME, install, patchTimingInfo, miniappTimingInfo, pushMiniEvent };
