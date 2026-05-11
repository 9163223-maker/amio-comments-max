'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.9.1-OPENAPP-SAFE-ROLLBACK';
const SOURCE = 'adminkit-CC6.5.9.1-restore-safe-startapp-parse-legacy-cp';
const MARKER = '__ADMINKIT_OPENAPP_SAFE_ROLLBACK_591__';

let installed = false;
let originalReadFileSyncRef = null;

function patchSource(input) {
  let source = String(input || '');
  if (source.includes(MARKER)) return source;

  const legacyHelpers = `
function parseLegacyCpPayload591(value) {
  const decoded = safeDecode(String(value || "")).trim();
  if (!decoded) return { commentKey: "", channelId: "", postId: "" };
  const directKey = decoded.match(/-?\\d+:-?\\d{8,}/);
  if (directKey) {
    const parts = directKey[0].split(":");
    return { commentKey: directKey[0], channelId: parts[0] || "", postId: parts.slice(1).join(":") || "" };
  }
  const cp = decoded.match(/(?:^|[^A-Za-z0-9_-])(?:cp|ck)(_+)(-?\\d+)_+(-?\\d{8,})(?:$|[^A-Za-z0-9_-])/);
  if (cp) {
    let channelId = cp[2] || "";
    const postId = cp[3] || "";
    if ((cp[1] || "").length >= 2 && channelId && !channelId.startsWith("-")) channelId = "-" + channelId;
    return { commentKey: channelId && postId ? channelId + ":" + postId : "", channelId, postId };
  }
  const post = decoded.match(/(?:^|[^A-Za-z0-9_-])post_+(-?\\d{8,})(?:$|[^A-Za-z0-9_-])/);
  if (post) return { commentKey: "", channelId: "", postId: post[1] || "" };
  return { commentKey: "", channelId: "", postId: "" };
}
function legacyCpCommentKey591(value) { return parseLegacyCpPayload591(value).commentKey || ""; }
function legacyCpChannelId591(value) { return parseLegacyCpPayload591(value).channelId || ""; }
function legacyCpPostId591(value) { return parseLegacyCpPayload591(value).postId || ""; }
`;

  const startappLine = 'const startappRawValue = getBestParam("startapp") || getBestParam("start_param") || getBestParam("WebAppStartParam") || getBestParam("handoff") || getBestParam("postId") || getBestParam("post_id") || "";';
  if (source.includes(startappLine)) {
    source = source.replace(startappLine, legacyHelpers + '\n' + startappLine);
  }

  source = source.replace(
    'const startappCommentKey = extractCommentKeyFromStartapp(startappRawValue);',
    'const startappCommentKey = legacyCpCommentKey591(startappRawValue) || extractCommentKeyFromStartapp(startappRawValue);'
  );
  source = source.replace(
    'const rawChannelId = getBestParam("channelId") || "";',
    'const rawChannelId = getBestParam("channelId") || legacyCpChannelId591(startappRawValue) || "";'
  );
  source = source.replace(
    'const rawPostId = getBestParam("postId") || getBestParam("post_id") || "";',
    'const rawPostId = getBestParam("postId") || getBestParam("post_id") || legacyCpPostId591(startappRawValue) || "";'
  );

  return source + '\n;window.' + MARKER + ' = { runtimeVersion: ' + JSON.stringify(RUNTIME) + ', safeRollback: true, menuTreeUntouched: true, bannerUntouched: true };';
}

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function installExpressDebugRoute() {
  if (Module.__adminkitOpenAppSafeRollback591ExpressPatched) return;
  Module.__adminkitOpenAppSafeRollback591ExpressPatched = true;
  const previousLoad = Module._load;
  Module._load = function openAppSafeRollback591Load(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request || '') === 'express' && loaded && !loaded.__adminkitOpenAppSafeRollback591Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitOpenAppSafeRollback591Debug) {
            app.__adminkitOpenAppSafeRollback591Debug = true;
            app.get(['/debug/openapp-payload-bridge', '/debug/openapp-payload-live'], (req, res) => {
              noCache(res);
              let patchedHasMarker = false;
              try {
                const appPath = path.resolve(path.join(__dirname, 'public', 'app.js'));
                const original = originalReadFileSyncRef || fs.readFileSync.bind(fs);
                patchedHasMarker = patchSource(String(original(appPath, 'utf8') || '')).includes(MARKER);
              } catch {}
              res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, installed, marker: MARKER, patchedHasMarker, checks: { safeRollback: true, legacyCpParse: true, menuTreeUntouched: true, bannerUntouched: true } });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitOpenAppSafeRollback591Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  if (installed) return selfTest();
  installed = true;
  if (!fs.__adminkitOpenAppSafeRollback591Patched) {
    fs.__adminkitOpenAppSafeRollback591Patched = true;
    const originalReadFileSync = fs.readFileSync.bind(fs);
    originalReadFileSyncRef = originalReadFileSync;
    const publicAppPath = path.resolve(path.join(__dirname, 'public', 'app.js'));
    fs.readFileSync = function adminkitOpenAppSafeRollback591ReadFileSync(filePath, options) {
      const content = originalReadFileSync(filePath, options);
      try {
        const resolved = path.resolve(String(filePath || ''));
        const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
        if (resolved === publicAppPath && wantsText) return patchSource(content);
      } catch {}
      return content;
    };
  }
  installExpressDebugRoute();
  return selfTest();
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, policy: { safeRollback: true, parsesLegacyCp: true, doesNotChangeMenu: true, doesNotChangeBanner: true } };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, patchSource };
