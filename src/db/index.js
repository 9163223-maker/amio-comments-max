'use strict';

const { Pool } = require('pg');
const { schemaSql } = require('./schema');

let pool = null;

function getPool() {
  if (!pool) throw new Error('database_not_initialized');
  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function initDatabase(config) {
  if (!config.databaseUrl) return null;
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
    max: 8,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000
  });
  await pool.query(schemaSql);
  return pool;
}

async function healthCheck() {
  if (!pool) return { ok: false, reason: 'database_not_configured' };
  const started = Date.now();
  const result = await pool.query('select now() as now');
  return { ok: true, now: result.rows[0]?.now, latencyMs: Date.now() - started };
}

module.exports = {
  initDatabase,
  getPool,
  query,
  withClient,
  healthCheck
};
