;(() => {
'use strict';

const RUNTIME = 'CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED';
const MARKER = '__ADMINKIT_CC8_1_9_COMMENT_SKELETON_CONSUMER_GUARDED__';
const LEGACY_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE__';
const LEGACY_SRC = '/public/app-onepass.js?v=7564';
if (window[MARKER]) return;
window[MARKER] = true;
window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_RUNTIME__ = RUNTIME;

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function byId(id) { return document.getElementById(id); }
function loadLegacy(reason) {
  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_FALLBACK_REASON__ = clean(reason);
  if (window[LEGACY_MARKER]) return;
  const script = document.createElement('script');
  script.src = LEGACY_SRC;
  script.async = false;
  script.dataset.adminkitRuntime = 'CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE';
  script.onerror = () => {
    const card = byId('postError');
    if (card) { card.textContent = 'Не удалось загрузить экран комментариев. Обновите страницу.'; card.style.display = 'block'; }
  };
  (document.head || document.documentElement).appendChild(script);
}
function getPossibleWebApps() {
  return [window.WebApp, window.Telegram && window.Telegram.WebApp, window.Max && window.Max.WebApp, window.MAX && window.MAX.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max && window.max.WebApp].filter(Boolean);
}
function addParam(params, key, value) {
  const text = clean(value);
  if (text && !params.has(key)) params.set(key, text);
}
function buildSkeletonUrl() {
  const params = new URLSearchParams(String(location.search || '').replace(/^\?/, ''));
  getPossibleWebApps().forEach((app) => {
    try {
      const unsafe = (app && app.initDataUnsafe) || {};
      addParam(params, 'commentKey', unsafe.commentKey);
      addParam(params, 'handoff', unsafe.start_param || unsafe.startapp || unsafe.WebAppStartParam || unsafe.payload || unsafe.startPayload || unsafe.start_payload);
      addParam(params, 'channelId', unsafe.channelId || unsafe.channel_id);
      addParam(params, 'postId', unsafe.postId || unsafe.post_id || unsafe.messageId || unsafe.message_id);
      addParam(params, 'title', unsafe.title || unsafe.postTitle);
    } catch (_) {}
  });
  const hasIdentity = ['commentKey', 'handoff', 'channelId', 'postId', 'title', 'raw', 'startapp', 'start_param', 'WebAppStartParam'].some((key) => clean(params.get(key)));
  if (!hasIdentity) return '';
  params.set('skeleton', '1');
  params.set('skeletonConsumer', 'pr67');
  params.set('skeletonRuntime', RUNTIME);
  params.set('appRuntime', 'CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE');
  params.set('t', String(Date.now()));
  return '/api/adminkit/comment-open-state?' + params.toString();
}
function contractAllowsSkeleton(info) {
  return Boolean(info && info.ok && info.commentOpenState && info.commentOpenState.legacyRuntimeStable === true && info.commentOpenState.skeletonOptInWorks === true && info.commentOpenState.hydrateUrlStripsSkeleton === true && info.guardrails && info.guardrails.defaultPayloadMustRemainLegacy === true && info.guardrails.skeletonMustStayOptIn === true && info.guardrails.hydrateUrlMustFetchFullLegacyPayload === true && info.guardrails.noUserUiChange === true);
}
function showSkeleton(data) {
  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ACTIVE__ = true;
  const meta = data && data.meta || {};
  const snapshot = meta.postSnapshot || {};
  const title = clean(meta.postTitle || snapshot.title || snapshot.text || data.post && (data.post.originalText || data.post.text) || 'Загрузка обсуждения…');
  const topbar = byId('miniAppTopbar');
  const postCard = byId('postCard');
  const postTitle = byId('postTitle');
  const commentsWrap = byId('commentsWrap');
  const composer = byId('composerCard');
  const empty = byId('emptyState');
  const count = byId('commentsCountPill');
  const err = byId('postError');
  const start = byId('miniAppStartCard');
  const label = document.querySelector('.discussion-label-wrap');
  if (start) start.classList.add('hidden');
  if (err) { err.textContent = ''; err.style.display = 'none'; }
  if (topbar) topbar.style.display = 'grid';
  if (postCard) postCard.style.display = 'block';
  if (postTitle) postTitle.textContent = title;
  if (commentsWrap) commentsWrap.style.display = 'block';
  if (composer) composer.style.display = 'block';
  if (label) label.style.display = 'flex';
  if (empty) { empty.textContent = 'Загружаем комментарии…'; empty.style.display = 'block'; }
  if (count) count.textContent = '0 комментариев';
}
async function prefetchHydrate(data) {
  const url = clean(data && data.hydrateUrl);
  if (!url) return null;
  const response = await fetch(url, { cache: 'no-store' });
  const full = await response.json().catch(() => ({}));
  if (!response.ok || full.ok === false) throw new Error(full.error || 'hydrate_failed');
  window.__ADMINKIT_PR67_PREFETCHED_OPEN_STATE__ = full;
  return full;
}
async function boot() {
  let contract = null;
  try {
    const response = await fetch('/debug/comment-ui/contract?t=' + Date.now(), { cache: 'no-store' });
    contract = await response.json().catch(() => null);
  } catch (_) {}
  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_CONTRACT__ = contract;
  if (!contractAllowsSkeleton(contract)) { loadLegacy('contract_guard_failed'); return; }
  const url = buildSkeletonUrl();
  if (!url) { loadLegacy('identity_guard_failed'); return; }
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const skeleton = await response.json().catch(() => ({}));
    if (!response.ok || skeleton.ok === false || skeleton.skeleton !== true || !skeleton.hydrateUrl) throw new Error(skeleton.error || 'skeleton_invalid');
    window.__ADMINKIT_PR67_INITIAL_SKELETON__ = skeleton;
    showSkeleton(skeleton);
    prefetchHydrate(skeleton).catch((error) => { window.__ADMINKIT_PR67_HYDRATE_ERROR__ = clean(error && error.message); });
    window.setTimeout(() => loadLegacy(''), 80);
  } catch (error) {
    window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ERROR__ = clean(error && error.message);
    loadLegacy('skeleton_fetch_failed');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();