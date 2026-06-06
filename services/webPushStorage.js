'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'web-push-subscriptions.json');
const TABLE_NAME = 'adminkit_web_push_subscriptions';
const DEVICE_STATUSES = new Set(['pending', 'active', 'revoked', 'disabled']);

let pool = null;

function clean(value) { return String(value || '').trim(); }

function connectionString() {
  return clean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URI || process.env.PG_URL || process.env.PGURI || process.env.NF_POSTGRES_URI || process.env.NF_POSTGRES_URL || process.env.DB_URL || process.env.DB_CONNECTION_STRING);
}

function sslEnabled() {
  const raw = clean(process.env.PGSSL || process.env.POSTGRES_SSL || process.env.DB_SSL).toLowerCase();
  if (!raw) return Boolean(connectionString() && /sslmode=require/i.test(connectionString()));
  return ['1', 'true', 'yes', 'on', 'require'].includes(raw);
}

function isPostgresConfigured() { return Boolean(connectionString()); }

function getPool() {
  if (!isPostgresConfigured()) return null;
  if (!pool) pool = new Pool({ connectionString: connectionString(), ssl: sslEnabled() ? { rejectUnauthorized: false } : undefined });
  return pool;
}

function subscriptionId(subscription) {
  const endpoint = clean(subscription && subscription.endpoint);
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

function deviceIdFor(subscription, meta = {}) {
  const source = `${subscriptionId(subscription)}:${clean(meta.maxUserId)}:${clean(meta.chatId)}`;
  return crypto.createHash('sha256').update(source).digest('hex');
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
  return { endpoint, expirationTime: source.expirationTime || null, keys: { p256dh, auth } };
}

function endpointHost(subscription) {
  const endpoint = clean(subscription && subscription.endpoint);
  if (!endpoint) return '';
  try { return new URL(endpoint).host; } catch { return ''; }
}

function publicSummary(row) {
  const subscription = row && row.subscription ? row.subscription : row;
  const endpoint = clean(subscription && subscription.endpoint);
  return {
    id: clean(row && row.id) || (endpoint ? subscriptionId(subscription).slice(0, 16) : ''),
    deviceId: clean(row && row.deviceId).slice(0, 16),
    endpointHash: endpoint ? subscriptionId(subscription).slice(0, 16) : clean(row && row.endpointHash).slice(0, 16),
    endpointHost: endpointHost(subscription),
    status: clean(row && row.status) || (row && row.disabled ? 'disabled' : 'active'),
    createdAt: clean(row && row.createdAt),
    updatedAt: clean(row && row.updatedAt),
    confirmedAt: clean(row && row.confirmedAt),
    lastSeenAt: clean(row && row.lastSeenAt),
    lastSendAt: clean(row && row.lastSendAt),
    lastSuccessAt: clean(row && row.lastSuccessAt),
    lastError: clean(row && row.lastError).slice(0, 160),
    disabled: Boolean(row && row.disabled)
  };
}

function readFileStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [] };
  } catch { return { subscriptions: [] }; }
}

function writeFileStore(payload) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp-${process.pid}-${Date.now()}`;
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
  const columns = [
    ['max_user_id', 'TEXT NOT NULL DEFAULT \'\''],
    ['chat_id', 'TEXT NOT NULL DEFAULT \'\''],
    ['channel_id', 'TEXT NOT NULL DEFAULT \'\''],
    ['device_id', 'TEXT NOT NULL DEFAULT \'\''],
    ['endpoint_hash', 'TEXT NOT NULL DEFAULT \'\''],
    ['status', 'TEXT NOT NULL DEFAULT \'active\''],
    ['confirmed_at', 'TIMESTAMPTZ'],
    ['last_seen_at', 'TIMESTAMPTZ'],
    ['last_send_at', 'TIMESTAMPTZ']
  ];
  for (const [name, definition] of columns) {
    await client.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS ${name} ${definition}`);
  }
}

function normalizeRow(row) {
  return {
    id: row.id,
    subscription: row.subscription,
    userAgent: row.user_agent || row.userAgent || '',
    disabled: Boolean(row.disabled),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : clean(row.createdAt),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : clean(row.updatedAt),
    lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : clean(row.lastSuccessAt),
    lastError: row.last_error || row.lastError || '',
    maxUserId: row.max_user_id || row.maxUserId || '',
    chatId: row.chat_id || row.chatId || '',
    channelId: row.channel_id || row.channelId || '',
    deviceId: row.device_id || row.deviceId || '',
    endpointHash: row.endpoint_hash || row.endpointHash || '',
    status: row.status || (row.disabled ? 'disabled' : 'active'),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : clean(row.confirmedAt),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : clean(row.lastSeenAt),
    lastSendAt: row.last_send_at ? new Date(row.last_send_at).toISOString() : clean(row.lastSendAt)
  };
}

async function saveSubscription(subscription, meta = {}) {
  const cleanSubscription = sanitizeSubscription(subscription);
  const id = subscriptionId(cleanSubscription);
  const endpointHash = id;
  const userAgent = clean(meta.userAgent).slice(0, 300);
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      await client.query(
        `INSERT INTO ${TABLE_NAME} (id, subscription, user_agent, disabled, created_at, updated_at, last_error, endpoint_hash, status)
         VALUES ($1, $2::jsonb, $3, FALSE, NOW(), NOW(), '', $4, 'active')
         ON CONFLICT (id) DO UPDATE SET subscription = EXCLUDED.subscription, user_agent = EXCLUDED.user_agent, disabled = FALSE, updated_at = NOW(), last_error = '', endpoint_hash = EXCLUDED.endpoint_hash, status = 'active'`,
        [id, JSON.stringify(cleanSubscription), userAgent, endpointHash]
      );
      return { ok: true, id, endpointHash, backend: 'postgres' };
    } finally { client.release(); }
  }
  const payload = readFileStore();
  const now = new Date().toISOString();
  const list = payload.subscriptions;
  const existing = list.find((item) => item && item.id === id);
  if (existing) Object.assign(existing, { subscription: cleanSubscription, userAgent, disabled: false, updatedAt: now, lastError: '', endpointHash, status: 'active' });
  else list.push({ id, subscription: cleanSubscription, userAgent, disabled: false, createdAt: now, updatedAt: now, lastSuccessAt: '', lastError: '', endpointHash, status: 'active' });
  writeFileStore({ subscriptions: list });
  return { ok: true, id, endpointHash, backend: 'file' };
}

async function savePairedDevice(subscription, meta = {}) {
  const cleanSubscription = sanitizeSubscription(subscription);
  const maxUserId = clean(meta.maxUserId);
  const chatId = clean(meta.chatId);
  if (!maxUserId || !chatId) {
    const err = new Error('push_pairing_identity_required');
    err.code = 'push_pairing_identity_required';
    throw err;
  }
  const id = subscriptionId(cleanSubscription);
  const deviceId = deviceIdFor(cleanSubscription, meta);
  const status = DEVICE_STATUSES.has(clean(meta.status)) ? clean(meta.status) : 'pending';
  const endpointHash = id;
  const userAgent = clean(meta.userAgent).slice(0, 300);
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      await client.query(
        `INSERT INTO ${TABLE_NAME} (id, subscription, user_agent, disabled, created_at, updated_at, last_error, max_user_id, chat_id, channel_id, device_id, endpoint_hash, status, confirmed_at, last_seen_at)
         VALUES ($1, $2::jsonb, $3, $4, NOW(), NOW(), '', $5, $6, $7, $8, $9, $10, CASE WHEN $10 = 'active' THEN NOW() ELSE NULL END, NOW())
         ON CONFLICT (id) DO UPDATE SET subscription = EXCLUDED.subscription, user_agent = EXCLUDED.user_agent, disabled = EXCLUDED.disabled, updated_at = NOW(), last_seen_at = NOW(), last_error = '', max_user_id = EXCLUDED.max_user_id, chat_id = EXCLUDED.chat_id, channel_id = EXCLUDED.channel_id, device_id = EXCLUDED.device_id, endpoint_hash = EXCLUDED.endpoint_hash, status = EXCLUDED.status, confirmed_at = CASE WHEN EXCLUDED.status = 'active' THEN COALESCE(${TABLE_NAME}.confirmed_at, NOW()) ELSE ${TABLE_NAME}.confirmed_at END`,
        [id, JSON.stringify(cleanSubscription), userAgent, status !== 'active', maxUserId, chatId, clean(meta.channelId), deviceId, endpointHash, status]
      );
      return { ok: true, id, deviceId, endpointHash, status, backend: 'postgres' };
    } finally { client.release(); }
  }
  const payload = readFileStore();
  const now = new Date().toISOString();
  const list = payload.subscriptions;
  const existing = list.find((item) => item && item.id === id);
  const row = { id, subscription: cleanSubscription, userAgent, disabled: status !== 'active', updatedAt: now, lastError: '', maxUserId, chatId, channelId: clean(meta.channelId), deviceId, endpointHash, status, lastSeenAt: now };
  if (status === 'active') row.confirmedAt = now;
  if (existing) Object.assign(existing, row);
  else list.push({ ...row, createdAt: now, lastSuccessAt: '', lastSendAt: '' });
  writeFileStore({ subscriptions: list });
  return { ok: true, id, deviceId, endpointHash, status, backend: 'file' };
}

async function listActiveSubscriptions() {
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      const result = await client.query(`SELECT * FROM ${TABLE_NAME} WHERE disabled = FALSE ORDER BY updated_at DESC`);
      return result.rows.map(normalizeRow);
    } finally { client.release(); }
  }
  return readFileStore().subscriptions.filter((item) => item && !item.disabled).map(normalizeRow);
}

async function listDevicesForUser({ maxUserId, chatId, includePending = false } = {}) {
  const statuses = includePending ? ['active', 'pending'] : ['active'];
  const targetUser = clean(maxUserId);
  const targetChat = clean(chatId);
  if (!targetUser || !targetChat) return [];
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      const result = await client.query(`SELECT * FROM ${TABLE_NAME} WHERE max_user_id = $1 AND chat_id = $2 AND status = ANY($3) AND disabled = FALSE ORDER BY updated_at DESC`, [targetUser, targetChat, statuses]);
      return result.rows.map(normalizeRow);
    } finally { client.release(); }
  }
  return readFileStore().subscriptions.map(normalizeRow).filter((item) => item.maxUserId === targetUser && item.chatId === targetChat && statuses.includes(item.status) && !item.disabled);
}

async function findDeviceByDeviceId(deviceId) {
  const safeDeviceId = clean(deviceId);
  if (!safeDeviceId) return null;
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      const result = await client.query(`SELECT * FROM ${TABLE_NAME} WHERE device_id = $1 LIMIT 1`, [safeDeviceId]);
      return result.rows[0] ? normalizeRow(result.rows[0]) : null;
    } finally { client.release(); }
  }
  return readFileStore().subscriptions.map(normalizeRow).find((entry) => entry.deviceId === safeDeviceId) || null;
}

async function markDeviceActive(deviceId, meta = {}) {
  const safeDeviceId = clean(deviceId);
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      const params = [safeDeviceId];
      let guard = '';
      if (clean(meta.maxUserId)) { params.push(clean(meta.maxUserId)); guard += ` AND max_user_id = $${params.length}`; }
      if (clean(meta.chatId)) { params.push(clean(meta.chatId)); guard += ` AND chat_id = $${params.length}`; }
      if (clean(meta.requireStatus)) { params.push(clean(meta.requireStatus)); guard += ` AND status = $${params.length}`; }
      const result = await client.query(`UPDATE ${TABLE_NAME} SET status = 'active', disabled = FALSE, confirmed_at = NOW(), updated_at = NOW() WHERE device_id = $1${guard}`, params);
      return { ok: result.rowCount > 0 };
    } finally { client.release(); }
  }
  const payload = readFileStore();
  const item = payload.subscriptions.map(normalizeRow).find((entry) => entry.deviceId === safeDeviceId && (!clean(meta.maxUserId) || entry.maxUserId === clean(meta.maxUserId)) && (!clean(meta.chatId) || entry.chatId === clean(meta.chatId)) && (!clean(meta.requireStatus) || entry.status === clean(meta.requireStatus)));
  if (!item) return { ok: false };
  const original = payload.subscriptions.find((entry) => entry && entry.id === item.id);
  Object.assign(original, { status: 'active', disabled: false, confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  writeFileStore(payload);
  return { ok: true };
}

async function markResult(id, result = {}) {
  const ok = Boolean(result.ok);
  const error = clean(result.error).slice(0, 500);
  const disable = Boolean(result.disable);
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      await client.query(`UPDATE ${TABLE_NAME} SET last_success_at = CASE WHEN $2 THEN NOW() ELSE last_success_at END, last_send_at = NOW(), last_error = $3, disabled = CASE WHEN $4 THEN TRUE ELSE disabled END, status = CASE WHEN $4 THEN 'disabled' ELSE status END, updated_at = NOW() WHERE id = $1`, [id, ok, error, disable]);
      return;
    } finally { client.release(); }
  }
  const payload = readFileStore();
  const item = payload.subscriptions.find((entry) => entry && entry.id === id);
  if (item) {
    if (ok) item.lastSuccessAt = new Date().toISOString();
    item.lastSendAt = new Date().toISOString();
    item.lastError = error;
    if (disable) { item.disabled = true; item.status = 'disabled'; }
    item.updatedAt = new Date().toISOString();
    writeFileStore(payload);
  }
}

async function countSubscriptions() { return (await listActiveSubscriptions()).length; }
async function listPublicDeviceSummaries() { return (await listActiveSubscriptions()).map(publicSummary); }

function info() { return { backend: isPostgresConfigured() ? 'postgres' : 'file', persistent: isPostgresConfigured(), table: isPostgresConfigured() ? TABLE_NAME : '', file: isPostgresConfigured() ? '' : DATA_FILE }; }

module.exports = { saveSubscription, savePairedDevice, listActiveSubscriptions, listDevicesForUser, listPublicDeviceSummaries, findDeviceByDeviceId, markDeviceActive, markResult, countSubscriptions, publicSummary, subscriptionId, sanitizeSubscription, info };
