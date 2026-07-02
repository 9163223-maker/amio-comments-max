'use strict';

const assert = require('assert');
const db = require('../src/db/postgres');
const store = require('../store');
const access = require('../services/clientAccessService');
const repository = require('../services/clientAccessRepository');
const diagnostic = require('../services/liveTenantSelfDiagnosticService');

const originalQuery = db.query;
const originalHasDatabaseUrl = db.hasDatabaseUrl;
const originalAdminIds = process.env.ADMINKIT_ADMIN_MAX_USER_IDS;

function resetStore() {
  access._resetForTests();
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.channels = {};
  const n = repository.ns();
  n.clients = {}; n.tenants = {}; n.tenantUsers = {}; n.tenantChannels = {}; n.activationCodes = {}; n.accessEvents = []; n.channelsByUser = {}; n.pendingActivation = {};
  store.saveStore();
}
function installDbMock() {
  const existingTables = new Set(['ak_users', 'ak_tenants', 'ak_tenant_channels']);
  const existingColumns = {
    ak_users: new Set(['user_id', 'tenant_id', 'max_user_id', 'status', 'updated_at']),
    ak_tenants: new Set(['tenant_id', 'owner_user_id', 'status', 'plan_id', 'max_channels', 'metadata', 'updated_at']),
    ak_tenant_channels: new Set(['tenant_id', 'channel_id', 'channel_title', 'status', 'metadata', 'updated_at'])
  };
  db.hasDatabaseUrl = () => true;
  db.query = async (sql, params = []) => {
    const text = String(sql);
    if (/to_regclass/.test(text)) return { rows: existingTables.has(params[0]) ? [{ name: params[0] }] : [{ name: null }] };
    if (/information_schema\.columns/.test(text)) {
      const [table, column] = params;
      return { rows: existingColumns[table]?.has(column) ? [{ '?column?': 1 }] : [] };
    }
    if (/SELECT user_id FROM ak_users WHERE max_user_id=\$1/.test(text)) {
      return { rows: [{ user_id: 'clean-core-user-1' }] };
    }
    if (/SELECT tenant_id FROM ak_users WHERE max_user_id=\$1/.test(text)) {
      return { rows: [{ tenant_id: 'tenant-clean-core-1' }] };
    }
    if (/SELECT .* FROM ak_tenants WHERE tenant_id=\$1/.test(text)) {
      return { rows: [{ tenant_id: 'tenant-clean-core-1', owner_user_id: 'clean-core-user-1', status: 'active', plan_id: 'business', max_channels: 100, metadata: { source: 'test_clean_core' } }] };
    }
    if (/FROM ak_tenant_channels WHERE tenant_id=\$1/.test(text)) {
      return { rows: [{ tenant_id: 'tenant-clean-core-1', channel_id: '-273001', channel_title: 'PR273 Official Channel', status: 'active', metadata: { botAdminProof: { proven: true } } }] };
    }
    return { rows: [] };
  };
}
function restoreDbMock() {
  db.query = originalQuery;
  db.hasDatabaseUrl = originalHasDatabaseUrl;
  if (originalAdminIds === undefined) delete process.env.ADMINKIT_ADMIN_MAX_USER_IDS;
  else process.env.ADMINKIT_ADMIN_MAX_USER_IDS = originalAdminIds;
}

(async () => {
  resetStore();
  installDbMock();
  process.env.ADMINKIT_ADMIN_MAX_USER_IDS = '17507246';

  const snapshot = await diagnostic.dbTenantSnapshot('17507246');
  assert.ok(snapshot, 'clean-core db snapshot is found by max_user_id');
  assert.strictEqual(snapshot.tenant.tenantId, 'tenant-clean-core-1', 'snapshot returns tenant id');
  assert.strictEqual(snapshot.tenant.ownerUserId, 'clean-core-user-1', 'snapshot preserves clean-core owner user id');
  assert.strictEqual(snapshot.tenantChannels.length, 1, 'snapshot returns tenant channels from ak_tenant_channels');

  const result = await diagnostic.buildSelfDiagnostic({ maxUserId: '17507246', label: 'pr273' });
  assert.strictEqual(result.ok, true, 'diagnostic no longer blocks active user when clean-core tenant exists');
  assert.strictEqual(result.summary.knownTenant, true, 'knownTenant is true from clean-core ak_users tenant lookup');
  assert.strictEqual(result.summary.tenantChannelsCount, 1, 'tenant channels come from ak_tenant_channels');
  assert.ok(!result.violations.some((v) => v.code === 'tenant_missing_for_active_user'), 'no false tenant_missing_for_active_user');
  assert.ok(!JSON.stringify(result).includes('17507246'), 'raw MAX id is not exported');

  restoreDbMock();
  console.log('PR273 live tenant diagnostic clean-core lookup PASS');
})().catch((error) => { restoreDbMock(); console.error(error && error.stack || error); process.exit(1); });
