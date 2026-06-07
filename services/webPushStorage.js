'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'web-push-subscriptions.json');
const TABLE_NAME = 'adminkit_web_push_subscriptions';
const BINDINGS_TABLE_NAME = 'adminkit_web_push_chat_bindings';
const DEVICE_STATUSES = new Set(['pending', 'active', 'revoked', 'disabled']);

let pool = null;

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function bindingKey({ maxUserId, chatId, deviceId, endpointHash } = {}) {
  return crypto.createHash('sha256').update([clean(maxUserId), clean(chatId), clean(deviceId) || clean(endpointHash)].join(':')).digest('hex');
}

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

function subscriptionShape(input) {
  const source = input && typeof input === 'object' ? input : {};
  const keys = source.keys && typeof source.keys === 'object' ? source.keys : {};
  const endpoint = clean(source.endpoint);
  const p256dh = clean(keys.p256dh);
  const auth = clean(keys.auth);
  return {
    hasEndpoint: Boolean(endpoint),
    hasKeys: Boolean(source.keys && typeof source.keys === 'object'),
    hasP256dh: Boolean(p256dh),
    hasAuth: Boolean(auth),
    endpointLength: endpoint.length,
    p256dhLength: p256dh.length,
    authLength: auth.length
  };
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
    err.subscriptionShape = subscriptionShape(source);
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
    return { subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [], chatBindings: Array.isArray(parsed.chatBindings) ? parsed.chatBindings : [] };
  } catch { return { subscriptions: [], chatBindings: [] }; }
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
  await client.query(`CREATE TABLE IF NOT EXISTS ${BINDINGS_TABLE_NAME} (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL DEFAULT '',
    endpoint_hash TEXT NOT NULL DEFAULT '',
    max_user_id TEXT NOT NULL DEFAULT '',
    chat_id TEXT NOT NULL DEFAULT '',
    channel_id TEXT NOT NULL DEFAULT '',
    chat_title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${BINDINGS_TABLE_NAME}_chat_active ON ${BINDINGS_TABLE_NAME}(chat_id, status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_${BINDINGS_TABLE_NAME}_user_active ON ${BINDINGS_TABLE_NAME}(max_user_id, status)`);
}

function normalizeBindingRow(row) {
  return {
    id: clean(row.id),
    deviceId: clean(row.device_id || row.deviceId),
    endpointHash: clean(row.endpoint_hash || row.endpointHash),
    maxUserId: clean(row.max_user_id || row.maxUserId),
    chatId: clean(row.chat_id || row.chatId),
    channelId: clean(row.channel_id || row.channelId),
    chatTitle: clean(row.chat_title || row.chatTitle),
    status: clean(row.status) || 'active',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : clean(row.createdAt),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : clean(row.updatedAt)
  };
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
  writeFileStore({ ...payload, subscriptions: list });
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
      if (status === 'active') await upsertChatBindingForDevice({ maxUserId, chatId, channelId: clean(meta.channelId), chatTitle: clean(meta.chatTitle), deviceId, endpointHash });
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
  writeFileStore({ ...payload, subscriptions: list });
  if (status === 'active') await upsertChatBindingForDevice({ maxUserId, chatId, channelId: clean(meta.channelId), chatTitle: clean(meta.chatTitle), deviceId, endpointHash });
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
  if (!targetUser) return [];
  if (targetChat && !includePending) return listActiveDevicesForChatAndUser({ chatId: targetChat, maxUserId: targetUser });
  if (!targetChat) return includePending ? [] : listActiveDevicesForUser(targetUser);
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
      if (result.rowCount > 0) {
        const row = await client.query(`SELECT * FROM ${TABLE_NAME} WHERE device_id = $1 LIMIT 1`, [safeDeviceId]);
        const device = row.rows[0] ? normalizeRow(row.rows[0]) : null;
        if (device && device.maxUserId && device.chatId) {
          await client.query(
            `INSERT INTO ${BINDINGS_TABLE_NAME} (id, device_id, endpoint_hash, max_user_id, chat_id, channel_id, chat_title, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, '', 'active', NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = NOW()`,
            [bindingKey({ maxUserId: device.maxUserId, chatId: device.chatId, deviceId: device.deviceId, endpointHash: device.endpointHash }), device.deviceId, device.endpointHash, device.maxUserId, device.chatId, device.channelId]
          );
        }
      }
      return { ok: result.rowCount > 0 };
    } finally { client.release(); }
  }
  const payload = readFileStore();
  const item = payload.subscriptions.map(normalizeRow).find((entry) => entry.deviceId === safeDeviceId && (!clean(meta.maxUserId) || entry.maxUserId === clean(meta.maxUserId)) && (!clean(meta.chatId) || entry.chatId === clean(meta.chatId)) && (!clean(meta.requireStatus) || entry.status === clean(meta.requireStatus)));
  if (!item) return { ok: false };
  const original = payload.subscriptions.find((entry) => entry && entry.id === item.id);
  Object.assign(original, { status: 'active', disabled: false, confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  writeFileStore(payload);
  await upsertChatBindingForDevice({ maxUserId: item.maxUserId, chatId: item.chatId, channelId: item.channelId, deviceId: item.deviceId, endpointHash: item.endpointHash });
  return { ok: true };
}


async function upsertChatBindingForDevice({ maxUserId, chatId, channelId = '', chatTitle = '', deviceId = '', endpointHash = '' } = {}) {
  const safeUser = clean(maxUserId);
  const safeChat = clean(chatId);
  const safeDevice = clean(deviceId);
  const safeEndpoint = clean(endpointHash);
  if (!safeUser || !safeChat || (!safeDevice && !safeEndpoint)) return { ok: false, error: 'push_binding_identity_required' };
  const id = bindingKey({ maxUserId: safeUser, chatId: safeChat, deviceId: safeDevice, endpointHash: safeEndpoint });
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      await client.query(
        `INSERT INTO ${BINDINGS_TABLE_NAME} (id, device_id, endpoint_hash, max_user_id, chat_id, channel_id, chat_title, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET channel_id = EXCLUDED.channel_id, chat_title = COALESCE(NULLIF(EXCLUDED.chat_title, ''), ${BINDINGS_TABLE_NAME}.chat_title), status = 'active', updated_at = NOW()`,
        [id, safeDevice, safeEndpoint, safeUser, safeChat, clean(channelId), clean(chatTitle).slice(0, 180)]
      );
      return { ok: true, id, created: true };
    } finally { client.release(); }
  }
  const payload = readFileStore();
  const list = payload.chatBindings || [];
  const existing = list.find((item) => item && item.id === id);
  const now = nowIso();
  const row = { id, deviceId: safeDevice, endpointHash: safeEndpoint, maxUserId: safeUser, chatId: safeChat, channelId: clean(channelId), chatTitle: clean(chatTitle).slice(0, 180), status: 'active', updatedAt: now };
  if (existing) Object.assign(existing, row, { chatTitle: row.chatTitle || clean(existing.chatTitle), createdAt: existing.createdAt || now });
  else list.push({ ...row, createdAt: now });
  writeFileStore({ ...payload, chatBindings: list });
  return { ok: true, id, created: !existing };
}

async function listActiveDevicesForUser(maxUserId) {
  const targetUser = clean(maxUserId);
  if (!targetUser) return [];
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      const result = await client.query(`SELECT * FROM ${TABLE_NAME} WHERE max_user_id = $1 AND status = 'active' AND disabled = FALSE ORDER BY updated_at DESC`, [targetUser]);
      return result.rows.map(normalizeRow);
    } finally { client.release(); }
  }
  return readFileStore().subscriptions.map(normalizeRow).filter((item) => item.maxUserId === targetUser && item.status === 'active' && !item.disabled);
}

async function upsertChatBindingForUserDevices({ maxUserId, chatId, channelId = '', chatTitle = '' } = {}) {
  const devices = await listActiveDevicesForUser(maxUserId);
  const results = [];
  for (const device of devices) {
    results.push(await upsertChatBindingForDevice({ maxUserId, chatId, channelId, chatTitle, deviceId: device.deviceId, endpointHash: device.endpointHash }));
  }
  return { ok: true, devices: devices.length, bindings: results.filter((item) => item.ok).length, results };
}

async function listChatBindingsForUser(maxUserId) {
  const targetUser = clean(maxUserId);
  if (!targetUser) return [];
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      const result = await client.query(`SELECT * FROM ${BINDINGS_TABLE_NAME} WHERE max_user_id = $1 AND status = 'active' ORDER BY updated_at DESC`, [targetUser]);
      return result.rows.map(normalizeBindingRow);
    } finally { client.release(); }
  }
  return (readFileStore().chatBindings || []).map(normalizeBindingRow).filter((item) => item.maxUserId === targetUser && item.status === 'active');
}

async function isChatBoundForUser(maxUserId, chatId) {
  const targetChat = clean(chatId);
  if (!targetChat) return false;
  return (await listChatBindingsForUser(maxUserId)).some((item) => item.chatId === targetChat);
}

async function listActiveDevicesForChat(chatId) {
  const targetChat = clean(chatId);
  if (!targetChat) return [];
  const p = getPool();
  if (p) {
    const client = await p.connect();
    try {
      await ensureTable(client);
      const result = await client.query(`SELECT s.* FROM ${TABLE_NAME} s JOIN ${BINDINGS_TABLE_NAME} b ON ((b.device_id <> '' AND b.device_id = s.device_id) OR (b.endpoint_hash <> '' AND b.endpoint_hash = s.endpoint_hash)) WHERE b.chat_id = $1 AND b.status = 'active' AND s.status = 'active' AND s.disabled = FALSE UNION SELECT * FROM ${TABLE_NAME} WHERE chat_id = $1 AND status = 'active' AND disabled = FALSE ORDER BY updated_at DESC`, [targetChat]);
      const seen = new Set();
      return result.rows.map(normalizeRow).filter((item) => { const key = item.deviceId || item.endpointHash || item.id; if (seen.has(key)) return false; seen.add(key); return true; });
    } finally { client.release(); }
  }
  const payload = readFileStore();
  const activeBindings = (payload.chatBindings || []).map(normalizeBindingRow).filter((item) => item.chatId === targetChat && item.status === 'active');
  const allowed = new Set(activeBindings.map((item) => item.deviceId || item.endpointHash).filter(Boolean));
  return payload.subscriptions.map(normalizeRow).filter((item) => item.status === 'active' && !item.disabled && (allowed.has(item.deviceId || item.endpointHash) || item.chatId === targetChat));
}

async function listActiveDevicesForChatAndUser({ chatId, maxUserId } = {}) {
  const targetUser = clean(maxUserId);
  if (!targetUser) return [];
  return (await listActiveDevicesForChat(chatId)).filter((item) => item.maxUserId === targetUser);
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

module.exports = { saveSubscription, savePairedDevice, listActiveSubscriptions, listDevicesForUser, listActiveDevicesForUser, upsertChatBindingForDevice, upsertChatBindingForUserDevices, listChatBindingsForUser, isChatBoundForUser, listActiveDevicesForChat, listActiveDevicesForChatAndUser, listPublicDeviceSummaries, findDeviceByDeviceId, markDeviceActive, markResult, countSubscriptions, publicSummary, subscriptionId, subscriptionShape, sanitizeSubscription, info };
