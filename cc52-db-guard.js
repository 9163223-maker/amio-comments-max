'use strict';

/**
 * CC5.2 DB guard for moderation posts.
 * Purpose: prevent bot service menus from becoming ak_posts and provide safe cleanup.
 */

const db = require('./cc5-db-core');

const SERVICE_PATTERNS = [
  /🛡\s*модерац/i,
  /выберите\s+область\s+правил/i,
  /выберите\s+пост/i,
  /выберите\s+канал/i,
  /что\s+настраиваем/i,
  /правила\s+всего\s+канала/i,
  /правила\s+этого\s+поста/i,
  /фильтр\s*:/i,
  /ручной\s+список\s*:/i,
  /базовые\s+стоп-слова\s*:/i,
  /главное\s+меню/i,
  /помощь\s+по\s+модерации/i
];

function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function isServiceTitle(title = '') {
  const value = norm(title);
  if (!value) return false;
  return SERVICE_PATTERNS.some((pattern) => pattern.test(value));
}
function isSuspiciousPostId(postId = '') {
  const value = norm(postId).toLowerCase();
  return value.startsWith('menu.') || value.startsWith('mid.menu') || value.startsWith('service.') || value.includes(':menu:');
}
function isRealPostRow(row = {}) {
  return Boolean(row && row.postId && row.commentKey && !isServiceTitle(row.title || '') && !isSuspiciousPostId(row.postId));
}
function isCallbackUpdate(update = {}) { return Boolean(db.cb(update)); }
function isForwardedCandidate(update = {}) {
  if (!update || isCallbackUpdate(update)) return false;
  const payload = db.payload(update);
  const channel = db.extractChannel(update, payload);
  const post = db.extractPost(update, payload, channel.channelId);
  const chatId = db.chatId(update);
  if (!channel.channelId || !post.postId || !post.commentKey) return false;
  if (chatId && String(channel.channelId) === String(chatId)) return false;
  if (isServiceTitle(post.title || '') || isSuspiciousPostId(post.postId)) return false;
  const source = JSON.stringify(update || {}).toLowerCase();
  return /^-/.test(String(channel.channelId)) || /forward|forwarded|переслан|sender_chat|original|channel_id/.test(source);
}

async function scanServicePosts(limit = 30) {
  const { rows } = await db.query(`
    select admin_id as "adminId", channel_id as "channelId", post_id as "postId", comment_key as "commentKey", title, updated_at as "updatedAt"
    from ak_posts
    where
      title ~* $1
      or lower(coalesce(post_id,'')) like 'menu.%'
      or lower(coalesce(post_id,'')) like 'mid.menu%'
      or lower(coalesce(post_id,'')) like 'service.%'
    order by updated_at desc
    limit $2
  `, [SERVICE_PATTERNS.map((p) => p.source).join('|'), Math.max(1, Math.min(Number(limit || 30), 200))]);
  const { rows: countRows } = await db.query(`
    select count(*)::int as n from ak_posts
    where
      title ~* $1
      or lower(coalesce(post_id,'')) like 'menu.%'
      or lower(coalesce(post_id,'')) like 'mid.menu%'
      or lower(coalesce(post_id,'')) like 'service.%'
  `, [SERVICE_PATTERNS.map((p) => p.source).join('|')]);
  return { count: countRows[0]?.n || 0, sample: rows };
}

async function cleanupServicePosts({ apply = false, limit = 200 } = {}) {
  const before = await scanServicePosts(limit);
  if (!apply) return { ok: true, dryRun: true, deleted: 0, before };
  const { rows } = await db.query(`
    with doomed as (
      select admin_id, channel_id, post_id
      from ak_posts
      where
        title ~* $1
        or lower(coalesce(post_id,'')) like 'menu.%'
        or lower(coalesce(post_id,'')) like 'mid.menu%'
        or lower(coalesce(post_id,'')) like 'service.%'
      limit $2
    )
    delete from ak_posts p
    using doomed d
    where p.admin_id=d.admin_id and p.channel_id=d.channel_id and p.post_id=d.post_id
    returning p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.comment_key as "commentKey", p.title
  `, [SERVICE_PATTERNS.map((p) => p.source).join('|'), Math.max(1, Math.min(Number(limit || 200), 1000))]);
  const after = await scanServicePosts(20);
  return { ok: true, dryRun: false, deleted: rows.length, deletedRows: rows.slice(0, 50), before, after };
}

function install() {
  if (db.__cc52DbGuardInstalled) return db;
  db.__cc52DbGuardInstalled = true;
  const originalGetPosts = db.getPosts.bind(db);
  const originalUpsertFromUpdate = db.upsertFromUpdate.bind(db);
  const originalUpsertPost = db.upsertPost.bind(db);

  db.getPosts = async (adminId, channelId, limit = 20) => {
    const rows = await originalGetPosts(adminId, channelId, Math.max(Number(limit || 20) * 3, 50));
    return rows.filter(isRealPostRow).slice(0, Math.max(1, Math.min(Number(limit || 20), 100)));
  };

  db.upsertPost = async (adminId, channelId, postId, title = '', raw = {}, messageId = '') => {
    if (isServiceTitle(title) || isSuspiciousPostId(postId)) return { skipped: true, reason: 'service_post_blocked', adminId, channelId, postId, title };
    return originalUpsertPost(adminId, channelId, postId, title, raw, messageId);
  };

  db.upsertFromUpdate = async (update = {}) => {
    if (isCallbackUpdate(update)) return { skipped: true, reason: 'callback_post_upsert_disabled' };
    if (!isForwardedCandidate(update)) return { skipped: true, reason: 'not_forwarded_channel_post' };
    const payload = db.payload(update);
    const channel = db.extractChannel(update, payload);
    const post = db.extractPost(update, payload, channel.channelId);
    if (isServiceTitle(post.title) || isSuspiciousPostId(post.postId)) return { skipped: true, reason: 'service_post_blocked', channelId: channel.channelId, postId: post.postId, title: post.title };
    return originalUpsertFromUpdate(update);
  };

  db.cc52DbGuard = { isServiceTitle, isSuspiciousPostId, isRealPostRow, isForwardedCandidate, scanServicePosts, cleanupServicePosts };
  return db;
}

module.exports = { install, isServiceTitle, isSuspiciousPostId, isRealPostRow, isForwardedCandidate, scanServicePosts, cleanupServicePosts };
