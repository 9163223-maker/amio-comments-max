'use strict';

const RUNTIME = 'PR85-DEBUG-STORE-SANITIZER';
const MODERATION_LOG_LIMIT = 50;
const STRING_LIMIT = 500;
const LARGE_STRING_LIMIT = 2048;
const INLINE_KEY_RE = /dataurl|data_url|thumbdataurl|previewdataurl|base64|previewdata|localurl|localonly|rawdata|blob|imagebase64/i;

function cleanString(value = '', limit = STRING_LIMIT) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^(data|blob):/i.test(text)) return '[removed:inline-data]';
  if (text.length > LARGE_STRING_LIMIT && /^[A-Za-z0-9+/=]+$/.test(text.slice(0, 256))) return '[removed:base64]';
  const noInline = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '[removed:inline-image]');
  return noInline.length > limit ? noInline.slice(0, limit) : noInline;
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function sanitizePlain(value, depth = 4) {
  if (depth <= 0) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return cleanString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizePlain(item, depth - 1));
  if (typeof value !== 'object') return cleanString(value);
  const out = {};
  Object.entries(value).slice(0, 80).forEach(([key, raw]) => {
    if (INLINE_KEY_RE.test(key)) {
      out[key] = raw ? '[removed:inline-data]' : '';
      return;
    }
    out[key] = sanitizePlain(raw, depth - 1);
  });
  return out;
}

function sanitizeModerationAttachment(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const payload = source.payload && typeof source.payload === 'object' ? source.payload : {};
  const token = cleanString(source.token || payload.token || payload.file_id || payload.image_id || payload.photo_id || payload.document_id || '', 180);
  return {
    type: cleanString(source.type || source.kind || source.attachment_type || payload.type || '', 40),
    mime: cleanString(source.mime || source.mimeType || source.mime_type || payload.mime || payload.mime_type || '', 120),
    fileName: cleanString(source.fileName || source.filename || source.name || payload.file_name || payload.filename || payload.name || '', 180),
    size: safeNumber(source.size || payload.size || payload.file_size),
    width: safeNumber(source.width || payload.width),
    height: safeNumber(source.height || payload.height),
    token: token ? '[present]' : '',
    hasPreview: Boolean(source.previewUrl || source.preview_url || source.posterUrl || source.poster_url || source.thumbDataUrl || source.previewDataUrl),
    previewOnly: Boolean(source.previewOnly),
    inlineOnly: Boolean(source.inlineOnly || source.dataUrl || source.base64 || source.thumbDataUrl || source.previewDataUrl)
  };
}

function sanitizeModerationLog(entry = {}) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const item = sanitizePlain(source, 3) || {};
  const attachments = Array.isArray(source.attachments) ? source.attachments : [];
  item.attachments = attachments.map(sanitizeModerationAttachment).slice(0, 10);
  item.attachmentCount = attachments.length || safeNumber(source.attachmentCount || item.attachmentCount);
  item.hasInlinePayloadStripped = JSON.stringify(source).length !== JSON.stringify(item).length;
  return item;
}

function sanitizeUploadDiagnostic(entry = {}) {
  const item = sanitizePlain(entry, 3) || {};
  if (item.data && String(item.data).includes('[removed')) item.data = '[removed:inline-data]';
  return item;
}

function sanitizeStoreObject(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const clone = JSON.parse(JSON.stringify(source));
  if (clone.moderation && Array.isArray(clone.moderation.logs)) {
    clone.moderation.logs = clone.moderation.logs.slice(0, MODERATION_LOG_LIMIT).map(sanitizeModerationLog);
    clone.moderation.logLimit = MODERATION_LOG_LIMIT;
  }
  if (Array.isArray(clone.uploadDiagnostics)) {
    clone.uploadDiagnostics = clone.uploadDiagnostics.slice(0, 50).map(sanitizeUploadDiagnostic);
  }
  return sanitizePlain(clone, 8);
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
  return {
    ok: snapshot.ok !== false,
    runtimeVersion: snapshot.runtimeVersion || RUNTIME,
    meta: snapshot.meta || {},
    counts: countsForStore(rawStore),
    store: cleanStore,
    debugSanitized: true,
    debugSanitizerRuntime: RUNTIME
  };
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
        return originalAdd.call(this, sanitizeModerationLog(entry));
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
  sanitizePlain,
  sanitizeModerationLog,
  sanitizeDebugSnapshot,
  sanitizeStoreObject,
  countsForStore,
  cleanupPersistentStore
};
