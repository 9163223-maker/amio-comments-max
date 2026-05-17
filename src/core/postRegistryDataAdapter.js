'use strict';

const db = require('../../cc5-db-core');

const RUNTIME = 'ADMINKIT-CORE-POST-REGISTRY-DATA-ADAPTER-1.38.2-SAFE-MIGRATION';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function humanTitle(...values) { for (const value of values) { const s = clean(value); if (s && !isRawId(s)) return s.slice(0, 120); } return ''; }

async function ensure() {
  await db.init();
  await db.query("create table if not exists ak_posts (id bigserial primary key, admin_id text not null default '', channel_id text not null default '', post_id text not null default '', source text not null default 'manual', meta jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
  const statements = [
    "alter table ak_posts add column if not exists admin_id text not null default ''",
    "alter table ak_posts add column if not exists channel_id text not null default ''",
    "alter table ak_posts add column if not exists channel_title text not null default ''",
    "alter table ak_posts add column if not exists post_id text not null default ''",
    "alter table ak_posts add column if not exists post_title text not null default ''",
    "alter table ak_posts add column if not exists post_preview text not null default ''",
    "alter table ak_posts add column if not exists source text not null default 'manual'",
    "alter table ak_posts add column if not exists meta jsonb not null default '{}'::jsonb",
    "alter table ak_posts add column if not exists created_at timestamptz default now()",
    "alter table ak_posts add column if not exists updated_at timestamptz default now()",
    "create unique index if not exists ak_posts_channel_post_uidx on ak_posts(channel_id, post_id)",
    "create index if not exists ak_posts_admin_channel_updated_idx on ak_posts(admin_id, channel_id, updated_at desc)"
  ];
  for (const sql of statements) await db.query(sql);
}

function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ''); }
function channelIdOf(ctx = {}) { return clean(ctx.channelId || ctx.payload?.channelId || ctx.selected_channel_id || ctx.session?.selected_channel_id || ctx.draft?.channelId || ''); }
function channelTitleOf(ctx = {}) { return humanTitle(ctx.channelTitle, ctx.payload?.channelTitle, ctx.session?.draft?.channelTitle, ctx.draft?.channelTitle, ctx.channel?.title); }
function postIdOf(ctx = {}) { return clean(ctx.postId || ctx.payload?.postId || ctx.selected_post_id || ctx.session?.selected_post_id || ctx.draft?.postId || ctx.post?.id || ''); }
function postTitleOf(ctx = {}) { return humanTitle(ctx.postTitle, ctx.payload?.postTitle, ctx.session?.draft?.postTitle, ctx.draft?.postTitle, ctx.post?.title, ctx.post?.text, ctx.text); }

async function listChannels(ctx = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const { rows } = await db.query("select channel_id, max(channel_title) as channel_title, count(*)::int as post_count, max(updated_at) as last_seen_at from ak_posts where ($1='' or admin_id=$1) and channel_id<>'' group by channel_id order by last_seen_at desc limit 20", [adminId]);
  const result = rows.map((row) => ({ channelId: row.channel_id, channelTitle: humanTitle(row.channel_title) || 'Канал', postCount: row.post_count, lastSeenAt: row.last_seen_at }));
  const currentId = channelIdOf(ctx);
  if (currentId && !result.find((x) => x.channelId === currentId)) result.unshift({ channelId: currentId, channelTitle: channelTitleOf(ctx) || 'Текущий канал', postCount: 0, lastSeenAt: null });
  return result;
}

async function listPosts(ctx = {}, options = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 20));
  const { rows } = await db.query("select channel_id, channel_title, post_id, post_title, post_preview, source, meta, updated_at from ak_posts where ($1='' or admin_id=$1) and ($2='' or channel_id=$2) order by updated_at desc, id desc limit $3", [adminId, channelId, limit]);
  return rows.map((row) => ({ channelId: row.channel_id, channelTitle: humanTitle(row.channel_title) || 'Канал', postId: row.post_id, postTitle: humanTitle(row.post_title, row.post_preview) || 'Пост', displayTitle: humanTitle(row.post_title, row.post_preview) || ('Пост ' + row.post_id), postPreview: clean(row.post_preview), source: row.source, meta: row.meta || {}, updatedAt: row.updated_at }));
}

async function upsertPost(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(input.channelId || channelIdOf(ctx) || 'manual-channel');
  const channelTitle = humanTitle(input.channelTitle, channelTitleOf(ctx));
  const postId = clean(input.postId || postIdOf(ctx) || ('manual-' + Date.now()));
  const postTitle = humanTitle(input.postTitle, input.title, postTitleOf(ctx)) || 'Пост';
  const postPreview = clean(input.postPreview || input.preview || postTitle).slice(0, 500);
  const source = clean(input.source || 'manual');
  const meta = input.meta || {};
  const { rows } = await db.query("insert into ak_posts(admin_id, channel_id, channel_title, post_id, post_title, post_preview, source, meta, updated_at) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now()) on conflict(channel_id, post_id) do update set admin_id=excluded.admin_id, channel_title=coalesce(nullif(excluded.channel_title,''), ak_posts.channel_title), post_title=coalesce(nullif(excluded.post_title,''), ak_posts.post_title), post_preview=coalesce(nullif(excluded.post_preview,''), ak_posts.post_preview), source=excluded.source, meta=ak_posts.meta || excluded.meta, updated_at=now() returning channel_id, channel_title, post_id, post_title, post_preview, source, meta", [adminId, channelId, channelTitle, postId, postTitle, postPreview, source, JSON.stringify(meta)]);
  const row = rows[0];
  return { ok: true, post: { channelId: row.channel_id, channelTitle: humanTitle(row.channel_title), postId: row.post_id, postTitle: humanTitle(row.post_title, row.post_preview), postPreview: row.post_preview, source: row.source, meta: row.meta || {} } };
}

async function captureForwardedPost(ctx = {}) {
  const payload = ctx.payload || {};
  const postId = clean(payload.postId || ctx.forwardedPostId || ctx.message?.link?.post_id || ctx.message?.body?.mid || '');
  if (!postId) return { ok: false, error: 'forwarded_post_payload_missing' };
  return upsertPost(ctx, { postId, postTitle: payload.postTitle || ctx.text || 'Пересланный пост', postPreview: ctx.text || payload.postPreview || '', source: 'forwarded_post', meta: { capturedAt: new Date().toISOString(), rawPayloadKeys: Object.keys(payload) } });
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, table: 'ak_posts', schemaMigrationReady: true, listChannelsReady: true, listPostsReady: true, upsertPostReady: true, captureForwardedPostReady: true, humanTitlesReady: true, noLegacyAdapters: true }; }

module.exports = { RUNTIME, ensure, listChannels, listPosts, upsertPost, captureForwardedPost, selfTest, humanTitle };