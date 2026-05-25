'use strict';

const core = require('./postPatcher');
const db = require('../cc5-db-core');
const timing = require('../v3-ui-timing-cc8');
const {
  savePost,
  saveChannel,
  makeCommentKey,
  getPost,
  getComments,
  makeHandoffToken,
  saveHandoff
} = require('../store');
const {
  buildCommentsKeyboard,
  buildMiniAppLaunchUrl,
  buildBotStartLink,
  buildStableOpenPayload,
  editMessage,
  buildGiftKeyboardRows
} = require('./maxApi');
const { findGiftCampaignForPost } = require('./giftService');
const { buildCustomKeyboardRows } = require('./keyboardBuilderService');
const pollService = require('./pollService');

const FAST_RUNTIME = 'CC8.1.16-FAST-PATCH-CORE-PR76';
const EVENT_LIMIT = 80;
const queues = new Map();
const events = [];
const stats = {
  runtimeVersion: FAST_RUNTIME,
  totalRequests: 0,
  startedRuns: 0,
  finishedRuns: 0,
  coalescedRequests: 0,
  activeKeys: 0,
  lastDurationMs: 0,
  lastCommentKey: '',
  lastResultOk: null,
  fastCore: true
};

function clean(value) { return String(value || '').trim(); }
function clone(value, fallback = null) { try { return JSON.parse(JSON.stringify(value ?? fallback)); } catch { return fallback; } }
function normalizeAttachments(value) { return Array.isArray(value) ? clone(value, []) : []; }
function stripInlineKeyboard(value) { return normalizeAttachments(value).filter((item) => item && item.type !== 'inline_keyboard'); }
function stableStringify(value) { return JSON.stringify(value || []); }
function nowIso() { return new Date().toISOString(); }

function logTiming(name, startedAt, payload = {}) {
  const durationMs = Math.max(0, Date.now() - Number(startedAt || Date.now()));
  try {
    timing.log(name, { ...(payload || {}), durationMs, fastPatchRuntime: FAST_RUNTIME, source: 'postPatcherFast76' });
  } catch {}
  return durationMs;
}

function pushEvent(name, payload = {}) {
  const item = {
    at: nowIso(),
    runtimeVersion: FAST_RUNTIME,
    name: clean(name),
    commentKey: clean(payload.commentKey),
    status: clean(payload.status),
    reason: clean(payload.reason),
    durationMs: Number(payload.durationMs || 0) || 0,
    coalescedCount: Number(payload.coalescedCount || 0) || 0,
    queueSize: Number(payload.queueSize || 0) || 0,
    activeKeys: Number(payload.activeKeys || queues.size) || 0,
    ok: payload.ok === undefined ? undefined : Boolean(payload.ok)
  };
  events.push(item);
  if (events.length > EVENT_LIMIT) events.splice(0, events.length - EVENT_LIMIT);
  try {
    timing.log(item.name, {
      commentKey: item.commentKey,
      status: item.status,
      reason: item.reason || (item.coalescedCount ? `coalesced:${item.coalescedCount}` : ''),
      durationMs: item.durationMs,
      fastPatchRuntime: FAST_RUNTIME,
      source: 'postPatcherFast76'
    });
  } catch {}
  return item;
}

function getOriginalAttachments(post = {}) {
  const raw = post.sourceAttachments || post.attachments || post.originalAttachments || [];
  return stripInlineKeyboard(raw);
}

function highlightText(post = {}, originalText = '') {
  const txt = String(originalText || post.originalText || post.postText || post.title || '');
  const h = post && post.highlight && post.highlight.enabled ? post.highlight : null;
  if (!h) return txt;
  const label = clean(h.label || '⭐ Важно');
  return label + (txt ? '\n\n' + txt : '');
}

function resolveMessageId({ messageId = '', postId = '', existingPost = null } = {}) {
  return clean(messageId || existingPost?.messageId || postId);
}

function shouldLoadPollRows(post = {}, options = {}) {
  if (options.forcePollRows || options.pollId) return true;
  return Boolean(post.lastPollRowsCount || post.lastPollPatchId || post.pollId || post.activePollId || post.hasPoll || post.pollEnabled);
}

async function buildPollRowsFast(post, commentKey, options = {}) {
  if (!shouldLoadPollRows(post, options)) return { rows: [], skipped: true, reason: 'no_poll_marker' };
  const rows = await pollService.buildPollKeyboardRows({
    channelId: post.channelId,
    postId: post.postId,
    commentKey,
    pollId: options.pollId || post.lastPollPatchId || post.pollId || post.activePollId || ''
  });
  return { rows: Array.isArray(rows) ? rows : [], skipped: false };
}

function scheduleDbSync(reason = 'async', payload = {}) {
  const commentKey = clean(payload.commentKey);
  setTimeout(async () => {
    const startedAt = Date.now();
    try {
      const result = await core.syncPatchedPostToDb({ ...payload, source: payload.source || `post_patcher_fast76_${reason}` });
      logTiming('patch.fast.db_sync_async.end', startedAt, {
        commentKey,
        status: result?.ok ? 'ok' : 'unknown',
        registered: Number(result?.registered || 0),
        adminsCount: Array.isArray(result?.admins) ? result.admins.length : 0,
        skipped: Boolean(result?.skipped),
        reason: clean(result?.reason || reason)
      });
    } catch (error) {
      logTiming('patch.fast.db_sync_async.end', startedAt, { commentKey, status: 'error', reason: clean(error?.message || error || reason) });
    }
  }, 0);
}

async function fastPatchStoredPostRaw(options = {}) {
  const computeStartedAt = Date.now();
  const commentKey = clean(options.commentKey);
  pushEvent('patch.compute.begin', { commentKey, status: 'started' });

  const resolveStartedAt = Date.now();
  let post = getPost(commentKey);
  if (!post) {
    logTiming('patch.compute.resolve_post.end', resolveStartedAt, { commentKey, status: 'missing', reason: 'post_not_found' });
    logTiming('patch.compute.end', computeStartedAt, { commentKey, status: 'skipped', reason: 'post_not_found' });
    return { ok: false, reason: 'post_not_found', runtimeVersion: FAST_RUNTIME };
  }
  if (!post.messageId && post.postId) {
    savePost(commentKey, { messageId: String(post.postId || '') });
    post = getPost(commentKey) || post;
  }
  if (!post.messageId) {
    logTiming('patch.compute.resolve_post.end', resolveStartedAt, { commentKey, status: 'missing', reason: 'message_id_missing', hasPost: true });
    logTiming('patch.compute.end', computeStartedAt, { commentKey, status: 'skipped', reason: 'message_id_missing' });
    return { ok: false, reason: 'message_id_missing', post, runtimeVersion: FAST_RUNTIME };
  }
  logTiming('patch.compute.resolve_post.end', resolveStartedAt, { commentKey, status: 'ok', hasPost: true, hasMessageId: true });

  const snapshotStartedAt = Date.now();
  const originalAttachments = getOriginalAttachments(post);
  const originalText = String(post.originalText || post.postText || post.title || '');
  const originalLink = clone(post.originalLink, null);
  const originalFormat = post.originalFormat !== undefined ? post.originalFormat : undefined;
  logTiming('patch.compute.enrich_live.end', snapshotStartedAt, {
    commentKey,
    status: 'skipped_snapshot_ready',
    reason: 'fast_no_live_getMessage',
    originalAttachmentCount: originalAttachments.length,
    hasOriginalText: Boolean(originalText),
    hasOriginalLink: Boolean(originalLink),
    hasOriginalFormat: originalFormat !== undefined
  });

  const commentsStartedAt = Date.now();
  const commentCount = getComments(commentKey).length;
  logTiming('patch.compute.comments_count.end', commentsStartedAt, { commentKey, status: 'ok', commentCount });

  const handoffStartedAt = Date.now();
  const stablePayload = clean(post.stablePayload || buildStableOpenPayload({
    commentKey,
    postId: post.postId,
    channelId: post.channelId,
    messageId: post.messageId || post.postId
  }));
  const handoffToken = clean(post.handoffToken) || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(post.postId || ''),
    channelId: String(post.channelId || ''),
    messageId: String(post.messageId || ''),
    stablePayload
  });
  if ((handoffToken && handoffToken !== post.handoffToken) || (stablePayload && stablePayload !== post.stablePayload)) {
    savePost(commentKey, { handoffToken, stablePayload });
    post = getPost(commentKey) || post;
  }
  logTiming('patch.compute.handoff_payload.end', handoffStartedAt, { commentKey, status: 'ok', hasHandoffToken: Boolean(handoffToken), hasStablePayload: Boolean(stablePayload) });

  const giftStartedAt = Date.now();
  const giftCampaign = findGiftCampaignForPost({ channelId: post.channelId, postId: post.postId, commentKey });
  const giftRows = giftCampaign ? buildGiftKeyboardRows({ campaign: giftCampaign, commentKey, channelId: post.channelId, postId: post.postId }) : [];
  logTiming('patch.compute.gift_rows.end', giftStartedAt, { commentKey, status: 'ok', hasGiftCampaign: Boolean(giftCampaign), giftRowsCount: giftRows.length });

  const customStartedAt = Date.now();
  const customRows = buildCustomKeyboardRows({
    builder: post.customKeyboard || {},
    appBaseUrl: options.appBaseUrl,
    channelId: post.channelId,
    postId: post.postId,
    commentKey
  });
  logTiming('patch.compute.custom_rows.end', customStartedAt, { commentKey, status: 'ok', customRowsCount: customRows.length });

  const pollStartedAt = Date.now();
  let pollRows = [];
  let pollSkipped = false;
  let pollReason = '';
  try {
    const pollResult = await buildPollRowsFast(post, commentKey, options);
    pollRows = pollResult.rows || [];
    pollSkipped = Boolean(pollResult.skipped);
    pollReason = pollResult.reason || '';
    logTiming('patch.compute.poll_rows.end', pollStartedAt, { commentKey, status: pollSkipped ? 'skipped' : 'ok', reason: pollReason, pollRowsCount: pollRows.length });
  } catch (error) {
    savePost(commentKey, { lastPollRowsComposeError: String(error?.message || error), lastPollRowsComposeErrorAt: Date.now() });
    logTiming('patch.compute.poll_rows.end', pollStartedAt, { commentKey, status: 'error', error: String(error?.message || error), pollRowsCount: 0 });
  }

  const keyboardStartedAt = Date.now();
  const keyboardAttachments = buildCommentsKeyboard({
    appBaseUrl: options.appBaseUrl,
    botUsername: options.botUsername,
    maxDeepLinkBase: options.maxDeepLinkBase,
    handoffToken,
    postId: post.postId,
    channelId: post.channelId,
    commentKey,
    messageId: post.messageId || post.postId,
    count: commentCount,
    extraRows: [...customRows, ...pollRows, ...giftRows],
    buttonSuffix: '',
    primaryButtonText: clean(post?.customKeyboard?.commentButtonText),
    showPrimaryButton: !Boolean(post?.commentsDisabled)
  });
  const mergedAttachments = [...originalAttachments, ...keyboardAttachments];
  const nextText = highlightText(post, originalText);
  const nextFingerprint = stableStringify({ attachments: mergedAttachments, text: nextText, link: originalLink || null, format: originalFormat ?? null });
  logTiming('patch.compute.keyboard_fingerprint.end', keyboardStartedAt, {
    commentKey,
    status: 'ok',
    originalAttachmentCount: originalAttachments.length,
    keyboardAttachmentCount: keyboardAttachments.length,
    attachmentCount: mergedAttachments.length,
    hasText: Boolean(nextText)
  });

  const computeDurationMs = Date.now() - computeStartedAt;
  if (post.lastPatchedFingerprint === nextFingerprint) {
    logTiming('patch.compute.end', computeStartedAt, { commentKey, status: 'skipped', reason: 'already_patched_fast' });
    return { ok: true, commentCount, skipped: true, reason: 'already_patched', stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: FAST_RUNTIME };
  }
  logTiming('patch.compute.end', computeStartedAt, { commentKey, status: 'ready', durationMs: computeDurationMs });

  const editStartedAt = Date.now();
  try {
    timing.log('edit_message_started', {
      durationMs: 0,
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      originalAttachmentCount: originalAttachments.length,
      keyboardAttachmentCount: keyboardAttachments.length,
      attachmentCount: mergedAttachments.length,
      attachmentTypes: mergedAttachments.map((x) => String(x?.type || 'file')).slice(0, 20),
      fastPatchRuntime: FAST_RUNTIME,
      source: 'postPatcherFast76'
    });
    timing.log('patch.edit_api.begin', { durationMs: 0, commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: 'started', fastPatchRuntime: FAST_RUNTIME, source: 'postPatcherFast76' });
    const payload = { botToken: options.botToken, messageId: post.messageId, attachments: mergedAttachments, notify: false };
    if (nextText) payload.text = nextText;
    if (originalLink && typeof originalLink === 'object') payload.link = clone(originalLink, null);
    if (originalFormat !== undefined && originalFormat !== null) payload.format = originalFormat;
    const rawPatchResult = await editMessage(payload);
    const editDurationMs = Date.now() - editStartedAt;
    const patchResult = rawPatchResult && typeof rawPatchResult === 'object' ? rawPatchResult : { ok: true, emptyBody: true };
    patchResult.durationMs = editDurationMs;
    timing.log('edit_message_ok', { durationMs: editDurationMs, commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: 'ok', fastPatchRuntime: FAST_RUNTIME, source: 'postPatcherFast76' });
    timing.log('patch.edit_api.end', { durationMs: editDurationMs, commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: 'ok', fastPatchRuntime: FAST_RUNTIME, source: 'postPatcherFast76' });
    savePost(commentKey, {
      patchedAttachments: mergedAttachments,
      lastPatchedText: nextText,
      lastPatchedFingerprint: nextFingerprint,
      lastPatchedAt: Date.now(),
      lastPatchError: null,
      stablePayload,
      handoffToken,
      giftCampaignId: giftCampaign?.id || '',
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length || post.lastPollRowsCount || 0,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: FAST_RUNTIME
    });
    scheduleDbSync('after_edit', {
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      title: originalText || post.originalText || post.postId,
      channelTitle: post.channelTitle,
      linkedByUserId: post.linkedByUserId,
      linkedByName: post.linkedByName,
      commentKey,
      originalText,
      sourceAttachments: originalAttachments,
      originalLink,
      originalFormat,
      handoffToken,
      stablePayload,
      customKeyboard: post.customKeyboard || {},
      commentsDisabled: Boolean(post?.commentsDisabled),
      giftCampaignId: giftCampaign?.id || post.giftCampaignId || '',
      source: 'post_patcher_fast76_after_edit'
    });
    return { ok: true, commentCount, patchResult, giftCampaignId: giftCampaign?.id || '', stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: FAST_RUNTIME };
  } catch (error) {
    const editDurationMs = Date.now() - editStartedAt;
    const patchError = { status: error?.status || 0, message: error?.message || 'patch_failed', data: error?.data || null };
    savePost(commentKey, { lastPatchError: patchError, lastPatchAttemptAt: Date.now(), stablePayload, giftCampaignId: giftCampaign?.id || '', lastSafeComposeRuntime: FAST_RUNTIME });
    timing.log('edit_message_failed', { durationMs: editDurationMs, commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: 'error', error: patchError.message, fastPatchRuntime: FAST_RUNTIME, source: 'postPatcherFast76' });
    timing.log('patch.edit_api.end', { durationMs: editDurationMs, commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: 'error', error: patchError.message, fastPatchRuntime: FAST_RUNTIME, source: 'postPatcherFast76' });
    return { ok: false, commentCount, error: patchError, giftCampaignId: giftCampaign?.id || '', stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: FAST_RUNTIME };
  }
}

function resolveWaiters(waiters = [], result = null, error = null) {
  waiters.forEach((waiter) => {
    try { error ? waiter.reject(error) : waiter.resolve(result); } catch {}
  });
}

function runNext(commentKey, state) {
  if (!state || state.running || !state.pendingOptions) return;
  const options = state.pendingOptions;
  const waiters = state.pendingWaiters.splice(0);
  const coalescedCount = state.coalescedCount;
  state.pendingOptions = null;
  state.coalescedCount = 0;
  state.running = true;
  stats.startedRuns += 1;
  stats.activeKeys = queues.size;
  const startedAt = Date.now();
  pushEvent('patch.compute.begin', { commentKey, status: 'running', coalescedCount, queueSize: waiters.length, activeKeys: queues.size });
  fastPatchStoredPostRaw(options).then((result) => {
    const durationMs = Date.now() - startedAt;
    stats.finishedRuns += 1;
    stats.lastDurationMs = durationMs;
    stats.lastCommentKey = commentKey;
    stats.lastResultOk = Boolean(result && result.ok);
    pushEvent('patch.done', { commentKey, status: result?.ok ? 'ok' : 'error', ok: Boolean(result?.ok), reason: result?.reason || result?.error?.message || '', durationMs, coalescedCount, queueSize: waiters.length, activeKeys: queues.size });
    resolveWaiters(waiters, result, null);
  }).catch((error) => {
    const durationMs = Date.now() - startedAt;
    stats.finishedRuns += 1;
    stats.lastDurationMs = durationMs;
    stats.lastCommentKey = commentKey;
    stats.lastResultOk = false;
    pushEvent('patch.done', { commentKey, status: 'exception', ok: false, reason: error?.message || 'patch_exception', durationMs, coalescedCount, queueSize: waiters.length, activeKeys: queues.size });
    resolveWaiters(waiters, null, error);
  }).finally(() => {
    state.running = false;
    if (state.pendingOptions) setImmediate(() => runNext(commentKey, state));
    else {
      queues.delete(commentKey);
      stats.activeKeys = queues.size;
    }
  });
}

function fastPatchStoredPost(options = {}) {
  const commentKey = clean(options.commentKey);
  stats.totalRequests += 1;
  pushEvent('patch.request.received', { commentKey, status: 'queued', activeKeys: queues.size });
  if (!commentKey) return fastPatchStoredPostRaw(options);
  let state = queues.get(commentKey);
  if (!state) {
    state = { running: false, pendingOptions: null, pendingWaiters: [], coalescedCount: 0 };
    queues.set(commentKey, state);
  }
  return new Promise((resolve, reject) => {
    if (state.running || state.pendingOptions) {
      state.coalescedCount += 1;
      stats.coalescedRequests += 1;
      pushEvent('patch.repatch.coalesced_count', { commentKey, status: 'coalesced', coalescedCount: state.coalescedCount, queueSize: state.pendingWaiters.length + 1, activeKeys: queues.size });
    }
    state.pendingOptions = { ...options, commentKey };
    state.pendingWaiters.push({ resolve, reject });
    runNext(commentKey, state);
  });
}

async function fastTryPatchChannelPost({
  botToken,
  appBaseUrl,
  botUsername,
  maxDeepLinkBase,
  channelId,
  postId,
  messageId,
  originalText,
  sourceAttachments,
  originalLink,
  originalFormat,
  nativeReactions = [],
  channelTitle,
  linkedByUserId,
  linkedByName,
  autoMode = false
}) {
  const bootstrapStartedAt = Date.now();
  const commentKey = makeCommentKey(channelId, postId);
  const existingPost = getPost(commentKey);
  const resolvedMessageId = resolveMessageId({ messageId, postId, existingPost });
  const stablePayload = buildStableOpenPayload({ commentKey, postId, channelId, messageId: resolvedMessageId });
  const handoffToken = clean(existingPost?.handoffToken) || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(postId || ''),
    channelId: String(channelId || ''),
    messageId: String(resolvedMessageId || ''),
    stablePayload
  });
  const postRecord = savePost(commentKey, {
    ...(existingPost || {}),
    postId: String(postId || ''),
    channelId: String(channelId || ''),
    messageId: resolvedMessageId,
    originalText: String(existingPost?.originalText || originalText || ''),
    sourceAttachments: normalizeAttachments(existingPost?.sourceAttachments || sourceAttachments),
    nativeReactions: Array.isArray(nativeReactions) ? clone(nativeReactions, []).slice(0, 8) : [],
    originalLink: clone(existingPost?.originalLink || originalLink, null),
    ...(existingPost?.originalFormat !== undefined ? { originalFormat: existingPost.originalFormat } : (originalFormat !== undefined ? { originalFormat } : {})),
    channelTitle: clean(existingPost?.channelTitle || channelTitle || ''),
    textOverrideActive: false,
    linkedByUserId: clean(existingPost?.linkedByUserId || linkedByUserId || ''),
    linkedByName: clean(existingPost?.linkedByName || linkedByName || ''),
    autoMode: Boolean(autoMode),
    handoffToken,
    stablePayload,
    customKeyboard: existingPost?.customKeyboard || {},
    createdAt: existingPost?.createdAt || Date.now(),
    lastFastBootstrapAt: Date.now()
  });
  saveChannel(channelId, {
    lastPostId: String(postId || ''),
    lastMessageId: String(resolvedMessageId || ''),
    linkedByUserId: clean(linkedByUserId),
    linkedByName: clean(linkedByName),
    ...(clean(channelTitle) ? { title: clean(channelTitle) } : {}),
    autoModeEnabled: true
  });
  scheduleDbSync('bootstrap', {
    channelId,
    postId,
    messageId: resolvedMessageId,
    title: postRecord.originalText || originalText || postId,
    channelTitle,
    linkedByUserId,
    linkedByName,
    commentKey,
    originalText: postRecord.originalText || originalText || '',
    sourceAttachments: postRecord.sourceAttachments || sourceAttachments || [],
    originalLink: postRecord.originalLink || originalLink || null,
    originalFormat: postRecord.originalFormat !== undefined ? postRecord.originalFormat : originalFormat,
    handoffToken,
    stablePayload,
    customKeyboard: postRecord?.customKeyboard || {},
    commentsDisabled: Boolean(postRecord?.commentsDisabled),
    giftCampaignId: postRecord?.giftCampaignId || '',
    source: 'post_patcher_fast76_bootstrap'
  });
  const patchAttempt = await fastPatchStoredPost({ botToken, appBaseUrl, botUsername, maxDeepLinkBase, commentKey });
  logTiming('patch.bootstrap.total.end', bootstrapStartedAt, { commentKey, status: patchAttempt?.ok ? 'ok' : 'error', ok: Boolean(patchAttempt?.ok), reason: patchAttempt?.reason || patchAttempt?.error?.message || '' });
  return {
    commentKey,
    botStartLink: buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId: resolvedMessageId }),
    miniAppLink: buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId: resolvedMessageId }),
    fallbackLink: `${String(appBaseUrl || '').replace(/\/$/, '')}/fallback?postId=${encodeURIComponent(String(postId || ''))}`,
    post: postRecord,
    patchResult: patchAttempt.ok ? patchAttempt.patchResult : null,
    patchError: patchAttempt.ok ? null : patchAttempt.error || { message: patchAttempt.reason || 'patch_failed' },
    commentCount: patchAttempt.commentCount || 0,
    giftCampaignId: patchAttempt.giftCampaignId || '',
    stablePayload: patchAttempt.stablePayload || stablePayload,
    customRowsCount: patchAttempt.customRowsCount || 0,
    pollRowsCount: patchAttempt.pollRowsCount || 0,
    giftRowsCount: patchAttempt.giftRowsCount || 0,
    runtimeVersion: FAST_RUNTIME
  };
}

function getSnapshot() {
  return { ...stats, activeKeys: queues.size, events: events.slice(-EVENT_LIMIT) };
}

function install() {
  if (core.__adminkitFastPatch76Installed) return { ok: true, already: true, runtimeVersion: FAST_RUNTIME };
  core.__adminkitFastPatch76Installed = true;
  core.patchStoredPost = fastPatchStoredPost;
  core.tryPatchChannelPost = fastTryPatchChannelPost;
  core.patchStoredPostRawFast76 = fastPatchStoredPostRaw;
  core.getPatchCoalescingSnapshot = getSnapshot;
  core.PATCH_COALESCE_RUNTIME = FAST_RUNTIME;
  core.FAST_PATCH_RUNTIME = FAST_RUNTIME;
  return { ok: true, runtimeVersion: FAST_RUNTIME, mode: 'monkey-patched-postPatcher-exports', noLiveGetMessageDefault: true, asyncDbSync: true, fakeCallbackSafe: true };
}

module.exports = {
  FAST_RUNTIME,
  install,
  fastPatchStoredPost,
  fastPatchStoredPostRaw,
  fastTryPatchChannelPost,
  getSnapshot
};
