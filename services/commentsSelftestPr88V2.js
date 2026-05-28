'use strict';

const commentService = require('./commentService');
const stickerPackService = require('./stickerPackService');
const stickerRoutes = require('../stickers-live-routes-pr87');
const uiTelemetry = require('./commentsUiTelemetryPr88');
const pgState = require('../postgres-state-store');
const { getComments, store, saveStore, normalizeKey } = require('../store');

const RUNTIME = 'PR88-COMMENTS-FULL-SELFTEST-V2';
const TEST_USER = 'selftest_owner';
const OTHER_USER = 'selftest_other';
const DEFAULT_PACK_ID = stickerPackService.DEFAULT_PACK_ID || 'adminkit_whales_v1';
const SELFTEST_KEY_PREFIX = 'selftest_pr88_';

let latestReport = null;

function nowIso() { return new Date().toISOString(); }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function makeKey() { return normalizeKey(`${SELFTEST_KEY_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`); }
function pass(id, details) { return { id, status: 'pass', details: details || {} }; }
function fail(id, expected, actual, details) { return { id, status: 'fail', expected, actual, details: details || {} }; }
function addAssert(results, id, ok, expected, actual, details) { results.push(ok ? pass(id, details) : fail(id, expected, actual, details)); }
function findComment(commentKey, commentId) { return getComments(commentKey).find((item) => item && item.id === commentId) || null; }
function uiWarning(id, message, details) { return { id, severity: 'warning', message, details: details || {} }; }
function hasOwn(obj, key) { return Boolean(obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key)); }
function isSelftestKey(commentKey) { return normalizeKey(commentKey).startsWith(SELFTEST_KEY_PREFIX); }
function selftestKeyError(commentKey) {
  const err = new Error('invalid_selftest_comment_key');
  err.status = 400;
  err.code = 'invalid_selftest_comment_key';
  err.data = { commentKey: clean(commentKey), requiredPrefix: SELFTEST_KEY_PREFIX };
  return err;
}
function cleanupPersistenceError(commentKey, removedModerationLogs, cause, details) {
  const err = new Error('selftest_cleanup_persistence_failed');
  err.status = 500;
  err.code = 'selftest_cleanup_persistence_failed';
  err.data = {
    commentKey: clean(commentKey),
    removedModerationLogs,
    cause: cause && (cause.message || String(cause)),
    ...(details || {})
  };
  err.cause = cause;
  return err;
}
function resolveCommentKey(options) {
  const requested = normalizeKey(options && options.commentKey);
  if (!requested) return makeKey();
  if (!isSelftestKey(requested)) throw selftestKeyError(requested);
  return requested;
}
function clearModerationLogs(key) {
  let removed = 0;
  const moderation = store.moderation || {};
  const logs = Array.isArray(moderation.logs) ? moderation.logs : [];
  if (!logs.length) return 0;
  store.moderation.logs = logs.filter((item) => {
    if (normalizeKey(item && item.commentKey) === key) {
      removed += 1;
      return false;
    }
    return true;
  });
  return removed;
}
function postgresCleanupInfo(info) {
  return {
    ok: info && info.ok !== false,
    configured: Boolean(info && info.configured),
    table: clean(info && info.table),
    key: clean(info && info.key),
    lastSyncAt: clean(info && info.lastSyncAt),
    lastError: clean(info && info.lastError),
    pending: Boolean(info && info.pending)
  };
}
async function flushPersistentMirror(commentKey, removedModerationLogs) {
  if (!pgState.isConfigured()) return { postgresConfigured: false };
  let info = null;
  try {
    info = await pgState.flush();
  } catch (error) {
    throw cleanupPersistenceError(commentKey, removedModerationLogs, error, { phase: 'postgres_flush' });
  }
  const pg = postgresCleanupInfo(info || pgState.info());
  if (pg.ok === false || pg.lastError) {
    throw cleanupPersistenceError(commentKey, removedModerationLogs, new Error(pg.lastError || 'postgres_flush_failed'), { phase: 'postgres_flush', postgres: pg });
  }
  return { postgresConfigured: true, postgres: pg };
}
async function resetKey(commentKey) {
  const key = normalizeKey(commentKey);
  if (!key) return { removedModerationLogs: 0 };
  if (!isSelftestKey(key)) throw selftestKeyError(key);
  let removedModerationLogs = 0;
  try {
    if (store.comments && Object.prototype.hasOwnProperty.call(store.comments, key)) delete store.comments[key];
    if (store.likes && Object.prototype.hasOwnProperty.call(store.likes, key)) delete store.likes[key];
    if (store.reactions && Object.prototype.hasOwnProperty.call(store.reactions, key)) delete store.reactions[key];
    removedModerationLogs = clearModerationLogs(key);
    saveStore(store);
    const mirror = await flushPersistentMirror(key, removedModerationLogs);
    return { removedModerationLogs, mirror };
  } catch (error) {
    if (error && error.code === 'invalid_selftest_comment_key') throw error;
    if (error && error.code === 'selftest_cleanup_persistence_failed') throw error;
    throw cleanupPersistenceError(key, removedModerationLogs, error, { phase: 'local_store_save' });
  }
}
async function liveSticker(commentKey, opts) {
  const stickerId = clean((opts && opts.stickerId) || 'adminkit_ok');
  const result = await stickerRoutes.createLiveStickerComment({
    commentKey,
    packId: (opts && opts.packId) || DEFAULT_PACK_ID,
    stickerId,
    userId: (opts && opts.userId) || TEST_USER,
    userName: (opts && opts.userName) || 'Self Test Owner',
    avatarUrl: '',
    replyToId: (opts && opts.replyToId) || '',
    windowMs: opts && opts.windowMs,
    __trustedSelftest: true
  });
  return result && result.comment ? { ...result.comment, __liveStickerPath: true } : null;
}
function summarizeBrowserProbeRequirements(probes) {
  const required = (probes || []).filter((item) => item && item.status === 'browser_probe_required');
  return {
    requiredCount: required.length,
    requiredProbeIds: required.map((item) => item.id).filter(Boolean),
    requiredProbes: required.map((item) => ({ id: item.id, commentId: item.commentId, expected: item.expected || item.expectedClientCounters || item.clientTelemetryContract || {} }))
  };
}
function probeValueFor(results, id) {
  if (!results || !id) return undefined;
  if (Array.isArray(results)) return results.find((item) => clean(item && item.id) === id);
  return results[id];
}
function nested(value, path) {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}
function boolCheck(value, keys) {
  return keys.some((key) => value && value[key] === true) || keys.some((key) => nested(value, ['checks', key]) === true) || keys.some((key) => nested(value, ['measurements', key]) === true);
}
function mapKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.keys(value).filter(Boolean);
}
function normalizeHydrationExpectedCounters(requirement) {
  const expected = requirement && (requirement.expected || requirement.expectedClientCounters || requirement.counters || requirement);
  const counters = expected && (expected.counters || expected.expectedClientCounters || expected);
  return counters && typeof counters === 'object' && !Array.isArray(counters) ? counters : {};
}
function isStrictFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
function mapValuesAreZero(value, requiredKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, missingKeys: Array.isArray(requiredKeys) ? requiredKeys : [], invalidKeys: [], nonZeroKeys: [], unexpectedKeys: [], actualKeys: [] };
  }
  const actualKeys = Object.keys(value);
  const keys = Array.isArray(requiredKeys) ? requiredKeys : actualKeys;
  const missingKeys = keys.filter((key) => !hasOwn(value, key));
  const unexpectedKeys = Array.isArray(requiredKeys) ? actualKeys.filter((key) => !requiredKeys.includes(key)) : [];
  const invalidKeys = actualKeys.filter((key) => !isStrictFiniteNumber(value[key]));
  const nonZeroKeys = actualKeys.filter((key) => isStrictFiniteNumber(value[key]) && value[key] !== 0);
  return { ok: missingKeys.length === 0 && invalidKeys.length === 0 && nonZeroKeys.length === 0, missingKeys, invalidKeys, nonZeroKeys, unexpectedKeys, actualKeys };
}
function objectValuesAreZero(value) {
  return mapValuesAreZero(value).ok;
}
function commentIdFromSelector(selector) {
  const match = String(selector || '').match(/data-comment-id=["']?([^"'\]\s]+)/);
  return clean(match && match[1]);
}
function stickerProbeCommentId(value) {
  const candidates = [
    value && value.commentId,
    value && value.targetCommentId,
    value && value.rowCommentId,
    value && value.stickerCommentId,
    nested(value, ['row', 'commentId']),
    nested(value, ['target', 'commentId']),
    nested(value, ['checks', 'commentId']),
    nested(value, ['measurements', 'commentId'])
  ];
  for (const candidate of candidates) {
    const id = clean(candidate);
    if (id) return id;
  }
  const selectors = [
    value && value.selector,
    value && value.rowSelector,
    nested(value, ['selectors', 'row']),
    nested(value, ['target', 'selector']),
    nested(value, ['measurements', 'rowSelector'])
  ];
  for (const selector of selectors) {
    const id = commentIdFromSelector(selector);
    if (id) return id;
  }
  return '';
}
function validateStickerRendererProbe(value, requirement) {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'probe_result_object_required' };
  const expectedCommentId = clean(requirement && requirement.commentId);
  const actualCommentId = stickerProbeCommentId(value);
  if (expectedCommentId && actualCommentId !== expectedCommentId) {
    return { ok: false, reason: actualCommentId ? 'sticker_probe_comment_id_mismatch' : 'sticker_probe_comment_id_required', expectedCommentId, actualCommentId };
  }
  const required = {
    standaloneStickerMedia: boolCheck(value, ['standaloneStickerMedia', 'stickerOnlyComment']),
    noRegularBubbleVisuals: boolCheck(value, ['noRegularBubbleVisuals', 'noRegularTextBubbleBackground', 'noRegularBubbleTail']),
    timeDoesNotIntersectMediaBox: boolCheck(value, ['timeDoesNotIntersectMediaBox', 'timestampOutsideStickerMediaBox']),
    stableMediaBoxBeforeImageLoad: boolCheck(value, ['stableMediaBoxBeforeImageLoad'])
  };
  const missing = Object.entries(required).filter(([, ok]) => !ok).map(([key]) => key);
  return { ok: missing.length === 0, missing, expectedCommentId, actualCommentId };
}
function validateHydrationProbe(value, requirement) {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'probe_result_object_required' };
  const counters = value.counters || value.telemetry || value;
  if (!counters || typeof counters !== 'object') return { ok: false, reason: 'hydration_counters_object_required' };
  const requiredNumericCounters = ['listClearCount'];
  const requiredMapCounters = ['mediaRemountCountByCommentId', 'imageReloadCountByCommentId'];
  const missingNumericCounters = requiredNumericCounters.filter((key) => !hasOwn(counters, key));
  const missingMapCounters = requiredMapCounters.filter((key) => !hasOwn(counters, key));
  if (missingNumericCounters.length || missingMapCounters.length) {
    return { ok: false, reason: 'hydration_counters_required', missingNumericCounters, missingMapCounters };
  }
  const expectedCounters = normalizeHydrationExpectedCounters(requirement);
  const expectedMapKeys = {
    mediaRemountCountByCommentId: mapKeys(expectedCounters.mediaRemountCountByCommentId),
    imageReloadCountByCommentId: mapKeys(expectedCounters.imageReloadCountByCommentId)
  };
  const missingExpectedMapCounters = requiredMapCounters.filter((key) => !Array.isArray(expectedMapKeys[key]) || expectedMapKeys[key].length === 0);
  if (missingExpectedMapCounters.length) {
    return { ok: false, reason: 'hydration_expected_counter_entries_required', missingExpectedMapCounters };
  }
  const listClearCount = counters.listClearCount;
  const mediaRemountCount = hasOwn(counters, 'mediaRemountCount') ? counters.mediaRemountCount : 0;
  const stickerImageReloadCount = hasOwn(counters, 'stickerImageReloadCount') ? counters.stickerImageReloadCount : 0;
  const photoImageReloadCount = hasOwn(counters, 'photoImageReloadCount') ? counters.photoImageReloadCount : 0;
  const mediaRemountById = mapValuesAreZero(counters.mediaRemountCountByCommentId, expectedMapKeys.mediaRemountCountByCommentId);
  const imageReloadById = mapValuesAreZero(counters.imageReloadCountByCommentId, expectedMapKeys.imageReloadCountByCommentId);
  const stickerReloadById = hasOwn(counters, 'stickerImageReloadCountByCommentId') ? mapValuesAreZero(counters.stickerImageReloadCountByCommentId) : { ok: true, missingKeys: [], invalidKeys: [], nonZeroKeys: [], unexpectedKeys: [], actualKeys: [] };
  const photoReloadById = hasOwn(counters, 'photoImageReloadCountByCommentId') ? mapValuesAreZero(counters.photoImageReloadCountByCommentId) : { ok: true, missingKeys: [], invalidKeys: [], nonZeroKeys: [], unexpectedKeys: [], actualKeys: [] };
  const numericCounters = { listClearCount, mediaRemountCount, stickerImageReloadCount, photoImageReloadCount };
  const invalidNumericCounters = Object.entries(numericCounters).filter(([, item]) => !isStrictFiniteNumber(item)).map(([key]) => key);
  const nonZeroNumericCounters = Object.entries(numericCounters).filter(([, item]) => isStrictFiniteNumber(item) && item !== 0).map(([key]) => key);
  const ok = invalidNumericCounters.length === 0 && nonZeroNumericCounters.length === 0 && mediaRemountById.ok && imageReloadById.ok && stickerReloadById.ok && photoReloadById.ok;
  return {
    ok,
    reason: ok ? undefined : 'hydration_counter_values_must_match_expected_zero_maps',
    counters: {
      listClearCount,
      mediaRemountCount,
      stickerImageReloadCount,
      photoImageReloadCount,
      invalidNumericCounters,
      nonZeroNumericCounters,
      expectedMediaRemountCommentIds: expectedMapKeys.mediaRemountCountByCommentId,
      expectedImageReloadCommentIds: expectedMapKeys.imageReloadCountByCommentId,
      mediaRemountByIdOk: mediaRemountById.ok,
      imageReloadByIdOk: imageReloadById.ok,
      stickerReloadByIdOk: stickerReloadById.ok,
      photoReloadByIdOk: photoReloadById.ok,
      mediaRemountById,
      imageReloadById,
      stickerReloadById,
      photoReloadById
    }
  };
}
function validateBrowserProbe(id, value, requirement) {
  if (id === 'sticker_renderer_contract_probe') return validateStickerRendererProbe(value, requirement);
  if (id === 'reopen_hydration_stability_probe') return validateHydrationProbe(value, requirement);
  return { ok: Boolean(value && typeof value === 'object' && (value.ok === true || value.status === 'pass' || value.status === 'passed' || value.status === 'ok')), reason: 'structured_pass_required' };
}
function cleanupHint(commentKey) {
  return `/debug/selftest/comments/full?cleanup=1&commentKey=${encodeURIComponent(commentKey)}`;
}
function markCleanupFailure(report, commentKey, error) {
  if (!report || typeof report !== 'object') return report;
  report.ok = false;
  report.cleanup = { ok: false, error: error?.code || error?.message || 'selftest_cleanup_failed', data: error?.data || {}, failedAt: nowIso() };
  report.cleanupError = report.cleanup;
  if (report.fixtures) {
    report.fixtures.preserved = true;
    report.fixtures.cleanupRequired = true;
    report.fixtures.cleanupHint = cleanupHint(commentKey);
    report.fixtures.reason = 'Cleanup failed before durable persistence completed; fixtures may still exist or reappear after restart.';
  }
  return report;
}
function cleanupFailureReport(commentKey, cleanupMode, error, startedAt) {
  const failure = fail('selftest_prerun_cleanup_failed', 'pre-run cleanup persists successfully', error?.data || error?.message || String(error || 'cleanup_failed'), { commentKey });
  const report = {
    ok: false,
    backendOk: false,
    runtimeVersion: RUNTIME,
    suite: 'ADMINKIT_COMMENTS_FULL',
    commentKey,
    startedAt: startedAt || nowIso(),
    finishedAt: nowIso(),
    summary: { passed: 0, failed: 1, total: 1 },
    backend: { ok: false, summary: { passed: 0, failed: 1, total: 1 }, failures: [failure], tests: [failure] },
    uiStability: { ok: false, status: 'not_run', browserProbeRequired: false, browserProbeRequirements: { requiredCount: 0, requiredProbeIds: [], requiredProbes: [] }, warnings: [], probes: [], note: 'Self-test did not start because pre-run cleanup failed.' },
    fixtures: { preserved: true, cleanupMode, cleanupRequired: true, cleanupHint: cleanupHint(commentKey), commentKey, reason: 'Pre-run cleanup failed before durable persistence completed.' },
    telemetry: { clientContract: '__adminkitCommentsPerf', browserResultEndpoint: '/debug/selftest/comments/browser-result' },
    warnings: [],
    failures: [failure],
    tests: [failure]
  };
  return markCleanupFailure(report, commentKey, error);
}
function cleanupOnlySuccessReport(commentKey, cleanup, startedAt) {
  const test = pass('cleanup_selftest_fixtures', { commentKey, cleanup });
  return {
    ok: true,
    backendOk: true,
    runtimeVersion: RUNTIME,
    suite: 'ADMINKIT_COMMENTS_CLEANUP',
    commentKey,
    startedAt: startedAt || nowIso(),
    finishedAt: nowIso(),
    summary: { passed: 1, failed: 0, total: 1 },
    backend: { ok: true, summary: { passed: 1, failed: 0, total: 1 }, failures: [], tests: [test] },
    uiStability: { ok: true, status: 'cleanup_only', browserProbeRequired: false, browserProbeRequirements: { requiredCount: 0, requiredProbeIds: [], requiredProbes: [] }, warnings: [], probes: [], note: 'Cleanup-only request does not run browser probes.' },
    fixtures: { preserved: false, cleanupMode: true, cleanupRequired: false, cleanupHint: '', commentKey, reason: 'Cleanup-only removed preserved self-test fixtures.' },
    telemetry: { clientContract: '__adminkitCommentsPerf', browserResultEndpoint: '/debug/selftest/comments/browser-result' },
    cleanup,
    warnings: [],
    failures: [],
    tests: [test]
  };
}
async function cleanupSelftestFixtures(input = {}) {
  const startedAt = nowIso();
  const commentKey = resolveCommentKey({ commentKey: input.commentKey || input.key });
  try {
    const cleanup = await resetKey(commentKey);
    latestReport = cleanupOnlySuccessReport(commentKey, cleanup, startedAt);
    return latestReport;
  } catch (error) {
    latestReport = cleanupFailureReport(commentKey, true, error, startedAt);
    throw error;
  }
}
function recalcReportAfterBrowserResults(report, browserResults) {
  const browserProbeRequirements = report?.uiStability?.browserProbeRequirements || {};
  const required = browserProbeRequirements.requiredProbeIds || [];
  const requiredProbes = Array.isArray(browserProbeRequirements.requiredProbes) ? browserProbeRequirements.requiredProbes : [];
  const requirementById = Object.fromEntries(requiredProbes.map((item) => [item && item.id, item]).filter(([id]) => Boolean(id)));
  const validations = Object.fromEntries(required.map((id) => [id, validateBrowserProbe(id, probeValueFor(browserResults, id), requirementById[id])]));
  const missing = required.filter((id) => !(validations[id] && validations[id].ok));
  const browserPassed = required.length > 0 && missing.length === 0;
  const warnings = (report.warnings || []).filter((item) => !(browserPassed && item && item.id === 'browser_ui_probe_required'));
  const uiStatus = browserPassed ? (warnings.length ? 'warning' : 'pass') : 'needs_browser_probe';
  const backendOk = report.backendOk !== undefined ? report.backendOk : Boolean(report.backend && report.backend.ok);
  const fullOk = Boolean(backendOk && uiStatus === 'pass');
  report.ok = fullOk;
  report.backendOk = backendOk;
  report.warnings = warnings;
  if (report.uiStability) {
    report.uiStability.ok = uiStatus === 'pass';
    report.uiStability.status = uiStatus;
    report.uiStability.browserProbeRequired = !browserPassed;
    report.uiStability.browserProbeMissing = missing;
    report.uiStability.browserProbeValidations = validations;
    report.uiStability.warnings = warnings;
    report.uiStability.browserProbeResults = browserResults;
    report.uiStability.browserProbeReceivedAt = nowIso();
    report.uiStability.note = 'Full self-test is only ok when backend passes and UI stability is pass.';
  }
  report.browserProbeResult = { ok: browserPassed, receivedAt: nowIso(), requiredProbeIds: required, missingProbeIds: missing, validations, results: browserResults };
  if (report.fixtures) {
    const fixturesStillPreserved = report.fixtures.preserved !== false;
    report.fixtures.cleanupRequired = Boolean(fixturesStillPreserved);
    report.fixtures.reason = fullOk
      ? (fixturesStillPreserved ? 'Browser probes passed, but fixtures remain preserved until cleanup runs.' : 'Browser probes passed; full self-test is green.')
      : 'Fixtures are preserved because the full self-test is not green yet.';
  }
  return report;
}
async function applyBrowserProbeResult(input = {}) {
  const commentKey = resolveCommentKey({ commentKey: input.commentKey || input.key });
  if (!latestReport || latestReport.commentKey !== commentKey) {
    const err = new Error('selftest_report_not_found_for_comment_key');
    err.status = 404;
    err.code = 'selftest_report_not_found_for_comment_key';
    err.data = { commentKey };
    throw err;
  }
  const results = input.probes || input.results || {};
  const report = recalcReportAfterBrowserResults(latestReport, results);
  if (input.telemetry && typeof input.telemetry === 'object') report.browserTelemetry = input.telemetry;
  const requestedCleanup = input.cleanup === true || report.fixtures?.cleanupMode === true;
  const shouldCleanup = report.ok && (requestedCleanup || report.fixtures?.cleanupMode === 'auto');
  if (shouldCleanup) {
    try {
      report.cleanup = await resetKey(commentKey);
      if (report.fixtures) {
        report.fixtures.preserved = false;
        report.fixtures.cleanupRequired = false;
        report.fixtures.cleanupHint = '';
        report.fixtures.reason = requestedCleanup ? 'Browser probes passed and cleanup was requested explicitly.' : 'Browser probes passed; auto cleanup removed preserved fixtures.';
      }
    } catch (error) {
      latestReport = markCleanupFailure(report, commentKey, error);
      throw error;
    }
  }
  latestReport = report;
  return report;
}
async function runFullCommentsSelftest(options) {
  const startedAt = nowIso();
  const openStartedAt = uiTelemetry.now();
  const commentKey = resolveCommentKey(options);
  const tests = [];
  const probes = [];
  const warnings = [];
  const cleanupMode = options && Object.prototype.hasOwnProperty.call(options, 'cleanup') ? options.cleanup : 'auto';
  try {
    await resetKey(commentKey);
  } catch (error) {
    latestReport = cleanupFailureReport(commentKey, cleanupMode, error, startedAt);
    throw error;
  }
  try {
    const text = commentService.createComment({ commentKey, userId: TEST_USER, userName: 'Self Test Owner', text: 'Selftest text comment', attachments: [] });
    addAssert(tests, 'create_text_comment', Boolean(text && text.id), 'text comment created', text, { commentId: text && text.id });
    const photo = commentService.createComment({ commentKey, userId: TEST_USER, userName: 'Self Test Owner', text: 'Selftest photo caption', attachments: [{ type: 'image', name: 'selftest-photo.webp', url: '/public/stickers/adminkit/v1/adminkit_ok.webp' }] });
    addAssert(tests, 'create_photo_comment', Boolean(photo && photo.id && photo.attachments && photo.attachments.length === 1), 'photo comment created', photo, { commentId: photo && photo.id });
    const stickerSendStartedAt = uiTelemetry.now();
    const sticker = await liveSticker(commentKey, { stickerId: 'adminkit_ok' });
    const stickerSendConfirmedAt = uiTelemetry.now();
    addAssert(tests, 'create_sticker_comment_via_live_route', Boolean(sticker && sticker.id && sticker.type === 'sticker' && sticker.text === 'Стикер' && sticker.__liveStickerPath), 'live sticker comment created', sticker, { commentId: sticker && sticker.id });
    probes.push(uiTelemetry.stickerRendererProbe(sticker));
    const replyTextToSticker = commentService.createComment({ commentKey, userId: TEST_USER, userName: 'Self Test Owner', text: 'Reply to sticker', replyToId: sticker && sticker.id, attachments: [] });
    addAssert(tests, 'reply_text_to_sticker', Boolean(replyTextToSticker && sticker && replyTextToSticker.replyToId === sticker.id), 'text reply points to sticker', replyTextToSticker, { parentId: sticker && sticker.id });
    const replyStickerToPhoto = await liveSticker(commentKey, { stickerId: 'adminkit_love', replyToId: photo && photo.id });
    addAssert(tests, 'reply_sticker_to_photo_via_live_route', Boolean(replyStickerToPhoto && replyStickerToPhoto.replyToId === photo.id && replyStickerToPhoto.__liveStickerPath), 'sticker reply points to photo through live path', replyStickerToPhoto, { parentId: photo && photo.id });
    const fetchStartedAt = uiTelemetry.now();
    const listed = commentService.listComments(commentKey, TEST_USER);
    const fetchFinishedAt = uiTelemetry.now();
    const firstCommentRenderedAt = listed.length ? fetchFinishedAt : uiTelemetry.now();
    const listedReply = listed.find((item) => item.id === replyTextToSticker.id);
    addAssert(tests, 'reply_preview_for_sticker_parent', Boolean(listedReply && listedReply.replyTo && listedReply.replyTo.text === 'Стикер'), 'reply preview for sticker parent is Стикер', listedReply && listedReply.replyTo, { commentId: replyTextToSticker && replyTextToSticker.id });
    commentService.toggleReaction({ commentKey, commentId: sticker.id, userId: TEST_USER, emoji: '👍' });
    const reacted = commentService.listComments(commentKey, TEST_USER).find((item) => item.id === sticker.id);
    addAssert(tests, 'reaction_on_sticker', Boolean(reacted && reacted.reactionCounts && reacted.reactionCounts['👍'] === 1), 'reaction count is 1', reacted && reacted.reactionCounts, { commentId: sticker && sticker.id });
    const duplicateA = await liveSticker(commentKey, { stickerId: 'adminkit_party' });
    const duplicateB = await liveSticker(commentKey, { stickerId: 'adminkit_party' });
    const partyCount = getComments(commentKey).filter((item) => item.type === 'sticker' && item.stickerId === 'adminkit_party').length;
    addAssert(tests, 'dedupe_duplicate_sticker_via_live_route', Boolean(duplicateA && duplicateB && duplicateA.id === duplicateB.id && partyCount === 1), 'duplicate live sticker deduped', { duplicateA, duplicateB, partyCount });
    const deleteSticker = await liveSticker(commentKey, { stickerId: 'adminkit_sad' });
    let deleteResult = null;
    try { deleteResult = commentService.deleteComment({ commentKey, commentId: deleteSticker.id, userId: TEST_USER }); } catch (error) { deleteResult = { error: error.message }; }
    const existsAfterDelete = Boolean(findComment(commentKey, deleteSticker.id));
    addAssert(tests, 'delete_sticker_comment_should_work', deleteResult === true && !existsAfterDelete, 'own sticker comment deleted', { deleteResult, existsAfterDelete }, { commentId: deleteSticker && deleteSticker.id });
    const otherSticker = await liveSticker(commentKey, { stickerId: 'adminkit_happy', userId: OTHER_USER, userName: 'Self Test Other' });
    let forbiddenDelete = null;
    try { forbiddenDelete = commentService.deleteComment({ commentKey, commentId: otherSticker.id, userId: TEST_USER }); } catch (error) { forbiddenDelete = { error: error.message }; }
    addAssert(tests, 'delete_other_user_sticker_forbidden', Boolean(forbiddenDelete && forbiddenDelete.error === 'forbidden' && findComment(commentKey, otherSticker.id)), 'other user sticker delete forbidden', forbiddenDelete, { commentId: otherSticker && otherSticker.id });
    const beforeRefresh = commentService.listComments(commentKey, TEST_USER);
    const afterRefresh = commentService.listComments(commentKey, TEST_USER);
    const hydration = uiTelemetry.hydrationProbe(beforeRefresh, afterRefresh);
    probes.push(hydration);
    if (hydration.status === 'fail') tests.push(fail('reopen_hydration_store_stability', 'comment ids stable across refresh', hydration.missingAfterRefresh, hydration));
    const finalComments = getComments(commentKey);
    addAssert(tests, 'list_comments_contains_all_core_types', Boolean(finalComments.some((item) => !item.type && item.text) && finalComments.some((item) => item.attachments && item.attachments.length) && finalComments.some((item) => item.type === 'sticker')), 'text/photo/sticker comments present', finalComments.map((item) => ({ id: item.id, type: item.type || 'text', attachments: (item.attachments || []).length })));
    const mediaSettledAt = uiTelemetry.now();
    const stickerPanelOpenStartedAt = uiTelemetry.now();
    const stickerPanelOpenedAt = stickerPanelOpenStartedAt;
    const perf = uiTelemetry.performanceTelemetry({ openStartedAt, fetchStartedAt, fetchFinishedAt, firstCommentRenderedAt, mediaSettledAt, stickerPanelOpenStartedAt, stickerPanelOpenedAt, stickerSendStartedAt, stickerSendConfirmedAt });
    warnings.push(...perf.warnings);
    probes.push(perf);
  } catch (error) {
    tests.push(fail('selftest_unhandled_exception', 'no unhandled exception', error && (error.stack || error.message || String(error))));
  }
  const failures = tests.filter((item) => item.status === 'fail');
  const backend = { ok: failures.length === 0, summary: { passed: tests.length - failures.length, failed: failures.length, total: tests.length }, failures, tests };
  const browserProbeRequirements = summarizeBrowserProbeRequirements(probes);
  if (browserProbeRequirements.requiredCount > 0) warnings.push(uiWarning('browser_ui_probe_required', 'Browser-side UI probes are required before UI stability can pass.', browserProbeRequirements));
  const uiStatus = browserProbeRequirements.requiredCount > 0 ? 'needs_browser_probe' : (warnings.length ? 'warning' : 'pass');
  const fullOk = backend.ok && uiStatus === 'pass';
  const shouldCleanup = fullOk && (cleanupMode === true || cleanupMode === 'auto');
  const fixturesPreserved = !shouldCleanup;
  const hint = fixturesPreserved ? cleanupHint(commentKey) : '';
  const report = {
    ok: fullOk,
    backendOk: backend.ok,
    runtimeVersion: RUNTIME,
    suite: 'ADMINKIT_COMMENTS_FULL',
    commentKey,
    startedAt,
    finishedAt: nowIso(),
    summary: backend.summary,
    backend,
    uiStability: { ok: uiStatus === 'pass', status: uiStatus, browserProbeRequired: browserProbeRequirements.requiredCount > 0, browserProbeRequirements, warnings, probes, note: 'Full self-test is only ok when backend passes and UI stability is pass.' },
    fixtures: { preserved: fixturesPreserved, cleanupMode, cleanupRequired: fixturesPreserved, cleanupHint: hint, commentKey, reason: fixturesPreserved ? 'Fixtures are preserved until required browser probes pass or cleanup-only is requested.' : 'Fixtures cleaned because cleanup was explicit or the full self-test passed.' },
    telemetry: { clientContract: '__adminkitCommentsPerf', browserResultEndpoint: '/debug/selftest/comments/browser-result', browserResultSchema: { sticker_renderer_contract_probe: { commentId: '<expectedStickerCommentId>', checks: { standaloneStickerMedia: true, noRegularBubbleVisuals: true, timeDoesNotIntersectMediaBox: true, stableMediaBoxBeforeImageLoad: true } }, reopen_hydration_stability_probe: { counters: { listClearCount: 0, mediaRemountCountByCommentId: { '<expectedMediaCommentId>': 0 }, imageReloadCountByCommentId: { '<expectedMediaCommentId>': 0 } } } }, requiredCounters: ['listClearCount', 'mediaRemountCountByCommentId', 'imageReloadCountByCommentId'], requiredTimings: ['openStartedAt', 'fetchStartedAt', 'fetchFinishedAt', 'firstCommentRenderedAt', 'mediaSettledAt', 'stickerPanelOpenStartedAt', 'stickerPanelOpenedAt', 'stickerSendStartedAt', 'stickerSendConfirmedAt'] },
    warnings,
    failures,
    tests
  };
  if (shouldCleanup) {
    try {
      report.cleanup = await resetKey(commentKey);
    } catch (error) {
      latestReport = markCleanupFailure(report, commentKey, error);
      throw error;
    }
  }
  latestReport = report;
  return report;
}
function getLatestReport() { return latestReport || { ok: false, backendOk: false, runtimeVersion: RUNTIME, error: 'selftest_not_run_yet' }; }
module.exports = { RUNTIME, SELFTEST_KEY_PREFIX, isSelftestKey, runFullCommentsSelftest, applyBrowserProbeResult, cleanupSelftestFixtures, getLatestReport };
