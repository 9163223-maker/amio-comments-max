'use strict';

const commentService = require('./commentService');
const stickerPackService = require('./stickerPackService');
const {
  getComments,
  setComments,
  store,
  saveStore,
  normalizeKey
} = require('../store');

const RUNTIME = 'PR88-COMMENTS-FULL-SELFTEST';
const TEST_USER = 'selftest_owner';
const OTHER_USER = 'selftest_other';
const DEFAULT_PACK_ID = stickerPackService.DEFAULT_PACK_ID || 'adminkit_whales_v1';

let latestReport = null;

function nowIso() { return new Date().toISOString(); }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function makeKey() { return normalizeKey(`selftest_pr88_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`); }
function pass(id, details = {}) { return { id, status: 'pass', details }; }
function fail(id, expected, actual, details = {}) { return { id, status: 'fail', expected, actual, details }; }
function assertResult(results, id, condition, expected, actual, details = {}) {
  results.push(condition ? pass(id, details) : fail(id, expected, actual, details));
}
function findById(commentKey, commentId) {
  return getComments(commentKey).find((item) => item && item.id === commentId) || null;
}
function resetKey(commentKey) {
  const key = normalizeKey(commentKey);
  if (!key) return;
  try { setComments(key, []); } catch {}
  try {
    if (store.likes && Object.prototype.hasOwnProperty.call(store.likes, key)) delete store.likes[key];
    if (store.reactions && Object.prototype.hasOwnProperty.call(store.reactions, key)) delete store.reactions[key];
    saveStore(store);
  } catch {}
}

function createStickerComment(commentKey, opts = {}) {
  const stickerId = clean(opts.stickerId || 'adminkit_ok');
  return commentService.createComment({
    commentKey,
    userId: opts.userId || TEST_USER,
    userName: opts.userName || 'Self Test Owner',
    avatarUrl: '',
    replyToId: opts.replyToId || '',
    text: `Стикер ${stickerId}`,
    attachments: [{
      type: 'sticker',
      commentType: 'sticker',
      adminkitQueuedSticker: true,
      packId: opts.packId || DEFAULT_PACK_ID,
      stickerId,
      displayText: 'Стикер',
      moderationText: `Стикер ${stickerId}`
    }]
  });
}

async function runFullCommentsSelftest(options = {}) {
  const startedAt = nowIso();
  const commentKey = clean(options.commentKey) || makeKey();
  const results = [];
  resetKey(commentKey);

  try {
    const text = commentService.createComment({
      commentKey,
      userId: TEST_USER,
      userName: 'Self Test Owner',
      text: 'Selftest text comment',
      attachments: []
    });
    assertResult(results, 'create_text_comment', Boolean(text && text.id && text.text), 'text comment is created', text, { commentId: text && text.id });

    const photo = commentService.createComment({
      commentKey,
      userId: TEST_USER,
      userName: 'Self Test Owner',
      text: 'Selftest photo caption',
      attachments: [{ type: 'image', name: 'selftest-photo.webp', url: '/public/stickers/adminkit/v1/adminkit_ok.webp' }]
    });
    assertResult(results, 'create_photo_comment', Boolean(photo && photo.id && Array.isArray(photo.attachments) && photo.attachments.length === 1), 'photo comment has one attachment', photo, { commentId: photo && photo.id });

    const sticker = createStickerComment(commentKey, { stickerId: 'adminkit_ok' });
    assertResult(results, 'create_sticker_comment', Boolean(sticker && sticker.id && sticker.type === 'sticker' && sticker.text === 'Стикер' && sticker.stickerId === 'adminkit_ok'), 'sticker comment metadata persisted', sticker, { commentId: sticker && sticker.id });

    const replyTextToSticker = commentService.createComment({
      commentKey,
      userId: TEST_USER,
      userName: 'Self Test Owner',
      text: 'Reply to sticker',
      replyToId: sticker && sticker.id,
      attachments: []
    });
    assertResult(results, 'reply_text_to_sticker', Boolean(replyTextToSticker && replyTextToSticker.replyToId === sticker.id), 'replyToId points to sticker comment', replyTextToSticker, { parentId: sticker && sticker.id });

    const replyStickerToPhoto = createStickerComment(commentKey, { stickerId: 'adminkit_love', replyToId: photo && photo.id });
    assertResult(results, 'reply_sticker_to_photo', Boolean(replyStickerToPhoto && replyStickerToPhoto.type === 'sticker' && replyStickerToPhoto.replyToId === photo.id), 'sticker reply points to photo comment', replyStickerToPhoto, { parentId: photo && photo.id });

    const listed = commentService.listComments(commentKey, TEST_USER);
    const listedStickerReply = listed.find((item) => item.id === replyTextToSticker.id);
    assertResult(results, 'reply_preview_for_sticker_parent', Boolean(listedStickerReply && listedStickerReply.replyTo && listedStickerReply.replyTo.text === 'Стикер'), 'reply preview for sticker parent is Стикер', listedStickerReply && listedStickerReply.replyTo, { commentId: replyTextToSticker && replyTextToSticker.id });

    commentService.toggleReaction({ commentKey, commentId: sticker.id, userId: TEST_USER, emoji: '👍' });
    const reacted = commentService.listComments(commentKey, TEST_USER).find((item) => item.id === sticker.id);
    assertResult(results, 'reaction_on_sticker', Boolean(reacted && reacted.reactionCounts && reacted.reactionCounts['👍'] === 1), 'reaction count is 1', reacted && reacted.reactionCounts, { commentId: sticker && sticker.id });

    const duplicateA = createStickerComment(commentKey, { stickerId: 'adminkit_party' });
    const duplicateB = createStickerComment(commentKey, { stickerId: 'adminkit_party' });
    const partyCount = getComments(commentKey).filter((item) => item.type === 'sticker' && item.stickerId === 'adminkit_party').length;
    assertResult(results, 'dedupe_duplicate_sticker', Boolean(duplicateA && duplicateB && duplicateA.id === duplicateB.id && partyCount === 1), 'duplicate sticker collapses to one comment', { duplicateA, duplicateB, partyCount });

    const deleteSticker = createStickerComment(commentKey, { stickerId: 'adminkit_sad' });
    let deleteResult = null;
    try {
      deleteResult = commentService.deleteComment({ commentKey, commentId: deleteSticker.id, userId: TEST_USER });
    } catch (error) {
      deleteResult = { error: error.message };
    }
    const existsAfterDelete = Boolean(findById(commentKey, deleteSticker.id));
    assertResult(results, 'delete_sticker_comment_should_work', deleteResult === true && !existsAfterDelete, 'sticker comment deleted and absent from list', { deleteResult, existsAfterDelete }, { commentId: deleteSticker && deleteSticker.id });

    const otherSticker = createStickerComment(commentKey, { stickerId: 'adminkit_happy', userId: OTHER_USER, userName: 'Self Test Other' });
    let forbiddenDelete = null;
    try {
      forbiddenDelete = commentService.deleteComment({ commentKey, commentId: otherSticker.id, userId: TEST_USER });
    } catch (error) {
      forbiddenDelete = { error: error.message };
    }
    assertResult(results, 'delete_other_user_sticker_forbidden', Boolean(forbiddenDelete && forbiddenDelete.error === 'forbidden' && findById(commentKey, otherSticker.id)), 'deleting another user sticker is forbidden', forbiddenDelete, { commentId: otherSticker && otherSticker.id });

    const finalComments = getComments(commentKey);
    assertResult(results, 'list_comments_contains_all_core_types', Boolean(finalComments.some((item) => !item.type && item.text) && finalComments.some((item) => item.attachments && item.attachments.length) && finalComments.some((item) => item.type === 'sticker')), 'text/photo/sticker comments are present', finalComments.map((item) => ({ id: item.id, type: item.type || 'text', text: item.text, attachments: (item.attachments || []).length })));
  } catch (error) {
    results.push(fail('selftest_unhandled_exception', 'no unhandled exception', error && (error.stack || error.message || String(error))));
  }

  const failed = results.filter((item) => item.status === 'fail');
  const report = {
    ok: failed.length === 0,
    runtimeVersion: RUNTIME,
    suite: 'ADMINKIT_COMMENTS_FULL',
    commentKey,
    startedAt,
    finishedAt: nowIso(),
    summary: {
      passed: results.length - failed.length,
      failed: failed.length,
      total: results.length
    },
    failures: failed,
    tests: results
  };
  latestReport = report;
  if (options.cleanup !== false) resetKey(commentKey);
  return report;
}

function getLatestReport() {
  return latestReport || { ok: false, runtimeVersion: RUNTIME, error: 'selftest_not_run_yet' };
}

module.exports = {
  RUNTIME,
  runFullCommentsSelftest,
  getLatestReport
};
