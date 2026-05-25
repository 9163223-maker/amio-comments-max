const db = require("../cc5-db-core");
const {
  savePost,
  saveChannel,
  makeCommentKey,
  getPost,
  getComments,
  makeHandoffToken,
  saveHandoff
} = require("../store");
const {
  buildCommentsKeyboard,
  buildMiniAppLaunchUrl,
  buildBotStartLink,
  buildStableOpenPayload,
  editMessage,
  buildGiftKeyboardRows,
  getMessage
} = require("./maxApi");
const { findGiftCampaignForPost } = require("./giftService");
const { buildCustomKeyboardRows } = require("./keyboardBuilderService");
const pollService = require("./pollService");

const DB_SYNC_RUNTIME = "CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE";
const PATCH_COALESCE_RUNTIME = "CC8.1.10-PATCH-REPATCH-COALESCING";
const PATCH_COMPUTE_BREAKDOWN_RUNTIME = "CC8.1.15-PATCH-COMPUTE-BREAKDOWN";
const POST_PATCHER_CLEAN_CORE_RUNTIME = "CC8.1.16-POST-PATCHER-CLEAN-CORE-PR77";
const PATCH_COALESCE_EVENT_LIMIT = 50;
const POLL_EMPTY_CACHE_TTL_MS = 15000;
const patchCoalescingQueues = new Map();
const patchCoalescingEvents = [];
const patchCoalescingStats = {
  runtimeVersion: PATCH_COALESCE_RUNTIME,
  cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME,
  totalRequests: 0,
  startedRuns: 0,
  finishedRuns: 0,
  coalescedRequests: 0,
  activeKeys: 0,
  lastDurationMs: 0,
  lastCommentKey: "",
  lastResultOk: null
};
let postPatchTraceHooks = [];
function setPostPatchTraceHook(fn) {
  postPatchTraceHooks = typeof fn === "function" ? [fn] : [];
}
function addPostPatchTraceHook(fn) {
  if (typeof fn !== "function") return false;
  if (!postPatchTraceHooks.includes(fn)) postPatchTraceHooks.push(fn);
  return true;
}
function emitPostPatchTrace(event, payload = {}) {
  for (const hook of postPatchTraceHooks.slice()) {
    try { hook(event, payload); } catch {}
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

function pushPatchCoalescingEvent(name = "", payload = {}) {
  const safe = payload && typeof payload === "object" ? payload : {};
  const item = {
    at: new Date().toISOString(),
    runtimeVersion: PATCH_COALESCE_RUNTIME,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME,
    name: String(name || "").trim(),
    commentKey: clean(safe.commentKey),
    status: clean(safe.status),
    reason: clean(safe.reason),
    durationMs: Number(safe.durationMs || 0) || 0,
    coalescedCount: Number(safe.coalescedCount || 0) || 0,
    queueSize: Number(safe.queueSize || 0) || 0,
    activeKeys: Number(safe.activeKeys || 0) || 0,
    ok: safe.ok === undefined ? undefined : Boolean(safe.ok)
  };
  patchCoalescingEvents.push(item);
  if (patchCoalescingEvents.length > PATCH_COALESCE_EVENT_LIMIT) {
    patchCoalescingEvents.splice(0, patchCoalescingEvents.length - PATCH_COALESCE_EVENT_LIMIT);
  }
  emitPostPatchTrace(item.name, {
    commentKey: item.commentKey,
    status: item.status,
    reason: item.reason || (item.coalescedCount ? `coalesced:${item.coalescedCount}` : ""),
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

function normalizeAttachments(value) {
  return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [];
}

function stripInlineKeyboard(attachments) {
  return normalizeAttachments(attachments).filter((item) => item?.type !== "inline_keyboard");
}

function stableStringify(value) {
  return JSON.stringify(value || []);
}

function clean(value) {
  return String(value || "").trim();
}

function hasOwn(obj, key) {
  return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));
}

function cloneObject(value, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
}

function cloneKeyboardBuilder(value) {
  const source = value && typeof value === "object" ? value : {};
  const cloned = cloneObject(source, {});
  if (!cloned || typeof cloned !== "object") return {};
  if (!Array.isArray(cloned.rows)) cloned.rows = [];
  return cloned;
}

function resolvePatchMessageId({ messageId = "", postId = "", existingPost = null } = {}) {
  // CC7.5.61 / PR77: MAX can deliver channel/media/forwarded post updates without mid,
  // while seq/postId is stable. Never make mid mandatory for patching.
  return clean(messageId || existingPost?.messageId || postId);
}

function highlightText(post = {}, originalText = "") {
  const txt = String(originalText || post.originalText || post.postText || "");
  const h = post && post.highlight && post.highlight.enabled ? post.highlight : null;
  if (!h) return txt;
  const label = clean(h.label || "⭐ Важно");
  return label + (txt ? "\n\n" + txt : "");
}

function snapshotKnown(post = {}) {
  return Boolean(
    post.originalSnapshotCaptured === true ||
    post.originalTextKnown === true ||
    post.sourceAttachmentsKnown === true ||
    post.originalLinkKnown === true ||
    post.originalFormatKnown === true ||
    hasOwn(post, "originalText") ||
    hasOwn(post, "sourceAttachments") ||
    hasOwn(post, "originalLink") ||
    hasOwn(post, "originalFormat")
  );
}

function shouldHydrateOriginalFromLive({ post = {}, originalAttachments = [], originalText = "", originalLink = null, originalFormat = undefined } = {}) {
  // Old behavior treated empty attachments/link/format as missing and called getMessage for ordinary text posts.
  // PR77 only hydrates when the entire original snapshot is unknown/empty.
  if (snapshotKnown(post)) return false;
  if (clean(originalText)) return false;
  if (Array.isArray(originalAttachments) && originalAttachments.length) return false;
  if (originalLink) return false;
  if (originalFormat !== undefined) return false;
  return true;
}

function shouldBuildPollRows(post = {}) {
  if (!post || typeof post !== "object") return true;
  if (post.pollId || post.activePollId || post.lastPollPatchId || post.hasPoll || post.pollEnabled || post.pollConfig || post.poll) return true;
  if (Number(post.lastPollRowsCount || 0) > 0) return true;
  const emptyAt = Number(post.pollRowsKnownEmptyAt || 0) || 0;
  if (post.pollRowsKnownEmpty === true && emptyAt && Date.now() - emptyAt < POLL_EMPTY_CACHE_TTL_MS) return false;
  return true;
}

function buildPostSnapshotRaw({
  source,
  commentKey,
  channelId,
  postId,
  messageId,
  title,
  channelTitle,
  originalText,
  sourceAttachments,
  originalLink,
  originalFormat,
  handoffToken,
  stablePayload,
  linkedByUserId,
  linkedByName,
  customKeyboard,
  commentsDisabled,
  giftCampaignId
} = {}) {
  const resolvedMessageId = resolvePatchMessageId({ messageId, postId });
  return {
    source: clean(source || "post_patcher"),
    runtimeVersion: DB_SYNC_RUNTIME,
    cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME,
    commentKey: clean(commentKey),
    channelId: clean(channelId),
    postId: clean(postId),
    messageId: resolvedMessageId,
    title: clean(title || originalText || postId),
    channelTitle: clean(channelTitle || channelId),
    originalText: String(originalText || ""),
    originalFormat: originalFormat === undefined ? null : originalFormat,
    originalLink: cloneObject(originalLink, null),
    sourceAttachments: stripInlineKeyboard(sourceAttachments || []),
    handoffToken: clean(handoffToken),
    stablePayload: clean(stablePayload),
    linkedByUserId: clean(linkedByUserId),
    linkedByName: clean(linkedByName),
    customKeyboard: cloneKeyboardBuilder(customKeyboard),
    commentsDisabled: Boolean(commentsDisabled),
    giftCampaignId: clean(giftCampaignId),
    originalSnapshotCaptured: true,
    patchedAt: new Date().toISOString()
  };
}

async function adminIdsForChannel(channelId, fallbackAdminId = "") {
  const ids = new Set();
  const fallback = clean(fallbackAdminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || "17507246");
  if (fallback) ids.add(fallback);
  try {
    await db.init();
    const result = await db.query("select admin_id from ak_admin_channels where channel_id=$1 order by updated_at desc limit 20", [String(channelId || "")]);
    for (const row of result.rows || []) if (row.admin_id) ids.add(String(row.admin_id));
  } catch {}
  return [...ids];
}

async function syncPatchedPostToDb({
  channelId,
  postId,
  messageId,
  title,
  channelTitle,
  linkedByUserId,
  linkedByName,
  commentKey,
  originalText,
  sourceAttachments,
  originalLink,
  originalFormat,
  handoffToken,
  stablePayload,
  customKeyboard,
  commentsDisabled,
  giftCampaignId,
  source = "post_patcher"
}) {
  const ch = clean(channelId);
  const post = clean(postId);
  if (!ch || !post || ch === "CHANNEL_ID" || post === "POST_ID") return { ok: true, skipped: true, reason: "invalid_channel_or_post" };
  const ck = clean(commentKey || `${ch}:${post}`);
  const resolvedMessageId = resolvePatchMessageId({ messageId, postId: post });
  const payload = clean(stablePayload || buildStableOpenPayload({ commentKey: ck, channelId: ch, postId: post, messageId: resolvedMessageId }));
  const raw = buildPostSnapshotRaw({
    source,
    commentKey: ck,
    channelId: ch,
    postId: post,
    messageId: resolvedMessageId,
    title: title || originalText || post,
    channelTitle,
    originalText: originalText || title || "",
    sourceAttachments,
    originalLink,
    originalFormat,
    handoffToken,
    stablePayload: payload,
    linkedByUserId,
    linkedByName,
    customKeyboard,
    commentsDisabled,
    giftCampaignId
  });
  const admins = await adminIdsForChannel(ch, linkedByUserId);
  const registered = [];
  for (const adminId of admins) {
    const result = await db.upsertPost(adminId, ch, post, String(title || originalText || post).slice(0, 120), raw, resolvedMessageId);
    if (result) registered.push(result);
  }
  return { ok: true, runtimeVersion: DB_SYNC_RUNTIME, cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME, registered: registered.length, admins, channelId: ch, postId: post, commentKey: ck, stablePayload: payload, messageId: resolvedMessageId };
}

function schedulePatchedPostDbSync(reason = "after_edit", payload = {}) {
  const commentKey = clean(payload.commentKey);
  const scheduledAt = Date.now();
  setTimeout(async () => {
    const startedAt = Date.now();
    try {
      const result = await syncPatchedPostToDb({ ...(payload || {}), source: payload.source || `post_patcher_clean_core_${reason}` });
      emitPatchStep("patch.db_sync_async.end", startedAt, {
        commentKey,
        status: result?.ok ? "ok" : "unknown",
        registered: Number(result?.registered || 0),
        adminsCount: Array.isArray(result?.admins) ? result.admins.length : 0,
        skipped: Boolean(result?.skipped),
        reason: clean(result?.reason || reason),
        scheduledDelayMs: Math.max(0, startedAt - scheduledAt)
      });
    } catch (error) {
      emitPatchStep("patch.db_sync_async.end", startedAt, { commentKey, status: "error", reason: clean(error?.message || error || reason), scheduledDelayMs: Math.max(0, startedAt - scheduledAt) });
    }
  }, 0);
  return { ok: true, scheduled: true, reason, cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME };
}

async function enrichOriginalFromLive({ botToken, post, commentKey }) {
  let originalAttachments = stripInlineKeyboard(post.sourceAttachments || post.attachments || []);
  let originalText = String(post.originalText || "");
  let originalLink = cloneObject(post.originalLink, null);
  let originalFormat = post.originalFormat !== undefined ? post.originalFormat : undefined;

  if (shouldHydrateOriginalFromLive({ post, originalAttachments, originalText, originalLink, originalFormat }) && botToken && post.messageId) {
    try {
      const liveMessage = await getMessage({ botToken, messageId: post.messageId });
      const liveBody = liveMessage?.body && typeof liveMessage.body === "object" ? liveMessage.body : {};
      const liveAttachments = stripInlineKeyboard(Array.isArray(liveBody.attachments) ? liveBody.attachments : []);
      const liveLink = cloneObject(liveBody.link, null);
      if (!originalAttachments.length && liveAttachments.length) originalAttachments = liveAttachments;
      if (!originalText && liveBody.text) originalText = String(liveBody.text || "");
      if (!originalLink && liveLink) originalLink = liveLink;
      if (originalFormat === undefined && liveBody.format !== undefined) originalFormat = liveBody.format;
      savePost(commentKey, {
        sourceAttachments: normalizeAttachments(liveAttachments.length ? liveAttachments : originalAttachments),
        originalText,
        originalLink,
        ...(originalFormat !== undefined ? { originalFormat } : {}),
        originalSnapshotCaptured: true,
        originalHydratedFromLiveAt: Date.now(),
        originalHydratedFromLiveRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
      });
      post = getPost(commentKey) || post;
    } catch {}
  }
  return { post, originalAttachments, originalText, originalLink, originalFormat };
}

async function patchStoredPostRaw({
  botToken,
  appBaseUrl,
  botUsername,
  maxDeepLinkBase,
  commentKey
}) {
  const computeStartedAt = Date.now();
  emitPostPatchTrace("patch.compute.begin", { commentKey, status: "started", breakdownRuntime: PATCH_COMPUTE_BREAKDOWN_RUNTIME, cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME });

  const resolveStartedAt = Date.now();
  let post = getPost(commentKey);
  if (!post) {
    emitPatchStep("patch.compute.resolve_post.end", resolveStartedAt, { commentKey, status: "missing", reason: "post_not_found" });
    emitPostPatchTrace("patch.compute.end", { commentKey, status: "skipped", reason: "post_not_found", durationMs: Date.now() - computeStartedAt });
    return { ok: false, reason: "post_not_found" };
  }
  if (!post.messageId && post.postId) {
    savePost(commentKey, { messageId: String(post.postId || "") });
    post = getPost(commentKey) || post;
  }
  if (!post.messageId) {
    emitPatchStep("patch.compute.resolve_post.end", resolveStartedAt, { commentKey, status: "missing", reason: "message_id_missing", hasPost: true });
    emitPostPatchTrace("patch.compute.end", { commentKey, status: "skipped", reason: "message_id_missing", durationMs: Date.now() - computeStartedAt });
    return { ok: false, reason: "message_id_missing", post, runtimeVersion: DB_SYNC_RUNTIME };
  }
  emitPatchStep("patch.compute.resolve_post.end", resolveStartedAt, { commentKey, status: "ok", hasPost: true, hasMessageId: true });

  const liveStartedAt = Date.now();
  const live = await enrichOriginalFromLive({ botToken, post, commentKey });
  post = live.post;
  const { originalAttachments, originalText, originalLink, originalFormat } = live;
  emitPatchStep("patch.compute.enrich_live.end", liveStartedAt, {
    commentKey,
    status: shouldHydrateOriginalFromLive({ post, originalAttachments, originalText, originalLink, originalFormat }) ? "hydrated_or_attempted" : "skipped_snapshot_ready",
    reason: shouldHydrateOriginalFromLive({ post, originalAttachments, originalText, originalLink, originalFormat }) ? "snapshot_missing" : "snapshot_ready_no_live_getMessage",
    originalAttachmentCount: originalAttachments.length,
    hasOriginalText: Boolean(originalText),
    hasOriginalLink: Boolean(originalLink),
    hasOriginalFormat: originalFormat !== undefined
  });

  const commentsStartedAt = Date.now();
  const commentCount = getComments(commentKey).length;
  emitPatchStep("patch.compute.comments_count.end", commentsStartedAt, { commentKey, status: "ok", commentCount });

  const handoffStartedAt = Date.now();
  const stablePayload = clean(post.stablePayload || buildStableOpenPayload({
    commentKey,
    postId: post.postId,
    channelId: post.channelId,
    messageId: post.messageId || post.postId
  }));

  const handoffToken = String(post.handoffToken || "").trim() || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(post.postId || ""),
    channelId: String(post.channelId || ""),
    messageId: String(post.messageId || ""),
    stablePayload
  });
  if ((handoffToken && handoffToken !== post.handoffToken) || (stablePayload && stablePayload !== post.stablePayload)) {
    savePost(commentKey, { handoffToken, stablePayload });
    post = getPost(commentKey) || post;
  }
  emitPatchStep("patch.compute.handoff_payload.end", handoffStartedAt, { commentKey, status: "ok", hasHandoffToken: Boolean(handoffToken), hasStablePayload: Boolean(stablePayload) });

  const giftStartedAt = Date.now();
  const giftCampaign = findGiftCampaignForPost({ channelId: post.channelId, postId: post.postId });
  const giftRows = giftCampaign
    ? buildGiftKeyboardRows({ campaign: giftCampaign, commentKey, channelId: post.channelId, postId: post.postId })
    : [];
  emitPatchStep("patch.compute.gift_rows.end", giftStartedAt, { commentKey, status: "ok", hasGiftCampaign: Boolean(giftCampaign), giftRowsCount: giftRows.length });

  const customStartedAt = Date.now();
  const customRows = buildCustomKeyboardRows({
    builder: post.customKeyboard || {},
    appBaseUrl,
    channelId: post.channelId,
    postId: post.postId,
    commentKey
  });
  emitPatchStep("patch.compute.custom_rows.end", customStartedAt, { commentKey, status: "ok", customRowsCount: customRows.length });

  const pollStartedAt = Date.now();
  let pollRows = [];
  if (shouldBuildPollRows(post)) {
    try {
      pollRows = await pollService.buildPollKeyboardRows({ channelId: post.channelId, postId: post.postId, commentKey });
      if (pollRows.length) savePost(commentKey, { pollRowsKnownEmpty: false, lastPollRowsCount: pollRows.length, lastPollRowsCheckedAt: Date.now() });
      else savePost(commentKey, { pollRowsKnownEmpty: true, pollRowsKnownEmptyAt: Date.now(), lastPollRowsCount: 0, lastPollRowsCheckedAt: Date.now() });
      emitPatchStep("patch.compute.poll_rows.end", pollStartedAt, { commentKey, status: "ok", pollRowsCount: pollRows.length });
    } catch (error) {
      savePost(commentKey, { lastPollRowsComposeError: String(error?.message || error), lastPollRowsComposeErrorAt: Date.now() });
      emitPatchStep("patch.compute.poll_rows.end", pollStartedAt, { commentKey, status: "error", error: String(error?.message || error), pollRowsCount: 0 });
    }
  } else {
    emitPatchStep("patch.compute.poll_rows.end", pollStartedAt, { commentKey, status: "skipped", reason: "no_poll_marker_cached_empty", pollRowsCount: 0 });
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
    giftCampaignId: giftCampaign?.id || post.giftCampaignId || "",
    source: "post_patcher_clean_core_after_edit_snapshot"
  };
  const dbStartedAt = Date.now();
  emitPatchStep("patch.compute.db_sync.end", dbStartedAt, { commentKey, status: "deferred", skipped: true, reason: "async_after_edit" });

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
    buttonSuffix: "",
    primaryButtonText: String(post?.customKeyboard?.commentButtonText || "").trim(),
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
  emitPatchStep("patch.compute.keyboard_fingerprint.end", keyboardStartedAt, { commentKey, status: "ok", originalAttachmentCount: originalAttachments.length, keyboardAttachmentCount: keyboardAttachments.length, attachmentCount: mergedAttachments.length, hasText: Boolean(nextText), hasOriginalLink: Boolean(originalLink), hasOriginalFormat: originalFormat !== undefined });
  const computeDurationMs = Date.now() - computeStartedAt;

  if (post.lastPatchedFingerprint === nextFingerprint) {
    emitPostPatchTrace("patch.compute.end", { commentKey, status: "skipped", reason: "already_patched", durationMs: computeDurationMs, cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME });
    return { ok: true, commentCount, skipped: true, reason: "already_patched", giftCampaignId: giftCampaign?.id || "", stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: DB_SYNC_RUNTIME, cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME };
  }
  emitPostPatchTrace("patch.compute.end", { commentKey, status: "ready", durationMs: computeDurationMs, breakdownRuntime: PATCH_COMPUTE_BREAKDOWN_RUNTIME, cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME });

  try {
    emitPostPatchTrace("edit_message_started", {
      commentKey,
      channelId: post.channelId,
      postId: post.postId,
      messageId: post.messageId,
      originalAttachmentCount: originalAttachments.length,
      keyboardAttachmentCount: keyboardAttachments.length,
      attachmentCount: mergedAttachments.length,
      attachmentTypes: mergedAttachments.map((x) => String(x?.type || "file")).slice(0, 20)
    });
    emitPostPatchTrace("patch.edit_api.begin", { commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: "started" });
    const editStartedAt = Date.now();
    const payload = { botToken, messageId: post.messageId, attachments: mergedAttachments, notify: false };
    if (nextText) payload.text = nextText;
    if (originalLink && typeof originalLink === "object") payload.link = cloneObject(originalLink, null);
    if (originalFormat !== undefined && originalFormat !== null) payload.format = originalFormat;
    const rawPatchResult = await editMessage(payload);
    const editDurationMs = Date.now() - editStartedAt;
    const patchResult = rawPatchResult && typeof rawPatchResult === "object"
      ? rawPatchResult
      : { ok: true, emptyBody: true };
    patchResult.durationMs = editDurationMs;
    emitPostPatchTrace("edit_message_ok", { commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, durationMs: patchResult.durationMs, status: "ok" });
    emitPostPatchTrace("patch.edit_api.end", { commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, durationMs: patchResult.durationMs, status: "ok" });
    savePost(commentKey, {
      patchedAttachments: mergedAttachments,
      lastPatchedText: nextText,
      lastPatchedFingerprint: nextFingerprint,
      lastPatchedAt: Date.now(),
      lastPatchError: null,
      stablePayload,
      giftCampaignId: giftCampaign?.id || "",
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
    });
    schedulePatchedPostDbSync("after_edit", dbSyncPayload);
    return { ok: true, commentCount, patchResult, giftCampaignId: giftCampaign?.id || "", stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: DB_SYNC_RUNTIME, cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME };
  } catch (error) {
    const patchError = { status: error?.status || 0, message: error?.message || "patch_failed", data: error?.data || null };
    savePost(commentKey, {
      lastPatchError: patchError,
      lastPatchAttemptAt: Date.now(),
      stablePayload,
      giftCampaignId: giftCampaign?.id || "",
      lastCustomRowsCount: customRows.length,
      lastPollRowsCount: pollRows.length,
      lastGiftRowsCount: giftRows.length,
      lastSafeComposeRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
    });
    emitPostPatchTrace("edit_message_failed", { commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: "error", error: patchError.message, durationMs: 0 });
    emitPostPatchTrace("patch.edit_api.end", { commentKey, channelId: post.channelId, postId: post.postId, messageId: post.messageId, status: "error", error: patchError.message, durationMs: 0 });
    return { ok: false, commentCount, error: patchError, giftCampaignId: giftCampaign?.id || "", stablePayload, customRowsCount: customRows.length, pollRowsCount: pollRows.length, giftRowsCount: giftRows.length, runtimeVersion: DB_SYNC_RUNTIME, cleanCoreRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME };
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
  pushPatchCoalescingEvent("patch.compute.begin", { commentKey, status: "running", coalescedCount, queueSize: waiters.length, activeKeys: patchCoalescingQueues.size });
  patchStoredPostRaw(options).then((result) => {
    const durationMs = Date.now() - startedAt;
    patchCoalescingStats.finishedRuns += 1;
    patchCoalescingStats.lastDurationMs = durationMs;
    patchCoalescingStats.lastCommentKey = commentKey;
    patchCoalescingStats.lastResultOk = Boolean(result && result.ok);
    pushPatchCoalescingEvent("patch.done", { commentKey, status: result?.ok ? "ok" : "error", ok: Boolean(result?.ok), reason: result?.reason || result?.error?.message || "", durationMs, coalescedCount, queueSize: waiters.length, activeKeys: patchCoalescingQueues.size });
    resolveWaiters(waiters, result, null);
  }).catch((error) => {
    const durationMs = Date.now() - startedAt;
    patchCoalescingStats.finishedRuns += 1;
    patchCoalescingStats.lastDurationMs = durationMs;
    patchCoalescingStats.lastCommentKey = commentKey;
    patchCoalescingStats.lastResultOk = false;
    pushPatchCoalescingEvent("patch.done", { commentKey, status: "exception", ok: false, reason: error?.message || "patch_exception", durationMs, coalescedCount, queueSize: waiters.length, activeKeys: patchCoalescingQueues.size });
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
  pushPatchCoalescingEvent("patch.request.received", { commentKey, status: "queued", activeKeys: patchCoalescingQueues.size });
  if (!commentKey) return patchStoredPostRaw(options);
  let state = patchCoalescingQueues.get(commentKey);
  if (!state) {
    state = { running: false, pendingOptions: null, pendingWaiters: [], coalescedCount: 0 };
    patchCoalescingQueues.set(commentKey, state);
  }
  return new Promise((resolve, reject) => {
    if (state.running || state.pendingOptions) {
      state.coalescedCount += 1;
      patchCoalescingStats.coalescedRequests += 1;
      pushPatchCoalescingEvent("patch.repatch.coalesced_count", { commentKey, status: "coalesced", coalescedCount: state.coalescedCount, queueSize: state.pendingWaiters.length + 1, activeKeys: patchCoalescingQueues.size });
    }
    state.pendingOptions = { ...options, commentKey };
    state.pendingWaiters.push({ resolve, reject });
    runNextCoalescedPatch(commentKey, state);
  });
}

async function tryPatchChannelPost({
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
  const resolvedMessageId = resolvePatchMessageId({ messageId, postId, existingPost });
  const stablePayload = buildStableOpenPayload({ commentKey, postId, channelId, messageId: resolvedMessageId });

  const handoffToken = String(existingPost?.handoffToken || "").trim() || saveHandoff(makeHandoffToken(commentKey), {
    commentKey,
    postId: String(postId || ""),
    channelId: String(channelId || ""),
    messageId: String(resolvedMessageId || ""),
    stablePayload
  });

  const postRecord = savePost(commentKey, {
    ...(existingPost || {}),
    postId: String(postId || ""),
    channelId: String(channelId || ""),
    messageId: resolvedMessageId,
    originalText: String(existingPost?.originalText || originalText || ""),
    sourceAttachments: normalizeAttachments(existingPost?.sourceAttachments || sourceAttachments),
    nativeReactions: Array.isArray(nativeReactions) ? JSON.parse(JSON.stringify(nativeReactions)).slice(0, 8) : [],
    originalLink: cloneObject(existingPost?.originalLink || originalLink, null),
    ...(existingPost?.originalFormat !== undefined ? { originalFormat: existingPost.originalFormat } : (originalFormat !== undefined ? { originalFormat } : {})),
    originalSnapshotCaptured: true,
    originalTextKnown: originalText !== undefined,
    sourceAttachmentsKnown: Array.isArray(sourceAttachments),
    originalLinkKnown: originalLink !== undefined,
    originalFormatKnown: originalFormat !== undefined,
    channelTitle: String(existingPost?.channelTitle || channelTitle || "").trim(),
    textOverrideActive: false,
    linkedByUserId: String(existingPost?.linkedByUserId || linkedByUserId || ""),
    linkedByName: String(existingPost?.linkedByName || linkedByName || ""),
    autoMode: Boolean(autoMode),
    handoffToken,
    stablePayload,
    customKeyboard: existingPost?.customKeyboard || {},
    createdAt: existingPost?.createdAt || Date.now(),
    lastIngestedAt: Date.now(),
    lastIngestedRuntime: POST_PATCHER_CLEAN_CORE_RUNTIME
  });

  saveChannel(channelId, {
    lastPostId: String(postId || ""),
    lastMessageId: String(resolvedMessageId || ""),
    linkedByUserId: String(linkedByUserId || ""),
    linkedByName: String(linkedByName || ""),
    ...(String(channelTitle || "").trim() ? { title: String(channelTitle || "").trim() } : {}),
    autoModeEnabled: true
  });

  const bootstrapDbStartedAt = Date.now();
  const bootstrapDbPayload = {
    channelId,
    postId,
    messageId: resolvedMessageId,
    title: postRecord.originalText || originalText || postId,
    channelTitle,
    linkedByUserId,
    linkedByName,
    commentKey,
    originalText: postRecord.originalText || originalText || "",
    sourceAttachments: postRecord.sourceAttachments || sourceAttachments || [],
    originalLink: postRecord.originalLink || originalLink || null,
    originalFormat: postRecord.originalFormat !== undefined ? postRecord.originalFormat : originalFormat,
    handoffToken,
    stablePayload,
    customKeyboard: postRecord?.customKeyboard || {},
    commentsDisabled: Boolean(postRecord?.commentsDisabled),
    giftCampaignId: postRecord?.giftCampaignId || "",
    source: "post_patcher_clean_core_bootstrap_snapshot"
  };
  schedulePatchedPostDbSync("bootstrap", bootstrapDbPayload);
  emitPatchStep("patch.bootstrap.db_sync.end", bootstrapDbStartedAt, { commentKey, status: "scheduled", registered: 0, adminsCount: 0, reason: "async_bootstrap" });

  const patchAttempt = await patchStoredPost({ botToken, appBaseUrl, botUsername, maxDeepLinkBase, commentKey });
  emitPatchStep("patch.bootstrap.total.end", bootstrapStartedAt, { commentKey, status: patchAttempt?.ok ? "ok" : "error", ok: Boolean(patchAttempt?.ok) });

  return {
    commentKey,
    botStartLink: buildBotStartLink({ botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId: resolvedMessageId }),
    miniAppLink: buildMiniAppLaunchUrl({ appBaseUrl, botUsername, maxDeepLinkBase, handoffToken, postId, channelId, commentKey, messageId: resolvedMessageId }),
    fallbackLink: `${String(appBaseUrl || "").replace(/\/$/, "")}/fallback?postId=${encodeURIComponent(String(postId || ""))}`,
    post: postRecord,
    patchResult: patchAttempt.ok ? patchAttempt.patchResult : null,
    patchError: patchAttempt.ok ? null : patchAttempt.error || { message: patchAttempt.reason || "patch_failed" },
    commentCount: patchAttempt.commentCount || 0,
    giftCampaignId: patchAttempt.giftCampaignId || "",
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
