'use strict';

const dataSafety = require('./dataSafety');

const RUNTIME = 'ADMINKIT-CORE-ACCOUNT-MANAGER-1.1-CACHED-PLAN-LOOKUP';
const DEFAULT_PLAN = 'free';
const CACHE_TTL_MS = 30 * 1000;
const accountCache = new Map();
let ensuredAt = 0;

function now() { return Date.now(); }
function cacheKey(id = '') { return String(id || '').trim(); }
function getCached(id = '') {
  const key = cacheKey(id);
  if (!key) return null;
  const item = accountCache.get(key);
  if (!item || (now() - item.at) > CACHE_TTL_MS) return null;
  return item.account || null;
}
function setCached(id = '', account = null) {
  const key = cacheKey(id);
  if (!key || !account) return account;
  accountCache.set(key, { at: now(), account });
  if (accountCache.size > 100) accountCache.delete(accountCache.keys().next().value);
  return account;
}
function clearCache(adminId = '') {
  const id = cacheKey(adminId);
  if (id) accountCache.delete(id); else accountCache.clear();
}

async function ensure() {
  if (ensuredAt && (now() - ensuredAt) < CACHE_TTL_MS) return { ok: true, runtimeVersion: RUNTIME, cached: true };
  await dataSafety.ensureCoreStorage();
  await dataSafety.safeQuery("create table if not exists ak_accounts (account_id text primary key, plan_code text not null default 'free', status text not null default 'active', features_override jsonb not null default '{}'::jsonb, limits_override jsonb not null default '{}'::jsonb, meta jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
  await dataSafety.safeQuery("create table if not exists ak_account_admins (admin_id text primary key, account_id text not null, role text not null default 'owner', meta jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
  await dataSafety.safeQuery("create table if not exists ak_plan_events (id bigserial primary key, account_id text not null, old_plan_code text not null default '', new_plan_code text not null, reason text not null default '', meta jsonb not null default '{}'::jsonb, created_at timestamptz default now())");
  await dataSafety.safeQuery('create index if not exists ak_account_admins_account_idx on ak_account_admins(account_id)');
  await dataSafety.safeQuery('create index if not exists ak_plan_events_account_idx on ak_plan_events(account_id, created_at desc)');
  ensuredAt = now();
  return { ok: true, runtimeVersion: RUNTIME, cached: false };
}

function normalizeAdminId(adminId) { return String(adminId || '').trim(); }
function defaultAccountIdForAdmin(adminId) { const id = normalizeAdminId(adminId); return id ? `admin:${id}` : 'debug-account'; }

async function getAccountById(accountId) {
  await ensure();
  const { rows } = await dataSafety.safeQuery('select * from ak_accounts where account_id=$1 limit 1', [String(accountId || '')]);
  return rows[0] || null;
}

async function getAccountForAdmin(adminId) {
  const id = normalizeAdminId(adminId);
  const cached = getCached(id || 'debug');
  if (cached) return cached;
  await ensure();
  if (!id) return setCached('debug', { account_id: 'debug-account', plan_code: DEFAULT_PLAN, status: 'active', features_override: {}, limits_override: {}, meta: { source: 'debug' } });

  const link = await dataSafety.safeQuery('select account_id, role, meta from ak_account_admins where admin_id=$1 limit 1', [id]);
  let accountId = link.rows[0]?.account_id || '';
  if (!accountId) {
    accountId = defaultAccountIdForAdmin(id);
    await dataSafety.safeQuery("insert into ak_accounts(account_id, plan_code, status, meta, updated_at) values($1,$2,'active',$3::jsonb,now()) on conflict(account_id) do nothing", [accountId, DEFAULT_PLAN, JSON.stringify({ source: 'auto_created_by_core' })]);
    await dataSafety.safeQuery("insert into ak_account_admins(admin_id, account_id, role, meta, updated_at) values($1,$2,'owner',$3::jsonb,now()) on conflict(admin_id) do nothing", [id, accountId, JSON.stringify({ source: 'auto_created_by_core' })]);
  }

  const account = await getAccountById(accountId);
  return setCached(id, account || { account_id: accountId, plan_code: DEFAULT_PLAN, status: 'active', features_override: {}, limits_override: {}, meta: {} });
}

async function setPlan(accountId, newPlanCode, reason = 'manual_update', meta = {}) {
  await ensure();
  const id = String(accountId || '').trim();
  const nextPlan = String(newPlanCode || DEFAULT_PLAN).toLowerCase();
  if (!id) throw new Error('account_id_required');
  const current = await getAccountById(id);
  const oldPlan = current?.plan_code || '';
  await dataSafety.safeQuery("insert into ak_accounts(account_id, plan_code, status, meta, updated_at) values($1,$2,'active',$3::jsonb,now()) on conflict(account_id) do update set plan_code=excluded.plan_code, updated_at=now()", [id, nextPlan, JSON.stringify(meta || {})]);
  await dataSafety.safeQuery('insert into ak_plan_events(account_id, old_plan_code, new_plan_code, reason, meta) values($1,$2,$3,$4,$5::jsonb)', [id, oldPlan, nextPlan, String(reason || ''), JSON.stringify(meta || {})]);
  accountCache.clear();
  return getAccountById(id);
}

async function getPlanForContext(ctx = {}) {
  if (ctx.planCode) return String(ctx.planCode).toLowerCase();
  if (ctx.account?.planCode) return String(ctx.account.planCode).toLowerCase();
  if (ctx.account?.plan_code) return String(ctx.account.plan_code).toLowerCase();
  const account = await getAccountForAdmin(ctx.adminId || ctx.admin_id || '');
  return String(account?.plan_code || DEFAULT_PLAN).toLowerCase();
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, cacheTtlMs: CACHE_TTL_MS, cacheSize: accountCache.size, ensureCached: ensuredAt > 0 };
}

module.exports = { RUNTIME, DEFAULT_PLAN, ensure, getAccountById, getAccountForAdmin, getPlanForContext, setPlan, clearCache, selfTest };