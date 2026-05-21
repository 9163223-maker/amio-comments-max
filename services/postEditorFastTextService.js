'use strict';

const {
  getPost,
  savePost,
  savePostVersion
} = require('../store');
const { editMessage } = require('./maxApi');
const { patchStoredPost } = require('./postPatcher');
const postEditor = require('./postEditorService');
const timing = require('../v3-ui-timing-cc8');

const RUNTIME = 'CC8.0.11-POSTS-SAVE-STAGED';

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

function getEditableMeta(post = {}, config = {}) {
  if (typeof postEditor.getEditableMeta === 'function') return postEditor.getEditableMeta(post, config);
  const hours = Number(config.postEditWindowHours || 24);
  const createdAt = Number(post.createdAt || post.updatedAt || 0) || 0;
  const deadlineAt = createdAt ? createdAt + hours * 60 * 60 * 1000 : 0;
  const msLeft = deadlineAt ? deadlineAt - Date.now() : 0;
  return { windowHours: hours, createdAt, deadlineAt, editable: Boolean(deadlineAt) && msLeft > 0, msLeft: Math.max(0, msLeft) };
}

function ensureEditablePost(commentKey = '', config = {}) {
  const key = clean(commentKey);
  const post = getPost(key);
  if (!post) throw new Error('post_not_found');
  if (!post.messageId) throw new Error('message_id_missing');
  const editable = getEditableMeta(post, config);
  if (!editable.editable) throw new Error('post_edit_window_expired');
  return { post, editable };
}

function maskKey(value = '') {
  const key = clean(value);
  return key.length > 18 ? key.slice(0, 8) + '…' + key.slice(-6) : key;
}

function schedulePatch({ commentKey = '', config = {}, source = 'post_text_save' } = {}) {
  const key = clean(commentKey);
  if (!key) return { ok: false, scheduled: false, reason: 'comment_key_missing' };
  setTimeout(async () => {
    const started = Date.now();
    try {
      const patch = await timing.measure('posts_text_stage_patch_async', { commentKey: maskKey(key), source }, () => patchStoredPost({
        botToken: config.botToken,
        appBaseUrl: config.appBaseUrl,
        botUsername: config.botUsername,
        maxDeepLinkBase: config.maxDeepLinkBase,
        commentKey: key
      }));
      if (!patch?.ok) {
        savePost(key, {
          lastPatchError: patch?.error || { message: patch?.reason || 'async_patch_failed' },
          lastPatchAttemptAt: Date.now(),
          lastAsyncPatchRuntime: RUNTIME
        });
      }
      timing.log('posts_text_patch_async_result', {
        durationMs: Date.now() - started,
        commentKey: maskKey(key),
        ok: Boolean(patch?.ok),
        skipped: Boolean(patch?.skipped),
        reason: clean(patch?.reason || ''),
        source
      });
    } catch (error) {
      savePost(key, {
        lastPatchError: { message: String(error?.message || error || 'async_patch_failed') },
        lastPatchAttemptAt: Date.now(),
        lastAsyncPatchRuntime: RUNTIME
      });
      timing.log('posts_text_patch_async_result', {
        durationMs: Date.now() - started,
        commentKey: maskKey(key),
        ok: false,
        error: String(error?.message || error),
        source
      });
    }
  }, 0);
  return { ok: true, scheduled: true, pending: true, async: true, runtimeVersion: RUNTIME };
}

async function editPostTextFast({ commentKey = '', text = '', link = undefined, format = undefined, actorId = '', actorName = '', config = {} }) {
  const totalStarted = Date.now();
  const key = clean(commentKey);
  const meta = { commentKey: maskKey(key), userId: timing.mask(actorId) };

  const ensured = await timing.measure('posts_text_stage_find_post', meta, async () => ensureEditablePost(key, config));
  const post = ensured.post;

  const nextText = normalizeText(text);
  if (!nextText) throw new Error('text_required');
  if (nextText === normalizeText(post.originalText || '')) throw new Error('text_not_changed');

  const version = await timing.measure('posts_text_stage_version_save', meta, async () => savePostVersion(key, {
    type: 'edit',
    snapshotText: String(post.originalText || ''),
    appliedText: nextText,
    snapshotAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    appliedAttachments: normalizeAttachments(post.sourceAttachments || post.attachments || []),
    actorId: clean(actorId),
    actorName: clean(actorName),
    sourceVersionId: '',
    runtimeVersion: RUNTIME,
    stagedPatch: true
  }));

  const nextLink = link !== undefined ? cloneDeep(link) : cloneDeep(post.originalLink || null);
  const nextFormat = format !== undefined ? cloneDeep(format) : cloneDeep(post.originalFormat);

  const editResult = await timing.measure('posts_text_stage_max_edit', { ...meta, messageId: timing.mask(post.messageId) }, () => editMessage({
    botToken: config.botToken,
    messageId: post.messageId,
    text: nextText,
    ...(nextLink ? { link: cloneDeep(nextLink) } : {}),
    ...(nextFormat !== undefined ? { format: cloneDeep(nextFormat) } : {}),
    notify: false
  }));

  await timing.measure('posts_text_stage_store_save', meta, async () => savePost(key, {
    originalText: nextText,
    ...(nextLink !== undefined ? { originalLink: cloneDeep(nextLink) } : {}),
    ...(nextFormat !== undefined ? { originalFormat: cloneDeep(nextFormat) } : {}),
    lastEditedAt: Date.now(),
    lastEditedBy: clean(actorName || actorId || 'admin'),
    lastEditedById: clean(actorId),
    lastEditVersionId: version?.id || '',
    lastPostTextSaveRuntime: RUNTIME,
    lastPatchPending: true,
    lastPatchPendingAt: Date.now()
  }));

  const patch = await timing.measure('posts_text_stage_patch_schedule', meta, async () => schedulePatch({ commentKey: key, config, source: 'post_text_save' }));

  const card = await timing.measure('posts_text_stage_build_result', meta, async () => postEditor.buildPostAdminCard(getPost(key), config));

  timing.log('posts_text_save_total_staged', {
    ...meta,
    ok: true,
    durationMs: Date.now() - totalStarted,
    asyncPatch: Boolean(patch?.pending),
    runtimeVersion: RUNTIME
  });

  return {
    ok: true,
    version,
    editResult,
    patch,
    post: card,
    runtimeVersion: RUNTIME
  };
}

module.exports = {
  RUNTIME,
  editPostTextFast,
  schedulePatch
};
