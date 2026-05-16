'use strict';

const db = require('../../cc5-db-core');

const RUNTIME = 'ADMINKIT-CORE-DATA-SAFETY-1.0';
const POLICY = 'non_destructive_additive_migrations_only';

const CORE_TABLES = Object.freeze([
  'ak_admins',
  'ak_channels',
  'ak_admin_channels',
  'ak_posts',
  'ak_admin_sessions',
  'ak_post_buttons',
  'ak_post_lead_magnets',
  'ak_core_schema_migrations'
]);

const FORBIDDEN_SQL = /\b(drop|truncate|delete\s+from|alter\s+table\s+[^;]+\s+drop\s+column|drop\s+table|drop\s+index)\b/i;

function assertNonDestructive(sql) {
  const text = String(sql || '');
  if (FORBIDDEN_SQL.test(text)) {
    const error = new Error('Core migration blocked: destructive SQL is forbidden');
    error.code = 'CORE_DESTRUCTIVE_SQL_BLOCKED';
    error.policy = POLICY;
    error.sqlPreview = text.slice(0, 180);
    throw error;
  }
  return true;
}

async function safeQuery(sql, params = []) {
  assertNonDestructive(sql);
  return db.query(sql, params);
}

async function ensureMigrationLedger() {
  await db.init();
  await safeQuery("create table if not exists ak_core_schema_migrations (id text primary key, runtime_version text not null, policy text not null, notes text not null default '', applied_at timestamptz default now())");
}

async function markMigration(id, notes = '') {
  await ensureMigrationLedger();
  await safeQuery('insert into ak_core_schema_migrations(id, runtime_version, policy, notes, applied_at) values($1,$2,$3,$4,now()) on conflict(id) do update set runtime_version=excluded.runtime_version, policy=excluded.policy, notes=excluded.notes', [id, RUNTIME, POLICY, String(notes || '')]);
}

async function hasColumn(table, column) {
  await ensureMigrationLedger();
  const { rows } = await db.query('select 1 from information_schema.columns where table_name=$1 and column_name=$2 limit 1', [table, column]);
  return rows.length > 0;
}

async function addColumnIfMissing(table, column, definition) {
  if (await hasColumn(table, column)) return { ok: true, table, column, already: true };
  await safeQuery(`alter table ${table} add column ${column} ${definition}`);
  return { ok: true, table, column, added: true };
}

async function ensureCoreStorage() {
  await ensureMigrationLedger();
  await safeQuery("create table if not exists ak_admin_sessions (admin_id text primary key, state jsonb not null default '{}'::jsonb, updated_at timestamptz default now())");
  await safeQuery("create table if not exists ak_post_buttons (id bigserial primary key, admin_id text not null default '', channel_id text not null default '', post_id text not null, title text not null default '', url text not null default '', sort_order integer not null default 0, is_enabled boolean not null default true, meta jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");
  await safeQuery("create table if not exists ak_post_lead_magnets (id bigserial primary key, admin_id text not null default '', channel_id text not null default '', post_id text not null, title text not null default '', material_type text not null default 'text', material_text text not null default '', material_url text not null default '', file_id text not null default '', file_name text not null default '', access_mode text not null default 'subscribers_current_channel', conditions jsonb not null default '{}'::jsonb, sort_order integer not null default 0, is_enabled boolean not null default true, meta jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now())");

  await addColumnIfMissing('ak_post_buttons', 'channel_id', "text not null default ''");
  await addColumnIfMissing('ak_post_buttons', 'sort_order', 'integer not null default 0');
  await addColumnIfMissing('ak_post_buttons', 'is_enabled', 'boolean not null default true');
  await addColumnIfMissing('ak_post_buttons', 'meta', "jsonb not null default '{}'::jsonb");

  await addColumnIfMissing('ak_post_lead_magnets', 'channel_id', "text not null default ''");
  await addColumnIfMissing('ak_post_lead_magnets', 'conditions', "jsonb not null default '{}'::jsonb");
  await addColumnIfMissing('ak_post_lead_magnets', 'sort_order', 'integer not null default 0');
  await addColumnIfMissing('ak_post_lead_magnets', 'is_enabled', 'boolean not null default true');
  await addColumnIfMissing('ak_post_lead_magnets', 'meta', "jsonb not null default '{}'::jsonb");

  await safeQuery('create index if not exists ak_post_buttons_post_idx on ak_post_buttons(post_id, sort_order, id)');
  await safeQuery('create index if not exists ak_post_buttons_admin_channel_post_idx on ak_post_buttons(admin_id, channel_id, post_id)');
  await safeQuery('create index if not exists ak_post_lead_magnets_post_idx on ak_post_lead_magnets(post_id, sort_order, id)');
  await safeQuery('create index if not exists ak_post_lead_magnets_admin_channel_post_idx on ak_post_lead_magnets(admin_id, channel_id, post_id)');
  await markMigration('core-storage-v1-post-addons', 'Core storage exists. All changes are additive and preserve existing client data.');
  return { ok: true, runtimeVersion: RUNTIME, policy: POLICY, tables: CORE_TABLES };
}

async function snapshotCounts() {
  await ensureCoreStorage();
  const out = {};
  for (const table of CORE_TABLES) {
    try {
      const { rows } = await db.query(`select count(*)::int as count from ${table}`);
      out[table] = rows[0]?.count || 0;
    } catch (error) {
      out[table] = `error:${error.message || String(error)}`;
    }
  }
  return out;
}

function policySummary() {
  return {
    runtimeVersion: RUNTIME,
    policy: POLICY,
    rules: [
      'never drop client tables',
      'never truncate client tables',
      'never delete rows during migration',
      'only create table/index if missing',
      'only add missing columns with safe defaults',
      'disable or supersede records instead of deleting them'
    ],
    protectedTables: CORE_TABLES
  };
}

module.exports = {
  RUNTIME,
  POLICY,
  CORE_TABLES,
  assertNonDestructive,
  safeQuery,
  ensureCoreStorage,
  snapshotCounts,
  policySummary
};
