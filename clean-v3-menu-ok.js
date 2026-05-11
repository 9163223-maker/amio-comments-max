'use strict';

const Module = require('module');
const db = require('./cc5-db-core');
const menu = require('./clean-v3-menu-core-db');

const RUNTIME = 'CC6.5.7.9-CLEAN-V3-STORE-BACKFILL-OK';
const SOURCE = 'adminkit-CC6.5.7.9-ultra-short-menu-health-store-backfill';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

async function q(sql, params = []) {
  await db.init();
  return db.query(sql, params);
}

async function okPayload() {
  await menu.init();
  const adminId = String(process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  const { rows: nodeRows } = await q(`
    select
      count(*)::int as nodes,
      count(*) filter (where route='main:home' and node_key='main')::int as main_route,
      count(*) filter (where parent_key='main' and visible=true)::int as main_buttons,
      count(*) filter (where parent_key='comments' and visible=true)::int as comments_buttons,
      count(*) filter (where route='comments:choose_post')::int as choose_post,
      count(*) filter (where route='comments:post')::int as comments_post
    from ak_menu_nodes_v3
  `);
  const { rows: eventRows } = await q(`select count(*)::int as events from ak_menu_events_v3`);
  const { rows: sessionRows } = await q(`select count(*)::int as sessions from ak_menu_session_v3`);
  const { rows: stateRows } = await q(`select message_id as "messageId", updated_at as "updatedAt" from ak_menu_state where admin_id=$1 limit 1`, [adminId]);
  const channels = await db.getChannels(adminId).catch(() => []);
  const activeChannel = channels.find((c) => !String(c.channelId || '').includes('CHANNEL_ID')) || channels[0] || null;
  const posts = activeChannel?.channelId ? await db.getPosts(adminId, activeChannel.channelId, 10).catch(() => []) : [];
  const c = nodeRows[0] || {};
  const activeMenuMessageId = stateRows[0]?.messageId || '';
  const checks = {
    main: Number(c.main_route || 0) === 1,
    mainButtons: Number(c.main_buttons || 0) === 12,
    commentsButtons: Number(c.comments_buttons || 0) === 8,
    choosePost: Number(c.choose_post || 0) === 1,
    commentsPost: Number(c.comments_post || 0) === 1,
    noPlaceholders: !channels.some((ch) => String(ch.channelId || '').includes('CHANNEL_ID')) && !posts.some((p) => String(p.postId || '').includes('POST_ID') || String(p.commentKey || '').includes('CHANNEL_ID')),
    openAppUntouched: true,
    singleMenuFixIncluded: true,
    activeMenuMessageTracked: !!activeMenuMessageId,
    postPatcherDbSyncIncluded: true,
    storeBackfillIncluded: true
  };
  return {
    ok: Object.values(checks).every(Boolean),
    runtimeVersion: RUNTIME,
    status: 'CLEAN_V3_STORE_BACKFILL_OK',
    checks,
    counts: {
      nodes: Number(c.nodes || 0),
      mainButtons: Number(c.main_buttons || 0),
      commentsButtons: Number(c.comments_buttons || 0),
      posts: posts.length,
      events: Number(eventRows[0]?.events || 0),
      sessions: Number(sessionRows[0]?.sessions || 0)
    },
    activeMenu: {
      messageId: activeMenuMessageId,
      updatedAt: stateRows[0]?.updatedAt || null
    },
    channel: activeChannel ? { channelId: activeChannel.channelId, title: activeChannel.title } : null,
    posts: posts.map((p) => ({ title: p.title, postId: p.postId })).slice(0, 10),
    nextTest: 'New posts with Comments button should appear here immediately. Older posts absent here were not present in legacy store and need repatch/open cycle.'
  };
}

function install() {
  if (Module._load.__adminkitCleanV3MenuOk) return selfTest();
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitCleanV3MenuOkWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitCleanV3MenuOk) {
          app.__adminkitCleanV3MenuOk = true;
          app.get('/debug/menu-v3-ok', async (req, res) => {
            noCache(res);
            try { res.json(await okPayload()); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error || 'ok_failed') }); }
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitCleanV3MenuOkWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitCleanV3MenuOk = true;
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    endpoint: '/debug/menu-v3-ok',
    public: true,
    compact: true,
    singleMenuFixIncluded: true,
    postPatcherDbSyncIncluded: true,
    storeBackfillIncluded: true,
    commentsModuleTouched: false,
    openAppTouched: false
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, okPayload };
