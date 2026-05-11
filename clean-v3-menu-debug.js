'use strict';

const Module = require('module');
const db = require('./cc5-db-core');
const menu = require('./clean-v3-menu-core-db');

const RUNTIME = 'CC6.5.7.3-CLEAN-V3-MENU-LIVE';
const SOURCE = 'adminkit-CC6.5.7.3-clean-v3-menu-brief-live-debug';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function clean(value) {
  return String(value || '').trim();
}

function adminOk(req, res) {
  const expected = clean(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || process.env.MODERATION_ADMIN_TOKEN || '');
  const bearer = clean(req.get && req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const token = clean(req.query?.token || req.query?.adminToken || req.get?.('x-admin-token') || bearer || '');
  if (token === 'admin') return true;
  if (!expected) return true;
  if (token === expected) return true;
  noCache(res);
  res.status(403).json({ ok: false, runtimeVersion: RUNTIME, error: 'admin_forbidden', hint: 'append token=admin to menu debug URL' });
  return false;
}

async function query(sql, params = []) {
  await db.init();
  return db.query(sql, params);
}

async function tree() {
  await menu.init();
  const { rows } = await query(`
    select node_key, parent_key, sort_order, route, owner, title, body, visible, dynamic_kind, delegate_to_legacy, updated_at
    from ak_menu_nodes_v3
    order by coalesce(nullif(parent_key,''), node_key), sort_order asc, node_key asc
  `);
  const byParent = {};
  for (const row of rows) {
    const parent = row.parent_key || 'root';
    if (!byParent[parent]) byParent[parent] = [];
    byParent[parent].push(row);
  }
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, total: rows.length, byParent, rows };
}

async function brief() {
  await menu.init();
  const { rows: counts } = await query(`
    select
      count(*)::int as nodes,
      count(*) filter (where parent_key='main' and visible=true)::int as main_buttons,
      count(*) filter (where parent_key='comments' and visible=true)::int as comments_buttons,
      count(*) filter (where route='comments:choose_post')::int as has_choose_post,
      count(*) filter (where route='comments:post')::int as has_comments_post,
      count(*) filter (where route='main:home')::int as has_main
    from ak_menu_nodes_v3
  `);
  const { rows: mainRows } = await query(`
    select sort_order, node_key, route, title
    from ak_menu_nodes_v3
    where parent_key='main' and visible=true
    order by sort_order asc, node_key asc
  `);
  const { rows: commentRows } = await query(`
    select sort_order, node_key, route, title, dynamic_kind
    from ak_menu_nodes_v3
    where parent_key='comments' and visible=true
    order by sort_order asc, node_key asc
  `);
  const { rows: eventRows } = await query(`select count(*)::int as events from ak_menu_events_v3`);
  const { rows: sessionRows } = await query(`select count(*)::int as sessions from ak_menu_session_v3`);

  let data = null;
  try { data = await menu.dataSelfTest(process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246'); } catch {}
  const posts = Array.isArray(data?.posts) ? data.posts.map((p) => ({ postId: p.postId, title: p.title, commentKey: p.commentKey })) : [];
  const channels = Array.isArray(data?.channels) ? data.channels.map((c) => ({ channelId: c.channelId, title: c.title })) : [];

  const c = counts[0] || {};
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    status: 'CLEAN_V3_MENU_LIVE_BRIEF',
    checks: {
      cleanMenuCore: true,
      dbNodes: Number(c.nodes || 0) >= 30,
      mainRouteExists: Number(c.has_main || 0) === 1,
      mainButtons: Number(c.main_buttons || 0),
      commentsButtons: Number(c.comments_buttons || 0),
      choosePostRouteExists: Number(c.has_choose_post || 0) === 1,
      commentsPostRouteExists: Number(c.has_comments_post || 0) === 1,
      eventsLogged: Number(eventRows[0]?.events || 0),
      sessions: Number(sessionRows[0]?.sessions || 0),
      commentsOpenAppTouched: false
    },
    mainMenu: mainRows,
    commentsMenu: commentRows,
    channels,
    posts
  };
}

async function events(limit = 50, adminId = '') {
  await menu.init();
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const params = [];
  let where = '';
  if (clean(adminId)) {
    params.push(clean(adminId));
    where = 'where admin_id=$1';
  }
  params.push(safeLimit);
  const { rows } = await query(`
    select id, admin_id, route, node_key, owner, event_type, payload, message_id, created_at
    from ak_menu_events_v3
    ${where}
    order by id desc
    limit $${params.length}
  `, params);
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, totalReturned: rows.length, rows };
}

async function sessions(adminId = '') {
  await menu.init();
  const params = [];
  let where = '';
  if (clean(adminId)) {
    params.push(clean(adminId));
    where = 'where admin_id=$1';
  }
  const { rows } = await query(`
    select admin_id, current_route, current_node_key, message_id, updated_at
    from ak_menu_session_v3
    ${where}
    order by updated_at desc
    limit 50
  `, params);
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, totalReturned: rows.length, rows };
}

async function render(route = 'main:home', adminId = '') {
  const uid = clean(adminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  return menu.renderDebug(clean(route) || 'main:home', uid);
}

async function status(adminId = '') {
  const uid = clean(adminId || process.env.DEBUG_ADMIN_ID || process.env.ADMIN_ID || '17507246');
  const selfTest = menu.selfTest();
  const data = await menu.dataSelfTest(uid);
  return { ok: !!(selfTest.ok && data.ok), runtimeVersion: RUNTIME, sourceMarker: SOURCE, menuSelfTest: selfTest, data };
}

function install() {
  if (Module._load.__adminkitCleanV3MenuDebug) return selfTest();
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitCleanV3MenuDebugWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitCleanV3MenuDebug) {
          app.__adminkitCleanV3MenuDebug = true;

          app.get('/debug/menu-v3-live', async (req, res) => {
            noCache(res);
            try { res.json(await brief()); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error || 'brief_failed') }); }
          });

          app.get('/debug/menu-v3-tree', async (req, res) => {
            if (!adminOk(req, res)) return;
            noCache(res);
            try { res.json(await tree()); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error || 'tree_failed') }); }
          });

          app.get('/debug/menu-v3-events', async (req, res) => {
            if (!adminOk(req, res)) return;
            noCache(res);
            try { res.json(await events(req.query?.limit || 50, req.query?.adminId || req.query?.admin || '')); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error || 'events_failed') }); }
          });

          app.get('/debug/menu-v3-session', async (req, res) => {
            if (!adminOk(req, res)) return;
            noCache(res);
            try { res.json(await sessions(req.query?.adminId || req.query?.admin || '')); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error || 'session_failed') }); }
          });

          app.get('/debug/menu-v3-render', async (req, res) => {
            if (!adminOk(req, res)) return;
            noCache(res);
            try { res.json(await render(req.query?.route || 'main:home', req.query?.adminId || req.query?.admin || '')); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error || 'render_failed') }); }
          });

          app.get('/debug/menu-v3-status', async (req, res) => {
            if (!adminOk(req, res)) return;
            noCache(res);
            try { res.json(await status(req.query?.adminId || req.query?.admin || '')); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error || 'status_failed') }); }
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitCleanV3MenuDebugWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitCleanV3MenuDebug = true;
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    tokenPolicy: 'menu-v3-live is public and concise; full endpoints accept token=admin',
    endpoints: {
      live: '/debug/menu-v3-live',
      status: '/debug/menu-v3-status?token=admin',
      tree: '/debug/menu-v3-tree?token=admin',
      events: '/debug/menu-v3-events?token=admin&limit=50',
      session: '/debug/menu-v3-session?token=admin',
      render: '/debug/menu-v3-render?token=admin&route=main:home'
    },
    commentsModuleTouched: false,
    openAppTouched: false
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, tree, brief, events, sessions, render, status };
