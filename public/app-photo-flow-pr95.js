;(() => {
  'use strict';
  const RUNTIME = 'PR95-PHOTO-FLOW-EXPLICIT-UPLOAD';
  const MARKER = '__ADMINKIT_PR95_PHOTO_FLOW_EXPLICIT_UPLOAD__';
  if (window[MARKER]) return;
  window[MARKER] = true;

  function byId(id) { return document.getElementById(id); }
  function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  function now() { return Date.now(); }
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
        hasDataUrl: Boolean(safe.hasDataUrl),
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
  function bytesOfDataUrl(value) {
    const raw = clean(value);
    if (!/^data:/i.test(raw)) return 0;
    const b64 = raw.includes(',') ? raw.split(',').slice(1).join(',') : raw;
    return Math.floor((b64.replace(/\s+/g, '').length * 3) / 4);
  }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(clean(reader.result));
      reader.onerror = () => reject(new Error('file_reader_failed'));
      reader.readAsDataURL(file);
    });
  }
  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image_decode_failed'));
      img.src = dataUrl;
    });
  }
  async function compressImage(file) {
    const sourceDataUrl = await readFileAsDataUrl(file);
    const img = await loadImage(sourceDataUrl);
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    if (!width || !height) throw new Error('image_size_unknown');
    const maxSideSteps = [1280, 960, 720, 640];
    const qualitySteps = [0.76, 0.68, 0.6, 0.54];
    const hardMax = 1024 * 1024;
    let best = null;
    for (const maxSide of maxSideSteps) {
      const ratio = Math.max(width, height) > maxSide ? maxSide / Math.max(width, height) : 1;
      const w = Math.max(1, Math.round(width * ratio));
      const h = Math.max(1, Math.round(height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('canvas_context_failed');
      ctx.drawImage(img, 0, 0, w, h);
      for (const quality of qualitySteps) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const size = bytesOfDataUrl(dataUrl);
        const packed = { dataUrl, mimeType: 'image/jpeg', fileName: (file.name || 'photo').replace(/\.[^/.]+$/, '') + '.jpg', size, width: w, height: h, quality, maxSide };
        best = packed;
        if (size <= hardMax) return packed;
      }
    }
    if (best) return best;
    throw new Error('compress_failed');
  }
  function ensurePreviewOpen() {
    const modal = byId('mediaPreviewModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('media-preview-open');
  }
  function closePreview(clearFile) {
    const modal = byId('mediaPreviewModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('media-preview-open');
    const status = byId('mediaPreviewStatus');
    if (status) { status.textContent = ''; status.classList.add('hidden'); status.classList.remove('error'); }
    const stage = byId('mediaPreviewStage');
    if (stage) stage.innerHTML = '';
    const caption = byId('mediaPreviewCaption');
    if (caption) caption.value = '';
    if (clearFile && flow.fileInput) flow.fileInput.value = '';
    flow.file = null;
    flow.packed = null;
    flow.previewUrl = '';
    flow.uploading = false;
  }
  function previewStatus(message, isError) {
    const el = byId('mediaPreviewStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
    el.classList.toggle('error', Boolean(isError && message));
  }
  function renderPreview(file, previewUrl) {
    const stage = byId('mediaPreviewStage');
    if (stage) stage.innerHTML = '<img class="media-preview-image" src="' + previewUrl.replace(/"/g, '&quot;') + '" alt="photo">';
    ensurePreviewOpen();
    previewStatus('Готовим фото…', false);
    log('photo_preview_opened', { fileName: clean(file && file.name), originalSize: Number(file && file.size || 0) || 0 });
  }
  async function uploadPacked(packed) {
    const clientUploadId = 'pr95_' + now() + '_' + Math.random().toString(36).slice(2, 8);
    log('photo_upload_started', { clientUploadId, fileName: packed.fileName, mimeType: packed.mimeType, uploadSize: packed.size, width: packed.width, height: packed.height, quality: packed.quality, maxSide: packed.maxSide, hasDataUrl: true });
    const response = await fetch('/api/comments/attachments/upload', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-adminkit-photo-route': 'pr95-explicit-upload' },
      body: JSON.stringify({ commentKey: commentKey(), clientUploadId, type: 'image', fileName: packed.fileName, mimeType: packed.mimeType, size: packed.size, dataUrl: packed.dataUrl })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false || !data.attachment) {
      log('photo_upload_failed', { clientUploadId, status: response.status, error: clean(data.error || data.message || 'photo_upload_failed') });
      const err = new Error(clean(data.userMessage || data.message || data.error || 'Не удалось загрузить фото. Попробуйте ещё раз.'));
      err.status = response.status || 400;
      throw err;
    }
    const attachment = { ...(data.attachment || {}) };
    delete attachment.dataUrl;
    delete attachment.thumbDataUrl;
    delete attachment.previewDataUrl;
    attachment.type = 'image';
    attachment.mimeType = clean(attachment.mimeType || attachment.mime || packed.mimeType || 'image/jpeg');
    attachment.fileName = clean(attachment.fileName || attachment.name || packed.fileName || 'photo.jpg');
    attachment.name = clean(attachment.name || attachment.fileName);
    attachment.clientUploadId = clean(attachment.clientUploadId || clientUploadId);
    attachment.uploadId = clean(attachment.uploadId || attachment.id || clientUploadId);
    attachment.localOnly = false;
    attachment.inlineOnly = false;
    attachment.previewOnly = false;
    log('photo_upload_ok', { clientUploadId, uploadId: attachment.uploadId, fileName: attachment.fileName, mimeType: attachment.mimeType, uploadSize: attachment.size || packed.size, hasUrl: Boolean(attachment.url), hasPreviewUrl: Boolean(attachment.previewUrl) });
    return attachment;
  }
  function optimisticPhotoComment(text, attachment) {
    const s = state();
    if (!s || !Array.isArray(s.comments)) return '';
    const id = 'client_photo_' + now() + '_' + Math.random().toString(36).slice(2, 8);
    const previewUrl = clean(attachment.previewUrl || attachment.url || flow.previewUrl);
    const optimisticAttachment = { ...attachment, previewUrl, url: clean(attachment.url || previewUrl) };
    s.comments = s.comments.concat([{ id, clientCommentId: id, userId: userId(), userName: userName(), avatarUrl: avatarUrl(), text, own: true, createdAt: new Date().toISOString(), sendStatus: 'sending', attachments: [optimisticAttachment], replyToId: replyToId() }]);
    window.__ADMINKIT_PR95_PHOTO_OPTIMISTIC_ID__ = id;
    log('photo_optimistic_inserted', { clientCommentId: id, attachmentCount: 1 });
    try { window.__ADMINKIT_COMMENTS_API__ && window.__ADMINKIT_COMMENTS_API__.render && window.__ADMINKIT_COMMENTS_API__.render(); } catch (_) {}
    return id;
  }
  async function createPhotoComment(attachment, caption) {
    const clientCommentId = optimisticPhotoComment(caption, attachment);
    log('photo_comment_create_started', { clientCommentId, attachmentCount: 1, replyToId: replyToId() });
    const response = await fetch('/api/comments', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-adminkit-photo-route': 'pr95-explicit-create' },
      body: JSON.stringify({ commentKey: commentKey(), userId: userId(), userName: userName(), avatarUrl: avatarUrl(), text: caption, replyToId: replyToId(), clientCommentId, attachments: [attachment] })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      log('photo_comment_create_failed', { clientCommentId, status: response.status, error: clean(data.error || data.message || 'comment_create_failed'), moderationMode: clean(data.moderation && data.moderation.mode) });
      const message = clean(data.userMessage || data.message || data.friendlyMessage) || (data.error === 'moderation_rejected' ? 'Комментарий не прошёл модерацию.' : 'Не удалось опубликовать фото-комментарий.');
      throw new Error(message);
    }
    log('photo_comment_create_ok', { clientCommentId, serverCommentId: clean(data.comment && data.comment.id), attachmentCount: Array.isArray(data.comment && data.comment.attachments) ? data.comment.attachments.length : 0 });
    try {
      const s = state();
      if (s && Array.isArray(s.comments) && data.comment) s.comments = s.comments.map((item) => item && (item.clientCommentId === clientCommentId || item.id === clientCommentId) ? data.comment : item);
      setReplyToId('');
      window.__ADMINKIT_COMMENTS_API__ && window.__ADMINKIT_COMMENTS_API__.render && window.__ADMINKIT_COMMENTS_API__.render();
      window.__ADMINKIT_COMMENTS_API__ && window.__ADMINKIT_COMMENTS_API__.refresh && window.__ADMINKIT_COMMENTS_API__.refresh();
    } catch (_) {}
    return data.comment;
  }
  async function sendPreview() {
    if (flow.uploading || !flow.file) return;
    if (!commentKey()) { previewStatus('Не удалось определить обсуждение. Обновите экран.', true); return; }
    flow.uploading = true;
    const sendBtn = byId('mediaPreviewSend');
    if (sendBtn) sendBtn.disabled = true;
    try {
      previewStatus('Загружаем фото…', false);
      let packed = flow.packed;
      if (!packed) packed = flow.packed = await compressImage(flow.file);
      const attachment = await uploadPacked(packed);
      previewStatus('Публикуем комментарий…', false);
      const caption = clean(byId('mediaPreviewCaption') && byId('mediaPreviewCaption').value);
      await createPhotoComment(attachment, caption);
      closePreview(true);
      setStatus('', false);
    } catch (error) {
      previewStatus(clean(error && error.message) || 'Не удалось отправить фото. Попробуйте ещё раз.', true);
      setStatus(clean(error && error.message) || 'Не удалось отправить фото. Попробуйте ещё раз.', true);
    } finally {
      flow.uploading = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }
  async function handleFile(fileInput) {
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return;
    const mime = clean(file.type || '');
    if (!/^image\//i.test(mime)) {
      setStatus('Пока в комментариях можно прикреплять только фото. Видео и файлы сейчас не поддерживаются.', true);
      log('photo_rejected_non_image', { fileName: clean(file.name), mimeType: mime, originalSize: Number(file.size || 0) || 0 });
      fileInput.value = '';
      return;
    }
    if (flow.previewUrl) try { URL.revokeObjectURL(flow.previewUrl); } catch (_) {}
    flow.fileInput = fileInput;
    flow.file = file;
    flow.packed = null;
    flow.previewUrl = URL.createObjectURL(file);
    log('photo_selected', { fileName: clean(file.name), mimeType: mime, originalSize: Number(file.size || 0) || 0 });
    renderPreview(file, flow.previewUrl);
    try {
      const started = now();
      flow.packed = await compressImage(file);
      previewStatus('', false);
      log('photo_compress_ok', { fileName: flow.packed.fileName, mimeType: flow.packed.mimeType, compressedSize: flow.packed.size, width: flow.packed.width, height: flow.packed.height, quality: flow.packed.quality, maxSide: flow.packed.maxSide, durationMs: now() - started });
    } catch (error) {
      previewStatus('Не удалось обработать фото. Попробуйте другое изображение.', true);
      log('photo_compress_failed', { fileName: clean(file.name), error: clean(error && error.message) });
    }
  }
  function captureAttachFlow() {
    document.addEventListener('change', (event) => {
      const target = event && event.target;
      if (!target || target.id !== 'attachmentInput') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      handleFile(target);
    }, true);
    document.addEventListener('click', (event) => {
      const target = event && event.target;
      if (target && target.id === 'mediaPreviewSend') { event.preventDefault(); event.stopPropagation(); sendPreview(); }
      if (target && (target.id === 'mediaPreviewClose' || target.id === 'mediaPreviewClear')) { event.preventDefault(); event.stopPropagation(); closePreview(true); }
    }, true);
  }
  const flow = { fileInput: null, file: null, packed: null, previewUrl: '', uploading: false };
  captureAttachFlow();
  window.__ADMINKIT_PR95_PHOTO_FLOW__ = { runtimeVersion: RUNTIME, handleFile, sendPreview, closePreview };
  log('photo_flow_installed', { href: location.href, userAgent: navigator.userAgent });
})();
