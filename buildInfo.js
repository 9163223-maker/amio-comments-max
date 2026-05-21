const fs = require("fs");
const path = require("path");

const SERVER_STARTED_AT = new Date().toISOString();

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function clean(value) {
  return String(value || "").trim();
}

const CURRENT_RUNTIME = "CC8.0.11-POSTS-SAVE-STAGED";
const BLOCKED_STALE_MARKERS = [/CC7[.\-_]?5[.\-_]?40/i, /CC7[.\-_]?5[.\-_]?45/i, /CC7[.\-_]?5[.\-_]?62/i, /CC7[.\-_]?5[.\-_]?64/i];

function isStaleDiagnosticVersion(value) {
  const text = clean(value);
  return /^SP38\.3(?:$|[-_])/i.test(text) || /safe[-_ ]?diag|stable[-_ ]?media[-_ ]?compat/i.test(text) || BLOCKED_STALE_MARKERS.some((rx) => rx.test(text));
}

function firstFresh(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text && !isStaleDiagnosticVersion(text)) return text;
  }
  return clean(values.find((value) => clean(value)) || "");
}

const packageJson = readJsonSafe(path.join(__dirname, "package.json"));
const markerJson = readJsonSafe(path.join(__dirname, "build-info.json"));
const envBuildVersion = clean(process.env.BUILD_VERSION);
const envRuntimeVersion = clean(process.env.RUNTIME_VERSION);
const envSourceMarker = clean(process.env.BUILD_SOURCE_MARKER);

const runtimeVersion = firstFresh(
  markerJson.runtimeVersion,
  markerJson.displayVersion,
  packageJson.displayVersion,
  packageJson.buildVersion,
  packageJson.version,
  envBuildVersion,
  envRuntimeVersion,
  CURRENT_RUNTIME
) || CURRENT_RUNTIME;

const buildVersion = firstFresh(
  markerJson.buildVersion,
  markerJson.runtimeVersion,
  packageJson.buildVersion,
  packageJson.version,
  envBuildVersion,
  envRuntimeVersion,
  runtimeVersion,
  CURRENT_RUNTIME
) || CURRENT_RUNTIME;

const displayVersion = firstFresh(
  markerJson.displayVersion,
  markerJson.runtimeVersion,
  packageJson.displayVersion,
  packageJson.buildVersion,
  packageJson.version,
  envBuildVersion,
  envRuntimeVersion,
  runtimeVersion,
  CURRENT_RUNTIME
) || CURRENT_RUNTIME;

const sourceMarker = firstFresh(
  markerJson.sourceMarker,
  packageJson.sourceMarker,
  envSourceMarker,
  `adminkit-${displayVersion}-local`
) || `adminkit-${CURRENT_RUNTIME.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const staleEnvIgnored = {
  BUILD_VERSION: Boolean(envBuildVersion && isStaleDiagnosticVersion(envBuildVersion)),
  RUNTIME_VERSION: Boolean(envRuntimeVersion && isStaleDiagnosticVersion(envRuntimeVersion)),
  BUILD_SOURCE_MARKER: Boolean(envSourceMarker && isStaleDiagnosticVersion(envSourceMarker))
};

const staleVersionDetected = isStaleDiagnosticVersion(runtimeVersion) || runtimeVersion !== CURRENT_RUNTIME;

const BUILD_INFO = Object.freeze({
  runtimeVersion,
  buildVersion,
  displayVersion,
  packageVersion: firstFresh(clean(packageJson.version), buildVersion, CURRENT_RUNTIME) || CURRENT_RUNTIME,
  packageName: clean(packageJson.name || "amio-comments-max"),
  sourceMarker,
  buildGeneratedAt: clean(markerJson.buildGeneratedAt),
  serverStartedAt: SERVER_STARTED_AT,
  buildInfoSource: "build-info.json/package.json/env-fresh-only",
  staleEnvIgnored,
  staleEndpointDetected: staleVersionDetected,
  activeEntrypoint: clean(process.argv?.[1] ? path.basename(process.argv[1]) : process.env.npm_package_main || packageJson.main || "index.js"),
  expectedRuntimeVersion: CURRENT_RUNTIME
});

function getBuildInfo() {
  return { ...BUILD_INFO, generatedAt: Date.now() };
}

module.exports = { BUILD_INFO, getBuildInfo };
