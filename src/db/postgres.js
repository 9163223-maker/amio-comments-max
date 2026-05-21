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

function getDatabaseUrl() {
  return clean(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL || '');
}

function hasDatabaseUrl() {
  return Boolean(getDatabaseUrl());
}

function buildPoolOptions(connectionString = getDatabaseUrl()) {
  if (!connectionString) return null;
  return {
    connectionString,
    ssl: /sslmode=disable/i.test(connectionString) ? false : { rejectUnauthorized: false },
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
  buildPoolOptions,
  getPool,
  query,
  transaction,
  health,
  closePool
};
