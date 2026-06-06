'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'web-push-subscriptions.json');
const TABLE_NAME = 'adminkit_web_push_subscriptions';

let pool = null;

function clean(value) {
  return String(value || '').trim();
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

function sslEnabled() {
  const raw = clean(process.env.PGSSL || process.env.POSTGRES_SSL || process.env.DB_SSL).toLowerCase();
  if (!raw) return Boolean(connectionString() && /sslmode=require/i.test(connectionString()));
  return ['1', 'true', 'yes', 'on', 'require'].includes(raw);
}

function isPostgresConfigured() {
  return Boolean(connectionString());
}

function getPool() {
  if (!isPostgresConfigured()) return null;
  if (!pool) {
    pool = new Pool({ connectionString: connectionString(), ssl: sslEnabled() ? { rejectUnauthorized: false } : undefined });
  }
  return pool;
}

function subscriptionId(subscription) {
  const endpoint = clean(subscription && subscription.endpoint);
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

function sanitizeSubscription(input) {
  const source = input && typeof input === 'object' ? input : {};
  const endpoint = clean(source.endpoint);
  const keys = source.keys && typeof source.keys === 'object' ? source.keys : {};
  const p256dh = clean(keys.p256dh);
  const auth = clean(keys.auth);
  if (!endpoint || !p256dh || !auth) {
    const err = new Error('invalid_push_subscription');
    err.code = 'invalid_push_subscription';
    throw err;
  }
  return {
    endpoint,
    expirationTime: source.expirationTime || null,
    keys: { p256dh, auth }
  };
}

function publicSummary(row) {
  const subscription = row && row.subscription ? row.subscription : row;
  const endpoint = clean(subscription && subscription.endpoint);
  return {
    id: clean(row && row.id) || (endpoint ? subscriptionId(subscription).slice(0, 16) : ''),
    endpointHash: endpoint ? subscriptionId(subscription).slice(0, 16) : '',
    endpointHost: endpoint ? new URL(endpoint).host : '',
    createdAt: clean(row && row.createdAt),
    updatedAt: clean(row && row.updatedAt),
    lastSuccessAt: clean(row && row.lastSuccessAt),
    lastError: clean(row && row.lastError).slice(0, 160),
    disabled: Boolean(row && row.disabled)
  };
}

function readFileStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { subscriptions: [] };
  }
}

function writeFileStore(payload) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

async function ensureTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    id TEXT PRIMARY KEY,
    subscription JSONB NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    disabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_success_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT ''
  )`);
}

async function saveSubscription(subscription, meta = {}) {
  const cleanSubscription = sanitizeSubscription(subscription);
  const id = subscriptionId(cleanSubscription);
  const userAgent = clean(meta.userAgent).slice(0, 300);
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      await client.query(
        `INSERT INTO ${TABLE_NAME} (id, subscription, user_agent, disabled, created_at, updated_at, last_error)
         VALUES ($1, $2::jsonb, $3, FALSE, NOW(), NOW(), '')
         ON CONFLICT (id) DO UPDATE SET subscription = EXCLUDED.subscription, user_agent = EXCLUDED.user_agent, disabled = FALSE, updated_at = NOW(), last_error = ''`,
        [id, JSON.stringify(cleanSubscription), userAgent]
      );
      return { ok: true, id, backend: 'postgres' };
    } finally {
      client.release();
    }
  }

  const payload = readFileStore();
  const now = new Date().toISOString();
  const list = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
  const existing = list.find((item) => item && item.id === id);
  if (existing) {
    existing.subscription = cleanSubscription;
    existing.userAgent = userAgent;
    existing.disabled = false;
    existing.updatedAt = now;
    existing.lastError = '';
  } else {
    list.push({ id, subscription: cleanSubscription, userAgent, disabled: false, createdAt: now, updatedAt: now, lastSuccessAt: '', lastError: '' });
  }
  writeFileStore({ subscriptions: list });
  return { ok: true, id, backend: 'file' };
}

async function listActiveSubscriptions() {
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      const result = await client.query(`SELECT id, subscription, user_agent, disabled, created_at, updated_at, last_success_at, last_error FROM ${TABLE_NAME} WHERE disabled = FALSE ORDER BY updated_at DESC`);
      return result.rows.map((row) => ({
        id: row.id,
        subscription: row.subscription,
        userAgent: row.user_agent,
        disabled: row.disabled,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
        lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : '',
        lastError: row.last_error || ''
      }));
    } finally {
      client.release();
    }
  }
  return (readFileStore().subscriptions || []).filter((item) => item && !item.disabled);
}

async function markResult(id, result = {}) {
  const p = getPool();
  const ok = Boolean(result.ok);
  const error = clean(result.error).slice(0, 500);
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      await client.query(
        `UPDATE ${TABLE_NAME}
         SET last_success_at = CASE WHEN $2 THEN NOW() ELSE last_success_at END,
             last_error = $3,
             disabled = CASE WHEN $4 THEN TRUE ELSE disabled END,
             updated_at = NOW()
         WHERE id = $1`,
        [id, ok, error, Boolean(result.disable)]
      );
      return;
    } finally {
      client.release();
    }
  }
  const payload = readFileStore();
  const item = (payload.subscriptions || []).find((entry) => entry && entry.id === id);
  if (item) {
    if (ok) item.lastSuccessAt = new Date().toISOString();
    item.lastError = error;
    if (result.disable) item.disabled = true;
    item.updatedAt = new Date().toISOString();
    writeFileStore(payload);
  }
}

async function countSubscriptions() {
  return (await listActiveSubscriptions()).length;
}

function info() {
  return {
    backend: isPostgresConfigured() ? 'postgres' : 'file',
    persistent: isPostgresConfigured(),
    table: isPostgresConfigured() ? TABLE_NAME : '',
    file: isPostgresConfigured() ? '' : DATA_FILE
  };
}

module.exports = {
  saveSubscription,
  listActiveSubscriptions,
  markResult,
  countSubscriptions,
  publicSummary,
  info
};
