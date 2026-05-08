'use strict';
const RUNTIME = 'SP40.5.4g';
const KEYS = ['DATABASE_URL', 'POSTGRES_URI', 'NF_ADMINKIT_POSTGRES_PROD_POSTGRES_URI'];
const state = global.__ADMINKIT_PG_URL_NORMALIZE__ = { runtime: RUNTIME, normalized: [], skipped: [], error: null };
function normalize(key) {
  const raw = process.env[key];
  if (!raw || !/^postgres(ql)?:\/\//i.test(raw)) { state.skipped.push(key + ':empty_or_not_postgres'); return; }
  try {
    const u = new URL(raw);
    const sslmode = String(u.searchParams.get('sslmode') || '').toLowerCase();
    const needsCompat = sslmode === 'require' || sslmode === 'prefer' || sslmode === 'verify-ca';
    if (needsCompat && !u.searchParams.has('uselibpqcompat')) {
      u.searchParams.set('uselibpqcompat', 'true');
      process.env[key] = u.toString();
      state.normalized.push(key + ':uselibpqcompat');
      return;
    }
    state.skipped.push(key + ':no_change');
  } catch (e) {
    state.error = e.message || String(e);
    state.skipped.push(key + ':parse_error');
  }
}
KEYS.forEach(normalize);
console.log('[SP40.5.4g pg-url-normalize] normalized=' + state.normalized.length + ' skipped=' + state.skipped.length);
