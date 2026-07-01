'use strict';

const store = require('../store');
const basePatcher = require('./postPatcher');
const tenantBinding = require('./tenantChannelBindingService');
const {
  buildBotStartLink,
  buildMiniAppLaunchUrl,
  buildStableOpenPayload
} = require('./maxApi');

const RUNTIME = 'CC8.1.19-DIRECT-CHANNEL-FAST-PATCH-NO-BOOTSTRAP-DB-PR84';

function clean(value) { return String(value || '').trim(); }
function cloneObject(value, fallback = null) {
  if (!value || typeof value !== 'object') return fallback;
  try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
}
function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  try { return JSON.parse(JSON.stringify(value)); } catch { return []; }
}
function resolvePatchMessageId({ messageId = '', postId = '', existingPost = null } = {}) {
  return clean(messageId || existingPost?.messageId || postId);
}

async function tryPatchChannelPost(options = {}) {
  const bootstrapStartedAt = Date.now();
  const channelId = clean(options.channelId);
  const postId = clean(options.postId);
  const commentKey = store.makeCommentKey(channelId, postId);
  const existingPost = store.getPost(commentKey);
  const messageId = resolvePatchMessageId({ messageId: options.messageId, postId, existingPost });
  const stablePayload = buildStableOpenPayload({ commentKey, postId, channelId, messageId });
  const handoffToken = clean(existingPost?.handoffToken) || store.saveHandoff(store.makeHandoffToken(commentKey), {
    commentKey,
    postId: String(postId || ''),
    channelId: String(channelId || ''),
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

  const postRecord = store.savePost(commentKey, {
    ...(existingPost || {}),
    postId: String(postId || ''),
    channelId: String(channelId || ''),
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
    lastIngestedRuntime: RUNTIME,
    fastPatchRuntime: RUNTIME
  });

  const initiatingUserId = clean(options.linkedByUserId);
  if (initiatingUserId) {
    tenantBinding.bindChannelForInitiator({ maxUserId: initiatingUserId, channelId, channelTitle: options.channelTitle || channelId, source: 'direct_channel_post_ingest', botAdminProof: { proven: true, source: 'direct_channel_post' }, postEvidence: { postId, messageId, commentKey } });
  } else {
    tenantBinding.recordDiagnostic('missing_initiating_user_for_channel_bind', { channelIdMasked: channelId ? channelId.slice(0, 3) + '…' + channelId.slice(-3) : '', postId: postId ? postId.slice(0, 24) : '', source: 'direct_channel_post_ingest' });
  }

  store.saveChannel(channelId, {
    lastPostId: String(postId || ''),
    lastMessageId: String(messageId || ''),
    linkedByUserId: clean(options.linkedByUserId),
    linkedByName: clean(options.linkedByName),
    ...(clean(options.channelTitle) ? { title: clean(options.channelTitle) } : {}),
    autoModeEnabled: true,
    fastPatchRuntime: RUNTIME
  });

  // PR84: do not run bootstrap DB sync before editMessage.
  // The core patcher already schedules the durable DB mirror after a successful edit.
  // This removes 2-4s of DB contention from the critical path that makes the comments button appear.
  const patchAttempt = await basePatcher.patchStoredPost({
    botToken: options.botToken,
    appBaseUrl: options.appBaseUrl,
    botUsername: options.botUsername,
    maxDeepLinkBase: options.maxDeepLinkBase,
    commentKey
  });

  if (!patchAttempt?.ok) {
    try {
      await basePatcher.syncPatchedPostToDb({
        channelId,
        postId,
        messageId,
        title: postRecord.originalText || options.originalText || postId,
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
        source: 'post_patcher_fast_pr84_failure_snapshot'
      });
    } catch {}
  }

  return {
    commentKey,
    botStartLink: buildBotStartLink({
      botUsername: options.botUsername,
      maxDeepLinkBase: options.maxDeepLinkBase,
      handoffToken,
      postId,
      channelId,
      commentKey,
      messageId
    }),
    miniAppLink: buildMiniAppLaunchUrl({
      appBaseUrl: options.appBaseUrl,
      botUsername: options.botUsername,
      maxDeepLinkBase: options.maxDeepLinkBase,
      handoffToken,
      postId,
      channelId,
      commentKey,
      messageId
    }),
    fallbackLink: `${String(options.appBaseUrl || '').replace(/\/$/, '')}/fallback?postId=${encodeURIComponent(String(postId || ''))}`,
    post: postRecord,
    patchResult: patchAttempt?.ok ? patchAttempt.patchResult : null,
    patchError: patchAttempt?.ok ? null : patchAttempt?.error || { message: patchAttempt?.reason || 'patch_failed' },
    commentCount: patchAttempt?.commentCount || 0,
    giftCampaignId: patchAttempt?.giftCampaignId || '',
    stablePayload: patchAttempt?.stablePayload || stablePayload,
    customRowsCount: patchAttempt?.customRowsCount || 0,
    pollRowsCount: patchAttempt?.pollRowsCount || 0,
    giftRowsCount: patchAttempt?.giftRowsCount || 0,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: basePatcher.POST_PATCHER_CLEAN_CORE_RUNTIME,
    bootstrapDurationMs: Date.now() - bootstrapStartedAt,
    fastPatchNoBootstrapDb: true
  };
}

module.exports = {
  ...basePatcher,
  tryPatchChannelPost,
  FAST_PATCH_RUNTIME: RUNTIME
};
