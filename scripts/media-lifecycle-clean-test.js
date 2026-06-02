'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const route = require('../comment-open-state-route-1546');

const postPreview = route.buildPostMediaPreview({
  sourceAttachments: [
    { type: 'image', payload: { url: 'https://cdn.example.test/post-from-payload.jpg' } },
    { type: 'image', payload: { download_url: 'https://cdn.example.test/post-download.jpg' } },
    { type: 'image', payload: { link: 'https://cdn.example.test/post-link.jpg' } },
    { type: 'image', payload: { photo_url: 'https://cdn.example.test/post-photo.jpg' } },
    { type: 'image', payload: { image_url: 'https://cdn.example.test/post-image.jpg' } }
  ]
});
assert.deepStrictEqual(
  postPreview.map((item) => item.url),
  [
    'https://cdn.example.test/post-from-payload.jpg',
    'https://cdn.example.test/post-download.jpg',
    'https://cdn.example.test/post-link.jpg',
    'https://cdn.example.test/post-photo.jpg'
  ],
  'payload-wrapped post media should enter postSnapshot.previewAttachments with safe URL values'
);

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app-onepass.js'), 'utf8');
const postedTiming = [];
const context = {
  window: {},
  document: {
    readyState: 'loading',
    body: { classList: { add() {}, remove() {} } },
    documentElement: { style: { setProperty() {} } },
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {}
  },
  location: { search: '', pathname: '/mini-app.html', href: 'https://example.test/mini-app.html' },
  navigator: { sendBeacon() { return true; } },
  Blob: class Blob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
  URL: { revokeObjectURL() {} },
  setInterval() { return 0; },
  clearInterval() {},
  setTimeout() {},
  fetch(url, options) { if (url === '/api/debug/miniapp-timing') postedTiming.push(JSON.parse(options.body)); return Promise.resolve({ ok: true }); },
  console
};
context.window = Object.assign(context.window, { CSS: { escape: String }, WebApp: null });
context.window.window = context.window;
context.window.document = context.document;
context.window.location = context.location;
context.window.navigator = context.navigator;
context.window.Blob = context.Blob;
context.window.URL = context.URL;
context.window.setInterval = context.setInterval;
context.window.setTimeout = context.setTimeout;
context.window.fetch = context.fetch;
vm.createContext(context);
vm.runInContext(appSource, context, { filename: 'public/app-onepass.js' });

const hooks = context.window.__ADMINKIT_ONEPASS_TEST_HOOKS__;
assert.ok(hooks, 'app-onepass should expose lifecycle test hooks');

const brokenMediaOnly = {
  id: 'broken-media-only',
  text: '',
  createdAt: '2026-06-01T00:00:00Z',
  attachments: [{ type: 'image', url: '/public/comment-uploads/missing.jpg', runtimeOnly: true, brokenRuntimeOnly: true, runtimeFileExists: false }]
};
const textComment = { id: 'text', text: 'hello', attachments: [] };
const goodMedia = { id: 'good-media', text: '', attachments: [{ type: 'image', thumbDataUrl: 'data:image/jpeg;base64,AAAA' }] };
assert.strictEqual(hooks.isRenderableComment(brokenMediaOnly), false, 'broken runtime-only media-only comment must not be renderable');
assert.strictEqual(hooks.getRenderableComments([brokenMediaOnly, textComment, goodMedia]).length, 2, 'header count should be based on renderable comments');
assert.strictEqual(hooks.selectMediaSource(brokenMediaOnly.attachments[0]).broken, true, 'broken runtime-only media should be selected as broken and skipped');
assert.strictEqual(hooks.hasDisplayableMedia(brokenMediaOnly.attachments[0]), false, 'broken runtime-only media should not create an image node');

const reactionBase = [{ id: 'reacted', text: 'same text', attachments: [], createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' }];
const reactionToggled = [{
  id: 'reacted',
  text: 'same text',
  attachments: [],
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  reactionDetails: [{ emoji: '👍', count: 1, active: true }],
  ownReactions: ['👍'],
  reactionCounts: { '👍': 1 }
}];
const reactionIncremented = [{
  id: 'reacted',
  text: 'same text',
  attachments: [],
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  reactionDetails: [{ emoji: '👍', count: 2, active: true }],
  ownReactions: ['👍'],
  reactionCounts: { '👍': 2 }
}];
assert.notStrictEqual(hooks.computeCommentsFingerprint(reactionBase), hooks.computeCommentsFingerprint(reactionToggled), 'reaction toggle should change the render fingerprint');
assert.notStrictEqual(hooks.computeCommentsFingerprint(reactionToggled), hooks.computeCommentsFingerprint(reactionIncremented), 'reaction count changes should change the render fingerprint');

assert.ok(appSource.includes("if (fingerprint !== state.lastRenderFingerprint)"), 'renderOpenState should compare comment fingerprint');
assert.ok(appSource.includes("state.comments = mergedList;\n    emitTraceEvent('comment_render_skip_unchanged'"), 'unchanged polling should update state without re-rendering or touching img nodes');
assert.ok(appSource.includes('clearPendingPhoto(false);'), 'successful photo send should clear composer preview without revoking optimistic object URL');
assert.ok(appSource.includes("postMiniTiming('app.open_state_fetch_start'"), 'app open-state fetch timing should be emitted');
assert.ok(appSource.includes("postMiniTiming('app.comments_rendered'"), 'comments render timing should be emitted');
assert.ok(appSource.includes("postMiniTiming('app.media_summary'"), 'media summary timing should be emitted');

console.log('media lifecycle clean contract ok');
