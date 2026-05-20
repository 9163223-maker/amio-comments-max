'use strict';

const crypto = require('crypto');
const { Pool } = require('pg');

const RUNTIME = 'ADMINKIT-POSTGRES-POST-ARCHIVE-1.1-SCHEMA-MIGRATE';
let pool = null;
let ensurePromise = null;
let pendingSnapshot = null;
let pendingTimer = null;
let pendingPromise = null;
let lastInfo = {
  ok: false,
  configured: false,
  runtimeVersion: RUNTIME,
  backend: 'postgres-archive-tables',
  tables: ['ak_channels', 'ak_posts', 'ak_post_snapshots', 'ak_post_archive'],
  lastSyncAt: '',
  lastError: '',
  lastSync: null
};

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function boolEnv(value, fallback = false) {
  const raw = clean(value).toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on', 'require'].includes(raw);
}
function connectionString() {
  return clean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URI || process.env.PG_URL || process.env.PGURI || process.env.NF_POSTGRES_URI || process.env.NF_POSTGRES_URL || process.env.DB_URL || process.env.DB_CONNECTION_STRING);
}
function hostConfigPresent() { return Boolean(clean(process.env.PGHOST || process.env.POSTGRES_HOST || process.env.DB_HOST || process.env.NF_POSTGRES_HOST)); }
function isConfigured() { return Boolean(connectionString() || hostConfigPresent()); }
function sslConfig() {
  const sslMode = clean(process.env.PGSSLMODE || process.env.POSTGRES_SSLMODE || '').toLowerCase();
  const sslRequired = boolEnv(process.env.DATABASE_SSL || process.env.POSTGRES_SSL || process.env.PGSSL, false) || sslMode === 'require';
  return sslRequired ? { rejectUnauthorized: false } : undefined;
}
function getPoolConfig() {
  const cs = connectionString();
  const base = { max: Number(process.env.ADMINKIT_ARCHIVE_PG_POOL_MAX || 2), idleTimeoutMillis: Number(process.env.ADMINKIT_PG_IDLE_TIMEOUT_MS || 30000), connectionTimeoutMillis: Number(process.env.ADMINKIT_PG_CONNECT_TIMEOUT_MS || 5000) };
  const ssl = sslConfig();
  if (cs) return ssl ? { ...base, connectionString: cs, ssl } : { ...base, connectionString: cs };
  return { ...base, host: clean(process.env.PGHOST || process.env.POSTGRES_HOST || process.env.DB_HOST || process.env.NF_POSTGRES_HOST), port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || process.env.NF_POSTGRES_PORT || 5432), database: clean(process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.POSTGRES_DATABASE || process.env.DB_NAME || process.env.NF_POSTGRES_DATABASE), user: clean(process.env.PGUSER || process.env.POSTGRES_USER || process.env.DB_USER || process.env.NF_POSTGRES_USER), password: clean(process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.NF_POSTGRES_PASSWORD), ssl };
}
function getPool() { if (!isConfigured()) return null; if (!pool) pool = new Pool(getPoolConfig()); return pool; }
async function query(sql, params = []) { const p = getPool(); if (!p) throw new Error('postgres_env_missing'); return p.query(sql, params); }
async function columnExists(table, column) {
  const r = await query('SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1', [table, column]);
  return r.rowCount > 0;
}

async function ensureArchiveSchema() {
  await query(`CREATE TABLE IF NOT EXISTS ak_channels (channel_id TEXT PRIMARY KEY)`);
  const channelMigrations = [
    "ALTER TABLE ak_channels ADD COLUMN IF NOT EXISTS channel_title TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_channels ADD COLUMN IF NOT EXISTS linked_by_user_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_channels ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE ak_channels ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE ak_channels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "ALTER TABLE ak_channels ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "CREATE INDEX IF NOT EXISTS ak_channels_updated_idx ON ak_channels(updated_at DESC)"
  ];
  for (const sql of channelMigrations) await query(sql);
  if (await columnExists('ak_channels', 'title')) await query("UPDATE ak_channels SET channel_title = COALESCE(NULLIF(channel_title, ''), title) WHERE COALESCE(channel_title, '') = '' AND COALESCE(title, '') <> ''");
  if (await columnExists('ak_channels', 'name')) await query("UPDATE ak_channels SET channel_title = COALESCE(NULLIF(channel_title, ''), name) WHERE COALESCE(channel_title, '') = '' AND COALESCE(name, '') <> ''");

  await query(`CREATE TABLE IF NOT EXISTS ak_posts (id BIGSERIAL PRIMARY KEY)`);
  const postMigrations = [
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS admin_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS channel_title TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS post_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS message_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS comment_key TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS post_title TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS post_preview TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'store'",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "ALTER TABLE ak_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "UPDATE ak_posts SET comment_key = channel_id || ':' || post_id WHERE COALESCE(comment_key, '') = '' AND COALESCE(channel_id, '') <> '' AND COALESCE(post_id, '') <> ''",
    "CREATE INDEX IF NOT EXISTS ak_posts_comment_key_idx ON ak_posts(comment_key)",
    "CREATE INDEX IF NOT EXISTS ak_posts_channel_updated_idx ON ak_posts(channel_id, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS ak_posts_admin_channel_updated_idx ON ak_posts(admin_id, channel_id, updated_at DESC)"
  ];
  for (const sql of postMigrations) await query(sql);

  await query(`CREATE TABLE IF NOT EXISTS ak_post_snapshots (id BIGSERIAL PRIMARY KEY)`);
  const snapshotMigrations = [
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS post_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS comment_key TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS snapshot_hash TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS snapshot_kind TEXT NOT NULL DEFAULT 'auto'",
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS post_title TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS post_preview TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE ak_post_snapshots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "CREATE UNIQUE INDEX IF NOT EXISTS ak_post_snapshots_unique_uidx ON ak_post_snapshots(channel_id, post_id, snapshot_hash)",
    "CREATE INDEX IF NOT EXISTS ak_post_snapshots_post_idx ON ak_post_snapshots(channel_id, post_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ak_post_snapshots_comment_key_idx ON ak_post_snapshots(comment_key, created_at DESC)"
  ];
  for (const sql of snapshotMigrations) await query(sql);

  await query(`CREATE TABLE IF NOT EXISTS ak_post_archive (id BIGSERIAL PRIMARY KEY)`);
  const archiveMigrations = [
    "ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS post_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS comment_key TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS archive_reason TEXT NOT NULL DEFAULT 'snapshot'",
    "ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS post_title TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS post_preview TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "CREATE INDEX IF NOT EXISTS ak_post_archive_post_idx ON ak_post_archive(channel_id, post_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ak_post_archive_comment_key_idx ON ak_post_archive(comment_key, created_at DESC)"
  ];
  for (const sql of archiveMigrations) await query(sql);
}

async function ensure() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    if (!isConfigured()) {
      lastInfo = { ...lastInfo, ok: false, configured: false, lastError: 'postgres_env_missing' };
      return { ok: false, configured: false, error: 'postgres_env_missing' };
    }
    try {
      await ensureArchiveSchema();
      lastInfo = { ...lastInfo, ok: true, configured: true, lastError: '' };
      return { ok: true, configured: true };
    } catch (error) {
      ensurePromise = null;
      lastInfo = { ...lastInfo, ok: false, configured: true, lastError: String(error && error.message || error) };
      throw error;
    }
  })();
  return ensurePromise;
}

function channelTitle(channel = {}) { return clean(channel.title || channel.channelTitle || channel.name || channel.chatTitle || channel.channelName || ''); }
function postTitle(post = {}) { return clean(post.postTitle || post.title || post.originalText || post.postText || post.text || post.messageText || 'Пост').slice(0, 180); }
function postPreview(post = {}) { return clean(post.postPreview || post.preview || post.originalText || post.postText || post.text || post.messageText || postTitle(post)).slice(0, 500); }
function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function snapshotHash(payload) { return crypto.createHash('sha256').update(stableStringify(payload || {})).digest('hex'); }
function collectChannels(snapshot = {}) { const source = snapshot && typeof snapshot.channels === 'object' ? snapshot.channels : {}; return Object.values(source).filter((item) => item && typeof item === 'object'); }
function collectPosts(snapshot = {}) { const source = snapshot && typeof snapshot.posts === 'object' ? snapshot.posts : {}; return Object.entries(source).map(([key, value]) => ({ commentKey: clean(value && value.commentKey || key), ...(value || {}) })).filter((item) => clean(item.channelId) && clean(item.postId)); }

async function syncChannels(channels = []) {
  for (const ch of channels) {
    const channelId = clean(ch.channelId || ch.id || ch.chatId);
    if (!channelId || /^global$/i.test(channelId)) continue;
    const title = channelTitle(ch);
    const linkedBy = clean(ch.linkedByUserId || ch.adminId || ch.userId);
    const meta = JSON.stringify(ch);
    const updated = await query(
      `UPDATE ak_channels SET channel_title = COALESCE(NULLIF($2, ''), channel_title), linked_by_user_id = COALESCE(NULLIF($3, ''), linked_by_user_id), active = TRUE, meta = meta || $4::jsonb, updated_at = NOW() WHERE channel_id = $1`,
      [channelId, title, linkedBy, meta]
    );
    if (updated.rowCount === 0) await query(`INSERT INTO ak_channels (channel_id, channel_title, linked_by_user_id, active, meta, created_at, updated_at) VALUES ($1, $2, $3, TRUE, $4::jsonb, NOW(), NOW())`, [channelId, title, linkedBy, meta]);
  }
}

async function syncPosts(posts = [], reason = 'auto') {
  let upserted = 0;
  let snapshots = 0;
  for (const post of posts) {
    const channelId = clean(post.channelId);
    const postId = clean(post.postId || post.messageId || post.id);
    if (!channelId || !postId) continue;
    const commentKey = clean(post.commentKey) || `${channelId}:${postId}`;
    const title = postTitle(post);
    const preview = postPreview(post);
    const payload = { ...post, channelId, postId, commentKey };
    const hash = snapshotHash(payload);
    const values = [clean(post.adminId || post.admin_id || post.linkedByUserId), channelId, clean(post.channelTitle || post.chatTitle || post.channelName), postId, clean(post.messageId), commentKey, title, preview, reason, JSON.stringify(payload)];
    const updated = await query(
      `UPDATE ak_posts SET admin_id = COALESCE(NULLIF($1, ''), admin_id), channel_title = COALESCE(NULLIF($3, ''), channel_title), message_id = COALESCE(NULLIF($5, ''), message_id), comment_key = COALESCE(NULLIF($6, ''), comment_key), post_title = COALESCE(NULLIF($7, ''), post_title), post_preview = COALESCE(NULLIF($8, ''), post_preview), source = $9, archived = FALSE, meta = meta || $10::jsonb, updated_at = NOW() WHERE channel_id = $2 AND post_id = $4`,
      values
    );
    if (updated.rowCount === 0) await query(`INSERT INTO ak_posts (admin_id, channel_id, channel_title, post_id, message_id, comment_key, post_title, post_preview, source, archived, meta, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10::jsonb,NOW(),NOW())`, values);
    upserted += 1;
    const inserted = await query(
      `INSERT INTO ak_post_snapshots (channel_id, post_id, comment_key, snapshot_hash, snapshot_kind, post_title, post_preview, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW()) ON CONFLICT (channel_id, post_id, snapshot_hash) DO NOTHING RETURNING id`,
      [channelId, postId, commentKey, hash, reason, title, preview, JSON.stringify(payload)]
    );
    if (inserted.rowCount > 0) {
      snapshots += 1;
      await query(`INSERT INTO ak_post_archive (channel_id, post_id, comment_key, archive_reason, post_title, post_preview, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())`, [channelId, postId, commentKey, reason, title, preview, JSON.stringify(payload)]);
    }
  }
  return { upserted, snapshots };
}

async function syncStore(snapshot = {}, options = {}) {
  const reason = clean(options.reason || 'auto');
  try {
    const ensured = await ensure();
    if (!ensured.ok) return ensured;
    const channels = collectChannels(snapshot);
    const posts = collectPosts(snapshot);
    await syncChannels(channels);
    const postResult = await syncPosts(posts, reason);
    const result = { ok: true, configured: true, channels: channels.length, posts: posts.length, ...postResult, reason, syncedAt: new Date().toISOString() };
    lastInfo = { ...lastInfo, ok: true, configured: true, lastError: '', lastSyncAt: result.syncedAt, lastSync: result };
    return result;
  } catch (error) {
    ensurePromise = null;
    lastInfo = { ...lastInfo, ok: false, configured: isConfigured(), lastError: String(error && error.message || error) };
    return { ok: false, configured: isConfigured(), error: String(error && error.message || error), reason };
  }
}

function scheduleSync(snapshot = {}, options = {}) {
  if (!isConfigured()) return false;
  pendingSnapshot = JSON.parse(JSON.stringify(snapshot || {}));
  const delayMs = Math.max(0, Number(options.delayMs || 900));
  const reason = clean(options.reason || 'auto');
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const next = pendingSnapshot;
    pendingSnapshot = null;
    pendingPromise = syncStore(next || {}, { reason }).catch((error) => { ensurePromise = null; lastInfo = { ...lastInfo, ok: false, configured: true, lastError: String(error && error.message || error) }; });
  }, delayMs);
  return true;
}

async function status() {
  const ensured = await ensure();
  if (!ensured.ok) return { ...info(), ok: false };
  const [channels, posts, snapshots, archive] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM ak_channels'),
    query('SELECT COUNT(*)::int AS n FROM ak_posts'),
    query('SELECT COUNT(*)::int AS n FROM ak_post_snapshots'),
    query('SELECT COUNT(*)::int AS n FROM ak_post_archive')
  ]);
  return { ...info(), ok: true, lastError: '', counts: { channels: channels.rows[0].n, posts: posts.rows[0].n, snapshots: snapshots.rows[0].n, archive: archive.rows[0].n } };
}

async function flush() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    const next = pendingSnapshot;
    pendingSnapshot = null;
    await syncStore(next || {}, { reason: 'flush' });
  }
  if (pendingPromise) await pendingPromise;
  return info();
}
function info() { return { ...lastInfo, configured: isConfigured(), runtimeVersion: RUNTIME, backend: 'postgres-archive-tables', pending: Boolean(pendingTimer || pendingSnapshot || pendingPromise) }; }
process.once('SIGTERM', () => { flush().finally(() => {}); });
process.once('SIGINT', () => { flush().finally(() => {}); });
module.exports = { RUNTIME, isConfigured, ensure, syncStore, scheduleSync, flush, status, info };
