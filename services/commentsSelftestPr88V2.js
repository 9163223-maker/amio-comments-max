'use strict';

const commentService = require('./commentService');
const stickerPackService = require('./stickerPackService');
const stickerRoutes = require('../stickers-live-routes-pr87');
const uiTelemetry = require('./commentsUiTelemetryPr88');
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
function resetKey(commentKey) {
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
  } catch (error) {
    if (error && error.code === 'invalid_selftest_comment_key') throw error;
  }
  return { removedModerationLogs };
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
function objectValuesAreZero(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((item) => Number(item || 0) === 0);
}
function validateStickerRendererProbe(value) {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'probe_result_object_required' };
  const required = {
    standaloneStickerMedia: boolCheck(value, ['standaloneStickerMedia', 'stickerOnlyComment']),
    noRegularBubbleVisuals: boolCheck(value, ['noRegularBubbleVisuals', 'noRegularTextBubbleBackground', 'noRegularBubbleTail']),
    timeDoesNotIntersectMediaBox: boolCheck(value, ['timeDoesNotIntersectMediaBox', 'timestampOutsideStickerMediaBox']),
    stableMediaBoxBeforeImageLoad: boolCheck(value, ['stableMediaBoxBeforeImageLoad'])
  };
  const missing = Object.entries(required).filter(([, ok]) => !ok).map(([key]) => key);
  return { ok: missing.length === 0, missing };
}
function validateHydrationProbe(value) {
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
  const listClearCount = Number(counters.listClearCount);
  const mediaRemountCount = hasOwn(counters, 'mediaRemountCount') ? Number(counters.mediaRemountCount) : 0;
  const stickerImageReloadCount = hasOwn(counters, 'stickerImageReloadCount') ? Number(counters.stickerImageReloadCount) : 0;
  const photoImageReloadCount = hasOwn(counters, 'photoImageReloadCount') ? Number(counters.photoImageReloadCount) : 0;
  const mediaRemountByIdOk = objectValuesAreZero(counters.mediaRemountCountByCommentId);
  const imageReloadByIdOk = objectValuesAreZero(counters.imageReloadCountByCommentId);
  const stickerReloadByIdOk = hasOwn(counters, 'stickerImageReloadCountByCommentId') ? objectValuesAreZero(counters.stickerImageReloadCountByCommentId) : true;
  const photoReloadByIdOk = hasOwn(counters, 'photoImageReloadCountByCommentId') ? objectValuesAreZero(counters.photoImageReloadCountByCommentId) : true;
  const numbersOk = [listClearCount, mediaRemountCount, stickerImageReloadCount, photoImageReloadCount].every(Number.isFinite);
  const ok = numbersOk && listClearCount === 0 && mediaRemountCount === 0 && stickerImageReloadCount === 0 && photoImageReloadCount === 0 && mediaRemountByIdOk && imageReloadByIdOk && stickerReloadByIdOk && photoReloadByIdOk;
  return { ok, counters: { listClearCount, mediaRemountCount, stickerImageReloadCount, photoImageReloadCount, mediaRemountByIdOk, imageReloadByIdOk, stickerReloadByIdOk, photoReloadByIdOk } };
}
function validateBrowserProbe(id, value) {
  if (id === 'sticker_renderer_contract_probe') return validateStickerRendererProbe(value);
  if (id === 'reopen_hydration_stability_probe') return validateHydrationProbe(value);
  return { ok: Boolean(value && typeof value === 'object' && (value.ok === true || value.status === 'pass' || value.status === 'passed' || value.status === 'ok')), reason: 'structured_pass_required' };
}
function recalcReportAfterBrowserResults(report, browserResults) {
  const required = report?.uiStability?.browserProbeRequirements?.requiredProbeIds || [];
  const validations = Object.fromEntries(required.map((id) => [id, validateBrowserProbe(id, probeValueFor(browserResults, id))]));
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
    report.fixtures.cleanupRequired = !fullOk;
    report.fixtures.reason = fullOk ? 'Browser probes passed; full self-test is green.' : 'Fixtures are preserved because the full self-test is not green yet.';
  }
  return report;
}
function applyBrowserProbeResult(input = {}) {
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
  const shouldCleanup = report.ok && (input.cleanup === true || report.fixtures?.cleanupMode === 'auto');
  if (shouldCleanup) {
    report.cleanup = resetKey(commentKey);
    if (report.fixtures) {
      report.fixtures.preserved = false;
      report.fixtures.cleanupRequired = false;
      report.fixtures.cleanupHint = '';
      report.fixtures.reason = input.cleanup === true ? 'Browser probes passed and cleanup was requested explicitly.' : 'Browser probes passed; auto cleanup removed preserved fixtures.';
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
  resetKey(commentKey);
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
  const shouldCleanup = cleanupMode === true || (cleanupMode === 'auto' && fullOk);
  const fixturesPreserved = !shouldCleanup;
  const cleanupHint = fixturesPreserved ? `/debug/selftest/comments/full?cleanup=1&commentKey=${encodeURIComponent(commentKey)}` : '';
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
    fixtures: { preserved: fixturesPreserved, cleanupMode, cleanupRequired: fixturesPreserved, cleanupHint, commentKey, reason: fixturesPreserved ? 'Fixtures are preserved because the full self-test is not green yet.' : 'Fixtures cleaned because cleanup was explicit or the full self-test passed.' },
    telemetry: { clientContract: '__adminkitCommentsPerf', browserResultEndpoint: '/debug/selftest/comments/browser-result', browserResultSchema: { sticker_renderer_contract_probe: { checks: { standaloneStickerMedia: true, noRegularBubbleVisuals: true, timeDoesNotIntersectMediaBox: true, stableMediaBoxBeforeImageLoad: true } }, reopen_hydration_stability_probe: { counters: { listClearCount: 0, mediaRemountCountByCommentId: {}, imageReloadCountByCommentId: {} } } }, requiredCounters: ['listClearCount', 'mediaRemountCountByCommentId', 'imageReloadCountByCommentId'], requiredTimings: ['openStartedAt', 'fetchStartedAt', 'fetchFinishedAt', 'firstCommentRenderedAt', 'mediaSettledAt', 'stickerPanelOpenStartedAt', 'stickerPanelOpenedAt', 'stickerSendStartedAt', 'stickerSendConfirmedAt'] },
    warnings,
    failures,
    tests
  };
  latestReport = report;
  if (shouldCleanup) report.cleanup = resetKey(commentKey);
  return report;
}
function getLatestReport() { return latestReport || { ok: false, backendOk: false, runtimeVersion: RUNTIME, error: 'selftest_not_run_yet' }; }
module.exports = { RUNTIME, SELFTEST_KEY_PREFIX, isSelftestKey, runFullCommentsSelftest, applyBrowserProbeResult, getLatestReport };
