'use strict';

const Module = require('module');
const hardRoot = require('./menu-v3-hard-root');

const RUNTIME = 'HARD-V3-MENU-DEBUG-1.3-ADMIN-CANDIDATES';

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function maskId(id = '') {
  const s = String(id || '').trim();
  if (s.length <= 6) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function safeRows(db, source, sql, params = []) {
  try {
    const { rows } = await db.query(sql, params);
    return (rows || []).map((row) => ({ ...row, source }));
  } catch (error) {
    return [{ source, error: error?.message || String(error), admin_id: '' }];
  }
}

async function adminCandidates() {
  const db = require('./cc5-db-core');
  const init = await db.init().catch((error) => ({ ok: false, error: error?.message || String(error) }));
  if (!init || init.ok === false) {
    return { ok: false, runtimeVersion: RUNTIME, error: init?.error || 'db_init_failed', dbUrlPresent: !!process.env.DATABASE_URL || !!process.env.POSTGRES_URL || !!process.env.POSTGRES_URI };
  }

  const chunks = [];
  chunks.push(...await safeRows(db, 'ak_admins', `select admin_id, display_name, updated_at, created_at from ak_admins order by updated_at desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_admin_sessions', `select admin_id, account_id, active_section, active_flow, active_step, selected_channel_id, selected_post_id, active_message_id, updated_at from ak_admin_sessions order by updated_at desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_admin_channels', `select admin_id, count(*)::int as channels_count, max(updated_at) as updated_at from ak_admin_channels group by admin_id order by max(updated_at) desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_posts', `select admin_id, count(*)::int as posts_count, max(updated_at) as updated_at from ak_posts group by admin_id order by max(updated_at) desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_menu_state', `select admin_id, message_id as active_menu_message_id, updated_at from ak_menu_state order by updated_at desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_flow_state', `select admin_id, updated_at from ak_flow_state order by updated_at desc limit 25`));

  const map = new Map();
  for (const row of chunks) {
    const id = String(row.admin_id || row.adminId || '').trim();
    if (!id) continue;
    const item = map.get(id) || { adminId: id, maskedAdminId: maskId(id), sources: [], updatedAt: '', displayName: '', activeSection: '', activeFlow: '', activeStep: '', selectedChannelId: '', selectedPostId: '', activeMessageId: '', channelsCount: 0, postsCount: 0 };
    item.sources.push(row.source);
    if (row.display_name && !item.displayName) item.displayName = String(row.display_name);
    if (row.active_section) item.activeSection = String(row.active_section);
    if (row.active_flow) item.activeFlow = String(row.active_flow);
    if (row.active_step) item.activeStep = String(row.active_step);
    if (row.selected_channel_id) item.selectedChannelId = String(row.selected_channel_id);
    if (row.selected_post_id) item.selectedPostId = String(row.selected_post_id);
    if (row.active_message_id) item.activeMessageId = String(row.active_message_id);
    if (row.active_menu_message_id && !item.activeMessageId) item.activeMessageId = String(row.active_menu_message_id);
    if (row.channels_count) item.channelsCount = Math.max(item.channelsCount || 0, Number(row.channels_count) || 0);
    if (row.posts_count) item.postsCount = Math.max(item.postsCount || 0, Number(row.posts_count) || 0);
    const updated = String(row.updated_at || row.created_at || '');
    if (updated && (!item.updatedAt || updated > item.updatedAt)) item.updatedAt = updated;
    map.set(id, item);
  }

  const candidates = [...map.values()].map((item) => ({ ...item, sources: [...new Set(item.sources)] })).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 20);
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    candidates,
    recommendedCanaryAdminId: candidates[0]?.adminId || '',
    recommendedMasked: candidates[0]?.maskedAdminId || '',
    count: candidates.length,
    note: 'Для canary env используйте recommendedCanaryAdminId, если это ваш последний активный админ в MAX.'
  };
}

function install() {
  if (Module._load.__hardV3DebugOnly) return selfTest();
  const oldLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__hardV3DebugOnlyWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__hardV3DebugRoutes) {
          app.__hardV3DebugRoutes = true;
          app.get('/debug/menu-v3-hard', async (req, res) => {
            noCache(res);
            try {
              const adminId = String(req.query?.adminId || req.query?.admin || '').trim();
              const asyncTest = hardRoot.selfTestAsync ? await hardRoot.selfTestAsync(adminId) : null;
              res.json({ ok: true, runtimeVersion: RUNTIME, hardRoot: hardRoot.selfTest(), asyncTest });
            } catch (error) {
              res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error) });
            }
          });
          app.get('/debug/menu-v3-hard-render', async (req, res) => {
            noCache(res);
            try {
              const route = String(req.query?.route || 'main:home').trim() || 'main:home';
              const adminId = String(req.query?.adminId || req.query?.admin || '').trim();
              const screen = hardRoot.renderAsync ? await hardRoot.renderAsync(route, adminId, {}) : hardRoot.render(route);
              res.json({ ok: true, runtimeVersion: RUNTIME, route, screen });
            } catch (error) {
              res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error) });
            }
          });
          app.get('/debug/admin-candidates', async (req, res) => {
            noCache(res);
            try { res.json(await adminCandidates()); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error?.message || String(error) }); }
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__hardV3DebugOnlyWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__hardV3DebugOnly = true;
  return selfTest();
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, adminCandidatesEndpoint: '/debug/admin-candidates', hardRoot: hardRoot.selfTest() }; }
module.exports = { RUNTIME, install, selfTest, adminCandidates };