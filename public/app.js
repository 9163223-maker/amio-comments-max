;(() => {
'use strict';

const RUNTIME = 'CC8.2.4-ADMINKIT-COMPRESSED-FINAL-PHOTO-COMPOSER';
const SKELETON_RUNTIME = 'CC8.1.19-MINIAPP-SKELETON-DEFAULT-PR84';
const LEGACY_SKELETON_CONSUMER_PR67_RUNTIME = 'CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED';
const LEGACY_SKELETON_CONSUMER_PR67_ASSET = '/public/app-skeleton-consumer-pr67.js?';
const LEGACY_PR75_ASSET_VERSION = 'v7564-pr75';
const COMPOSER_INTENT_RUNTIME = 'CC8.1.13-COMPOSER-INTENT-UNLOCK';
const PERFORMANCE_TRACE_RUNTIME = 'CC8.1.15-PATCH-COMPUTE-BREAKDOWN';
const STICKERS_RUNTIME = 'CC8.2.0-ADMINKIT-STICKERS-COMMENTS-PR87';
const PHOTO_FLOW_RUNTIME = 'CC8.2.4-ADMINKIT-COMPRESSED-FINAL-PHOTO-COMPOSER';
const LOADER_OPTIMIZATION_RUNTIME = 'CC8.2.8-MINIAPP-RESOURCE-TIMING-CLIENT';

const LOADER_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE_LOADER__';
const ONEPASS_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE__';
const SKELETON_MARKER = '__ADMINKIT_CC8_1_19_MINIAPP_SKELETON_DEFAULT_PR84__';
const COMPOSER_INTENT_MARKER = '__ADMINKIT_CC8_1_13_COMPOSER_INTENT_UNLOCK__';
const STICKERS_LOADER_MARKER = '__ADMINKIT_STICKERS_PR87_LOADER__';
const PHOTO_FLOW_LOADER_MARKER = '__ADMINKIT_PHOTO_FLOW_PR95_LOADER__';

const ASSET_VERSION = 'v828-miniapp-resource-timing-client';

const SKELETON_SRC = '/public/app-skeleton-consumer-pr84.js?v=824-compressed-final-photo-composer';
const ONEPASS_SRC = '/public/app-onepass.js?' + ASSET_VERSION.replace(/^v/, 'v=');
const PHOTO_FLOW_SRC = '/public/app-photo-flow-pr95.js?v=pr96-2-compressed-final-photo-composer';
const STICKERS_SRC = '/public/app-stickers-pr87.js?v=pr87-stickers';

const LOADER_STARTED_AT = Date.now();

if (window[LOADER_MARKER]) return;
window[LOADER_MARKER] = true;

window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;
window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_RUNTIME__ = SKELETON_RUNTIME;
window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_PR67_COMPAT__ = {
  runtime: LEGACY_SKELETON_CONSUMER_PR67_RUNTIME,
  asset: LEGACY_SKELETON_CONSUMER_PR67_ASSET
};
window.__ADMINKIT_PR75_ASSET_VERSION_COMPAT__ = { legacyAssetVersion: LEGACY_PR75_ASSET_VERSION, currentAssetVersion: ASSET_VERSION };
window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_RUNTIME__ = COMPOSER_INTENT_RUNTIME;
window.__ADMINKIT_PERFORMANCE_TRACE_RUNTIME__ = PERFORMANCE_TRACE_RUNTIME;
window.__ADMINKIT_STICKERS_RUNTIME__ = STICKERS_RUNTIME;
window.__ADMINKIT_PHOTO_FLOW_RUNTIME__ = PHOTO_FLOW_RUNTIME;
window.__ADMINKIT_LOADER_OPTIMIZATION_RUNTIME__ = LOADER_OPTIMIZATION_RUNTIME;

function absoluteUrl(src) {
  try {
    return new URL(String(src || ''), location.href).href;
  } catch (_) {
    return String(src || '');
  }
}

function roundMs(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function getResourceTiming(src) {
  const absolute = absoluteUrl(src);

  try {
    if (!performance || typeof performance.getEntriesByName !== 'function') {
      return {};
    }

    const exact = performance.getEntriesByName(absolute);
    let entry = exact && exact.length ? exact[exact.length - 1] : null;

    if (!entry && typeof performance.getEntriesByType === 'function') {
      const all = performance.getEntriesByType('resource') || [];
      entry = all
        .slice()
        .reverse()
        .find((row) => {
          const name = String(row && row.name || '');
          return name === absolute || name.indexOf(src) >= 0 || absolute.indexOf(name) >= 0;
        });
    }

    if (!entry) {
      return {
        resourceCacheHint: 'resource_entry_missing'
      };
    }

    const transferSize = Number(entry.transferSize || 0) || 0;
    const encodedBodySize = Number(entry.encodedBodySize || 0) || 0;
    const decodedBodySize = Number(entry.decodedBodySize || 0) || 0;

    let cacheHint = 'network_or_unknown';
    if (transferSize === 0 && (encodedBodySize > 0 || decodedBodySize > 0)) {
      cacheHint = 'cache';
    } else if (transferSize > 0) {
      cacheHint = 'network';
    } else if (transferSize === 0 && encodedBodySize === 0 && decodedBodySize === 0) {
      cacheHint = 'zero_or_opaque';
    }

    return {
      resourceStartMs: roundMs(entry.startTime),
      resourceDurationMs: roundMs(entry.duration),
      resourceFetchStartMs: roundMs(entry.fetchStart),
      resourceRequestStartMs: roundMs(entry.requestStart),
      resourceResponseStartMs: roundMs(entry.responseStart),
      resourceResponseEndMs: roundMs(entry.responseEnd),
      resourceTransferSize: Math.max(0, Math.round(transferSize)),
      resourceEncodedBodySize: Math.max(0, Math.round(encodedBodySize)),
      resourceDecodedBodySize: Math.max(0, Math.round(decodedBodySize)),
      resourceCacheHint: cacheHint,
      resourceInitiatorType: String(entry.initiatorType || '')
    };
  } catch (_) {
    return {
      resourceCacheHint: 'resource_timing_error'
    };
  }
}

function postMiniTiming(name, extra) {
  try {
    const now = Date.now();
    const scriptSrc = extra && extra.scriptSrc ? String(extra.scriptSrc) : '';
    const resourceTiming = scriptSrc ? getResourceTiming(scriptSrc) : {};

    const payload = {
      name,
      appRuntime: RUNTIME,
      assetVersion: ASSET_VERSION,
      loaderRuntime: LOADER_OPTIMIZATION_RUNTIME,
      route: String((location && location.pathname) || ''),
      durationMs: now - LOADER_STARTED_AT,
      sinceLoaderStartMs: now - LOADER_STARTED_AT,
      navStartMs: performance && performance.timeOrigin
        ? Math.round(LOADER_STARTED_AT - performance.timeOrigin)
        : 0,
      ...resourceTiming,
      ...(extra || {})
    };

    const body = JSON.stringify(payload);

    const beacon = () => {
      try {
        if (navigator && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(
            '/api/debug/miniapp-timing',
            new Blob([body], { type: 'application/json' })
          );
        }
      } catch (_) {}
    };

    if (typeof fetch === 'function') {
      fetch('/api/debug/miniapp-timing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body,
        keepalive: true
      }).catch(beacon);
      return;
    }

    beacon();
  } catch (_) {}
}

function addScriptPreload(src, status) {
  try {
    if (!src || !document || !document.createElement) return;

    const absolute = absoluteUrl(src);
    const selector = 'link[rel="preload"][as="script"][href="' + absolute.replace(/"/g, '\\"') + '"]';

    if (document.querySelector && document.querySelector(selector)) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = src;
    link.crossOrigin = 'anonymous';

    if ('fetchPriority' in link) {
      link.fetchPriority = status === 'app' ? 'high' : 'low';
    }

    (document.head || document.documentElement).appendChild(link);

    postMiniTiming('loader.preload_appended', {
      status,
      scriptSrc: link.href
    });
  } catch (_) {}
}

function loadStickerAddon() {
  if (window[STICKERS_LOADER_MARKER]) return;
  window[STICKERS_LOADER_MARKER] = true;

  const s = document.createElement('script');
  s.src = STICKERS_SRC;
  s.async = true;
  s.dataset.adminkitRuntime = STICKERS_RUNTIME;

  if ('fetchPriority' in s) {
    s.fetchPriority = 'low';
  }

  s.onload = () => {
    postMiniTiming('loader.stickers_loaded', {
      status: 'stickers',
      scriptSrc: s.src,
      stickersRuntime: STICKERS_RUNTIME
    });
  };

  s.onerror = () => {
    postMiniTiming('loader.stickers_error', {
      status: 'stickers',
      scriptSrc: s.src,
      stickersRuntime: STICKERS_RUNTIME
    });
  };

  (document.head || document.documentElement).appendChild(s);

  postMiniTiming('loader.stickers_appended', {
    status: 'stickers',
    scriptSrc: s.src,
    stickersRuntime: STICKERS_RUNTIME
  });
}

function loadPhotoFlowAddon() {
  if (window[PHOTO_FLOW_LOADER_MARKER]) return;
  window[PHOTO_FLOW_LOADER_MARKER] = true;

  const s = document.createElement('script');
  s.src = PHOTO_FLOW_SRC;
  s.async = true;
  s.dataset.adminkitRuntime = PHOTO_FLOW_RUNTIME;

  if ('fetchPriority' in s) {
    s.fetchPriority = 'high';
  }

  s.onload = () => {
    postMiniTiming('loader.photo_flow_loaded', {
      status: 'photo_flow',
      scriptSrc: s.src,
      photoFlowRuntime: PHOTO_FLOW_RUNTIME
    });
  };

  s.onerror = () => {
    postMiniTiming('loader.photo_flow_error', {
      status: 'photo_flow',
      scriptSrc: s.src,
      photoFlowRuntime: PHOTO_FLOW_RUNTIME
    });
  };

  (document.head || document.documentElement).appendChild(s);

  postMiniTiming('loader.photo_flow_appended', {
    status: 'photo_flow',
    scriptSrc: s.src,
    photoFlowRuntime: PHOTO_FLOW_RUNTIME
  });
}

function loadCommentAddons() {
  loadPhotoFlowAddon();
  loadStickerAddon();
}

function hasCommentLaunchIdentity(query) {
  const raw = String(query || '');
  if (!raw) return false;

  if (/(?:^|[?&#])(commentKey|handoff|startapp|start_param|WebAppStartParam|payload|channelId|channel_id|postId|post_id|messageId|message_id)=/i.test(raw)) {
    return true;
  }

  if (/(?:cp|ck)_-?\d{3,}_-?\d{1,}/i.test(raw)) {
    return true;
  }

  if (/-?\d{3,}:-?\d{1,}/.test(raw)) {
    return true;
  }

  return false;
}

function wantsGuardedSkeletonConsumer() {
  const query = String((location && location.search) || '');
  const hash = String((location && location.hash) || '');

  if (/(?:^|[?&])(adminkitSkeleton|commentSkeleton|skeletonConsumer)=0(?:&|$)/.test(query)) {
    return false;
  }

  if (/(?:^|[?&])(adminkitSkeleton|commentSkeleton|skeletonConsumer)=1(?:&|$)/.test(query)) {
    return true;
  }

  return hasCommentLaunchIdentity(query) || hasCommentLaunchIdentity(hash);
}

function getCommentClientState() {
  return window.__ADMINKIT_CC7_5_55_STATE__ ||
    window.__ADMINKIT_CC7_5_53_STATE__ ||
    window.__ADMINKIT_CC7_5_47_STATE__ ||
    window.__ADMINKIT_CC7_5_6_STATE__ ||
    window.__ADMINKIT_CC7_5_3_STATE__ ||
    window.__ADMINKIT_CC7_2_STATE__ ||
    null;
}

function installComposerIntentUnlock() {
  if (window[COMPOSER_INTENT_MARKER]) return;
  window[COMPOSER_INTENT_MARKER] = true;

  document.addEventListener('input', (event) => {
    const target = event && event.target;
    if (!target || target.id !== 'commentInput') return;
    if (event.isTrusted === false) return;

    const state = getCommentClientState();
    const locks = state && state.textSendInFlight;

    if (!locks || typeof locks !== 'object') return;

    const lockedCount = Object.keys(locks).length;
    if (!lockedCount) return;

    state.textSendInFlight = {};
    window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_COUNT__ =
      Number(window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_COUNT__ || 0) + 1;

    window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_LAST__ = {
      at: Date.now(),
      unlockedCount: lockedCount
    };
  }, true);
}

function bootOnepass() {
  const guardedSkeleton = wantsGuardedSkeletonConsumer();

  if (!guardedSkeleton && window[ONEPASS_MARKER]) return;
  if (guardedSkeleton && window[SKELETON_MARKER]) return;

  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ENABLED__ = Boolean(guardedSkeleton);

  installComposerIntentUnlock();

  postMiniTiming('loader.boot', {
    status: guardedSkeleton ? 'skeleton' : 'onepass'
  });

  const appSrc = guardedSkeleton ? SKELETON_SRC : ONEPASS_SRC;

  addScriptPreload(appSrc, 'app');
  addScriptPreload(PHOTO_FLOW_SRC, 'photo_flow');
  addScriptPreload(STICKERS_SRC, 'stickers');

  const script = document.createElement('script');
  script.src = appSrc;
  script.async = false;
  script.dataset.adminkitRuntime = guardedSkeleton ? SKELETON_RUNTIME : RUNTIME;

  if ('fetchPriority' in script) {
    script.fetchPriority = 'high';
  }

  script.onload = () => {
    postMiniTiming('loader.script_loaded', {
      status: guardedSkeleton ? 'skeleton' : 'onepass',
      scriptSrc: script.src
    });

    loadCommentAddons();
  };

  script.onerror = () => {
    postMiniTiming('loader.script_error', {
      status: guardedSkeleton ? 'skeleton' : 'onepass',
      scriptSrc: script.src
    });

    const card = document.getElementById('postError');
    if (card) {
      card.textContent = 'Не удалось загрузить экран комментариев. Обновите страницу.';
      card.style.display = 'block';
    }
  };

  (document.head || document.documentElement).appendChild(script);

  postMiniTiming('loader.script_appended', {
    status: guardedSkeleton ? 'skeleton' : 'onepass',
    scriptSrc: script.src
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootOnepass, { once: true });
} else {
  bootOnepass();
}
})();
