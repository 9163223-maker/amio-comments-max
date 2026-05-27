'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const stickerPackService = require('./services/stickerPackService');
const commentService = require('./services/commentService');
const { normalizeKey, addComment } = require('./store');

const RUNTIME = 'CC8.2.0-ADMINKIT-STICKERS-COMMENTS-PR87';
const DEFAULT_PACK_ID = stickerPackService.DEFAULT_PACK_ID || 'adminkit_whales_v1';
const STATIC_ROOT = path.join(__dirname, 'public', 'stickers', 'adminkit', 'v1');

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
}
function json(res, payload, status = 200) { noCache(res); return res.status(status).json(payload); }
function isLocalStickerFile(url = '') {
  const value = clean(url);
  if (!value) return false;
  if (/^(data|blob):/i.test(value)) return false;
  if (!value.startsWith('/public/stickers/adminkit/v1/')) return false;
  const file = value.split('/').pop();
  if (!/^[a-z0-9_.-]+\.(webp|png)$/i.test(file)) return false;
  return fs.existsSync(path.join(STATIC_ROOT, file));
}
function stickerAssetReady(sticker = {}) {
  return isLocalStickerFile(sticker.url || '') && isLocalStickerFile(sticker.fallbackUrl || sticker.url || '');
}
function listReadyStickers() {
  return stickerPackService.listStickers().filter(stickerAssetReady);
}
function patchCountAsync(commentKey = '') {
  const key = normalizeKey(commentKey || '');
  if (!key) return { ok: true, scheduled: false, reason: 'commentKey_missing' };
  setImmediate(async () => {
    try {
      const dbV3PostPatcher = require('./db-v3-post-patcher');
      if (typeof dbV3PostPatcher.patchCommentsButtonByCommentKey === 'function') {
        await dbV3PostPatcher.patchCommentsButtonByCommentKey(key);
      }
    } catch (_) {}
  });
  return { ok: true, scheduled: true, reason: 'db_aware_sticker_comment_updates_channel_button_count' };
}
function install(app) {
  if (!app || app.__adminkitStickersLiveRoutesPr87) return app;
  app.__adminkitStickersLiveRoutesPr87 = true;

  app.get('/api/stickers', (req, res) => {
    const audit = stickerPackService.audit();
    const stickers = listReadyStickers();
    return json(res, {
      ok: true,
      runtimeVersion: RUNTIME,
      ...audit,
      stickersLiveComments: true,
      stickersNativeMaxProbe: false,
      assetsReady: stickers.length > 0,
      stickersTotal: stickers.length,
      stickers,
      safe: true,
      noUserUploads: true,
      noExternalUrls: true,
      noSvg: true,
      noDataUri: true
    });
  });

  app.get('/debug/stickers', (req, res) => {
    const audit = stickerPackService.audit();
    const stickers = listReadyStickers();
    return json(res, {
      ok: true,
      runtimeVersion: RUNTIME,
      ...audit,
      stickersLiveComments: true,
      assetsReady: stickers.length > 0,
      stickersTotal: stickers.length,
      stickerIds: stickers.map((item) => item.id),
      expectedFiles: ['adminkit_angry.webp', 'adminkit_ok.webp', 'adminkit_party.webp', 'adminkit_sad.webp', 'adminkit_alert.webp', 'adminkit_idea.webp', 'adminkit_love.webp', 'adminkit_happy.webp'],
      safe: true,
      noDatabaseRead: true,
      noMaxApiCall: true,
      noDataUri: true
    });
  });

  app.post('/api/comments/sticker', express.json({ limit: '32kb' }), (req, res) => {
    try {
      const commentKey = normalizeKey(req.body?.commentKey || '');
      const packId = clean(req.body?.packId || DEFAULT_PACK_ID);
      const stickerId = clean(req.body?.stickerId || '');
      const userId = clean(req.body?.userId || 'guest') || 'guest';
      const userName = clean(req.body?.userName || 'Гость') || 'Гость';
      const avatarUrl = clean(req.body?.avatarUrl || '');
      const replyToId = clean(req.body?.replyToId || '');
      if (!commentKey) return json(res, { ok: false, error: 'commentKey_required', runtimeVersion: RUNTIME }, 400);
      const dbPolicy = typeof commentService.readDbV3PolicySync === 'function' ? commentService.readDbV3PolicySync(commentKey) : null;
      if (typeof commentService.checkCommentsEnabled === 'function') commentService.checkCommentsEnabled(commentKey, dbPolicy);
      const check = stickerPackService.validateSticker(packId, stickerId);
      if (!check.ok) return json(res, { ok: false, error: check.error || 'sticker_not_allowed', runtimeVersion: RUNTIME }, 403);
      if (!stickerAssetReady(check.sticker)) return json(res, { ok: false, error: 'sticker_asset_missing', runtimeVersion: RUNTIME, stickerId }, 503);
      const comment = addComment(commentKey, {
        type: 'sticker',
        userId,
        userName,
        avatarUrl,
        text: '',
        attachments: [],
        replyToId,
        packId: check.sticker.packId,
        stickerId: check.sticker.id,
        editedAt: 0,
        runtimeVersion: RUNTIME
      });
      const patch = patchCountAsync(commentKey);
      return json(res, { ok: true, runtimeVersion: RUNTIME, comment, sticker: check.sticker, patch });
    } catch (error) {
      const status = Number(error && error.status) || (String(error && error.code || '').includes('comments_disabled') ? 403 : 400);
      return json(res, { ok: false, runtimeVersion: RUNTIME, error: clean(error && (error.code || error.publicMessage || error.message) || error) || 'sticker_comment_create_failed' }, status);
    }
  });
  return app;
}

module.exports = { RUNTIME, install, listReadyStickers, stickerAssetReady };
