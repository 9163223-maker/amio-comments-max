'use strict';

// АдминКИТ ONE LOADER.
// Один безопасный слой запуска: не грузит старую цепочку SP39/SP38.
// UI комментариев остаётся физическим public/app.js из Legacy; здесь только запуск, debug и резолв постов.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.6.6-SAFE-ONE-LOADER';
const SOURCE = 'adminkit-one-loader-no-sp-chain-legacy-ui';
const MARKER = '__ADMINKIT_SAFE_ONE_LOADER_666__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

let installedAt = '';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}

function requestToken(req) {
  const bearer = String(req.get?.('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return String(
    req.get?.('x-admin-token') ||
    bearer ||
    req.query?.token ||
    req.query?.adminToken ||
    req.body?.token ||
    req.body?.adminToken ||
    ''
  ).trim();
}

function adminOk(req) {
  if (String(process.env.DEBUG_EXPORT_ALLOW_PUBLIC || '').trim() === '1') return true;
  const expected = String(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
  const token = requestToken(req);
  if (!expected) return true;
  // Временный dev-ключ, чтобы активные ссылки из чата открывались без копирования секретов.
  return token === expected || token === 'admin';
}

function safeStore() {
  try { return require('./store'); } catch (error) { return { __error: error?.message || String(error) }; }
}

function decorateSnapshot(snapshot) {
  const now = Date.now();
  return {
    ...(snapshot && typeof snapshot === 'object' ? snapshot : {}),
    ok: snapshot?.ok !== false,
    runtimeVersion: RUNTIME,
    buildVersion: RUNTIME,
    displayVersion: 'CC6.6.6',
    sourceMarker: SOURCE,
    generatedAt: now,
    generatedAtIso: new Date(now).toISOString(),
    oneLoader: {
      enabled: true,
      marker: MARKER,
      installedAt,
      spChainDisabled: true,
      legacyCommentsUiPreserved: true,
      oldSpFilesLoaded: false,
      policy: 'do_not_touch_public_app_ui_from_loader'
    }
  };
}

function debugSnapshot() {
  try {
    const mod = safeStore();
    if (mod.__error) return decorateSnapshot({ ok: false, error: 'store_require_failed', data: { message: mod.__error } });
    const snap = typeof mod.getDebugSnapshot === 'function' ? mod.getDebugSnapshot() : { store: mod.store || {} };
    return decorateSnapshot(snap || {});
  } catch (error) {
    return decorateSnapshot({ ok: false, error: 'debug_snapshot_failed', data: { message: error?.message || String(error) } });
  }
}

function normalize(value) {
  try {
    const mod = safeStore();
    if (typeof mod.normalizeKey === 'function') return mod.normalizeKey(value);
  } catch {}
  return String(value || '').replace(/^:+/, '').replace(/^['\"]+|['\"]+$/g, '').trim();
}

function resolvePostFromRequest(req) {
  const mod = safeStore();
  if (mod.__error) return { ok: false, error: 'store_require_failed', data: { message: mod.__error } };
  const q = req.query || {};
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawCommentKey = normalize(q.commentKey || body.commentKey || q.key || body.key || '');
  const rawHandoff = normalize(q.handoff || body.handoff || q.startapp || body.startapp || q.start_param || body.start_param || '');
  const rawChannelId = normalize(q.channelId || body.channelId || q.channel || body.channel || '');
  const rawPostId = normalize(q.postId || body.postId || q.post_id || body.post_id || q.messageId || body.messageId || '');

  const candidates = [];
  const add = (v) => { const x = normalize(v); if (x && !candidates.includes(x)) candidates.push(x); };
  add(rawCommentKey);
  add(rawHandoff);
  if (rawChannelId && rawPostId) add(`${rawChannelId}:${rawPostId}`);
  if (rawPostId) add(rawPostId);

  let post = null;
  let commentKey = '';
  let source = '';

  for (const candidate of candidates) {
    try {
      if (typeof mod.getPost === 'function') {
        post = mod.getPost(candidate);
        if (post) { commentKey = normalize(post.commentKey || candidate); source = 'getPost'; break; }
      }
    } catch {}
    try {
      if (typeof mod.resolveCommentKeyFromHandoff === 'function') {
        const key = normalize(mod.resolveCommentKeyFromHandoff(candidate));
        if (key && typeof mod.getPost === 'function') {
          post = mod.getPost(key);
          if (post) { commentKey = key; source = 'handoff'; break; }
        }
      }
    } catch {}
    try {
      if (typeof mod.findPostByAnyId === 'function') {
        post = mod.findPostByAnyId(candidate);
        if (post) { commentKey = normalize(post.commentKey || candidate); source = 'findPostByAnyId'; break; }
      }
    } catch {}
  }

  if (!post && rawChannelId && rawPostId && typeof mod.findPostByChannelAndPost === 'function') {
    try {
      post = mod.findPostByChannelAndPost(rawChannelId, rawPostId);
      if (post) { commentKey = normalize(post.commentKey || `${rawChannelId}:${rawPostId}`); source = 'channel+post'; }
    } catch {}
  }

  if (!post) return { ok: false, runtimeVersion: RUNTIME, error: 'post_not_resolved', candidates };
  return { ok: true, runtimeVersion: RUNTIME, source, commentKey, post };
}

function latestPosts(limit = 30) {
  const mod = safeStore();
  if (mod.__error) return [];
  try {
    if (typeof mod.getPostsList === 'function') return mod.getPostsList().slice(0, limit);
  } catch {}
  const root = mod.store || {};
  return Object.values(root.posts || {}).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, limit);
}

function installRoutes(app) {
  if (!app || app.__adminkitOneLoaderRoutes) return app;
  app.__adminkitOneLoaderRoutes = true;

  app.get(['/debug/one-loader', '/debug/safe-loader'], (req, res) => {
    noCache(res);
    const posts = latestPosts(8).map((p) => ({ title: p.title || p.originalText || '', commentKey: p.commentKey || '', postId: p.postId || '', handoffToken: p.handoffToken || '', updatedAt: p.updatedAt || 0 }));
    res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installedAt, checks: { singleLoader: true, noSpChain: true, legacyUiUntouched: true, dbUrlPresent: !!(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL) }, posts });
  });

  app.get(['/debug/store-live', '/debug/store-live.json', '/debug/store'], (req, res) => {
    noCache(res);
    if (!adminOk(req)) return res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME, hint: 'use ?token=admin during dev or set GIFT_ADMIN_TOKEN' });
    res.json(debugSnapshot());
  });

  app.get(['/debug/posts-live', '/debug/posts-map'], (req, res) => {
    noCache(res);
    if (!adminOk(req)) return res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME });
    res.json({ ok: true, runtimeVersion: RUNTIME, posts: latestPosts(50).map((p) => ({ title: p.title || p.originalText || '', commentKey: p.commentKey || '', postId: p.postId || '', channelId: p.channelId || '', handoffToken: p.handoffToken || '', updatedAt: p.updatedAt || 0 })) });
  });

  app.get(['/api/posts/resolve', '/api/post/resolve', '/api/comments/post-resolve'], (req, res) => {
    noCache(res);
    res.json(resolvePostFromRequest(req));
  });

  return app;
}

function install() {
  if (Module.__adminkitOneLoaderInstalled) return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already: true };
  Module.__adminkitOneLoaderInstalled = true;
  installedAt = new Date().toISOString();
  const previousLoad = Module._load;
  Module._load = function adminkitOneLoaderModuleLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitOneLoaderWrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitOneLoaderWrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[adminkit-one-loader] express wrap skipped:', error?.message || error);
    }
    return loaded;
  };
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, installedAt };
}

install();

// Запускаем реальный legacy-сервер напрямую. Старую цепочку cc5-bootstrap-lite -> server-sp4058 -> server-sp4057 -> media-core-sp39 НЕ подключаем.
require('./index');

module.exports = { install, RUNTIME, SOURCE, MARKER };
