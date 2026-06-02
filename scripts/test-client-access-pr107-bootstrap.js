'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'src/db/postgres.js');
const REPO_PATH = path.join(ROOT, 'services/clientAccessRepository.js');
const STORE_PATH = path.join(ROOT, 'store.js');

const EXPECTED_COLUMNS = Object.freeze({
  ak_tenants: ['tenant_id', 'owner_max_user_id', 'status', 'plan_id', 'expires_at', 'max_channels', 'created_at', 'updated_at', 'source', 'metadata'],
  ak_tenant_users: ['tenant_id', 'max_user_id', 'role', 'status', 'created_at', 'updated_at'],
  ak_tenant_channels: ['tenant_id', 'channel_id', 'channel_title', 'status', 'connected_at', 'bound_by_code', 'metadata'],
  ak_activation_codes: ['code_hash', 'plan_id', 'duration_days', 'max_channels', 'expires_at', 'status', 'single_use', 'used_at', 'used_by_max_user_id', 'tenant_id', 'bound_channel_id', 'created_at', 'updated_at'],
  ak_access_events: ['event_id', 'tenant_id', 'max_user_id', 'event_type', 'payload', 'created_at']
});

function defaultValue(column) {
  if (column === 'metadata' || column === 'payload') return {};
  if (column === 'max_channels') return 1;
  if (column === 'duration_days') return 30;
  if (column === 'single_use') return true;
  if (column.endsWith('_at') || column === 'expires_at' || column === 'used_at') return null;
  return '';
}

function splitTopLevelColumns(definition) {
  const columns = [];
  let current = '';
  let depth = 0;
  for (const char of definition) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      columns.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) columns.push(current.trim());
  return columns;
}

function makeFakeDb(seed = {}) {
  const state = { tables: {}, statements: [] };
  for (const [table, config] of Object.entries(seed)) {
    state.tables[table] = {
      columns: new Set(config.columns || []),
      rows: (config.rows || []).map((row) => ({ ...row }))
    };
  }

  function table(name) {
    if (!state.tables[name]) state.tables[name] = { columns: new Set(), rows: [] };
    return state.tables[name];
  }

  function addColumn(tableName, columnName) {
    const t = table(tableName);
    if (t.columns.has(columnName)) return;
    t.columns.add(columnName);
    for (const row of t.rows) row[columnName] = defaultValue(columnName);
  }

  return {
    state,
    hasDatabaseUrl: () => true,
    query: async (sql) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      state.statements.push(normalized);

      const createMatch = normalized.match(/^CREATE TABLE IF NOT EXISTS (ak_[a-z_]+) \((.*)\)$/i);
      if (createMatch) {
        const [, tableName, definition] = createMatch;
        const createdFresh = !state.tables[tableName];
        table(tableName);
        if (createdFresh) {
          for (const part of splitTopLevelColumns(definition)) {
            const columnName = part.split(/\s+/)[0];
            if (!columnName || /^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK)$/i.test(columnName)) continue;
            addColumn(tableName, columnName);
          }
        }
        return { rows: [] };
      }

      const alterMatch = normalized.match(/^ALTER TABLE (ak_[a-z_]+) ADD COLUMN IF NOT EXISTS ([a-z_]+)\b/i);
      if (alterMatch) {
        addColumn(alterMatch[1], alterMatch[2]);
        return { rows: [] };
      }

      const selectMatch = normalized.match(/^SELECT (.+) FROM (ak_[a-z_]+)/i);
      if (selectMatch) {
        const [, projection, tableName] = selectMatch;
        const t = table(tableName);
        const requestedColumns = projection.split(',').map((part) => part.trim()).filter(Boolean);
        for (const column of requestedColumns) {
          assert.ok(t.columns.has(column), `${tableName}.${column} must exist before hydrate SELECT`);
        }
        return { rows: t.rows.map((row) => {
          const projected = {};
          for (const column of requestedColumns) projected[column] = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : defaultValue(column);
          return projected;
        }) };
      }

      throw new Error(`unexpected sql in PR107 bootstrap test: ${normalized}`);
    }
  };
}

function loadRepository(fakeDb) {
  process.env.DATABASE_URL = 'postgres://pr107-bootstrap-test';
  process.env.ADMINKIT_STORE_BACKEND = 'postgres';
  delete require.cache[DB_PATH];
  delete require.cache[REPO_PATH];
  delete require.cache[STORE_PATH];
  require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: fakeDb };
  return require(REPO_PATH);
}

function assertExpectedColumns(fakeDb) {
  for (const [tableName, columns] of Object.entries(EXPECTED_COLUMNS)) {
    const existing = fakeDb.state.tables[tableName]?.columns || new Set();
    for (const column of columns) assert.ok(existing.has(column), `${tableName}.${column} was not bootstrapped`);
  }
}

(async () => {
  const freshDb = makeFakeDb();
  const freshRepo = loadRepository(freshDb);
  const freshState = await freshRepo.ensureTables();
  assert.strictEqual(freshState.tenantTablesReady, true, 'fresh schema bootstrap must report ready');
  assert.strictEqual(freshRepo.publicInfo().tenantTablesReady, true, 'repository public info must report ready after fresh bootstrap');
  assertExpectedColumns(freshDb);

  const partialDb = makeFakeDb({
    ak_tenants: {
      columns: ['tenant_id', 'status', 'plan_id', 'expires_at', 'max_channels', 'created_at', 'updated_at', 'source', 'metadata'],
      rows: [{ tenant_id: 'tenant_existing', status: 'active', plan_id: 'pro', max_channels: 7, source: 'legacy', metadata: { keep: true } }]
    },
    ak_tenant_users: { columns: ['tenant_id', 'max_user_id'], rows: [{ tenant_id: 'tenant_existing', max_user_id: 'max_existing' }] },
    ak_tenant_channels: { columns: ['tenant_id', 'channel_id'], rows: [{ tenant_id: 'tenant_existing', channel_id: 'channel_existing' }] },
    ak_activation_codes: { columns: ['code_hash', 'plan_id'], rows: [{ code_hash: 'hash_existing', plan_id: 'start' }] },
    ak_access_events: { columns: ['event_id', 'event_type'], rows: [{ event_id: 'event_existing', event_type: 'legacy_event' }] }
  });
  const partialRepo = loadRepository(partialDb);
  const firstPartialState = await partialRepo.ensureTables();
  assert.strictEqual(firstPartialState.tenantTablesReady, true, 'partial schema bootstrap must report ready');
  assert.strictEqual(firstPartialState.error, '', 'partial schema bootstrap must clear bootstrapError');
  assertExpectedColumns(partialDb);
  assert.ok(partialDb.state.tables.ak_tenants.columns.has('owner_max_user_id'), 'missing owner_max_user_id must be repaired');
  assert.strictEqual(partialDb.state.tables.ak_tenants.rows.length, 1, 'tenant rows must not be deleted during migration');
  assert.strictEqual(partialDb.state.tables.ak_tenants.rows[0].tenant_id, 'tenant_existing', 'existing tenant row identity must be preserved');
  assert.strictEqual(partialRepo.getTenant('tenant_existing').tenantId, 'tenant_existing', 'repository must hydrate existing tenant after migration');
  assert.strictEqual(partialRepo.publicInfo().tenantTablesReady, true, 'repository public info must report ready after migration');
  assert.strictEqual(partialRepo.publicInfo().paidProductionBlocker, false, 'postgres blocker must clear when tenant tables are ready');
  assert.notStrictEqual(partialRepo.publicInfo().clientAccessFallbackMode, 'store_fallback_db_unavailable', 'postgres-ready repository must not use db-unavailable fallback');

  const beforeRepeatRows = JSON.stringify(partialDb.state.tables.ak_tenants.rows);
  const secondPartialState = await partialRepo.ensureTables();
  assert.strictEqual(secondPartialState.tenantTablesReady, true, 'repeated bootstrap must remain ready');
  assert.strictEqual(JSON.stringify(partialDb.state.tables.ak_tenants.rows), beforeRepeatRows, 'repeated bootstrap must not delete or rewrite existing tenant rows');
  assert.ok(partialDb.state.statements.some((sql) => /ALTER TABLE ak_tenants ADD COLUMN IF NOT EXISTS owner_max_user_id/i.test(sql)), 'bootstrap must issue owner_max_user_id repair ALTER');

  console.log('client access pr107 bootstrap ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
