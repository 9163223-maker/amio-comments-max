'use strict';

const { Pool } = require('pg');
const postArchive = require('./postgres-post-archive');

let pool = null;
let lastInfo = {
  ok: false,
  configured: false,
  backend: 'postgres-jsonb',
  table: '',
  key: '',
  lastSyncAt: '',
  lastError: '',
  postArchive: postArchive.info()
};
let pendingSnapshot = null;
let pendingTimer = null;
let pendingPromise = null;

function clean(value) {
  return String(value || '').trim();
}

function boolEnv(value, fallback = false) {
  const raw = clean(value).toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on', 'require'].includes(raw);
}

function tableName() {
  const raw = clean(process.env.ADMINKIT_STATE_TABLE || process.env.ADMINKIT_POSTGRES_TABLE || 'adminkit_state');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return 'adminkit_state';
  return raw;
}

function stateKey() {
  return clean(process.env.ADMINKIT_STATE_KEY || 'store') || 'store';
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
  if (!sslRequired) return undefined;
  return { rejectUnauthorized: false };
}

function getPoolConfig() {
  const cs = connectionString();
  const base = {
    max: Number(process.env.ADMINKIT_PG_POOL_MAX || 2),
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

async function ensureTable(client) {
  const t = tableName();
  await client.query(`CREATE TABLE IF NOT EXISTS ${t} (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  return t;
}

function scheduleArchive(snapshot, reason) {
  try {
    const scheduled = postArchive.scheduleSync(snapshot || {}, { reason: reason || 'state-sync' });
    process.env.ADMINKIT_POST_ARCHIVE_LAST_SCHEDULED = scheduled ? '1' : '0';
    const arch = postArchive.info();
    process.env.ADMINKIT_POST_ARCHIVE_ENABLED = arch.configured ? '1' : '0';
    process.env.ADMINKIT_POST_ARCHIVE_OK = arch.ok ? '1' : '0';
    process.env.ADMINKIT_POST_ARCHIVE_LAST_ERROR = clean(arch.lastError || '');
    lastInfo = { ...lastInfo, postArchive: arch };
  } catch (error) {
    process.env.ADMINKIT_POST_ARCHIVE_LAST_ERROR = String(error && error.message || error).slice(0, 500);
  }
}

async function loadSnapshot() {
  const p = getPool();
  const key = stateKey();
  const t = tableName();
  lastInfo = { ...lastInfo, configured: Boolean(p), table: t, key };
  if (!p) return { ok: false, configured: false, found: false, error: 'postgres_env_missing', table: t, key };

  let client = null;
  try {
    client = await p.connect();
    await ensureTable(client);
    const result = await client.query(`SELECT value, updated_at FROM ${t} WHERE key = $1 LIMIT 1`, [key]);
    const row = result.rows && result.rows[0];
    lastInfo = { ...lastInfo, ok: true, configured: true, table: t, key, lastError: '', lastSyncAt: row ? new Date(row.updated_at).toISOString() : '' };
    if (row && row.value) scheduleArchive(row.value, 'startup-load');
    return { ok: true, configured: true, found: Boolean(row), value: row ? row.value : null, updatedAt: row ? row.updated_at : null, table: t, key };
  } catch (error) {
    lastInfo = { ...lastInfo, ok: false, configured: true, table: t, key, lastError: String(error && error.message || error) };
    return { ok: false, configured: true, found: false, error: String(error && error.message || error), table: t, key };
  } finally {
    if (client) client.release();
  }
}

async function saveSnapshot(snapshot) {
  const p = getPool();
  const key = stateKey();
  const t = tableName();
  lastInfo = { ...lastInfo, configured: Boolean(p), table: t, key };
  if (!p) return { ok: false, configured: false, error: 'postgres_env_missing', table: t, key };

  let client = null;
  try {
    client = await p.connect();
    await ensureTable(client);
    await client.query(
      `INSERT INTO ${t} (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(snapshot || {})]
    );
    lastInfo = { ...lastInfo, ok: true, configured: true, table: t, key, lastError: '', lastSyncAt: new Date().toISOString() };
    scheduleArchive(snapshot || {}, 'state-save');
    return { ok: true, configured: true, table: t, key };
  } catch (error) {
    lastInfo = { ...lastInfo, ok: false, configured: true, table: t, key, lastError: String(error && error.message || error) };
    return { ok: false, configured: true, error: String(error && error.message || error), table: t, key };
  } finally {
    if (client) client.release();
  }
}

function scheduleSave(snapshot, delayMs = 350) {
  if (!isConfigured()) return false;
  pendingSnapshot = JSON.parse(JSON.stringify(snapshot || {}));
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const next = pendingSnapshot;
    pendingSnapshot = null;
    pendingPromise = saveSnapshot(next).catch((error) => {
      lastInfo = { ...lastInfo, ok: false, configured: true, lastError: String(error && error.message || error) };
    });
  }, Math.max(0, Number(delayMs || 0)));
  return true;
}

async function flush() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    const next = pendingSnapshot;
    pendingSnapshot = null;
    await saveSnapshot(next || {});
  }
  if (pendingPromise) await pendingPromise;
  await postArchive.flush();
  return info();
}

function info() {
  return {
    ...lastInfo,
    configured: isConfigured(),
    backend: 'postgres-jsonb',
    table: tableName(),
    key: stateKey(),
    postArchive: postArchive.info(),
    pending: Boolean(pendingTimer || pendingSnapshot || pendingPromise)
  };
}

process.once('SIGTERM', () => {
  flush().finally(() => process.exit(0));
});
process.once('SIGINT', () => {
  flush().finally(() => process.exit(0));
});

module.exports = {
  isConfigured,
  loadSnapshot,
  saveSnapshot,
  scheduleSave,
  flush,
  info,
  tableName,
  stateKey
};