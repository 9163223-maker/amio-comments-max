;(() => {
'use strict';

const RUNTIME = 'CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE';
const CORE_SEND_RUNTIME = 'CC8.1.12-CORE-FAST-TEXT-SEND';
const MARKER = '__ADMINKIT_CC7_5_64_DIRECT_MEDIA_POST_PATCH_TRACE__';
if (window[MARKER]) return;
window[MARKER] = true;
window.__ADMINKIT_CORE_FAST_TEXT_SEND_RUNTIME__ = CORE_SEND_RUNTIME;

function byId(id) { return document.getElementById(id); }
function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function safeDecode(v) {
  let current = String(v || '');
  for (let i = 0; i < 5; i += 1) {
    try {
      const decoded = decodeURIComponent(current.replace(/\+/g, '%20'));
      if (decoded === current) break;
      current = decoded;
    } catch (_) { break; }
  }
  return current;
}
function escapeHtml(v) {
  return String(v || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function normalizeSearch(v) { return clean(v).toLowerCase().replace(/ё/g, 'е'); }
function formatTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; }
}
function pluralComments(n) {
  const count = Math.max(0, Number(n || 0) || 0);
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 0) return '0 комментариев';
  if (mod10 === 1 && mod100 !== 11) return count + ' комментарий';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return count + ' комментария';
  return count + ' комментариев';
}
function getPossibleWebApps() {
  return [
    window.WebApp,
    window.Telegram && window.Telegram.WebApp,
    window.Max && window.Max.WebApp,
    window.MAX && window.MAX.WebApp,
    window.maxWebApp,
    window.MAXWebApp,
    window.MiniApp,
    window.max && window.max.WebApp
  ].filter(Boolean);
}
function initBridgeUi() {
  const app = getPossibleWebApps()[0];
  try { app && app.ready && app.ready(); } catch (_) {}
  try { app && app.expand && app.expand(); } catch (_) {}
  try { app && app.disableClosingConfirmation && app.disableClosingConfirmation(); } catch (_) {}
}
function getBridgeUser() {
  for (const app of getPossibleWebApps()) {
    const user = (app && app.initDataUnsafe && app.initDataUnsafe.user) || (app && app.user);
    if (user) return user;
  }
  return null;
}
function getBridgeUserName() {
  const user = getBridgeUser();
  return clean((user && (user.first_name || user.username || user.last_name)) || '');
}
function getBridgeUserId() {
  const user = getBridgeUser();
  return clean((user && user.id) || '');
}
function getBridgeAvatarUrl() {
  const user = getBridgeUser();
  return clean((user && user.photo_url) || '');
}
function addUnique(list, value) {
  const text = clean(value);
  if (text && !list.includes(text)) list.push(text);
}
function isStartOnlyValue(v) {
  const s = clean(safeDecode(v)).toLowerCase();
  return !s || ['start', 'menu', 'main', 'home', 'bot', 'admin', 'adminkit'].includes(s);
}
function derivePostNumber(text) {
  const s = clean(safeDecode(text));
  if (!s) return '';
  let m = s.match(/(?:^|[^\w])(post|пост)[:=\s-]*(\d{1,4})(?:$|[^\w])/i);
  if (m) return m[2];
  m = s.match(/(?:^|[?&#\s])(startapp|start_param|WebAppStartParam|payload|startPayload|start_payload|post|postId|post_id|title)=(?:Post\s*)?(\d{1,4})(?:$|[&#\s])/i);
  if (m) return m[2];
  m = s.match(/^\d{1,4}$/);
  if (m) return m[0];
  return '';
}
function parseCompactPayload(text) {
  const s = clean(safeDecode(text));
  const out = { commentKey: '', channelId: '', postId: '', handoff: '' };
  if (!s) return out;
  let m = s.match(/(?:^|[^A-Za-z0-9_-])(cp_(-?\d{3,})_(-?\d{1,}))(?:$|[^A-Za-z0-9_-])/) || s.match(/^(cp_(-?\d{3,})_(-?\d{1,}))$/);
  if (m) {
    out.handoff = m[1];
    out.channelId = m[2];
    out.postId = m[3];
    out.commentKey = out.channelId + ':' + out.postId;
    return out;
  }
  m = s.match(/(?:^|[^A-Za-z0-9_-])(ck_(-?\d{3,})_(-?\d{1,}))(?:$|[^A-Za-z0-9_-])/) || s.match(/^(ck_(-?\d{3,})_(-?\d{1,}))$/);
  if (m) {
    out.handoff = m[1];
    out.channelId = m[2];
    out.postId = m[3];
    out.commentKey = out.channelId + ':' + out.postId;
    return out;
  }
  m = s.match(/(-?\d{3,}):(-?\d{1,})/);
  if (m) {
    out.channelId = m[1];
    out.postId = m[2];
    out.commentKey = out.channelId + ':' + out.postId;
  }
  return out;
}
function scanParams() {
  const result = { commentKey: '', handoff: '', channelId: '', postId: '', title: '', raw: '', rawPieces: [], hasCommentIdentity: false, launchMode: 'start' };
  function markCommentIdentity(reason) {
    result.hasCommentIdentity = true;
    result.launchMode = 'comments';
    result.identityReason = result.identityReason || reason || 'explicit_comment_identity';
  }
  function applyCompact(value) {
    const parsed = parseCompactPayload(value);
    if (parsed.handoff && !result.handoff) result.handoff = parsed.handoff;
    if (parsed.commentKey && !result.commentKey) result.commentKey = parsed.commentKey;
    if (parsed.channelId && !result.channelId) result.channelId = parsed.channelId;
    if (parsed.postId && !result.postId) result.postId = parsed.postId;
    if (parsed.commentKey || parsed.handoff) markCommentIdentity('compact_payload');
    return Boolean(parsed.commentKey || parsed.channelId || parsed.postId || parsed.handoff);
  }
  function addRaw(value) {
    const v = String(value || '');
    if (!v) return;
    addUnique(result.rawPieces, v);
    addUnique(result.rawPieces, safeDecode(v));
    applyCompact(v);
  }
  function setValue(key, value) {
    const v = clean(safeDecode(value));
    if (!v) return;
    addRaw(v);
    applyCompact(v);
    const lower = String(key || '').toLowerCase();
    const isPayloadKey = ['handoff', 'startapp', 'start_param', 'webappstartparam', 'payload', 'startpayload', 'start_payload', 'button_payload', 'launch_payload', 'web_app_payload'].includes(lower);
    if ((lower === 'commentkey' || lower === 'key') && !result.commentKey && !isStartOnlyValue(v)) {
      result.commentKey = v.replace(/^ck:/i, '');
      markCommentIdentity('commentKey_field');
    }
    if (isPayloadKey) {
      if (!result.handoff && !isStartOnlyValue(v)) result.handoff = v;
      if (/^(cp_|ck_|h_|ak_)/i.test(v) || /-?\d{3,}:-?\d{1,}/.test(v)) markCommentIdentity('payload_field');
      const number = derivePostNumber(v);
      if (number) {
        if (!result.postId) result.postId = number;
        if (!result.title) result.title = 'Post ' + number;
        markCommentIdentity('payload_post_number');
      }
    }
    if ((lower === 'channelid' || lower === 'channel' || lower === 'channel_id') && !result.channelId && /^-?\d{3,}$/.test(v)) result.channelId = v;
    if ((lower === 'postid' || lower === 'post_id' || lower === 'messageid' || lower === 'message_id') && !result.postId && /^-?\d{1,}$/.test(v)) {
      result.postId = v.replace(/^post:/i, '');
      markCommentIdentity('postId_field');
    }
    if ((lower === 'title' || lower === 'posttitle' || lower === 'posttext') && !result.title && /\b(Post|Пост)\s*\d{1,4}\b/i.test(v)) {
      result.title = v;
      markCommentIdentity('post_title_field');
    }
  }
  function scanObject(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 5) return;
    try { addRaw(JSON.stringify(obj).slice(0, 2500)); } catch (_) {}
    Object.entries(obj).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'object') scanObject(value, depth + 1);
      else setValue(key, value);
    });
  }
  function scan(raw) {
    if (raw && typeof raw === 'object') { scanObject(raw, 0); return; }
    raw = String(raw || '');
    if (!raw) return;
    addRaw(raw);
    for (const variant of [raw, safeDecode(raw)]) {
      applyCompact(variant);
      const parts = [variant];
      if (variant.includes('?')) parts.push(variant.split('?').slice(1).join('?'));
      if (variant.includes('#')) parts.push(variant.split('#').slice(1).join('#'));
      for (const part of parts) {
        try {
          const params = new URLSearchParams(String(part || '').replace(/^#|^\?/g, ''));
          for (const pair of params.entries()) setValue(pair[0], pair[1]);
        } catch (_) {}
      }
      const compact = variant.match(/(cp_-?\d{3,}_-?\d{1,}|ck_-?\d{3,}_-?\d{1,}|ak_[A-Za-z0-9_-]{8,})/i);
      if (compact) setValue('handoff', compact[1]);
      const ck = variant.match(/-?\d{3,}:-?\d{1,}/);
      if (ck) setValue('commentKey', ck[0]);
      const handoff = variant.match(/h_[A-Za-z0-9_-]{6,}/);
      if (handoff) setValue('handoff', handoff[0]);
      const postId = variant.match(/(?:postId|post_id|messageId|message_id|post)[:=](-?\d{1,})/i);
      if (postId) setValue('postId', postId[1]);
      const title = variant.match(/\b(Post\s*new!!\s*\d+!|Post\s*new\s*\d+|Post\s*zero\s*\d+|Post\s*\d+|Пост\s*\d+)\b/i);
      if (title) setValue('title', title[1]);
      const number = derivePostNumber(variant);
      if (number) {
        if (!result.postId) result.postId = number;
        if (!result.title) result.title = 'Post ' + number;
      }
    }
  }

  try { scan(location.href); scan(location.search); scan(location.hash); scan(document.referrer || ''); } catch (_) {}
  getPossibleWebApps().forEach((app) => {
    try {
      const unsafe = (app && app.initDataUnsafe) || {};
      ['start_param', 'startapp', 'WebAppStartParam', 'payload', 'startPayload', 'start_payload', 'button_payload', 'launch_payload', 'web_app_payload', 'postId', 'post_id', 'messageId', 'message_id', 'commentKey', 'channelId', 'channel_id', 'title', 'postTitle'].forEach((key) => setValue(key, unsafe[key]));
      scanObject(unsafe, 0);
      scan(app && app.initData);
      scan(app && app.startParam);
      scan(app && app.launchParams);
      scan(app && app.params);
      scan(app && app.payload);
      scan(app && app.startPayload);
      scan(app && app.start_payload);
      scan(app && app.buttonPayload);
      scan(app && app.webAppPayload);
    } catch (_) {}
  });

  if (result.commentKey && result.commentKey.includes(':')) {
    const parts = result.commentKey.split(':');
    if (!result.channelId && parts[0]) result.channelId = clean(parts[0]);
    if (!result.postId && parts[1]) result.postId = clean(parts[1]);
  }
  if (!result.title && result.postId && /^\d{1,4}$/.test(result.postId)) result.title = 'Post ' + result.postId;
  result.raw = result.rawPieces.join(' ').slice(0, 4000);
  return result;
}

const refs = {
  postCard: byId('postCard'), postTitle: byId('postTitle'), postMedia: byId('postMedia'), commentsList: byId('commentsList'),
  emptyState: byId('emptyState'), nameInput: byId('nameInput'), commentInput: byId('commentInput'), sendBtn: byId('sendBtn'),
  attachBtn: byId('attachBtn'), attachmentInput: byId('attachmentInput'), commentsCountPill: byId('commentsCountPill'),
  adminkitDiscussionLink: byId('adminkitDiscussionLink'), backBtn: byId('backBtn'), searchBtn: byId('searchBtn'),
  commentSearchPanel: byId('commentSearchPanel'), commentSearchInput: byId('commentSearchInput'), commentSearchClear: byId('commentSearchClear'),
  composerAvatar: byId('composerAvatar'), composerAvatarFallback: byId('composerAvatarFallback'), discussionLabel: byId('discussionLabel'), composerCard: byId('composerCard'),
  postError: byId('postError'), commentInlineStatus: byId('commentInlineStatus'), commentsWrap: byId('commentsWrap'),
  miniAppStartCard: byId('miniAppStartCard'), miniAppStartText: byId('miniAppStartText'), miniAppStartWorkBtn: byId('miniAppStartWorkBtn'),
  miniAppCommunityBtn: byId('miniAppCommunityBtn'), miniAppTopbar: byId('miniAppTopbar'),
  attachmentPreview: byId('attachmentPreview'),
  sheetOverlay: byId('sheetOverlay'), commentFocusModal: byId('commentFocusModal'), focusedCommentCard: byId('focusedCommentCard'),
  reactionBar: byId('reactionBar'), actionSheet: byId('actionSheet'), composerReply: byId('composerReply'),
  composerReplyName: byId('composerReplyName'), composerReplyText: byId('composerReplyText'), composerReplyClose: byId('composerReplyClose')
};

const params = scanParams();
const state = {
  commentKey: params.commentKey, handoff: params.handoff, channelId: params.channelId, postId: params.postId,
  title: params.title, raw: params.raw, launchMode: params.launchMode, hasCommentIdentity: params.hasCommentIdentity,
  currentUserId: getBridgeUserId(), currentUserName: getBridgeUserName(), currentUserAvatarUrl: getBridgeAvatarUrl(),
  comments: [], meta: {}, commentsCount: 0, pollTimer: null, requestInFlight: false,
  sendInFlight: false, textSendInFlight: {}, lastSendFingerprint: '', lastSendStartedAt: 0,
  pendingPhoto: null,
  commentTrace: [],
  searchOpen: false, searchQuery: '',
  activeCommentId: '', replyToId: ''
};
window.__ADMINKIT_CC7_5_55_STATE__ = state;
window.__ADMINKIT_CC7_5_53_STATE__ = state;
window.__ADMINKIT_CC7_5_47_STATE__ = state;
window.__ADMINKIT_CC7_5_6_STATE__ = state;
window.__ADMINKIT_CC7_5_3_STATE__ = state;
window.__ADMINKIT_CC7_2_STATE__ = state;

function setInlineStatus(message, isError) {
  if (!refs.commentInlineStatus) return;
  refs.commentInlineStatus.textContent = message || '';
  refs.commentInlineStatus.classList.toggle('hidden', !message);
  refs.commentInlineStatus.classList.toggle('error', Boolean(isError && message));
}
function setSendingUi(isSending) {
  if (refs.sendBtn) {
    refs.sendBtn.disabled = Boolean(isSending);
    refs.sendBtn.setAttribute('aria-busy', isSending ? 'true' : 'false');
    refs.sendBtn.classList.toggle('is-sending', Boolean(isSending));
  }
  if (refs.commentInput) refs.commentInput.readOnly = Boolean(isSending);
}
function pushCommentTrace(event, payload) {
  const allowed = { attachment_pick: 1, attachment_compress_start: 1, attachment_compress_ok: 1, comment_create_start: 1, comment_create_ok: 1, comment_create_error: 1, optimistic_comment_inserted: 1, optimistic_comment_replaced: 1, text_comment_send_queued: 1, text_comment_send_released: 1 };
  if (!allowed[String(event || '')]) return;
  const safe = payload && typeof payload === 'object' ? payload : {};
  const attachment = safe.attachment && typeof safe.attachment === 'object' ? safe.attachment : {};
  const item = {
    at: Date.now(),
    event: clean(event),
    runtimeVersion: RUNTIME,
    coreSendRuntime: CORE_SEND_RUNTIME,
    commentKey: clean(safe.commentKey || state.commentKey),
    clientCommentId: clean(safe.clientCommentId),
    originalSize: Number(safe.originalSize || 0) || 0,
    compressedSize: Number(safe.compressedSize || 0) || 0,
    uploadSize: Number(safe.uploadSize || 0) || 0,
    width: Number(safe.width || 0) || 0,
    height: Number(safe.height || 0) || 0,
    quality: Number(safe.quality || 0) || 0,
    maxSide: Number(safe.maxSide || 0) || 0,
    durationMs: Number(safe.durationMs || 0) || 0,
    thumbDataUrlBytes: Number(safe.thumbDataUrlBytes || attachment.thumbDataUrlBytes || 0) || 0,
    hasThumbDataUrl: Boolean(safe.hasThumbDataUrl || attachment.hasThumbDataUrl),
    hasPreviewDataUrl: Boolean(safe.hasPreviewDataUrl || attachment.hasPreviewDataUrl),
    hasDataUrl: Boolean(safe.hasDataUrl || attachment.hasDataUrl),
    hasPreviewUrl: Boolean(safe.hasPreviewUrl || attachment.hasPreviewUrl),
    hasUrl: Boolean(safe.hasUrl || attachment.hasUrl),
    selectedSourceKind: clean(safe.selectedSourceKind || attachment.selectedSourceKind),
    selectedSourceLength: Number(safe.selectedSourceLength || attachment.selectedSourceLength || 0) || 0,
    fileName: clean(safe.fileName || attachment.fileName),
    mimeType: clean(safe.mimeType || attachment.mimeType),
    status: clean(safe.status),
    error: clean(safe.error),
    attachment: {
      hasUrl: Boolean(attachment.hasUrl),
      hasPreviewUrl: Boolean(attachment.hasPreviewUrl),
      hasDataUrl: Boolean(attachment.hasDataUrl),
      mimeType: clean(attachment.mimeType || safe.mimeType),
      fileName: clean(attachment.fileName || safe.fileName)
    }
  };
  state.commentTrace.push(item);
  if (state.commentTrace.length > 20) state.commentTrace = state.commentTrace.slice(-20);
}
function clearPendingPhoto() {
  if (state.pendingPhoto && state.pendingPhoto.previewUrl) {
    try { URL.revokeObjectURL(state.pendingPhoto.previewUrl); } catch (_) {}
  }
  state.pendingPhoto = null;
  if (refs.attachmentInput) refs.attachmentInput.value = '';
  renderAttachmentPreview();
}
function renderAttachmentPreview() {
  if (!refs.attachmentPreview) return;
  const pending = state.pendingPhoto;
  if (!pending || !pending.previewUrl) {
    refs.attachmentPreview.innerHTML = '';
    refs.attachmentPreview.classList.add('hidden');
    return;
  }
  refs.attachmentPreview.classList.remove('hidden');
  refs.attachmentPreview.innerHTML = '<div class="composer-photo-preview"><img src="' + escapeHtml(pending.previewUrl) + '" alt="' + escapeHtml(pending.fileName || 'photo') + '" loading="lazy"><button class="composer-photo-remove" type="button" aria-label="Убрать фото">×</button></div>';
  const removeBtn = refs.attachmentPreview.querySelector('.composer-photo-remove');
  if (removeBtn) removeBtn.addEventListener('click', () => clearPendingPhoto(), { once: true });
}
function handleAttachmentChange() {
  const file = refs.attachmentInput && refs.attachmentInput.files && refs.attachmentInput.files[0];
  if (!file) return;
  const mimeType = clean(file.type || '');
  const fileName = clean(file.name || 'photo');
  const originalSize = Number(file.size || 0) || 0;
  pushCommentTrace('attachment_pick', { type: 'file', mimeType, fileName, originalSize });
  if (!/^image\//i.test(mimeType)) {
    clearPendingPhoto();
    setInlineStatus('Пока в комментариях можно прикреплять только фото. Видео и файлы сейчас не поддерживаются.', true);
    pushCommentTrace('attachment_reject', { type: 'file', mimeType, fileName, originalSize, error: 'only_image_supported' });
    return;
  }
  const previewUrl = URL.createObjectURL(file);
  const pending = { file, mimeType: mimeType || 'image/jpeg', fileName, size: originalSize, originalSize, previewUrl, status: 'compressing', compressed: null, compressPromise: null };
  state.pendingPhoto = pending;
  renderAttachmentPreview();
  setInlineStatus('Готовим фото…', false);
  const startedAt = Date.now();
  pushCommentTrace('attachment_compress_start', { type: 'image', mimeType: pending.mimeType, fileName, originalSize });
  pending.compressPromise = compressImageForComment(file).then((packed) => {
    if (state.pendingPhoto !== pending) return packed;
    pending.compressed = packed;
    pending.status = 'compressed';
    setInlineStatus('', false);
    pushCommentTrace('attachment_compress_ok', { type: 'image', mimeType: packed.mimeType, fileName: packed.fileName, originalSize, compressedSize: packed.size, width: packed.width, height: packed.height, quality: packed.quality, maxSide: packed.maxSide, durationMs: Date.now() - startedAt });
    emitTraceEvent('attachment_compress_ok', { originalSize, compressedSize: packed.size, width: packed.width, height: packed.height, quality: packed.quality, maxSide: packed.maxSide, durationMs: Date.now() - startedAt });
    return packed;
  }).catch((error) => {
    if (state.pendingPhoto === pending) {
      pending.status = 'error';
      setInlineStatus('Не удалось обработать фото. Попробуйте другое изображение.', true);
    }
    pushCommentTrace('attachment_compress_error', { type: 'image', mimeType: pending.mimeType, fileName: pending.fileName, originalSize, error: clean(error && error.message) || 'compress_failed', durationMs: Date.now() - startedAt });
    emitTraceEvent('attachment_compress_error', { error: clean(error && error.message) || 'compress_failed', durationMs: Date.now() - startedAt });
    throw error;
  });
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(clean(reader.result));
    reader.onerror = () => reject(new Error('file_reader_failed'));
    reader.readAsDataURL(file);
  });
}

function loadImageElementFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_decode_failed'));
    img.src = dataUrl;
  });
}
async function compressImageForComment(file) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const qualitySteps = [0.62, 0.6, 0.58, 0.55];
  const maxSideSteps = [720, 680, 640, 600];
  const targetMin = 60 * 1024;
  const targetMax = 220 * 1024;
  const hardMax = 280 * 1024;
  let width = 0; let height = 0;
  let drawSource = null;
  if (window.createImageBitmap) {
    try { drawSource = await createImageBitmap(file); width = drawSource.width || 0; height = drawSource.height || 0; } catch (_) {}
  }
  if (!drawSource) {
    const img = await loadImageElementFromDataUrl(sourceDataUrl);
    drawSource = img; width = img.naturalWidth || img.width || 0; height = img.naturalHeight || img.height || 0;
  }
  if (!width || !height) throw new Error('image_size_unknown');
  let fallbackPacked = null;
  for (const maxSide of maxSideSteps) {
    const longSide = Math.max(width, height);
    const ratio = longSide > maxSide ? (maxSide / longSide) : 1;
    const targetW = Math.max(1, Math.round(width * ratio));
    const targetH = Math.max(1, Math.round(height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas_context_failed');
    ctx.drawImage(drawSource, 0, 0, targetW, targetH);
    for (const quality of qualitySteps) {
      const outDataUrl = canvas.toDataURL('image/jpeg', quality);
      const outSize = Math.floor(((outDataUrl.split(',')[1] || '').length * 3) / 4);
      const packed = { dataUrl: outDataUrl, mimeType: 'image/jpeg', size: outSize, fileName: (file.name || 'photo').replace(/\.[^/.]+$/, '') + '.jpg', compressed: true, width: targetW, height: targetH, quality, maxSide };
      if (outSize > hardMax) continue;
      fallbackPacked = packed;
      if (outSize >= targetMin && outSize <= targetMax) return packed;
      if (outSize < targetMin) return packed;
    }
  }
  if (fallbackPacked && fallbackPacked.size <= hardMax) return fallbackPacked;
  throw new Error('compress_limit_exceeded');
}
function computeCommentsFingerprint(list) {
  const safe = Array.isArray(list) ? list : [];
  return safe.map((comment) => {
    const commentCreated = clean(comment.createdAt || comment.created_at || '');
    const commentUpdated = clean(comment.updatedAt || comment.updated_at || '');
    const commentClientId = clean(comment.clientCommentId || '');
    const attachments = (Array.isArray(comment.attachments) ? comment.attachments : []).map((a) => {
      const thumb = clean(a && a.thumbDataUrl);
      const previewData = clean(a && a.previewDataUrl);
      const data = clean(a && a.dataUrl);
      const sourceKind = thumb ? 'thumbDataUrl' : (previewData ? 'previewDataUrl' : (data ? 'dataUrl' : (clean(a && a.previewUrl) ? 'previewUrl' : (clean(a && a.url) ? 'url' : (clean(a && a.posterUrl) ? 'posterUrl' : '')))));
      const sourceLength = thumb.length || previewData.length || data.length || clean(a && a.previewUrl).length || clean(a && a.url).length || clean(a && a.posterUrl).length || 0;
      return [
        clean(a && (a.id || a.uploadId || a.clientUploadId)),
        clean(a && a.type),
        clean(a && (a.fileName || a.name)),
        clean(a && (a.mimeType || a.mime)),
        clean(a && (a.createdAt || a.created_at || '')),
        clean(a && (a.updatedAt || a.updated_at || '')),
        clean(a && (a.clientUploadId || '')),
        sourceKind,
        sourceLength
      ].join(':');
    }).join('|');
    return [clean(comment.id), commentClientId, clean(comment.text || comment.body), attachments, commentCreated, commentUpdated].join('~');
  }).join('||');
}
function emitTraceEvent(event, payload) {
  const eventName = clean(event);
  const traceEnabled = /(?:^|[?&])(debugTrace|trace)=1(?:&|$)/.test(String(location.search || ''));
  if (!traceEnabled && (eventName === 'comment_render_skip_unchanged' || eventName === 'comment_render_apply' || eventName === 'attachment_render_missing_url')) return;
  const body = { event: eventName, payload: payload && typeof payload === 'object' ? payload : {}, runtimeVersion: RUNTIME, coreSendRuntime: CORE_SEND_RUNTIME };
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/debug/comment-trace-event', new Blob([JSON.stringify(body)], { type: 'application/json' }));
      return;
    }
  } catch (_) {}
  try {
    fetch('/api/debug/comment-trace-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
  } catch (_) {}
}
window.__ADMINKIT_COMMENT_PHOTO_EVENT__ = function(eventName, node) {
  const kind = clean(node && node.getAttribute && node.getAttribute('data-attachment-kind'));
  const src = clean(node && node.getAttribute && node.getAttribute('src'));
  if (eventName === 'attachment_img_onerror' && node && node.parentNode) {
    node.parentNode.innerHTML = '<div class="comment-attachment comment-attachment-missing">Фото недоступно</div>';
  }
  pushCommentTrace(eventName, { selectedSourceKind: kind, selectedSourceLength: src.length });
  emitTraceEvent(eventName, { selectedSourceKind: kind, selectedSourceLength: src.length });
};

async function buildPreviewOnlyAttachment() {
  if (!state.pendingPhoto || !state.pendingPhoto.file) return [];
  const pending = state.pendingPhoto;
  let packed = pending.compressed;
  if (!packed && pending.compressPromise) {
    try { packed = await pending.compressPromise; } catch (_) { throw new Error('Не удалось обработать фото. Попробуйте другое изображение.'); }
  }
  if (!packed || !packed.dataUrl) throw new Error('Не удалось отправить фото. Попробуйте ещё раз.');
  return [{
    type: 'image',
    inlineOnly: true,
    previewOnly: true,
    thumbDataUrl: packed.dataUrl,
    previewDataUrl: packed.dataUrl,
    mimeType: 'image/jpeg',
    fileName: packed.fileName || pending.fileName || 'photo.jpg',
    size: Number(packed.size || 0) || 0,
    width: Number(packed.width || 0) || 0,
    height: Number(packed.height || 0) || 0
  }];
}
function buildOpenStateUrl() {
  const q = new URLSearchParams();
  if (state.commentKey) q.set('commentKey', state.commentKey);
  if (state.handoff) q.set('handoff', state.handoff);
  if (state.channelId) q.set('channelId', state.channelId);
  if (state.postId) q.set('postId', state.postId);
  if (state.title) q.set('title', state.title);
  if (state.raw) q.set('raw', state.raw);
  q.set('appRuntime', RUNTIME);
  q.set('t', Date.now());
  return '/api/adminkit/comment-open-state?' + q.toString();
}
function loadOpenStateSync() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', buildOpenStateUrl(), false);
    xhr.setRequestHeader('Cache-Control', 'no-store');
    xhr.send(null);
    if (xhr.status >= 200 && xhr.status < 400) return JSON.parse(xhr.responseText || '{}');
    return { ok: false, error: 'http_' + xhr.status };
  } catch (error) { return { ok: false, error: String((error && error.message) || error) }; }
}
async function loadOpenStateAsync() {
  const response = await fetch(buildOpenStateUrl(), { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || ('http_' + response.status));
  return data;
}
function showMiniStart() {
  document.body && document.body.classList && document.body.classList.add('miniapp-start-mode');
  if (refs.miniAppTopbar) refs.miniAppTopbar.style.display = 'none';
  if (refs.postCard) refs.postCard.style.display = 'none';
  if (refs.commentsWrap) refs.commentsWrap.style.display = 'none';
  if (refs.commentSearchPanel) refs.commentSearchPanel.classList.add('hidden');
  const wrap = document.querySelector('.discussion-label-wrap');
  if (wrap) wrap.style.display = 'none';
  if (refs.composerCard) refs.composerCard.style.display = 'none';
  if (refs.postError) { refs.postError.textContent = ''; refs.postError.style.display = 'none'; }
  if (refs.miniAppStartCard) refs.miniAppStartCard.classList.remove('hidden');
  if (refs.miniAppStartText) refs.miniAppStartText.innerHTML = '<div class="miniapp-start-copy strong">АдминКИТ — система управления MAX</div><div class="miniapp-start-copy">Рост канала, комментарии, подарки, кнопки, модерация и статистика — в одном месте.</div><div class="miniapp-start-copy subtle">Нажмите «Приступить к работе», чтобы открыть чат с ботом.</div>';
}
function hideMiniStart() {
  document.body && document.body.classList && document.body.classList.remove('miniapp-start-mode');
  if (refs.miniAppStartCard) refs.miniAppStartCard.classList.add('hidden');
  if (refs.miniAppTopbar) refs.miniAppTopbar.style.display = 'grid';
  if (refs.postCard) refs.postCard.style.display = 'block';
  if (refs.commentsWrap) refs.commentsWrap.style.display = 'block';
  const wrap = document.querySelector('.discussion-label-wrap');
  if (wrap) wrap.style.display = 'flex';
  if (refs.composerCard) refs.composerCard.style.display = 'block';
}
function applyMeta(meta) {
  meta = meta || {};
  state.meta = meta;
  if (meta.commentKey) state.commentKey = clean(meta.commentKey);
  if (meta.channelId) state.channelId = clean(meta.channelId);
  if (meta.postId) state.postId = clean(meta.postId);
  if (meta.postTitle) state.title = clean(meta.postTitle);
  const snapshot = meta.postSnapshot || {};
  const title = clean(meta.postTitle || snapshot.title || snapshot.text || state.title || (state.postId ? ('Post ' + state.postId) : ''));
  if (refs.postTitle) refs.postTitle.textContent = title;
  if (refs.discussionLabel) refs.discussionLabel.textContent = 'Начало обсуждения';
  const banner = (meta && meta.banner) || {};
  const ctaText = clean(banner.button || banner.text) || '🐋 АдминКИТ';
  const ctaLink = clean(banner.link) || 'https://max.ru/id781310320690_bot?start=menu';
  if (refs.adminkitDiscussionLink) {
    refs.adminkitDiscussionLink.textContent = ctaText;
    refs.adminkitDiscussionLink.href = ctaLink;
    refs.adminkitDiscussionLink.target = '_blank';
    refs.adminkitDiscussionLink.rel = 'noopener noreferrer';
  }
  if (refs.postError) { refs.postError.textContent = ''; refs.postError.style.display = 'none'; }
}
function renderAttachment(attachment) {
  const type = clean(attachment && (attachment.type || attachment.kind));
  const mimeType = clean(attachment && attachment.mimeType);
  const name = clean(attachment && (attachment.name || attachment.fileName)) || 'фото';
  const candidates = [
    ['thumbDataUrl', clean(attachment && attachment.thumbDataUrl)],
    ['previewDataUrl', clean(attachment && attachment.previewDataUrl)],
    ['dataUrl', clean(attachment && attachment.dataUrl)],
    ['url', clean(attachment && attachment.url)],
    ['previewUrl', clean(attachment && attachment.previewUrl)],
    ['posterUrl', clean(attachment && attachment.posterUrl)]
  ];
  const selected = candidates.find((x) => Boolean(x[1])) || ['', ''];
  const selectedSourceKind = selected[0] || '';
  const url = selected[1] || '';
  const isImage = type === 'image' || /^image\//i.test(mimeType) || /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
  pushCommentTrace('attachment_render_source_selected', { fileName: name, mimeType, selectedSourceKind, selectedSourceLength: url.length, hasThumbDataUrl: Boolean(clean(attachment && attachment.thumbDataUrl)), hasPreviewDataUrl: Boolean(clean(attachment && attachment.previewDataUrl)), hasDataUrl: Boolean(clean(attachment && attachment.dataUrl)), hasPreviewUrl: Boolean(clean(attachment && attachment.previewUrl)), hasUrl: Boolean(clean(attachment && attachment.url)) });
  if (isImage && !url) {
    pushCommentTrace('attachment_render_missing_url', { attachment: { hasUrl: Boolean(clean(attachment && attachment.url)), hasPreviewUrl: Boolean(clean(attachment && attachment.previewUrl)), hasDataUrl: Boolean(clean(attachment && (attachment.dataUrl || attachment.previewDataUrl || attachment.thumbDataUrl))), mimeType, fileName: name, selectedSourceKind } });
    emitTraceEvent('attachment_render_missing_url', { attachment: { hasUrl: Boolean(clean(attachment && attachment.url)), hasPreviewUrl: Boolean(clean(attachment && attachment.previewUrl)), hasDataUrl: Boolean(clean(attachment && (attachment.dataUrl || attachment.previewDataUrl || attachment.thumbDataUrl))), mimeType, fileName: name, selectedSourceKind } });
    return '<div class="comment-attachment comment-attachment-missing">Фото недоступно</div>';
  }
  if (!url) return '';
  if (isImage) return '<div class="comment-attachment comment-attachment-image"><img src="' + escapeHtml(url) + '" alt="' + escapeHtml(name) + '" loading="lazy" data-attachment-kind="' + escapeHtml(selectedSourceKind || 'unknown') + '" onload="window.__ADMINKIT_COMMENT_PHOTO_EVENT__&&window.__ADMINKIT_COMMENT_PHOTO_EVENT__(\'attachment_img_onload\',this)" onerror="window.__ADMINKIT_COMMENT_PHOTO_EVENT__&&window.__ADMINKIT_COMMENT_PHOTO_EVENT__(\'attachment_img_onerror\',this)"></div>';
  return '';
}
function searchableComment(comment) {
  return normalizeSearch([
    comment && (comment.text || comment.body || ''),
    comment && (comment.userName || comment.user_name || comment.name || ''),
    comment && (comment.createdAt || comment.created_at || '')
  ].join(' '));
}
function visibleComments() {
  const query = normalizeSearch(state.searchQuery || (refs.commentSearchInput && refs.commentSearchInput.value) || '');
  if (!query) return state.comments;
  return state.comments.filter((comment) => searchableComment(comment).includes(query));
}
function renderComments(list) {
  if (Array.isArray(list)) state.comments = list;
  const all = Array.isArray(state.comments) ? state.comments : [];
  const visible = visibleComments();
  const query = normalizeSearch(state.searchQuery || '');
  if (refs.emptyState) {
    refs.emptyState.textContent = visible.length ? '' : (query ? 'Ничего не найдено' : 'Комментариев пока нет');
    refs.emptyState.style.display = visible.length ? 'none' : 'block';
  }
  if (!refs.commentsList) return;
  refs.commentsList.innerHTML = visible.map((comment) => {
    const userId = clean(comment.userId || comment.user_id || '');
    const userName = clean(comment.userName || comment.user_name || comment.name || 'Гость');
    const own = Boolean(state.currentUserId && userId && String(state.currentUserId) === String(userId));
    const text = clean(comment.text || comment.body || '');
    const time = formatTime(comment.createdAt || comment.created_at || comment.updatedAt || comment.updated_at);
    const attachments = (Array.isArray(comment.attachments) ? comment.attachments : []).map(renderAttachment).join('');
    const reply = comment.replyTo ? ('<div class="comment-reply-inline"><div class="reply-author">' + escapeHtml(clean(comment.replyTo.userName || 'автора')) + '</div><div class="reply-text">' + escapeHtml(clean(comment.replyTo.text).slice(0, 80) || 'Фото') + '</div></div>') : '';
    const reactionDetails = Array.isArray(comment.reactionDetails) ? comment.reactionDetails : [];
    const reactions = reactionDetails.length ? ('<div class="comment-reactions">' + reactionDetails.map((r) => '<button type="button" class="reaction-pill' + (r.active ? ' active' : '') + '" data-reaction-emoji="' + escapeHtml(r.emoji || '') + '">' + escapeHtml(r.emoji || '') + ' ' + escapeHtml(String(r.count || 0)) + '</button>').join('') + '</div>') : '';
    const avatarUrl = clean(comment.avatarUrl || comment.avatar_url || '');
    const avatar = own ? '' : '<div class="comment-avatar">' + (avatarUrl ? ('<img src="' + escapeHtml(avatarUrl) + '" alt="' + escapeHtml(userName) + '" loading="lazy">') : ('<span>' + escapeHtml(userName.charAt(0).toUpperCase() || 'Г') + '</span>')) + '</div>';
    const author = own ? '' : '<div class="comment-author">' + escapeHtml(userName) + '</div>';
    const ownClass = own ? ' own' : '';
    return '<div class="comment-row ' + (own ? 'own' : 'other') + '" data-comment-id="' + escapeHtml(comment.id || '') + '">' + avatar + '<div class="comment-bubble' + ownClass + '">' + author + reply + (text ? '<div class="comment-text">' + escapeHtml(text) + '</div>' : '') + attachments + reactions + '<div class="comment-time">' + escapeHtml(time) + '</div></div></div>';
  }).join('');
  if (refs.commentsCountPill) refs.commentsCountPill.textContent = query ? (visible.length + ' из ' + pluralComments(all.length)) : pluralComments(all.length);
}
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '👏'];
const MORE_REACTIONS = ['😀', '😍', '🤔', '🙏', '😡', '👎', '🎯', '💯', '🤝', '🤣'];
function findCommentById(commentId) { return (state.comments || []).find((c) => String(c.id || '') === String(commentId || '')); }
function renderReplyComposer() {
  const comment = findCommentById(state.replyToId);
  if (!refs.composerReply || !comment) { if (refs.composerReply) refs.composerReply.classList.add('hidden'); return; }
  refs.composerReply.classList.remove('hidden');
  if (refs.composerReplyName) refs.composerReplyName.textContent = clean(comment.userName || 'Гость');
  if (refs.composerReplyText) refs.composerReplyText.textContent = clean(comment.text || '').slice(0, 120) || 'Фото';
}
function closeOverlay() { emitTraceEvent('reaction_overlay_close', { commentId: state.activeCommentId || '' }); state.activeCommentId = ''; if (refs.sheetOverlay) refs.sheetOverlay.classList.add('hidden'); if (refs.commentFocusModal) refs.commentFocusModal.classList.add('hidden'); }
function openOverlay(commentId) {
  const comment = findCommentById(commentId); if (!comment) return;
  state.activeCommentId = String(commentId || '');
  emitTraceEvent('reaction_overlay_open', { commentId: state.activeCommentId });
  if (refs.focusedCommentCard) refs.focusedCommentCard.innerHTML = '<div class="comment-bubble">' + (clean(comment.text) ? '<div class="comment-text">' + escapeHtml(clean(comment.text)) + '</div>' : '<div class="comment-text">Фото</div>') + '</div>';
  if (refs.reactionBar) refs.reactionBar.innerHTML = QUICK_REACTIONS.map((e) => '<button type="button" class="reaction-pill" data-quick-reaction="' + escapeHtml(e) + '">' + escapeHtml(e) + '</button>').join('') + '<button type="button" class="reaction-pill" data-more-reactions="1">➕</button>';
  if (refs.sheetOverlay) refs.sheetOverlay.classList.remove('hidden');
  if (refs.commentFocusModal) refs.commentFocusModal.classList.remove('hidden');
}
async function toggleReaction(commentId, emoji) {
  emitTraceEvent('reaction_select_start', { commentId, emoji });
  try {
    const response = await fetch('/api/comments/reactions/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commentKey: state.commentKey, commentId, userId: outgoingUserId(), emoji }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(clean(data.error || 'reaction_toggle_failed'));
    emitTraceEvent('reaction_select_ok', { commentId, emoji });
    await refreshOpenState();
  } catch (error) { emitTraceEvent('reaction_select_error', { commentId, emoji, error: clean(error && error.message) || 'reaction_toggle_failed' }); }
}
function renderOpenState(data) {
  data = data || {};
  state.launchMode = 'comments';
  state.hasCommentIdentity = true;
  hideMiniStart();
  applyMeta(data.meta || {});
  const list = Array.isArray(data.comments) ? data.comments : [];
  const optimistic = (Array.isArray(state.comments) ? state.comments : []).filter((c) => c && c.clientCommentId && c.sendStatus !== 'error' && !list.some((srv) => String(srv.id||'')===String(c.id||'')));
  const mergedList = list.concat(optimistic);
  const count = Number(data.commentsCount || mergedList.length || 0) || 0;
  state.commentsCount = count;
  const fingerprint = computeCommentsFingerprint(mergedList);
  if (fingerprint === state.lastRenderFingerprint) {
    pushCommentTrace('comment_render_skip_unchanged', { status: 'unchanged', uploadSize: mergedList.length });
    emitTraceEvent('comment_render_skip_unchanged', { size: mergedList.length });
  } else {
    state.lastRenderFingerprint = fingerprint;
    renderComments(mergedList);
    pushCommentTrace('comment_render_apply', { status: 'applied', uploadSize: mergedList.length });
    emitTraceEvent('comment_render_apply', { size: mergedList.length });
  }
  if (refs.commentsCountPill && !state.searchQuery) refs.commentsCountPill.textContent = pluralComments(count);
}
async function refreshOpenState() {
  if (state.launchMode !== 'comments' || state.requestInFlight) return;
  state.requestInFlight = true;
  try { renderOpenState(await loadOpenStateAsync()); } catch (_) {}
  finally { state.requestInFlight = false; }
}
function outgoingUserName() { return clean(state.currentUserName || (refs.nameInput && refs.nameInput.value) || 'Гость'); }
function outgoingUserId() { return clean(state.currentUserId || (refs.nameInput && refs.nameInput.value) || 'guest'); }


function autoResizeComposerInput() {
  if (!refs.commentInput) return;
  refs.commentInput.style.height = 'auto';
  const lh = 22;
  const minH = lh + 4;
  const maxH = lh * 4 + 8;
  const next = Math.max(minH, Math.min(maxH, refs.commentInput.scrollHeight || minH));
  refs.commentInput.style.height = next + 'px';
  refs.commentInput.style.overflowY = (refs.commentInput.scrollHeight > maxH) ? 'auto' : 'hidden';
  emitTraceEvent('composer_textarea_resize', { height: next });
  syncCommentsBottomInset();
}

function isNearBottom() {
  const el = refs.commentsWrap;
  if (!el) return true;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < 160;
}
function scrollToBottom(force) {
  const el = refs.commentsWrap;
  if (!el) return;
  if (!force && !isNearBottom()) return;
  el.scrollTop = el.scrollHeight; emitTraceEvent('comments_scroll_to_bottom', { force: Boolean(force) });
}
function syncCommentsBottomInset() {
  const list = refs.commentsList; const composer = refs.composerCard;
  if (!list || !composer) return;
  const h = composer.offsetHeight || 0;
  list.style.paddingBottom = (h + 20) + 'px';
  emitTraceEvent('composer_anchor_fix', { composerHeight: h });
}
function hasRenderablePhotoSource(att) {
  const a = att || {};
  return Boolean(clean(a.thumbDataUrl || a.previewDataUrl || a.dataUrl || a.previewUrl || a.url || a.posterUrl));
}
function makeSendFingerprint(text) {
  return [state.commentKey || '', outgoingUserId() || 'guest', text || '', state.pendingPhoto ? 'has_photo' : 'no_photo'].join('|');
}
function beginTextSend(fingerprint) {
  const key = clean(fingerprint);
  if (!key) return false;
  if (state.textSendInFlight[key]) return false;
  state.textSendInFlight[key] = Date.now();
  return true;
}
}
function endTextSend(fingerprint) {
  const key = clean(fingerprint);
  if (key && state.textSendInFlight) delete state.textSendInFlight[key];
}
async function sendComment() {
  const text = clean(refs.commentInput && refs.commentInput.value);
  const hasPhoto = Boolean(state.pendingPhoto && state.pendingPhoto.file);
  const textOnly = !hasPhoto;
  if ((!text && !hasPhoto) || !state.commentKey) return;
  const fingerprint = makeSendFingerprint(text);
  if (state.sendInFlight) return;
  if (hasPhoto) {
    if (fingerprint === state.lastSendFingerprint && Date.now() - Number(state.lastSendStartedAt || 0) < 8000) return;
    state.sendInFlight = true;
    setInlineStatus('Отправляем…', false);
    setSendingUi(true);
  } else {
    if (!beginTextSend(fingerprint)) return;
    setInlineStatus('', false);
  }
  state.lastSendFingerprint = fingerprint;
  state.lastSendStartedAt = Date.now();
  const optimisticCommentId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const preview = clean(state.pendingPhoto && ((state.pendingPhoto.compressed && state.pendingPhoto.compressed.dataUrl) || state.pendingPhoto.previewUrl));
  const optimisticAttachments = hasPhoto ? [{ type: 'image', mimeType: clean(state.pendingPhoto && state.pendingPhoto.mimeType) || 'image/jpeg', fileName: clean(state.pendingPhoto && state.pendingPhoto.fileName) || 'photo.jpg', thumbDataUrl: preview }] : [];
  const optimisticComment = { id: optimisticCommentId, clientCommentId: optimisticCommentId, userId: outgoingUserId(), userName: outgoingUserName(), text, own: true, createdAt: new Date().toISOString(), sendStatus: 'sending', attachments: optimisticAttachments };
  state.comments = (state.comments || []).concat([optimisticComment]);
  pushCommentTrace('optimistic_comment_inserted', { clientCommentId: optimisticCommentId, status: 'sending' });
  if (textOnly) pushCommentTrace('text_comment_send_queued', { clientCommentId: optimisticCommentId, status: 'queued' });
  emitTraceEvent('optimistic_comment_inserted', { clientCommentId: optimisticCommentId, status: 'sending' });
  if (refs.commentInput) refs.commentInput.value = '';
  autoResizeComposerInput();
  renderComments();
  scrollToBottom(true);
  try {
    const attachments = hasPhoto ? await buildPreviewOnlyAttachment() : [];
    emitTraceEvent('comment_create_start', { size: attachments.length, replyToId: state.replyToId || '' });
    pushCommentTrace('comment_create_start', { type: attachments.length ? 'comment_with_photo' : 'comment_text', commentKey: state.commentKey, size: attachments.length });
    const response = await fetch('/api/comments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentKey: state.commentKey, userId: outgoingUserId(), userName: outgoingUserName(), avatarUrl: state.currentUserAvatarUrl || '', text, replyToId: state.replyToId || '', attachments })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      state.comments = (state.comments || []).map((x) => (x.clientCommentId === optimisticCommentId || x.id === optimisticCommentId) ? Object.assign({}, x, { sendStatus: 'error' }) : x);
      renderComments();
      scrollToBottom(true);
      pushCommentTrace('comment_create_error', { type: attachments.length ? 'comment_with_photo' : 'comment_text', commentKey: state.commentKey, size: attachments.length, error: clean(data.error || data.message || ('http_' + response.status)) });
      setInlineStatus(clean(data.message || data.userMessage || data.friendlyMessage) || 'Комментарий не опубликован: сработала модерация или правила обсуждения.', true);
      return;
    }
    emitTraceEvent('comment_create_ok', { size: attachments.length });
    pushCommentTrace('comment_create_ok', { type: attachments.length ? 'comment_with_photo' : 'comment_text', commentKey: state.commentKey, size: attachments.length });
    if (data && data.comment) {
      const mergedComment = Object.assign({}, data.comment || {});
      const serverAtt = Array.isArray(mergedComment.attachments) ? mergedComment.attachments : [];
      const localOptimistic = (state.comments || []).find((x) => x && (x.clientCommentId === optimisticCommentId || x.id === optimisticCommentId));
      const localAtt = Array.isArray(localOptimistic && localOptimistic.attachments) ? localOptimistic.attachments : [];
      mergedComment.attachments = serverAtt.map((att, idx) => {
        const fallback = localAtt[idx] || {};
        if (!hasRenderablePhotoSource(att)) return Object.assign({}, att, { thumbDataUrl: clean(fallback.thumbDataUrl), previewDataUrl: clean(fallback.previewDataUrl || fallback.thumbDataUrl), dataUrl: clean(fallback.dataUrl) });
        if (clean(fallback.thumbDataUrl) && !clean(att.thumbDataUrl)) return Object.assign({}, att, { thumbDataUrl: clean(fallback.thumbDataUrl), previewDataUrl: clean(att.previewDataUrl || fallback.previewDataUrl || fallback.thumbDataUrl) });
        return att;
      });
      state.comments = (state.comments || []).map((x) => (x.clientCommentId === optimisticCommentId || x.id === optimisticCommentId) ? mergedComment : x);
      pushCommentTrace('optimistic_comment_replaced', { clientCommentId: optimisticCommentId, status: 'ok' });
      if (textOnly) pushCommentTrace('text_comment_send_released', { clientCommentId: optimisticCommentId, status: 'ok' });
      emitTraceEvent('optimistic_comment_replaced', { clientCommentId: optimisticCommentId, status: 'ok' });
      renderComments();
      scrollToBottom(true);
    }
    if (hasPhoto) clearPendingPhoto();
    state.replyToId = '';
    renderReplyComposer();
    state.lastSendFingerprint = '';
    setInlineStatus('', false);
    refreshOpenState();
  } catch (error) {
    const message = clean(error && error.message);
    state.comments = (state.comments || []).map((x) => (x.clientCommentId === optimisticCommentId || x.id === optimisticCommentId) ? Object.assign({}, x, { sendStatus: 'error' }) : x);
    renderComments();
    scrollToBottom(true);
    emitTraceEvent('comment_create_error', { clientCommentId: optimisticCommentId, error: message || 'comment_create_failed' });
    if (message === 'Не удалось отправить фото. Попробуйте ещё раз.') setInlineStatus(message, true);
    else setInlineStatus('Не удалось отправить комментарий. Попробуйте ещё раз.', true);
  }
  finally {
    if (hasPhoto) {
      state.sendInFlight = false;
      setSendingUi(false);
    } else {
      endTextSend(fingerprint);
    }
  }
}
function openMaxLink(target) {
  const app = getPossibleWebApps()[0];
  try { if (app && app.openMaxLink) app.openMaxLink(target); else location.href = target; } catch (_) { location.href = target; }
}
function closeSearch() {
  state.searchOpen = false;
  state.searchQuery = '';
  if (refs.commentSearchInput) refs.commentSearchInput.value = '';
  if (refs.commentSearchPanel) refs.commentSearchPanel.classList.add('hidden');
  if (refs.searchBtn) refs.searchBtn.setAttribute('aria-pressed', 'false');
  renderComments();
}
function openSearch() {
  state.searchOpen = true;
  if (refs.commentSearchPanel) refs.commentSearchPanel.classList.remove('hidden');
  if (refs.searchBtn) refs.searchBtn.setAttribute('aria-pressed', 'true');
  setTimeout(() => { try { refs.commentSearchInput && refs.commentSearchInput.focus(); } catch (_) {} }, 30);
}
function toggleSearch() { state.searchOpen ? closeSearch() : openSearch(); }
function closeMiniApp() {
  if (state.searchOpen) { closeSearch(); return; }
  for (const app of getPossibleWebApps()) {
    for (const method of ['close', 'closeWebApp', 'closeMiniApp']) {
      try { if (app && typeof app[method] === 'function') { app[method](); return; } } catch (_) {}
    }
  }
  try { window.parent && window.parent !== window && window.parent.postMessage({ type: 'web_app_close', source: 'adminkit' }, '*'); } catch (_) {}
  try { if (history.length > 1) { history.back(); return; } } catch (_) {}
  try { window.close(); return; } catch (_) {}
  location.href = 'https://max.ru/id781310320690_biz';
}
function bindEvents() {
  if (refs.sendBtn) refs.sendBtn.addEventListener('click', sendComment);
  if (refs.commentInput) { refs.commentInput.addEventListener('input', autoResizeComposerInput); emitTraceEvent('composer_input_attrs_apply', { autocorrect: refs.commentInput.autocorrect, autocapitalize: refs.commentInput.autocapitalize, spellcheck: refs.commentInput.spellcheck, enterkeyhint: refs.commentInput.enterKeyHint || '' }); refs.commentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }); }
  if (refs.backBtn) refs.backBtn.addEventListener('click', closeMiniApp);
  if (refs.searchBtn) refs.searchBtn.addEventListener('click', toggleSearch);
  if (refs.commentSearchInput) refs.commentSearchInput.addEventListener('input', () => { state.searchQuery = clean(refs.commentSearchInput.value); renderComments(); });
  if (refs.commentSearchClear) refs.commentSearchClear.addEventListener('click', closeSearch);
  if (refs.attachBtn && refs.attachmentInput) refs.attachBtn.addEventListener('click', () => refs.attachmentInput.click());
  if (refs.attachmentInput) refs.attachmentInput.addEventListener('change', handleAttachmentChange);
  if (refs.commentsList) refs.commentsList.addEventListener('load', (e) => { if (e && e.target && e.target.tagName === 'IMG') scrollToBottom(false); }, true);
  if (refs.commentsList) refs.commentsList.addEventListener('click', (e) => {
    const row = e.target && e.target.closest ? e.target.closest('.comment-row') : null;
    if (!row) return;
    const reactionBtn = e.target && e.target.closest ? e.target.closest('[data-reaction-emoji]') : null;
    if (reactionBtn) { e.preventDefault(); toggleReaction(clean(row.getAttribute('data-comment-id')), clean(reactionBtn.getAttribute('data-reaction-emoji'))); return; }
    openOverlay(clean(row.getAttribute('data-comment-id')));
  });
  if (refs.sheetOverlay) refs.sheetOverlay.addEventListener('click', closeOverlay);
  if (refs.actionSheet) refs.actionSheet.addEventListener('click', async (e) => {
    const action = clean(e.target && e.target.getAttribute && e.target.getAttribute('data-action'));
    const commentId = state.activeCommentId;
    if (!action) return;
    if (action === 'close') { closeOverlay(); return; }
    if (action === 'reply') { state.replyToId = commentId; renderReplyComposer(); emitTraceEvent('reply_start', { commentId }); closeOverlay(); }
    if (action === 'copy') { const c = findCommentById(commentId); try { await navigator.clipboard.writeText(clean(c && c.text)); } catch (_) {} closeOverlay(); }
  });
  if (refs.reactionBar) refs.reactionBar.addEventListener('click', (e) => {
    const more = clean(e.target && e.target.getAttribute && e.target.getAttribute('data-more-reactions'));
    if (more && refs.reactionBar) {
      refs.reactionBar.innerHTML = MORE_REACTIONS.map((em) => '<button type="button" class="reaction-pill" data-quick-reaction="' + escapeHtml(em) + '">' + escapeHtml(em) + '</button>').join('');
      return;
    }
    const emoji = clean(e.target && e.target.getAttribute && e.target.getAttribute('data-quick-reaction')); if (!emoji || !state.activeCommentId) return; toggleReaction(state.activeCommentId, emoji); closeOverlay();
  });
  if (refs.composerReplyClose) refs.composerReplyClose.addEventListener('click', () => { state.replyToId = ''; renderReplyComposer(); emitTraceEvent('reply_cancel', {}); });
  if (window.ResizeObserver && refs.composerCard) { const ro = new ResizeObserver(() => { syncCommentsBottomInset(); scrollToBottom(false); }); ro.observe(refs.composerCard); }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { emitTraceEvent('visual_viewport_resize', { height: window.visualViewport.height || 0 }); syncCommentsBottomInset(); scrollToBottom(true); });
  if (refs.miniAppStartWorkBtn) refs.miniAppStartWorkBtn.addEventListener('click', () => openMaxLink('https://max.ru/id781310320690_bot?start=menu'));
  if (refs.miniAppCommunityBtn) refs.miniAppCommunityBtn.addEventListener('click', () => openMaxLink('https://max.ru/id781310320690_biz'));
  const scrollHost = refs.commentsWrap;
  if (scrollHost) {
    scrollHost.style.overscrollBehavior = 'contain';
    document.body.style.overscrollBehavior = 'none';
    emitTraceEvent('overscroll_guard_apply', { target: 'commentsWrap' });
  }
}
function showDiscussionError() {
  hideMiniStart();
  applyMeta({ postTitle: state.title || (state.postId ? ('Post ' + state.postId) : '') });
  renderComments([]);
  if (refs.commentsCountPill) refs.commentsCountPill.textContent = '0 комментариев';
  if (refs.postError) {
    refs.postError.textContent = 'Не удалось определить пост. Обновите экран.';
    refs.postError.style.display = 'block';
  }
}
function boot() {
  initBridgeUi();
  bindEvents();
  if (state.currentUserName && refs.nameInput) { refs.nameInput.value = state.currentUserName; refs.nameInput.readOnly = true; refs.nameInput.style.display = 'none'; }
  if (state.currentUserAvatarUrl && refs.composerAvatar) { refs.composerAvatar.src = state.currentUserAvatarUrl; refs.composerAvatar.style.display = 'block'; if (refs.composerAvatarFallback) refs.composerAvatarFallback.style.display = 'none'; }

  const initial = loadOpenStateSync();
  window.__ADMINKIT_CC7_5_55_INITIAL__ = initial;
  window.__ADMINKIT_CC7_5_53_INITIAL__ = initial;
  window.__ADMINKIT_CC7_5_47_INITIAL__ = initial;
  window.__ADMINKIT_CC7_5_6_INITIAL__ = initial;
  window.__ADMINKIT_CC7_5_3_INITIAL__ = initial;
  window.__ADMINKIT_CC7_2_INITIAL__ = initial;
  syncCommentsBottomInset();
  if (initial && initial.ok && initial.meta) {
    renderOpenState(initial);
    state.pollTimer = setInterval(refreshOpenState, 5000);
    return;
  }

  if (state.hasCommentIdentity || state.commentKey || state.handoff || state.channelId || state.postId || state.title) {
    showDiscussionError();
    state.pollTimer = setInterval(refreshOpenState, 5000);
    return;
  }

  showMiniStart();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();
