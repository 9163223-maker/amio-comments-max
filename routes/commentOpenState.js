'use strict';

// CC8.3.49
// Express routes for the comments initial state.
// Clean contract fix: normalize media attachments in the open-state payload before mini app render.
// No public JS patching and no wrapper layer: backend route returns stable image fields for comments and post snapshot.

const postMetaService = require('../services/postMetaService');

const RUNTIME = 'CC8.3.49-COMMENT-OPEN-STATE-MEDIA-CONTRACT';

function setNoCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}

function safeError(error) {
  return error && error.message ? error.message : String(error || 'unknown_error');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstString(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
}

function payloadImageUrl(payload = {}) {
  if (!payload || typeof payload !== 'object') return '';
  const direct = firstString(payload.url, payload.download_url, payload.downloadUrl, payload.link, payload.previewUrl, payload.photoUrl, payload.imageUrl, payload.src);
  if (direct) return direct;
  if (payload.photos && typeof payload.photos === 'object') {
    const preferredKeys = ['url', 'download_url', 'downloadUrl', 'previewUrl', 'large', 'medium', 'small', 'default'];
    for (const key of preferredKeys) {
      const text = clean(payload.photos[key]);
      if (text) return text;
    }
    for (const value of Object.values(payload.photos)) {
      const text = clean(value);
      if (text) return text;
    }
  }
  return '';
}

function looksLikeImageAttachment(source = {}, url = '') {
  const type = clean(source.type || source.kind || source.uploadType || source.commentType).toLowerCase();
  const mime = clean(source.mimeType || source.mime || source.contentType).toLowerCase();
  const name = clean(source.fileName || source.filename || source.name).toLowerCase();
  const rawUrl = clean(url || source.url || source.previewUrl || source.photoUrl || source.imageUrl || source.src || source.dataUrl || source.previewDataUrl || source.thumbDataUrl).toLowerCase();
  if (['image', 'photo', 'picture'].includes(type)) return true;
  if (mime.startsWith('image/')) return true;
  if (/^data:image\//i.test(rawUrl)) return true;
  if (/\.(jpg|jpeg|png|webp|gif|heic|heif)(?:[?#]|$)/i.test(rawUrl)) return true;
  if (/\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(name)) return true;
  if (source.photoUrl || source.imageUrl || source.previewUrl || source.preview_url || source.thumbDataUrl || source.previewDataUrl || source.dataUrl) return true;
  return false;
}

function normalizeAttachmentForMiniApp(item = {}) {
  if (!item || typeof item !== 'object') return null;
  const source = { ...item };
  const type = clean(source.type || source.kind || source.uploadType || source.commentType).toLowerCase();
  if (type === 'sticker' || type === 'preset_sticker') return source;

  const payload = source.payload && typeof source.payload === 'object' ? source.payload : {};
  const selectedUrl = firstString(
    source.thumbDataUrl,
    source.previewDataUrl,
    source.dataUrl,
    source.url,
    source.previewUrl,
    source.preview_url,
    source.photoUrl,
    source.imageUrl,
    source.src,
    source.downloadUrl,
    source.download_url,
    source.link,
    payloadImageUrl(payload),
    source.posterUrl,
    source.poster_url,
    source.rawUrl,
    source.raw_url
  );
  const isImage = looksLikeImageAttachment(source, selectedUrl);
  if (!isImage) return source;

  const normalized = {
    ...source,
    type: 'image',
    kind: 'image',
    mimeType: clean(source.mimeType || source.mime || source.contentType) || 'image/jpeg',
    mime: clean(source.mime || source.mimeType || source.contentType) || 'image/jpeg',
    fileName: clean(source.fileName || source.filename || source.name) || 'photo.jpg',
    name: clean(source.name || source.fileName || source.filename) || 'photo.jpg'
  };
  if (selectedUrl) {
    if (!normalized.url) normalized.url = selectedUrl;
    if (!normalized.previewUrl) normalized.previewUrl = selectedUrl;
  }
  return normalized;
}

function normalizeAttachments(list) {
  return Array.isArray(list) ? list.map(normalizeAttachmentForMiniApp).filter(Boolean) : [];
}

function normalizeMetaMedia(meta = {}) {
  if (!meta || typeof meta !== 'object') return meta;
  const postSnapshot = meta.postSnapshot && typeof meta.postSnapshot === 'object' ? { ...meta.postSnapshot } : null;
  const post = meta.post && typeof meta.post === 'object' ? { ...meta.post } : null;
  const snapshotAttachments = normalizeAttachments(postSnapshot && postSnapshot.attachments);
  const postAttachments = normalizeAttachments(post && (post.attachments || post.sourceAttachments || post.mediaAttachments || post.originalAttachments || post.media));
  const metaAttachments = normalizeAttachments(meta.attachments || meta.sourceAttachments || meta.mediaAttachments || meta.originalAttachments || meta.media);
  const attachments = snapshotAttachments.length ? snapshotAttachments : (postAttachments.length ? postAttachments : metaAttachments);
  const out = { ...meta };
  if (postSnapshot) {
    out.postSnapshot = { ...postSnapshot, attachments };
    if (attachments.length) {
      out.postSnapshot.sourceAttachments = normalizeAttachments(postSnapshot.sourceAttachments).length ? normalizeAttachments(postSnapshot.sourceAttachments) : attachments;
      out.postSnapshot.mediaAttachments = normalizeAttachments(postSnapshot.mediaAttachments).length ? normalizeAttachments(postSnapshot.mediaAttachments) : attachments;
    }
  }
  if (post) {
    out.post = { ...post, attachments: postAttachments.length ? postAttachments : attachments };
  }
  if (attachments.length) {
    out.attachments = normalizeAttachments(meta.attachments).length ? normalizeAttachments(meta.attachments) : attachments;
    out.sourceAttachments = normalizeAttachments(meta.sourceAttachments).length ? normalizeAttachments(meta.sourceAttachments) : attachments;
    out.mediaAttachments = normalizeAttachments(meta.mediaAttachments).length ? normalizeAttachments(meta.mediaAttachments) : attachments;
  }
  return out;
}

function normalizeOpenStateMediaContract(state = {}) {
  if (!state || typeof state !== 'object') return state;
  const out = { ...state };
  out.meta = normalizeMetaMedia(state.meta || {});
  if (state.postSnapshot && typeof state.postSnapshot === 'object') {
    const normalizedSnapshot = normalizeMetaMedia({ postSnapshot: state.postSnapshot }).postSnapshot || state.postSnapshot;
    out.postSnapshot = normalizedSnapshot;
  } else if (out.meta && out.meta.postSnapshot) {
    out.postSnapshot = out.meta.postSnapshot;
  }
  out.comments = Array.isArray(state.comments)
    ? state.comments.map((comment) => comment && typeof comment === 'object'
      ? { ...comment, attachments: normalizeAttachments(comment.attachments) }
      : comment)
    : [];
  out.commentsCount = Number(state.commentsCount || out.comments.length || 0) || out.comments.length;
  out.mediaContractRuntimeVersion = RUNTIME;
  return out;
}

async function buildStateFromRequest(req, options = {}) {
  const params = postMetaService.parseParamsFromRequest(req);
  const state = await postMetaService.buildCommentOpenState(params, options);
  return normalizeOpenStateMediaContract(state);
}

function requestSnapshot(req) {
  return {
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    query: req.query || {},
    headers: {
      referer: req.get ? (req.get('referer') || req.get('referrer') || '') : '',
      userAgent: req.get ? (req.get('user-agent') || '') : ''
    }
  };
}

async function commentOpenStateHandler(req, res) {
  setNoCache(res);
  try {
    const state = await buildStateFromRequest(req, { includeComments: true });
    return res.json({
      ...state,
      ok: Boolean(state && state.meta),
      routeRuntimeVersion: RUNTIME,
      serviceRuntimeVersion: postMetaService.RUNTIME || state.runtimeVersion || '',
      source: 'routes/commentOpenState.js -> services/postMetaService.js'
    });
  } catch (error) {
    return res.json({
      ok: false,
      routeRuntimeVersion: RUNTIME,
      serviceRuntimeVersion: postMetaService.RUNTIME || '',
      params: null,
      meta: null,
      postSnapshot: null,
      comments: [],
      commentsCount: 0,
      error: safeError(error)
    });
  }
}

async function debugCommentOpenStateHandler(req, res) {
  setNoCache(res);
  try {
    const params = postMetaService.parseParamsFromRequest(req);
    const state = normalizeOpenStateMediaContract(await postMetaService.buildCommentOpenState(params, { includeComments: true }));
    return res.json({
      ok: Boolean(state && state.meta),
      routeRuntimeVersion: RUNTIME,
      serviceRuntimeVersion: postMetaService.RUNTIME || '',
      service: postMetaService.selfTest ? postMetaService.selfTest() : null,
      request: requestSnapshot(req),
      params,
      state,
      meta: state ? state.meta : null,
      postSnapshot: state ? state.postSnapshot : null,
      resolverTrace: state ? state.resolverTrace : null,
      mediaContractRuntimeVersion: RUNTIME,
      error: state && state.error ? state.error : ''
    });
  } catch (error) {
    return res.json({
      ok: false,
      routeRuntimeVersion: RUNTIME,
      serviceRuntimeVersion: postMetaService.RUNTIME || '',
      request: requestSnapshot(req),
      error: safeError(error)
    });
  }
}

function registerCommentOpenStateRoutes(app) {
  if (!app || app.__adminkitCommentOpenStateRoutes) return app;
  app.__adminkitCommentOpenStateRoutes = true;

  app.get('/api/adminkit/comment-open-state', commentOpenStateHandler);
  app.get('/debug/comment-open-state', debugCommentOpenStateHandler);

  // Compatibility endpoint while old debug links still exist.
  // It returns the same resolver result, but the clean route is /api/adminkit/comment-open-state.
  app.get('/debug/post-meta-clean', async (req, res) => {
    setNoCache(res);
    try {
      const params = postMetaService.parseParamsFromRequest(req);
      const meta = normalizeMetaMedia(await postMetaService.resolvePostMeta(params));
      return res.json({
        ok: Boolean(meta),
        routeRuntimeVersion: RUNTIME,
        serviceRuntimeVersion: postMetaService.RUNTIME || '',
        request: requestSnapshot(req),
        params,
        meta,
        postSnapshot: meta && meta.postSnapshot ? meta.postSnapshot : null,
        mediaContractRuntimeVersion: RUNTIME,
        error: meta ? '' : 'post_meta_not_found'
      });
    } catch (error) {
      return res.json({
        ok: false,
        routeRuntimeVersion: RUNTIME,
        serviceRuntimeVersion: postMetaService.RUNTIME || '',
        request: requestSnapshot(req),
        params: null,
        meta: null,
        postSnapshot: null,
        error: safeError(error)
      });
    }
  });

  return app;
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    serviceRuntimeVersion: postMetaService.RUNTIME || '',
    endpoints: [
      '/api/adminkit/comment-open-state',
      '/debug/comment-open-state',
      '/debug/post-meta-clean'
    ],
    policy: 'explicit_express_routes_no_cache_stable_payload_debug_post_snapshot_media_contract'
  };
}

module.exports = {
  RUNTIME,
  registerCommentOpenStateRoutes,
  buildStateFromRequest,
  normalizeOpenStateMediaContract,
  normalizeAttachmentForMiniApp,
  selfTest
};