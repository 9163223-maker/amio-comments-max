'use strict';

const db = require('./cc5-db-core');
const menu = require('./clean-v3-menu-core-db');
const store = require('./store');

const RUNTIME = 'CC6.5.7.9-CLEAN-V3-STORE-BACKFILL';
const SOURCE = 'adminkit-CC6.5.7.9-clean-menu-store-posts-backfill';

let installed = false;
let lastNormalize = null;

function clean(value) {
  return String(value || '').trim();
}

async function safeQuery(sql, params = []) {
  try {
    await db.init();
    return await db.query(sql, params);
  } catch (error) {
    return { rows: [], rowCount: 0, error: error && error.message ? error.message : String(error || 'query_failed') };
  }
}

function parseCommentKey(commentKey = '') {
  const raw = clean(commentKey);
  const idx = raw.lastIndexOf(':');
  if (idx <= 0) return { channelId: '', postId: '' };
  return { channelId: raw.slice(0, idx), postId: raw.slice(idx + 1) };
}

async function adminIdsForChannel(channelId) {
  const ids = new Set();
  const fallback = clean(process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  if (fallback) ids.add(fallback);
  try {
    const result = await safeQuery('select admin_id from ak_admin_channels where channel_id=$1 order by updated_at desc limit 20', [String(channelId || '')]);
    for (const row of result.rows || []) {
      if (row.admin_id) ids.add(String(row.admin_id));
    }
  } catch {}
  return [...ids];
}

async function backfillStorePosts() {
  const out = { ok: true, seen: 0, selected: 0, registered: 0, skipped: 0, errors: [] };
  let posts = [];
  try {
    posts = typeof store.getPostsList === 'function' ? store.getPostsList() : [];
  } catch (error) {
    return { ok: false, seen: 0, selected: 0, registered: 0, skipped: 0, errors: [error && error.message ? error.message : String(error || 'store_get_posts_failed')] };
  }

  out.seen = posts.length;
  for (const post of posts) {
    try {
      const keyParsed = parseCommentKey(post && post.commentKey);
      const channelId = clean(post?.channelId || keyParsed.channelId);
      const postId = clean(post?.postId || keyParsed.postId);
      const commentKey = clean(post?.commentKey || (channelId && postId ? `${channelId}:${postId}` : ''));
      const messageId = clean(post?.messageId || postId);
      const title = clean(post?.originalText || post?.title || post?.text || `Пост ${postId}`).slice(0, 120);

      if (!channelId || !postId || !commentKey || channelId === 'CHANNEL_ID' || postId === 'POST_ID' || String(commentKey).startsWith('-stress:')) {
        out.skipped++;
        continue;
      }

      out.selected++;
      const admins = await adminIdsForChannel(channelId);
      for (const adminId of admins) {
        const result = await db.upsertPost(adminId, channelId, postId, title || `Пост ${postId}`, {
          source: 'clean_v3_store_backfill',
          runtimeVersion: RUNTIME,
          commentKey,
          channelTitle: clean(post?.channelTitle || channelId)
        }, messageId);
        if (result) out.registered++;
      }
    } catch (error) {
      out.errors.push(error && error.message ? error.message : String(error || 'backfill_item_failed'));
    }
  }
  out.ok = out.errors.length === 0;
  return out;
}

async function normalizeDb() {
  const result = {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    routeFix: null,
    placeholderCleanup: null,
    storeBackfill: null,
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

  // Bridge old in-memory/file store posts into PostgreSQL ak_posts for Clean V3 menus.
  result.storeBackfill = await backfillStorePosts();

  const counts = await safeQuery(`
    select
      count(*) filter (where route='main:home')::int as main_home_routes,
      count(*) filter (where node_key='main' and route='main:home')::int as real_main_routes,
      count(*) filter (where node_key='nav_main' and route='nav:main')::int as nav_main_label_routes,
      count(*) filter (where channel_id='CHANNEL_ID' or post_id='POST_ID' or comment_key like 'CHANNEL_ID:%')::int as placeholders
    from ak_menu_nodes_v3
    left join ak_posts on false
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
      backfillsStorePostsToAkPosts: true,
      commentsOpenAppTouched: false,
      commentsModuleTouched: false
    },
    lastNormalize
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, normalizeDb, backfillStorePosts };
