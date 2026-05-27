'use strict';

const RUNTIME = 'PR85-DEBUG-STORE-SANITIZER';
const MODERATION_LOG_LIMIT = 50;
const LARGE_STRING_LIMIT = 2048;
const INLINE_KEY_RE = /dataurl|data_url|thumbdataurl|previewdataurl|base64|previewdata|localurl|localonly|rawdata|blob|imagebase64/i;
const STABLE_PAYLOAD_KEYS = ['token', 'url', 'download_url', 'link', 'file_id', 'image_id', 'photo_id', 'video_id', 'audio_id', 'document_id'];

function isInlineString(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^(data|blob):/i.test(text)) return true;
  return text.length > LARGE_STRING_LIMIT && /^[A-Za-z0-9+/=]+$/.test(text.slice(0, 256));
}

function sanitizeString(value = '', { marker = false } = {}) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (isInlineString(text)) return marker ? '[removed:inline-data]' : '';
  return text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, marker ? '[removed:inline-image]' : '');
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function cloneJson(value) {
  try { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; } catch { return value; }
}

function sanitizeInlineDeep(value, { marker = false, depth = 12 } = {}) {
  if (depth <= 0) return marker ? '[truncated]' : undefined;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value, { marker });
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeInlineDeep(item, { marker, depth: depth - 1 })).filter((item) => item !== undefined);
  if (typeof value !== 'object') return sanitizeString(value, { marker });
  const out = {};
  Object.entries(value).forEach(([key, raw]) => {
    if (INLINE_KEY_RE.test(key)) {
      if (raw) out[key] = marker ? '[removed:inline-data]' : '';
      return;
    }
    const cleaned = sanitizeInlineDeep(raw, { marker, depth: depth - 1 });
    if (cleaned !== undefined) out[key] = cleaned;
  });
  return out;
}

function sanitizePayloadForStorage(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  STABLE_PAYLOAD_KEYS.forEach((key) => {
    if (source[key] === undefined || source[key] === null) return;
    const cleaned = sanitizeString(source[key]);
    if (cleaned) out[key] = cleaned;
  });
  if (source.photos && typeof source.photos === 'object') {
    const photos = {};
    Object.entries(source.photos).forEach(([key, value]) => {
      const cleanKey = String(key || '').slice(0, 120);
      const cleanValue = sanitizeString(value);
      if (cleanKey && cleanValue) photos[cleanKey] = cleanValue;
    });
    if (Object.keys(photos).length) out.photos = photos;
  }
  return out;
}

function sanitizeModerationAttachment(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const payloadSource = source.payload && typeof source.payload === 'object' ? source.payload : {};
  const payload = sanitizePayloadForStorage(payloadSource);
  const url = sanitizeString(source.url || source.download_url || source.link || payload.url || payload.download_url || payload.link || '');
  const previewUrl = sanitizeString(source.previewUrl || source.preview_url || source.localPreviewUrl || '');
  const posterUrl = sanitizeString(source.posterUrl || source.poster_url || '');
  const rawUrl = sanitizeString(source.rawUrl || source.raw_url || '');
  const rawType = String(source.type || source.kind || source.attachment_type || 'file').trim().toLowerCase();
  const type = ['image', 'video', 'audio', 'file'].includes(rawType) ? rawType : 'file';
  const uploadId = sanitizeString(source.uploadId || source.clientUploadId || source.client_upload_id || '').slice(0, 180);
  const stableId = sanitizeString(source.id || uploadId || payload.token || payload.file_id || payload.image_id || payload.photo_id || '').slice(0, 180);
  const item = {
    id: stableId,
    type,
    name: sanitizeString(source.name || source.fileName || source.filename || payload.name || payload.file_name || payload.filename || 'Вложение').slice(0, 180),
    mime: sanitizeString(source.mime || source.mimeType || source.mime_type || payload.mime || payload.mime_type || '').slice(0, 120),
    size: safeNumber(source.size || payload.size || payload.file_size),
    url,
    previewUrl,
    posterUrl,
    payload,
    native: Boolean(source.native || Object.keys(payload).length),
    storage: sanitizeString(source.storage || '').slice(0, 60),
    uploadId,
    clientUploadId: sanitizeString(source.clientUploadId || source.client_upload_id || uploadId || '').slice(0, 180),
    rawUrl,
    processing: Boolean(source.processing) || String(source.status || '') === 'processing',
    status: sanitizeString(source.status || '').slice(0, 40),
    transcodeError: sanitizeString(source.transcodeError || '').slice(0, 220)
  };
  Object.keys(item).forEach((key) => {
    if (item[key] === '' || item[key] === undefined || (key === 'payload' && !Object.keys(payload).length)) delete item[key];
  });
  item.inlineOnly = Boolean(source.inlineOnly || source.dataUrl || source.base64 || source.thumbDataUrl || source.previewDataUrl || source.data_url || source.thumb_data_url || source.preview_data_url);
  item.inlinePayloadStripped = item.inlineOnly;
  return item;
}

function sanitizeModerationLog(entry = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const item = sanitizeInlineDeep(source, { marker: false, depth: 8 }) || {};
  if (Array.isArray(source.attachments)) {
    item.attachments = source.attachments.map(sanitizeModerationAttachment).slice(0, 10);
    item.attachmentCount = source.attachments.length || safeNumber(source.attachmentCount || item.attachmentCount);
  } else if (source.attachmentCount !== undefined || item.attachmentCount !== undefined) {
    item.attachmentCount = safeNumber(source.attachmentCount || item.attachmentCount);
  }
  item.hasInlinePayloadStripped = JSON.stringify(source).length !== JSON.stringify(item);
  return item;
}

function sanitizeUploadDiagnostic(entry = {}) {
  return sanitizeInlineDeep(entry, { marker: true, depth: 8 }) || {};
}

function sanitizeStoreObject(input = {}) {
  const clone = cloneJson(input && typeof input === 'object' ? input : {});
  const sanitized = sanitizeInlineDeep(clone, { marker: true, depth: 20 }) || {};
  if (sanitized.moderation && Array.isArray(sanitized.moderation.logs)) {
    sanitized.moderation.logs = sanitized.moderation.logs.slice(0, MODERATION_LOG_LIMIT).map(sanitizeModerationLog);
    sanitized.moderation.logLimit = MODERATION_LOG_LIMIT;
  }
  if (Array.isArray(sanitized.uploadDiagnostics)) {
    sanitized.uploadDiagnostics = sanitized.uploadDiagnostics.slice(0, 50).map(sanitizeUploadDiagnostic);
  }
  return sanitized;
}

function countsForStore(store = {}) {
  const comments = store.comments && typeof store.comments === 'object' ? store.comments : {};
  const likes = store.likes && typeof store.likes === 'object' ? store.likes : {};
  const handoffs = store.handoffs && typeof store.handoffs === 'object' ? store.handoffs : {};
  return {
    posts: Object.keys(store.posts || {}).length,
    commentThreads: Object.keys(comments).length,
    comments: Object.values(comments).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
    handoffs: Object.keys(handoffs).length,
    likes: Object.keys(likes).length,
    channels: Object.keys(store.channels || {}).length,
    moderationLogs: Array.isArray(store.moderation?.logs) ? store.moderation.logs.length : 0,
    uploadDiagnostics: Array.isArray(store.uploadDiagnostics) ? store.uploadDiagnostics.length : 0
  };
}

function compactStoreMeta(counts) {
  return {
    compact: true,
    counts,
    note: 'Full collections are exposed as top-level sanitized fields for legacy diagnostics; nested store keeps only metadata to avoid duplicate full debug shape.',
    moderationLogLimit: MODERATION_LOG_LIMIT,
    uploadDiagnosticsLimit: 50
  };
}

function sanitizeDebugSnapshot(snapshot = {}) {
  const rawStore = snapshot.store && typeof snapshot.store === 'object'
    ? snapshot.store
    : {
      posts: snapshot.posts || {},
      comments: snapshot.comments || {},
      channels: snapshot.channels || {},
      setupState: snapshot.setupState || {},
      likes: snapshot.likes || {},
      reactions: snapshot.reactions || {},
      handoffs: snapshot.handoffs || {},
      uploadDiagnostics: snapshot.uploadDiagnostics || [],
      moderation: snapshot.moderation || {},
      growth: snapshot.growth || {},
      gifts: snapshot.gifts || {}
    };
  const cleanStore = sanitizeStoreObject(rawStore);
  const counts = countsForStore(rawStore);
  return {
    ok: snapshot.ok !== false,
    meta: snapshot.meta || {},
    ...cleanStore,
    runtimeVersion: snapshot.runtimeVersion || RUNTIME,
    counts,
    store: compactStoreMeta(counts),
    debugSanitized: true,
    debugSanitizerRuntime: RUNTIME
  };
}

function trimAndPersistLogs(storeModule) {
  const logs = storeModule?.store?.moderation?.logs;
  if (!Array.isArray(logs) || logs.length <= MODERATION_LOG_LIMIT) return false;
  storeModule.store.moderation.logs = logs.slice(0, MODERATION_LOG_LIMIT);
  if (typeof storeModule.saveStore === 'function') storeModule.saveStore(storeModule.store);
  return true;
}

function cleanupPersistentStore(storeModule) {
  const store = storeModule && storeModule.store;
  if (!store || typeof store !== 'object') return { ok: false, reason: 'store_missing' };
  let changed = false;
  if (store.moderation && Array.isArray(store.moderation.logs)) {
    const before = JSON.stringify(store.moderation.logs);
    store.moderation.logs = store.moderation.logs.slice(0, MODERATION_LOG_LIMIT).map(sanitizeModerationLog);
    changed = changed || before !== JSON.stringify(store.moderation.logs);
  }
  if (Array.isArray(store.uploadDiagnostics)) {
    const before = JSON.stringify(store.uploadDiagnostics);
    store.uploadDiagnostics = store.uploadDiagnostics.slice(0, 50).map(sanitizeUploadDiagnostic);
    changed = changed || before !== JSON.stringify(store.uploadDiagnostics);
  }
  if (changed && typeof storeModule.saveStore === 'function') storeModule.saveStore(store);
  return { ok: true, changed, moderationLogLimit: MODERATION_LOG_LIMIT };
}

function install() {
  try {
    const storeModule = require('./store');
    if (storeModule.__adminkitPr85StoreSanitizerInstalled) return { ok: true, already: true, runtimeVersion: RUNTIME };
    const originalAdd = storeModule.addModerationLog;
    const originalUpdate = storeModule.updateModerationLog;
    const originalSnapshot = storeModule.getDebugSnapshot;
    if (typeof originalAdd === 'function') {
      storeModule.addModerationLog = function addModerationLogPr85(entry = {}) {
        const result = originalAdd.call(this, sanitizeModerationLog(entry));
        trimAndPersistLogs(storeModule);
        return result;
      };
    }
    if (typeof originalUpdate === 'function') {
      storeModule.updateModerationLog = function updateModerationLogPr85(logId = '', patch = {}) {
        return originalUpdate.call(this, logId, sanitizeModerationLog(patch));
      };
    }
    if (typeof originalSnapshot === 'function') {
      storeModule.getDebugSnapshot = function getDebugSnapshotPr85() {
        return sanitizeDebugSnapshot(originalSnapshot.call(this));
      };
    }
    const cleanup = cleanupPersistentStore(storeModule);
    Object.defineProperty(storeModule, '__adminkitPr85StoreSanitizerInstalled', { value: true, enumerable: false });
    return { ok: true, runtimeVersion: RUNTIME, cleanup };
  } catch (error) {
    return { ok: false, runtimeVersion: RUNTIME, error: String(error && error.message || error) };
  }
}

module.exports = {
  RUNTIME,
  install,
  sanitizeInlineDeep,
  sanitizeModerationAttachment,
  sanitizeModerationLog,
  sanitizeDebugSnapshot,
  sanitizeStoreObject,
  countsForStore,
  cleanupPersistentStore
};
