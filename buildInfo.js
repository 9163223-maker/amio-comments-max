'use strict';

const fs = require('fs');
const path = require('path');
const SERVER_STARTED_AT = new Date().toISOString();
const CURRENT_RUNTIME = 'CC8.3.69-PR237-SINGLE-ACTIVE-SLASH-UX';
const CURRENT_SOURCE_MARKER = 'adminkit-pr237-single-active-slash-ux';

function clean(value) { return String(value || '').trim(); }
function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}
function isStaleDiagnosticVersion(value) {
  const text = clean(value);
  return /^SP38\.3(?:$|[-_])/i.test(text) || /safe[-_ ]?diag|stable[-_ ]?media[-_ ]?compat/i.test(text) || /CC7[.\-_]?5[.\-_]?(40|45|62|64)/i.test(text);
}
function isPrePr237Identity(value) {
  const text = clean(value);
  return /PR229-STATS-SCOPE-BUTTONS-CLEANUP/i.test(text) || /adminkit-pr229-stats-scope-buttons-cleanup/i.test(text);
}
function firstFresh(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text && !isStaleDiagnosticVersion(text) && !isPrePr237Identity(text)) return text;
  }
  return clean(values.find((value) => clean(value) && !isStaleDiagnosticVersion(value)) || values.find((value) => clean(value)) || '');
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

const runtimeVersion = firstFresh(envBuildVersion, envRuntimeVersion, markerJson.runtimeVersion, markerJson.displayVersion, CURRENT_RUNTIME, packageJson.displayVersion, packageJson.buildVersion, packageJson.version) || CURRENT_RUNTIME;
const buildVersion = firstFresh(envBuildVersion, envRuntimeVersion, markerJson.buildVersion, markerJson.runtimeVersion, CURRENT_RUNTIME, packageJson.buildVersion, packageJson.version, runtimeVersion) || CURRENT_RUNTIME;
const displayVersion = firstFresh(envBuildVersion, envRuntimeVersion, markerJson.displayVersion, markerJson.runtimeVersion, CURRENT_RUNTIME, packageJson.displayVersion, packageJson.buildVersion, packageJson.version, runtimeVersion) || CURRENT_RUNTIME;
const sourceMarker = firstFresh(envSourceMarker, markerJson.sourceMarker, CURRENT_SOURCE_MARKER, packageJson.sourceMarker, `adminkit-${displayVersion}-local`) || CURRENT_SOURCE_MARKER;

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
  buildInfoSource: 'package.json/build-info.json/env-fresh-only-pr178-pr237-identity',
  staleEnvIgnored: {
    BUILD_VERSION: Boolean(envBuildVersion && (isStaleDiagnosticVersion(envBuildVersion) || isPrePr237Identity(envBuildVersion))),
    RUNTIME_VERSION: Boolean(envRuntimeVersion && (isStaleDiagnosticVersion(envRuntimeVersion) || isPrePr237Identity(envRuntimeVersion))),
    BUILD_SOURCE_MARKER: Boolean(envSourceMarker && (isStaleDiagnosticVersion(envSourceMarker) || isPrePr237Identity(envSourceMarker)))
  },
  staleEndpointDetected: isStaleDiagnosticVersion(runtimeVersion) || isPrePr237Identity(runtimeVersion) || (runtimeVersion !== CURRENT_RUNTIME && !pr178PushPairingBinding),
  activeEntrypoint: clean(process.argv?.[1] ? path.basename(process.argv[1]) : process.env.npm_package_main || packageJson.main || 'index.js'),
  expectedRuntimeVersion: CURRENT_RUNTIME,
  pr178PushPairingBinding,
  pr188PushMultiChatHandoff,
  pr191PushAdminInviteTitleCommands,
  pr237SingleActiveSlashUx: true,
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