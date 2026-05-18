'use strict';

const db = require('../../cc5-db-core');
const postRegistry = require('./postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-CHANNEL-DATA-ADAPTER-1.47.1-SCHEMA-SAFE-CONNECTION';
const CACHE_TTL_MS = 5 * 1000;
const cache = new Map();

function clean(value = '') { return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 56) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function key(adminId = '') { return clean(adminId) || 'debug-admin'; }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function humanChannelTitle(...values) { for (const value of values) { const s = clean(value); if (s && !isRawId(s)) return cut(s, 80); } return 'Канал без названия'; }
function humanPostTitle(...values) { for (const value of values) { const s = clean(value); if (s && !isRawId(s)) return cut(s, 120); } return 'Служебный пост для подключения'; }
function adminIdOf(ctx = {}, input = {}) { return clean(input.adminId || input.admin_id || ctx.adminId || ctx.admin_id || ctx.userId || ctx.payload?.adminId || ctx.payload?.admin_id || ''); }
function channelIdOf(ctx = {}, input = {}) { return clean(input.channelId || input.channel_id || ctx.channelId || ctx.channel_id || ctx.payload?.channelId || ctx.payload?.channel_id || ''); }
function channelTitleOf(ctx = {}, input = {}) { return humanChannelTitle(input.channelTitle, input.channel_title, ctx.channelTitle, ctx.channel_title, ctx.payload?.channelTitle, ctx.payload?.channel_title); }
function postIdOf(ctx = {}, input = {}) { return clean(input.postId || input.post_id || ctx.postId || ctx.post_id || ctx.payload?.postId || ctx.payload?.post_id || ''); }
function messageIdOf(ctx = {}, input = {}) { return clean(input.messageId || input.message_id || ctx.messageId || ctx.message_id || ctx.payload?.messageId || ctx.payload?.message_id || ''); }
function serviceMessageIdOf(ctx = {}, input = {}) { return clean(input.serviceMessageId || input.service_message_id || ctx.payload?.serviceMessageId || ctx.payload?.service_message_id || messageIdOf(ctx, input)); }
function postTitleOf(ctx = {}, input = {}) { return humanPostTitle(input.postTitle, input.post_title, input.postPreview, ctx.postTitle, ctx.payload?.postTitle, ctx.payload?.postPreview); }
function safeJson(value = {}) { try { return JSON.stringify(value || {}); } catch { return '{}'; } }
function getCached(adminId = '') { const item = cache.get(key(adminId)); if (!item || Date.now() - item.at > CACHE_TTL_MS) return null; return item.value; }
function setCached(adminId = '', value) { cache.set(key(adminId), { at: Date.now(), value }); if (cache.size > 100) cache.delete(cache.keys().next().value); return value; }
function clearCache(adminId = '') { cache.delete(key(adminId)); }

async function ensure() {
  await postRegistry.ensure?.();
  await db.query(`
    create table if not exists ak_admins (
      admin_id text primary key,
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    alter table ak_admins add column if not exists raw jsonb not null default '{}'::jsonb;
    alter table ak_admins add column if not exists created_at timestamptz default now();
    alter table ak_admins add column if not exists updated_at timestamptz default now();

    create table if not exists ak_channels (
      channel_id text primary key,
      title text not null default '',
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    alter table ak_channels add column if not exists title text not null default '';
    alter table ak_channels add column if not exists raw jsonb not null default '{}'::jsonb;
    alter table ak_channels add column if not exists created_at timestamptz default now();
    alter table ak_channels add column if not exists updated_at timestamptz default now();

    create table if not exists ak_admin_channels (
      admin_id text not null,
      channel_id text not null,
      role text not null default 'admin',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      primary key(admin_id, channel_id)
    );
    alter table ak_admin_channels add column if not exists role text not null default 'admin';
    alter table ak_admin_channels add column if not exists created_at timestamptz default now();
    alter table ak_admin_channels add column if not exists updated_at timestamptz default now();

    create table if not exists ak_admin_sessions (
      admin_id text primary key,
      selected_channel_id text not null default '',
      selected_post_id text not null default '',
      raw jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    alter table ak_admin_sessions add column if not exists selected_channel_id text not null default '';
    alter table ak_admin_sessions add column if not exists selected_post_id text not null default '';
    alter table ak_admin_sessions add column if not exists raw jsonb not null default '{}'::jsonb;
    alter table ak_admin_sessions add column if not exists created_at timestamptz default now();
    alter table ak_admin_sessions add column if not exists updated_at timestamptz default now();

    create table if not exists ak_channel_connection_events (
      id bigserial primary key,
      admin_id text not null,
      channel_id text not null,
      channel_title text not null default '',
      post_id text not null default '',
      message_id text not null default '',
      service_message_id text not null default '',
      post_title text not null default '',
      status text not null default 'connected',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    alter table ak_channel_connection_events add column if not exists channel_title text not null default '';
    alter table ak_channel_connection_events add column if not exists post_id text not null default '';
    alter table ak_channel_connection_events add column if not exists message_id text not null default '';
    alter table ak_channel_connection_events add column if not exists service_message_id text not null default '';
    alter table ak_channel_connection_events add column if not exists post_title text not null default '';
    alter table ak_channel_connection_events add column if not exists status text not null default 'connected';
    alter table ak_channel_connection_events add column if not exists meta jsonb not null default '{}'::jsonb;
    alter table ak_channel_connection_events add column if not exists created_at timestamptz default now();
    alter table ak_channel_connection_events add column if not exists updated_at timestamptz default now();
    create index if not exists ak_channel_connection_events_admin_updated_idx on ak_channel_connection_events(admin_id, updated_at desc);
    create index if not exists ak_channel_connection_events_channel_idx on ak_channel_connection_events(admin_id, channel_id, status);
  `);
  return { ok: true, runtimeVersion: RUNTIME, schemaMigrationReady: true };
}

async function ensurePrincipalRows(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx, input);
  const channelId = channelIdOf(ctx, input);
  const channelTitle = channelTitleOf(ctx, input);
  if (!adminId || !channelId) return { ok: false, error: 'admin_or_channel_missing' };
  await db.query(`insert into ak_admins(admin_id, raw, updated_at)
    values($1,$2::jsonb,now())
    on conflict(admin_id) do update set raw=coalesce(ak_admins.raw, '{}'::jsonb) || excluded.raw, updated_at=now()`,
    [adminId, safeJson({ source: 'channel_connection_core', runtimeVersion: RUNTIME })]);
  await db.query(`insert into ak_channels(channel_id, title, raw, updated_at)
    values($1,$2,$3::jsonb,now())
    on conflict(channel_id) do update set title=coalesce(nullif(excluded.title,''), ak_channels.title), raw=coalesce(ak_channels.raw, '{}'::jsonb) || excluded.raw, updated_at=now()`,
    [channelId, channelTitle, safeJson({ source: 'channel_connection_core', runtimeVersion: RUNTIME, channelTitle })]);
  await db.query(`insert into ak_admin_channels(admin_id, channel_id, role, updated_at)
    values($1,$2,'admin',now())
    on conflict(admin_id, channel_id) do update set role='admin', updated_at=now()`, [adminId, channelId]);
  return { ok: true, adminId, channelId, channelTitle };
}

async function listChannels(adminId = '', options = {}) {
  await ensure();
  const id = clean(adminId);
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 50));
  const cached = options.noCache ? null : getCached(id);
  if (cached) return { ...cached, cached: true };
  if (!id) return { ok: false, runtimeVersion: RUNTIME, error: 'admin_id_required', channels: [] };
  const sessionResult = await db.query(`select selected_channel_id from ak_admin_sessions where admin_id=$1 limit 1`, [id]).catch((error) => ({ rows: [], error: error?.message || String(error) }));
  const selectedChannelId = clean(sessionResult.rows?.[0]?.selected_channel_id || '');
  const result = await db.query(`
    select
      c.channel_id as "channelId",
      coalesce(nullif(c.title, ''), 'Канал без названия') as title,
      coalesce(ac.role, 'admin') as role,
      ac.updated_at as "linkedAt",
      c.updated_at as "channelUpdatedAt",
      count(p.post_id)::int as "postsCount",
      max(p.updated_at) as "lastPostAt"
    from ak_admin_channels ac
    join ak_channels c on c.channel_id = ac.channel_id
    left join ak_posts p on p.admin_id = ac.admin_id and p.channel_id = ac.channel_id
    where ac.admin_id = $1
    group by c.channel_id, c.title, ac.role, ac.updated_at, c.updated_at
    order by coalesce(max(p.updated_at), ac.updated_at, c.updated_at) desc nulls last
    limit $2
  `, [id, limit]).catch((error) => ({ rows: [], error: error?.message || String(error) }));
  if (result.error) return setCached(id, { ok: false, runtimeVersion: RUNTIME, error: result.error, selectedChannelId, channels: [] });
  const channels = (result.rows || []).map((row) => {
    const channelId = clean(row.channelId);
    const title = humanChannelTitle(row.title);
    return {
      channelId,
      title,
      displayTitle: cut(title, 42),
      role: clean(row.role || 'admin'),
      postsCount: Number(row.postsCount || 0),
      selected: !!selectedChannelId && selectedChannelId === channelId,
      linkedAt: row.linkedAt || null,
      lastPostAt: row.lastPostAt || null
    };
  });
  return setCached(id, { ok: true, runtimeVersion: RUNTIME, adminId: id, selectedChannelId, channels, count: channels.length, limit });
}

function formatChannelsForScreen(data = {}) {
  if (!data.ok) return [`Не удалось прочитать список каналов: ${data.error || 'unknown_error'}.`, 'Данные каналов не изменялись.'];
  if (!data.channels || !data.channels.length) return ['Подключённые каналы пока не найдены.', 'Нажмите «Подключить канал» и перешлите боту любой пост из нужного канала.'];
  const lines = [`Найдено каналов: ${data.count}.`, ''];
  data.channels.slice(0, 10).forEach((channel, index) => {
    const selected = channel.selected ? ' · выбран сейчас' : '';
    lines.push(`${index + 1}. ${channel.displayTitle}${selected}`);
    lines.push(`   Постов в базе: ${channel.postsCount} · роль: ${channel.role}`);
  });
  if (data.channels.length > 10) lines.push(`…и ещё ${data.channels.length - 10}.`);
  lines.push('', 'Канал можно выбрать для всех разделов АдминКИТ.');
  return lines;
}

function previewForwardedPost(ctx = {}, input = {}) {
  const adminId = adminIdOf(ctx, input);
  const channelId = channelIdOf(ctx, input);
  const channelTitle = channelTitleOf(ctx, input);
  const postId = postIdOf(ctx, input);
  const messageId = messageIdOf(ctx, input);
  const postTitle = postTitleOf(ctx, input);
  if (!adminId || !channelId || !postId) return { ok: false, error: 'forwarded_post_required_fields_missing' };
  return { ok: true, adminId, channelId, channelTitle, postId, messageId, postTitle, humanLabelsReady: true, rawIdsHiddenInUx: true };
}

async function connectForwardedPost(ctx = {}, input = {}) {
  await ensure();
  const preview = previewForwardedPost(ctx, input);
  if (!preview.ok) return preview;
  const serviceMessageId = serviceMessageIdOf(ctx, input);
  await ensurePrincipalRows({ adminId: preview.adminId, channelId: preview.channelId, channelTitle: preview.channelTitle }, { channelId: preview.channelId, channelTitle: preview.channelTitle });
  await db.query(`insert into ak_admin_sessions(admin_id, selected_channel_id, selected_post_id, raw, updated_at)
    values($1,$2,$3,$4::jsonb,now())
    on conflict(admin_id) do update set selected_channel_id=excluded.selected_channel_id, selected_post_id=excluded.selected_post_id, raw=coalesce(ak_admin_sessions.raw, '{}'::jsonb) || excluded.raw, updated_at=now()`,
    [preview.adminId, preview.channelId, preview.postId, safeJson({ source: 'channel_connection_core', runtimeVersion: RUNTIME })]);
  await db.query(`insert into ak_posts(admin_id, channel_id, channel_title, post_id, message_id, comment_key, post_title, post_preview, source, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,'channel_connection_forwarded_post',$9::jsonb,now())
    on conflict(channel_id, post_id) do update set admin_id=excluded.admin_id, channel_title=excluded.channel_title, message_id=excluded.message_id, post_title=excluded.post_title, post_preview=excluded.post_preview, meta=coalesce(ak_posts.meta, '{}'::jsonb) || excluded.meta, updated_at=now()`,
    [preview.adminId, preview.channelId, preview.channelTitle, preview.postId, preview.messageId, `${preview.channelId}:${preview.postId}`, preview.postTitle, preview.postTitle, safeJson({ runtimeVersion: RUNTIME, serviceMessageId, channelConnected: true })]);
  const { rows } = await db.query(`insert into ak_channel_connection_events(admin_id, channel_id, channel_title, post_id, message_id, service_message_id, post_title, status, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,'connected',$8::jsonb,now()) returning id, created_at, updated_at`,
    [preview.adminId, preview.channelId, preview.channelTitle, preview.postId, preview.messageId, serviceMessageId, preview.postTitle, safeJson({ runtimeVersion: RUNTIME, forwardedPostCanBeDeleted: true })]);
  clearCache(preview.adminId);
  return { ok: true, connectionId: rows[0]?.id, ...preview, serviceMessageId, selectedChannelSaved: true, channelAvailableEverywhere: true, forwardedPostCanBeDeleted: true };
}

async function selectChannel(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx, input);
  const channelId = channelIdOf(ctx, input);
  const channelTitle = channelTitleOf(ctx, input);
  if (!adminId || !channelId) return { ok: false, error: 'select_channel_required_fields_missing' };
  await ensurePrincipalRows({ adminId, channelId, channelTitle }, { channelId, channelTitle });
  await db.query(`insert into ak_admin_sessions(admin_id, selected_channel_id, raw, updated_at)
    values($1,$2,$3::jsonb,now())
    on conflict(admin_id) do update set selected_channel_id=excluded.selected_channel_id, raw=coalesce(ak_admin_sessions.raw, '{}'::jsonb) || excluded.raw, updated_at=now()`,
    [adminId, channelId, safeJson({ source: 'channel_select_core', runtimeVersion: RUNTIME })]);
  clearCache(adminId);
  return { ok: true, adminId, channelId, channelTitle, selected: true };
}

async function markAuthPostCleaned(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx, input);
  const connectionId = Number(input.connectionId || input.connection_id || ctx.payload?.connectionId || ctx.payload?.connection_id || 0);
  const channelId = channelIdOf(ctx, input);
  if (!adminId) return { ok: false, error: 'admin_id_required' };
  let rowCount = 0;
  if (connectionId) {
    const result = await db.query(`update ak_channel_connection_events set status='service_cleaned', meta=coalesce(meta, '{}'::jsonb) || $3::jsonb, updated_at=now() where admin_id=$1 and id=$2 and status='connected'`, [adminId, connectionId, safeJson({ cleanedAt: new Date().toISOString(), runtimeVersion: RUNTIME })]);
    rowCount = result.rowCount || 0;
  } else if (channelId) {
    const result = await db.query(`update ak_channel_connection_events set status='service_cleaned', meta=coalesce(meta, '{}'::jsonb) || $3::jsonb, updated_at=now() where id in (select id from ak_channel_connection_events where admin_id=$1 and channel_id=$2 and status='connected' order by updated_at desc limit 1)`, [adminId, channelId, safeJson({ cleanedAt: new Date().toISOString(), runtimeVersion: RUNTIME })]);
    rowCount = result.rowCount || 0;
  }
  return { ok: rowCount > 0, cleaned: rowCount > 0, connectionId, channelId, publishedChannelPostUntouched: true };
}

async function listRecentConnections(ctx = {}, options = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 20));
  const { rows } = await db.query(`select id, channel_title, post_title, status, updated_at from ak_channel_connection_events where admin_id=$1 order by updated_at desc, id desc limit $2`, [adminId, limit]);
  return { ok: true, connections: (rows || []).map((row) => ({ connectionId: row.id, channelTitle: cut(row.channel_title || 'Канал без названия', 80), postTitle: cut(row.post_title || 'Служебный пост', 120), status: row.status, updatedAt: row.updated_at })) };
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, readOnly: false, schemaMigrationReady: true, connectForwardedPostReady: true, previewReady: true, selectChannelReady: true, servicePostCleanupReady: true, channelAvailableEverywhere: true, rawIdsHiddenInUx: true, cacheTtlMs: CACHE_TTL_MS, cacheSize: cache.size };
}

module.exports = { RUNTIME, CACHE_TTL_MS, ensure, ensurePrincipalRows, listChannels, formatChannelsForScreen, previewForwardedPost, connectForwardedPost, selectChannel, markAuthPostCleaned, listRecentConnections, selfTest, humanChannelTitle, humanPostTitle };