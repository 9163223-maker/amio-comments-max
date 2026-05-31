;(() => {
'use strict';

const RUNTIME = 'CC8.1.9-COMMENT-SKELETON-CONSUMER-GUARDED';
const MARKER = '__ADMINKIT_CC8_1_9_COMMENT_SKELETON_CONSUMER_GUARDED__';
const LEGACY_MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE__';
const LEGACY_SRC = '/public/app-onepass.js?v=7564';
const GUARD_TIMEOUT_MS = 1200;
const SKELETON_TIMEOUT_MS = 1600;
const HYDRATE_TIMEOUT_MS = 2500;
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
function hashParamSource() {
  const raw = String(location.hash || '').replace(/^#/, '');
  const queryAt = raw.indexOf('?');
  return (queryAt >= 0 ? raw.slice(queryAt + 1) : raw).replace(/^\?/, '');
}
function initialSkeletonParams() {
  const params = new URLSearchParams(String(location.search || '').replace(/^\?/, ''));
  const hashParams = new URLSearchParams(hashParamSource());
  hashParams.forEach((value, key) => addParam(params, key, value));
  return params;
}
function buildSkeletonUrl() {
  const params = initialSkeletonParams();
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
function fetchJsonWithTimeout(url, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(clean(label) || 'fetch_timeout'));
    }, Math.max(250, Number(timeoutMs || 0) || 1000));
    fetch(url, { cache: 'no-store' }).then((response) => {
      return response.json().catch(() => ({})).then((data) => ({ response, data }));
    }).then(({ response, data }) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (!response.ok || data.ok === false) reject(new Error(data.error || ('http_' + response.status)));
      else resolve(data);
    }).catch((error) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      reject(error);
    });
  });
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
  const full = await fetchJsonWithTimeout(url, HYDRATE_TIMEOUT_MS, 'hydrate_timeout');
  window.__ADMINKIT_PR67_PREFETCHED_OPEN_STATE__ = full;
  return full;
}
async function boot() {
  let contract = null;
  try {
    contract = await fetchJsonWithTimeout('/debug/comment-ui/contract?t=' + Date.now(), GUARD_TIMEOUT_MS, 'contract_timeout');
  } catch (error) {
    window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ERROR__ = clean(error && error.message);
    loadLegacy('contract_timeout');
    return;
  }
  window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_CONTRACT__ = contract;
  if (!contractAllowsSkeleton(contract)) { loadLegacy('contract_guard_failed'); return; }
  const url = buildSkeletonUrl();
  if (!url) { loadLegacy('identity_guard_failed'); return; }
  try {
    const skeleton = await fetchJsonWithTimeout(url, SKELETON_TIMEOUT_MS, 'skeleton_timeout');
    if (skeleton.skeleton !== true || !skeleton.hydrateUrl) throw new Error(skeleton.error || 'skeleton_invalid');
    window.__ADMINKIT_PR67_INITIAL_SKELETON__ = skeleton;
    showSkeleton(skeleton);
    prefetchHydrate(skeleton).catch((error) => { window.__ADMINKIT_PR67_HYDRATE_ERROR__ = clean(error && error.message); });
    window.setTimeout(() => loadLegacy(''), 80);
  } catch (error) {
    window.__ADMINKIT_COMMENT_SKELETON_CONSUMER_ERROR__ = clean(error && error.message);
    loadLegacy(clean(error && error.message) === 'skeleton_timeout' ? 'skeleton_timeout' : 'skeleton_fetch_failed');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();
