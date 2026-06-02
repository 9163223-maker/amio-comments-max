'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const openStateModule = require('../routes/commentOpenState');

const root = path.join(__dirname, '..');
const appOnepass = fs.readFileSync(path.join(root, 'public', 'app-onepass.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const miniApp = fs.readFileSync(path.join(root, 'mini-app.html'), 'utf8');
const timingRoutes = fs.readFileSync(path.join(root, 'performance-debug-routes-pr73.js'), 'utf8');
const openStateRoute = fs.readFileSync(path.join(root, 'routes', 'commentOpenState.js'), 'utf8');

function has(text, needle, message) {
  assert.ok(text.includes(needle), message || `missing ${needle}`);
}

has(loader, 'v8360-media-ux-fallback', 'loader should cache-bump onepass to v8360');
has(miniApp, '/public/app.js?v=8360-media-ux-fallback', 'mini-app entrypoint should cache-bump app.js to v8360');
has(appOnepass, 'function clearComposerPhotoPreviewAfterOptimisticInsert', 'composer optimistic clear helper should exist');
has(appOnepass, 'const pendingPhotoForUpload = hasPhoto ? snapshotPendingPhotoForUpload(state.pendingPhoto) : null', 'send path should snapshot pending photo before optimistic clear');
has(appOnepass, 'clearComposerPhotoPreviewAfterOptimisticInsert(optimisticCommentId, preview)', 'send path should clear composer preview immediately after optimistic render/scroll');
has(appOnepass, 'await buildPreviewOnlyAttachment(pendingPhotoForUpload)', 'upload payload should be built from saved pending snapshot after composer clear');
has(appOnepass, 'composer_preview_cleared_after_optimistic', 'composer clear trace should be emitted');
has(appOnepass, 'optimisticImageUsesSrc(previewUrl)', 'pending-photo cleanup should avoid revoking object URLs still used by optimistic DOM');
has(appOnepass, 'data-media-src-locked="1"', 'optimistic media rows should remain source-locked');
has(appOnepass, 'media_dom_preserved', 'server confirm should preserve optimistic media DOM');
has(appOnepass, '.comment-row:last-child:has(.comment-attachment-image)', 'last media row should have stable scroll margin');
has(appOnepass, '.comment-row.last-media-comment', 'JS fallback class for last media row should be styled');
assert.ok(!appOnepass.includes('.comment-row:last-child:has(.comment-attachment-image),.comment-row.last-media-comment'), 'last-media fallback must not share a selector list with :has because older WebViews drop invalid selector lists');
has(appOnepass, "classList.add('last-media-comment')", 'render should mark last media row for bottom inset fallback');
has(appOnepass, 'post_media_img_onerror', 'post media should trace image load failures');
has(appOnepass, 'Фото поста недоступно', 'post media fallback text should not break post header');
has(appOnepass, 'post_media_source_selected', 'post media source selection should be traced');
has(appOnepass, '/api/adminkit/post-media-preview?src=', 'external post media should use server-side lightweight preview proxy');
has(openStateRoute, '/api/adminkit/post-media-preview', 'post media preview proxy endpoint should be registered');
has(openStateRoute, "redirect: 'manual'", 'post media proxy must not auto-follow redirects');
has(openStateRoute, 'post_media_redirect_blocked', 'post media proxy should block redirects instead of following them');
has(openStateRoute, 'safeImageLookup', 'post media proxy should validate DNS-resolved fetch addresses');
has(openStateRoute, 'POST_MEDIA_PRIVATE_ADDRESS_BLOCKED', 'post media proxy should fail closed on private DNS targets');
has(openStateRoute, 'readLimitedResponseBuffer', 'post media proxy should enforce byte limit while streaming');
has(openStateRoute, 'setPostMediaImageCache', 'post media proxy success should use dedicated public cache headers');
has(openStateRoute, "removeHeader('Pragma')", 'post media proxy success should clear no-cache Pragma header');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://127.0.0.1/private.jpg'), false, 'redirect target localhost should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://localhost./private.jpg'), false, 'trailing-dot localhost should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://example.com:22/private.jpg'), false, 'non-standard external ports should be unsafe for post media proxy');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('https://example.com:443/photo.jpg'), true, 'explicit default https port should be safe before DNS checks');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://192.168.1.5/private.jpg'), false, 'redirect target private address should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('file:///etc/passwd'), false, 'file/internal protocols should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://[::1]/private.jpg'), false, 'IPv6 localhost should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://[::7f00:1]/private.jpg'), false, 'IPv4-compatible IPv6 localhost should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://[::ffff:192.168.1.5]/private.jpg'), false, 'IPv4-mapped IPv6 private address should be unsafe');
assert.strictEqual(openStateModule.ipv4FromEmbeddedIPv6('::ffff:192.168.1.5'), '192.168.1.5', 'IPv4-mapped dotted IPv6 should decode to IPv4');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://[fd00::1]/private.jpg'), false, 'IPv6 unique-local should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageUrl('http://[fea0::1]/private.jpg'), false, 'IPv6 link-local fe80::/10 range should be unsafe');
assert.strictEqual(openStateModule.firstIPv6Hextet('fea0::1'), 0xfea0, 'IPv6 first hextet parser should support link-local range checks');
assert.strictEqual(openStateModule.isSafeExternalImageAddress('::7f00:1'), false, 'resolved IPv4-compatible IPv6 localhost should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageAddress('169.254.10.20'), false, 'link-local resolved address should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageAddress('10.1.2.3'), false, 'private resolved address should be unsafe');
assert.strictEqual(openStateModule.isSafeExternalImageAddress('93.184.216.34'), true, 'public resolved address should be allowed');
assert.strictEqual(openStateModule.isAllowedPostMediaContentType('image/jpeg; charset=binary'), true, 'jpeg post media content-type should be allowed');
assert.strictEqual(openStateModule.isAllowedPostMediaContentType('image/svg+xml'), false, 'svg post media should not be proxied as same-origin content');
{
  const removed = [];
  const headers = {};
  openStateModule.setPostMediaImageCache({ removeHeader(name) { removed.push(name); }, set(values) { Object.assign(headers, values); } }, 'image/jpeg');
  assert.ok(removed.includes('Pragma') && removed.includes('Expires') && removed.includes('Surrogate-Control'), 'post media success should remove inherited no-cache headers');
  assert.strictEqual(headers['Cache-Control'], 'public, max-age=300, stale-while-revalidate=300', 'post media success should set public cache control');
}
assert.strictEqual(openStateModule.normalizeAttachmentForMiniApp({ type: 'video', mimeType: 'video/mp4', posterUrl: 'https://cdn.example/video-poster.jpg' }).type, 'video', 'video poster should not be normalized into image comments');
for (const field of ['serverCount', 'renderableCount', 'hiddenBrokenCount', 'postMediaCount', 'mediaThumbCount', 'runtimeBrokenCount', 'renderMs']) {
  has(timingRoutes, `${field}: safe.${field}`, `miniapp timing details should persist ${field}`);
}

async function verifyBuildPreviewFromSnapshotAfterOptimisticClear() {
  class FakeElement {
    constructor() { this.innerHTML = ''; this.classList = { add() {}, remove() {} }; this.style = { setProperty() {} }; }
    addEventListener() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
    appendChild() {}
  }
  class FakeFileReader {
    readAsDataURL() {
      this.result = 'data:image/jpeg;base64,QUJDRA==';
      if (this.onload) this.onload();
    }
  }
  const elements = { attachmentPreview: new FakeElement(), commentsList: new FakeElement(), attachmentInput: new FakeElement() };
  const context = {
    window: {},
    document: {
      readyState: 'loading',
      body: { classList: { add() {}, remove() {} } },
      documentElement: { style: { setProperty() {} } },
      head: { appendChild() {} },
      getElementById(id) { return elements[id] || null; },
      querySelector() { return null; },
      createElement() { return new FakeElement(); },
      addEventListener() {}
    },
    location: { search: '', pathname: '/mini-app.html', href: 'https://example.test/mini-app.html' },
    navigator: { sendBeacon() { return true; } },
    Blob: class Blob { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    FileReader: FakeFileReader,
    URL: { revokeObjectURL() {}, createObjectURL() { return 'blob:test'; } },
    setInterval() { return 0; },
    clearInterval() {},
    setTimeout() {},
    fetch() { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
    console
  };
  context.window = Object.assign(context.window, context, { CSS: { escape: String }, WebApp: null });
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(appOnepass, context, { filename: 'public/app-onepass.js' });
  const hooks = context.window.__ADMINKIT_ONEPASS_TEST_HOOKS__;
  const pending = { fileName: 'photo.jpg', mimeType: 'image/jpeg', previewUrl: 'blob:optimistic', compressed: { blob: {}, fileName: 'photo.jpg', size: 4, width: 2, height: 2 } };
  const snapshot = hooks.snapshotPendingPhotoForUpload(pending);
  hooks.clearComposerPhotoPreviewAfterOptimisticInsert('client_test', pending.previewUrl);
  assert.strictEqual(hooks.hasDisplayableMedia({ type: 'video', mimeType: 'video/mp4', posterUrl: 'https://cdn.example/video-poster.jpg' }), false, 'video poster should not render as comment image');
  assert.strictEqual(hooks.hasDisplayableMedia({ type: 'file', mimeType: 'application/pdf', url: 'https://cdn.example/file.jpg' }), false, 'file URL ending with jpg should not render as comment image');
  const protocolRelativePostMedia = hooks.postMediaCandidates({ previewAttachments: [{ type: 'image', url: '//cdn.example/post.jpg' }] });
  assert.strictEqual(protocolRelativePostMedia.length, 1, 'protocol-relative post media should be detected');
  assert.ok(protocolRelativePostMedia[0].renderUrl.startsWith('/api/adminkit/post-media-preview?src='), 'protocol-relative external post media should use proxy');
  assert.strictEqual(new URLSearchParams(protocolRelativePostMedia[0].renderUrl.split('?')[1]).get('src'), 'https://cdn.example/post.jpg', 'protocol-relative post media proxy src should be absolute');
  const attachments = await hooks.buildPreviewOnlyAttachment(snapshot);
  assert.strictEqual(attachments.length, 1, 'buildPreviewOnlyAttachment should return one image attachment after optimistic clear');
  assert.strictEqual(attachments[0].type, 'image', 'snapshot-built attachment should be image');
}

verifyBuildPreviewFromSnapshotAfterOptimisticClear()
  .then(() => console.log('comment UX PR102 regression contract passed'))
  .catch((error) => { console.error(error); process.exit(1); });
