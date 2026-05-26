'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PACK_ID = 'adminkit_whales_v1';
const DEFAULT_MANIFEST_PATH = path.join(__dirname, '..', 'public', 'stickers', 'adminkit', 'v1', 'manifest.json');
const RUNTIME_TARGET = 'CC8.2.0-ADMINKIT-STICKERS-COMMENTS';

let cachedManifest = null;
let cachedManifestPath = '';

function clean(value) {
  return String(value || '').trim();
}

function envEnabled() {
  return clean(process.env.ADMINKIT_STICKERS_ENABLED) === '1';
}

function strictTrue(value) {
  return value === true;
}

function splitCsv(value) {
  return clean(value)
    .split(',')
    .map(clean)
    .filter(Boolean);
}

function allowedPacks() {
  const packs = splitCsv(process.env.ADMINKIT_STICKERS_PACKS);
  return packs.length ? packs : [DEFAULT_PACK_ID];
}

function packAllowed(packId = DEFAULT_PACK_ID) {
  return allowedPacks().includes(clean(packId));
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
    assetBasePath: clean(manifest.assetBasePath || '/public/stickers/adminkit/v1'),
    stickers: stickers
      .map((item) => ({
        id: clean(item.id),
        title: clean(item.title),
        emoji: clean(item.emoji),
        file: clean(item.file),
        fallbackFile: clean(item.fallbackFile),
        dataUri: clean(item.dataUri),
        alt: clean(item.alt),
        tags: Array.isArray(item.tags) ? item.tags.map(clean).filter(Boolean) : []
      }))
      .filter((item) => item.id && (item.file || item.dataUri))
  };
  normalized.byId = Object.fromEntries(normalized.stickers.map((item) => [item.id, item]));
  return normalized;
}

function listStickers(options = {}) {
  const includeDisabled = strictTrue(options.includeDisabled);
  if (!envEnabled() && !includeDisabled) return [];
  const manifest = readManifest(options.manifestPath);
  if (!packAllowed(manifest.packId)) return [];
  return manifest.stickers.map((item) => publicSticker(item, manifest));
}

function publicSticker(item = {}, manifest = readManifest()) {
  const base = clean(manifest.assetBasePath).replace(/\/$/, '');
  const url = item.dataUri || (item.file ? `${base}/${item.file}` : '');
  const fallbackUrl = item.fallbackFile ? `${base}/${item.fallbackFile}` : url;
  return {
    id: item.id,
    packId: manifest.packId,
    title: item.title,
    emoji: item.emoji,
    alt: item.alt,
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    url,
    fallbackUrl
  };
}

function getSticker(packId = DEFAULT_PACK_ID, stickerId = '', options = {}) {
  const requestedPackId = clean(packId) || DEFAULT_PACK_ID;
  const allowDisabled = strictTrue(options.allowDisabled);
  if (!envEnabled() && !allowDisabled) return null;
  if (!packAllowed(requestedPackId)) return null;
  const manifest = readManifest(options.manifestPath);
  if (requestedPackId !== manifest.packId) return null;
  const item = manifest.byId[clean(stickerId)];
  return item ? publicSticker(item, manifest) : null;
}

function validateSticker(packId = DEFAULT_PACK_ID, stickerId = '', options = {}) {
  const allowDisabled = strictTrue(options.allowDisabled);
  if (!envEnabled() && !allowDisabled) {
    return { ok: false, error: 'stickers_disabled' };
  }
  if (!packAllowed(clean(packId) || DEFAULT_PACK_ID)) {
    return { ok: false, error: 'sticker_pack_not_allowed' };
  }
  const sticker = getSticker(packId, stickerId, { ...options, allowDisabled });
  if (!sticker) return { ok: false, error: 'sticker_not_allowed' };
  return { ok: true, sticker };
}

function makeStickerCommentPayload({ packId = DEFAULT_PACK_ID, stickerId = '', tenantKey = '', channelId = '', postId = '', commentKey = '', authorUserId = '' } = {}, options = {}) {
  const check = validateSticker(packId, stickerId, options);
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
      runtimeVersion: RUNTIME_TARGET
    },
    sticker: check.sticker
  };
}

function audit() {
  const enabled = envEnabled();
  if (!enabled) {
    return {
      stickersFoundation: true,
      stickersEnabled: false,
      manifestOk: null,
      manifestLoaded: false,
      stickersTotal: 0,
      allowedPacks: allowedPacks(),
      runtimeTarget: RUNTIME_TARGET
    };
  }
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
      stickersEnabled: enabled,
      manifestOk: false,
      manifestLoaded: false,
      allowedPacks: allowedPacks(),
      error: clean(error && error.message || error),
      runtimeTarget: RUNTIME_TARGET
    };
  }
  return {
    stickersFoundation: true,
    stickersEnabled: enabled,
    manifestOk,
    manifestLoaded: true,
    packId: manifest.packId,
    packAllowed: packAllowed(manifest.packId),
    allowedPacks: allowedPacks(),
    stickersTotal,
    assetBasePath: manifest.assetBasePath,
    runtimeTarget: clean(manifest.runtimeTarget || RUNTIME_TARGET)
  };
}

module.exports = {
  DEFAULT_PACK_ID,
  DEFAULT_MANIFEST_PATH,
  RUNTIME_TARGET,
  envEnabled,
  strictTrue,
  allowedPacks,
  packAllowed,
  readManifest,
  listStickers,
  getSticker,
  validateSticker,
  makeStickerCommentPayload,
  audit
};
