'use strict';

const express = require('express');
const timing = require('./v3-ui-timing-cc8');
const postPatcher = require('./services/postPatcher');

const RUNTIME = 'CC8.2.7-MINIAPP-RESOURCE-TIMING';
const MINI_LIMIT = 100;
const STRING_LIMIT = 160;
const NAME_LIMIT = 80;
const miniEvents = [];

function clean(value, maxLen = STRING_LIMIT) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function cleanName(value) {
  return clean(value, NAME_LIMIT).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, NAME_LIMIT) || 'miniapp.event';
}

function boundedNumber(value, min = 0, max = 60 * 60 * 1000) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function boundedBytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), 100 * 1024 * 1024);
}

function nowIso() {
  return new Date().toISOString();
}

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

function sanitizeMiniPayload(payload = {}) {
  const safe = payload && typeof payload === 'object' ? payload : {};

  return {
    name: cleanName(safe.name || safe.event || 'miniapp.event'),
    durationMs: boundedNumber(safe.durationMs ?? safe.elapsedMs ?? 0),

    route: clean(safe.route || safe.path || ''),
    appRuntime: clean(safe.appRuntime || safe.runtime || ''),
    assetVersion: clean(safe.assetVersion || ''),
    loaderRuntime: clean(safe.loaderRuntime || ''),

    scriptSrc: clean(safe.scriptSrc || '', 320),
    photoFlowRuntime: clean(safe.photoFlowRuntime || ''),
    stickersRuntime: clean(safe.stickersRuntime || ''),

    commentKey: clean(safe.commentKey || ''),
    postId: clean(safe.postId || ''),
    channelId: clean(safe.channelId || ''),
    status: clean(safe.status || ''),

    navStartMs: boundedNumber(safe.navStartMs || 0),
    sinceLoaderStartMs: boundedNumber(safe.sinceLoaderStartMs || 0),
    sinceScriptStartMs: boundedNumber(safe.sinceScriptStartMs || 0),

    resourceStartMs: boundedNumber(safe.resourceStartMs || 0),
    resourceDurationMs: boundedNumber(safe.resourceDurationMs || 0),
    resourceFetchStartMs: boundedNumber(safe.resourceFetchStartMs || 0),
    resourceRequestStartMs: boundedNumber(safe.resourceRequestStartMs || 0),
    resourceResponseStartMs: boundedNumber(safe.resourceResponseStartMs || 0),
    resourceResponseEndMs: boundedNumber(safe.resourceResponseEndMs || 0),

    resourceTransferSize: boundedBytes(safe.resourceTransferSize || 0),
    resourceEncodedBodySize: boundedBytes(safe.resourceEncodedBodySize || 0),
    resourceDecodedBodySize: boundedBytes(safe.resourceDecodedBodySize || 0),

    resourceCacheHint: clean(safe.resourceCacheHint || ''),
    resourceInitiatorType: clean(safe.resourceInitiatorType || '')
  };
}

function pushMiniEvent(payload = {}) {
  const safe = sanitizeMiniPayload(payload);

  const item = {
    seq: miniEvents.length ? miniEvents[miniEvents.length - 1].seq + 1 : 1,
    at: nowIso(),
    runtimeVersion: RUNTIME,

    name: safe.name,
    durationMs: safe.durationMs,
    route: safe.route,

    appRuntime: safe.appRuntime,
    assetVersion: safe.assetVersion,
    loaderRuntime: safe.loaderRuntime,

    scriptSrc: safe.scriptSrc,
    photoFlowRuntime: safe.photoFlowRuntime,
    stickersRuntime: safe.stickersRuntime,

    commentKey: safe.commentKey,
    postId: safe.postId,
    channelId: safe.channelId,
    status: safe.status,

    resource: {
      startMs: safe.resourceStartMs,
      durationMs: safe.resourceDurationMs,
      fetchStartMs: safe.resourceFetchStartMs,
      requestStartMs: safe.resourceRequestStartMs,
      responseStartMs: safe.resourceResponseStartMs,
      responseEndMs: safe.resourceResponseEndMs,
      transferSize: safe.resourceTransferSize,
      encodedBodySize: safe.resourceEncodedBodySize,
      decodedBodySize: safe.resourceDecodedBodySize,
      cacheHint: safe.resourceCacheHint,
      initiatorType: safe.resourceInitiatorType
    },

    details: {
      navStartMs: safe.navStartMs,
      sinceLoaderStartMs: safe.sinceLoaderStartMs,
      sinceScriptStartMs: safe.sinceScriptStartMs,

      scriptSrc: safe.scriptSrc,
      photoFlowRuntime: safe.photoFlowRuntime,
      stickersRuntime: safe.stickersRuntime,
      loaderRuntime: safe.loaderRuntime,

      resourceStartMs: safe.resourceStartMs,
      resourceDurationMs: safe.resourceDurationMs,
      resourceFetchStartMs: safe.resourceFetchStartMs,
      resourceRequestStartMs: safe.resourceRequestStartMs,
      resourceResponseStartMs: safe.resourceResponseStartMs,
      resourceResponseEndMs: safe.resourceResponseEndMs,

      resourceTransferSize: safe.resourceTransferSize,
      resourceEncodedBodySize: safe.resourceEncodedBodySize,
      resourceDecodedBodySize: safe.resourceDecodedBodySize,

      resourceCacheHint: safe.resourceCacheHint,
      resourceInitiatorType: safe.resourceInitiatorType
    }
  };

  miniEvents.push(item);
  if (miniEvents.length > MINI_LIMIT) {
    miniEvents.splice(0, miniEvents.length - MINI_LIMIT);
  }

  timing.log('miniapp.' + safe.name, {
    durationMs: safe.durationMs,
    route: safe.route,
    appRuntime: safe.appRuntime,
    assetVersion: safe.assetVersion,
    loaderRuntime: safe.loaderRuntime,
    scriptSrc: safe.scriptSrc,
    photoFlowRuntime: safe.photoFlowRuntime,
    stickersRuntime: safe.stickersRuntime,
    commentKey: safe.commentKey,
    postId: safe.postId,
    channelId: safe.channelId,
    status: safe.status,
    resourceDurationMs: safe.resourceDurationMs,
    resourceTransferSize: safe.resourceTransferSize,
    resourceEncodedBodySize: safe.resourceEncodedBodySize,
    resourceDecodedBodySize: safe.resourceDecodedBodySize,
    resourceCacheHint: safe.resourceCacheHint
  });

  return item;
}

function miniSummary() {
  const byName = {};

  for (const e of miniEvents) {
    const key = e.name || 'miniapp.event';

    if (!byName[key]) {
      byName[key] = {
        name: key,
        count: 0,
        totalMs: 0,
        maxMs: 0,
        lastMs: 0
      };
    }

    const row = byName[key];
    const ms = Number(e.durationMs || 0) || 0;

    row.count += 1;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
    row.lastMs = ms;
  }

  return Object.values(byName)
    .map((row) => ({
      ...row,
      avgMs: row.count ? Math.round(row.totalMs / row.count) : 0
    }))
    .sort((a, b) => b.maxMs - a.maxMs);
}

function patchTimingInfo() {
  const patch = typeof postPatcher.getPatchCoalescingSnapshot === 'function'
    ? postPatcher.getPatchCoalescingSnapshot()
    : null;

  const events = timing
    .list()
    .filter((e) => /^(patch\.|edit_message_|webhook_total|delegate_legacy|posts_text_flow_guard)/.test(clean(e.name)))
    .slice(0, 80);

  return {
    ok: true,
    runtimeVersion: RUNTIME,
    mode: 'patch-timing-lite',
    patchCoalescingRuntime: postPatcher.PATCH_COALESCE_RUNTIME || '',
    patchCoalescing: patch,
    summary: timing
      .info()
      .summary
      .filter((row) => /^(patch\.|edit_message_|webhook_total|delegate_legacy|posts_text_flow_guard)/.test(clean(row.name))),
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
    stringLimit: STRING_LIMIT,
    summary: miniSummary(),
    recent: miniEvents.slice().reverse().slice(0, MINI_LIMIT),
    safe: true,
    noDatabaseRead: true,
    noMaxApiCall: true
  };
}

function parseMiniTimingBody(req) {
  const body = req && req.body;

  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8') || '{}');
    } catch (_) {
      return {};
    }
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}');
    } catch (_) {
      return {};
    }
  }

  if (body && typeof body === 'object') {
    return body;
  }

  if (req && req.rawBody) {
    try {
      return JSON.parse(
        Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : String(req.rawBody || '{}')
      );
    } catch (_) {
      return {};
    }
  }

  return {};
}

function install(app) {
  if (!app || app.__adminkitPerformanceDebugRoutesPr73) return app;
  app.__adminkitPerformanceDebugRoutesPr73 = true;

  const miniappTimingRawParser = express.raw({
    type: '*/*',
    limit: '256kb'
  });

  const timingHook = (name, payload = {}) => {
    const eventName = cleanName(name || 'patch.event');

    timing.log(eventName, {
      ...(payload || {}),
      source: 'postPatcher',
      durationMs: boundedNumber(payload.durationMs || 0)
    });
  };

  if (typeof postPatcher.addPostPatchTraceHook === 'function') {
    postPatcher.addPostPatchTraceHook(timingHook);
  } else if (typeof postPatcher.setPostPatchTraceHook === 'function') {
    postPatcher.setPostPatchTraceHook(timingHook);
  }

  app.get('/debug/patch-timing', (req, res) => {
    send(res, patchTimingInfo());
  });

  app.get('/debug/patch-timing/clear', (req, res) => {
    timing.clear();
    send(res, {
      ok: true,
      runtimeVersion: RUNTIME,
      mode: 'patch-timing-cleared',
      safe: true,
      noDatabaseRead: true,
      noMaxApiCall: true
    });
  });

  app.get('/debug/miniapp-timing', (req, res) => {
    send(res, miniappTimingInfo());
  });

  app.get('/debug/miniapp-timing/clear', (req, res) => {
    miniEvents.splice(0, miniEvents.length);
    send(res, {
      ok: true,
      runtimeVersion: RUNTIME,
      mode: 'miniapp-timing-cleared',
      safe: true
    });
  });

  app.post('/api/debug/miniapp-timing', miniappTimingRawParser, (req, res) => {
    try {
      const item = pushMiniEvent(parseMiniTimingBody(req));

      send(res, {
        ok: true,
        runtimeVersion: RUNTIME,
        accepted: true,
        seq: item.seq,
        name: item.name,
        safe: true
      });
    } catch (error) {
      send(res, {
        ok: false,
        runtimeVersion: RUNTIME,
        error: clean(error && error.message || error),
        safe: true
      }, 500);
    }
  });

  return app;
}

module.exports = {
  RUNTIME,
  install,
  patchTimingInfo,
  miniappTimingInfo,
  pushMiniEvent,
  sanitizeMiniPayload
};
