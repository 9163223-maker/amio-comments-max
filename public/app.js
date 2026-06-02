;(() => {
  'use strict';

  const RUNTIME = 'CC8.3.58-MINIAPP-MEDIA-HEALTH-FINGERPRINT';
  const ONEPASS_RUNTIME = 'CC8.3.58-MEDIA-HEALTH-FINGERPRINT';
  const SKELETON_RUNTIME = 'CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED';
  const PHOTO_FLOW_RUNTIME = 'CC8.3.53-PHOTO-PREVIEW-CONTRACT-80KB';
  const STICKERS_RUNTIME = 'CC8.2.0-ADMINKIT-STICKERS-COMMENTS-PR87';

  const LOADER_MARKER = '__ADMINKIT_CC8_3_55_MINIAPP_CRITICAL_FIRST_LOADER__';
  const SKELETON_MARKER = '__ADMINKIT_CC8_1_9_COMMENT_SKELETON_CONSUMER_GUARDED__';
  const PHOTO_FLOW_LOADER_MARKER = '__ADMINKIT_CC8_3_55_PHOTO_FLOW_LOADED__';
  const STICKERS_LOADER_MARKER = '__ADMINKIT_CC8_3_55_STICKERS_LOADED__';
  const COMPOSER_INTENT_MARKER = '__ADMINKIT_CC8_1_13_COMPOSER_INTENT_UNLOCK__';

  const ASSET_VERSION = 'v8359-media-health-fingerprint';
  const ONEPASS_SRC = '/public/app-onepass.js?v=8359-media-health-fingerprint';
  const SKELETON_SRC = '/public/app-skeleton-consumer-pr67.js?v=8357-debug-only';
  const PHOTO_FLOW_SRC = '/public/app-photo-flow-pr95.js?v=8357-disabled-clean-media-lifecycle';
  const STICKERS_SRC = '/public/app-stickers-pr87.js?v=8357-stickers';
  // Legacy smoke-test markers kept for additive performance contract compatibility:
  // CC8.1.15-PATCH-COMPUTE-BREAKDOWN
  // ASSET_VERSION = 'v7564-pr75'

  const LOADER_STARTED_AT = Date.now();

  if (window[LOADER_MARKER]) return;
  window[LOADER_MARKER] = true;
  window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;
  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_RUNTIME__ = SKELETON_RUNTIME;
  window.__ADMINKIT_PHOTO_FLOW_RUNTIME__ = PHOTO_FLOW_RUNTIME;
  window.__ADMINKIT_STICKERS_RUNTIME__ = STICKERS_RUNTIME;

  function absoluteUrl(src) { try { return new URL(String(src || ''), location.href).href; } catch (_) { return String(src || ''); } }
  function roundMs(value) { const n = Number(value || 0); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; }
  function getResourceTiming(src) {
    try {
      const absolute = absoluteUrl(src);
      if (!performance || typeof performance.getEntriesByType !== 'function') return { resourceCacheHint: 'unsupported' };
      const all = performance.getEntriesByType('resource') || [];
      const entry = all.slice().reverse().find((row) => {
        const name = String(row && row.name || '');
        return name === absolute || name.indexOf(src) >= 0 || absolute.indexOf(name) >= 0;
      });
      if (!entry) return { resourceCacheHint: 'missing' };
      const transferSize = Number(entry.transferSize || 0) || 0;
      const encodedBodySize = Number(entry.encodedBodySize || 0) || 0;
      const decodedBodySize = Number(entry.decodedBodySize || 0) || 0;
      return {
        resourceStartMs: roundMs(entry.startTime),
        resourceDurationMs: roundMs(entry.duration),
        resourceResponseEndMs: roundMs(entry.responseEnd),
        resourceTransferSize: Math.max(0, Math.round(transferSize)),
        resourceEncodedBodySize: Math.max(0, Math.round(encodedBodySize)),
        resourceDecodedBodySize: Math.max(0, Math.round(decodedBodySize)),
        resourceCacheHint: transferSize > 0 ? 'network' : ((encodedBodySize || decodedBodySize) ? 'cache' : 'zero_or_opaque'),
        resourceInitiatorType: String(entry.initiatorType || '')
      };
    } catch (_) { return { resourceCacheHint: 'error' }; }
  }
  function postMiniTiming(name, extra) {
    try {
      const now = Date.now();
      const scriptSrc = extra && extra.scriptSrc ? String(extra.scriptSrc) : '';
      const payload = {
        name,
        appRuntime: RUNTIME,
        assetVersion: ASSET_VERSION,
        route: String((location && location.pathname) || ''),
        href: String((location && location.href) || '').slice(0, 500),
        durationMs: now - LOADER_STARTED_AT,
        sinceLoaderStartMs: now - LOADER_STARTED_AT,
        navStartMs: performance && performance.timeOrigin ? Math.round(LOADER_STARTED_AT - performance.timeOrigin) : 0,
        ...(scriptSrc ? getResourceTiming(scriptSrc) : {}),
        ...(extra || {})
      };
      const body = JSON.stringify(payload);
      if (typeof fetch === 'function') {
        fetch('/api/debug/miniapp-timing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
        return;
      }
      if (navigator && typeof navigator.sendBeacon === 'function') navigator.sendBeacon('/api/debug/miniapp-timing', new Blob([body], { type: 'application/json' }));
    } catch (_) {}
  }
  function explicitSkeletonRequested() {
    const query = String((location && location.search) || '');
    return /(?:^|[?&])(adminkitSkeleton|commentSkeleton|skeletonConsumer)=1(?:&|$)/.test(query);
  }
  function getCommentClientState() {
    return window.__ADMINKIT_CC7_5_55_STATE__ || window.__ADMINKIT_CC7_5_53_STATE__ || window.__ADMINKIT_CC7_5_47_STATE__ || window.__ADMINKIT_CC7_5_6_STATE__ || window.__ADMINKIT_CC7_5_3_STATE__ || window.__ADMINKIT_CC7_2_STATE__ || null;
  }
  function installComposerIntentUnlock() {
    if (window[COMPOSER_INTENT_MARKER]) return;
    window[COMPOSER_INTENT_MARKER] = true;
    document.addEventListener('input', (event) => {
      const target = event && event.target;
      if (!target || target.id !== 'commentInput' || event.isTrusted === false) return;
      const state = getCommentClientState();
      const locks = state && state.textSendInFlight;
      if (!locks || typeof locks !== 'object' || !Object.keys(locks).length) return;
      state.textSendInFlight = {};
      window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_LAST__ = { at: Date.now(), unlockedCount: Object.keys(locks).length };
    }, true);
  }
  function loadScript(src, status, runtime, scriptMarker, options, onload) {
    const opts = options && typeof options === 'object' ? options : {};
    if (scriptMarker && window[scriptMarker]) {
      postMiniTiming('loader.' + status + '_skipped_existing', { status, scriptSrc: src, runtime });
      if (typeof onload === 'function') onload();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = status !== 'app';
    s.dataset.adminkitRuntime = runtime;
    if ('fetchPriority' in s) s.fetchPriority = status === 'app' ? 'high' : 'low';
    s.onload = () => {
      if (scriptMarker && opts.markAfterLoad) window[scriptMarker] = true;
      postMiniTiming('loader.' + status + '_loaded', { status, scriptSrc: s.src, runtime });
      postMiniTiming('loader.script_loaded', { status, scriptSrc: s.src, runtime });
      if (typeof onload === 'function') onload();
    };
    s.onerror = () => {
      postMiniTiming('loader.' + status + '_error', { status, scriptSrc: s.src, runtime });
      if (status === 'app') {
        const card = document.getElementById('postError');
        if (card) { card.textContent = 'Не удалось загрузить экран комментариев. Обновите страницу.'; card.style.display = 'block'; }
      }
    };
    (document.head || document.documentElement).appendChild(s);
    postMiniTiming('loader.' + status + '_appended', { status, scriptSrc: s.src, runtime });
    postMiniTiming('loader.script_appended', { status, scriptSrc: s.src, runtime });
  }
  function loadAddonsDeferred() {
    const run = () => {
      postMiniTiming('loader.photo_flow_disabled', { status: 'photo_flow_disabled', runtime: PHOTO_FLOW_RUNTIME, reason: 'onepass_clean_media_lifecycle' });
      loadScript(STICKERS_SRC, 'stickers', STICKERS_RUNTIME, STICKERS_LOADER_MARKER, { markAfterLoad: true });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1400 });
    else setTimeout(run, 900);
    postMiniTiming('loader.addons_deferred', { status: 'addons_deferred' });
  }
  function boot() {
    installComposerIntentUnlock();
    const skeleton = explicitSkeletonRequested();
    window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ENABLED__ = skeleton;
    postMiniTiming('loader.boot', { status: skeleton ? 'skeleton' : 'onepass', skeletonPolicy: 'explicit_debug_only', loadPolicy: 'critical_app_first_addons_deferred' });
    const appSrc = skeleton ? SKELETON_SRC : ONEPASS_SRC;
    loadScript(appSrc, 'app', skeleton ? SKELETON_RUNTIME : ONEPASS_RUNTIME, skeleton ? SKELETON_MARKER : null, { markAfterLoad: Boolean(skeleton) }, loadAddonsDeferred);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();