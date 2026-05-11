'use strict';

const Module = require('module');
const db = require('./cc5-db-core');
const menu = require('./clean-v3-menu-core-db');

const RUNTIME = 'CC6.5.7.2-CLEAN-V3-MENU-DEBUG';
const SOURCE = 'adminkit-CC6.5.7.2-clean-v3-menu-debug-admin-token';

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
    tokenPolicy: 'token=admin is accepted for clean-v3 menu debug endpoints',
    endpoints: {
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

module.exports = { RUNTIME, SOURCE, install, selfTest, tree, events, sessions, render, status };
