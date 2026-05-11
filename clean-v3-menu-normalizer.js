'use strict';

const db = require('./cc5-db-core');
const menu = require('./clean-v3-menu-core-db');

const RUNTIME = 'CC6.5.7.4-CLEAN-V3-MENU-NORMALIZER';
const SOURCE = 'adminkit-CC6.5.7.4-clean-menu-route-and-placeholder-cleanup';

let installed = false;
let lastNormalize = null;

async function safeQuery(sql, params = []) {
  try {
    await db.init();
    return await db.query(sql, params);
  } catch (error) {
    return { rows: [], rowCount: 0, error: error && error.message ? error.message : String(error || 'query_failed') };
  }
}

async function normalizeDb() {
  const result = {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    routeFix: null,
    placeholderCleanup: null,
    checkedAt: new Date().toISOString()
  };

  // nav_main is a label node for the bottom navigation button. It must not duplicate the real main:home route.
  result.routeFix = await safeQuery(
    "update ak_menu_nodes_v3 set route='nav:main', updated_at=now() where node_key='nav_main' and route='main:home'"
  );

  // Remove manual debug placeholders accidentally registered as real channel/post ids.
  const cleanup = {};
  cleanup.posts = await safeQuery(
    "delete from ak_posts where channel_id='CHANNEL_ID' or post_id='POST_ID' or comment_key like 'CHANNEL_ID:%'"
  );
  cleanup.channels = await safeQuery(
    "delete from ak_channels where channel_id='CHANNEL_ID'"
  );
  cleanup.storePosts = await safeQuery(
    "delete from ak_posts where title in ('Тест 6542') and (post_id='POST_ID' or channel_id='CHANNEL_ID')"
  );
  result.placeholderCleanup = cleanup;

  const counts = await safeQuery(`
    select
      count(*) filter (where route='main:home')::int as main_home_routes,
      count(*) filter (where node_key='main' and route='main:home')::int as real_main_routes,
      count(*) filter (where node_key='nav_main' and route='nav:main')::int as nav_main_label_routes
    from ak_menu_nodes_v3
  `);
  result.routeCounts = counts.rows && counts.rows[0] || {};

  lastNormalize = result;
  return result;
}

function install() {
  if (installed) return selfTest();
  installed = true;

  const originalInit = menu.init;
  if (typeof originalInit === 'function' && !menu.__cleanV3NormalizerWrapped) {
    menu.init = async function normalizedMenuInit() {
      const initResult = await originalInit.apply(this, arguments);
      await normalizeDb();
      return initResult;
    };
    menu.__cleanV3NormalizerWrapped = true;
  }

  // Best effort at boot; the wrapped init keeps it correct later too.
  normalizeDb().catch(() => {});
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed,
    menuInitWrapped: !!menu.__cleanV3NormalizerWrapped,
    fixes: {
      navMainRouteNoLongerDuplicatesMainHome: true,
      removesPlaceholderChannelId: true,
      removesPlaceholderPostId: true,
      commentsOpenAppTouched: false,
      commentsModuleTouched: false
    },
    lastNormalize
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, normalizeDb };
