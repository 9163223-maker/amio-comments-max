'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');
const stickerPackService = require('./services/stickerPackService');
const commentService = require('./services/commentService');
const moderationService = require('./services/moderationService');
const { normalizeKey, addComment, getComments } = require('./store');

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
function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return String(value || '').split(/[\n,;]/g).map((item) => clean(item)).filter(Boolean);
}
function countLinks(text = '') {
  return (String(text || '').match(/(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg|wa\.me|chat\.whatsapp\.com)/giu) || []).length;
}
function stickerApprovalSecret() {
  return clean(config.moderationAdminToken || config.giftAdminToken || config.botToken || process.env.WEBHOOK_SECRET || process.env.GITHUB_DEBUG_TOKEN || '');
}
function signQueuedStickerApproval({ commentKey = '', userId = '', replyToId = '', packId = '', stickerId = '', moderationText = '' } = {}) {
  const secret = stickerApprovalSecret();
  if (!secret) return '';
  const payload = [
    'adminkitQueuedSticker:v1',
    normalizeKey(commentKey || ''),
    clean(userId || 'guest') || 'guest',
    clean(replyToId || ''),
    clean(packId || DEFAULT_PACK_ID),
    clean(stickerId || ''),
    clean(moderationText || '')
  ].join('\n');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
function makeModerationError({ action = 'reject', mode = 'moderation', reasons = [], matchedWords = [], source = 'moderation' } = {}) {
  const err = new Error('comment_blocked_by_moderation');
  err.status = 403;
  err.code = 'comment_blocked_by_moderation';
  err.data = { action, mode, reasons, matchedWords, source };
  return err;
}
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
function buildQueuedStickerMetadata(sticker = {}, context = {}) {
  const packId = clean(sticker.packId || DEFAULT_PACK_ID);
  const stickerId = clean(sticker.id || sticker.stickerId || '');
  if (!packId || !stickerId) return null;
  const moderationText = `Стикер ${stickerId}`.trim();
  const approvalToken = signQueuedStickerApproval({
    commentKey: context.commentKey,
    userId: context.userId,
    replyToId: context.replyToId,
    packId,
    stickerId,
    moderationText
  });
  const metadata = {
    type: 'sticker',
    commentType: 'sticker',
    adminkitQueuedSticker: true,
    approvalContext: 'moderation_queue_v1',
    packId,
    stickerId,
    displayText: 'Стикер',
    moderationText
  };
  if (approvalToken) metadata.approvalToken = approvalToken;
  return metadata;
}
function findRecentDuplicateStickerComment({ commentKey = '', userId = '', packId = '', stickerId = '', replyToId = '', windowMs = 8000 } = {}) {
  const key = normalizeKey(commentKey || '');
  const normalizedStickerId = clean(stickerId);
  if (!key || !normalizedStickerId) return null;
  const normalizedUserId = clean(userId || 'guest') || 'guest';
  const normalizedPackId = clean(packId || DEFAULT_PACK_ID);
  const normalizedReplyToId = clean(replyToId || '');
  const now = Date.now();
  const comments = getComments(key);
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    const item = comments[i] || {};
    if (now - Number(item.createdAt || 0) > windowMs) break;
    if (clean(item.userId || 'guest') !== normalizedUserId) continue;
    if (String(item.type || '') !== 'sticker') continue;
    if (clean(item.packId || DEFAULT_PACK_ID) !== normalizedPackId) continue;
    if (clean(item.stickerId || '') !== normalizedStickerId) continue;
    if (clean(item.replyToId || '') !== normalizedReplyToId) continue;
    return { ...item, deduped: true };
  }
  return null;
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
function enforceDbStickerModeration({ dbPolicy = null, userId, userName, text }) {
  if (!dbPolicy || dbPolicy.moderationEnabled !== true) return { allowed: true, action: 'allow', mode: 'db_off' };
  const normalizedText = clean(text);
  const lowered = normalizedText.toLowerCase();
  const reasons = [];
  const matchedWords = [];
  const words = toArray(dbPolicy.customBlocklist || []);
  for (const word of words) {
    const normalizedWord = clean(word).toLowerCase();
    if (normalizedWord && lowered.includes(normalizedWord)) matchedWords.push(normalizedWord);
  }
  if (matchedWords.length) reasons.push('stopwords_match');
  if (dbPolicy.blockLinks && countLinks(normalizedText) > 0) reasons.push('links_blocked');
  if (dbPolicy.blockInvites !== false && /(t\.me\/|telegram\.me\/|discord\.gg|chat\.whatsapp\.com|joinchat|invite)/iu.test(normalizedText)) reasons.push('invite_link');
  if (!reasons.length) return { allowed: true, action: 'allow', mode: 'db_policy' };
  throw makeModerationError({
    action: 'reject',
    mode: 'db_policy',
    reasons: [...new Set(reasons)],
    matchedWords: [...new Set(matchedWords)],
    source: 'Postgres ak_moderation_rules',
    userId,
    userName
  });
}
async function enforceStickerModeration({ commentKey, userId, userName, avatarUrl, replyToId, sticker, stickerId, dbPolicy }) {
  const effectiveStickerId = clean(sticker?.id || stickerId || '');
  const moderationText = `Стикер ${effectiveStickerId || ''}`.trim();
  const queuedStickerMetadata = buildQueuedStickerMetadata(sticker || { stickerId: effectiveStickerId }, { commentKey, userId, replyToId });
  enforceDbStickerModeration({ dbPolicy, userId, userName, text: moderationText });
  if (!moderationService || typeof moderationService.moderateComment !== 'function') return { allowed: true, action: 'allow', mode: 'unavailable' };
  const result = await moderationService.moderateComment({
    commentKey,
    userId,
    userName,
    avatarUrl,
    replyToId,
    text: moderationText,
    attachments: queuedStickerMetadata ? [queuedStickerMetadata] : [],
    sourceType: 'create',
    config
  });
  if (!result || result.allowed !== false) return result || { allowed: true, action: 'allow' };
  throw makeModerationError({ action: result.action || 'reject', mode: result.mode || 'moderation', reasons: result.reasons || [], source: result.mode || 'moderation' });
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

  app.post('/api/comments/sticker', express.json({ limit: '32kb' }), async (req, res) => {
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
      await enforceStickerModeration({ commentKey, userId, userName, avatarUrl, replyToId, sticker: check.sticker, dbPolicy });
      const duplicate = findRecentDuplicateStickerComment({
        commentKey,
        userId,
        packId: check.sticker.packId,
        stickerId: check.sticker.id,
        replyToId,
        windowMs: 8000
      });
      if (duplicate) {
        const patch = patchCountAsync(commentKey);
        return json(res, { ok: true, runtimeVersion: RUNTIME, comment: duplicate, sticker: check.sticker, patch, deduped: true });
      }
      const comment = addComment(commentKey, {
        type: 'sticker',
        userId,
        userName,
        avatarUrl,
        text: 'Стикер',
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
      const code = clean(error && (error.code || error.publicMessage || error.message) || error) || 'sticker_comment_create_failed';
      const status = Number(error && error.status) || (String(code).includes('comments_disabled') || String(code).includes('moderation') ? 403 : 400);
      return json(res, { ok: false, runtimeVersion: RUNTIME, error: code, data: error && error.data ? error.data : undefined }, status);
    }
  });
  return app;
}

module.exports = { RUNTIME, install, listReadyStickers, stickerAssetReady };
