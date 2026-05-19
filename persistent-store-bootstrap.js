'use strict';

const fs = require('fs');
const path = require('path');
const pgState = require('./postgres-state-store');

const LOCAL_DATA_DIR = path.join(__dirname, 'data');
const LOCAL_STORE_FILE = path.join(LOCAL_DATA_DIR, 'store.json');

let installedState = null;
let mirrorInstalled = false;

function clean(value) {
  return String(value || '').trim();
}

function createEmptyStore() {
  return {
    posts: {},
    comments: {},
    channels: {},
    setupState: {},
    likes: {},
    reactions: {},
    handoffs: {},
    uploadDiagnostics: [],
    moderation: { byChannel: {}, logs: [] },
    growth: { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} },
    gifts: {
      campaigns: {},
      claims: {},
      settings: {
        uploadLimits: {
          enabled: true,
          maxFiles: 1,
          maxBytes: 50 * 1024 * 1024,
          allowedTypes: ['file', 'image', 'video', 'audio'],
          allowedExtensions: []
        }
      }
    }
  };
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeStoreShape(parsed) {
  const empty = createEmptyStore();
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    posts: source.posts && typeof source.posts === 'object' ? source.posts : empty.posts,
    comments: source.comments && typeof source.comments === 'object' ? source.comments : empty.comments,
    channels: source.channels && typeof source.channels === 'object' ? source.channels : empty.channels,
    setupState: source.setupState && typeof source.setupState === 'object' ? source.setupState : empty.setupState,
    likes: source.likes && typeof source.likes === 'object' ? source.likes : empty.likes,
    reactions: source.reactions && typeof source.reactions === 'object' ? source.reactions : empty.reactions,
    handoffs: source.handoffs && typeof source.handoffs === 'object' ? source.handoffs : empty.handoffs,
    uploadDiagnostics: Array.isArray(source.uploadDiagnostics) ? source.uploadDiagnostics : [],
    moderation: {
      byChannel: source.moderation && typeof source.moderation.byChannel === 'object' ? source.moderation.byChannel : {},
      logs: Array.isArray(source.moderation && source.moderation.logs) ? source.moderation.logs : []
    },
    growth: {
      byChannel: source.growth && typeof source.growth.byChannel === 'object' ? source.growth.byChannel : {},
      clicks: Array.isArray(source.growth && source.growth.clicks) ? source.growth.clicks : [],
      pollVotes: Array.isArray(source.growth && source.growth.pollVotes) ? source.growth.pollVotes : [],
      memberSnapshots: source.growth && typeof source.growth.memberSnapshots === 'object' ? source.growth.memberSnapshots : {}
    },
    gifts: {
      campaigns: source.gifts && typeof source.gifts.campaigns === 'object' ? source.gifts.campaigns : {},
      claims: source.gifts && typeof source.gifts.claims === 'object' ? source.gifts.claims : {},
      settings: {
        ...(empty.gifts.settings || {}),
        ...((source.gifts && source.gifts.settings) || {}),
        uploadLimits: {
          ...(empty.gifts.settings.uploadLimits || {}),
          ...(((source.gifts && source.gifts.settings && source.gifts.settings.uploadLimits) || {}))
        }
      }
    }
  };
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, filePath);
}

function isKnownFixtureStore(value) {
  const posts = value && typeof value.posts === 'object' ? Object.keys(value.posts) : [];
  const channels = value && typeof value.channels === 'object' ? Object.keys(value.channels) : [];
  return posts.length === 1 && posts[0] === '-stress:sp30-global' && channels.length === 0;
}

function isMeaningfulRuntimeStore(value) {
  if (!value || typeof value !== 'object' || isKnownFixtureStore(value)) return false;
  const countKeys = (x) => (x && typeof x === 'object' ? Object.keys(x).filter(Boolean).length : 0);
  return countKeys(value.channels) > 0 || countKeys(value.posts) > 0 || countKeys(value.handoffs) > 0 || countKeys(value.comments) > 0 || countKeys(value.gifts && value.gifts.campaigns) > 0;
}

function samePath(a, b) {
  try { return path.resolve(a) === path.resolve(b); } catch { return false; }
}

function installWriteMirror() {
  if (mirrorInstalled || !pgState.isConfigured()) return false;
  mirrorInstalled = true;
  const originalWriteFileSync = fs.writeFileSync.bind(fs);
  fs.writeFileSync = function adminkitWriteFileSync(filePath, data, options) {
    const result = originalWriteFileSync(filePath, data, options);
    try {
      if (samePath(filePath, LOCAL_STORE_FILE)) {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data || '');
        const parsed = JSON.parse(text);
        pgState.scheduleSave(normalizeStoreShape(parsed));
      }
    } catch (error) {
      process.env.ADMINKIT_STORE_LAST_MIRROR_ERROR = String(error && error.message || error).slice(0, 500);
    }
    return result;
  };
  return true;
}

function publishEnv(state) {
  process.env.ADMINKIT_STORE_BACKEND = state.backend;
  process.env.ADMINKIT_STORE_MODE = state.mode;
  process.env.ADMINKIT_STORE_FILE = state.file || '';
  process.env.ADMINKIT_STORE_DIR = state.dir || '';
  process.env.ADMINKIT_STORE_TABLE = state.table || '';
  process.env.ADMINKIT_STORE_KEY = state.key || '';
  process.env.ADMINKIT_STORE_PERSISTENT = state.persistent ? '1' : '0';
  process.env.ADMINKIT_STORE_BOOTSTRAP_OK = state.ok ? '1' : '0';
  process.env.ADMINKIT_STORE_POSTGRES_CONFIGURED = state.postgresConfigured ? '1' : '0';
}

async function install(options = {}) {
  if (installedState) return installedState;
  const runtimeVersion = clean(options.runtimeVersion || process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || 'unknown');
  fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });

  if (pgState.isConfigured()) {
    const loaded = await pgState.loadSnapshot();
    const local = readJsonSafe(LOCAL_STORE_FILE);
    let seed = null;
    let action = '';

    if (loaded.ok && loaded.found && loaded.value) {
      seed = normalizeStoreShape(loaded.value);
      action = 'loaded-from-postgres';
    } else if (isMeaningfulRuntimeStore(local)) {
      seed = normalizeStoreShape(local);
      const saved = await pgState.saveSnapshot(seed);
      action = saved.ok ? 'migrated-local-to-postgres' : 'local-cache-postgres-save-failed';
    } else if (loaded.ok) {
      seed = createEmptyStore();
      const saved = await pgState.saveSnapshot(seed);
      action = saved.ok ? 'initialized-postgres-empty' : 'initialized-local-cache-only';
    }

    if (seed) atomicWriteJson(LOCAL_STORE_FILE, seed);
    const mirror = installWriteMirror();
    installedState = {
      ok: Boolean(loaded.ok || seed),
      backend: 'postgres-jsonb',
      mode: 'postgres-primary-json-cache',
      persistent: Boolean(loaded.ok || seed),
      postgresConfigured: true,
      runtimeVersion,
      table: pgState.tableName(),
      key: pgState.stateKey(),
      dir: LOCAL_DATA_DIR,
      file: LOCAL_STORE_FILE,
      action,
      mirrorInstalled: mirror,
      postgres: pgState.info(),
      error: loaded.ok ? '' : loaded.error || '',
      installedAt: new Date().toISOString()
    };
    publishEnv(installedState);
    console.log('adminkit postgres store bootstrap', JSON.stringify({
      ok: installedState.ok,
      backend: installedState.backend,
      mode: installedState.mode,
      persistent: installedState.persistent,
      runtimeVersion,
      action,
      table: installedState.table,
      key: installedState.key,
      mirrorInstalled: mirror,
      error: installedState.error || ''
    }));
    return installedState;
  }

  if (!fs.existsSync(LOCAL_STORE_FILE)) atomicWriteJson(LOCAL_STORE_FILE, createEmptyStore());
  installedState = {
    ok: true,
    backend: 'local-json-file-fallback',
    mode: 'postgres-env-missing-local-cache-only',
    persistent: false,
    postgresConfigured: false,
    runtimeVersion,
    dir: LOCAL_DATA_DIR,
    file: LOCAL_STORE_FILE,
    error: 'postgres_env_missing',
    installedAt: new Date().toISOString()
  };
  publishEnv(installedState);
  console.log('adminkit postgres store fallback', JSON.stringify({ ok: true, backend: installedState.backend, persistent: false, runtimeVersion }));
  return installedState;
}

function info() {
  const pg = pgState.info();
  return installedState || {
    ok: process.env.ADMINKIT_STORE_BOOTSTRAP_OK === '1',
    backend: clean(process.env.ADMINKIT_STORE_BACKEND) || 'not-installed',
    mode: clean(process.env.ADMINKIT_STORE_MODE) || '',
    persistent: process.env.ADMINKIT_STORE_PERSISTENT === '1',
    postgresConfigured: process.env.ADMINKIT_STORE_POSTGRES_CONFIGURED === '1' || pg.configured,
    table: clean(process.env.ADMINKIT_STORE_TABLE) || pg.table,
    key: clean(process.env.ADMINKIT_STORE_KEY) || pg.key,
    dir: clean(process.env.ADMINKIT_STORE_DIR),
    file: clean(process.env.ADMINKIT_STORE_FILE),
    postgres: pg,
    lastMirrorError: clean(process.env.ADMINKIT_STORE_LAST_MIRROR_ERROR)
  };
}

module.exports = {
  install,
  info,
  createEmptyStore,
  isMeaningfulRuntimeStore,
  isKnownFixtureStore
};
