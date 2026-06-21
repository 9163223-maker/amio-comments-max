'use strict';

const fs = require('fs');
const path = require('path');
const SERVER_STARTED_AT = new Date().toISOString();
const CURRENT_RUNTIME = 'CC8.3.67-PR228-LIVE-CALLBACK-CONTRACT';

function clean(value) { return String(value || '').trim(); }
function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}
function isStaleDiagnosticVersion(value) {
  const text = clean(value);
  return /^SP38\.3(?:$|[-_])/i.test(text) || /safe[-_ ]?diag|stable[-_ ]?media[-_ ]?compat/i.test(text) || /CC7[.\-_]?5[.\-_]?(40|45|62|64)/i.test(text);
}
function firstFresh(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text && !isStaleDiagnosticVersion(text)) return text;
  }
  return clean(values.find((value) => clean(value)) || '');
}

const packageJson = readJsonSafe(path.join(__dirname, 'package.json'));
const markerJson = readJsonSafe(path.join(__dirname, 'build-info.json'));
const envBuildVersion = clean(process.env.BUILD_VERSION);
const envRuntimeVersion = clean(process.env.RUNTIME_VERSION);
const envSourceMarker = clean(process.env.BUILD_SOURCE_MARKER);
const envGitCommit = clean(process.env.GIT_COMMIT || process.env.COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION);
const pr178PushPairingBinding = packageJson.pr178PushPairingBinding === true;
const pr188PushMultiChatHandoff = packageJson.pr188PushMultiChatHandoff === true;
const pr191PushAdminInviteTitleCommands = packageJson.pr191PushAdminInviteTitleCommands === true;

const runtimeVersion = firstFresh(packageJson.displayVersion, packageJson.buildVersion, packageJson.version, envBuildVersion, envRuntimeVersion, markerJson.runtimeVersion, markerJson.displayVersion, CURRENT_RUNTIME) || CURRENT_RUNTIME;
const buildVersion = firstFresh(packageJson.buildVersion, packageJson.version, envBuildVersion, envRuntimeVersion, markerJson.buildVersion, markerJson.runtimeVersion, runtimeVersion, CURRENT_RUNTIME) || CURRENT_RUNTIME;
const displayVersion = firstFresh(packageJson.displayVersion, packageJson.buildVersion, packageJson.version, envBuildVersion, envRuntimeVersion, markerJson.displayVersion, markerJson.runtimeVersion, runtimeVersion, CURRENT_RUNTIME) || CURRENT_RUNTIME;
const sourceMarker = firstFresh(packageJson.sourceMarker, envSourceMarker, markerJson.sourceMarker, `adminkit-${displayVersion}-local`) || `adminkit-${CURRENT_RUNTIME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const BUILD_INFO = Object.freeze({
  runtimeVersion,
  buildVersion,
  displayVersion,
  packageVersion: firstFresh(clean(packageJson.version), buildVersion, CURRENT_RUNTIME) || CURRENT_RUNTIME,
  packageName: clean(packageJson.name || 'amio-comments-max'),
  sourceMarker,
  gitCommit: firstFresh(envGitCommit, markerJson.gitCommit, '') || '',
  pr131MergeCommit: firstFresh(markerJson.pr165MergeCommit, markerJson.pr131MergeCommit, '') || '',
  buildGeneratedAt: clean(markerJson.buildGeneratedAt),
  serverStartedAt: SERVER_STARTED_AT,
  buildInfoSource: 'package.json/build-info.json/env-fresh-only-pr178',
  staleEnvIgnored: {
    BUILD_VERSION: Boolean(envBuildVersion && isStaleDiagnosticVersion(envBuildVersion)),
    RUNTIME_VERSION: Boolean(envRuntimeVersion && isStaleDiagnosticVersion(envRuntimeVersion)),
    BUILD_SOURCE_MARKER: Boolean(envSourceMarker && isStaleDiagnosticVersion(envSourceMarker))
  },
  staleEndpointDetected: isStaleDiagnosticVersion(runtimeVersion) || (runtimeVersion !== CURRENT_RUNTIME && !pr178PushPairingBinding),
  activeEntrypoint: clean(process.argv?.[1] ? path.basename(process.argv[1]) : process.env.npm_package_main || packageJson.main || 'index.js'),
  expectedRuntimeVersion: CURRENT_RUNTIME,
  pr178PushPairingBinding,
  pr188PushMultiChatHandoff,
  pr191PushAdminInviteTitleCommands,
  pushPairingRuntimeVersion: pr178PushPairingBinding ? CURRENT_RUNTIME : '',
  pushRuntimeSourceMarker: pr178PushPairingBinding ? sourceMarker : '',
  pushPairingBaseSourceMarker: pr178PushPairingBinding ? 'adminkit-pr188-push-multi-chat-handoff' : '',
  pushPairingSourceMarker: pr178PushPairingBinding ? sourceMarker : '',
  pr165RuntimeWired: Boolean(markerJson.pr165RuntimeWired || process.env.PR165_RUNTIME_WIRED === '1'),
  pr165LiveChatPushRuntime: clean(markerJson.pr165LiveChatPushRuntime || '')
});

function getBuildInfo() {
  return { ...BUILD_INFO, generatedAt: Date.now() };
}

module.exports = { BUILD_INFO, getBuildInfo };
