#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const pg = require('pg');

const originalPool = pg.Pool;

class FailingPool extends EventEmitter {
  async connect() {
    throw new Error('Connection terminated due to connection timeout');
  }
}

async function main() {
  process.env.PGHOST = 'example.invalid';
  process.env.PGUSER = 'adminkit-test';
  process.env.PGDATABASE = 'adminkit-test';
  process.env.ADMINKIT_PG_CONNECT_TIMEOUT_MS = '1';
  pg.Pool = FailingPool;
  delete require.cache[require.resolve('../postgres-state-store')];
  const store = require('../postgres-state-store');

  const loaded = await store.loadSnapshot();
  assert.strictEqual(loaded.ok, false, 'PR232-001: loadSnapshot must return ok=false instead of throwing when connect times out');
  assert.strictEqual(loaded.configured, true, 'PR232-002: Postgres must still be reported as configured');
  assert.match(loaded.error, /Connection terminated due to connection timeout/, 'PR232-003: loadSnapshot must expose the connect timeout error');
  assert.strictEqual(store.info().ok, false, 'PR232-004: store info should mark postgres state unhealthy after timeout');
  assert.match(store.info().lastError, /Connection terminated due to connection timeout/, 'PR232-005: store info must keep the last connect error');

  const saved = await store.saveSnapshot({ posts: { demo: { id: 'demo' } } });
  assert.strictEqual(saved.ok, false, 'PR232-006: saveSnapshot must return ok=false instead of throwing when connect times out');
  assert.match(saved.error, /Connection terminated due to connection timeout/, 'PR232-007: saveSnapshot must expose the connect timeout error');

  console.log('PR232 postgres connect timeout fallback assertions passed');
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
}).finally(() => {
  pg.Pool = originalPool;
});
