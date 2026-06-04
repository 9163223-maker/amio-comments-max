'use strict';

const assert = require('assert');
const Module = require('module');

process.env.DATABASE_URL = 'postgres://archive-pr124-test';

const queries = [];
const insertedAdmins = new Set();
let sawPostInsertWithAdmin = false;
let sawArchiveInsertWithAdmin = false;
let sawSnapshotInsertWithAdmin = false;
let capturedArchiveHomeText = '';

class FakePool {
  query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    queries.push({ sql: text, params });
    if (/information_schema\.columns/i.test(text)) return Promise.resolve({ rowCount: 0, rows: [] });
    if (/SELECT COALESCE\(NULLIF\(linked_by_user_id/i.test(text)) return Promise.resolve({ rowCount: 0, rows: [] });
    if (/INSERT INTO ak_admins/i.test(text)) {
      insertedAdmins.add(String(params[0] || ''));
      return Promise.resolve({ rowCount: 1, rows: [] });
    }
    if (/INSERT INTO ak_posts/i.test(text)) {
      assert.ok(insertedAdmins.has(String(params[0] || '')), 'archive post insert must repair admin row before ak_posts insert');
      sawPostInsertWithAdmin = true;
      return Promise.resolve({ rowCount: 1, rows: [] });
    }
    if (/INSERT INTO ak_post_snapshots/i.test(text)) {
      assert.strictEqual(params[8], 'tenant-a-admin', 'snapshot insert stores archive admin source');
      sawSnapshotInsertWithAdmin = true;
      return Promise.resolve({ rowCount: 1, rows: [{ id: 1 }] });
    }
    if (/INSERT INTO ak_post_archive/i.test(text)) {
      assert.strictEqual(params[7], 'tenant-a-admin', 'archive insert stores archive admin source');
      sawArchiveInsertWithAdmin = true;
      return Promise.resolve({ rowCount: 1, rows: [{ id: 1 }] });
    }
    if (/UPDATE ak_posts/i.test(text)) return Promise.resolve({ rowCount: 0, rows: [] });
    if (/UPDATE ak_channels/i.test(text)) return Promise.resolve({ rowCount: 0, rows: [] });
    if (/COUNT\(\*\)::int/i.test(text)) return Promise.resolve({ rowCount: 1, rows: [{ n: 0 }] });
    return Promise.resolve({ rowCount: 0, rows: [] });
  }
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'pg') return { Pool: FakePool };
  return originalLoad.apply(this, arguments);
};

async function main() {
  const archive = require('../postgres-post-archive');
  const result = await archive.syncStore({
    channels: {
      a: { channelId: 'tenant-a-channel', channelTitle: 'Tenant A Channel', linkedByUserId: 'tenant-a-admin' }
    },
    posts: {
      'tenant-a-channel:post-a': {
        adminId: 'tenant-a-admin',
        channelId: 'tenant-a-channel',
        channelTitle: 'Tenant A Channel',
        postId: 'post-a',
        messageId: 'msg-a',
        originalText: 'Tenant A Public Post'
      }
    }
  }, { reason: 'pr124_test' });

  assert.strictEqual(result.ok, true, 'archive sync succeeds when admin row is repaired before post insert');
  assert.ok(sawPostInsertWithAdmin, 'ak_posts insert path was exercised');
  assert.ok(sawSnapshotInsertWithAdmin, 'snapshot insert path was exercised');
  assert.ok(sawArchiveInsertWithAdmin, 'archive insert path was exercised');
  assert.ok(queries.some((q) => /CREATE TABLE IF NOT EXISTS ak_admins/i.test(q.sql)), 'bootstrap includes ak_admins repair');
  assert.ok(queries.some((q) => /ALTER TABLE ak_post_archive ADD COLUMN IF NOT EXISTS admin_id/i.test(q.sql)), 'archive table stores admin source for tenant filtering');

  const flow = require('../archive-flow-15311');
  const rawRestore = await flow.restoreAsNewPost({ botToken: 'test', archiveId: 1 });
  assert.strictEqual(rawRestore.ok, false, 'raw restore without archive_card marker is blocked');
  assert.strictEqual(rawRestore.error, 'archive_card_source_required', 'raw restore requires archive_card source');

  Module._load = function patchedCleanBotLoad(request, parent, isMain) {
    if (request === './archive-flow-15311') {
      return {
        listArchive: async (options = {}) => {
          assert.strictEqual(options.adminId, 'tenant-a-admin', 'archive home/status count must use current admin scope');
          assert.deepStrictEqual(options.channelIds, ['tenant-a-channel'], 'archive home/status count must use tenant-visible channels');
          return { items: [{ id: 1, post_title: 'Tenant A Public Post' }], total: 1, limit: options.limit, offset: options.offset };
        },
        stats: async () => { throw new Error('global archive.stats must not be called by client archive home/status'); },
        formatDate: () => 'now',
        getArchiveItem: async () => null,
        restoreAsNewPost: async () => ({ ok: false, error: 'not_used' })
      };
    }
    if (request === './services/maxApi') {
      return {
        answerCallback: async () => ({ ok: true }),
        editMessage: async ({ text }) => { capturedArchiveHomeText = text; return { ok: true }; },
        sendMessage: async ({ text }) => { capturedArchiveHomeText = text; return { ok: true }; }
      };
    }
    if (request === './services/clientAccessService') {
      return {
        getClientChannels: () => [{ channelId: 'tenant-a-channel', title: 'Tenant A Channel' }],
        getAccessState: () => ({ active: true, admin: false, status: 'active' })
      };
    }
    if (request === './services/accessGateService') return { checkAction: () => ({ allow: true }) };
    if (request === './features/account-screens-pr106') return { gateMenuForUser: () => null, screenForAction: () => null, screenForGateDecision: () => null };
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('../clean-bot-1539')];
  const cleanBot = require('../clean-bot-1539').createCleanBot({ handleWebhook: async () => { throw new Error('legacy should not handle archive home'); } });
  const res = { statusCode: 0, body: null, headersSent: false, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await cleanBot.handleWebhook({ body: { update_type: 'message_callback', callback: { callback_id: 'cb-home', payload: JSON.stringify({ action: 'admin_section_archive' }), user: { user_id: 'tenant-a-admin' }, message: { body: { mid: 'm1' }, recipient: { chat_id: 'chat-1' } } } } }, res, { botToken: 'test' });
  assert.strictEqual(res.statusCode, 200, 'archive home callback handled');
  assert.ok(/подключённых каналов: 1/.test(capturedArchiveHomeText), 'archive home shows visible connected channels count');
  assert.ok(/сохранённых постов: 1/.test(capturedArchiveHomeText), 'archive home shows tenant-visible archive total');
  assert.ok(!/сохранённых постов: 3|снимков: 9|архивных записей: 3/i.test(capturedArchiveHomeText), 'archive home must not show global archive.stats totals');
  assert.ok(/снимки: доступны в карточках постов/i.test(capturedArchiveHomeText), 'archive home does not expose a global snapshot count');

  console.log('PR124 archive FK, tenant home count, and restore guard assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => { Module._load = originalLoad; });
