'use strict';

const timing = require('./v3-ui-timing-cc8');
const commentOpenState = require('./comment-open-state-route-1546');

const RUNTIME = 'CC8.1.8-COMMENT-UI-CONTRACT-AUDIT';
const CONTRACT_DOC = 'docs/COMMENT_UI_CONTRACT.md';

function clean(value) { return String(value || '').trim(); }
function activeRuntime() { return process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || 'unknown'; }
function isCommentOpenEvent(event = {}) { return clean(event.name).startsWith('comment_open.'); }
function recentCommentOpenEvents(limit = 12) {
  const max = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 50)) : 12;
  return timing.list().filter(isCommentOpenEvent).slice(0, max);
}
function byName(events = []) {
  return events.reduce((acc, event) => {
    const name = clean(event.name || 'timing');
    if (!acc[name]) acc[name] = { name, count: 0, maxMs: 0, lastMs: 0, slowCount: 0 };
    const row = acc[name];
    const ms = Number(event.durationMs || 0);
    row.count += 1;
    row.maxMs = Math.max(row.maxMs, ms);
    row.lastMs = ms;
    if (event.slow) row.slowCount += 1;
    return acc;
  }, {});
}
function info() {
  const events = recentCommentOpenEvents(20);
  const routeExports = {
    install: typeof commentOpenState.install === 'function',
    resolvePost: typeof commentOpenState.resolvePost === 'function',
    buildMeta: typeof commentOpenState.buildMeta === 'function',
    buildSkeletonPayload: typeof commentOpenState.buildSkeletonPayload === 'function',
    hydrateUrl: typeof commentOpenState.hydrateUrl === 'function',
    wantsSkeleton: typeof commentOpenState.wantsSkeleton === 'function'
  };
  const skeletonOptInWorks = routeExports.wantsSkeleton && commentOpenState.wantsSkeleton({ skeleton: '1' }) === true && commentOpenState.wantsSkeleton({}) === false;
  const hydrateUrlStripsSkeleton = routeExports.hydrateUrl && !commentOpenState.hydrateUrl({ commentKey: '123:456', skeleton: '1' }).includes('skeleton=');
  return {
    ok: true,
    runtimeVersion: activeRuntime(),
    auditRuntimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    mode: 'comment-ui-contract-runtime-audit',
    contractDoc: CONTRACT_DOC,
    commentOpenState: {
      module: 'comment-open-state-route-1546.js',
      runtimeVersion: commentOpenState.RUNTIME,
      instrumentationVersion: commentOpenState.INSTRUMENTATION_VERSION,
      skeletonVersion: commentOpenState.SKELETON_VERSION,
      expectedLegacyRuntimeVersion: 'CC7.5.46-COMMENT-OPEN-STATE-CANONICAL',
      legacyRuntimeStable: commentOpenState.RUNTIME === 'CC7.5.46-COMMENT-OPEN-STATE-CANONICAL',
      routeExports,
      skeletonOptInWorks,
      hydrateUrlStripsSkeleton
    },
    guardrails: {
      defaultPayloadMustRemainLegacy: true,
      skeletonMustStayOptIn: true,
      hydrateUrlMustFetchFullLegacyPayload: true,
      giftsButtonsMustRemainSeparated: true,
      noDatabaseRead: true,
      noMaxApiCall: true,
      noUserUiChange: true
    },
    timing: {
      source: 'v3-ui-timing-cc8.js',
      totalEvents: timing.list().length,
      commentOpenEvents: events.length,
      summary: Object.values(byName(events)),
      recent: events
    },
    safe: true
  };
}

module.exports = { RUNTIME, info, recentCommentOpenEvents };
