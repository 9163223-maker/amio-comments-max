;(() => {
  'use strict';
  const RUNTIME = 'CC8.2.4-ADMINKIT-COMPRESSED-FINAL-PHOTO-COMPOSER';
  const MARKER = '__ADMINKIT_PR95_PHOTO_FLOW_EXPLICIT_UPLOAD__';
  if (window[MARKER]) return;
  window[MARKER] = true;

  function byId(id) { return document.getElementById(id); }
  function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  function now() { return Date.now(); }
  function duration(startedAt) { return Math.max(0, now() - (Number(startedAt || 0) || now())); }
  function escapeHtml(v) {
    return String(v || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function escapeSelectorId(v) {
    const raw = String(v || '');
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(raw);
    return raw.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
  function state() {
    return window.__ADMINKIT_CC7_5_55_STATE__ || window.__ADMINKIT_CC7_5_53_STATE__ || window.__ADMINKIT_CC7_5_47_STATE__ || window.__ADMINKIT_CC7_5_6_STATE__ || window.__ADMINKIT_CC7_5_3_STATE__ || window.__ADMINKIT_CC7_2_STATE__ || null;
  }
  function safeStateField(name, fallback) {
    const s = state();
    return s && s[name] !== undefined ? s[name] : fallback;
  }
  function getPossibleWebApps() {
    return [window.WebApp, window.Telegram && window.Telegram.WebApp, window.Max && window.Max.WebApp, window.MAX && window.MAX.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max && window.max.WebApp].filter(Boolean);
  }
  function bridgeUser() {
    for (const app of getPossibleWebApps()) {
      const user = (app && app.initDataUnsafe && app.initDataUnsafe.user) || (app && app.user);
      if (user) return user;
    }
    return null;
  }
  function userId() { const u = bridgeUser(); return clean((u && u.id) || safeStateField('currentUserId', '') || 'guest'); }
  function userName() {
    const u = bridgeUser();
    return clean((u && (u.first_name || u.username || u.last_name)) || safeStateField('currentUserName', '') || byId('nameInput')?.value || 'Гость');
  }
  function avatarUrl() { const u = bridgeUser(); return clean((u && u.photo_url) || safeStateField('currentUserAvatarUrl', '') || ''); }
  function commentKey() { return clean(safeStateField('commentKey', '')); }
  function replyToId() { return clean(safeStateField('replyToId', '')); }
  function setReplyToId(value) { const s = state(); if (s) s.replyToId = clean(value); }
  function setStatus(message, isError) {
    const el = byId('commentInlineStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
    el.classList.toggle('error', Boolean(isError && message));
  }
  function makeTiming(file) {
    const id = 'pt_' + now() + '_' + Math.random().toString(36).slice(2, 7);
    return {
      id,
      fileName: clean(file && file.name),
      originalSize: Number(file && file.size || 0) || 0,
      mimeType: clean(file && file.type),
      startedAt: now(),
      selectedAt: now(),
      previewAt: 0,
      compressStartedAt: 0,
      compressEndedAt: 0,
      sendClickedAt: 0,
      uploadStartedAt: 0,
      uploadEndedAt: 0,
      createStartedAt: 0,
      createEndedAt: 0,
      renderStartedAt: 0,
      renderEndedAt: 0,
      totalEndedAt: 0,
      compressedSize: 0,
      uploadSize: 0,
      width: 0,
      height: 0,
      quality: 0,
      maxSide: 0,
      clientUploadId: '',
      uploadId: '',
      serverCommentId: '',
      serverUploadReceivedAt: '',
      serverParsedAt: '',
      serverSavedAt: '',
      serverTotalMs: 0,
      status: 'started',
      error: ''
    };
  }
  function timingPayload(timing, extra) {
    const t = timing || flow.timing || {};
    const compressMs = t.compressEndedAt && t.compressStartedAt ? t.compressEndedAt - t.compressStartedAt : 0;
    const uploadMs = t.uploadEndedAt && t.uploadStartedAt ? t.uploadEndedAt - t.uploadStartedAt : 0;
    const createMs = t.createEndedAt && t.createStartedAt ? t.createEndedAt - t.createStartedAt : 0;
    const renderMs = t.renderEndedAt && t.renderStartedAt ? t.renderEndedAt - t.renderStartedAt : 0;
    const totalMs = (t.totalEndedAt || now()) - (t.startedAt || now());
    const previewMs = t.previewAt && t.selectedAt ? t.previewAt - t.selectedAt : 0;
    return {
      timingId: clean(t.id),
      status: clean((extra && extra.status) || t.status || ''),
      durationMs: Math.max(0, Number(extra && extra.durationMs !== undefined && extra.durationMs !== null ? extra.durationMs : (totalMs || 0)) || 0),
      originalSize: Number(t.originalSize || 0) || 0,
      compressedSize: Number(t.compressedSize || 0) || 0,
      uploadSize: Number(t.uploadSize || t.compressedSize || 0) || 0,
      width: Number(t.width || 0) || 0,
      height: Number(t.height || 0) || 0,
      quality: Number(t.quality || 0) || 0,
      maxSide: Number(t.maxSide || 0) || 0,
      fileName: clean(t.fileName),
      mimeType: clean(t.mimeType),
      clientUploadId: clean(t.clientUploadId),
      uploadId: clean(t.uploadId),
      serverCommentId: clean(t.serverCommentId),
      serverUploadReceivedAt: clean(t.serverUploadReceivedAt),
      serverParsedAt: clean(t.serverParsedAt),
      serverSavedAt: clean(t.serverSavedAt),
      serverTotalMs: Number(t.serverTotalMs || 0) || 0,
      previewMs,
      compressMs,
      uploadMs,
      createMs,
      renderMs,
      totalMs,
      ...(extra || {})
    };
  }
  function timingStatus(timing, status) {
    const p = timingPayload(timing, { status });
    return 'preview=' + p.previewMs + 'ms compress=' + p.compressMs + 'ms upload=' + p.uploadMs + 'ms create=' + p.createMs + 'ms render=' + p.renderMs + 'ms total=' + p.totalMs + 'ms status=' + clean(status || p.status);
  }
  function log(event, payload) {
    const safe = payload && typeof payload === 'object' ? payload : {};
    const body = {
      event: clean(event),
      runtimeVersion: RUNTIME,
      payload: {
        ...safe,
        runtimeVersion: RUNTIME,
        commentKey: clean(safe.commentKey || commentKey()),
        at: now(),
        hasDataUrl: false,
        hasRawBase64: false
      }
    };
    delete body.payload.dataUrl;
    delete body.payload.thumbDataUrl;
    delete body.payload.previewDataUrl;
    delete body.payload.base64;
    try {
      const json = JSON.stringify(body);
      if (navigator.sendBeacon) navigator.sendBeacon('/api/debug/comment-trace-event', new Blob([json], { type: 'application/json' }));
      else fetch('/api/debug/comment-trace-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true });
    } catch (_) {}
  }
  function loadImageFromObjectUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image_decode_failed'));
      img.src = url;
    });
  }
  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('canvas_blob_failed')), mimeType, quality);
        return;
      }
      try {
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const parts = String(dataUrl || '').split(',');
        const binary = atob(parts[1] || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: mimeType }));
      } catch (error) { reject(error); }
    });
  }
  async function getDrawableImage(file) {
    if (window.createImageBitmap) {
      try {
        const bitmap = await createImageBitmap(file);
        if (bitmap && bitmap.width && bitmap.height) return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => { try { bitmap.close && bitmap.close(); } catch (_) {} } };
      } catch (_) {}
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImageFromObjectUrl(objectUrl);
      return { source: img, width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0, close: () => { try { URL.revokeObjectURL(objectUrl); } catch (_) {} } };
    } catch (error) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      throw error;
    }
  }
  async function compressImage(file) {
    const drawable = await getDrawableImage(file);
    const width = Number(drawable.width || 0) || 0;
    const height = Number(drawable.height || 0) || 0;
    if (!width || !height) throw new Error('image_size_unknown');
    const maxSideSteps = [1280, 960, 720, 640];
    const qualitySteps = [0.76, 0.68, 0.6, 0.54];
    const hardMax = 1024 * 1024;
    let best = null;
    try {
      for (const maxSide of maxSideSteps) {
        const ratio = Math.max(width, height) > maxSide ? maxSide / Math.max(width, height) : 1;
        const w = Math.max(1, Math.round(width * ratio));
        const h = Math.max(1, Math.round(height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('canvas_context_failed');
        ctx.drawImage(drawable.source, 0, 0, w, h);
        for (const quality of qualitySteps) {
          const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
          const size = Number(blob && blob.size || 0) || 0;
          const fileName = (file.name || 'photo').replace(/\.[^/.]+$/, '') + '.jpg';
          const packed = { blob, mimeType: 'image/jpeg', fileName, size, width: w, height: h, quality, maxSide, compressed: true };
          best = packed;
          if (size > 0 && size <= hardMax) return packed;
        }
      }
      if (best) return best;
      throw new Error('compress_failed');
    } finally {
      try { drawable.close && drawable.close(); } catch (_) {}
    }
  }
  function ensureInlinePreviewStyles() {
    if (byId('adminkitCompressedPhotoComposerStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminkitCompressedPhotoComposerStyles';
    style.textContent = '.composer-photo-preview{display:flex;align-items:center;gap:10px;margin:8px 0;padding:8px;border:1px solid rgba(148,163,184,.35);border-radius:14px;background:rgba(15,23,42,.04)}.composer-photo-preview img{width:72px;height:72px;object-fit:cover;border-radius:12px;display:block}.composer-photo-preview-meta{min-width:0;flex:1;font-size:12px;line-height:1.35;color:#64748b}.composer-photo-preview-name{font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.composer-photo-remove{border:0;border-radius:999px;width:32px;height:32px;font-size:22px;line-height:1;background:#e2e8f0;color:#0f172a}.composer-photo-remove:disabled{opacity:.55}.composer-photo-preview.is-busy{opacity:.7}';
    document.head && document.head.appendChild(style);
  }
  function inlinePreviewHost() { return byId('attachmentPreview') || byId('mediaPreviewStage'); }
  function setComposerBusy(isBusy) {
    const sendBtn = byId('sendBtn') || byId('mediaPreviewSend');
    if (sendBtn) {
      sendBtn.disabled = Boolean(isBusy);
      sendBtn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }
  }
  function closePreview(clearFile, options) {
    const allowWhileUploading = Boolean(options && options.allowWhileUploading);
    if (flow.uploading && !allowWhileUploading) {
      previewStatus('Дождитесь отправки текущего фото.', true);
      setStatus('Дождитесь отправки текущего фото.', true);
      log('photo_close_blocked_while_uploading', timingPayload(flow.timing, { selectionToken: flow.selectionToken, status: 'close_blocked' }));
      return false;
    }
    const modal = byId('mediaPreviewModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('media-preview-open');
    const status = byId('mediaPreviewStatus');
    if (status) { status.textContent = ''; status.classList.add('hidden'); status.classList.remove('error'); }
    const stage = inlinePreviewHost();
    if (stage) { stage.innerHTML = ''; stage.classList.add('hidden'); }
    const caption = byId('mediaPreviewCaption');
    if (caption) caption.value = '';
    if (clearFile && flow.fileInput) flow.fileInput.value = '';
    if (flow.previewUrl) try { URL.revokeObjectURL(flow.previewUrl); } catch (_) {}
    flow.packed = null;
    flow.packedToken = 0;
    flow.previewUrl = '';
    flow.compressing = false;
    setComposerBusy(false);
    return true;
  }
  function previewStatus(message, isError) {
    const el = byId('mediaPreviewStatus') || byId('commentInlineStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
    el.classList.toggle('error', Boolean(isError && message));
  }
  function renderInlinePreview(packed, previewUrl) {
    ensureInlinePreviewStyles();
    const host = inlinePreviewHost();
    if (host) {
      host.classList.remove('hidden');
      host.innerHTML = '<div class="composer-photo-preview' + (flow.compressing ? ' is-busy' : '') + '"><img src="' + escapeHtml(previewUrl) + '" alt="photo"><div class="composer-photo-preview-meta"><div class="composer-photo-preview-name">' + escapeHtml(packed.fileName || 'photo.jpg') + '</div><div>' + escapeHtml(Math.round((Number(packed.size || 0) || 0) / 1024) + ' KB · final compressed image') + '</div></div><button class="composer-photo-remove" type="button" aria-label="Убрать фото">×</button></div>';
      const removeBtn = host.querySelector('.composer-photo-remove');
      if (removeBtn) removeBtn.disabled = Boolean(flow.uploading);
    }
    const modal = byId('mediaPreviewModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('media-preview-open');
    if (flow.timing) {
      flow.timing.previewAt = now();
      flow.timing.status = 'inline_preview_opened';
    }
    previewStatus('', false);
    log('photo_inline_preview_opened', timingPayload(flow.timing, { fileName: clean(packed && packed.fileName), compressedSize: Number(packed && packed.size || 0) || 0, status: 'inline_preview_opened', durationMs: flow.timing ? duration(flow.timing.selectedAt) : 0 }));
  }
  function renderPreview(file, previewUrl) {
    renderInlinePreview({ fileName: clean(file && file.name), size: Number(file && file.size || 0) || 0 }, previewUrl);
  }
  async function uploadPacked(packed) {
    const timing = flow.timing;
    const clientUploadId = 'pr96_2_' + now() + '_' + Math.random().toString(36).slice(2, 8);
    if (timing) {
      timing.uploadStartedAt = now();
      timing.clientUploadId = clientUploadId;
      timing.status = 'upload_started';
      timing.uploadSize = Number(packed.size || 0) || 0;
    }
    log('photo_upload_started', timingPayload(timing, { clientUploadId, fileName: packed.fileName, mimeType: packed.mimeType, uploadSize: packed.size, width: packed.width, height: packed.height, quality: packed.quality, maxSide: packed.maxSide, status: 'upload_started', durationMs: 0 }));
    const form = new FormData();
    form.append('commentKey', commentKey());
    form.append('clientUploadId', clientUploadId);
    form.append('type', 'image');
    form.append('fileName', packed.fileName || 'photo.jpg');
    form.append('mimeType', packed.mimeType || 'image/jpeg');
    form.append('size', String(Number(packed.size || 0) || 0));
    form.append('photo', packed.blob, packed.fileName || 'photo.jpg');
    let response;
    let data;
    try {
      response = await fetch('/api/comments/attachments/upload', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'x-adminkit-photo-route': 'pr96-2-compressed-final-formdata' },
        body: form
      });
      data = await response.json().catch(() => ({}));
    } catch (error) {
      if (timing) {
        timing.uploadEndedAt = now();
        timing.status = 'upload_network_failed';
        timing.error = clean(error && error.message) || 'network_failed';
      }
      log('photo_upload_network_failed', timingPayload(timing, { clientUploadId, status: 'upload_network_failed', error: clean(error && error.message) || 'network_failed', durationMs: timing && timing.uploadStartedAt ? timing.uploadEndedAt - timing.uploadStartedAt : 0 }));
      const err = new Error('Не удалось загрузить фото. Проверьте соединение и попробуйте ещё раз.');
      err.cause = error;
      throw err;
    }
    if (timing) timing.uploadEndedAt = now();
    if (!response.ok || data.ok === false || !data.attachment) {
      if (timing) {
        timing.status = 'upload_failed';
        timing.error = clean(data.error || data.message || 'photo_upload_failed');
      }
      log('photo_upload_failed', timingPayload(timing, { clientUploadId, status: 'upload_failed', durationMs: timing && timing.uploadStartedAt ? timing.uploadEndedAt - timing.uploadStartedAt : 0, error: clean(data.error || data.message || 'photo_upload_failed') }));
      const err = new Error(clean(data.userMessage || data.message || data.error || 'Не удалось загрузить фото. Попробуйте ещё раз.'));
      err.status = response.status || 400;
      throw err;
    }
    const attachment = { ...(data.attachment || {}) };
    delete attachment.dataUrl;
    delete attachment.thumbDataUrl;
    delete attachment.previewDataUrl;
    delete attachment.base64;
    attachment.type = 'image';
    attachment.mimeType = clean(attachment.mimeType || attachment.mime || packed.mimeType || 'image/jpeg');
    attachment.fileName = clean(attachment.fileName || attachment.name || packed.fileName || 'photo.jpg');
    attachment.name = clean(attachment.name || attachment.fileName);
    attachment.clientUploadId = clean(attachment.clientUploadId || clientUploadId);
    attachment.uploadId = clean(attachment.uploadId || attachment.id || clientUploadId);
    attachment.localOnly = false;
    attachment.inlineOnly = false;
    attachment.previewOnly = false;
    if (timing) {
      timing.uploadId = attachment.uploadId;
      timing.status = 'upload_ok';
    }
    const diag = data.diagnostics || {};
    if (timing) {
      timing.serverUploadReceivedAt = clean(diag.serverUploadReceivedAt);
      timing.serverParsedAt = clean(diag.serverParsedAt);
      timing.serverSavedAt = clean(diag.serverSavedAt);
      timing.serverTotalMs = Number(diag.serverTotalMs || 0) || 0;
    }
    log('photo_upload_ok', timingPayload(timing, { clientUploadId, uploadId: attachment.uploadId, fileName: attachment.fileName, mimeType: attachment.mimeType, uploadSize: attachment.size || packed.size, hasUrl: Boolean(attachment.url), hasPreviewUrl: Boolean(attachment.previewUrl), serverUploadReceivedAt: clean(diag.serverUploadReceivedAt), serverParsedAt: clean(diag.serverParsedAt), serverSavedAt: clean(diag.serverSavedAt), serverTotalMs: Number(diag.serverTotalMs || 0) || 0, status: 'upload_ok', durationMs: timing && timing.uploadStartedAt ? timing.uploadEndedAt - timing.uploadStartedAt : 0 }));
    return attachment;
  }
  function apiRender() {
    const api = window.__ADMINKIT_COMMENTS_API__;
    if (api && typeof api.render === 'function') { try { api.render(); return true; } catch (_) {} }
    return false;
  }
  function apiRefresh() {
    const api = window.__ADMINKIT_COMMENTS_API__;
    if (api && typeof api.refresh === 'function') { try { api.refresh(); return true; } catch (_) {} }
    return false;
  }
  function scrollToBottom() {
    const wrap = byId('commentsWrap') || byId('commentsList');
    if (!wrap) return;
    try { wrap.scrollTop = wrap.scrollHeight; } catch (_) {}
  }
  function photoSrc(attachment) {
    return clean(attachment && (attachment.previewUrl || attachment.url || attachment.posterUrl || ''));
  }
  function renderPhotoRowDom(comment, replaceCommentId) {
    const list = byId('commentsList');
    if (!list || !comment || !comment.id) return;
    const currentId = String(comment.id);
    const replaceId = clean(replaceCommentId);
    let row = list.querySelector('[data-comment-id="' + escapeSelectorId(currentId) + '"]');
    if (!row && replaceId && replaceId !== currentId) row = list.querySelector('[data-comment-id="' + escapeSelectorId(replaceId) + '"]');
    if (row && replaceId && replaceId !== currentId) {
      const duplicate = list.querySelector('[data-comment-id="' + escapeSelectorId(currentId) + '"]');
      if (duplicate && duplicate !== row) duplicate.remove();
    }
    const firstAttachment = Array.isArray(comment.attachments) ? comment.attachments[0] : null;
    const src = photoSrc(firstAttachment);
    const time = new Date(comment.createdAt || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const statusClass = comment.sendStatus === 'error' ? ' is-error' : (comment.sendStatus === 'sending' ? ' is-sending' : '');
    const html = '<div class="comment-row own pr95-photo-row' + statusClass + '" data-comment-id="' + escapeHtml(currentId) + '" data-pr95-photo-row="1">'
      + '<div class="comment-bubble photo-bubble">'
      + (src ? '<div class="comment-attachment comment-attachment-image"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(firstAttachment && (firstAttachment.fileName || firstAttachment.name) || 'photo') + '" loading="lazy"></div>' : '<div class="comment-attachment comment-attachment-missing">Фото недоступно</div>')
      + (clean(comment.text) ? '<div class="comment-text">' + escapeHtml(comment.text) + '</div>' : '')
      + '<div class="comment-time">' + escapeHtml(time) + (comment.sendStatus === 'error' ? ' · ошибка' : (comment.sendStatus === 'sending' ? ' · отправка' : '')) + '</div>'
      + '</div></div>';
    if (!row) {
      const box = document.createElement('div');
      box.innerHTML = html;
      row = box.firstElementChild;
      list.appendChild(row);
    } else {
      row.outerHTML = html;
    }
    scrollToBottom();
  }
  function renderClientComment(comment, replaceCommentId) {
    if (!comment) return;
    if (!apiRender()) renderPhotoRowDom(comment, replaceCommentId);
  }
  function updateStateComment(clientCommentId, updater) {
    const s = state();
    if (!s || !Array.isArray(s.comments)) return null;
    let updated = null;
    s.comments = s.comments.map((item) => {
      if (!item || (item.clientCommentId !== clientCommentId && item.id !== clientCommentId)) return item;
      updated = updater(item);
      return updated;
    });
    return updated;
  }
  function markOptimisticError(clientCommentId, message) {
    const updated = updateStateComment(clientCommentId, (item) => ({ ...item, sendStatus: 'error', error: clean(message || 'photo_comment_create_failed') }));
    if (updated) renderClientComment(updated, clientCommentId);
    log('photo_optimistic_marked_error', timingPayload(flow.timing, { clientCommentId, error: clean(message || ''), status: 'optimistic_error' }));
  }
  function replaceOptimisticWithServer(clientCommentId, serverComment) {
    if (flow.timing) flow.timing.renderStartedAt = now();
    const updated = updateStateComment(clientCommentId, () => serverComment);
    renderClientComment(updated || serverComment, clientCommentId);
    if (flow.timing) flow.timing.renderEndedAt = now();
  }
  function optimisticPhotoComment(text, attachment) {
    const s = state();
    if (!s || !Array.isArray(s.comments)) return '';
    const id = 'client_photo_' + now() + '_' + Math.random().toString(36).slice(2, 8);
    const previewUrl = clean(attachment.previewUrl || attachment.url || flow.previewUrl);
    const optimisticAttachment = { ...attachment, previewUrl, url: clean(attachment.url || previewUrl) };
    const comment = { id, clientCommentId: id, userId: userId(), userName: userName(), avatarUrl: avatarUrl(), text, own: true, createdAt: new Date().toISOString(), sendStatus: 'sending', attachments: [optimisticAttachment], replyToId: replyToId() };
    s.comments = s.comments.concat([comment]);
    window.__ADMINKIT_PR95_PHOTO_OPTIMISTIC_ID__ = id;
    log('photo_optimistic_inserted', timingPayload(flow.timing, { clientCommentId: id, attachmentCount: 1, status: 'optimistic_inserted' }));
    renderClientComment(comment, id);
    return id;
  }
  async function createPhotoComment(attachment, caption) {
    const clientCommentId = optimisticPhotoComment(caption, attachment);
    if (flow.timing) {
      flow.timing.createStartedAt = now();
      flow.timing.status = 'create_started';
    }
    log('photo_comment_create_started', timingPayload(flow.timing, { clientCommentId, attachmentCount: 1, replyToId: replyToId(), status: 'create_started', durationMs: 0 }));
    let response;
    let data;
    try {
      response = await fetch('/api/comments', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-adminkit-photo-route': 'pr96-explicit-create-timing' },
        body: JSON.stringify({ commentKey: commentKey(), userId: userId(), userName: userName(), avatarUrl: avatarUrl(), text: caption, replyToId: replyToId(), clientCommentId, attachments: [attachment] })
      });
      data = await response.json().catch(() => ({}));
    } catch (error) {
      if (flow.timing) {
        flow.timing.createEndedAt = now();
        flow.timing.status = 'create_network_failed';
        flow.timing.error = clean(error && error.message) || 'network_failed';
      }
      const message = 'Не удалось опубликовать фото-комментарий. Проверьте соединение и попробуйте ещё раз.';
      log('photo_comment_create_network_failed', timingPayload(flow.timing, { clientCommentId, error: clean(error && error.message) || 'network_failed', status: 'create_network_failed', durationMs: flow.timing ? flow.timing.createEndedAt - flow.timing.createStartedAt : 0 }));
      markOptimisticError(clientCommentId, message);
      throw new Error(message);
    }
    if (flow.timing) flow.timing.createEndedAt = now();
    if (!response.ok || data.ok === false) {
      const message = clean(data.userMessage || data.message || data.friendlyMessage) || (data.error === 'moderation_rejected' ? 'Комментарий не прошёл модерацию.' : 'Не удалось опубликовать фото-комментарий.');
      if (flow.timing) {
        flow.timing.status = 'create_failed';
        flow.timing.error = clean(data.error || data.message || 'comment_create_failed');
      }
      log('photo_comment_create_failed', timingPayload(flow.timing, { clientCommentId, statusCode: response.status, error: clean(data.error || data.message || 'comment_create_failed'), moderationMode: clean(data.moderation && data.moderation.mode), status: 'create_failed', durationMs: flow.timing ? flow.timing.createEndedAt - flow.timing.createStartedAt : 0 }));
      markOptimisticError(clientCommentId, message);
      throw new Error(message);
    }
    if (flow.timing) {
      flow.timing.serverCommentId = clean(data.comment && data.comment.id);
      flow.timing.status = 'create_ok';
    }
    log('photo_comment_create_ok', timingPayload(flow.timing, { clientCommentId, serverCommentId: clean(data.comment && data.comment.id), attachmentCount: Array.isArray(data.comment && data.comment.attachments) ? data.comment.attachments.length : 0, status: 'create_ok', durationMs: flow.timing ? flow.timing.createEndedAt - flow.timing.createStartedAt : 0 }));
    try {
      if (data.comment) replaceOptimisticWithServer(clientCommentId, data.comment);
      setReplyToId('');
      apiRefresh();
    } catch (_) {}
    return data.comment;
  }
  function clearReplyAfterSuccess() {
    try { setReplyToId(''); } catch (_) {}
    const api = window.__ADMINKIT_COMMENTS_API__;
    try { if (api && typeof api.clearReply === 'function') api.clearReply(); } catch (_) {}
    const panel = byId('composerReply');
    if (panel) panel.classList.add('hidden');
    log('reply_cleared_after_comment_create_ok', timingPayload(flow.timing, { status: 'reply_cleared' }));
  }
  async function sendPreview() {
    if (flow.uploading || flow.compressing) {
      previewStatus(flow.compressing ? 'Дождитесь подготовки фото.' : 'Дождитесь отправки текущего фото.', true);
      return;
    }
    if (!flow.packed || flow.packedToken !== flow.selectionToken) return;
    if (!commentKey()) { previewStatus('Не удалось определить обсуждение. Обновите экран.', true); return; }
    flow.uploading = true;
    setComposerBusy(true);
    const selectionToken = flow.selectionToken;
    const timing = flow.timing;
    if (timing) {
      timing.sendClickedAt = now();
      timing.status = 'send_clicked';
    }
    try {
      previewStatus('Загружаем фото…', false);
      const packed = flow.packed;
      const attachment = await uploadPacked(packed);
      if (flow.selectionToken !== selectionToken || flow.timing !== timing || flow.packed !== packed) {
        if (timing) timing.status = 'upload_stale_selection_blocked';
        log('photo_upload_stale_selection_blocked', timingPayload(timing, { selectionToken, currentSelectionToken: flow.selectionToken, status: 'upload_stale_selection_blocked' }));
        throw new Error('Фото было заменено во время загрузки. Проверьте предпросмотр и отправьте ещё раз.');
      }
      previewStatus('Публикуем комментарий…', false);
      const caption = clean((byId('commentInput') && byId('commentInput').value) || (byId('mediaPreviewCaption') && byId('mediaPreviewCaption').value));
      await createPhotoComment(attachment, caption);
      clearReplyAfterSuccess();
      if (byId('commentInput')) byId('commentInput').value = '';
      if (timing) {
        timing.totalEndedAt = now();
        timing.status = 'ok';
      }
      log('photo_timing_summary', timingPayload(timing, { status: timingStatus(timing, 'ok'), durationMs: timing ? timing.totalEndedAt - timing.startedAt : 0 }));
      closePreview(true, { allowWhileUploading: true });
      setStatus('', false);
    } catch (error) {
      const message = clean(error && error.message) || 'Не удалось отправить фото. Попробуйте ещё раз.';
      if (timing) {
        timing.totalEndedAt = now();
        timing.status = 'failed';
        timing.error = message;
      }
      log('photo_timing_summary', timingPayload(timing, { status: timingStatus(timing, 'failed'), error: message, durationMs: timing ? timing.totalEndedAt - timing.startedAt : 0 }));
      previewStatus(message, true);
      setStatus(message, true);
    } finally {
      flow.uploading = false;
      setComposerBusy(false);
    }
  }
  async function handleFile(fileInput) {
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return;
    if (flow.uploading || flow.compressing) {
      fileInput.value = '';
      previewStatus('Дождитесь отправки текущего фото.', true);
      setStatus('Дождитесь отправки текущего фото.', true);
      log('photo_selection_blocked_while_uploading', timingPayload(flow.timing, { selectionToken: flow.selectionToken, status: 'selection_blocked_while_uploading' }));
      return;
    }
    const mime = clean(file.type || '');
    if (!/^image\//i.test(mime)) {
      setStatus('Пока в комментариях можно прикреплять только фото. Видео и файлы сейчас не поддерживаются.', true);
      log('photo_rejected_non_image', { fileName: clean(file.name), mimeType: mime, originalSize: Number(file.size || 0) || 0, status: 'rejected_non_image' });
      fileInput.value = '';
      return;
    }
    closePreview(false, { allowWhileUploading: true });
    const selectionToken = flow.selectionToken + 1;
    flow.selectionToken = selectionToken;
    flow.fileInput = fileInput;
    flow.packed = null;
    flow.packedToken = 0;
    flow.timing = makeTiming(file);
    flow.compressing = true;
    setComposerBusy(true);
    const timing = flow.timing;
    log('photo_selected', timingPayload(timing, { fileName: clean(file.name), mimeType: mime, originalSize: Number(file.size || 0) || 0, selectionToken, status: 'selected', durationMs: 0 }));
    previewStatus('Готовим фото…', false);
    try {
      const started = now();
      if (timing) timing.compressStartedAt = started;
      const packed = await compressImage(file);
      if (flow.selectionToken !== selectionToken || flow.timing !== timing) {
        if (timing) {
          timing.compressEndedAt = now();
          timing.status = 'compress_stale_ignored';
        }
        log('photo_compress_stale_ignored', timingPayload(timing, { fileName: clean(file.name), selectionToken, currentSelectionToken: flow.selectionToken, status: 'compress_stale_ignored' }));
        return;
      }
      if (flow.previewUrl) try { URL.revokeObjectURL(flow.previewUrl); } catch (_) {}
      flow.previewUrl = URL.createObjectURL(packed.blob);
      if (timing) {
        timing.compressEndedAt = now();
        timing.compressedSize = Number(packed.size || 0) || 0;
        timing.uploadSize = Number(packed.size || 0) || 0;
        timing.width = Number(packed.width || 0) || 0;
        timing.height = Number(packed.height || 0) || 0;
        timing.quality = Number(packed.quality || 0) || 0;
        timing.maxSide = Number(packed.maxSide || 0) || 0;
        timing.status = 'compressed';
      }
      flow.packed = packed;
      flow.packedToken = selectionToken;
      log('photo_compress_ok', timingPayload(timing, { fileName: packed.fileName, mimeType: packed.mimeType, compressedSize: packed.size, uploadSize: packed.size, width: packed.width, height: packed.height, quality: packed.quality, maxSide: packed.maxSide, durationMs: timing ? timing.compressEndedAt - started : now() - started, selectionToken, status: 'compress_ok' }));
      renderInlinePreview(packed, flow.previewUrl);
    } catch (error) {
      if (flow.selectionToken !== selectionToken || flow.timing !== timing) {
        if (timing) {
          timing.compressEndedAt = now();
          timing.status = 'compress_stale_error_ignored';
          timing.error = clean(error && error.message);
        }
        log('photo_compress_stale_error_ignored', timingPayload(timing, { fileName: clean(file.name), selectionToken, error: clean(error && error.message), status: 'compress_stale_error_ignored' }));
        return;
      }
      if (timing) {
        timing.compressEndedAt = now();
        timing.status = 'compress_failed';
        timing.error = clean(error && error.message);
      }
      previewStatus('Не удалось обработать фото. Попробуйте другое изображение.', true);
      log('photo_compress_failed', timingPayload(timing, { fileName: clean(file.name), error: clean(error && error.message), selectionToken, status: 'compress_failed', durationMs: timing ? timing.compressEndedAt - timing.compressStartedAt : 0 }));
    } finally {
      if (flow.selectionToken === selectionToken) flow.compressing = false;
      if (!flow.uploading) setComposerBusy(false);
    }
  }
  function hasActivePhotoSubmitFlow() {
    const host = inlinePreviewHost();
    const hasInlinePreview = Boolean(host && host.querySelector && host.querySelector('.composer-photo-preview'));
    return Boolean(flow.packed || flow.compressing || flow.uploading || hasInlinePreview);
  }
  function shouldInterceptEnterSubmit(event) {
    if (!event || event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
    const target = event.target;
    const targetId = clean(target && target.id);
    return targetId === 'commentInput' || targetId === 'mediaPreviewCaption';
  }
  function captureAttachFlow() {
    document.addEventListener('change', (event) => {
      const target = event && event.target;
      if (!target || target.id !== 'attachmentInput') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      handleFile(target);
    }, true);
    document.addEventListener('keydown', (event) => {
      if (!shouldInterceptEnterSubmit(event) || !hasActivePhotoSubmitFlow()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      log('photo_submit_enter_intercepted', timingPayload(flow.timing, {
        selectionToken: flow.selectionToken,
        hasPacked: Boolean(flow.packed),
        compressing: Boolean(flow.compressing),
        uploading: Boolean(flow.uploading),
        status: 'enter_intercepted'
      }));
      sendPreview();
    }, true);
    document.addEventListener('click', (event) => {
      const target = event && event.target;
      const submitTarget = target && target.closest && target.closest('#sendBtn,#mediaPreviewSend');
      if (submitTarget && hasActivePhotoSubmitFlow()) { event.preventDefault(); event.stopImmediatePropagation(); sendPreview(); }
      if (target && (target.classList && target.classList.contains('composer-photo-remove') || target.id === 'mediaPreviewClose' || target.id === 'mediaPreviewClear')) { event.preventDefault(); event.stopPropagation(); closePreview(true); }
    }, true);
  }
  const flow = { fileInput: null, packed: null, packedToken: 0, previewUrl: '', uploading: false, compressing: false, selectionToken: 0, timing: null };
  captureAttachFlow();
  window.__ADMINKIT_PR95_PHOTO_FLOW__ = { runtimeVersion: RUNTIME, handleFile, sendPreview, closePreview };
  log('photo_flow_installed', { href: location.href, userAgent: navigator.userAgent, status: 'installed' });
})();