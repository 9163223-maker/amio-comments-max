'use strict';

// CC6.5.2.2 persistence hotfix.
// Production rule: minor UI/menu updates must not erase connected channels, posts or admin context.
// PostgreSQL is the durable source; runtime store is rehydrated from DB after every redeploy.

const Module = require('module');

const RUNTIME = 'CC6.5.2.2';
const SOURCE = 'adminkit-CC6.5.2.2-persistence-hotfix';
const state = {
  installed: false,
  storePatched: false,
  expressPatched: false,
  hydrationStartedAt: 0,
  hydrationFinishedAt: 0,
  hydrationOk: false,
  hydrationError: '',
  hydratedChannels: 0,
  hydratedPosts: 0,
  hydratedFlows: 0,
  hydratedAdminLinks: 0,
  dbCounts: {},
  lastWriteBackAt: 0,
  lastWriteBackError: '',
  lastAdminId: '',
  lastActiveChannelId: ''
};

function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function hasDb() { return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL); }
function safeJson(value) { try { return JSON.stringify(value || {}); } catch { return '{}'; } }
function channelIdOf(item = {}) { return norm(item.channel_id || item.channelId || item.id || item.chat_id || item.chatId || ''); }
function titleOf(item = {}) { return norm(item.title || item.channelTitle || item.name || item.chatTitle || channelIdOf(item)); }
function adminOf(data = {}) { return norm(data.adminId || data.userId || data.ownerId || data.createdBy || data.admin_id || ''); }
function activeChannelOf(data = {}) { return norm(data.activeChannelId || data.selectedChannelId || data.channelId || data.channel_id || data.currentChannelId || ''); }

async function countTable(db, table) {
  try { const { rows } = await db.query(`select count(*)::int as n from ${table}`); return rows[0]?.n || 0; }
  catch (error) { return { error: error?.message || String(error) }; }
}

async function collectDbCounts() {
  if (!hasDb()) return { dbUrlPresent: false };
  const db = require('./cc5-db-core');
  const counts = { dbUrlPresent: true };
  try {
    await db.init();
    counts.reachable = true;
    counts.admins = await countTable(db, 'ak_admins');
    counts.channels = await countTable(db, 'ak_channels');
    counts.adminChannelLinks = await countTable(db, 'ak_admin_channels');
    counts.posts = await countTable(db, 'ak_posts');
    counts.flowStates = await countTable(db, 'ak_flow_state');
  } catch (error) {
    counts.reachable = false;
    counts.error = error?.message || String(error);
  }
  return counts;
}

async function hydrateFromDb(reason = 'boot') {
  state.hydrationStartedAt = Date.now();
  state.hydrationFinishedAt = 0;
  state.hydrationOk = false;
  state.hydrationError = '';
  state.hydratedChannels = 0;
  state.hydratedPosts = 0;
  state.hydratedFlows = 0;
  state.hydratedAdminLinks = 0;
  if (!hasDb()) {
    state.hydrationFinishedAt = Date.now();
    state.hydrationError = 'database_url_missing';
    state.dbCounts = { dbUrlPresent: false };
    return { ok: false, error: 'database_url_missing' };
  }

  try {
    const db = require('./cc5-db-core');
    const store = require('./store');
    await db.init();

    const channels = await db.query(`
      select c.channel_id as "channelId", coalesce(nullif(c.title,''), c.channel_id) as title, c.raw as raw,
             c.updated_at as "updatedAt"
      from ak_channels c
      order by c.updated_at desc
      limit 200
    `);
    for (const row of channels.rows || []) {
      const channelId = channelIdOf(row);
      if (!channelId || typeof store.saveChannel !== 'function') continue;
      store.saveChannel(channelId, {
        title: titleOf(row),
        channelTitle: titleOf(row),
        restoredFromDb: true,
        restoredReason: reason,
        dbUpdatedAt: row.updatedAt || null,
        raw: row.raw || {}
      });
      state.hydratedChannels += 1;
    }

    const links = await db.query(`
      select ac.admin_id as "adminId", ac.channel_id as "channelId", coalesce(nullif(c.title,''), c.channel_id) as title,
             ac.updated_at as "updatedAt"
      from ak_admin_channels ac
      left join ak_channels c on c.channel_id = ac.channel_id
      order by ac.updated_at desc
      limit 500
    `);
    for (const row of links.rows || []) {
      const adminId = norm(row.adminId);
      const channelId = channelIdOf(row);
      if (!adminId || !channelId || typeof store.setSetupState !== 'function') continue;
      store.setSetupState(adminId, {
        activeChannelId: channelId,
        selectedChannelId: channelId,
        channelId,
        channelTitle: titleOf(row),
        restoredFromDb: true,
        restoredReason: reason,
        updatedAt: Date.now()
      });
      state.hydratedAdminLinks += 1;
      if (!state.lastAdminId) state.lastAdminId = adminId;
      if (!state.lastActiveChannelId) state.lastActiveChannelId = channelId;
    }

    const posts = await db.query(`
      select admin_id as "adminId", channel_id as "channelId", post_id as "postId", message_id as "messageId",
             comment_key as "commentKey", coalesce(nullif(title,''), post_id) as title, raw, updated_at as "updatedAt"
      from ak_posts
      order by updated_at desc
      limit 500
    `);
    for (const row of posts.rows || []) {
      const commentKey = norm(row.commentKey || (row.channelId && row.postId ? `${row.channelId}:${row.postId}` : ''));
      if (!commentKey || typeof store.savePost !== 'function') continue;
      store.savePost(commentKey, {
        channelId: norm(row.channelId),
        postId: norm(row.postId),
        messageId: norm(row.messageId),
        originalText: titleOf(row),
        linkedByName: titleOf(row),
        title: titleOf(row),
        restoredFromDb: true,
        restoredReason: reason,
        dbUpdatedAt: row.updatedAt || null,
        raw: row.raw || {}
      });
      state.hydratedPosts += 1;
    }

    const flows = await db.query(`select admin_id as "adminId", flow from ak_flow_state order by updated_at desc limit 200`);
    for (const row of flows.rows || []) {
      if (!row.adminId || typeof store.setSetupState !== 'function') continue;
      const flow = row.flow && typeof row.flow === 'object' ? row.flow : {};
      const activeChannelId = activeChannelOf(flow);
      store.setSetupState(row.adminId, {
        ...flow,
        ...(activeChannelId ? { activeChannelId, selectedChannelId: activeChannelId, channelId: activeChannelId } : {}),
        restoredFromDb: true,
        restoredReason: reason,
        updatedAt: Date.now()
      });
      state.hydratedFlows += 1;
      if (!state.lastAdminId) state.lastAdminId = row.adminId;
      if (!state.lastActiveChannelId && activeChannelId) state.lastActiveChannelId = activeChannelId;
    }

    state.dbCounts = await collectDbCounts();
    state.hydrationOk = true;
    state.hydrationFinishedAt = Date.now();
    return { ok: true, ...snapshot() };
  } catch (error) {
    state.hydrationError = error?.message || String(error);
    state.hydrationFinishedAt = Date.now();
    state.dbCounts = await collectDbCounts();
    return { ok: false, error: state.hydrationError, ...snapshot() };
  }
}

function patchStoreExports() {
  if (state.storePatched) return;
  const store = require('./store');
  state.storePatched = true;

  if (store && typeof store.saveChannel === 'function' && !store.saveChannel.__cc6522) {
    const original = store.saveChannel.bind(store);
    store.saveChannel = function saveChannelPersistent(channelId, data = {}) {
      const saved = original(channelId, data);
      const adminId = adminOf(data);
      const title = titleOf(data) || channelId;
      if (adminId && channelId && hasDb()) {
        require('./cc5-db-core').upsertChannel(adminId, String(channelId), title, { source: 'cc6522_saveChannel', data })
          .then(() => { state.lastWriteBackAt = Date.now(); state.lastWriteBackError = ''; })
          .catch((error) => { state.lastWriteBackError = error?.message || String(error); });
      }
      return saved;
    };
    store.saveChannel.__cc6522 = true;
  }

  if (store && typeof store.setSetupState === 'function' && !store.setSetupState.__cc6522) {
    const original = store.setSetupState.bind(store);
    store.setSetupState = function setSetupStatePersistent(userId, next = {}) {
      const saved = original(userId, next);
      const adminId = norm(userId);
      const activeChannelId = activeChannelOf(next || saved || {});
      if (adminId && activeChannelId) {
        state.lastAdminId = adminId;
        state.lastActiveChannelId = activeChannelId;
      }
      if (adminId && hasDb()) {
        const flow = {
          ...(saved || {}),
          ...(activeChannelId ? { activeChannelId, selectedChannelId: activeChannelId, channelId: activeChannelId } : {})
        };
        require('./cc5-db-core').setFlow(adminId, flow)
          .then(() => { state.lastWriteBackAt = Date.now(); state.lastWriteBackError = ''; })
          .catch((error) => { state.lastWriteBackError = error?.message || String(error); });
      }
      return saved;
    };
    store.setSetupState.__cc6522 = true;
  }

  if (store && typeof store.clearSetupState === 'function' && !store.clearSetupState.__cc6522) {
    const original = store.clearSetupState.bind(store);
    store.clearSetupState = function clearSetupStateKeepPersistentChannel(userId) {
      const adminId = norm(userId);
      let previous = null;
      try { previous = typeof store.getSetupState === 'function' ? store.getSetupState(adminId) : null; } catch {}
      const activeChannelId = activeChannelOf(previous || {});
      const result = original(adminId);
      if (adminId && activeChannelId) {
        try {
          original(adminId);
          store.setSetupState(adminId, {
            activeChannelId,
            selectedChannelId: activeChannelId,
            channelId: activeChannelId,
            restoredAfterClear: true,
            updatedAt: Date.now()
          });
        } catch {}
      }
      return result;
    };
    store.clearSetupState.__cc6522 = true;
  }
}

function patchChannelService() {
  try {
    const channelService = require('./services/channelService');
    if (!channelService || channelService.__cc6522) return;
    const store = require('./store');
    const originalList = typeof channelService.listChannels === 'function' ? channelService.listChannels.bind(channelService) : null;
    const originalRegister = typeof channelService.registerChannel === 'function' ? channelService.registerChannel.bind(channelService) : null;

    channelService.listChannels = function listChannelsPersistent() {
      let items = [];
      try { items = originalList ? originalList() : []; } catch { items = []; }
      if ((!items || !items.length) && state.hydrationOk && typeof store.getChannelsList === 'function') {
        try { items = store.getChannelsList(); } catch { items = []; }
      }
      return Array.isArray(items) ? items : [];
    };

    channelService.registerChannel = function registerChannelPersistent(channelId, data = {}) {
      const saved = originalRegister ? originalRegister(channelId, data) : (typeof store.saveChannel === 'function' ? store.saveChannel(channelId, data) : null);
      const adminId = adminOf(data);
      if (adminId && channelId && hasDb()) {
        require('./cc5-db-core').upsertChannel(adminId, String(channelId), titleOf(data) || String(channelId), { source: 'cc6522_registerChannel', data })
          .then(() => { state.lastWriteBackAt = Date.now(); state.lastWriteBackError = ''; })
          .catch((error) => { state.lastWriteBackError = error?.message || String(error); });
      }
      return saved;
    };
    channelService.__cc6522 = true;
  } catch {}
}

function snapshot() {
  return {
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    installed: state.installed,
    storePatched: state.storePatched,
    expressPatched: state.expressPatched,
    dbUrlPresent: hasDb(),
    hydrationStartedAt: state.hydrationStartedAt,
    hydrationFinishedAt: state.hydrationFinishedAt,
    hydrationOk: state.hydrationOk,
    hydrationError: state.hydrationError,
    hydratedChannels: state.hydratedChannels,
    hydratedAdminLinks: state.hydratedAdminLinks,
    hydratedPosts: state.hydratedPosts,
    hydratedFlows: state.hydratedFlows,
    lastWriteBackAt: state.lastWriteBackAt,
    lastWriteBackError: state.lastWriteBackError,
    lastAdminId: state.lastAdminId,
    lastActiveChannelId: state.lastActiveChannelId,
    dbCounts: state.dbCounts
  };
}

function localCounts() {
  const out = { channels: 0, setupStates: 0, posts: 0 };
  try {
    const store = require('./store');
    if (typeof store.getChannelsList === 'function') out.channels = store.getChannelsList().length;
    if (typeof store.getPostsList === 'function') out.posts = store.getPostsList().length;
    if (store.store && store.store.setupState) out.setupStates = Object.keys(store.store.setupState || {}).length;
  } catch {}
  return out;
}

function sendText(res, lines) { noCache(res); return res.type('text/plain').send(lines.join('\n') + '\n'); }
async function sendPersistence(req, res) {
  state.dbCounts = await collectDbCounts();
  const local = localCounts();
  return sendText(res, [
    'OK: PERSISTENCE_' + (state.hydrationOk ? 'READY' : 'WARNING'),
    'runtime: ' + RUNTIME,
    'sourceMarker: ' + SOURCE,
    'rule: minor_updates_must_not_reset_connected_channels',
    'dbUrlPresent: ' + hasDb(),
    'postgresReachable: ' + Boolean(state.dbCounts.reachable),
    'hydrationOk: ' + Boolean(state.hydrationOk),
    'hydrationError: ' + (state.hydrationError || ''),
    'hydratedChannels: ' + state.hydratedChannels,
    'hydratedAdminLinks: ' + state.hydratedAdminLinks,
    'hydratedPosts: ' + state.hydratedPosts,
    'hydratedFlows: ' + state.hydratedFlows,
    'localChannelsAfterHydrate: ' + local.channels,
    'localPostsAfterHydrate: ' + local.posts,
    'dbChannels: ' + (state.dbCounts.channels ?? 'unknown'),
    'dbAdminChannelLinks: ' + (state.dbCounts.adminChannelLinks ?? 'unknown'),
    'dbPosts: ' + (state.dbCounts.posts ?? 'unknown'),
    'lastActiveChannelId: ' + (state.lastActiveChannelId || '')
  ]);
}
async function sendRehydrate(req, res) {
  const result = await hydrateFromDb('manual_debug');
  return res.json({ ok: Boolean(result.ok), ...snapshot(), localCounts: localCounts() });
}
function sendState(req, res) { noCache(res); return res.json({ ok: true, ...snapshot(), localCounts: localCounts() }); }

function patchExpress() {
  if (Module._load.__cc6522PersistencePatch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc6522Wrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc6522Persistence) {
          app.__cc6522Persistence = true;
          app.use((req, res, next) => {
            const route = String(req.path || req.url || '').split('?')[0].toLowerCase();
            if (route === '/debug/persistence') return sendPersistence(req, res).catch((error) => sendText(res, ['ERROR: ' + (error?.message || String(error))]));
            if (route === '/debug/persistence-rehydrate') return sendRehydrate(req, res).catch((error) => { noCache(res); return res.status(500).json({ ok: false, error: error?.message || String(error), ...snapshot() }); });
            if (route === '/debug/persistence-state') return sendState(req, res);
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc6522Wrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc6522PersistencePatch = true;
  Module._load = patchedLoad;
  state.expressPatched = true;
}

function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  state.installed = true;
  patchStoreExports();
  patchChannelService();
  patchExpress();
  hydrateFromDb('boot').catch((error) => { state.hydrationError = error?.message || String(error); state.hydrationFinishedAt = Date.now(); });
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}

module.exports = { RUNTIME, SOURCE, install, hydrateFromDb, snapshot };
