;(() => {
  'use strict';

  const RUNTIME = 'CC8.3.53-PHOTO-PREVIEW-CONTRACT-80KB';
  const MARKER = '__ADMINKIT_CC8_3_53_PHOTO_PREVIEW_CONTRACT_80KB__';
  if (window[MARKER]) return;
  window[MARKER] = true;

  // Server /api/comments currently accepts inline previews up to 80 KB.
  // Keep client below that limit with margin. The visual bubble size is CSS-only;
  // the stored source is intentionally a lightweight preview, not a full photo.
  const INLINE_TARGET_BYTES = 72 * 1024;
  const PREVIEW_MAX_SIDE_STEPS = [720, 640, 560, 480, 420, 360, 320];
  const QUALITY_STEPS = [0.62, 0.56, 0.5, 0.44, 0.38, 0.32];

  let pending = null;
  let sending = false;

  function byId(id) { return document.getElementById(id); }
  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function now() { return Date.now(); }
  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function state() {
    return window.__ADMINKIT_CC7_5_55_STATE__ ||
      window.__ADMINKIT_CC7_5_53_STATE__ ||
      window.__ADMINKIT_CC7_5_47_STATE__ ||
      window.__ADMINKIT_CC7_5_6_STATE__ ||
      window.__ADMINKIT_CC7_5_3_STATE__ ||
      window.__ADMINKIT_CC7_2_STATE__ || null;
  }
  function api() { return window.__ADMINKIT_COMMENTS_API__ || null; }
  function commentKey() { const s = state(); return clean(s && s.commentKey); }
  function replyToId() { const s = state(); return clean(s && s.replyToId); }
  function setReplyToId(value) { const s = state(); if (s) s.replyToId = clean(value); try { api() && api().clearReply && api().clearReply(); } catch (_) {} }
  function currentUser() {
    const s = state() || {};
    const possibleApps = [window.WebApp, window.Telegram && window.Telegram.WebApp, window.Max && window.Max.WebApp, window.MAX && window.MAX.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max && window.max.WebApp].filter(Boolean);
    let u = null;
    for (const app of possibleApps) {
      u = (app && app.initDataUnsafe && app.initDataUnsafe.user) || (app && app.user) || null;
      if (u) break;
    }
    return {
      id: clean((u && u.id) || s.currentUserId || 'guest'),
      name: clean((u && (u.first_name || u.username || u.last_name)) || s.currentUserName || byId('nameInput')?.value || 'Гость'),
      avatarUrl: clean((u && u.photo_url) || s.currentUserAvatarUrl || '')
    };
  }
  function trace(event, payload) {
    try {
      const body = JSON.stringify({
        event: clean(event),
        runtimeVersion: RUNTIME,
        payload: {
          ...(payload && typeof payload === 'object' ? payload : {}),
          runtimeVersion: RUNTIME,
          commentKey: commentKey(),
          at: now()
        }
      });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/debug/comment-trace-event', new Blob([body], { type: 'application/json' }));
      else fetch('/api/debug/comment-trace-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch (_) {}
  }
  function setStatus(message, isError) {
    const el = byId('commentInlineStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
    el.classList.toggle('error', Boolean(isError && message));
  }
  function host() { return byId('attachmentPreview') || byId('mediaPreviewStage'); }
  function setSendDisabled(disabled) {
    const btn = byId('sendBtn') || byId('mediaPreviewSend');
    if (btn) {
      btn.disabled = Boolean(disabled);
      btn.setAttribute('aria-busy', disabled ? 'true' : 'false');
    }
  }
  function approxBytesFromDataUrl(dataUrl) {
    const raw = String(dataUrl || '');
    const b64 = raw.split(',')[1] || '';
    return Math.floor((b64.length * 3) / 4);
  }
  function imageFromObjectUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image_decode_failed'));
      img.src = url;
    });
  }
  async function buildInlinePreviewDataUrl(file, objectUrl) {
    const startedAt = now();
    const img = await imageFromObjectUrl(objectUrl);
    const sourceW = Number(img.naturalWidth || img.width || 0) || 0;
    const sourceH = Number(img.naturalHeight || img.height || 0) || 0;
    if (!sourceW || !sourceH) throw new Error('image_size_unknown');
    let best = '';
    let bestMeta = null;
    for (const maxSide of PREVIEW_MAX_SIDE_STEPS) {
      const ratio = Math.max(sourceW, sourceH) > maxSide ? maxSide / Math.max(sourceW, sourceH) : 1;
      const w = Math.max(1, Math.round(sourceW * ratio));
      const h = Math.max(1, Math.round(sourceH * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('canvas_context_failed');
      ctx.drawImage(img, 0, 0, w, h);
      for (const quality of QUALITY_STEPS) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = approxBytesFromDataUrl(dataUrl);
        if (!best || bytes < approxBytesFromDataUrl(best)) {
          best = dataUrl;
          bestMeta = { width: w, height: h, quality, maxSide, bytes };
        }
        if (bytes > 0 && bytes <= INLINE_TARGET_BYTES) {
          trace('photo_preview_dataurl_ready', { durationMs: now() - startedAt, width: w, height: h, quality, maxSide, bytes, serverLimitBytes: 80 * 1024 });
          return { dataUrl, width: w, height: h, quality, maxSide, bytes };
        }
      }
    }
    if (!best) throw new Error('preview_dataurl_failed');
    const bytes = approxBytesFromDataUrl(best);
    if (bytes > 80 * 1024) {
      trace('photo_preview_dataurl_over_server_limit', { durationMs: now() - startedAt, ...(bestMeta || {}), serverLimitBytes: 80 * 1024 });
      throw new Error('preview_too_large_after_compression');
    }
    trace('photo_preview_dataurl_ready_over_target', { durationMs: now() - startedAt, ...(bestMeta || {}), serverLimitBytes: 80 * 1024 });
    return { dataUrl: best, ...(bestMeta || {}) };
  }
  function renderComposerPreview() {
    const h = host();
    if (!h || !pending) return;
    h.classList.remove('hidden');
    h.innerHTML = '<div class="composer-photo-preview" data-adminkit-preview-first="1">'
      + '<img src="' + escapeHtml(pending.objectUrl) + '" alt="photo">'
      + '<button class="composer-photo-remove" type="button" aria-label="Убрать фото">×</button>'
      + '</div>';
    const remove = h.querySelector('.composer-photo-remove');
    if (remove) remove.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); clearPending(true); }, { once: true });
  }
  function clearPending(revoke) {
    if (pending && revoke && pending.objectUrl) {
      try { URL.revokeObjectURL(pending.objectUrl); } catch (_) {}
    }
    pending = null;
    const h = host();
    if (h) { h.innerHTML = ''; h.classList.add('hidden'); }
    setSendDisabled(false);
  }
  function optimisticAttachment(source) {
    return {
      id: source.clientCommentId + '_photo',
      type: 'image',
      kind: 'image',
      name: source.fileName || 'photo.jpg',
      fileName: source.fileName || 'photo.jpg',
      mimeType: 'image/jpeg',
      mime: 'image/jpeg',
      thumbDataUrl: source.objectUrl,
      previewDataUrl: source.objectUrl,
      previewOnly: true,
      inlineOnly: true,
      localOnly: true
    };
  }
  function serverAttachment(source, preview) {
    const dataUrl = clean(preview && preview.dataUrl);
    return {
      id: source.clientCommentId + '_photo',
      type: 'image',
      kind: 'image',
      name: source.fileName || 'photo.jpg',
      fileName: source.fileName || 'photo.jpg',
      mimeType: 'image/jpeg',
      mime: 'image/jpeg',
      size: Number(preview && preview.bytes || 0) || 0,
      width: Number(preview && preview.width || 0) || 0,
      height: Number(preview && preview.height || 0) || 0,
      thumbDataUrl: dataUrl,
      previewDataUrl: dataUrl,
      dataUrl: dataUrl,
      previewOnly: true,
      inlineOnly: true,
      localOnly: false,
      storage: 'inline-preview-80kb-contract'
    };
  }
  function addOrReplaceStateComment(comment, replaceId) {
    const s = state();
    if (!s || !Array.isArray(s.comments)) return;
    const rid = clean(replaceId || comment.clientCommentId || comment.id);
    let replaced = false;
    s.comments = s.comments.map((item) => {
      if (item && (clean(item.id) === rid || clean(item.clientCommentId) === rid)) { replaced = true; return comment; }
      return item;
    });
    if (!replaced) s.comments = s.comments.concat([comment]);
    try { api() && api().render && api().render(); } catch (_) {}
  }
  function optimisticComment(caption, source) {
    const u = currentUser();
    const id = source.clientCommentId;
    const comment = {
      id,
      clientCommentId: id,
      userId: u.id,
      userName: u.name,
      avatarUrl: u.avatarUrl,
      own: true,
      text: clean(caption),
      createdAt: Date.now(),
      sendStatus: 'sending',
      attachments: [optimisticAttachment(source)],
      replyToId: replyToId()
    };
    addOrReplaceStateComment(comment, id);
    trace('photo_optimistic_inserted_immediate', { clientCommentId: id, status: 'optimistic_inserted_immediate', hasObjectUrl: Boolean(source.objectUrl) });
    return comment;
  }
  async function createServerComment(source, caption) {
    const preview = await source.previewPromise;
    const attachment = serverAttachment(source, preview);
    const body = {
      commentKey: commentKey(),
      userId: currentUser().id,
      userName: currentUser().name,
      avatarUrl: currentUser().avatarUrl,
      text: clean(caption),
      replyToId: source.replyToId,
      clientCommentId: source.clientCommentId,
      attachments: [attachment]
    };
    const startedAt = now();
    trace('photo_comment_create_preview_started', { clientCommentId: source.clientCommentId, bytes: attachment.size, status: 'create_preview_started', serverLimitBytes: 80 * 1024 });
    const response = await fetch('/api/comments', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-adminkit-photo-route': 'cc8353-preview-80kb-contract' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false || !data.comment) {
      throw new Error(clean(data.userMessage || data.message || data.error) || 'Не удалось опубликовать фото-комментарий.');
    }
    trace('photo_comment_create_preview_ok', { clientCommentId: source.clientCommentId, serverCommentId: clean(data.comment && data.comment.id), durationMs: now() - startedAt, attachmentCount: Array.isArray(data.comment.attachments) ? data.comment.attachments.length : 0, status: 'create_preview_ok', bytes: attachment.size });
    return data.comment;
  }
  function markError(source, message) {
    const s = state();
    if (!s || !Array.isArray(s.comments)) return;
    const id = clean(source && source.clientCommentId);
    s.comments = s.comments.map((item) => item && (clean(item.id) === id || clean(item.clientCommentId) === id)
      ? { ...item, sendStatus: 'error', error: clean(message) }
      : item);
    try { api() && api().render && api().render(); } catch (_) {}
  }
  async function sendPending(event) {
    if (!pending || sending) return;
    if (event) { event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) event.stopImmediatePropagation(); }
    if (!commentKey()) { setStatus('Не удалось определить обсуждение. Обновите экран.', true); return; }
    sending = true;
    setSendDisabled(true);
    const source = pending;
    const caption = clean((byId('commentInput') && byId('commentInput').value) || (byId('mediaPreviewCaption') && byId('mediaPreviewCaption').value));
    source.replyToId = replyToId();
    source.sentAt = now();
    optimisticComment(caption, source);
    clearPending(false);
    if (byId('commentInput')) byId('commentInput').value = '';
    setStatus('', false);
    try {
      const serverComment = await createServerComment(source, caption);
      addOrReplaceStateComment(serverComment, source.clientCommentId);
      setReplyToId('');
      try { if (source.objectUrl) URL.revokeObjectURL(source.objectUrl); } catch (_) {}
      trace('photo_preview_first_done', { clientCommentId: source.clientCommentId, durationMs: now() - source.sentAt, status: 'ok' });
    } catch (error) {
      const message = clean(error && error.message) || 'Не удалось опубликовать фото-комментарий.';
      markError(source, message);
      setStatus(message, true);
      trace('photo_preview_first_failed', { clientCommentId: source.clientCommentId, error: message, durationMs: now() - source.sentAt, status: 'failed' });
    } finally {
      sending = false;
      setSendDisabled(false);
    }
  }
  function handleFile(event) {
    const input = event && event.target;
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\//i.test(clean(file.type))) {
      setStatus('Пока в комментариях можно прикреплять только фото. Видео и файлы сейчас не поддерживаются.', true);
      if (input) input.value = '';
      return;
    }
    if (event) { event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) event.stopImmediatePropagation(); }
    clearPending(true);
    const objectUrl = URL.createObjectURL(file);
    const clientCommentId = 'client_photo_' + now() + '_' + Math.random().toString(36).slice(2, 8);
    const source = {
      file,
      objectUrl,
      clientCommentId,
      fileName: clean((file.name || 'photo').replace(/\.[^/.]+$/, '') + '.jpg'),
      selectedAt: now(),
      previewPromise: null,
      replyToId: ''
    };
    source.previewPromise = buildInlinePreviewDataUrl(file, objectUrl);
    source.previewPromise.catch((error) => trace('photo_preview_dataurl_failed', { clientCommentId, error: clean(error && error.message), status: 'preview_failed' }));
    pending = source;
    renderComposerPreview();
    setStatus('', false);
    trace('photo_selected_preview_first', { clientCommentId, fileName: clean(file.name), mimeType: clean(file.type), originalSize: Number(file.size || 0) || 0, status: 'selected_preview_first' });
    if (input) input.value = '';
  }
  function bind() {
    const input = byId('attachmentInput');
    const attach = byId('attachBtn');
    const send = byId('sendBtn');
    const modalSend = byId('mediaPreviewSend');
    if (attach && input) attach.addEventListener('click', () => input.click(), true);
    if (input) input.addEventListener('change', handleFile, true);
    if (send) send.addEventListener('click', (event) => { if (pending) sendPending(event); }, true);
    if (modalSend) modalSend.addEventListener('click', (event) => { if (pending) sendPending(event); }, true);
    const commentInput = byId('commentInput');
    if (commentInput) commentInput.addEventListener('keydown', (event) => {
      if (pending && event.key === 'Enter' && !event.shiftKey) sendPending(event);
    }, true);
    trace('photo_flow_preview_contract_installed', { status: 'installed', targetBytes: INLINE_TARGET_BYTES, serverLimitBytes: 80 * 1024 });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();