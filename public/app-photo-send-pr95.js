;(() => {
  'use strict';
  const MARKER = '__ADMINKIT_PR95_PHOTO_SEND_UPLOAD_GUARD__';
  if (window[MARKER]) return;
  window[MARKER] = true;

  const RUNTIME = 'PR95-PHOTO-SEND-UPLOAD-GUARD';
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!originalFetch) return;

  const photoLog = [];
  window.__ADMINKIT_PR95_PHOTO_LOG__ = photoLog;

  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function now() { return Date.now(); }
  function dataUrlBytes(value) {
    const raw = clean(value);
    if (!/^data:/i.test(raw)) return 0;
    const b64 = raw.includes(',') ? raw.split(',').slice(1).join(',') : raw;
    return Math.floor((b64.replace(/\s+/g, '').length * 3) / 4);
  }
  function log(event, payload) {
    const item = { at: now(), event: clean(event), runtimeVersion: RUNTIME, ...(payload && typeof payload === 'object' ? payload : {}) };
    photoLog.push(item);
    if (photoLog.length > 80) photoLog.splice(0, photoLog.length - 80);
    try {
      const body = JSON.stringify({ event, runtimeVersion: RUNTIME, payload: item });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/debug/comment-trace-event', new Blob([body], { type: 'application/json' }));
      else originalFetch('/api/debug/comment-trace-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    } catch (_) {}
  }
  function urlOf(input) {
    try { return typeof input === 'string' ? input : String(input && input.url || ''); } catch (_) { return ''; }
  }
  function methodOf(input, init) {
    return clean((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }
  function headersOf(init) {
    const out = {};
    try {
      const h = new Headers(init && init.headers || {});
      h.forEach((v, k) => { out[k] = v; });
    } catch (_) {}
    return out;
  }
  function isCommentsCreate(input, init) {
    const url = urlOf(input);
    if (!/\/api\/comments(?:$|[?#])/i.test(url)) return false;
    if (/\/api\/comments\//i.test(url)) return false;
    return methodOf(input, init) === 'POST';
  }
  function parseJsonBody(init) {
    const body = init && init.body;
    if (!body || typeof body !== 'string') return null;
    try { return JSON.parse(body); } catch (_) { return null; }
  }
  function inlineImageSource(att) {
    if (!att || typeof att !== 'object') return '';
    return clean(att.dataUrl || att.data_url || att.thumbDataUrl || att.thumb_data_url || att.previewDataUrl || att.preview_data_url || '');
  }
  function isInlineImageAttachment(att) {
    if (!att || typeof att !== 'object') return false;
    const type = clean(att.type || att.kind).toLowerCase();
    const mime = clean(att.mimeType || att.mime).toLowerCase();
    const name = clean(att.fileName || att.name).toLowerCase();
    return Boolean(inlineImageSource(att)) && (type === 'image' || mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(name));
  }
  function stripInlineData(att) {
    const out = { ...(att || {}) };
    delete out.dataUrl; delete out.data_url;
    delete out.thumbDataUrl; delete out.thumb_data_url;
    delete out.previewDataUrl; delete out.preview_data_url;
    out.inlineOnly = false;
    out.previewOnly = false;
    return out;
  }
  function normalizeUploadedAttachment(uploaded, original) {
    const source = uploaded && uploaded.attachment && typeof uploaded.attachment === 'object' ? uploaded.attachment : {};
    const fallback = original && typeof original === 'object' ? original : {};
    const out = stripInlineData({ ...fallback, ...source });
    out.type = 'image';
    out.mimeType = clean(out.mimeType || out.mime || fallback.mimeType || fallback.mime || 'image/jpeg');
    out.mime = clean(out.mime || out.mimeType || 'image/jpeg');
    out.fileName = clean(out.fileName || out.name || fallback.fileName || fallback.name || 'photo.jpg');
    out.name = clean(out.name || out.fileName || 'photo.jpg');
    out.size = Number(out.size || fallback.size || 0) || 0;
    out.clientUploadId = clean(out.clientUploadId || fallback.clientUploadId || fallback.client_upload_id || ('pr95_' + now() + '_' + Math.random().toString(36).slice(2, 8)));
    out.uploadId = clean(out.uploadId || out.id || out.clientUploadId);
    out.previewUrl = clean(out.previewUrl || out.url || source.previewUrl || source.url || '');
    out.url = clean(out.url || source.url || '');
    out.storage = clean(out.storage || source.storage || 'server_public');
    out.native = Boolean(out.native);
    out.localOnly = false;
    return out;
  }
  async function uploadInlineImage(att, body) {
    const dataUrl = inlineImageSource(att);
    const clientUploadId = clean(att.clientUploadId || att.client_upload_id || ('pr95_' + now() + '_' + Math.random().toString(36).slice(2, 8)));
    const mimeType = clean(att.mimeType || att.mime || 'image/jpeg');
    const fileName = clean(att.fileName || att.name || 'photo.jpg');
    const bytes = dataUrlBytes(dataUrl);
    log('photo_upload_start', { commentKey: clean(body.commentKey), clientUploadId, fileName, mimeType, inlineBytes: bytes, source: 'fetch_intercept_before_comment_create' });
    const response = await originalFetch('/api/comments/attachments/upload', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-adminkit-photo-route': 'pr95-upload-before-comment' },
      body: JSON.stringify({
        commentKey: clean(body.commentKey),
        clientUploadId,
        type: 'image',
        fileName,
        mimeType,
        size: Number(att.size || bytes || 0) || bytes,
        dataUrl,
        fallbackReason: 'pr95_photo_send_before_comment_create'
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false || !data.attachment) {
      log('photo_upload_error', { commentKey: clean(body.commentKey), clientUploadId, status: response.status, error: clean(data.error || data.message || 'photo_upload_failed') });
      const err = new Error(clean(data.userMessage || data.message || data.error || 'photo_upload_failed'));
      err.status = response.status || 400;
      throw err;
    }
    const normalized = normalizeUploadedAttachment(data, { ...att, clientUploadId });
    log('photo_upload_ok', { commentKey: clean(body.commentKey), clientUploadId, uploadId: clean(normalized.uploadId || normalized.id), previewUrl: clean(normalized.previewUrl), hasInlineAfterUpload: Boolean(inlineImageSource(normalized)), uploadMode: clean(data.uploadMode || '') });
    return normalized;
  }
  function failureResponse(message, status) {
    const body = JSON.stringify({ ok: false, error: 'photo_upload_failed', userMessage: message || 'Не удалось загрузить фото. Попробуйте ещё раз.', pr95: true });
    try { return new Response(body, { status: status || 400, headers: { 'Content-Type': 'application/json' } }); } catch (_) { throw new Error(message || 'photo_upload_failed'); }
  }

  window.fetch = async function adminkitPr95Fetch(input, init) {
    if (!isCommentsCreate(input, init)) return originalFetch(input, init);
    const body = parseJsonBody(init || {});
    if (!body || !Array.isArray(body.attachments) || !body.attachments.some(isInlineImageAttachment)) {
      const response = await originalFetch(input, init);
      try { log(response.ok ? 'comment_create_response_ok' : 'comment_create_response_error', { status: response.status, commentKey: clean(body && body.commentKey), attachmentCount: body && Array.isArray(body.attachments) ? body.attachments.length : 0 }); } catch (_) {}
      return response;
    }
    try {
      log('photo_comment_prepare_uploads', { commentKey: clean(body.commentKey), attachmentCount: body.attachments.length });
      const nextAttachments = [];
      const clientUploadIds = Array.isArray(body.clientUploadIds) ? body.clientUploadIds.slice() : [];
      for (const att of body.attachments) {
        if (isInlineImageAttachment(att)) {
          const uploaded = await uploadInlineImage(att, body);
          nextAttachments.push(uploaded);
          if (uploaded.clientUploadId && !clientUploadIds.includes(uploaded.clientUploadId)) clientUploadIds.push(uploaded.clientUploadId);
        } else {
          nextAttachments.push(att);
        }
      }
      const nextBody = { ...body, attachments: nextAttachments, clientUploadIds, pr95PhotoRoute: 'upload_before_comment_create' };
      log('photo_comment_payload_ready', { commentKey: clean(nextBody.commentKey), attachmentCount: nextAttachments.length, clientUploadIds, hasInlinePayload: nextAttachments.some((a) => Boolean(inlineImageSource(a))) });
      const nextInit = { ...(init || {}), headers: { ...headersOf(init || {}), 'Content-Type': 'application/json', 'x-adminkit-photo-route': 'pr95-upload-before-comment' }, body: JSON.stringify(nextBody) };
      const response = await originalFetch(input, nextInit);
      let cloneData = {};
      try { cloneData = await response.clone().json(); } catch (_) {}
      log(response.ok && cloneData.ok !== false ? 'photo_comment_create_ok' : 'photo_comment_create_error', { commentKey: clean(nextBody.commentKey), status: response.status, error: clean(cloneData.error || cloneData.message || ''), moderationMode: clean(cloneData.moderation && cloneData.moderation.mode), moderationReasons: cloneData.moderation && cloneData.moderation.reasons || [] });
      return response;
    } catch (error) {
      const message = clean(error && error.message) || 'Не удалось загрузить фото. Попробуйте ещё раз.';
      log('photo_comment_create_blocked_before_comment', { commentKey: clean(body.commentKey), error: message });
      return failureResponse(message, error && error.status || 400);
    }
  };

  log('pr95_photo_send_guard_installed', { href: location.href, userAgent: navigator.userAgent });
})();
