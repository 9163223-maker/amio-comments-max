'use strict';

const { Pool } = require('pg');
const max = require('./services/maxApi');
const postArchive = require('./postgres-post-archive');

const RUNTIME = 'ADMINKIT-ARCHIVE-FLOW-1.0';

let pool = null;

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function boolEnv(value, fallback = false) {
  const raw = clean(value).toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on', 'require'].includes(raw);
}

function connectionString() {
  return clean(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URI ||
      process.env.PG_URL ||
      process.env.PGURI ||
      process.env.NF_POSTGRES_URI ||
      process.env.NF_POSTGRES_URL ||
      process.env.DB_URL ||
      process.env.DB_CONNECTION_STRING
  );
}

function hostConfigPresent() {
  return Boolean(clean(process.env.PGHOST || process.env.POSTGRES_HOST || process.env.DB_HOST || process.env.NF_POSTGRES_HOST));
}

function isConfigured() {
  return Boolean(connectionString() || hostConfigPresent());
}

function sslConfig() {
  const sslMode = clean(process.env.PGSSLMODE || process.env.POSTGRES_SSLMODE || '').toLowerCase();
  const sslRequired = boolEnv(process.env.DATABASE_SSL || process.env.POSTGRES_SSL || process.env.PGSSL, false) || sslMode === 'require';
  return sslRequired ? { rejectUnauthorized: false } : undefined;
}

function getPoolConfig() {
  const cs = connectionString();
  const base = {
    max: Number(process.env.ADMINKIT_ARCHIVE_FLOW_PG_POOL_MAX || 2),
    idleTimeoutMillis: Number(process.env.ADMINKIT_PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.ADMINKIT_PG_CONNECT_TIMEOUT_MS || 5000)
  };
  const ssl = sslConfig();
  if (cs) return ssl ? { ...base, connectionString: cs, ssl } : { ...base, connectionString: cs };
  return {
    ...base,
    host: clean(process.env.PGHOST || process.env.POSTGRES_HOST || process.env.DB_HOST || process.env.NF_POSTGRES_HOST),
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || process.env.NF_POSTGRES_PORT || 5432),
    database: clean(process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.POSTGRES_DATABASE || process.env.DB_NAME || process.env.NF_POSTGRES_DATABASE),
    user: clean(process.env.PGUSER || process.env.POSTGRES_USER || process.env.DB_USER || process.env.NF_POSTGRES_USER),
    password: clean(process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.NF_POSTGRES_PASSWORD),
    ssl
  };
}

function getPool() {
  if (!isConfigured()) return null;
  if (!pool) pool = new Pool(getPoolConfig());
  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  if (!p) throw new Error('postgres_env_missing');
  await postArchive.ensure();
  return p.query(sql, params);
}

function shortText(value, max = 80) {
  const s = clean(value || 'Пост');
  return s.length <= max ? s : s.slice(0, max - 1).trim() + '…';
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  } catch {
    return clean(value);
  }
}

async function listArchive({ limit = 8, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(safeInt(limit, 8), 12));
  const safeOffset = Math.max(0, safeInt(offset, 0));
  const result = await query(
    `SELECT id, channel_id, post_id, comment_key, archive_reason, post_title, post_preview, created_at
     FROM ak_post_archive
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset]
  );
  const count = await query('SELECT COUNT(*)::int AS n FROM ak_post_archive');
  return { items: result.rows || [], total: count.rows && count.rows[0] ? count.rows[0].n : 0, limit: safeLimit, offset: safeOffset };
}

async function getArchiveItem(id) {
  const archiveId = safeInt(id, 0);
  if (!archiveId) return null;
  const result = await query(
    `SELECT id, channel_id, post_id, comment_key, archive_reason, post_title, post_preview, payload, created_at
     FROM ak_post_archive
     WHERE id = $1
     LIMIT 1`,
    [archiveId]
  );
  return result.rows && result.rows[0] ? result.rows[0] : null;
}

function extractText(payload = {}, fallback = '') {
  const candidates = [
    payload.originalText,
    payload.postText,
    payload.text,
    payload.messageText,
    payload.body && payload.body.text,
    payload.postPreview,
    payload.postTitle,
    fallback
  ];
  for (const candidate of candidates) {
    const s = clean(candidate);
    if (s) return s;
  }
  return 'Восстановленный пост';
}

function normalizeAttachment(item) {
  if (!item || typeof item !== 'object') return null;
  const type = clean(item.type || '').toLowerCase();
  if (!['image', 'video', 'audio', 'file'].includes(type)) return null;
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : null;
  if (!payload || !Object.keys(payload).length) return null;
  return { type, payload };
}

function extractAttachments(payload = {}) {
  const list = Array.isArray(payload.attachments) ? payload.attachments : [];
  return list.map(normalizeAttachment).filter(Boolean).slice(0, 10);
}

async function restoreAsNewPost({ botToken, archiveId }) {
  const item = await getArchiveItem(archiveId);
  if (!item) return { ok: false, error: 'archive_item_not_found', archiveId };
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  const channelId = clean(item.channel_id || payload.channelId);
  if (!channelId) return { ok: false, error: 'channel_id_missing', archiveId };
  const text = extractText(payload, item.post_preview || item.post_title || 'Восстановленный пост');
  const attachments = extractAttachments(payload);
  const sent = await max.sendMessage({
    botToken,
    chatId: channelId,
    text,
    attachments: attachments.length ? attachments : undefined,
    notify: false
  });
  const restoredMessageId = clean(sent && (sent.message_id || sent.id || sent.body && (sent.body.mid || sent.body.message_id)));
  await query(
    `INSERT INTO ak_post_archive (channel_id, post_id, comment_key, archive_reason, post_title, post_preview, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
    [channelId, restoredMessageId || 'restored-' + Date.now(), clean(item.comment_key), 'restored_as_new_post', clean(item.post_title), clean(item.post_preview), JSON.stringify({ restoredFromArchiveId: item.id, restoredMessageId, maxResponse: sent, original: payload })]
  );
  return { ok: true, archiveId: item.id, channelId, restoredMessageId, attachments: attachments.length, textPreview: shortText(text, 160) };
}

async function stats() {
  const status = await postArchive.status();
  return status;
}

function info() {
  return { runtimeVersion: RUNTIME, configured: isConfigured(), backend: 'postgres-archive-flow' };
}

module.exports = {
  RUNTIME,
  info,
  listArchive,
  getArchiveItem,
  restoreAsNewPost,
  stats,
  shortText,
  formatDate
};
