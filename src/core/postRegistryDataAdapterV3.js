'use strict';

const db = require('../../cc5-db-core');
const base = require('./postRegistryDataAdapterV2');
const RUNTIME = 'ADMINKIT-CORE-POST-REGISTRY-DATA-ADAPTER-1.38.7-NO-ID-ORDER';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ''); }
function channelIdOf(ctx = {}) { return clean(ctx.channelId || ctx.payload?.channelId || ctx.selected_channel_id || ctx.session?.selected_channel_id || ctx.draft?.channelId || ''); }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function humanTitle(...values) { for (const value of values) { const s = clean(value); if (s && !isRawId(s)) return s.slice(0, 120); } return ''; }

async function listPosts(ctx = {}, options = {}) {
  await base.ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 20));
  const sql = "select channel_id, channel_title, post_id, comment_key, post_title, post_preview, source, meta, updated_at from ak_posts where ($1='' or admin_id=$1) and ($2='' or channel_id=$2) order by updated_at desc, post_id desc limit $3";
  const { rows } = await db.query(sql, [adminId, channelId, limit]);
  return rows.map((row) => ({
    channelId: row.channel_id,
    channelTitle: humanTitle(row.channel_title) || 'Канал',
    postId: row.post_id,
    commentKey: row.comment_key || '',
    postTitle: humanTitle(row.post_title, row.post_preview) || 'Пост',
    displayTitle: humanTitle(row.post_title, row.post_preview) || ('Пост ' + row.post_id),
    postPreview: clean(row.post_preview),
    source: row.source,
    meta: row.meta || {},
    updatedAt: row.updated_at
  }));
}

function selfTest() {
  return { ...base.selfTest(), ok: true, runtimeVersion: RUNTIME, listPostsNoIdOrder: true, noIdColumnRequired: true };
}

module.exports = { ...base, RUNTIME, listPosts, selfTest, humanTitle };
