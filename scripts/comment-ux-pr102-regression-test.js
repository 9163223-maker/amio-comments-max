'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appOnepass = fs.readFileSync(path.join(root, 'public', 'app-onepass.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const timingRoutes = fs.readFileSync(path.join(root, 'performance-debug-routes-pr73.js'), 'utf8');
const openStateRoute = fs.readFileSync(path.join(root, 'routes', 'commentOpenState.js'), 'utf8');

function has(text, needle, message) {
  assert.ok(text.includes(needle), message || `missing ${needle}`);
}

has(loader, "v8360-media-ux-fallback", 'loader should cache-bump onepass to v8360');
has(appOnepass, 'function clearComposerPhotoPreviewAfterOptimisticInsert', 'composer optimistic clear helper should exist');
has(appOnepass, "clearComposerPhotoPreviewAfterOptimisticInsert(optimisticCommentId, preview)", 'send path should clear composer preview immediately after optimistic render/scroll');
has(appOnepass, "composer_preview_cleared_after_optimistic", 'composer clear trace should be emitted');
has(appOnepass, 'optimisticImageUsesSrc(previewUrl)', 'pending-photo cleanup should avoid revoking object URLs still used by optimistic DOM');
has(appOnepass, "data-media-src-locked=\"1\"", 'optimistic media rows should remain source-locked');
has(appOnepass, 'media_dom_preserved', 'server confirm should preserve optimistic media DOM');
has(appOnepass, '.comment-row:last-child:has(.comment-attachment-image)', 'last media row should have stable scroll margin');
has(appOnepass, '.comment-row.last-media-comment', 'JS fallback class for last media row should be styled');
has(appOnepass, "classList.add('last-media-comment')", 'render should mark last media row for bottom inset fallback');
has(appOnepass, 'post_media_img_onerror', 'post media should trace image load failures');
has(appOnepass, 'Фото поста недоступно', 'post media fallback text should not break post header');
has(appOnepass, 'post_media_source_selected', 'post media source selection should be traced');
has(appOnepass, '/api/adminkit/post-media-preview?src=', 'external post media should use server-side lightweight preview proxy');
has(openStateRoute, '/api/adminkit/post-media-preview', 'post media preview proxy endpoint should be registered');
has(openStateRoute, 'AdminkitPostMediaPreview/1.0', 'post media proxy should fetch external image server-side');
for (const field of ['serverCount', 'renderableCount', 'hiddenBrokenCount', 'postMediaCount', 'mediaThumbCount', 'runtimeBrokenCount', 'renderMs']) {
  has(timingRoutes, `${field}: safe.${field}`, `miniapp timing details should persist ${field}`);
}

console.log('comment UX PR102 regression contract passed');
