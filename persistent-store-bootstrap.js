'use strict';

const fs = require('fs');
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, 'data');
const LOCAL_STORE_FILE = path.join(LOCAL_DATA_DIR, 'store.json');
const STORE_FILE_NAME = 'store.json';

let installedState = null;

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
  const meaningfulPosts = countKeys(value.posts) > 0;
  const meaningfulChannels = countKeys(value.channels) > 0;
  const meaningfulHandoffs = countKeys(value.handoffs) > 0;
  const meaningfulComments = countKeys(value.comments) > 0;
  const meaningfulGifts = countKeys(value.gifts && value.gifts.campaigns) > 0;
  return meaningfulChannels || meaningfulPosts || meaningfulHandoffs || meaningfulComments || meaningfulGifts;
}

function canUseDirectory(dirPath, createMissing) {
  try {
    if (createMissing) fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK | fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveDurableDir() {
  const explicit = clean(process.env.ADMINKIT_STORE_DIR) || clean(process.env.ADMINKIT_DATA_DIR) || clean(process.env.PERSISTENT_STORE_DIR) || clean(process.env.STORE_DATA_DIR);
  if (explicit) {
    return { dir: path.resolve(explicit), mode: 'env' };
  }

  const volumeCandidates = ['/data/adminkit', '/var/data/adminkit', '/mnt/data/adminkit'];
  for (const candidate of volumeCandidates) {
    const parent = path.dirname(candidate);
    if (fs.existsSync(parent) && canUseDirectory(candidate, true)) {
      return { dir: candidate, mode: 'volume-default' };
    }
  }

  return { dir: LOCAL_DATA_DIR, mode: 'local-fallback' };
}

function samePath(a, b) {
  const aa = path.resolve(a);
  const bb = path.resolve(b);
  if (aa === bb) return true;
  try {
    return fs.realpathSync.native(aa) === fs.realpathSync.native(bb);
  } catch {
    return false;
  }
}

function ensureDurableStoreFile(targetFile) {
  if (fs.existsSync(targetFile)) return { action: 'existing' };

  const local = readJsonSafe(LOCAL_STORE_FILE);
  if (isMeaningfulRuntimeStore(local)) {
    atomicWriteJson(targetFile, normalizeStoreShape(local));
    return { action: 'migrated-local-runtime-store' };
  }

  atomicWriteJson(targetFile, createEmptyStore());
  return { action: 'initialized-empty' };
}

function replaceLocalDataDirWithSymlink(targetDir) {
  if (samePath(LOCAL_DATA_DIR, targetDir)) {
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    return { action: 'local-data-dir-used' };
  }

  if (fs.existsSync(LOCAL_DATA_DIR)) {
    const stat = fs.lstatSync(LOCAL_DATA_DIR);
    if (stat.isSymbolicLink()) {
      let currentTarget = '';
      try { currentTarget = fs.realpathSync.native(LOCAL_DATA_DIR); } catch {}
      if (currentTarget && samePath(currentTarget, targetDir)) return { action: 'symlink-already-ok' };
      fs.unlinkSync(LOCAL_DATA_DIR);
    } else {
      const backup = LOCAL_DATA_DIR + '.runtime-backup-' + Date.now();
      fs.renameSync(LOCAL_DATA_DIR, backup);
    }
  }

  fs.symlinkSync(targetDir, LOCAL_DATA_DIR, 'dir');
  return { action: 'symlink-created' };
}

function publishEnv(state) {
  process.env.ADMINKIT_STORE_BACKEND = state.backend;
  process.env.ADMINKIT_STORE_MODE = state.mode;
  process.env.ADMINKIT_STORE_DIR = state.dir;
  process.env.ADMINKIT_STORE_FILE = state.file;
  process.env.ADMINKIT_STORE_PERSISTENT = state.persistent ? '1' : '0';
  process.env.ADMINKIT_STORE_BOOTSTRAP_OK = state.ok ? '1' : '0';
}

function install(options = {}) {
  if (installedState) return installedState;
  const runtimeVersion = clean(options.runtimeVersion || process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || 'unknown');
  const resolved = resolveDurableDir();
  const targetDir = resolved.dir;
  const targetFile = path.join(targetDir, STORE_FILE_NAME);

  try {
    if (!canUseDirectory(targetDir, true)) throw new Error('store_dir_not_writable:' + targetDir);
    const fileState = ensureDurableStoreFile(targetFile);
    const linkState = replaceLocalDataDirWithSymlink(targetDir);
    installedState = {
      ok: true,
      backend: 'persistent-json-file',
      mode: resolved.mode,
      persistent: resolved.mode !== 'local-fallback',
      runtimeVersion,
      dir: targetDir,
      file: targetFile,
      localDataDir: LOCAL_DATA_DIR,
      fileState: fileState.action,
      linkState: linkState.action,
      installedAt: new Date().toISOString()
    };
  } catch (error) {
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    if (!fs.existsSync(LOCAL_STORE_FILE)) atomicWriteJson(LOCAL_STORE_FILE, createEmptyStore());
    installedState = {
      ok: false,
      backend: 'local-json-file-fallback',
      mode: 'local-fallback',
      persistent: false,
      runtimeVersion,
      dir: LOCAL_DATA_DIR,
      file: LOCAL_STORE_FILE,
      localDataDir: LOCAL_DATA_DIR,
      error: String(error && error.message || error),
      installedAt: new Date().toISOString()
    };
  }

  publishEnv(installedState);
  console.log('adminkit persistent store bootstrap', JSON.stringify({
    ok: installedState.ok,
    backend: installedState.backend,
    mode: installedState.mode,
    persistent: installedState.persistent,
    runtimeVersion: installedState.runtimeVersion,
    fileState: installedState.fileState,
    linkState: installedState.linkState,
    error: installedState.error || ''
  }));
  return installedState;
}

function info() {
  return installedState || {
    ok: process.env.ADMINKIT_STORE_BOOTSTRAP_OK === '1',
    backend: clean(process.env.ADMINKIT_STORE_BACKEND) || 'not-installed',
    mode: clean(process.env.ADMINKIT_STORE_MODE) || '',
    persistent: process.env.ADMINKIT_STORE_PERSISTENT === '1',
    dir: clean(process.env.ADMINKIT_STORE_DIR),
    file: clean(process.env.ADMINKIT_STORE_FILE)
  };
}

module.exports = {
  install,
  info,
  createEmptyStore,
  isMeaningfulRuntimeStore,
  isKnownFixtureStore,
  resolveDurableDir
};
