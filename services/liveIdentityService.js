'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { getBuildInfo, BUILD_INFO } = require('../buildInfo');

const SERVER_STARTED_AT = BUILD_INFO.serverStartedAt || new Date().toISOString();
const ENV_COMMIT_KEYS = [
  'GIT_COMMIT',
  'GITHUB_SHA',
  'COMMIT_SHA',
  'SOURCE_VERSION',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'RENDER_GIT_COMMIT',
  'ADMINKIT_GIT_COMMIT',
  'ADMINKIT_BUILD_COMMIT',
  'BUILD_GIT_COMMIT',
  'PR141_MERGE_COMMIT',
  'PR140_MERGE_COMMIT',
  'PR131_MERGE_COMMIT'
];

const SAFE_ENV_BUILD_KEYS = [
  'BUILD_VERSION',
  'RUNTIME_VERSION',
  'BUILD_SOURCE_MARKER',
  'ADMINKIT_CLEAN_ENTRYPOINT',
  'npm_package_main',
  'npm_package_version'
];

function clean(value) { return String(value || '').trim(); }
function readPackage() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')); }
  catch { return {}; }
}
function shortSha(value = '') {
  const text = clean(value);
  return text ? text.slice(0, 12) : '';
}
function isSecretKey(key = '') {
  return /token|secret|authorization|password|cookie|session|webhook|private|url|uri|dsn|key$/i.test(clean(key));
}
function safeEnvValue(key = '', value = '') {
  const k = clean(key);
  if (!k || isSecretKey(k)) return '';
  return clean(value).slice(0, 160);
}
function envCommitCandidates() {
  const out = {};
  for (const key of ENV_COMMIT_KEYS) {
    const value = safeEnvValue(key, process.env[key]);
    if (value) out[key] = value;
  }
  return out;
}
function envBuildFields() {
  const out = {};
  for (const key of SAFE_ENV_BUILD_KEYS) {
    const value = safeEnvValue(key, process.env[key]);
    if (value) out[key] = value;
  }
  return out;
}
function validCommit(value = '') {
  const text = clean(value);
  if (!text) return '';
  return /^[a-f0-9]{7,64}$/i.test(text) ? text : '';
}
function firstCommitCandidate(candidates = []) {
  for (const item of candidates) {
    const value = validCommit(item && item.value);
    if (value) return { value, source: clean(item && item.source) || 'unknown' };
  }
  return { value: '', source: '' };
}
function localGitCommit() {
  try {
    const root = path.join(__dirname, '..');
    if (!fs.existsSync(path.join(root, '.git'))) return '';
    return validCommit(childProcess.execSync('git rev-parse HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 800
    }));
  } catch {
    return '';
  }
}
function selectGitCommit({ envCandidates = {}, localCommit = '', buildInfoGitCommit = '', packageGitCommit = '' } = {}) {
  const runtime = firstCommitCandidate(ENV_COMMIT_KEYS.map((key) => ({ source: key, value: envCandidates[key] })));
  if (runtime.value) {
    return {
      gitCommit: runtime.value,
      gitCommitSource: runtime.source,
      runtimeGitCommit: runtime.value,
      runtimeGitCommitSource: runtime.source
    };
  }
  const local = validCommit(localCommit);
  if (local) {
    return {
      gitCommit: local,
      gitCommitSource: 'local_git_head',
      runtimeGitCommit: '',
      runtimeGitCommitSource: ''
    };
  }
  const fallback = firstCommitCandidate([
    { source: 'buildInfo.gitCommit', value: buildInfoGitCommit },
    { source: 'package.gitCommit', value: packageGitCommit }
  ]);
  return {
    gitCommit: fallback.value,
    gitCommitSource: fallback.source,
    runtimeGitCommit: '',
    runtimeGitCommitSource: ''
  };
}
function activeEntrypoint(packageJson = readPackage()) {
  return clean(process.env.ADMINKIT_CLEAN_ENTRYPOINT)
    || clean(process.argv?.[1] ? path.basename(process.argv[1]) : '')
    || clean(packageJson.main)
    || 'unknown';
}
function activeBotModule() {
  try { return path.basename(require.resolve('../bot')); }
  catch { return 'bot.js'; }
}
function identity() {
  const build = getBuildInfo();
  const pkg = readPackage();
  const candidates = envCommitCandidates();
  const buildInfoGitCommit = validCommit(build.gitCommit);
  const packageGitCommit = validCommit(pkg.gitCommit);
  const localCommit = localGitCommit();
  const selected = selectGitCommit({ envCandidates: candidates, localCommit, buildInfoGitCommit, packageGitCommit });
  const gitCommit = selected.gitCommit;
  return {
    generatedAt: new Date().toISOString(),
    generatedAtMs: Date.now(),
    serverStartedAt: SERVER_STARTED_AT,
    uptimeSec: Math.floor(process.uptime()),
    pid: process.pid,
    nodeVersion: process.version,
    runtimeVersion: clean(process.env.RUNTIME_VERSION) || build.runtimeVersion || '',
    buildVersion: clean(process.env.BUILD_VERSION) || build.buildVersion || '',
    displayVersion: build.displayVersion || clean(process.env.BUILD_VERSION) || '',
    packageVersion: pkg.version || build.packageVersion || '',
    sourceMarker: clean(process.env.BUILD_SOURCE_MARKER) || build.sourceMarker || '',
    gitCommit,
    gitCommitShort: shortSha(gitCommit),
    gitCommitSource: selected.gitCommitSource,
    runtimeGitCommit: selected.runtimeGitCommit,
    runtimeGitCommitSource: selected.runtimeGitCommitSource,
    buildInfoGitCommit,
    packageGitCommit,
    localGitCommit: localCommit,
    activeEntrypoint: activeEntrypoint(pkg),
    activeBotModule: activeBotModule(),
    envCommitCandidates: candidates,
    envBuildFields: envBuildFields()
  };
}
function fingerprint() {
  const id = identity();
  return {
    runtimeVersion: id.runtimeVersion,
    buildVersion: id.buildVersion,
    sourceMarker: id.sourceMarker,
    gitCommit: id.gitCommit,
    gitCommitShort: id.gitCommitShort,
    gitCommitSource: id.gitCommitSource,
    runtimeGitCommit: id.runtimeGitCommit,
    runtimeGitCommitSource: id.runtimeGitCommitSource,
    buildInfoGitCommit: id.buildInfoGitCommit,
    localGitCommit: id.localGitCommit,
    activeEntrypoint: id.activeEntrypoint,
    activeBotModule: id.activeBotModule,
    serverStartedAt: id.serverStartedAt
  };
}
function compareExpectedCommit(expectedCommit = '', actualCommit = identity().gitCommit) {
  const expected = clean(expectedCommit).toLowerCase();
  const actual = clean(actualCommit).toLowerCase();
  if (!expected) return null;
  if (!actual) return false;
  return actual === expected || actual.startsWith(expected) || expected.startsWith(actual);
}
function warningForExpected(expectedCommit = '', actualCommit = identity().gitCommit) {
  const expected = clean(expectedCommit);
  const actual = clean(actualCommit);
  if (!actual) return 'gitCommit is missing; live build identity cannot be trusted';
  const matches = compareExpectedCommit(expected, actual);
  if (matches === false) return `gitCommit ${shortSha(actual)} differs from expected ${shortSha(expected)}`;
  return '';
}
function state() {
  if (!global.__ADMINKIT_LIVE_IDENTITY_STATE__) {
    global.__ADMINKIT_LIVE_IDENTITY_STATE__ = { latestWebhookIdentity: null, latestAdminCallback: null };
  }
  return global.__ADMINKIT_LIVE_IDENTITY_STATE__;
}
function safeAction(value = '') { return clean(value).slice(0, 120); }
function snapshot(meta = {}) {
  return {
    handledAt: new Date().toISOString(),
    requestId: clean(meta.requestId || '').slice(0, 80),
    userId: clean(meta.userId || '').slice(0, 80),
    action: safeAction(meta.action || ''),
    screenId: safeAction(meta.screenId || ''),
    handler: safeAction(meta.handler || meta.module || ''),
    module: safeAction(meta.module || ''),
    liveIdentity: fingerprint()
  };
}
function recordWebhook(meta = {}) {
  const item = snapshot(meta);
  state().latestWebhookIdentity = item;
  if (item.action || /callback/i.test(clean(meta.updateType))) state().latestAdminCallback = item;
  return item;
}
function latestWebhookIdentity() { return state().latestWebhookIdentity; }
function latestAdminCallback() { return state().latestAdminCallback; }
function buildDiagnostic({ expectedCommit = '' } = {}) {
  const id = identity();
  const commitMatchesExpected = compareExpectedCommit(expectedCommit, id.gitCommit);
  const warning = warningForExpected(expectedCommit, id.gitCommit);
  return {
    ok: true,
    identity: id,
    expectedCommit: clean(expectedCommit) || undefined,
    commitMatchesExpected,
    warning: warning || undefined,
    latestWebhookIdentity: latestWebhookIdentity(),
    latestAdminCallback: latestAdminCallback()
  };
}
function sanitizeForVisibleCard({ expectedCommit = '', lastAction = '' } = {}) {
  const id = identity();
  const match = compareExpectedCommit(expectedCommit, id.gitCommit);
  return [
    'Live diagnostic',
    `commit: ${id.gitCommitShort || 'missing'}`,
    `commitSource: ${id.gitCommitSource || 'missing'}`,
    `runtime: ${id.runtimeVersion || 'missing'}`,
    `source: ${id.sourceMarker || 'missing'}`,
    `entrypoint: ${id.activeEntrypoint || 'unknown'}`,
    `serverStartedAt: ${id.serverStartedAt || 'unknown'}`,
    `lastAction: ${clean(lastAction) || clean(latestAdminCallback()?.action) || 'unknown'}`,
    `expected: ${match === null ? 'not provided' : (match ? 'matched' : 'mismatch')}`
  ].join('\n');
}

module.exports = {
  ENV_COMMIT_KEYS,
  SAFE_ENV_BUILD_KEYS,
  identity,
  fingerprint,
  compareExpectedCommit,
  warningForExpected,
  recordWebhook,
  latestWebhookIdentity,
  latestAdminCallback,
  buildDiagnostic,
  sanitizeForVisibleCard,
  selectGitCommit,
  validCommit,
  localGitCommit,
  shortSha
};
