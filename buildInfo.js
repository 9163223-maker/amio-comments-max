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

const packageJson = readJsonSafe(path.join(__dirname, "package.json"));
const markerJson = readJsonSafe(path.join(__dirname, "build-info.json"));

const displayVersion = String(
  process.env.BUILD_VERSION ||
    process.env.RUNTIME_VERSION ||
    markerJson.displayVersion ||
    markerJson.runtimeVersion ||
    packageJson.displayVersion ||
    packageJson.buildVersion ||
    packageJson.version ||
    "dev"
).trim();

const sourceMarker = String(
  process.env.BUILD_SOURCE_MARKER ||
    markerJson.sourceMarker ||
    packageJson.sourceMarker ||
    `adminkit-${displayVersion}-local`
).trim();

const BUILD_INFO = Object.freeze({
  runtimeVersion: displayVersion,
  buildVersion: String(markerJson.buildVersion || packageJson.buildVersion || displayVersion).trim(),
  displayVersion,
  packageVersion: String(packageJson.version || "").trim(),
  packageName: String(packageJson.name || "amio-comments-max").trim(),
  sourceMarker,
  buildGeneratedAt: String(markerJson.buildGeneratedAt || "").trim(),
  serverStartedAt: SERVER_STARTED_AT,
  buildInfoSource: "build-info.json/package.json/env"
});

function getBuildInfo() {
  return { ...BUILD_INFO, generatedAt: Date.now() };
}

module.exports = { BUILD_INFO, getBuildInfo };
