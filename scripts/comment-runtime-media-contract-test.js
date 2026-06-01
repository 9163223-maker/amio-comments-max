'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { createComment, listComments } = require('../services/commentService');
const store = require('../store');

const uploadDir = path.join(__dirname, '..', 'public', 'comment-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const existingFile = 'runtime-existing-large-contract-test.jpg';
const existingPath = path.join(uploadDir, existingFile);
const missingFile = 'runtime-missing-contract-test.jpg';
const existingUrl = `/public/comment-uploads/${existingFile}`;
const missingUrl = `/public/comment-uploads/${missingFile}`;
const commentKey = `runtime_media_contract:${Date.now()}`;

try {
  fs.writeFileSync(existingPath, Buffer.alloc(330 * 1024, 0xff));
  try { fs.unlinkSync(path.join(uploadDir, missingFile)); } catch (_) {}

  createComment({
    commentKey,
    userId: 'test',
    userName: 'Test',
    text: '',
    clientCommentId: 'client_existing_runtime_media',
    attachments: [{ type: 'image', mimeType: 'image/jpeg', fileName: existingFile, url: existingUrl }]
  });
  createComment({
    commentKey,
    userId: 'test',
    userName: 'Test',
    text: '',
    clientCommentId: 'client_missing_runtime_media',
    attachments: [{ type: 'image', mimeType: 'image/jpeg', fileName: missingFile, url: missingUrl }]
  });

  const comments = listComments(commentKey, 'test');
  const existing = comments.find((item) => item.clientCommentId === 'client_existing_runtime_media');
  const missing = comments.find((item) => item.clientCommentId === 'client_missing_runtime_media');
  assert.ok(existing, 'existing runtime media comment should be listed');
  assert.ok(missing, 'missing runtime media comment should be listed');
  const existingAttachment = existing.attachments && existing.attachments[0];
  const missingAttachment = missing.attachments && missing.attachments[0];
  assert.ok(existingAttachment, 'existing runtime media attachment should remain available');
  assert.strictEqual(existingAttachment.url, existingUrl, 'existing runtime media should keep safe URL fallback');
  assert.strictEqual(existingAttachment.runtimeOnly, true, 'existing non-inline runtime media should be marked runtimeOnly');
  assert.strictEqual(existingAttachment.runtimeFileExists, true, 'existing non-inline runtime media should report file exists');
  assert.strictEqual(existingAttachment.inlinePreviewUnavailable, true, 'existing large runtime media should report inline preview unavailable');
  assert.notStrictEqual(existingAttachment.brokenRuntimeOnly, true, 'existing large runtime media must not be marked broken');
  assert.ok(missingAttachment, 'missing runtime media attachment should remain inspectable for client fallback handling');
  assert.strictEqual(missingAttachment.runtimeOnly, true, 'missing runtime media should be marked runtimeOnly');
  assert.strictEqual(missingAttachment.runtimeFileExists, false, 'missing runtime media should not report file exists');
  assert.strictEqual(missingAttachment.brokenRuntimeOnly, true, 'missing runtime media should be marked broken');

  const onepass = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-onepass.js'), 'utf8');
  assert.ok(!onepass.includes('(runtimeOnly && att.runtimeOnly)'), 'client resolver must not hide existing runtimeOnly safe URL fallbacks');
  assert.ok(onepass.includes('if (selected.broken)'), 'client renderer should explicitly skip broken runtime media');
  assert.ok(onepass.includes('if (!commentHasRenderableContent(comment || {}, attachments)) return;'), 'renderer should avoid empty time-only bubbles');

  console.log('comment runtime media contract ok');
} finally {
  try { fs.unlinkSync(existingPath); } catch (_) {}
  try { store.setComments(commentKey, []); } catch (_) {}
}
