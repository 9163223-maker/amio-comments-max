'use strict';

// CC7.2.5
// Express routes for the comments initial state.
// Fix focus: keep new posts stable after the next deploy and expose clear diagnostics.
// This module is explicit: no Module._load, no public/app.js patching, no UI changes.

const postMetaService = require('../services/postMetaService');

const RUNTIME = 'CC7.2.5-COMMENT-OPEN-STATE-ROUTE';

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

async function buildStateFromRequest(req, options = {}) {
  const params = postMetaService.parseParamsFromRequest(req);
  return postMetaService.buildCommentOpenState(params, options);
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
    const state = await postMetaService.buildCommentOpenState(params, { includeComments: true });
    return res.json({
      ok: Boolean(state && state.meta),
      routeRuntimeVersion: RUNTIME,
      serviceRuntimeVersion: postMetaService.RUNTIME || '',
      service: postMetaService.selfTest ? postMetaService.selfTest() : null,
      request: requestSnapshot(req),
      params,
      state,
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
      const meta = await postMetaService.resolvePostMeta(params);
      return res.json({
        ok: Boolean(meta),
        routeRuntimeVersion: RUNTIME,
        serviceRuntimeVersion: postMetaService.RUNTIME || '',
        request: requestSnapshot(req),
        params,
        meta,
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
    policy: 'explicit_express_routes_with_no_cache_and_debug_payload_snapshot'
  };
}

module.exports = {
  RUNTIME,
  registerCommentOpenStateRoutes,
  buildStateFromRequest,
  selfTest
};
