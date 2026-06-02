'use strict';

// CC8.3.49
// Express routes for the comments initial state.
// Clean contract fix: normalize media attachments in the open-state payload before mini app render.
// No public JS patching and no wrapper layer: backend route returns stable image fields for comments and post snapshot.

const postMetaService = require('../services/postMetaService');
const fetch = require('node-fetch');
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');

const RUNTIME = 'CC8.3.60-COMMENT-OPEN-STATE-POST-MEDIA-PROXY';

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

function clean(value, maxLen = 4096) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
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

function isExplicitNonImageAttachment(source = {}) {
  const type = clean(source.type || source.kind || source.uploadType || source.commentType).toLowerCase();
  const mime = clean(source.mimeType || source.mime || source.contentType).toLowerCase();
  if (['image', 'photo', 'picture'].includes(type) || mime.startsWith('image/')) return false;
  if (['video', 'file', 'document', 'audio', 'voice', 'archive'].includes(type)) return true;
  if (mime && !mime.startsWith('image/')) return true;
  return false;
}

function looksLikeImageAttachment(source = {}, url = '') {
  const type = clean(source.type || source.kind || source.uploadType || source.commentType).toLowerCase();
  const mime = clean(source.mimeType || source.mime || source.contentType).toLowerCase();
  const name = clean(source.fileName || source.filename || source.name).toLowerCase();
  const rawUrl = clean(url || source.url || source.previewUrl || source.photoUrl || source.imageUrl || source.src || source.dataUrl || source.previewDataUrl || source.thumbDataUrl).toLowerCase();
  if (['image', 'photo', 'picture'].includes(type)) return true;
  if (mime.startsWith('image/')) return true;
  if (isExplicitNonImageAttachment(source)) return false;
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


function ipv4Parts(address) {
  if (net.isIP(address) !== 4) return null;
  const parts = String(address).split('.').map((x) => Number(x));
  return parts.length === 4 && parts.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? parts : null;
}

function isUnsafeIPv4(address) {
  const parts = ipv4Parts(address);
  if (!parts) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function normalizeIpLiteral(value) {
  return String(value || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '').split('%')[0];
}

function normalizeHostForSafety(value) {
  return normalizeIpLiteral(value).replace(/\.+$/, '');
}

function isAllowedExternalImagePort(parsed) {
  const port = clean(parsed && parsed.port);
  if (!port) return true;
  if (parsed.protocol === 'http:') return port === '80';
  if (parsed.protocol === 'https:') return port === '443';
  return false;
}

function expandIPv6Hextets(address) {
  const value = normalizeIpLiteral(address);
  if (net.isIP(value) !== 6) return [];
  const pieces = value.split('::');
  if (pieces.length > 2) return [];
  const expandDottedTail = (parts) => {
    const out = parts.slice();
    const last = out[out.length - 1] || '';
    const dotted = ipv4Parts(last);
    if (dotted) out.splice(out.length - 1, 1, ((dotted[0] << 8) | dotted[1]).toString(16), ((dotted[2] << 8) | dotted[3]).toString(16));
    return out;
  };
  const head = expandDottedTail(pieces[0] ? pieces[0].split(':').filter(Boolean) : []);
  const tail = expandDottedTail(pieces.length === 2 && pieces[1] ? pieces[1].split(':').filter(Boolean) : []);
  const missing = pieces.length === 2 ? Math.max(0, 8 - head.length - tail.length) : 0;
  const hextets = head.concat(Array(missing).fill('0'), tail).map((part) => parseInt(part || '0', 16));
  if (hextets.length !== 8 || hextets.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return [];
  return hextets;
}

function ipv4FromEmbeddedIPv6(address) {
  const hextets = expandIPv6Hextets(address);
  if (hextets.length !== 8) return '';
  const firstFiveZero = hextets.slice(0, 5).every((part) => part === 0);
  const firstSixZero = firstFiveZero && hextets[5] === 0;
  const mapped = firstFiveZero && hextets[5] === 0xffff;
  const compatible = firstSixZero && (hextets[6] !== 0 || hextets[7] !== 0);
  if (!mapped && !compatible) return '';
  return [hextets[6] >> 8, hextets[6] & 255, hextets[7] >> 8, hextets[7] & 255].join('.');
}

function firstIPv6Hextet(address) {
  const hextets = expandIPv6Hextets(address);
  return hextets.length ? hextets[0] : -1;
}

function isUnsafeIPv6(address) {
  const value = normalizeIpLiteral(address);
  if (net.isIP(value) !== 6) return false;
  if (value === '::' || value === '::1') return true;
  const embedded = ipv4FromEmbeddedIPv6(value);
  if (embedded) return isUnsafeIPv4(embedded);
  const first = firstIPv6Hextet(value);
  if (first < 0) return true;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  const hextets = expandIPv6Hextets(value);
  if (hextets[0] === 0x2001 && hextets[1] === 0x0) return true; // 2001::/32 Teredo
  if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return true; // documentation range
  if (hextets[0] === 0x2002) return true; // 2002::/16 6to4 can tunnel to private IPv4
  if (hextets[0] === 0x64 && hextets[1] === 0xff9b && (hextets[2] === 0 || hextets[2] === 1)) return true; // NAT64 well-known/local-use prefixes
  return false;
}

function isSafeExternalImageAddress(address) {
  const value = normalizeIpLiteral(address);
  const family = net.isIP(value);
  if (family === 4) return !isUnsafeIPv4(value);
  if (family === 6) return !isUnsafeIPv6(value);
  return false;
}

function isSafeExternalImageUrl(value) {
  const raw = clean(value);
  if (!raw) return false;
  let parsed;
  try { parsed = new URL(raw); } catch { return false; }
  if (!/^https?:$/i.test(parsed.protocol)) return false;
  if (parsed.username || parsed.password) return false;
  if (!isAllowedExternalImagePort(parsed)) return false;
  const host = normalizeHostForSafety(parsed.hostname);
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
  if (net.isIP(host) && !isSafeExternalImageAddress(host)) return false;
  return true;
}

function safeImageLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (error, address, family) => {
    if (error) return callback(error);
    if (!isSafeExternalImageAddress(address)) {
      const blocked = new Error('post_media_private_address_blocked');
      blocked.code = 'POST_MEDIA_PRIVATE_ADDRESS_BLOCKED';
      return callback(blocked);
    }
    return callback(null, address, family);
  });
}

const postMediaHttpAgent = new http.Agent({ keepAlive: false, lookup: safeImageLookup });
const postMediaHttpsAgent = new https.Agent({ keepAlive: false, lookup: safeImageLookup });

function postMediaAgentForUrl(parsedUrl) {
  return parsedUrl && parsedUrl.protocol === 'http:' ? postMediaHttpAgent : postMediaHttpsAgent;
}

function isAllowedPostMediaContentType(value) {
  const type = clean(value).toLowerCase().split(';')[0].trim();
  if (!type || type === 'image/svg+xml') return false;
  return /^image\/(jpeg|jpg|png|gif|webp|avif|bmp|x-ms-bmp)$/i.test(type);
}

function setPostMediaImageCache(res, contentType) {
  try {
    if (res.removeHeader) {
      res.removeHeader('Pragma');
      res.removeHeader('Expires');
      res.removeHeader('Surrogate-Control');
    }
    res.set({
      'Content-Type': contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
      'X-Adminkit-Post-Media-Preview': RUNTIME
    });
  } catch {}
}

function readLimitedResponseBuffer(stream, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    stream.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        const error = new Error('post_media_too_large');
        error.code = 'POST_MEDIA_TOO_LARGE';
        stream.destroy(error);
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks, total)));
  });
}

async function postMediaPreviewHandler(req, res) {
  setNoCache(res);
  const src = clean(req && req.query && req.query.src, 4096);
  if (!isSafeExternalImageUrl(src)) {
    return res.status(400).json({ ok: false, routeRuntimeVersion: RUNTIME, error: 'invalid_post_media_url' });
  }
  try {
    const upstream = await fetch(src, {
      method: 'GET',
      redirect: 'manual',
      timeout: 8000,
      agent: postMediaAgentForUrl,
      headers: { 'User-Agent': 'AdminkitPostMediaPreview/1.0' }
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = clean(upstream.headers && upstream.headers.get('location'), 4096);
      let redirectTarget = '';
      try { redirectTarget = location ? new URL(location, src).href : ''; } catch {}
      return res.status(400).json({ ok: false, routeRuntimeVersion: RUNTIME, error: 'post_media_redirect_blocked', redirectSafe: Boolean(redirectTarget && isSafeExternalImageUrl(redirectTarget)) });
    }
    const contentType = clean(upstream.headers && upstream.headers.get('content-type')).toLowerCase();
    const maxBytes = 3 * 1024 * 1024;
    const contentLength = Number(upstream.headers && upstream.headers.get('content-length')) || 0;
    if (!upstream.ok || !isAllowedPostMediaContentType(contentType)) {
      return res.status(502).json({ ok: false, routeRuntimeVersion: RUNTIME, error: 'post_media_fetch_failed', status: upstream.status || 0 });
    }
    if (contentLength > maxBytes) {
      return res.status(502).json({ ok: false, routeRuntimeVersion: RUNTIME, error: 'post_media_too_large', size: contentLength });
    }
    const buf = await readLimitedResponseBuffer(upstream.body, maxBytes);
    if (!buf.length) {
      return res.status(502).json({ ok: false, routeRuntimeVersion: RUNTIME, error: 'post_media_too_large', size: buf.length });
    }
    setPostMediaImageCache(res, contentType);
    return res.send(buf);
  } catch (error) {
    const code = error && error.code;
    if (code === 'POST_MEDIA_PRIVATE_ADDRESS_BLOCKED') {
      return res.status(400).json({ ok: false, routeRuntimeVersion: RUNTIME, error: 'post_media_private_address_blocked' });
    }
    if (code === 'POST_MEDIA_TOO_LARGE') {
      return res.status(502).json({ ok: false, routeRuntimeVersion: RUNTIME, error: 'post_media_too_large' });
    }
    return res.status(502).json({ ok: false, routeRuntimeVersion: RUNTIME, error: 'post_media_proxy_error', message: safeError(error) });
  }
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
  app.get('/api/adminkit/post-media-preview', postMediaPreviewHandler);
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
      '/api/adminkit/post-media-preview',
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
  isExplicitNonImageAttachment,
  isSafeExternalImageUrl,
  isSafeExternalImageAddress,
  isAllowedExternalImagePort,
  setPostMediaImageCache,
  expandIPv6Hextets,
  firstIPv6Hextet,
  ipv4FromEmbeddedIPv6,
  isAllowedPostMediaContentType,
  selfTest
};
