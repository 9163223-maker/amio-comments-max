'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const postPatcher = fs.readFileSync(path.join(__dirname, '..', 'services', 'postPatcher.js'), 'utf8');

assert.ok(postPatcher.includes('POST_PATCHER_CLEAN_CORE_RUNTIME = "CC8.1.16-POST-PATCHER-CLEAN-CORE-PR77"'), 'postPatcher must expose PR77 clean core runtime');
assert.ok(postPatcher.includes('function shouldHydrateOriginalFromLive'), 'postPatcher must have explicit live hydration guard');
assert.ok(postPatcher.includes('snapshot_ready_no_live_getMessage'), 'ordinary snapshot-ready posts must skip live getMessage');
assert.ok(postPatcher.includes('originalSnapshotCaptured: true'), 'ingested posts must be marked as snapshot captured');
assert.ok(postPatcher.includes('originalTextKnown'), 'ingest should record original text known state');
assert.ok(postPatcher.includes('sourceAttachmentsKnown'), 'ingest should record attachment known state');
assert.ok(postPatcher.includes('originalLinkKnown'), 'ingest should record link known state');
assert.ok(postPatcher.includes('originalFormatKnown'), 'ingest should record format known state');
assert.ok(postPatcher.includes('resolvePatchMessageId({ messageId, postId, existingPost })'), 'channel patching must use messageId fallback resolver');
assert.ok(postPatcher.includes('return clean(messageId || existingPost?.messageId || postId)'), 'missing mid must fall back to postId');
assert.ok(postPatcher.includes('schedulePatchedPostDbSync("bootstrap"'), 'bootstrap db sync must be scheduled, not blocking visible patch');
assert.ok(postPatcher.includes('schedulePatchedPostDbSync("after_edit"'), 'post-patch db sync must run after editMessage');
assert.ok(postPatcher.includes('status: "deferred"'), 'compute db sync marker should report deferred status');
assert.ok(postPatcher.includes('shouldBuildPollRows'), 'poll rows must be guarded');
assert.ok(postPatcher.includes('no_poll_marker_cached_empty'), 'poll lookup should be skippable when known empty');
assert.ok(postPatcher.includes('link: originalLink || null'), 'fingerprint must include original link');
assert.ok(postPatcher.includes('format: originalFormat === undefined ? null : originalFormat'), 'fingerprint must include original format');
assert.ok(postPatcher.includes('commentsDisabled: Boolean(post?.commentsDisabled)'), 'fingerprint must include commentsDisabled');
assert.ok(postPatcher.includes('customRowsCount: customRows.length'), 'fingerprint must include custom row count');
assert.ok(postPatcher.includes('giftRowsCount: giftRows.length'), 'fingerprint must include gift row count');
assert.ok(postPatcher.includes('pollRowsCount: pollRows.length'), 'fingerprint must include poll row count');
assert.ok(postPatcher.includes('if (originalLink && typeof originalLink === "object") payload.link'), 'editMessage must preserve link payload');
assert.ok(postPatcher.includes('if (originalFormat !== undefined && originalFormat !== null) payload.format'), 'editMessage must preserve format payload');
assert.ok(postPatcher.includes('buildCommentsKeyboard'), 'comment button builder must remain in canonical patcher');
assert.ok(postPatcher.includes('buildGiftKeyboardRows'), 'gift rows must remain in canonical patcher');
assert.ok(postPatcher.includes('buildCustomKeyboardRows'), 'custom button rows must remain in canonical patcher');
assert.ok(!postPatcher.includes('postPatcherFast76'), 'PR77 must not add/use a separate fast patch layer');

console.log('post patcher clean core PR77 smoke ok');
