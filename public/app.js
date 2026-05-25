;(() => {
'use strict';
const RUNTIME = 'CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE';
const SKELETON_RUNTIME = 'CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED';
const COMPOSER_INTENT_RUNTIME = 'CC8.1.13-COMPOSER-INTENT-UNLOCK';
const PERFORMANCE_TRACE_RUNTIME = 'CC8.1.15-PATCH-COMPUTE-BREAKDOWN';
const LOADER_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE_LOADER__';
const ONEPASS_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE__';
const SKELETON_MARKER = '__ADMINKIT_CC8_1_9_COMMENT_SKELETON_CONSUMER_GUARDED__';
const COMPOSER_INTENT_MARKER = '__ADMINKIT_CC8_1_13_COMPOSER_INTENT_UNLOCK__';
const ASSET_VERSION = 'v7564-pr75';
const LOADER_STARTED_AT = Date.now();
if (window[LOADER_MARKER]) return;
window[LOADER_MARKER] = true;
window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;
window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_RUNTIME__ = SKELETON_RUNTIME;
window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_RUNTIME__ = COMPOSER_INTENT_RUNTIME;
window.__ADMINKIT_PERFORMANCE_TRACE_RUNTIME__ = PERFORMANCE_TRACE_RUNTIME;
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
      fetch('/api/debug/miniapp-timing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(beacon);
      return;
    }
    beacon();
  } catch (_) {}
}
function wantsGuardedSkeletonConsumer() {
  const query = String((location && location.search) || '');
  return /(?:^|[?&])(adminkitSkeleton|commentSkeleton|skeletonConsumer)=1(?:&|$)/.test(query);
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
    window.__ADMINKIT_COMPOSER_INTENT_UNLOCK_LAST__ = { at: Date.now(), unlockedCount: lockedCount };
  }, true);
}
function bootOnepass() {
  const guardedSkeleton = wantsGuardedSkeletonConsumer();
  if (!guardedSkeleton && window[ONEPASS_MARKER]) return;
  if (guardedSkeleton && window[SKELETON_MARKER]) return;
  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ENABLED__ = Boolean(guardedSkeleton);
  installComposerIntentUnlock();
  postMiniTiming('loader.boot', { status: guardedSkeleton ? 'skeleton' : 'onepass' });
  const script = document.createElement('script');
  script.src = (guardedSkeleton ? '/public/app-skeleton-consumer-pr67.js?' : '/public/app-onepass.js?') + ASSET_VERSION.replace(/^v/, 'v=');
  script.async = false;
  script.dataset.adminkitRuntime = guardedSkeleton ? SKELETON_RUNTIME : RUNTIME;
  script.onload = () => postMiniTiming('loader.script_loaded', { status: guardedSkeleton ? 'skeleton' : 'onepass', scriptSrc: script.src });
  script.onerror = () => {
    postMiniTiming('loader.script_error', { status: guardedSkeleton ? 'skeleton' : 'onepass', scriptSrc: script.src });
    const card = document.getElementById('postError');
    if (card) {
      card.textContent = 'Не удалось загрузить экран комментариев. Обновите страницу.';
      card.style.display = 'block';
    }
  };
  (document.head || document.documentElement).appendChild(script);
  postMiniTiming('loader.script_appended', { status: guardedSkeleton ? 'skeleton' : 'onepass', scriptSrc: script.src });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootOnepass, { once: true });
else bootOnepass();
})();