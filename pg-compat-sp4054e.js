'use strict';
const RUNTIME = 'SP40.5.4f';
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.NF_ADMINKIT_POSTGRES_PROD_POSTGRES_URI || '';
const state = global.__ADMINKIT_PG_COMPAT__ = global.__ADMINKIT_PG_COMPAT__ || { runtime: RUNTIME, installed: false, attempts: 0, error: null, atIso: null };
state.runtime = RUNTIME;
const IS_CHILD = !!process.env.ADMINKIT_PARENT_RUNTIME;
async function tryInstallCompat() {
  if (IS_CHILD) return;
  if (!DB_URL) { state.error = 'database_url_missing'; return; }
  state.attempts++;
  let pool = null;
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, statement_timeout: 10000, max: 1 });
    await pool.query("CREATE OR REPLACE FUNCTION public.jsonb_object_length(j jsonb) RETURNS integer LANGUAGE sql IMMUTABLE STRICT AS 'SELECT count(*)::integer FROM jsonb_object_keys(j)'");
    state.installed = true;
    state.error = null;
    state.atIso = new Date().toISOString();
    console.log('[SP40.5.4f pg-compat] jsonb_object_length installed; attempts=' + state.attempts);
  } catch (e) {
    state.error = e.message || String(e);
    console.log('[SP40.5.4f pg-compat] attempt ' + state.attempts + ' failed: ' + state.error);
    if (state.attempts < 8) setTimeout(tryInstallCompat, 2500);
  } finally {
    try { if (pool) await pool.end(); } catch {}
  }
}
setTimeout(tryInstallCompat, 600);
