'use strict';

const assert = require('assert');
const Module = require('module');

process.env.DATABASE_URL = 'postgres://archive-pr124-test';

const queries = [];
const insertedAdmins = new Set();
let sawPostInsertWithAdmin = false;
let sawArchiveInsertWithAdmin = false;
let sawSnapshotInsertWithAdmin = false;

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

  console.log('PR124 archive FK and restore guard assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => { Module._load = originalLoad; });
