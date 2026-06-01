;(() => {
  'use strict';

  const RUNTIME = 'CC8.3.48-PR97-COMMENTS-MOBILE-SCROLL-LOCK';
  const CACHE_TTL_MS = 60 * 60 * 1000;
  const FIRST_EMPTY_GRACE_MS = 15000;
  const MARKER = '__ADMINKIT_PR97_COMMENTS_MOBILE_UX_PREVIEW__';
  if (window[MARKER]) return;
  window[MARKER] = true;
  window.__ADMINKIT_COMMENTS_MOBILE_UX_RUNTIME__ = RUNTIME;

  const bootAt = Date.now();
  let lastNonEmptySnapshot = null;
  let userScrollUntil = 0;

  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const esc = (v) => String(v || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  const byId = (id) => document.getElementById(id);

  function trace(event, payload) {
    try {
      const body = JSON.stringify({ event, payload: payload || {}, runtimeVersion: RUNTIME });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/debug/comment-trace-event', new Blob([body], { type: 'application/json' }));
        return;
      }
      fetch('/api/debug/comment-trace-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch (_) {}
  }

  function keyFromUrl(input) {
    try {
      const url = new URL(typeof input === 'string' ? input : String((input && input.url) || ''), location.href);
      if (!url.pathname.includes('/api/adminkit/comment-open-state')) return '';
      return clean(url.searchParams.get('commentKey') || url.searchParams.get('key') || '');
    } catch (_) { return ''; }
  }
  const jsonCacheKey = (key) => 'adminkit.comments.json.' + key;
  const htmlCacheKey = (key) => 'adminkit.comments.html.' + key;
  function readJsonCache(key) {
    try {
      const raw = sessionStorage.getItem(jsonCacheKey(key));
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (!item || !item.at || Date.now() - Number(item.at) > CACHE_TTL_MS) return null;
      return item.data || null;
    } catch (_) { return null; }
  }
  function saveJsonCache(key, data) {
    try {
      if (!key || !data || !Array.isArray(data.comments) || !data.comments.length) return;
      sessionStorage.setItem(jsonCacheKey(key), JSON.stringify({ at: Date.now(), data }));
    } catch (_) {}
  }
  function currentCommentKey() {
    try {
      const state = window.__ADMINKIT_CC7_5_55_STATE__ || window.__ADMINKIT_CC7_5_53_STATE__ || window.__ADMINKIT_CC7_2_STATE__ || {};
      if (state.commentKey) return clean(state.commentKey);
    } catch (_) {}
    try { return clean(new URL(location.href).searchParams.get('commentKey') || ''); } catch (_) { return ''; }
  }
  function inCommentsMode() {
    try {
      const state = window.__ADMINKIT_CC7_5_55_STATE__ || window.__ADMINKIT_CC7_5_53_STATE__ || window.__ADMINKIT_CC7_2_STATE__ || {};
      if (state.launchMode === 'comments' || state.hasCommentIdentity || state.commentKey || state.handoff || state.channelId || state.postId) return true;
    } catch (_) {}
    try {
      const s = String(location.href || '');
      return /(?:commentKey|handoff|startapp|start_param|WebAppStartParam|payload|channelId|postId|messageId)=/i.test(s) || /(?:cp|ck)_-?\d{3,}_-?\d{1,}/i.test(s);
    } catch (_) { return false; }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function' && !window.__ADMINKIT_PR97_OPEN_STATE_FETCH_GUARD__) {
    window.__ADMINKIT_PR97_OPEN_STATE_FETCH_GUARD__ = true;
    window.fetch = function patchedFetch(input, init) {
      const key = keyFromUrl(input);
      return originalFetch.apply(this, arguments).then((response) => {
        if (!key || !response || typeof response.clone !== 'function') return response;
        response.clone().json().then((data) => {
          if (!data || data.ok === false) return;
          const list = Array.isArray(data.comments) ? data.comments : [];
          if (list.length) {
            saveJsonCache(clean((data.meta && data.meta.commentKey) || data.commentKey || key), data);
            return;
          }
          const cached = readJsonCache(key);
          if (!cached || !Array.isArray(cached.comments) || !cached.comments.length) return;
          trace('open_state_transient_empty_seen', { commentKey: key, cachedCount: cached.comments.length });
        }).catch(() => {});
        return response.clone().json().then((data) => {
          if (!data || data.ok === false) return response;
          const list = Array.isArray(data.comments) ? data.comments : [];
          if (list.length) return response;
          const cached = readJsonCache(key);
          if (!cached || !Array.isArray(cached.comments) || !cached.comments.length) return response;
          const patched = Object.assign({}, data, {
            comments: cached.comments,
            commentsCount: Math.max(Number(data.commentsCount || 0) || 0, cached.comments.length),
            clientPatchedTransientEmpty: true,
            clientPatchedBy: RUNTIME
          });
          trace('open_state_transient_empty_patched', { commentKey: key, cachedCount: cached.comments.length });
          return new Response(JSON.stringify(patched), { status: response.status, statusText: response.statusText, headers: response.headers });
        }).catch(() => response);
      });
    };
  }

  function getEls() {
    return {
      page: document.querySelector('.page'),
      commentsWrap: byId('commentsWrap'),
      commentsList: byId('commentsList'),
      emptyState: byId('emptyState'),
      composer: byId('composerCard'),
      composerReply: byId('composerReply'),
      attachmentPreview: byId('attachmentPreview'),
      attachmentInput: byId('attachmentInput'),
      commentInput: byId('commentInput'),
      count: byId('commentsCountPill')
    };
  }

  function viewportBottom() {
    try {
      const vv = window.visualViewport;
      if (vv) return Math.max(0, Number(vv.offsetTop || 0) + Number(vv.height || 0));
    } catch (_) {}
    return Math.max(0, Number(window.innerHeight || document.documentElement.clientHeight || 0));
  }
  function hostNearBottom(host) {
    if (!host) return true;
    return (host.scrollHeight - host.scrollTop - host.clientHeight) < 180;
  }
  function markUserScroll() { userScrollUntil = Date.now() + 900; }
  function bottomAlignShortList(commentsWrap, commentsList) {
    if (!commentsWrap || !commentsList) return;
    commentsList.style.paddingTop = '0px';
    requestAnimationFrame(() => {
      try {
        const free = Math.floor(commentsWrap.clientHeight - commentsList.scrollHeight - 4);
        commentsList.style.paddingTop = free > 0 ? free + 'px' : '0px';
      } catch (_) {}
    });
  }
  function measureComposer() {
    const { composer, page, commentsList, commentsWrap } = getEls();
    const h = Math.max(76, Math.ceil((composer && composer.getBoundingClientRect().height) || 0));
    document.documentElement.style.setProperty('--ak-composer-h', h + 'px');
    document.body.style.setProperty('--ak-composer-h', h + 'px');
    if (page) {
      page.style.paddingBottom = '0px';
      page.style.overflow = 'hidden';
    }
    if (commentsWrap) {
      const rect = commentsWrap.getBoundingClientRect();
      const bottom = viewportBottom();
      const available = Math.max(170, Math.floor(bottom - rect.top - h - 12));
      commentsWrap.style.height = available + 'px';
      commentsWrap.style.maxHeight = available + 'px';
      commentsWrap.style.overflowY = 'auto';
      commentsWrap.style.overscrollBehavior = 'contain';
      commentsWrap.style.webkitOverflowScrolling = 'touch';
      commentsWrap.style.scrollPaddingBottom = '18px';
      document.documentElement.style.setProperty('--ak-comments-wrap-h', available + 'px');
      document.body.style.setProperty('--ak-comments-wrap-h', available + 'px');
    }
    if (commentsList) commentsList.style.paddingBottom = '14px';
    bottomAlignShortList(commentsWrap, commentsList);
    return h;
  }
  function scrollToBottomSoon(force) {
    const run = () => {
      try {
        measureComposer();
        const { commentsWrap } = getEls();
        if (!commentsWrap) return;
        if (!force) {
          if (Date.now() < userScrollUntil) return;
          if (!hostNearBottom(commentsWrap)) return;
        }
        commentsWrap.scrollTop = Math.max(0, commentsWrap.scrollHeight - commentsWrap.clientHeight);
      } catch (_) {}
    };
    requestAnimationFrame(run);
    setTimeout(run, 80);
    setTimeout(run, 240);
  }

  function rememberNonEmptyHtml() {
    const key = currentCommentKey();
    const { commentsList, count } = getEls();
    if (!commentsList || !commentsList.children.length) return;
    lastNonEmptySnapshot = { key, at: Date.now(), html: commentsList.innerHTML, count: clean(count && count.textContent) };
  }
  function cacheCurrentHtml() {
    const key = currentCommentKey();
    const { commentsList, count } = getEls();
    if (!key || !commentsList || !commentsList.children.length) return;
    try {
      const item = { at: Date.now(), html: commentsList.innerHTML, count: clean(count && count.textContent) };
      lastNonEmptySnapshot = Object.assign({ key }, item);
      sessionStorage.setItem(htmlCacheKey(key), JSON.stringify(item));
    } catch (_) {}
  }
  function readHtmlCache() {
    const key = currentCommentKey();
    if (lastNonEmptySnapshot && (!key || lastNonEmptySnapshot.key === key) && Date.now() - Number(lastNonEmptySnapshot.at || 0) <= CACHE_TTL_MS) return lastNonEmptySnapshot;
    if (!key) return null;
    try {
      const raw = sessionStorage.getItem(htmlCacheKey(key));
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (!item || !item.at || Date.now() - Number(item.at) > CACHE_TTL_MS) return null;
      return item;
    } catch (_) { return null; }
  }
  function restoreCachedHtmlIfTransientEmpty() {
    const { commentsList, emptyState, count } = getEls();
    if (!commentsList || commentsList.children.length) return false;
    const cached = readHtmlCache();
    if (!cached || !cached.html) return false;
    commentsList.innerHTML = cached.html;
    if (emptyState) emptyState.style.display = 'none';
    if (count && cached.count) count.textContent = cached.count;
    document.body.classList.add('ak-comments-hydrated-from-cache');
    document.body.classList.remove('ak-comments-loading-not-empty');
    trace('comments_dom_transient_empty_restored', { commentKey: currentCommentKey(), count: cached.count || '' });
    enhanceImages();
    scrollToBottomSoon(true);
    return true;
  }
  function suppressEarlyEmpty(reason) {
    const { emptyState, count } = getEls();
    if (!emptyState) return false;
    const elapsed = Date.now() - bootAt;
    const shouldSuppress = inCommentsMode() && elapsed < FIRST_EMPTY_GRACE_MS;
    if (!shouldSuppress) return false;
    emptyState.textContent = 'Загружаем комментарии…';
    emptyState.style.display = 'block';
    if (count && /^0\s+комментар/i.test(clean(count.textContent))) count.textContent = 'Комментарии';
    document.body.classList.add('ak-comments-loading-not-empty');
    trace('comments_early_empty_suppressed', { reason: reason || '', elapsedMs: elapsed, commentKey: currentCommentKey() });
    return true;
  }
  function protectEmptyState() {
    const { commentsList, emptyState } = getEls();
    if (!commentsList || !emptyState) return;
    if (commentsList.children.length) {
      emptyState.style.display = 'none';
      document.body.classList.add('ak-comments-has-content');
      document.body.classList.remove('ak-comments-loading-not-empty');
      rememberNonEmptyHtml();
      cacheCurrentHtml();
      return;
    }
    if (restoreCachedHtmlIfTransientEmpty()) return;
    document.body.classList.remove('ak-comments-has-content');
    if (suppressEarlyEmpty('protect_empty_state')) return;
    if (!document.body.classList.contains('ak-comments-first-load-done')) {
      emptyState.textContent = 'Загружаем комментарии…';
      emptyState.style.display = 'block';
    }
    document.body.classList.remove('ak-comments-loading-not-empty');
  }

  const imgCache = new Map();
  function imgKey(img) {
    const row = img && img.closest && img.closest('.comment-row[data-comment-id]');
    const id = row && row.getAttribute('data-comment-id');
    const src = img && (img.currentSrc || img.src || img.getAttribute('src'));
    return clean(id || '') + '|' + clean(src || '');
  }
  function cacheImage(img) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const key = imgKey(img);
    if (!key || imgCache.has(key)) return;
    try {
      const canvas = document.createElement('canvas');
      const maxSide = 720;
      const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * ratio));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * ratio));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      if (dataUrl && dataUrl.length < 480000) imgCache.set(key, dataUrl);
    } catch (_) {}
  }
  function enhanceImages() {
    const { commentsList } = getEls();
    if (!commentsList) return;
    commentsList.querySelectorAll('img').forEach((img) => {
      try {
        img.loading = 'eager';
        img.decoding = 'async';
        img.setAttribute('fetchpriority', 'high');
        const key = imgKey(img);
        const cached = key && imgCache.get(key);
        if (cached && !String(img.src || '').startsWith('blob:')) img.src = cached;
        if (img.complete) cacheImage(img);
        else img.addEventListener('load', () => { cacheImage(img); scrollToBottomSoon(false); }, { once: true });
      } catch (_) {}
    });
  }

  function installImmediatePhotoPreview() {
    const { attachmentInput, attachmentPreview } = getEls();
    if (!attachmentInput || attachmentInput.__adminkitPreviewPatch) return;
    attachmentInput.__adminkitPreviewPatch = true;
    attachmentInput.addEventListener('change', () => {
      const file = attachmentInput.files && attachmentInput.files[0];
      if (!file || !/^image\//i.test(file.type || '')) return;
      setTimeout(() => {
        try {
          const state = window.__ADMINKIT_CC7_5_55_STATE__ || window.__ADMINKIT_CC7_5_53_STATE__ || window.__ADMINKIT_CC7_2_STATE__;
          if (!state || !state.pendingPhoto || state.pendingPhoto.previewUrl) return;
          const localUrl = URL.createObjectURL(file);
          state.pendingPhoto.previewUrl = localUrl;
          state.pendingPhoto.localPreviewUrl = localUrl;
          if (attachmentPreview) {
            attachmentPreview.classList.remove('hidden');
            attachmentPreview.innerHTML = '<div class="composer-photo-preview ak-fast-local-preview"><img src="' + esc(localUrl) + '" alt="' + esc(file.name || 'photo') + '" loading="eager" decoding="async"><button class="composer-photo-remove" type="button" aria-label="Убрать фото">×</button></div>';
            const btn = attachmentPreview.querySelector('button');
            if (btn) btn.addEventListener('click', () => { try { URL.revokeObjectURL(localUrl); } catch (_) {} }, { once: true });
          }
          measureComposer();
          scrollToBottomSoon(true);
          trace('fast_local_photo_preview_applied', { originalSize: file.size || 0, mimeType: file.type || '' });
        } catch (_) {}
      }, 0);
    }, false);
  }
  function installScrollHostGuards() {
    const { commentsWrap } = getEls();
    if (!commentsWrap || commentsWrap.__adminkitScrollHostGuard) return;
    commentsWrap.__adminkitScrollHostGuard = true;
    ['touchstart', 'touchmove', 'wheel'].forEach((eventName) => commentsWrap.addEventListener(eventName, markUserScroll, { passive: true }));
  }

  function install() {
    document.body.classList.add('ak-comments-mobile-ux-pr97');
    measureComposer();
    installScrollHostGuards();
    installImmediatePhotoPreview();
    protectEmptyState();
    enhanceImages();
    setTimeout(() => { document.body.classList.add('ak-comments-first-load-done'); protectEmptyState(); scrollToBottomSoon(true); }, 1200);
    setTimeout(() => { measureComposer(); protectEmptyState(); }, 3200);
    setTimeout(() => { measureComposer(); protectEmptyState(); }, 7600);
    setTimeout(() => { measureComposer(); protectEmptyState(); }, FIRST_EMPTY_GRACE_MS + 300);
    const { commentsList, composer, commentInput, composerReply, attachmentPreview } = getEls();
    if (commentsList && !commentsList.__adminkitUxObserver) {
      commentsList.__adminkitUxObserver = true;
      new MutationObserver(() => { protectEmptyState(); enhanceImages(); scrollToBottomSoon(false); }).observe(commentsList, { childList: true, subtree: true });
    }
    [composer, composerReply, attachmentPreview].forEach((node) => {
      if (node && window.ResizeObserver && !node.__adminkitResizeObserved) {
        node.__adminkitResizeObserved = true;
        new ResizeObserver(() => { measureComposer(); scrollToBottomSoon(false); }).observe(node);
      }
    });
    if (commentInput && !commentInput.__adminkitFocusPin) {
      commentInput.__adminkitFocusPin = true;
      ['focus', 'input'].forEach((eventName) => commentInput.addEventListener(eventName, () => scrollToBottomSoon(true)));
    }
    if (window.visualViewport && !window.__adminkitVisualViewportPin) {
      window.__adminkitVisualViewportPin = true;
      window.visualViewport.addEventListener('resize', () => { measureComposer(); scrollToBottomSoon(true); });
      window.visualViewport.addEventListener('scroll', () => { measureComposer(); });
    }
    window.addEventListener('orientationchange', () => setTimeout(() => { measureComposer(); scrollToBottomSoon(true); }, 220));
    trace('comments_mobile_ux_patch_installed', { runtimeVersion: RUNTIME, scrollHost: 'commentsWrap', firstEmptyGraceMs: FIRST_EMPTY_GRACE_MS });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  setTimeout(install, 600);
  setTimeout(install, 1600);
})();