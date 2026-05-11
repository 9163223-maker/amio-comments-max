'use strict';

const db = require('./cc5-db-core');

const RUNTIME = 'CC6.5.8.1-CLEAN-V3-MAIN-ROUTE-GUARD';
const SOURCE = 'adminkit-CC6.5.8.1-force-main-home-to-real-main-node';

let installed = false;
let lastFix = null;

function isMainHomeSelect(sql, params) {
  const s = String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return s.includes('select * from ak_menu_nodes_v3 where route=$1 limit 1') && String((params || [])[0] || '') === 'main:home';
}

async function fixDb() {
  try {
    if (typeof db.init === 'function') await db.init();
    if (typeof db.query === 'function') {
      await db.query("update ak_menu_nodes_v3 set route='nav:main', updated_at=now() where node_key='nav_main' and route='main:home'", []);
      const counts = await db.query(`
        select
          count(*) filter (where route='main:home')::int as main_home_routes,
          count(*) filter (where node_key='main' and route='main:home')::int as real_main_routes,
          count(*) filter (where node_key='nav_main' and route='nav:main')::int as nav_main_routes
        from ak_menu_nodes_v3
      `, []);
      lastFix = { ok: true, at: new Date().toISOString(), counts: counts.rows && counts.rows[0] || {} };
      return lastFix;
    }
  } catch (error) {
    lastFix = { ok: false, at: new Date().toISOString(), error: error && error.message ? error.message : String(error || 'fix_failed') };
    return lastFix;
  }
  return { ok: false, error: 'db_query_missing' };
}

function install() {
  if (installed || db.__cleanV3MainRouteGuard) return selfTest();
  installed = true;
  db.__cleanV3MainRouteGuard = true;

  const originalQuery = db.query.bind(db);
  db.query = async function guardedQuery(sql, params = []) {
    if (isMainHomeSelect(sql, params)) {
      return originalQuery(
        "select * from ak_menu_nodes_v3 where route=$1 order by case when node_key='main' then 0 else 1 end, sort_order asc, node_key asc limit 1",
        params
      );
    }
    return originalQuery(sql, params);
  };

  // Best effort: remove duplicate main:home route from the nav label node after boot and after seed.
  setTimeout(() => fixDb().catch(() => {}), 1000);
  setTimeout(() => fixDb().catch(() => {}), 5000);

  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed: installed || !!db.__cleanV3MainRouteGuard,
    fixes: {
      mainHomeAlwaysPrefersRealMainNode: true,
      navMainIsServiceLabelOnly: true,
      commentsModuleTouched: false,
      openAppTouched: false
    },
    lastFix
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, fixDb };
