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
        raw: {},
        postsCount: 2,
        source: 'ak_admin_channels'
      },
      {
        admin_id: '17507246',
        channel_id: '-1002',
        role: 'admin',
        updated_at: '2026-07-01T10:30:00.000Z',
        title: 'Семейный чат',
        raw: { type: 'channel', chat_id: '-1002', title: 'Семейный чат' },
        postsCount: 1,
        source: 'ak_admin_channels'
      },
      {
        admin_id: '17507246',
        channel_id: '-2002',
        role: 'admin',
        updated_at: '2026-07-01T11:00:00.000Z',
        title: 'Канал новостей',
        raw: { type: 'chat', chat_id: '-2002', title: 'Канал новостей' },
        postsCount: 0,
        source: 'ak_admin_channels'
      },
      {
        admin_id: '17507246',
        channel_id: '-2003',
        role: 'admin',
        updated_at: '2026-07-01T11:30:00.000Z',
        title: 'Family chat!',
        raw: { update_type: 'bot_added', is_channel: false, chat_id: '-2003', title: 'Family chat!' },
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
        raw: { max: { type: 'channel' }, evidence_source: 'GET_chats_chatId' },
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
  assert.strictEqual(service.classifyRecord({ title: 'Семейный чат', raw: { type: 'channel' } }), 'channel', 'official type channel wins over chat-like title');
  assert.strictEqual(service.classifyRecord({ title: 'Канал новостей', raw: { type: 'chat' } }), 'chat', 'official type chat wins over channel-like title');
  assert.strictEqual(service.classifyRecord({ title: 'Important Updates', raw: { type: 'channel' } }), 'channel', 'title substrings never classify records');
  assert.strictEqual(service.classifyRecord({ title: 'Olga Style', raw: {} }), 'unknown', 'missing official evidence remains unknown');
  assert.strictEqual(service.classifyRecord({ title: 'АдминКИТ клуб', raw: {} }), 'unknown', 'live-looking title without official evidence remains unknown');
  assert.strictEqual(service.classifyRecord({ raw: { update_type: 'bot_added', is_channel: true } }), 'channel', 'Update.is_channel true is channel evidence');
  assert.strictEqual(service.classifyRecord({ raw: { update_type: 'bot_added', is_channel: false } }), 'chat', 'Update.is_channel false is chat/dialog evidence');
  assert.strictEqual(service.classifyRecord({ raw: { sample: { recipient: { type: 'channel' } } } }), 'channel', 'webhook sample recipient type is channel evidence');
  assert.strictEqual(service.classifyRecord({ raw: { sample: { chat: { type: 'chat' } } } }), 'chat', 'webhook sample chat type is chat evidence');
  assert.strictEqual(service.classifyRecord({ raw: { sample: { update_type: 'bot_added', is_channel: true } } }), 'channel', 'webhook sample is_channel true is channel evidence');
  assert.strictEqual(service.classifyRecord({ raw: { sample: { update_type: 'bot_added', is_channel: false } } }), 'chat', 'webhook sample is_channel false is chat evidence');
  assert.strictEqual(service.classifyRecord({ raw: { isChannel: true } }), 'unknown', 'legacy isChannel without official update/source context is not trusted');
  assert.strictEqual(service.classifyRecord({ raw: { isChat: true } }), 'unknown', 'legacy isChat is not trusted');
  assert.strictEqual(service.classifyRecord({ source: 'push_chat_binding' }), 'chat', 'typed push chat binding remains chat');

  const unresolved = service.safeBindingRecord({ title: 'Olga Style', raw: {} });
  assert.strictEqual(unresolved.kind, 'unknown');
  assert.strictEqual(unresolved.needsApiResolution, true);
  assert.strictEqual(unresolved.evidence, 'needs_api_resolution');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(unresolved, '_rawId'), false, 'safeBindingRecord must not expose raw dedupe ids');

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
  assert.strictEqual(row.counts.channels, 2, 'only official channel evidence reaches channels');
  assert.strictEqual(row.counts.chats, 3, 'official chat evidence and typed chat bindings reach chats');
  assert.strictEqual(row.counts.unknown, 0, 'legacy duplicate with same id is resolved by official tenant metadata');
  assert.ok(row.channels.some((item) => item.title === 'AdminKIT Channel' && /Chat\.type=channel/.test(item.evidence)), 'official tenant metadata resolves legacy duplicate channel row');
  assert.ok(row.channels.some((item) => item.title === 'Семейный чат'), 'chat-like title can still be a channel by official type');
  assert.ok(row.chats.some((item) => item.title === 'Канал новостей'), 'channel-like title can still be a chat by official type');
  assert.ok(row.chats.some((item) => item.title === 'Family chat!'), 'Update.is_channel false classifies punctuated chat title without title regex');
  assert.ok(row.chats.some((item) => item.title === 'MAX рабочий чат'));
  assert.ok(!JSON.stringify(matrix).includes('17507246'), 'full MAX ID is not exported');
  assert.ok(!JSON.stringify(matrix).includes('-1001'), 'raw channel ID is not exported');
  assert.ok(!JSON.stringify(matrix).includes('-1002'), 'raw channel ID with chat-like title is not exported');
  assert.ok(!JSON.stringify(matrix).includes('_rawId'), 'internal dedupe raw ID is not exported');
  assert.strictEqual(matrix.summary.channelsCount, 2);
  assert.strictEqual(matrix.summary.chatsCount, 3);

  db.query = async (sql, params = []) => {
    if (/to_regclass/i.test(sql)) return { rows: [{ name: existingTables.has(params[0]) ? params[0] : null }] };
    if (/FROM ak_admin_channels/i.test(sql)) return { rows: [{ admin_id: '17507246', channel_id: '-9999', title: 'Olga Style', raw: {}, source: 'ak_admin_channels' }] };
    return { rows: [] };
  };
  const blockedUnknown = await service.buildMatrix({ users: ['17507246'] });
  assert.strictEqual(blockedUnknown.ok, false, 'unknown official type blocks honestly');
  assert.ok(blockedUnknown.rows[0].blocks.includes('needs_api_resolution'));
  assert.strictEqual(blockedUnknown.rows[0].counts.unknown, 1);

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