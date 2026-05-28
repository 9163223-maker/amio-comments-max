'use strict';

const DEFAULT_THRESHOLDS = {
  fetchMsWarn: 600,
  firstRenderMsWarn: 900,
  mediaSettledMsWarn: 1400,
  stickerPanelOpenMsWarn: 350,
  stickerSendConfirmMsWarn: 1200
};

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function now() { return Date.now(); }
function duration(start, end) { return Math.max(0, Number(end || Date.now()) - Number(start || 0)); }
function warning(id, message, details) { return { id, severity: 'warning', message, details: details || {} }; }

function stickerRendererProbe(comment) {
  const id = clean(comment && comment.id);
  return {
    id: 'sticker_renderer_contract_probe',
    status: 'browser_probe_required',
    commentId: id,
    backendVerified: Boolean(comment && comment.type === 'sticker'),
    expected: {
      standaloneStickerMedia: true,
      noRegularBubbleVisuals: true,
      timeDoesNotIntersectMediaBox: true,
      stableMediaBoxBeforeImageLoad: true
    },
    selectors: {
      row: id ? `[data-comment-id="${id}"]` : '[data-comment-id="COMMENT_ID"]',
      stickerMedia: '.comment-sticker,.comment-sticker-only',
      time: '.comment-time,.comment-sticker-meta'
    },
    clientChecks: [
      'row has sticker-only class or equivalent marker',
      'sticker media is not inside a normal text bubble visual container',
      'time rect does not intersect sticker media rect',
      'media node keeps stable identity by comment id during refresh'
    ]
  };
}

function hydrationProbe(beforeComments, afterComments) {
  const beforeIds = (beforeComments || []).map((item) => item && item.id).filter(Boolean);
  const afterIds = (afterComments || []).map((item) => item && item.id).filter(Boolean);
  const missingAfterRefresh = beforeIds.filter((id) => !afterIds.includes(id));
  const mediaIds = (afterComments || [])
    .filter((item) => item && (item.type === 'sticker' || (Array.isArray(item.attachments) && item.attachments.length > 0)))
    .map((item) => item.id)
    .filter(Boolean);
  return {
    id: 'reopen_hydration_stability_probe',
    status: missingAfterRefresh.length ? 'fail' : 'browser_probe_required',
    storeStableAcrossRefresh: missingAfterRefresh.length === 0,
    missingAfterRefresh,
    beforeCount: beforeIds.length,
    afterCount: afterIds.length,
    mediaIds,
    expectedClientCounters: {
      listClearCount: 0,
      mediaRemountCountByCommentId: Object.fromEntries(mediaIds.map((id) => [id, 0])),
      imageReloadCountByCommentId: Object.fromEntries(mediaIds.map((id) => [id, 0]))
    }
  };
}

function performanceTelemetry(timings, counters, thresholds) {
  const limit = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  const metrics = {
    commentsFetchMs: duration(timings.fetchStartedAt, timings.fetchFinishedAt),
    firstCommentRenderMs: duration(timings.openStartedAt, timings.firstCommentRenderedAt),
    mediaSettledMs: duration(timings.openStartedAt, timings.mediaSettledAt),
    stickerPanelOpenMs: duration(timings.stickerPanelOpenStartedAt, timings.stickerPanelOpenedAt),
    stickerSendConfirmMs: duration(timings.stickerSendStartedAt, timings.stickerSendConfirmedAt)
  };
  const warnings = [];
  if (metrics.commentsFetchMs > limit.fetchMsWarn) warnings.push(warning('comments_fetch_slow', 'comments fetch exceeded threshold', { value: metrics.commentsFetchMs, threshold: limit.fetchMsWarn }));
  if (metrics.firstCommentRenderMs > limit.firstRenderMsWarn) warnings.push(warning('first_comment_render_slow', 'first render exceeded threshold', { value: metrics.firstCommentRenderMs, threshold: limit.firstRenderMsWarn }));
  if (metrics.mediaSettledMs > limit.mediaSettledMsWarn) warnings.push(warning('media_settled_slow', 'media settled exceeded threshold', { value: metrics.mediaSettledMs, threshold: limit.mediaSettledMsWarn }));
  if (metrics.stickerPanelOpenMs > limit.stickerPanelOpenMsWarn) warnings.push(warning('sticker_panel_open_slow', 'sticker panel open exceeded threshold', { value: metrics.stickerPanelOpenMs, threshold: limit.stickerPanelOpenMsWarn }));
  if (metrics.stickerSendConfirmMs > limit.stickerSendConfirmMsWarn) warnings.push(warning('sticker_send_confirm_slow', 'sticker send confirm exceeded threshold', { value: metrics.stickerSendConfirmMs, threshold: limit.stickerSendConfirmMsWarn }));
  return {
    id: 'comments_ui_performance_telemetry',
    status: warnings.length ? 'warning' : 'pass',
    thresholds: limit,
    timings,
    metrics,
    counters: counters || {
      listClearCount: 0,
      mediaRemountCount: 0,
      stickerImageReloadCount: 0,
      photoImageReloadCount: 0
    },
    clientTelemetryContract: {
      globalName: '__adminkitCommentsPerf',
      fields: ['openStartedAt', 'fetchStartedAt', 'fetchFinishedAt', 'firstCommentRenderedAt', 'mediaSettledAt', 'stickerPanelOpenStartedAt', 'stickerPanelOpenedAt', 'stickerSendStartedAt', 'stickerSendConfirmedAt', 'listClearCount', 'mediaRemountCountByCommentId', 'imageReloadCountByCommentId']
    },
    warnings
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  now,
  duration,
  warning,
  stickerRendererProbe,
  hydrationProbe,
  performanceTelemetry
};
