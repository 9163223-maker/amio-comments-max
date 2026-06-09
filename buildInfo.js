'use strict';

const fs = require('fs');
const path = require('path');
const SERVER_STARTED_AT = new Date().toISOString();
const CURRENT_RUNTIME = 'CC8.3.52-PR176-COMMENTS-UX-GIFTS-RESET';

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

const runtimeVersion = firstFresh(markerJson.runtimeVersion, markerJson.displayVersion, packageJson.displayVersion, packageJson.buildVersion, packageJson.version, envBuildVersion, envRuntimeVersion, CURRENT_RUNTIME) || CURRENT_RUNTIME;
const buildVersion = firstFresh(markerJson.buildVersion, markerJson.runtimeVersion, packageJson.buildVersion, packageJson.version, envBuildVersion, envRuntimeVersion, runtimeVersion, CURRENT_RUNTIME) || CURRENT_RUNTIME;
const displayVersion = firstFresh(markerJson.displayVersion, markerJson.runtimeVersion, packageJson.displayVersion, packageJson.buildVersion, packageJson.version, envBuildVersion, envRuntimeVersion, runtimeVersion, CURRENT_RUNTIME) || CURRENT_RUNTIME;
const sourceMarker = firstFresh(markerJson.sourceMarker, packageJson.sourceMarker, envSourceMarker, `adminkit-${displayVersion}-local`) || `adminkit-${CURRENT_RUNTIME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

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
  buildInfoSource: 'build-info.json/package.json/env-fresh-only',
  staleEnvIgnored: {
    BUILD_VERSION: Boolean(envBuildVersion && isStaleDiagnosticVersion(envBuildVersion)),
    RUNTIME_VERSION: Boolean(envRuntimeVersion && isStaleDiagnosticVersion(envRuntimeVersion)),
    BUILD_SOURCE_MARKER: Boolean(envSourceMarker && isStaleDiagnosticVersion(envSourceMarker))
  },
  staleEndpointDetected: isStaleDiagnosticVersion(runtimeVersion) || runtimeVersion !== CURRENT_RUNTIME,
  activeEntrypoint: clean(process.argv?.[1] ? path.basename(process.argv[1]) : process.env.npm_package_main || packageJson.main || 'index.js'),
  expectedRuntimeVersion: CURRENT_RUNTIME,
  pr165RuntimeWired: Boolean(markerJson.pr165RuntimeWired || process.env.PR165_RUNTIME_WIRED === '1'),
  pr165LiveChatPushRuntime: clean(markerJson.pr165LiveChatPushRuntime || '')
});

function getBuildInfo() {
  return { ...BUILD_INFO, generatedAt: Date.now() };
}

module.exports = { BUILD_INFO, getBuildInfo };
