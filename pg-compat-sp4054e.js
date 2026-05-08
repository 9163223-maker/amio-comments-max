'use strict';
const RUNTIME = 'SP40.5.4e';
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.NF_ADMINKIT_POSTGRES_PROD_POSTGRES_URI || '';
const state = global.__ADMINKIT_PG_COMPAT__ = { runtime: RUNTIME, installed: false, error: null, atIso: null };
async function installCompat() {
  if (!DB_URL) { state.error = 'database_url_missing'; return; }
  let pool = null;
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 2500, statement_timeout: 3500 });
    await pool.query("CREATE OR REPLACE FUNCTION public.jsonb_object_length(j jsonb) RETURNS integer LANGUAGE sql IMMUTABLE STRICT AS 'SELECT count(*)::integer FROM jsonb_object_keys(j)'");
    state.installed = true;
    state.error = null;
    state.atIso = new Date().toISOString();
    console.log('[SP40.5.4e pg-compat] jsonb_object_length installed');
  } catch (e) {
    state.error = e.message || String(e);
    console.log('[SP40.5.4e pg-compat] failed: ' + state.error);
  } finally {
    try { if (pool) await pool.end(); } catch {}
  }
}
installCompat();
