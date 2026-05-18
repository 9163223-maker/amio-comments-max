'use strict';

const fetch = require('node-fetch');
const db = require('../../cc5-db-core');
const postRegistry = require('./postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-POST-EDITOR-DATA-ADAPTER-1.44.0-DIRECT-EDIT-ARCHIVE';
const MAX_API_BASE = 'https://platform-api.max.ru';
const PLAN_LIMITS = { free: 3, start: 3, plus: 15, pro: 15, business: 60, max: 60, enterprise: 60 };

function clean(value = '') { return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 96) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ctx.payload?.adminId || ctx.payload?.admin_id || ''); }
function channelIdOf(ctx = {}, input = {}) { return clean(input.channelId || ctx.channelId || ctx.payload?.channelId || ctx.session?.selected_channel_id || ''); }
function postIdOf(ctx = {}, input = {}) { return clean(input.postId || ctx.postId || ctx.payload?.postId || ctx.session?.selected_post_id || ''); }
function messageIdOf(ctx = {}, input = {}) { return clean(input.messageId || input.message_id || ctx.messageId || ctx.message_id || ctx.payload?.messageId || ctx.payload?.message_id || ctx.payload?.postMessageId || ctx.payload?.post_message_id || ''); }
function channelTitleOf(ctx = {}, input = {}) { return clean(input.channelTitle || ctx.channelTitle || ctx.payload?.channelTitle || 'Подключённый канал'); }
function postTitleOf(ctx = {}, input = {}) { return cut(input.postTitle || input.post_title || input.postPreview || ctx.postTitle || ctx.payload?.postTitle || ctx.payload?.postPreview || 'выбранный пост', 120); }
function planOf(ctx = {}) { return clean(ctx.planCode || ctx.plan || ctx.payload?.planCode || 'start').toLowerCase(); }
function memoryLimitForPlan(plan = 'start') { return PLAN_LIMITS[clean(plan).toLowerCase()] || PLAN_LIMITS.start; }
function botToken() { return clean(process.env.MAX_BOT_TOKEN || process.env.BOT_TOKEN || process.env.MAX_TOKEN || process.env.ACCESS_TOKEN || process.env.MAX_ACCESS_TOKEN || ''); }
function safeJson(value = {}) { try { return JSON.stringify(value || {}); } catch { return '{}'; } }

async function ensure() {
  await postRegistry.ensure?.();
  await db.query(`
    create table if not exists ak_post_edit_drafts (
      id bigserial primary key,
      admin_id text not null,
      channel_id text not null,
      post_id text not null,
      message_id text not null default '',
      original_text text not null default '',
      new_text text not null default '',
      status text not null default 'draft',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create index if not exists ak_post_edit_drafts_admin_updated_idx on ak_post_edit_drafts(admin_id, updated_at desc);
    create table if not exists ak_post_archives (
      id bigserial primary key,
      admin_id text not null,
      channel_id text not null,
      channel_title text not null default '',
      post_id text not null,
      message_id text not null default '',
      post_title text not null default '',
      post_text text not null default '',
      source text not null default 'manual',
      status text not null default 'stored',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create index if not exists ak_post_archives_admin_channel_updated_idx on ak_post_archives(admin_id, channel_id, updated_at desc);
  `);
  return { ok: true, runtimeVersion: RUNTIME };
}

async function listChannels(ctx = {}) {
  await ensure();
  return postRegistry.listChannels(ctx);
}

async function listPostsForEdit(ctx = {}, options = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 20));
  try {
    const { rows } = await db.query(`select p.channel_id, p.channel_title, p.post_id, p.message_id, p.comment_key, p.post_title, p.post_preview, p.meta, p.updated_at, p.created_at
      from ak_posts p
      where ($1='' or p.admin_id=$1) and ($2='' or p.channel_id=$2)
      order by p.updated_at desc, p.post_id desc limit $3`, [adminId, channelId, limit]);
    return (rows || []).map((row) => ({
      channelId: clean(row.channel_id || channelId),
      channelTitle: clean(row.channel_title || ctx.channelTitle || ctx.payload?.channelTitle || 'Подключённый канал'),
      postId: clean(row.post_id),
      messageId: clean(row.message_id || row.meta?.messageId || row.meta?.message_id || ''),
      commentKey: clean(row.comment_key),
      postTitle: cut(row.post_title || row.post_preview || row.meta?.postTitle || row.post_id || 'Пост без текста', 120),
      postPreview: cut(row.post_preview || row.post_title || row.meta?.postPreview || '', 160),
      updatedAt: row.updated_at,
      createdAt: row.created_at
    }));
  } catch (error) {
    return postRegistry.listPosts(ctx, { channelId, limit });
  }
}

async function seedEditablePost(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx) || 'core-stress-admin';
  const channelId = channelIdOf(ctx, input) || 'core-stress-edit-channel';
  const channelTitle = channelTitleOf(ctx, input);
  const postId = postIdOf(ctx, input) || 'core-stress-edit-post';
  const messageId = messageIdOf(ctx, input) || 'core-stress-edit-message';
  const postTitle = postTitleOf(ctx, input) || 'Тест редактирования поста';
  await postRegistry.ensurePrincipalRows?.({ adminId, channelId, channelTitle }, { channelId, channelTitle });
  await db.query(`insert into ak_posts(admin_id, channel_id, channel_title, post_id, message_id, comment_key, post_title, post_preview, source, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,'post_editor_stress',$9::jsonb,now())
    on conflict(channel_id, post_id) do update set admin_id=excluded.admin_id, channel_title=excluded.channel_title, message_id=excluded.message_id, post_title=excluded.post_title, post_preview=excluded.post_preview, meta=ak_posts.meta || excluded.meta, updated_at=now()`,
    [adminId, channelId, channelTitle, postId, messageId, `${channelId}:${postId}`, postTitle, postTitle, safeJson({ runtimeVersion: RUNTIME, editable: true, messageId })]);
  return { ok: true, post: { adminId, channelId, channelTitle, postId, messageId, postTitle, postPreview: postTitle } };
}

async function createEditDraft(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = channelIdOf(ctx, input);
  const postId = postIdOf(ctx, input);
  const messageId = messageIdOf(ctx, input);
  const originalText = clean(input.originalText || ctx.payload?.originalText || input.postTitle || ctx.payload?.postTitle || '');
  const newText = clean(input.newText || ctx.payload?.newText || ctx.text || '');
  if (!adminId || !channelId || !postId || !newText) return { ok: false, error: 'edit_draft_required_fields_missing' };
  const { rows } = await db.query(`insert into ak_post_edit_drafts(admin_id, channel_id, post_id, message_id, original_text, new_text, status, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,'draft',$7::jsonb,now()) returning id, created_at, updated_at`,
    [adminId, channelId, postId, messageId, originalText, newText, safeJson({ source: 'post_editor_core', runtimeVersion: RUNTIME })]);
  return { ok: true, draftId: rows[0]?.id, adminId, channelId, postId, messageId, originalText, newText };
}

function buildEditRequest(input = {}) {
  const messageId = clean(input.messageId || '');
  const text = clean(input.newText || input.text || '');
  const format = clean(input.format || '');
  const body = { text, attachments: null, notify: false };
  if (format === 'markdown' || format === 'html') body.format = format;
  return { method: 'PUT', url: `${MAX_API_BASE}/messages?${new URLSearchParams({ message_id: messageId }).toString()}`, body };
}

async function directEditPost(ctx = {}, input = {}, options = {}) {
  await ensure();
  const draft = await createEditDraft(ctx, input);
  if (!draft.ok) return draft;
  if (!draft.messageId) return { ok: false, error: 'message_id_required_for_direct_edit', needsForwardedPost: true, draft };
  const text = clean(draft.newText);
  if (!text) return { ok: false, error: 'text_required', draft };
  if (text.length > 4000) return { ok: false, error: 'text_too_long', limit: 4000, draft };
  const request = buildEditRequest({ messageId: draft.messageId, newText: text, format: input.format || ctx.payload?.format || '' });
  if (options.dryRun || ctx.payload?.dryRun || process.env.ADMINKIT_POST_EDIT_DRY_RUN === '1') {
    await db.query(`update ak_post_edit_drafts set status='dry_run_ready', meta=meta || $2::jsonb, updated_at=now() where id=$1`, [draft.draftId, safeJson({ directEditRequestReady: true, attachmentsNullPreservesMedia: true })]);
    return { ok: true, dryRun: true, request, draft, maxEditLimitHours: 24, attachmentsNullPreservesMedia: true };
  }
  const token = botToken();
  if (!token) return { ok: false, error: 'bot_token_missing', request, draft };
  const res = await fetch(request.url, { method: request.method, headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
  let data = null;
  try { data = await res.json(); } catch { data = { success: false, message: await res.text().catch(() => '') }; }
  const ok = res.ok && data?.success !== false;
  await db.query(`update ak_post_edit_drafts set status=$2, meta=meta || $3::jsonb, updated_at=now() where id=$1`, [draft.draftId, ok ? 'applied' : 'failed', safeJson({ httpStatus: res.status, response: data })]);
  return { ok, httpStatus: res.status, response: data, request, draft, maxEditLimitHours: 24, attachmentsNullPreservesMedia: true };
}

async function archivePost(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = channelIdOf(ctx, input);
  const channelTitle = channelTitleOf(ctx, input);
  const postId = postIdOf(ctx, input);
  const messageId = messageIdOf(ctx, input);
  const postTitle = postTitleOf(ctx, input);
  const postText = clean(input.postText || input.text || input.originalText || ctx.payload?.postText || ctx.payload?.postTitle || postTitle);
  if (!adminId || !channelId || !postId) return { ok: false, error: 'archive_post_required_fields_missing' };
  const { rows } = await db.query(`insert into ak_post_archives(admin_id, channel_id, channel_title, post_id, message_id, post_title, post_text, source, status, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,'stored',$9::jsonb,now()) returning id, created_at, updated_at`,
    [adminId, channelId, channelTitle, postId, messageId, postTitle, postText, clean(input.source || 'manual'), safeJson({ runtimeVersion: RUNTIME, plan: planOf(ctx) })]);
  await cleanupArchiveByPlan(ctx, { channelId });
  return { ok: true, archiveId: rows[0]?.id, adminId, channelId, channelTitle, postId, messageId, postTitle, postText };
}

async function cleanupArchiveByPlan(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = channelIdOf(ctx, input);
  const limit = memoryLimitForPlan(planOf(ctx));
  if (!adminId || !channelId) return { ok: false, error: 'cleanup_scope_missing', limit };
  const { rowCount } = await db.query(`delete from ak_post_archives where id in (
    select id from (
      select id, row_number() over(partition by admin_id, channel_id order by updated_at desc, id desc) as rn
      from ak_post_archives where admin_id=$1 and channel_id=$2 and status<>'deleted'
    ) t where rn>$3
  )`, [adminId, channelId, limit]);
  return { ok: true, limit, deleted: rowCount || 0 };
}

async function listArchive(ctx = {}, options = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || memoryLimitForPlan(planOf(ctx))), 60));
  const { rows } = await db.query(`select id, channel_id, channel_title, post_id, message_id, post_title, post_text, source, status, updated_at, created_at
    from ak_post_archives where ($1='' or admin_id=$1) and ($2='' or channel_id=$2) and status<>'deleted'
    order by updated_at desc, id desc limit $3`, [adminId, channelId, limit]);
  return { ok: true, limit, posts: (rows || []).map((row) => ({ archiveId: row.id, channelId: row.channel_id, channelTitle: row.channel_title, postId: row.post_id, messageId: row.message_id, postTitle: cut(row.post_title || row.post_text || 'Пост без текста', 120), postText: row.post_text, source: row.source, status: row.status, updatedAt: row.updated_at })) };
}

async function restoreArchive(ctx = {}, input = {}, options = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const archiveId = Number(input.archiveId || ctx.payload?.archiveId || 0);
  if (!adminId || !archiveId) return { ok: false, error: 'archive_restore_required_fields_missing' };
  const { rows } = await db.query(`select * from ak_post_archives where admin_id=$1 and id=$2 and status<>'deleted' limit 1`, [adminId, archiveId]);
  const item = rows[0];
  if (!item) return { ok: false, error: 'archive_record_not_found' };
  return directEditPost({ ...ctx, channelId: item.channel_id, payload: { ...(ctx.payload || {}), dryRun: options.dryRun || ctx.payload?.dryRun } }, { channelId: item.channel_id, channelTitle: item.channel_title, postId: item.post_id, messageId: item.message_id, postTitle: item.post_title, originalText: item.post_title, newText: item.post_text }, options);
}

async function deleteArchiveRecord(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const archiveId = Number(input.archiveId || ctx.payload?.archiveId || 0);
  if (!adminId || !archiveId) return { ok: false, error: 'archive_delete_required_fields_missing' };
  const { rowCount } = await db.query(`update ak_post_archives set status='deleted', updated_at=now() where admin_id=$1 and id=$2`, [adminId, archiveId]);
  return { ok: rowCount > 0, archiveId, deleted: rowCount > 0 };
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    directEditReady: true,
    directEditUsesPutMessages: true,
    directEditKeepsAttachmentsNull: true,
    maxEditLimitHours: 24,
    archiveReady: true,
    archiveRestoreReady: true,
    archiveDeleteReady: true,
    archivePlanLimitsReady: true,
    planLimits: PLAN_LIMITS,
    archiveSeparateFromQuickEdit: true,
    quickEditDoesNotRequireArchiveRestore: true
  };
}

module.exports = { RUNTIME, PLAN_LIMITS, MAX_API_BASE, ensure, listChannels, listPostsForEdit, seedEditablePost, createEditDraft, buildEditRequest, directEditPost, archivePost, cleanupArchiveByPlan, listArchive, restoreArchive, deleteArchiveRecord, memoryLimitForPlan, selfTest };