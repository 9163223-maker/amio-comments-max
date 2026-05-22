'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PACK_ID = 'adminkit_whales_v1';
const DEFAULT_MANIFEST_PATH = path.join(__dirname, '..', 'public', 'stickers', 'adminkit', 'v1', 'manifest.json');

let cachedManifest = null;
let cachedManifestPath = '';

function clean(value) {
  return String(value || '').trim();
}

function envEnabled() {
  return clean(process.env.ADMINKIT_STICKERS_ENABLED) === '1';
}

function manifestPath() {
  return clean(process.env.ADMINKIT_STICKERS_MANIFEST_PATH) || DEFAULT_MANIFEST_PATH;
}

function readManifest(filePath = manifestPath()) {
  const fullPath = path.resolve(filePath);
  if (cachedManifest && cachedManifestPath === fullPath) return cachedManifest;
  const raw = fs.readFileSync(fullPath, 'utf8');
  const parsed = JSON.parse(raw);
  cachedManifestPath = fullPath;
  cachedManifest = normalizeManifest(parsed);
  return cachedManifest;
}

function normalizeManifest(manifest = {}) {
  const packId = clean(manifest.packId) || DEFAULT_PACK_ID;
  const stickers = Array.isArray(manifest.stickers) ? manifest.stickers : [];
  const normalized = {
    ...manifest,
    packId,
    assetBasePath: clean(manifest.assetBasePath || '/stickers/adminkit/v1'),
    stickers: stickers
      .map((item) => ({
        id: clean(item.id),
        title: clean(item.title),
        emoji: clean(item.emoji),
        file: clean(item.file),
        fallbackFile: clean(item.fallbackFile),
        alt: clean(item.alt),
        tags: Array.isArray(item.tags) ? item.tags.map(clean).filter(Boolean) : []
      }))
      .filter((item) => item.id && item.file)
  };
  normalized.byId = Object.fromEntries(normalized.stickers.map((item) => [item.id, item]));
  return normalized;
}

function listStickers(options = {}) {
  const manifest = readManifest(options.manifestPath);
  const includeDisabled = Boolean(options.includeDisabled);
  if (!envEnabled() && !includeDisabled) return [];
  return manifest.stickers.map((item) => publicSticker(item, manifest));
}

function publicSticker(item = {}, manifest = readManifest()) {
  const base = clean(manifest.assetBasePath).replace(/\/$/, '');
  return {
    id: item.id,
    packId: manifest.packId,
    title: item.title,
    emoji: item.emoji,
    alt: item.alt,
    tags: item.tags || [],
    url: `${base}/${item.file}`,
    fallbackUrl: item.fallbackFile ? `${base}/${item.fallbackFile}` : ''
  };
}

function getSticker(packId = DEFAULT_PACK_ID, stickerId = '', options = {}) {
  const manifest = readManifest(options.manifestPath);
  if (clean(packId) !== manifest.packId) return null;
  const item = manifest.byId[clean(stickerId)];
  return item ? publicSticker(item, manifest) : null;
}

function validateSticker(packId = DEFAULT_PACK_ID, stickerId = '', options = {}) {
  if (!envEnabled() && !options.allowDisabled) {
    return { ok: false, error: 'stickers_disabled' };
  }
  const sticker = getSticker(packId, stickerId, options);
  if (!sticker) return { ok: false, error: 'sticker_not_allowed' };
  return { ok: true, sticker };
}

function makeStickerCommentPayload({ packId = DEFAULT_PACK_ID, stickerId = '', tenantKey = '', channelId = '', postId = '', commentKey = '', authorUserId = '' } = {}) {
  const check = validateSticker(packId, stickerId);
  if (!check.ok) return check;
  return {
    ok: true,
    comment: {
      type: 'sticker',
      packId: check.sticker.packId,
      stickerId: check.sticker.id,
      tenantKey: clean(tenantKey),
      channelId: clean(channelId),
      postId: clean(postId),
      commentKey: clean(commentKey),
      authorUserId: clean(authorUserId),
      createdAt: Date.now(),
      runtimeVersion: 'CC8.2.0-ADMINKIT-STICKERS-COMMENTS'
    },
    sticker: check.sticker
  };
}

function audit() {
  let manifest = null;
  let manifestOk = false;
  let stickersTotal = 0;
  try {
    manifest = readManifest();
    manifestOk = true;
    stickersTotal = manifest.stickers.length;
  } catch (error) {
    return {
      stickersFoundation: true,
      stickersEnabled: envEnabled(),
      manifestOk: false,
      error: clean(error && error.message || error)
    };
  }
  return {
    stickersFoundation: true,
    stickersEnabled: envEnabled(),
    manifestOk,
    packId: manifest.packId,
    stickersTotal,
    assetBasePath: manifest.assetBasePath,
    runtimeTarget: clean(manifest.runtimeTarget || 'CC8.2.0-ADMINKIT-STICKERS-COMMENTS')
  };
}

module.exports = {
  DEFAULT_PACK_ID,
  DEFAULT_MANIFEST_PATH,
  envEnabled,
  readManifest,
  listStickers,
  getSticker,
  validateSticker,
  makeStickerCommentPayload,
  audit
};
