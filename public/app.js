;(() => {
'use strict';
const RUNTIME = 'CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE';
const SKELETON_RUNTIME = 'CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED';
const LOADER_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE_LOADER__';
const ONEPASS_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE__';
const SKELETON_MARKER = '__ADMINKIT_CC8_1_9_COMMENT_SKELETON_CONSUMER_GUARDED__';
const ASSET_VERSION = 'v7564';
if (window[LOADER_MARKER]) return;
window[LOADER_MARKER] = true;
window.__ADMINKIT_PUBLIC_APP_RUNTIME__ = RUNTIME;
window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_RUNTIME__ = SKELETON_RUNTIME;
function wantsGuardedSkeletonConsumer() {
  const query = String((location && location.search) || '');
  return /(?:^|[?&])(adminkitSkeleton|commentSkeleton|skeletonConsumer)=1(?:&|$)/.test(query);
}
function bootOnepass() {
  const guardedSkeleton = wantsGuardedSkeletonConsumer();
  if (!guardedSkeleton && window[ONEPASS_MARKER]) return;
  if (guardedSkeleton && window[SKELETON_MARKER]) return;
  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ENABLED__ = Boolean(guardedSkeleton);
  const script = document.createElement('script');
  script.src = (guardedSkeleton ? '/public/app-skeleton-consumer-pr67.js?' : '/public/app-onepass.js?') + ASSET_VERSION.replace(/^v/, 'v=');
  script.async = false;
  script.dataset.adminkitRuntime = guardedSkeleton ? SKELETON_RUNTIME : RUNTIME;
  script.onerror = () => {
    const card = document.getElementById('postError');
    if (card) {
      card.textContent = 'Не удалось загрузить экран комментариев. Обновите страницу.';
      card.style.display = 'block';
    }
  };
  (document.head || document.documentElement).appendChild(script);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootOnepass, { once: true });
else bootOnepass();
})();