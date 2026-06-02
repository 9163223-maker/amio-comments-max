'use strict';

const crypto = require('crypto');
const storeModule = require('../store');
const db = require('../src/db/postgres');

const ACCESS_NAMESPACE = 'clientAccess';
const RUNTIME = 'CC8.3.46-PR106-ACCOUNT-ACCESS-RUNTIME';

let bootstrapState = {
  attempted: false,
  ok: false,
  tenantTablesReady: false,
  error: '',
  at: ''
};

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function codeHash(code = '') { return crypto.createHash('sha256').update(clean(code).toUpperCase().replace(/\s+/g, '')).digest('hex'); }
function makeId(prefix = 'tenant') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
function postgresConfigured() { return db.hasDatabaseUrl(); }
function postgresPersistent() { return postgresConfigured() && (process.env.ADMINKIT_STORE_PERSISTENT === '1' || process.env.ADMINKIT_STORE_BACKEND === 'postgres' || process.env.ADMINKIT_STORE_MODE === 'postgres' || process.env.ADMINKIT_STORE_POSTGRES_CONFIGURED === '1' || process.env.NODE_ENV === 'production'); }
function storeFallbackAllowed() { return ['1', 'true', 'yes', 'on'].includes(clean(process.env.ADMINKIT_CLIENT_ACCESS_STORE_FALLBACK).toLowerCase()) || process.env.NODE_ENV !== 'production' || process.env.ADMINKIT_TEST_MODE === '1'; }

function ns() {
  const root = storeModule.store;
  if (!root[ACCESS_NAMESPACE] || typeof root[ACCESS_NAMESPACE] !== 'object') root[ACCESS_NAMESPACE] = {};
  const n = root[ACCESS_NAMESPACE];
  if (!n.clients || typeof n.clients !== 'object') n.clients = {};
  if (!n.tenants || typeof n.tenants !== 'object') n.tenants = {};
  if (!n.tenantUsers || typeof n.tenantUsers !== 'object') n.tenantUsers = {};
  if (!n.tenantChannels || typeof n.tenantChannels !== 'object') n.tenantChannels = {};
  if (!n.activationCodes || typeof n.activationCodes !== 'object') n.activationCodes = {};
  if (!Array.isArray(n.accessEvents)) n.accessEvents = [];
  if (!n.channelsByUser || typeof n.channelsByUser !== 'object') n.channelsByUser = {};
  if (!n.pendingActivation || typeof n.pendingActivation !== 'object') n.pendingActivation = {};
  return n;
}
function persist() { storeModule.saveStore(storeModule.store); }
function sourceBackend() { return postgresConfigured() && bootstrapState.tenantTablesReady ? 'postgres' : 'store'; }
function persistent() { return sourceBackend() === 'postgres' || storeFallbackAllowed(); }


async function hydrateFromDb() {
  const n = ns();
  const [tenants, tenantUsers, tenantChannels, activationCodes, events] = await Promise.all([
    db.query('SELECT tenant_id, owner_max_user_id, status, plan_id, expires_at, max_channels, source, metadata, created_at, updated_at FROM ak_tenants'),
    db.query('SELECT tenant_id, max_user_id, role, status, created_at, updated_at FROM ak_tenant_users'),
    db.query('SELECT tenant_id, channel_id, channel_title, status, connected_at, bound_by_code, metadata, updated_at FROM ak_tenant_channels'),
    db.query('SELECT code_hash, plan_id, duration_days, max_channels, expires_at, status, single_use, used_at, used_by_max_user_id, tenant_id, bound_channel_id, metadata, created_at, updated_at FROM ak_activation_codes'),
    db.query('SELECT event_id, tenant_id, max_user_id, event_type, payload, created_at FROM ak_access_events ORDER BY created_at DESC LIMIT 1000')
  ]);
  for (const row of tenants.rows || []) {
    n.tenants[row.tenant_id] = { tenantId: row.tenant_id, ownerMaxUserId: row.owner_max_user_id, status: row.status, planId: row.plan_id, expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : '', maxChannels: Number(row.max_channels || 1), source: row.source || 'postgres', metadata: row.metadata || {}, createdAt: row.created_at ? new Date(row.created_at).toISOString() : '', updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '' };
  }
  for (const row of tenantUsers.rows || []) {
    n.tenantUsers[`${row.tenant_id}:${row.max_user_id}`] = { tenantId: row.tenant_id, maxUserId: row.max_user_id, role: row.role, status: row.status, createdAt: row.created_at ? new Date(row.created_at).toISOString() : '', updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '' };
  }
  for (const row of tenantChannels.rows || []) {
    n.tenantChannels[row.channel_id] = { tenantId: row.tenant_id, channelId: row.channel_id, channelTitle: row.channel_title || '', status: row.status, connectedAt: row.connected_at ? new Date(row.connected_at).toISOString() : '', boundByCode: row.bound_by_code || '', metadata: row.metadata || {}, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '' };
  }
  for (const row of activationCodes.rows || []) {
    n.activationCodes[row.code_hash] = { codeHash: row.code_hash, codeHashPrefix: String(row.code_hash || '').slice(0, 12), planId: row.plan_id, durationDays: Number(row.duration_days || 30), maxChannels: Number(row.max_channels || 1), expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : '', status: row.status, singleUse: row.single_use !== false, usedAt: row.used_at ? new Date(row.used_at).toISOString() : '', usedByMaxUserId: row.used_by_max_user_id || '', tenantId: row.tenant_id || '', boundChannelId: row.bound_channel_id || '', metadata: row.metadata || {}, createdAt: row.created_at ? new Date(row.created_at).toISOString() : '', updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '' };
  }
  n.accessEvents = (events.rows || []).map((row) => ({ eventId: row.event_id, tenantId: row.tenant_id || '', maxUserId: row.max_user_id || '', eventType: row.event_type, payload: row.payload || {}, createdAt: row.created_at ? new Date(row.created_at).toISOString() : '' }));
  persist();
}

async function ensureTables() {
  bootstrapState = { ...bootstrapState, attempted: true, at: nowIso() };
  if (!postgresConfigured()) {
    bootstrapState = { attempted: true, ok: false, tenantTablesReady: false, error: 'postgres_not_configured', at: nowIso() };
    return bootstrapState;
  }
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS ak_tenants (
      tenant_id TEXT PRIMARY KEY,
      owner_max_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      plan_id TEXT NOT NULL DEFAULT 'free',
      expires_at TIMESTAMPTZ,
      max_channels INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'adminkit',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS ak_tenant_users (
      tenant_id TEXT NOT NULL REFERENCES ak_tenants(tenant_id) ON DELETE CASCADE,
      max_user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, max_user_id)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS ak_tenant_channels (
      tenant_id TEXT NOT NULL REFERENCES ak_tenants(tenant_id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL PRIMARY KEY,
      channel_title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      bound_by_code TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS ak_activation_codes (
      code_hash TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      max_channels INTEGER NOT NULL DEFAULT 1,
      expires_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'active',
      single_use BOOLEAN NOT NULL DEFAULT TRUE,
      used_at TIMESTAMPTZ,
      used_by_max_user_id TEXT NOT NULL DEFAULT '',
      tenant_id TEXT NOT NULL DEFAULT '',
      bound_channel_id TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS ak_access_events (
      event_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      max_user_id TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await hydrateFromDb();
    bootstrapState = { attempted: true, ok: true, tenantTablesReady: true, error: '', at: nowIso() };
  } catch (error) {
    bootstrapState = { attempted: true, ok: false, tenantTablesReady: false, error: error?.message || String(error), at: nowIso() };
  }
  return bootstrapState;
}

function bootstrap() { return ensureTables(); }

function getClient(maxUserId) { return ns().clients[clean(maxUserId)] || null; }
function saveClient(profile) { if (!profile?.maxUserId) return null; ns().clients[clean(profile.maxUserId)] = profile; persist(); scheduleDbUpsertTenant(profile); return profile; }
function getTenant(tenantId) { return ns().tenants[clean(tenantId)] || null; }
function getTenantByUserId(maxUserId) {
  const id = clean(maxUserId);
  const userLinks = Object.values(ns().tenantUsers).filter((item) => clean(item.maxUserId) === id && clean(item.status || 'active') === 'active');
  const ownerTenant = Object.values(ns().tenants).find((tenant) => clean(tenant.ownerMaxUserId) === id);
  return getTenant(userLinks[0]?.tenantId || ownerTenant?.tenantId || getClient(id)?.tenantId || '');
}
function saveTenant(tenant) { if (!tenant?.tenantId) return null; ns().tenants[clean(tenant.tenantId)] = tenant; persist(); scheduleDbUpsertTenant(tenant); return tenant; }
function saveTenantUser(user) { if (!user?.tenantId || !user?.maxUserId) return null; ns().tenantUsers[`${clean(user.tenantId)}:${clean(user.maxUserId)}`] = user; persist(); scheduleDbUpsertTenantUser(user); return user; }
function getTenantUsers(tenantId) { return Object.values(ns().tenantUsers).filter((item) => clean(item.tenantId) === clean(tenantId)); }
function getActivationCodeByHash(hash) { return ns().activationCodes[clean(hash)] || null; }
function saveActivationCode(item) { if (!item?.codeHash) return null; ns().activationCodes[clean(item.codeHash)] = item; persist(); scheduleDbUpsertActivationCode(item); return item; }
function recordEvent({ tenantId = '', maxUserId = '', eventType = '', payload = {} } = {}) {
  const event = { eventId: makeId('evt'), tenantId: clean(tenantId), maxUserId: clean(maxUserId), eventType: clean(eventType), payload: payload || {}, createdAt: nowIso() };
  ns().accessEvents.unshift(event);
  ns().accessEvents = ns().accessEvents.slice(0, 1000);
  persist(); scheduleDbInsertEvent(event); return event;
}
function getAccessEvents(tenantId = '') { return ns().accessEvents.filter((event) => !tenantId || clean(event.tenantId) === clean(tenantId)); }

function upsertTenantForUser({ maxUserId, name = '', planId = 'free', status = 'active', expiresAt = '', maxChannels = 1, source = 'activation_code' } = {}) {
  const userId = clean(maxUserId);
  if (!userId) return null;
  const existing = getTenantByUserId(userId);
  const tenant = {
    ...(existing || {}),
    tenantId: existing?.tenantId || makeId('tenant'),
    ownerMaxUserId: existing?.ownerMaxUserId || userId,
    status,
    planId,
    expiresAt,
    maxChannels: Number(maxChannels || existing?.maxChannels || 1),
    source,
    metadata: { ...(existing?.metadata || {}), ownerName: name || existing?.metadata?.ownerName || '' },
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  saveTenant(tenant);
  saveTenantUser({ tenantId: tenant.tenantId, maxUserId: userId, role: 'owner', status: 'active', createdAt: nowIso(), updatedAt: nowIso() });
  return tenant;
}

function listTenantChannels(tenantId = '') { return Object.values(ns().tenantChannels).filter((ch) => clean(ch.tenantId) === clean(tenantId) && clean(ch.status || 'active') === 'active'); }
function findChannelOwner(channelId = '') { return ns().tenantChannels[clean(channelId)] || null; }
function bindTenantChannel({ tenantId, channelId, channelTitle = '', boundByCode = '', maxChannels = 1, metadata = {} } = {}) {
  const tid = clean(tenantId), cid = clean(channelId);
  if (!tid || !cid) return { ok: false, error: 'missing_channel', message: 'Не удалось определить канал.' };
  const existing = findChannelOwner(cid);
  if (existing && clean(existing.tenantId) !== tid) {
    recordEvent({ tenantId: tid, eventType: 'channel_conflict', payload: { channelId: cid, ownerTenantId: existing.tenantId } });
    return { ok: false, error: 'channel_owned_by_another_tenant', message: 'Канал уже привязан к другому клиенту. Напишите менеджеру для проверки доступа.' };
  }
  const current = listTenantChannels(tid);
  if (!existing && current.length >= Number(maxChannels || 1)) {
    recordEvent({ tenantId: tid, eventType: 'channel_limit_reached', payload: { channelId: cid, maxChannels } });
    return { ok: false, error: 'channel_limit_reached', message: 'Лимит каналов по тарифу достигнут. Для увеличения лимита выберите продление или обратитесь к менеджеру.' };
  }
  const item = { ...(existing || {}), tenantId: tid, channelId: cid, channelTitle: clean(channelTitle), status: 'active', connectedAt: existing?.connectedAt || nowIso(), boundByCode: clean(boundByCode), metadata: metadata || {}, updatedAt: nowIso() };
  ns().tenantChannels[cid] = item;
  persist(); scheduleDbUpsertTenantChannel(item); recordEvent({ tenantId: tid, eventType: 'channel_bound', payload: { channelId: cid, boundByCode: Boolean(boundByCode) } });
  return { ok: true, channel: item };
}

function pendingActivation() { return ns().pendingActivation; }
function resetForTests() { storeModule.store[ACCESS_NAMESPACE] = { clients: {}, tenants: {}, tenantUsers: {}, tenantChannels: {}, activationCodes: {}, accessEvents: [], channelsByUser: {}, pendingActivation: {} }; persist(); bootstrapState = { attempted: false, ok: false, tenantTablesReady: false, error: '', at: '' }; }

function publicInfo() {
  const pg = postgresConfigured();
  const pgPersistent = postgresPersistent();
  const fallbackAllowed = storeFallbackAllowed();
  const backend = sourceBackend();
  return {
    runtimeVersion: RUNTIME,
    clientAccessStorageBackend: backend,
    clientAccessPersistent: backend === 'postgres' ? true : fallbackAllowed,
    clientAccessNamespaceReady: true,
    tenantStorageBackend: backend,
    tenantTablesReady: bootstrapState.tenantTablesReady === true,
    postgresConfigured: pg,
    postgresPersistent: pgPersistent,
    clientAccessFallbackMode: backend === 'store' ? (pg ? 'store_fallback_db_unavailable' : 'store_fallback_no_postgres') : '',
    clientAccessStoreFallbackAllowed: fallbackAllowed,
    bootstrapAttempted: bootstrapState.attempted,
    bootstrapError: bootstrapState.error || '',
    paidProductionBlocker: pgPersistent && !bootstrapState.tenantTablesReady
  };
}

function sanitizedSnapshot() {
  const n = ns();
  return {
    ...publicInfo(),
    tenants: Object.keys(n.tenants).length,
    tenantUsers: Object.keys(n.tenantUsers).length,
    tenantChannels: Object.keys(n.tenantChannels).length,
    activationCodes: Object.values(n.activationCodes).map((item) => ({ codeHashPrefix: clean(item.codeHash).slice(0, 12), planId: item.planId, status: item.status, expiresAt: item.expiresAt, usedAt: item.usedAt, tenantId: item.tenantId || '', boundChannelId: item.boundChannelId || '' })),
    accessEvents: n.accessEvents.length
  };
}

function schedule(promiseFactory) { if (!(postgresConfigured() && bootstrapState.tenantTablesReady)) return; promiseFactory().catch((error) => { bootstrapState = { ...bootstrapState, error: error?.message || String(error) }; }); }
function scheduleDbUpsertTenant(item) { if (!item || !item.tenantId) return; schedule(() => db.query(`INSERT INTO ak_tenants (tenant_id, owner_max_user_id, status, plan_id, expires_at, max_channels, source, metadata, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,COALESCE($9::timestamptz,NOW()),NOW()) ON CONFLICT (tenant_id) DO UPDATE SET owner_max_user_id=EXCLUDED.owner_max_user_id,status=EXCLUDED.status,plan_id=EXCLUDED.plan_id,expires_at=EXCLUDED.expires_at,max_channels=EXCLUDED.max_channels,source=EXCLUDED.source,metadata=EXCLUDED.metadata,updated_at=NOW()`, [item.tenantId, item.ownerMaxUserId || item.maxUserId || '', item.status || 'active', item.planId || 'free', item.expiresAt || null, Number(item.maxChannels || 1), item.source || 'adminkit', JSON.stringify(item.metadata || {}), item.createdAt || null])); }
function scheduleDbUpsertTenantUser(item) { if (!item || !item.tenantId || !item.maxUserId) return; schedule(() => db.query(`INSERT INTO ak_tenant_users (tenant_id, max_user_id, role, status, created_at, updated_at) VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,NOW()),NOW()) ON CONFLICT (tenant_id, max_user_id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,updated_at=NOW()`, [item.tenantId, item.maxUserId, item.role || 'owner', item.status || 'active', item.createdAt || null])); }
function scheduleDbUpsertTenantChannel(item) { if (!item || !item.tenantId || !item.channelId) return; schedule(() => db.query(`INSERT INTO ak_tenant_channels (tenant_id, channel_id, channel_title, status, connected_at, bound_by_code, metadata, updated_at) VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,NOW()),$6,$7::jsonb,NOW()) ON CONFLICT (channel_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,channel_title=EXCLUDED.channel_title,status=EXCLUDED.status,bound_by_code=EXCLUDED.bound_by_code,metadata=EXCLUDED.metadata,updated_at=NOW()`, [item.tenantId, item.channelId, item.channelTitle || '', item.status || 'active', item.connectedAt || null, item.boundByCode || '', JSON.stringify(item.metadata || {})])); }
function scheduleDbUpsertActivationCode(item) { if (!item || !item.codeHash) return; schedule(() => db.query(`INSERT INTO ak_activation_codes (code_hash, plan_id, duration_days, max_channels, expires_at, status, single_use, used_at, used_by_max_user_id, tenant_id, bound_channel_id, metadata, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,COALESCE($13::timestamptz,NOW()),NOW()) ON CONFLICT (code_hash) DO UPDATE SET plan_id=EXCLUDED.plan_id,duration_days=EXCLUDED.duration_days,max_channels=EXCLUDED.max_channels,expires_at=EXCLUDED.expires_at,status=EXCLUDED.status,single_use=EXCLUDED.single_use,used_at=EXCLUDED.used_at,used_by_max_user_id=EXCLUDED.used_by_max_user_id,tenant_id=EXCLUDED.tenant_id,bound_channel_id=EXCLUDED.bound_channel_id,metadata=EXCLUDED.metadata,updated_at=NOW()`, [item.codeHash, item.planId, Number(item.durationDays || 30), Number(item.maxChannels || 1), item.expiresAt || null, item.status || 'active', item.singleUse !== false, item.usedAt || null, item.usedByMaxUserId || '', item.tenantId || '', item.boundChannelId || '', JSON.stringify(item.metadata || {}), item.createdAt || null])); }
function scheduleDbInsertEvent(event) { if (!event || !event.eventId) return; schedule(() => db.query(`INSERT INTO ak_access_events (event_id, tenant_id, max_user_id, event_type, payload, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,COALESCE($6::timestamptz,NOW())) ON CONFLICT (event_id) DO NOTHING`, [event.eventId, event.tenantId || '', event.maxUserId || '', event.eventType, JSON.stringify(event.payload || {}), event.createdAt || null])); }

module.exports = { RUNTIME, ACCESS_NAMESPACE, bootstrap, ensureTables, publicInfo, sanitizedSnapshot, ns, persist, codeHash, getClient, saveClient, getTenant, getTenantByUserId, saveTenant, saveTenantUser, getTenantUsers, upsertTenantForUser, listTenantChannels, bindTenantChannel, findChannelOwner, getActivationCodeByHash, saveActivationCode, recordEvent, getAccessEvents, pendingActivation, resetForTests };
