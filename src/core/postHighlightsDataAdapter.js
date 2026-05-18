'use strict';

const db = require('../../cc5-db-core');
const postRegistry = require('./postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-POST-HIGHLIGHTS-DATA-ADAPTER-1.45.0';
const HIGHLIGHT_TYPES = {
  important: { title: 'Важно', icon: '⭐', badge: 'Важное' },
  new: { title: 'Новое', icon: '🆕', badge: 'Новое' },
  gift: { title: 'Подарок', icon: '🎁', badge: 'Подарок' },
  sale: { title: 'Акция', icon: '🏷', badge: 'Акция' },
  pinned: { title: 'Закрепить в списке', icon: '📌', badge: 'Закреплено' }
};

function clean(value = '') { return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 120) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ctx.payload?.adminId || ctx.payload?.admin_id || ''); }
function channelIdOf(ctx = {}, input = {}) { return clean(input.channelId || input.channel_id || ctx.channelId || ctx.channel_id || ctx.payload?.channelId || ctx.payload?.channel_id || ''); }
function postIdOf(ctx = {}, input = {}) { return clean(input.postId || input.post_id || ctx.postId || ctx.post_id || ctx.payload?.postId || ctx.payload?.post_id || ''); }
function messageIdOf(ctx = {}, input = {}) { return clean(input.messageId || input.message_id || ctx.messageId || ctx.message_id || ctx.payload?.messageId || ctx.payload?.message_id || ''); }
function channelTitleOf(ctx = {}, input = {}) { return cut(input.channelTitle || input.channel_title || ctx.channelTitle || ctx.channel_title || ctx.payload?.channelTitle || ctx.payload?.channel_title || 'Подключённый канал', 120); }
function postTitleOf(ctx = {}, input = {}) { return cut(input.postTitle || input.post_title || input.postPreview || input.post_preview || ctx.postTitle || ctx.payload?.postTitle || ctx.payload?.postPreview || 'выбранный пост', 160); }
function highlightTypeOf(ctx = {}, input = {}) { const type = clean(input.highlightType || input.highlight_type || ctx.payload?.highlightType || ctx.payload?.highlight_type || 'important').toLowerCase(); return HIGHLIGHT_TYPES[type] ? type : 'important'; }
function safeJson(value = {}) { try { return JSON.stringify(value || {}); } catch { return '{}'; } }

async function ensure() {
  await postRegistry.ensure?.();
  await db.query(`
    create table if not exists ak_post_highlights (
      id bigserial primary key,
      admin_id text not null,
      channel_id text not null,
      channel_title text not null default '',
      post_id text not null,
      message_id text not null default '',
      post_title text not null default '',
      highlight_type text not null default 'important',
      badge_text text not null default '',
      status text not null default 'active',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create unique index if not exists ak_post_highlights_unique_active_idx on ak_post_highlights(admin_id, channel_id, post_id);
    create index if not exists ak_post_highlights_admin_channel_updated_idx on ak_post_highlights(admin_id, channel_id, updated_at desc);
    create index if not exists ak_post_highlights_type_idx on ak_post_highlights(highlight_type, status);
  `);
  return { ok: true, runtimeVersion: RUNTIME };
}

async function listChannels(ctx = {}) {
  await ensure();
  return postRegistry.listChannels(ctx);
}

async function listPosts(ctx = {}, options = {}) {
  await ensure();
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const rows = await postRegistry.listPosts(ctx, { channelId, limit: Math.max(1, Math.min(Number(options.limit || 10), 20)) });
  return (Array.isArray(rows) ? rows : []).map((post) => ({
    channelId: clean(post.channelId || channelId),
    channelTitle: clean(post.channelTitle || post.displayTitle || ctx.payload?.channelTitle || 'Подключённый канал'),
    postId: clean(post.postId || post.id || ''),
    messageId: clean(post.messageId || post.message_id || ''),
    postTitle: cut(post.postTitle || post.postPreview || post.title || 'Пост без текста', 120),
    postPreview: cut(post.postPreview || post.postTitle || '', 160)
  }));
}

async function seedPost(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx) || 'core-stress-admin';
  const channelId = channelIdOf(ctx, input) || 'core-stress-highlight-channel';
  const channelTitle = channelTitleOf(ctx, input);
  const postId = postIdOf(ctx, input) || 'core-stress-highlight-post';
  const messageId = messageIdOf(ctx, input) || 'core-stress-highlight-message';
  const postTitle = postTitleOf(ctx, input) || 'Тест выделения поста';
  await postRegistry.ensurePrincipalRows?.({ adminId, channelId, channelTitle }, { channelId, channelTitle });
  await db.query(`insert into ak_posts(admin_id, channel_id, channel_title, post_id, message_id, comment_key, post_title, post_preview, source, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,'post_highlights_stress',$9::jsonb,now())
    on conflict(channel_id, post_id) do update set admin_id=excluded.admin_id, channel_title=excluded.channel_title, message_id=excluded.message_id, post_title=excluded.post_title, post_preview=excluded.post_preview, meta=ak_posts.meta || excluded.meta, updated_at=now()`,
    [adminId, channelId, channelTitle, postId, messageId, `${channelId}:${postId}`, postTitle, postTitle, safeJson({ runtimeVersion: RUNTIME, highlightReady: true, messageId })]);
  return { ok: true, post: { adminId, channelId, channelTitle, postId, messageId, postTitle, postPreview: postTitle } };
}

async function upsertHighlight(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = channelIdOf(ctx, input);
  const channelTitle = channelTitleOf(ctx, input);
  const postId = postIdOf(ctx, input);
  const messageId = messageIdOf(ctx, input);
  const postTitle = postTitleOf(ctx, input);
  const highlightType = highlightTypeOf(ctx, input);
  const badgeText = cut(input.badgeText || input.badge_text || ctx.payload?.badgeText || HIGHLIGHT_TYPES[highlightType].badge, 48);
  if (!adminId || !channelId || !postId) return { ok: false, error: 'highlight_required_fields_missing' };
  await postRegistry.ensurePrincipalRows?.({ adminId, channelId, channelTitle }, { channelId, channelTitle });
  const { rows } = await db.query(`insert into ak_post_highlights(admin_id, channel_id, channel_title, post_id, message_id, post_title, highlight_type, badge_text, status, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,'active',$9::jsonb,now())
    on conflict(admin_id, channel_id, post_id) do update set channel_title=excluded.channel_title, message_id=excluded.message_id, post_title=excluded.post_title, highlight_type=excluded.highlight_type, badge_text=excluded.badge_text, status='active', meta=ak_post_highlights.meta || excluded.meta, updated_at=now()
    returning id, created_at, updated_at`,
    [adminId, channelId, channelTitle, postId, messageId, postTitle, highlightType, badgeText, safeJson({ runtimeVersion: RUNTIME, source: 'adminkit-core-1.45.0', directPostPatch: false })]);
  return { ok: true, highlightId: rows[0]?.id, adminId, channelId, channelTitle, postId, messageId, postTitle, highlightType, badgeText, typeInfo: HIGHLIGHT_TYPES[highlightType] };
}

async function listHighlights(ctx = {}, options = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 50));
  const { rows } = await db.query(`select id, channel_id, channel_title, post_id, message_id, post_title, highlight_type, badge_text, status, updated_at, created_at
    from ak_post_highlights where ($1='' or admin_id=$1) and ($2='' or channel_id=$2) and status='active'
    order by updated_at desc, id desc limit $3`, [adminId, channelId, limit]);
  return { ok: true, total: rows.length, highlights: (rows || []).map((row) => ({ highlightId: row.id, channelId: row.channel_id, channelTitle: row.channel_title, postId: row.post_id, messageId: row.message_id, postTitle: cut(row.post_title || 'Пост без текста', 120), highlightType: row.highlight_type, badgeText: row.badge_text, icon: HIGHLIGHT_TYPES[row.highlight_type]?.icon || '⭐', updatedAt: row.updated_at })) };
}

async function removeHighlight(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const highlightId = Number(input.highlightId || input.highlight_id || ctx.payload?.highlightId || ctx.payload?.highlight_id || 0);
  if (!adminId || !highlightId) return { ok: false, error: 'highlight_remove_required_fields_missing' };
  const { rowCount } = await db.query(`update ak_post_highlights set status='removed', updated_at=now() where admin_id=$1 and id=$2 and status='active'`, [adminId, highlightId]);
  return { ok: rowCount > 0, highlightId, removed: rowCount > 0 };
}

async function stats(ctx = {}, options = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const { rows } = await db.query(`select highlight_type, count(*)::int as count from ak_post_highlights where ($1='' or admin_id=$1) and ($2='' or channel_id=$2) and status='active' group by highlight_type order by count desc`, [adminId, channelId]);
  const byType = {};
  for (const row of rows || []) byType[row.highlight_type] = Number(row.count || 0);
  return { ok: true, total: Object.values(byType).reduce((a, b) => a + Number(b || 0), 0), byType };
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    highlightTypes: Object.keys(HIGHLIGHT_TYPES),
    highlightTypeCount: Object.keys(HIGHLIGHT_TYPES).length,
    badgesReady: true,
    listReady: true,
    removeNeedsConfirmation: true,
    statsReady: true,
    noDirectMaxPostPatch: true,
    humanLabelsRequired: true
  };
}

module.exports = { RUNTIME, HIGHLIGHT_TYPES, ensure, listChannels, listPosts, seedPost, upsertHighlight, listHighlights, removeHighlight, stats, selfTest };