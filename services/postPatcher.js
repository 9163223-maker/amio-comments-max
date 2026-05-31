const db = require('../cc5-db-core');
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
  buildGiftKeyboardRows,
  getMessage
} = require('./maxApi');
const { findGiftCampaignForPost } = require('./giftService');
const { buildCustomKeyboardRows } = require('./keyboardBuilderService');
const pollService = require('./pollService');

const DB_SYNC_RUNTIME = 'CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE';
const PATCH_COALESCE_RUNTIME = 'CC8.1.10-PATCH-REPATCH-COALESCING';
const PATCH_COMPUTE_BREAKDOWN_RUNTIME = 'CC8.1.15-PATCH-COMPUTE-BREAKDOWN';
const POST_PATCHER_CLEAN_CORE_RUNTIME = 'CC8.1.16-POST-PATCHER-CLEAN-CORE-PR77';
const PATCH_COALESCE_EVENT_LIMIT = 50;

const patchCoalescingQueues = new Map();
const patchCoalescingEvents = [];
const dbSyncQueues = new Map();
let dbSyncSequence = 0;
let postPatchTraceHooks = [];

const patchCoalescingStats = {
  runtimeVersion: PATCH_COALESCE_RUNTIME,
  cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME,
  totalRequests: 0,
  startedRuns: 0,
  finishedRuns: 0,
  coalescedRequests: 0,
  activeKeys: 0,
  lastDurationMs: 0,
  lastCommentKey: '',
  lastResultOk: null
};

function clean(value) {
  return String(value || '').trim();
}

function cloneObject(value, fallback = null) {
  if (!value || typeof value !== 'object') return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeAttachments(value) {
  return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [];
}

function stripInlineKeyboard(value) {
  return normalizeAttachments(value).filter((item) => item && item.type !== 'inline_keyboard');
}

function stableStringify(value) {
  return JSON.stringify(value || {});
}

function setPostPatchTraceHook(fn) {
  postPatchTraceHooks = typeof fn === 'function' ? [fn] : [];
}

function addPostPatchTraceHook(fn) {
  if (typeof fn !== 'function') return false;
  if (!postPatchTraceHooks.includes(fn)) postPatchTraceHooks.push(fn);
  return true;
}

function emitPostPatchTrace(event, payload = {}) {
  for (const hook of postPatchTraceHooks.slice()) {
    try {
      hook(event, payload);
    } catch {}
  }
}

function emitPatchStep(name, startedAt, payload = {}) {
  emitPostPatchTrace(name, {
    ...(payload || {}),
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME,
    breakdownRuntime: PATCH_COMPUTE_BREAKDOWN_RUNTIME,
    durationMs: Math.max(0, Date.now() - Number(startedAt || Date.now()))
  });
}

function pushPatchCoalescingEvent(name = '', payload = {}) {
  const item = {
    at: new Date().toISOString(),
    runtimeVersion: PATCH_COALESCE_RUNTIME,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME,
    name: clean(name),
    commentKey: clean(payload.commentKey),
    status: clean(payload.status),
    reason: clean(payload.reason),
    durationMs: Number(payload.durationMs || 0) || 0,
    coalescedCount: Number(payload.coalescedCount || 0) || 0,
    queueSize: Number(payload.queueSize || 0) || 0,
    activeKeys: Number(payload.activeKeys || 0) || 0,
    ok: payload.ok === undefined ? undefined : Boolean(payload.ok)
  };

  patchCoalescingEvents.push(item);
  if (patchCoalescingEvents.length > PATCH_COALESCE_EVENT_LIMIT) {
    patchCoalescingEvents.splice(0, patchCoalescingEvents.length - PATCH_COALESCE_EVENT_LIMIT);
  }

  emitPostPatchTrace(item.name, {
    commentKey: item.commentKey,
    status: item.status,
    reason: item.reason || (item.coalescedCount ? `coalesced:${item.coalescedCount}` : ''),
    durationMs: item.durationMs
  });
  return item;
}

function getPatchCoalescingSnapshot() {
  return {
    ...patchCoalescingStats,
    activeKeys: patchCoalescingQueues.size,
    events: patchCoalescingEvents.slice(-PATCH_COALESCE_EVENT_LIMIT)
  };
}

function resolvePatchMessageId({ messageId = '', postId = '', existingPost = null } = {}) {
  // MAX can deliver channel/media/forwarded post updates without mid.
  // For patching, never make mid mandatory when seq/postId is available.
  return clean(messageId || existingPost?.messageId || postId);
}

function cloneKeyboardBuilder(value) {
  const out = cloneObject(value, {}) || {};
  if (!Array.isArray(out.rows)) out.rows = [];
  return out;
}

function highlightText(post = {}, originalText = '') {
  const txt = String(originalText || post.originalText || post.postText || '');
  const h = post && post.highlight && post.highlight.enabled ? post.highlight : null;
  if (!h) return txt;
  const label = clean(h.label || '⭐ Важно');
  return label + (txt ? '\n\n' + txt : '');
}

function hasUsefulOriginalSnapshot(post = {}) {
  if (clean(post.originalText)) return true;
  if (Array.isArray(post.sourceAttachments) && post.sourceAttachments.length > 0) return true;
  if (post.originalLink && typeof post.originalLink === 'object') return true;
  if (post.originalFormat !== undefined && post.originalFormat !== null) return true;
  return false;
}

function snapshotKnown(post = {}) {
  // PR77 hardening: do not treat mere field presence as a complete snapshot.
  // Empty partial forwarded/media payloads must still be allowed to hydrate from live getMessage.
  if (hasUsefulOriginalSnapshot(post)) return true;
  return Boolean(
    post.originalTextKnown === true ||
    post.sourceAttachmentsKnown === true ||
    post.originalLinkKnown === true ||
    post.originalFormatKnown === true ||
    (post.originalSnapshotCaptured === true && post.originalSnapshotEmptyKnown === true)
  );
}

function shouldHydrateOriginalFromLive({
  post = {},
  originalAttachments = [],
  originalText = '',
  originalLink = null,
  originalFormat = undefined
} = {}) {
  if (clean(originalText)) return false;
  if (Array.isArray(originalAttachments) && originalAttachments.length > 0) return false;
  if (originalLink) return false;
  if (originalFormat !== undefined) return false;
  if (snapshotKnown(post)) return false;
  return true;
}

function shouldBuildPollRows(post = {}) {
  if (!post || typeof post !== 'object') return false;
  if (post.pollId || post.activePollId || post.lastPollPatchId || post.hasPoll || post.pollEnabled || post.pollConfig || post.poll) return true;
  if (Number(post.lastPollRowsCount || 0) > 0) return true;
  return false;
}

function buildPostSnapshotRaw(input = {}) {
  const messageId = resolvePatchMessageId({ messageId: input.messageId, postId: input.postId });
  return {
    source: clean(input.source || 'post_patcher'),
    runtimeVersion: DB_SYNC_RUNTIME,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME,
    commentKey: clean(input.commentKey),
    channelId: clean(input.channelId),
    postId: clean(input.postId),
    messageId,
    title: clean(input.title || input.originalText || input.postId),
    channelTitle: clean(input.channelTitle || input.channelId),
    originalText: String(input.originalText || ''),
    originalFormat: input.originalFormat === undefined ? null : input.originalFormat,
    originalLink: cloneObject(input.originalLink, null),
    sourceAttachments: stripInlineKeyboard(input.sourceAttachments || []),
    handoffToken: clean(input.handoffToken),
    stablePayload: clean(input.stablePayload),
    linkedByUserId: clean(input.linkedByUserId),
    linkedByName: clean(input.linkedByName),
    customKeyboard: cloneKeyboardBuilder(input.customKeyboard),
    commentsDisabled: Boolean(input.commentsDisabled),
    giftCampaignId: clean(input.giftCampaignId),
    originalSnapshotCaptured: true,
    originalSnapshotEmptyKnown: false,
    patchedAt: new Date().toISOString()
  };
}

async function adminIdsForChannel(channelId, fallbackAdminId = '') {
  const ids = new Set();
  const fallback = clean(fallbackAdminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  if (fallback) ids.add(fallback);
  try {
    await db.init();
    const result = await db.query(
      'select admin_id from ak_admin_channels where channel_id=$1 order by updated_at desc limit 20',
      [String(channelId || '')]
    );
    for (const row of result.rows || []) {
      if (row.admin_id) ids.add(String(row.admin_id));
    }
  } catch {}
  return [...ids];
}

async function syncPatchedPostToDb(input = {}) {
  const channelId = clean(input.channelId);
  const postId = clean(input.postId);
  if (!channelId || !postId || channelId === 'CHANNEL_ID' || postId === 'POST_ID') {
    return { ok: true, skipped: true, reason: 'invalid_channel_or_post' };
  }

  const commentKey = clean(input.commentKey || `${channelId}:${postId}`);
  const messageId = resolvePatchMessageId({ messageId: input.messageId, postId });
  const stablePayload = clean(input.stablePayload || buildStableOpenPayload({ commentKey, channelId, postId, messageId }));
  const raw = buildPostSnapshotRaw({
    ...input,
    commentKey,
    channelId,
    postId,
    messageId,
    stablePayload,
    title: input.title || input.originalText || postId
  });

  const admins = await adminIdsForChannel(channelId, input.linkedByUserId);
  const registered = [];
  for (const adminId of admins) {
    const result = await db.upsertPost(
      adminId,
      channelId,
      postId,
      String(input.title || input.originalText || postId).slice(0, 120),
      raw,
      messageId
    );
    if (result) registered.push(result);
  }

  return {
    ok: true,
    runtimeVersion: DB_SYNC_RUNTIME,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME,
    registered: registered.length,
    admins,
    channelId,
    postId,
    commentKey,
    stablePayload,
    messageId
  };
}

function schedulePatchedPostDbSync(reason = 'after_edit', payload = {}) {
  const commentKey = clean(payload.commentKey || `${payload.channelId || ''}:${payload.postId || ''}`);
  const scheduledAt = Date.now();
  const syncId = ++dbSyncSequence;
  const previous = dbSyncQueues.get(commentKey) || Promise.resolve();

  const run = previous.catch(() => null).then(async () => {
    const startedAt = Date.now();
    try {
      const result = await syncPatchedPostToDb({
        ...payload,
        source: payload.source || `post_patcher_clean_core_${reason}`
      });
      emitPatchStep('patch.db_sync_async.end', startedAt, {
        commentKey,
        status: result?.ok ? 'ok' : 'unknown',
        registered: Number(result?.registered || 0),
        adminsCount: Array.isArray(result?.admins) ? result.admins.length : 0,
        skipped: Boolean(result?.skipped),
        reason: clean(result?.reason || reason),
        syncId,
        scheduledDelayMs: Math.max(0, startedAt - scheduledAt)
      });
    } catch (error) {
      emitPatchStep('patch.db_sync_async.end', startedAt, {
        commentKey,
        status: 'error',
        reason: clean(error?.message || error || reason),
        syncId,
        scheduledDelayMs: Math.max(0, startedAt - scheduledAt)
      });
    }
  });

  dbSyncQueues.set(commentKey, run.finally(() => {
    if (dbSyncQueues.get(commentKey) === run) dbSyncQueues.delete(commentKey);
  }));

  return {
    ok: true,
    scheduled: true,
    reason,
    commentKey,
    syncId,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
  };
}

async function enrichOriginalFromLive({ botToken, post, commentKey }) {
  let originalAttachments = stripInlineKeyboard(post.sourceAttachments || post.attachments || []);
  let originalText = String(post.originalText || '');
  let originalLink = cloneObject(post.originalLink, null);
  let originalFormat = post.originalFormat !== undefined ? post.originalFormat : undefined;
  const hydrate = shouldHydrateOriginalFromLive({
    post,
    originalAttachments,
    originalText,
    originalLink,
    originalFormat
  });

  if (hydrate && botToken && post.messageId) {
    try {
      const liveMessage = await getMessage({ botToken, messageId: post.messageId });
      const liveBody = liveMessage?.body && typeof liveMessage.body === 'object' ? liveMessage.body : {};
      const liveAttachments = stripInlineKeyboard(Array.isArray(liveBody.attachments) ? liveBody.attachments : []);
      const liveLink = cloneObject(liveBody.link, null);

      if (!originalAttachments.length && liveAttachments.length) originalAttachments = liveAttachments;
      if (!originalText && liveBody.text) originalText = String(liveBody.text || '');
      if (!originalLink && liveLink) originalLink = liveLink;
      if (originalFormat === undefined && liveBody.format !== undefined) originalFormat = liveBody.format;

      savePost(commentKey, {
        sourceAttachments: normalizeAttachments(originalAttachments),
        originalText,
        originalLink,
        ...(originalFormat !== undefined ? { originalFormat } : {}),
        originalSnapshotCaptured: true,
        originalSnapshotEmptyKnown: !originalText && !originalAttachments.length && !originalLink && originalFormat === undefined,
        originalHydratedFromLiveAt: Date.now(),
        originalHydratedFromLiveRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
      });
      post = getPost(commentKey) || post;
    } catch {}
  }

  return {
    post,
    originalAttachments,
    originalText,
    originalLink,
    originalFormat,
    hydratedFromLive: hydrate
  };
}

async function patchStoredPostRaw({ botToken, appBaseUrl, botUsername, maxDeepLinkBase, commentKey }) {
  const computeStartedAt = Date.now();
  emitPostPatchTrace('patch.compute.begin', {
    commentKey,
    status: 'started',
    breakdownRuntime: PATCH_COMPUTE_BREAKDOWN_RUNTIME,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
  });

  const resolveStartedAt = Date.now();
  let post = getPost(commentKey);
  if (!post) {
    emitPatchStep('patch.compute.resolve_post.end', resolveStartedAt, { commentKey, status: 'missing', reason: 'post_not_found' });
    emitPostPatchTrace('patch.compute.end', { commentKey, status: 'skipped', reason: 'post_not_found', durationMs: Date.now() - computeStartedAt });
    return { ok: false, reason: 'post_not_found' };
  }

  if (!post.messageId && post.postId) {
    savePost(commentKey, { messageId: String(post.postId || '') });
    post = getPost(commentKey) || post;
  }

  if (!post.messageId) {
    emitPatchStep('patch.compute.resolve_post.end', resolveStartedAt, { commentKey, status: 'missing', reason: 'message_id_missing', hasPost: true });
    emitPostPatchTrace('patch.compute.end', { commentKey, status: 'skipped', reason: 'message_id_missing', durationMs: Date.now() - computeStartedAt });
    return { ok: false, reason: 'message_id_missing', post, runtimeVersion: DB_SYNC_RUNTIME };
  }

  emitPatchStep('patch.compute.resolve_post.end', resolveStartedAt, { commentKey, status: 'ok', hasPost: true, hasMessageId: true });

  const liveStartedAt = Date.now();
  const live = await enrichOriginalFromLive({ botToken, post, commentKey });
  post = live.post;
  const { originalAttachments, originalText, originalLink, originalFormat, hydratedFromLive } = live;
  emitPatchStep('patch.compute.enrich_live.end', liveStartedAt, {
    commentKey,
    status: hydratedFromLive ? 'hydrated_or_attempted' : 'skipped_snapshot_ready',
    reason: hydratedFromLive ? 'snapshot_missing' : 'snapshot_ready_no_live_getMessage',
    stillNeedsHydration: shouldHydrateOriginalFromLive({ post, originalAttachments, originalText, originalLink, originalFormat }),
    originalAttachmentCount: originalAttachments.length,
    hasOriginalText: Boolean(originalText),
    hasOriginalLink: Boolean(originalLink),
    hasOriginalFormat: originalFormat !== undefined
  });

  const commentsStartedAt = Date.now();
  const commentCount = getComments(commentKey).length;
  emitPatchStep('patch.compute.comments_count.end', commentsStartedAt, { commentKey, status: 'ok', commentCount });

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

  emitPatchStep('patch.compute.handoff_payload.end', handoffStartedAt, {
    commentKey,
    status: 'ok',
    hasHandoffToken: Boolean(handoffToken),
    hasStablePayload: Boolean(stablePayload)
  });

  const giftStartedAt = Date.now();
  const giftCampaign = findGiftCampaignForPost({ channelId: post.channelId, postId: post.postId });
  const giftRows = giftCampaign
    ? buildGiftKeyboardRows({ campaign: giftCampaign, commentKey, channelId: post.channelId, postId: post.postId })
    : [];
  emitPatchStep('patch.compute.gift_rows.end', giftStartedAt, {
    commentKey,
    status: 'ok',
    hasGiftCampaign: Boolean(giftCampaign),
    giftRowsCount: giftRows.length
  });

  const customStartedAt = Date.now();
  const customRows = buildCustomKeyboardRows({
    builder: post.customKeyboard || {},
    appBaseUrl,
    channelId: post.channelId,
    postId: post.postId,
    commentKey
  });
  emitPatchStep('patch.compute.custom_rows.end', customStartedAt, {
    commentKey,
    status: 'ok',
    customRowsCount: customRows.length
  });

  const pollStartedAt = Date.now();
  let pollRows = [];
  if (shouldBuildPollRows(post)) {
    try {
      pollRows = await pollService.buildPollKeyboardRows({
        channelId: post.channelId,
        postId: post.postId,
        commentKey
      });
      savePost(commentKey, pollRows.length
        ? { pollRowsKnownEmpty: false, lastPollRowsCount: pollRows.length, lastPollRowsCheckedAt: Date.now() }
        : { pollRowsKnownEmpty: true, pollRowsKnownEmptyAt: Date.now(), lastPollRowsCount: 0, lastPollRowsCheckedAt: Date.now() });
      emitPatchStep('patch.compute.poll_rows.end', pollStartedAt, {
        commentKey,
        status: 'ok',
        pollRowsCount: pollRows.length
      });
    } catch (error) {
      savePost(commentKey, {
        lastPollRowsComposeError: String(error?.message || error),
        lastPollRowsComposeErrorAt: Date.now()
      });
      emitPatchStep('patch.compute.poll_rows.end', pollStartedAt, {
        commentKey,
        status: 'error',
        error: String(error?.message || error),
        pollRowsCount: 0
      });
    }
  } else {
    emitPatchStep('patch.compute.poll_rows.end', pollStartedAt, {
      commentKey,
      status: 'skipped',
      reason: 'no_poll_marker_cached_empty',
      pollRowsCount: 0
    });
  }

  const dbSyncPayload = {
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
    source: 'post_patcher_clean_core_after_edit_snapshot'
  };

  emitPatchStep('patch.compute.db_sync.end', Date.now(), {
    commentKey,
    status: 'deferred',
    skipped: true,
    reason: 'async_after_edit_serialized'
  });

  const keyboardStartedAt = Date.now();
  const keyboardAttachments = buildCommentsKeyboard({
    appBaseUrl,
    botUsername,
    maxDeepLinkBase,
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
  const nextFingerprint = stableStringify({
    attachments: mergedAttachments,
    text: nextText,
    link: originalLink || null,
    format: originalFormat === undefined ? null : originalFormat,
    commentsDisabled: Boolean(post?.commentsDisabled),
    customRowsCount: customRows.length,
    pollRowsCount: pollRows.length,
    giftRowsCount: giftRows.length
  });

  emitPatchStep('patch.compute.keyboard_fingerprint.end', keyboardStartedAt, {
    commentKey,
    status: 'ok',
    originalAttachmentCount: originalAttachments.length,
    keyboardAttachmentCount: keyboardAttachments.length,
    attachmentCount: mergedAttachments.length,
    hasText: Boolean(nextText),
    hasOriginalLink: Boolean(originalLink),
    hasOriginalFormat: originalFormat !== undefined
  });

  const computeDurationMs = Date.now() - computeStartedAt;
  if (post.lastPatchedFingerprint === nextFingerprint) {
    emitPostPatchTrace('patch.compute.end', {
      commentKey,
      status: 'skipped',
      reason: 'already_patched',
      durationMs: computeDurationMs,
      cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
    });
    return {
      ok: true,
      commentCount,
      skipped: true,
      reason: 'already_patched',
      giftCampaignId: giftCampaign?.id || '',
      stablePayload,
      customRowsCount: customRows.length,
      pollRowsCount: pollRows.length,
      giftRowsCount: giftRows.length,
      runtimeVersion: DB_SYNC_RUNTIME,
      cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
    };
  }

  emitPostPatchTrace('patch.compute.end', {
    commentKey,
    status: 'ready',
    durationMs: computeDurationMs,
    breakdownRuntime: PATCH_COMPUTE_BREAKDOWN_RUNTIME,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
  });

  try {
    emitPostPatchTrace('edit_message_started', {
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      originalAttachmentCount: originalAttachments.length,
      keyboardAttachmentCount: keyboardAttachments.length,
      attachmentCount: mergedAttachments.length,
      attachmentTypes: mergedAttachments.map((x) => String(x?.type || 'file')).slice(0, 20)
    });
    emitPostPatchTrace('patch.edit_api.begin', {
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      status: 'started'
    });

    const editStartedAt = Date.now();
    const payload = {
      botToken,
      messageId: post.messageId,
      attachments: mergedAttachments,
      notify: false
    };
    if (nextText) payload.text = nextText;
    if (originalLink && typeof originalLink === 'object') payload.link = cloneObject(originalLink, null);
    if (originalFormat !== undefined && originalFormat !== null) payload.format = originalFormat;

    const rawPatchResult = await editMessage(payload);
    const editDurationMs = Date.now() - editStartedAt;
    const patchResult = rawPatchResult && typeof rawPatchResult === 'object'
      ? rawPatchResult
      : { ok: true, emptyBody: true };
    patchResult.durationMs = editDurationMs;

    emitPostPatchTrace('edit_message_ok', {
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      durationMs: editDurationMs,
      status: 'ok'
    });
    emitPostPatchTrace('patch.edit_api.end', {
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      durationMs: editDurationMs,
      status: 'ok'
    });

    savePost(commentKey, {
      patchedAttachments: mergedAttachments,
      lastPatchedText: nextText,
      lastPatchedFingerprint: nextFingerprint,
      lastPatchedAt: Date.now(),
      lastPatchError: null,
      stablePayload,
      giftCampaignId: giftCampaign?.id || '',
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
    });

    schedulePatchedPostDbSync('after_edit', dbSyncPayload);

    return {
      ok: true,
      commentCount,
      patchResult,
      giftCampaignId: giftCampaign?.id || '',
      stablePayload,
      customRowsCount: customRows.length,
      pollRowsCount: pollRows.length,
      giftRowsCount: giftRows.length,
      runtimeVersion: DB_SYNC_RUNTIME,
      cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
    };
  } catch (error) {
    const patchError = {
      status: error?.status || 0,
      message: error?.message || 'patch_failed',
      data: error?.data || null
    };
    savePost(commentKey, {
      lastPatchError: patchError,
      lastPatchAttemptAt: Date.now(),
      stablePayload,
      giftCampaignId: giftCampaign?.id || '',
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
    });
    emitPostPatchTrace('edit_message_failed', {
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      status: 'error',
      error: patchError.message,
      durationMs: 0
    });
    emitPostPatchTrace('patch.edit_api.end', {
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      status: 'error',
      error: patchError.message,
      durationMs: 0
    });
    return {
      ok: false,
      commentCount,
      error: patchError,
      giftCampaignId: giftCampaign?.id || '',
      stablePayload,
      customRowsCount: customRows.length,
      pollRowsCount: pollRows.length,
      giftRowsCount: giftRows.length,
      runtimeVersion: DB_SYNC_RUNTIME,
      cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
    };
  }
}

function resolveWaiters(waiters = [], result = null, error = null) {
  waiters.forEach((waiter) => {
    try {
      if (error) waiter.reject(error);
      else waiter.resolve(result);
    } catch {}
  });
}

function runNextCoalescedPatch(commentKey, state) {
  if (!state || state.running || !state.pendingOptions) return;

  const options = state.pendingOptions;
  const waiters = state.pendingWaiters.splice(0);
  const coalescedCount = state.coalescedCount;
  state.pendingOptions = null;
  state.coalescedCount = 0;
  state.running = true;

  patchCoalescingStats.startedRuns += 1;
  patchCoalescingStats.activeKeys = patchCoalescingQueues.size;

  const startedAt = Date.now();
  pushPatchCoalescingEvent('patch.compute.begin', {
    commentKey,
    status: 'running',
    coalescedCount,
    queueSize: waiters.length,
    activeKeys: patchCoalescingQueues.size
  });

  patchStoredPostRaw(options).then((result) => {
    const durationMs = Date.now() - startedAt;
    patchCoalescingStats.finishedRuns += 1;
    patchCoalescingStats.lastDurationMs = durationMs;
    patchCoalescingStats.lastCommentKey = commentKey;
    patchCoalescingStats.lastResultOk = Boolean(result && result.ok);
    pushPatchCoalescingEvent('patch.done', {
      commentKey,
      status: result?.ok ? 'ok' : 'error',
      ok: Boolean(result?.ok),
      reason: result?.reason || result?.error?.message || '',
      durationMs,
      coalescedCount,
      queueSize: waiters.length,
      activeKeys: patchCoalescingQueues.size
    });
    resolveWaiters(waiters, result, null);
  }).catch((error) => {
    const durationMs = Date.now() - startedAt;
    patchCoalescingStats.finishedRuns += 1;
    patchCoalescingStats.lastDurationMs = durationMs;
    patchCoalescingStats.lastCommentKey = commentKey;
    patchCoalescingStats.lastResultOk = false;
    pushPatchCoalescingEvent('patch.done', {
      commentKey,
      status: 'exception',
      ok: false,
      reason: error?.message || 'patch_exception',
      durationMs,
      coalescedCount,
      queueSize: waiters.length,
      activeKeys: patchCoalescingQueues.size
    });
    resolveWaiters(waiters, null, error);
  }).finally(() => {
    state.running = false;
    if (state.pendingOptions) {
      setImmediate(() => runNextCoalescedPatch(commentKey, state));
    } else {
      patchCoalescingQueues.delete(commentKey);
      patchCoalescingStats.activeKeys = patchCoalescingQueues.size;
    }
  });
}

function patchStoredPost(options = {}) {
  const commentKey = clean(options.commentKey);
  patchCoalescingStats.totalRequests += 1;
  pushPatchCoalescingEvent('patch.request.received', {
    commentKey,
    status: 'queued',
    activeKeys: patchCoalescingQueues.size
  });

  if (!commentKey) return patchStoredPostRaw(options);

  let state = patchCoalescingQueues.get(commentKey);
  if (!state) {
    state = {
      running: false,
      pendingOptions: null,
      pendingWaiters: [],
      coalescedCount: 0
    };
    patchCoalescingQueues.set(commentKey, state);
  }

  return new Promise((resolve, reject) => {
    if (state.running || state.pendingOptions) {
      state.coalescedCount += 1;
      patchCoalescingStats.coalescedRequests += 1;
      pushPatchCoalescingEvent('patch.repatch.coalesced_count', {
        commentKey,
        status: 'coalesced',
        coalescedCount: state.coalescedCount,
        queueSize: state.pendingWaiters.length + 1,
        activeKeys: patchCoalescingQueues.size
      });
    }

    state.pendingOptions = { ...options, commentKey };
    state.pendingWaiters.push({ resolve, reject });
    runNextCoalescedPatch(commentKey, state);
  });
}

async function tryPatchChannelPost(options = {}) {
  const bootstrapStartedAt = Date.now();
  const commentKey = makeCommentKey(options.channelId, options.postId);
  const existingPost = getPost(commentKey);
  const messageId = resolvePatchMessageId({
    messageId: options.messageId,
    postId: options.postId,
    existingPost
  });
  const stablePayload = buildStableOpenPayload({
    commentKey,
    postId: options.postId,
    channelId: options.channelId,
    messageId
  });
  const handoffToken = clean(existingPost?.handoffToken) || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(options.postId || ''),
    channelId: String(options.channelId || ''),
    messageId: String(messageId || ''),
    stablePayload
  });

  const incomingAttachments = normalizeAttachments(options.sourceAttachments);
  const incomingTextKnown = clean(options.originalText) !== '';
  const incomingAttachmentsKnown = incomingAttachments.length > 0;
  const incomingLinkKnown = options.originalLink !== undefined && options.originalLink !== null;
  const incomingFormatKnown = options.originalFormat !== undefined;
  const incomingSnapshotCaptured = Boolean(
    existingPost?.originalSnapshotCaptured ||
    incomingTextKnown ||
    incomingAttachmentsKnown ||
    incomingLinkKnown ||
    incomingFormatKnown
  );

  const postRecord = savePost(commentKey, {
    ...(existingPost || {}),
    postId: String(options.postId || ''),
    channelId: String(options.channelId || ''),
    messageId,
    originalText: String(existingPost?.originalText || options.originalText || ''),
    sourceAttachments: normalizeAttachments(existingPost?.sourceAttachments || incomingAttachments),
    nativeReactions: Array.isArray(options.nativeReactions) ? cloneObject(options.nativeReactions, []).slice(0, 8) : [],
    originalLink: cloneObject(existingPost?.originalLink || options.originalLink, null),
    ...(existingPost?.originalFormat !== undefined
      ? { originalFormat: existingPost.originalFormat }
      : (options.originalFormat !== undefined ? { originalFormat: options.originalFormat } : {})),
    originalSnapshotCaptured: incomingSnapshotCaptured,
    originalSnapshotEmptyKnown: existingPost?.originalSnapshotEmptyKnown === true && !incomingSnapshotCaptured,
    originalTextKnown: existingPost?.originalTextKnown === true || incomingTextKnown,
    sourceAttachmentsKnown: existingPost?.sourceAttachmentsKnown === true || incomingAttachmentsKnown,
    originalLinkKnown: existingPost?.originalLinkKnown === true || incomingLinkKnown,
    originalFormatKnown: existingPost?.originalFormatKnown === true || incomingFormatKnown,
    channelTitle: clean(existingPost?.channelTitle || options.channelTitle || ''),
    textOverrideActive: false,
    linkedByUserId: clean(existingPost?.linkedByUserId || options.linkedByUserId || ''),
    linkedByName: clean(existingPost?.linkedByName || options.linkedByName || ''),
    autoMode: Boolean(options.autoMode),
    handoffToken,
    stablePayload,
    customKeyboard: existingPost?.customKeyboard || {},
    createdAt: existingPost?.createdAt || Date.now(),
    lastIngestedAt: Date.now(),
    lastIngestedRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
  });

  saveChannel(options.channelId, {
    lastPostId: String(options.postId || ''),
    lastMessageId: String(messageId || ''),
    linkedByUserId: clean(options.linkedByUserId),
    linkedByName: clean(options.linkedByName),
    ...(clean(options.channelTitle) ? { title: clean(options.channelTitle) } : {}),
    autoModeEnabled: true
  });

  schedulePatchedPostDbSync('bootstrap', {
    channelId: options.channelId,
    postId: options.postId,
    messageId,
    title: postRecord.originalText || options.originalText || options.postId,
    channelTitle: options.channelTitle,
    linkedByUserId: options.linkedByUserId,
    linkedByName: options.linkedByName,
    commentKey,
    originalText: postRecord.originalText || options.originalText || '',
    sourceAttachments: postRecord.sourceAttachments || options.sourceAttachments || [],
    originalLink: postRecord.originalLink || options.originalLink || null,
    originalFormat: postRecord.originalFormat !== undefined ? postRecord.originalFormat : options.originalFormat,
    handoffToken,
    stablePayload,
    customKeyboard: postRecord?.customKeyboard || {},
    commentsDisabled: Boolean(postRecord?.commentsDisabled),
    giftCampaignId: postRecord?.giftCampaignId || '',
    source: 'post_patcher_clean_core_bootstrap_snapshot'
  });

  emitPatchStep('patch.bootstrap.db_sync.end', Date.now(), {
    commentKey,
    status: 'scheduled',
    registered: 0,
    adminsCount: 0,
    reason: 'async_bootstrap_serialized'
  });

  const patchAttempt = await patchStoredPost({
    botToken: options.botToken,
    appBaseUrl: options.appBaseUrl,
    botUsername: options.botUsername,
    maxDeepLinkBase: options.maxDeepLinkBase,
    commentKey
  });

  emitPatchStep('patch.bootstrap.total.end', bootstrapStartedAt, {
    commentKey,
    status: patchAttempt?.ok ? 'ok' : 'error',
    ok: Boolean(patchAttempt?.ok)
  });

  return {
    commentKey,
    botStartLink: buildBotStartLink({
      botUsername: options.botUsername,
      maxDeepLinkBase: options.maxDeepLinkBase,
      handoffToken,
      postId: options.postId,
      channelId: options.channelId,
      commentKey,
      messageId
    }),
    miniAppLink: buildMiniAppLaunchUrl({
      appBaseUrl: options.appBaseUrl,
      botUsername: options.botUsername,
      maxDeepLinkBase: options.maxDeepLinkBase,
      handoffToken,
      postId: options.postId,
      channelId: options.channelId,
      commentKey,
      messageId
    }),
    fallbackLink: `${String(options.appBaseUrl || '').replace(/\/$/, '')}/fallback?postId=${encodeURIComponent(String(options.postId || ''))}`,
    post: postRecord,
    patchResult: patchAttempt.ok ? patchAttempt.patchResult : null,
    patchError: patchAttempt.ok ? null : patchAttempt.error || { message: patchAttempt.reason || 'patch_failed' },
    commentCount: patchAttempt.commentCount || 0,
    giftCampaignId: patchAttempt.giftCampaignId || '',
    stablePayload: patchAttempt.stablePayload || stablePayload,
    customRowsCount: patchAttempt.customRowsCount || 0,
    pollRowsCount: patchAttempt.pollRowsCount || 0,
    giftRowsCount: patchAttempt.giftRowsCount || 0,
    runtimeVersion: DB_SYNC_RUNTIME,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
  };
}

module.exports = {
  tryPatchChannelPost,
  patchStoredPost,
  patchStoredPostRaw,
  syncPatchedPostToDb,
  getPatchCoalescingSnapshot,
  DB_SYNC_RUNTIME,
  PATCH_COALESCE_RUNTIME,
  PATCH_COMPUTE_BREAKDOWN_RUNTIME,
  POST_PATCHER_CLEAN_CORE_RUNTIME,
  setPostPatchTraceHook,
  addPostPatchTraceHook
};
