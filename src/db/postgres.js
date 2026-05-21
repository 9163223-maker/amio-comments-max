'use strict';

const { Pool } = require('pg');

const DEFAULT_POOL_OPTIONS = Object.freeze({
  max: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 4500
});

let pool = null;

function clean(value) {
  return String(value || '').trim();
}

function boolEnv(value, fallback = false) {
  const raw = clean(value).toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on', 'require'].includes(raw);
}

function getDatabaseUrl() {
  return clean(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URI ||
    process.env.POSTGRES_URL ||
    process.env.PG_URL ||
    process.env.PGURI ||
    process.env.NF_POSTGRES_URI ||
    process.env.NF_POSTGRES_URL ||
    process.env.DB_URL ||
    process.env.DB_CONNECTION_STRING ||
    ''
  );
}

function hasHostConfig() {
  return Boolean(clean(process.env.PGHOST || process.env.POSTGRES_HOST || process.env.DB_HOST || process.env.NF_POSTGRES_HOST));
}

function hasDatabaseUrl() {
  return Boolean(getDatabaseUrl() || hasHostConfig());
}

function sslConfig(connectionString = getDatabaseUrl()) {
  if (/sslmode=disable/i.test(connectionString)) return false;
  const sslMode = clean(process.env.PGSSLMODE || process.env.POSTGRES_SSLMODE || '').toLowerCase();
  const sslRequired = boolEnv(process.env.DATABASE_SSL || process.env.POSTGRES_SSL || process.env.PGSSL, false) || sslMode === 'require' || Boolean(connectionString && !/sslmode=disable/i.test(connectionString));
  return sslRequired ? { rejectUnauthorized: false } : undefined;
}

function buildPoolOptions(connectionString = getDatabaseUrl()) {
  const ssl = sslConfig(connectionString);
  if (connectionString) {
    return ssl === undefined ? { connectionString, ...DEFAULT_POOL_OPTIONS } : { connectionString, ssl, ...DEFAULT_POOL_OPTIONS };
  }
  if (!hasHostConfig()) return null;
  return {
    host: clean(process.env.PGHOST || process.env.POSTGRES_HOST || process.env.DB_HOST || process.env.NF_POSTGRES_HOST),
    port: Number(process.env.PGPORT || process.env.POSTGRES_PORT || process.env.DB_PORT || process.env.NF_POSTGRES_PORT || 5432),
    database: clean(process.env.PGDATABASE || process.env.POSTGRES_DB || process.env.POSTGRES_DATABASE || process.env.DB_NAME || process.env.NF_POSTGRES_DATABASE),
    user: clean(process.env.PGUSER || process.env.POSTGRES_USER || process.env.DB_USER || process.env.NF_POSTGRES_USER),
    password: clean(process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || process.env.NF_POSTGRES_PASSWORD),
    ssl,
    ...DEFAULT_POOL_OPTIONS
  };
}

function getPool() {
  if (pool) return pool;
  const options = buildPoolOptions();
  if (!options) return null;
  pool = new Pool(options);
  return pool;
}

async function query(sql, params = []) {
  const activePool = getPool();
  if (!activePool) {
    const error = new Error('database_url_missing');
    error.code = 'DATABASE_URL_MISSING';
    throw error;
  }
  return activePool.query(sql, params);
}

async function transaction(fn) {
  if (typeof fn !== 'function') throw new Error('transaction_callback_required');
  const activePool = getPool();
  if (!activePool) {
    const error = new Error('database_url_missing');
    error.code = 'DATABASE_URL_MISSING';
    throw error;
  }
  const client = await activePool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try { await client.query('rollback'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function health() {
  const activePool = getPool();
  if (!activePool) return { ok: false, error: 'database_url_missing' };
  try {
    const startedAt = Date.now();
    await activePool.query('select 1');
    return { ok: true, durationMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

module.exports = {
  clean,
  getDatabaseUrl,
  hasDatabaseUrl,
  hasHostConfig,
  buildPoolOptions,
  getPool,
  query,
  transaction,
  health,
  closePool
};
