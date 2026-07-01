'use strict';

const assert = require('assert');
const db = require('../src/db/postgres');
const service = require('../services/liveUserPostgresBindingsService');

const originalQuery = db.query;
const originalHasDatabaseUrl = db.hasDatabaseUrl;

const existingTables = new Set(['ak_admin_channels', 'ak_tenant_channels', 'ak_tenants', 'adminkit_web_push_chat_bindings']);

function rowForTable(sql) {
  if (/FROM ak_admin_channels/i.test(sql)) {
    return [
      {
        admin_id: '17507246',
        channel_id: '-1001',
        role: 'admin',
        updated_at: '2026-07-01T10:00:00.000Z',
        title: 'AdminKIT Channel',
        raw: { type: 'channel', isChannel: true, channelTitle: 'AdminKIT Channel' },
        postsCount: 2,
        source: 'ak_admin_channels'
      },
      {
        admin_id: '17507246',
        channel_id: '-2002',
        role: 'admin',
        updated_at: '2026-07-01T11:00:00.000Z',
        title: 'Семейный чат',
        raw: { type: 'group', isChat: true, chatTitle: 'Семейный чат' },
        postsCount: 0,
        source: 'ak_admin_channels'
      }
    ];
  }
  if (/FROM ak_tenant_users/i.test(sql)) {
    return [
      {
        tenant_id: 'tenant_live',
        channel_id: '-1001',
        title: 'AdminKIT Channel',
        status: 'active',
        raw: { source: 'tenant', isChannel: true },
        updated_at: '2026-07-01T10:05:00.000Z',
        postsCount: 2,
        source: 'ak_tenant_channels'
      }
    ];
  }
  if (/FROM ak_tenants/i.test(sql)) return [];
  if (/FROM adminkit_web_push_chat_bindings/i.test(sql)) {
    return [
      {
        chat_id: '-3003',
        channel_id: '',
        title: 'MAX рабочий чат',
        status: 'active',
        updated_at: '2026-07-01T12:00:00.000Z',
        source: 'push_chat_binding'
      }
    ];
  }
  return [];
}

(async () => {
  db.hasDatabaseUrl = () => true;
  db.query = async (sql, params = []) => {
    assert.ok(!String(sql).includes('17507246'), 'MAX ID must be parameterized, not interpolated into SQL');
    if (/to_regclass/i.test(sql)) return { rows: [{ name: existingTables.has(params[0]) ? params[0] : null }] };
    assert.strictEqual(params[0], '17507246', 'queries are scoped to target MAX ID');
    return { rows: rowForTable(sql) };
  };

  const matrix = await service.buildMatrix({ users: ['17507246'] });
  assert.strictEqual(matrix.ok, true, JSON.stringify(matrix, null, 2));
  assert.deepStrictEqual(matrix.checkedUsers, ['175…246']);
  assert.strictEqual(matrix.rows.length, 1);
  const row = matrix.rows[0];
  assert.strictEqual(row.counts.channels, 1, 'channel records are separated');
  assert.strictEqual(row.counts.chats, 2, 'chat records are separated from admin and push bindings');
  assert.strictEqual(row.counts.unknown, 0, 'no known records left unknown');
  assert.ok(row.channels.some((item) => item.title === 'AdminKIT Channel'));
  assert.ok(row.chats.some((item) => item.title === 'Семейный чат'));
  assert.ok(row.chats.some((item) => item.title === 'MAX рабочий чат'));
  assert.ok(!JSON.stringify(matrix).includes('17507246'), 'full MAX ID is not exported');
  assert.ok(!JSON.stringify(matrix).includes('-1001'), 'raw channel ID is not exported');
  assert.strictEqual(matrix.summary.channelsCount, 1);
  assert.strictEqual(matrix.summary.chatsCount, 2);

  db.hasDatabaseUrl = () => false;
  db.query = async () => { throw new Error('database_url_missing'); };
  const blocked = await service.buildMatrix({ users: ['17507246'] });
  assert.strictEqual(blocked.ok, false, 'missing database config blocks honestly');
  assert.ok(blocked.rows[0].blocks.includes('postgres_not_configured'));

  db.query = originalQuery;
  db.hasDatabaseUrl = originalHasDatabaseUrl;
  console.log('PR268 live user postgres bindings PASS');
})().catch((error) => {
  db.query = originalQuery;
  db.hasDatabaseUrl = originalHasDatabaseUrl;
  console.error(error && error.stack || error);
  process.exit(1);
});
