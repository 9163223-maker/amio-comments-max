'use strict';

const {
  getPost,
  savePost,
  savePostVersion
} = require('../store');
const { patchStoredPost } = require('./postPatcher');
const postEditor = require('./postEditorService');
const timing = require('../v3-ui-timing-cc8');

const RUNTIME = 'CC8.3.8-POSTS-TEXT-MEDIA-STAGED';

function clean(value) {
  return String(value || '').trim();
}

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function normalizeAttachments(value) {
  return Array.isArray(value) ? cloneDeep(value) : [];
}

function attachmentsFingerprint(value) {
  try { return JSON.stringify(normalizeAttachments(value)); } catch { return '[]'; }
}

function getEditableMeta(post = {}, config = {}) {
  if (typeof postEditor.getEditableMeta === 'function') return postEditor.getEditableMeta(post, config);
  const hours = Number(config.postEditWindowHours || 24);
  const createdAt = Number(post.createdAt || post.updatedAt || 0) || 0;
  const deadlineAt = createdAt ? createdAt + hours * 60 * 60 * 1000 : 0;
  const msLeft = deadlineAt ? deadlineAt - Date.now() : 0;
  return { windowHours: hours, createdAt, deadlineAt, editable: Boolean(deadlineAt) && msLeft > 0, msLeft: Math.max(0, msLeft) };
}

function maskKey(value = '') {
  const key = clean(value);
  return key.length > 18 ? key.slice(0, 8) + '…' + key.slice(-6) : key;
}

function ensurePatchablePost(commentKey = '', config = {}, meta = {}) {
  const key = clean(commentKey);
  const post = getPost(key);
  if (!post) throw new Error('post_not_found');
  if (!post.messageId && !post.postId) throw new Error('message_id_missing');

  const editable = getEditableMeta(post, config);
  const expiredWindowFallback = !editable.editable;
  if (expiredWindowFallback) {
    timing.log('posts_text_expired_window_fallback', {
      durationMs: 0,
      ok: true,
      commentKey: maskKey(key),
      userId: timing.mask(meta.actorId || ''),
      reason: 'post_edit_window_expired',
      fallback: 'legacy_safe_repatch',
      runtimeVersion: RUNTIME
    });
  }

  return { post, editable, expiredWindowFallback };
}

function markPatchDone(key, patch = {}, source = 'post_text_save') {
  savePost(key, {
    lastPatchPending: false,
    lastPatchCompletedAt: patch?.ok ? Date.now() : 0,
    lastPatchError: patch?.ok ? null : (patch?.error || { message: patch?.reason || 'async_patch_failed' }),
    lastPatchAttemptAt: Date.now(),
    lastAsyncPatchRuntime: RUNTIME,
    lastAsyncPatchSource: source
  });
}

function schedulePatch({ commentKey = '', config = {}, source = 'post_text_save' } = {}) {
  const key = clean(commentKey);
  const legacyRepatch = source === 'legacy_repatch_expired_window';
  if (!key) return { ok: false, scheduled: false, reason: 'comment_key_missing' };
  if (legacyRepatch) {
    timing.log('posts_text_legacy_repatch_started', {
      durationMs: 0,
      commentKey: maskKey(key),
      source,
      ok: true,
      runtimeVersion: RUNTIME
    });
  }
  setTimeout(async () => {
    const started = Date.now();
    let patch = null;
    try {
      patch = await timing.measure(legacyRepatch ? 'posts_text_legacy_repatch_async' : 'posts_text_patch_async', { commentKey: maskKey(key), source }, () => patchStoredPost({
        botToken: config['bot' + 'Token'],
        appBaseUrl: config.appBaseUrl,
        botUsername: config.botUsername,
        maxDeepLinkBase: config.maxDeepLinkBase,
        commentKey: key
      }));
      markPatchDone(key, patch, source);
      timing.log(legacyRepatch ? 'posts_text_legacy_repatch_result' : 'posts_text_patch_async_result', {
        durationMs: Date.now() - started,
        commentKey: maskKey(key),
        ok: Boolean(patch?.ok),
        skipped: Boolean(patch?.skipped),
        reason: clean(patch?.reason || ''),
        source,
        runtimeVersion: RUNTIME
      });
    } catch (error) {
      markPatchDone(key, { ok: false, error: { message: String(error?.message || error || 'async_patch_failed') } }, source);
      timing.log(legacyRepatch ? 'posts_text_legacy_repatch_result' : 'posts_text_patch_async_result', {
        durationMs: Date.now() - started,
        commentKey: maskKey(key),
        ok: false,
        error: String(error?.message || error),
        source,
        runtimeVersion: RUNTIME
      });
    }
  }, 0);
  return { ok: true, scheduled: true, pending: true, async: true, legacyRepatch, runtimeVersion: RUNTIME };
}

async function editPostTextFast({ commentKey = '', text = '', sourceAttachments = undefined, link = undefined, format = undefined, actorId = '', actorName = '', config = {} }) {
  const totalStarted = Date.now();
  const key = clean(commentKey);
  const meta = { commentKey: maskKey(key), userId: timing.mask(actorId) };

  const ensured = await timing.measure('posts_text_stage_find_post', meta, async () => ensurePatchablePost(key, config, { actorId }));
  const post = ensured.post;
  const source = ensured.expiredWindowFallback ? 'legacy_repatch_expired_window' : 'post_text_save';

  const currentAttachments = normalizeAttachments(post.sourceAttachments || post.attachments || []);
  const nextAttachments = sourceAttachments !== undefined ? normalizeAttachments(sourceAttachments) : currentAttachments;
  const attachmentsChanged = attachmentsFingerprint(nextAttachments) !== attachmentsFingerprint(currentAttachments);
  const nextText = normalizeText(text || (attachmentsChanged ? (post.originalText || post.postText || post.text || '') : ''));
  if (!nextText) throw new Error('text_required');
  if (nextText === normalizeText(post.originalText || '') && !attachmentsChanged) throw new Error('text_not_changed');

  const version = await timing.measure('posts_text_stage_version_save', meta, async () => savePostVersion(key, {
    type: attachmentsChanged ? (ensured.expiredWindowFallback ? 'legacy_repatch_text_media_edit' : 'edit_text_media') : (ensured.expiredWindowFallback ? 'legacy_repatch_text_edit' : 'edit'),
    snapshotText: String(post.originalText || ''),
    appliedText: nextText,
    snapshotAttachments: currentAttachments,
    appliedAttachments: nextAttachments,
    actorId: clean(actorId),
    actorName: clean(actorName),
    sourceVersionId: '',
    runtimeVersion: RUNTIME,
    stagedPatch: true,
    asyncPatch: true,
    mediaUpdated: attachmentsChanged,
    expiredWindowFallback: Boolean(ensured.expiredWindowFallback),
    legacyRepatch: Boolean(ensured.expiredWindowFallback)
  }));

  const nextLink = link !== undefined ? cloneDeep(link) : cloneDeep(post.originalLink || null);
  const nextFormat = format !== undefined ? cloneDeep(format) : cloneDeep(post.originalFormat);

  await timing.measure('posts_text_stage_store_save', meta, async () => savePost(key, {
    originalText: nextText,
    ...(attachmentsChanged ? { sourceAttachments: nextAttachments, attachments: nextAttachments } : {}),
    ...(nextLink !== undefined ? { originalLink: cloneDeep(nextLink) } : {}),
    ...(nextFormat !== undefined ? { originalFormat: cloneDeep(nextFormat) } : {}),
    lastEditedAt: Date.now(),
    lastEditedBy: clean(actorName || actorId || 'admin'),
    lastEditedById: clean(actorId),
    lastEditVersionId: version?.id || '',
    lastPostTextSaveRuntime: RUNTIME,
    lastPatchPending: true,
    lastPatchPendingAt: Date.now(),
    lastPatchMode: ensured.expiredWindowFallback ? 'legacy_safe_repatch_expired_window' : 'async_full_post_patch',
    lastMediaEditIncluded: attachmentsChanged,
    lastTextEditExpiredWindowFallback: Boolean(ensured.expiredWindowFallback),
    lastLegacyRepatchRequestedAt: ensured.expiredWindowFallback ? Date.now() : 0
  }));

  const patch = await timing.measure('posts_text_patch_schedule', meta, async () => schedulePatch({ commentKey: key, config, source }));

  timing.log('posts_text_save_total_staged', {
    ...meta,
    ok: true,
    durationMs: Date.now() - totalStarted,
    asyncPatch: Boolean(patch?.pending),
    maxEditDeferred: true,
    mediaUpdated: attachmentsChanged,
    mediaCount: nextAttachments.length,
    expiredWindowFallback: Boolean(ensured.expiredWindowFallback),
    legacyRepatch: Boolean(patch?.legacyRepatch),
    runtimeVersion: RUNTIME
  });

  return {
    ok: true,
    version,
    patch,
    post: getPost(key),
    runtimeVersion: RUNTIME,
    maxEditDeferred: true,
    mediaUpdated: attachmentsChanged,
    mediaCount: nextAttachments.length,
    expiredWindowFallback: Boolean(ensured.expiredWindowFallback),
    legacyRepatch: Boolean(patch?.legacyRepatch)
  };
}

module.exports = {
  RUNTIME,
  editPostTextFast,
  schedulePatch
};
