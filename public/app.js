;(() => {
'use strict';

const RUNTIME = 'CC8.2.4-ADMINKIT-COMPRESSED-FINAL-PHOTO-COMPOSER';
const SKELETON_RUNTIME = 'CC8.1.19-MINIAPP-SKELETON-DEFAULT-PR84';
const LEGACY_SKELETON_CONSUMER_PR67_RUNTIME = 'CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED';
const LEGACY_SKELETON_CONSUMER_PR67_ASSET = '/public/app-skeleton-consumer-pr67.js?';
const LEGACY_SKELETON_CONSUMER_PR67_MARKER = '__ADMINKIT_CC8_1_9_COMMENT_SKELETON_CONSUMER_GUARDED__';
const LEGACY_PR75_ASSET_VERSION = 'v7564-pr75';
const COMPOSER_INTENT_RUNTIME = 'CC8.1.13-COMPOSER-INTENT-UNLOCK';
const PERFORMANCE_TRACE_RUNTIME = 'CC8.1.15-PATCH-COMPUTE-BREAKDOWN';
const STICKERS_RUNTIME = 'CC8.2.0-ADMINKIT-STICKERS-COMMENTS-PR87';
const PHOTO_FLOW_RUNTIME = 'CC8.2.4-ADMINKIT-COMPRESSED-FINAL-PHOTO-COMPOSER';

const LOADER_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE_LOADER__';
const ONEPASS_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE__';
const SKELETON_MARKER = '__ADMINKIT_CC8_1_19_MINIAPP_SKELETON_DEFAULT_PR84__';
const COMPOSER_INTENT_MARKER = '__ADMINKIT_CC8_1_13_COMPOSER_INTENT_UNLOCK__';
const STICKERS_LOADER_MARKER = '__ADMINKIT_STICKERS_PR87_LOADER__';
const PHOTO_FLOW_LOADER_MARKER = '__ADMINKIT_PHOTO_FLOW_PR95_LOADER__';

const ASSET_VERSION = 'v824-compressed-final-photo-composer';
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

function postMiniTiming(name, extra) {
  try {
    const now = Date.now();
    const payload = {
      name,
      appRuntime: RUNTIME,
      assetVersion: ASSET_VERSION,
      route: String((location && location.pathname) || ''),
      durationMs: now - LOADER_STARTED_AT,
      sinceLoaderStartMs: now - LOADER_STARTED_AT,
      navStartMs: performance && performance.timeOrigin ? Math.round(LOADER_STARTED_AT - performance.timeOrigin) : 0,
      ...(extra || {})
    };
    const body = JSON.stringify(payload);
    const beacon = () => {
      try {
        if (navigator && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon('/api/debug/miniapp-timing', new Blob([body], { type: 'application/json' }));
        }
      } catch (_) {}
    };
    if (typeof fetch === 'function') {
      fetch('/api/debug/miniapp-timing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch(beacon);
      return;
    }
    beacon();
  } catch (_) {}
}

function loadStickerAddon() {
  if (window[STICKERS_LOADER_MARKER]) return;
  window[STICKERS_LOADER_MARKER] = true;

  const s = document.createElement('script');
  s.src = '/public/app-stickers-pr87.js?v=pr87-stickers';
  s.async = true;
  s.dataset.adminkitRuntime = STICKERS_RUNTIME;
  s.onload = () => postMiniTiming('loader.stickers_loaded', {
    status: 'stickers',
    scriptSrc: s.src,
    stickersRuntime: STICKERS_RUNTIME
  });
  s.onerror = () => postMiniTiming('loader.stickers_error', {
    status: 'stickers',
    scriptSrc: s.src,
    stickersRuntime: STICKERS_RUNTIME
  });
  (document.head || document.documentElement).appendChild(s);
  postMiniTiming('loader.stickers_appended', {
    status: 'stickers',
    scriptSrc: s.src,
    stickersRuntime: STICKERS_RUNTIME
  });
}

function loadPhotoFlowAddon() {
  if (window[PHOTO_FLOW_LOADER_MARKER]) return loadStickerAddon();
  window[PHOTO_FLOW_LOADER_MARKER] = true;

  const s = document.createElement('script');
  s.src = '/public/app-photo-flow-pr95.js?v=pr96-2-compressed-final-photo-composer';
  s.async = false;
  s.dataset.adminkitRuntime = PHOTO_FLOW_RUNTIME;
  s.onload = () => {
    postMiniTiming('loader.photo_flow_loaded', {
      status: 'photo_flow',
      scriptSrc: s.src,
      photoFlowRuntime: PHOTO_FLOW_RUNTIME
    });
    loadStickerAddon();
  };
  s.onerror = () => {
    postMiniTiming('loader.photo_flow_error', {
      status: 'photo_flow',
      scriptSrc: s.src,
      photoFlowRuntime: PHOTO_FLOW_RUNTIME
    });
    loadStickerAddon();
  };
  (document.head || document.documentElement).appendChild(s);
  postMiniTiming('loader.photo_flow_appended', {
    status: 'photo_flow',
    scriptSrc: s.src,
    photoFlowRuntime: PHOTO_FLOW_RUNTIME
  });
}

function hasCommentLaunchIdentity(query) {
  const raw = String(query || '');
  if (!raw) return false;
  if (/(?:^|[?&#])(commentKey|handoff|startapp|start_param|WebAppStartParam|payload|channelId|channel_id|postId|post_id|messageId|message_id)=/i.test(raw)) return true;
  if (/(?:cp|ck)_-?\d{3,}_-?\d{1,}/i.test(raw)) return true;
  if (/-?\d{3,}:-?\d{1,}/.test(raw)) return true;
  return false;
}

function wantsGuardedSkeletonConsumer() {
  const query = String((location && location.search) || '');
  const hash = String((location && location.hash) || '');
  if (/(?:^|[?&])(adminkitSkeleton|commentSkeleton|skeletonConsumer)=0(?:&|$)/.test(query)) return false;
  if (/(?:^|[?&])(adminkitSkeleton|commentSkeleton|skeletonConsumer)=1(?:&|$)/.test(query)) return true;
  if (/(?:^|[?&])skeletonConsumer=pr67(?:&|$)/i.test(query)) return true;
  return hasCommentLaunchIdentity(query) || hasCommentLaunchIdentity(hash);
}

function skeletonConsumerConfig() {
  const query = String((location && location.search) || '');
  if (/(?:^|[?&])skeletonConsumer=pr67(?:&|$)/i.test(query)) {
    return { runtime: LEGACY_SKELETON_CONSUMER_PR67_RUNTIME, asset: LEGACY_SKELETON_CONSUMER_PR67_ASSET, marker: LEGACY_SKELETON_CONSUMER_PR67_MARKER, version: 'pr67' };
  }
  return { runtime: SKELETON_RUNTIME, asset: '/public/app-skeleton-consumer-pr84.js?', marker: SKELETON_MARKER, version: 'pr84' };
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
    window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_COUNT__ = Number(window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_COUNT__ || 0) + 1;
    window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_LAST__ = {
      at: Date.now(),
      unlockedCount: lockedCount
    };
  }, true);
}

function bootOnepass() {
  const guardedSkeleton = wantsGuardedSkeletonConsumer();
  const skeletonConfig = guardedSkeleton ? skeletonConsumerConfig() : null;

  if (!guardedSkeleton && window[ONEPASS_MARKER]) return;
  if (guardedSkeleton && skeletonConfig && window[skeletonConfig.marker]) return;

  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ENABLED__ = Boolean(guardedSkeleton);
  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ACTIVE_CONFIG__ = skeletonConfig || null;

  installComposerIntentUnlock();

  postMiniTiming('loader.boot', {
    status: guardedSkeleton ? 'skeleton' : 'onepass',
    skeletonConsumer: skeletonConfig && skeletonConfig.version
  });

  const script = document.createElement('script');
  script.src = (guardedSkeleton ? skeletonConfig.asset : '/public/app-onepass.js?') + ASSET_VERSION.replace(/^v/, 'v=');
  script.async = false;
  script.dataset.adminkitRuntime = guardedSkeleton ? skeletonConfig.runtime : RUNTIME;

  script.onload = () => {
    postMiniTiming('loader.script_loaded', {
      status: guardedSkeleton ? 'skeleton' : 'onepass',
      scriptSrc: script.src,
      skeletonConsumer: skeletonConfig && skeletonConfig.version
    });
    loadPhotoFlowAddon();
  };

  script.onerror = () => {
    postMiniTiming('loader.script_error', {
      status: guardedSkeleton ? 'skeleton' : 'onepass',
      scriptSrc: script.src,
      skeletonConsumer: skeletonConfig && skeletonConfig.version
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
    scriptSrc: script.src,
    skeletonConsumer: skeletonConfig && skeletonConfig.version
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootOnepass, { once: true });
} else {
  bootOnepass();
}
})();
