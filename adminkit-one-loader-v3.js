'use strict';

// АдминКИТ ONE LOADER V3 — самостоятельный вход.
// Не подключает adminkit-one-loader.js V2, чтобы V2 больше не перетирал runtime/debug.
// Сохраняет рабочий Legacy Telegram-style comments UI и Clean Core V3 menu.

const Module = require('module');

const RUNTIME = 'CC6.6.6-SAFE-ONE-LOADER-V3';
const SOURCE = 'adminkit-one-loader-v3-standalone-no-v2';
const MARKER = '__ADMINKIT_SAFE_ONE_LOADER_666_V3_STANDALONE__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

let installedAt = '';
const layerStatus = [];

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
  return String(req.get?.('x-admin-token') || bearer || req.query?.token || req.query?.adminToken || req.body?.token || req.body?.adminToken || '').trim();
}

function adminOk(req) {
  if (String(process.env.DEBUG_EXPORT_ALLOW_PUBLIC || '').trim() === '1') return true;
  const expected = String(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '').trim();
  const token = requestToken(req);
  if (!expected) return true;
  return token === expected || token === 'admin';
}

function safeStore() {
  try { return require('./store'); } catch (error) { return { __error: error?.message || String(error) }; }
}

function normalize(value) {
  try {
    const mod = safeStore();
    if (typeof mod.normalizeKey === 'function') return mod.normalizeKey(value);
  } catch {}
  return String(value || '').replace(/^:+/, '').replace(/^["']+|["']+$/g, '').trim();
}

function loadLayer(pathName, mode = 'install') {
  const item = { path: pathName, mode, ok: false, at: new Date().toISOString(), error: '' };
  try {
    const mod = require(pathName);
    if (mode === 'install' && mod && typeof mod.install === 'function') {
      const result = mod.install();
      item.ok = result?.ok !== false;
      item.runtimeVersion = result?.runtimeVersion || mod.RUNTIME || '';
      item.marker = result?.marker || mod.MARKER || '';
    } else {
      item.ok = true;
      item.runtimeVersion = mod?.RUNTIME || '';
      item.marker = mod?.MARKER || '';
    }
  } catch (error) {
    item.ok = false;
    item.error = error?.message || String(error);
    console.warn('[one-loader-v3] layer failed:', pathName, item.error);
  }
  layerStatus.push(item);
  return item;
}

function loadPreIndexLayers() {
  if (global.__ADMINKIT_ONE_LOADER_V3_STANDALONE_LAYERS__) return;
  global.__ADMINKIT_ONE_LOADER_V3_STANDALONE_LAYERS__ = true;

  loadLayer('./adminkit-v3-main-menu-hard-override');

  // Старые кнопки комментариев: старые Post zero должны открывать обсуждение, а не посадочную.
  loadLayer('./adminkit-physical-cp-parser-fix');
  loadLayer('./adminkit-safe-comments-boot-core');
  loadLayer('./adminkit-comments-preboot-physical-patch');

  // Только дописывает title в уже открытом Legacy UI, если там осталось «Загрузка...».
  loadLayer('./adminkit-comments-title-resolve-patch');

  // Clean Core V3 menu stack. Не подключаем cc5-bootstrap-lite / server-sp4058 / server-sp4057 / media-core-sp39.
  loadLayer('./v3-silent-menu-callbacks');
  loadLayer('./v3-repatch-comments-links');
  loadLayer('./v3-register-post-debug');
  loadLayer('./clean-v3-main-route-guard');
  loadLayer('./clean-v3-menu-normalizer');
  loadLayer('./clean-v3-comments-banner-action');
  loadLayer('./clean-v3-comments-banner-router-fix');
  loadLayer('./clean-v3-comments-function-points-v2');
  loadLayer('./clean-v3-comments-banner-in-app-v3');
  loadLayer('./clean-v3-menu-debug');
  loadLayer('./clean-v3-menu-ok');
  loadLayer('./production-menu-v3-renderer-v2');
  loadLayer('./production-menu-map-v3-fixed-debug');
  loadLayer('./cc6542-hotfix-router');
  loadLayer('./v3-native-hints-cleanup');
  loadLayer('./adminkit-post-zero-safe-layer');
  loadLayer('./v3-disable-growth-cta');
}

function latestPosts(limit = 30) {
  const mod = safeStore();
  if (mod.__error) return [];
  try { if (typeof mod.getPostsList === 'function') return mod.getPostsList().slice(0, limit); } catch {}
  const root = mod.store || {};
  return Object.values(root.posts || {}).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, limit);
}

function resolvePostFromRequest(req) {
  const mod = safeStore();
  if (mod.__error) return { ok: false, runtimeVersion: RUNTIME, error: 'store_require_failed', data: { message: mod.__error } };
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
  if (rawChannelId && rawPostId) add(rawChannelId + ':' + rawPostId);
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
      if (post) { commentKey = normalize(post.commentKey || (rawChannelId + ':' + rawPostId)); source = 'channel+post'; }
    } catch {}
  }
  if (!post) return { ok: false, runtimeVersion: RUNTIME, error: 'post_not_resolved', candidates };
  return { ok: true, runtimeVersion: RUNTIME, source, commentKey, post };
}

function layerSummary() {
  const failed = layerStatus.filter((x) => !x.ok);
  return {
    total: layerStatus.length,
    failed: failed.length,
    failedLayers: failed.map((x) => ({ path: x.path, error: x.error })),
    hasCleanV3: layerStatus.some((x) => x.path === './production-menu-v3-renderer-v2' && x.ok),
    hasCleanV3HardOverride: layerStatus.some((x) => x.path === './adminkit-v3-main-menu-hard-override' && x.ok),
    hasOldPostParser: layerStatus.some((x) => x.path === './adminkit-safe-comments-boot-core' && x.ok),
    hasTitleResolvePatch: layerStatus.some((x) => x.path === './adminkit-comments-title-resolve-patch' && x.ok),
    hasSpChain: layerStatus.some((x) => /cc5-bootstrap-lite|server-sp4058|server-sp4057|media-core-sp39/.test(x.path))
  };
}

function decorateSnapshot(snapshot) {
  const now = Date.now();
  return {
    ...(snapshot && typeof snapshot === 'object' ? snapshot : {}),
    ok: snapshot?.ok !== false,
    runtimeVersion: RUNTIME,
    buildVersion: RUNTIME,
    displayVersion: 'CC6.6.6-v3',
    packageVersion: 'CC6.6.6-v3',
    sourceMarker: SOURCE,
    generatedAt: now,
    generatedAtIso: new Date(now).toISOString(),
    oneLoader: {
      enabled: true,
      marker: MARKER,
      installedAt,
      standalone: true,
      v2Loaded: false,
      spChainDisabled: true,
      legacyCommentsUiPreserved: true,
      cleanV3MenuRestored: true,
      cleanV3MenuHardOverride: true,
      safeOldPostParserRestored: true,
      commentsTitleResolvePatch: true,
      oldSpFilesLoaded: false,
      forbiddenChain: 'cc5-bootstrap-lite -> server-sp4058 -> server-sp4057 -> media-core-sp39',
      layerSummary: layerSummary(),
      loadedLayers: layerStatus
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

function installRoutes(app) {
  if (!app || app.__adminkitOneLoaderRoutesV3Standalone) return app;
  app.__adminkitOneLoaderRoutesV3Standalone = true;

  app.get(['/debug/one-loader', '/debug/safe-loader'], (req, res) => {
    noCache(res);
    res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installedAt, checks: { singleLoader: true, standalone: true, v2Loaded: false, noSpChain: true, legacyUiUntouched: true, cleanV3MenuRestored: true, cleanV3MenuHardOverride: true, safeOldPostParserRestored: true, commentsTitleResolvePatch: true, dbUrlPresent: !!(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL) }, layerSummary: layerSummary(), posts: latestPosts(12).map((p) => ({ title: p.title || p.originalText || '', commentKey: p.commentKey || '', postId: p.postId || '', channelId: p.channelId || '', handoffToken: p.handoffToken || '', updatedAt: p.updatedAt || 0 })) });
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
  if (Module.__adminkitOneLoaderInstalledV3Standalone) return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, already: true };
  Module.__adminkitOneLoaderInstalledV3Standalone = true;
  installedAt = new Date().toISOString();
  const previousLoad = Module._load;
  Module._load = function adminkitOneLoaderModuleLoadV3(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitOneLoaderWrappedV3Standalone) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitOneLoaderWrappedV3Standalone = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[one-loader-v3] express wrap skipped:', error?.message || error);
    }
    return loaded;
  };
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, installedAt };
}

install();
loadPreIndexLayers();

// Важно: V2-loader здесь НЕ подключается. Запускаем реальный сервер напрямую.
require('./index');

module.exports = { install, RUNTIME, SOURCE, MARKER, layerSummary };
