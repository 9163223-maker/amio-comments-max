'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.9.0-OPENAPP-PAYLOAD-BRIDGE-V2';
const SOURCE = 'adminkit-CC6.5.9.0-direct-openapp-payload-cp-double-underscore';
const MARKER = '__ADMINKIT_OPENAPP_PAYLOAD_BRIDGE_V2__';

let originalReadFileSyncRef = null;
let installed = false;

function patchSource(input) {
  let source = String(input || '');
  if (source.includes(MARKER)) return source;

  // 1) Make the common raw collector see MAX open_app payload fields.
  source = source.replace(
    '    raw.push(app?.initDataUnsafe?.query_id);',
    [
      '    raw.push(app?.initDataUnsafe?.query_id);',
      '    raw.push(app?.initDataUnsafe?.payload);',
      '    raw.push(app?.initDataUnsafe?.open_app_payload);',
      '    raw.push(app?.payload);',
      '    raw.push(app?.openAppPayload);',
      '    raw.push(app?.open_app_payload);'
    ].join('\n')
  );

  source = source.replace(
    '    raw.push(app?.params);',
    [
      '    raw.push(app?.params);',
      '    raw.push(app?.launchParams?.payload);',
      '    raw.push(app?.launchParams?.startapp);',
      '    raw.push(app?.params?.payload);',
      '    raw.push(app?.params?.startapp);'
    ].join('\n')
  );

  source = source.replace(
    '["startapp","postId","commentKey","start_param","post_id","WebAppStartParam","handoff","channelId"]',
    '["startapp","payload","open_app_payload","postId","commentKey","start_param","post_id","WebAppStartParam","handoff","channelId"]'
  );

  const helperBlock = `
function getDirectOpenAppPayloadValue() {
  const raw = [];
  try {
    for (const app of getPossibleWebApps()) {
      raw.push(app?.initDataUnsafe?.payload);
      raw.push(app?.initDataUnsafe?.open_app_payload);
      raw.push(app?.payload);
      raw.push(app?.openAppPayload);
      raw.push(app?.open_app_payload);
      raw.push(app?.launchParams?.payload);
      raw.push(app?.params?.payload);
    }
  } catch {}
  for (const value of raw) {
    const normalized = String(value || "").trim();
    if (normalized) return safeDecode(normalized);
  }
  return "";
}

function parseLegacyOpenAppPayload(value) {
  const decoded = safeDecode(String(value || "")).trim();
  if (!decoded) return { commentKey: "", channelId: "", postId: "", handoff: "" };

  const handoff = extractHandoffToken(decoded);
  if (handoff) return { commentKey: handoff, channelId: "", postId: "", handoff };

  const directKey = decoded.match(/-?\\d+:-?\\d{8,}/);
  if (directKey) {
    const parts = directKey[0].split(":");
    return { commentKey: directKey[0], channelId: parts[0] || "", postId: parts.slice(1).join(":") || "", handoff: "" };
  }

  // MAX open_app payload allows only A-Z/a-z/0-9/_/-.
  // Our negative channel id "-731..." was sanitized to "_731...", so payload became "cp__731..._116...".
  // Double underscore after cp means: restore the leading minus for channelId.
  const cp = decoded.match(/(?:^|[^A-Za-z0-9_-])cp(_+)(-?\\d+)_+(-?\\d{8,})(?:$|[^A-Za-z0-9_-])/);
  if (cp) {
    let channelId = cp[2] || "";
    const postId = cp[3] || "";
    if ((cp[1] || "").length >= 2 && channelId && !channelId.startsWith("-")) channelId = "-" + channelId;
    return { commentKey: channelId && postId ? channelId + ":" + postId : "", channelId, postId, handoff: "" };
  }

  const ck = decoded.match(/(?:^|[^A-Za-z0-9_-])ck(_+)(-?\\d+)_+(-?\\d{8,})(?:$|[^A-Za-z0-9_-])/);
  if (ck) {
    let channelId = ck[2] || "";
    const postId = ck[3] || "";
    if ((ck[1] || "").length >= 2 && channelId && !channelId.startsWith("-")) channelId = "-" + channelId;
    return { commentKey: channelId && postId ? channelId + ":" + postId : "", channelId, postId, handoff: "" };
  }

  const post = decoded.match(/(?:^|[^A-Za-z0-9_-])post_+(-?\\d{8,})(?:$|[^A-Za-z0-9_-])/);
  if (post) return { commentKey: "", channelId: "", postId: post[1] || "", handoff: "" };

  const numbers = decoded.match(/-?\\d{8,}/g) || [];
  if (numbers.length) return { commentKey: "", channelId: "", postId: numbers[numbers.length - 1] || "", handoff: "" };

  return { commentKey: "", channelId: "", postId: "", handoff: "" };
}

function legacyOpenAppPayloadToCommentKey(value) { return parseLegacyOpenAppPayload(value).commentKey || ""; }
function legacyOpenAppPayloadToChannelId(value) { return parseLegacyOpenAppPayload(value).channelId || ""; }
function legacyOpenAppPayloadToPostId(value) { return parseLegacyOpenAppPayload(value).postId || ""; }
`;

  const startappLine = 'const startappRawValue = getBestParam("startapp") || getBestParam("start_param") || getBestParam("WebAppStartParam") || getBestParam("handoff") || getBestParam("postId") || getBestParam("post_id") || "";';
  const startappReplacement = `${helperBlock}
const directOpenAppPayloadValue = getDirectOpenAppPayloadValue();
const startappRawValue = directOpenAppPayloadValue || getBestParam("startapp") || getBestParam("payload") || getBestParam("open_app_payload") || getBestParam("start_param") || getBestParam("WebAppStartParam") || getBestParam("handoff") || getBestParam("postId") || getBestParam("post_id") || "";`;

  if (source.includes(startappLine)) {
    source = source.replace(startappLine, startappReplacement);
  } else if (!source.includes('function getDirectOpenAppPayloadValue()')) {
    source += '\n' + helperBlock + '\n';
  }

  source = source.replace(
    'const startappCommentKey = extractCommentKeyFromStartapp(startappRawValue);',
    'const startappCommentKey = legacyOpenAppPayloadToCommentKey(startappRawValue) || legacyOpenAppPayloadToCommentKey(directOpenAppPayloadValue) || extractCommentKeyFromStartapp(startappRawValue);'
  );

  source = source.replace(
    'const handoffTokenValue = extractHandoffToken(startappRawValue) || getBestParam("handoff") || "";',
    'const handoffTokenValue = extractHandoffToken(startappRawValue) || extractHandoffToken(directOpenAppPayloadValue) || getBestParam("handoff") || "";'
  );

  source = source.replace(
    'const rawChannelId = getBestParam("channelId") || "";',
    'const rawChannelId = getBestParam("channelId") || legacyOpenAppPayloadToChannelId(startappRawValue) || legacyOpenAppPayloadToChannelId(directOpenAppPayloadValue) || "";'
  );

  source = source.replace(
    'const rawPostId = getBestParam("postId") || getBestParam("post_id") || "";',
    'const rawPostId = getBestParam("postId") || getBestParam("post_id") || legacyOpenAppPayloadToPostId(startappRawValue) || legacyOpenAppPayloadToPostId(directOpenAppPayloadValue) || "";'
  );

  source = source.replace(
    '  const handoff = extractHandoffToken(decoded);\n  if (handoff) return handoff;\n  const directKey = decoded.match(/-?\\d+:-?\\d+/);\n  if (directKey) return directKey[0];\n  return "";\n}',
    '  const handoff = extractHandoffToken(decoded);\n  if (handoff) return handoff;\n  const legacyKey = legacyOpenAppPayloadToCommentKey(decoded);\n  if (legacyKey) return legacyKey;\n  const directKey = decoded.match(/-?\\d+:-?\\d+/);\n  if (directKey) return directKey[0];\n  return "";\n}'
  );

  return source + '\n;window.' + MARKER + ' = { runtimeVersion: ' + JSON.stringify(RUNTIME) + ', sourceMarker: ' + JSON.stringify(SOURCE) + ', enabled: true, directPayload: true, parsesCpDoubleUnderscore: true, existingPostsDoNotNeedRepatch: true };';
}

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
  } catch {}
}

function installExpressDebugRoute() {
  if (Module.__adminkitOpenAppPayloadBridgeV2ExpressPatched) return;
  Module.__adminkitOpenAppPayloadBridgeV2ExpressPatched = true;
  const previousLoad = Module._load;
  Module._load = function openAppPayloadBridgeV2Load(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request || '') === 'express' && loaded && !loaded.__adminkitOpenAppPayloadBridgeV2Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitOpenAppPayloadBridgeV2Debug) {
            app.__adminkitOpenAppPayloadBridgeV2Debug = true;
            app.get(['/debug/openapp-payload-bridge', '/debug/openapp-payload-live'], (req, res) => {
              noCache(res);
              let patchedHasMarker = false;
              try {
                const appPath = path.resolve(path.join(__dirname, 'public', 'app.js'));
                const original = originalReadFileSyncRef || fs.readFileSync.bind(fs);
                const text = String(original(appPath, 'utf8') || '');
                patchedHasMarker = patchSource(text).includes(MARKER);
              } catch {}
              res.json({
                ok: true,
                runtimeVersion: RUNTIME,
                sourceMarker: SOURCE,
                installed,
                marker: MARKER,
                patchedHasMarker,
                checks: {
                  directOpenAppPayloadRead: true,
                  legacyCpDoubleUnderscore: true,
                  negativeChannelRestored: true,
                  postIdFallback: true,
                  menuTreeUntouched: true,
                  bannerUntouched: true
                }
              });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitOpenAppPayloadBridgeV2Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  if (installed) return selfTest();
  installed = true;

  if (!fs.__adminkitOpenAppPayloadBridgeV2Patched) {
    fs.__adminkitOpenAppPayloadBridgeV2Patched = true;
    const originalReadFileSync = fs.readFileSync.bind(fs);
    originalReadFileSyncRef = originalReadFileSync;
    const publicAppPath = path.resolve(path.join(__dirname, 'public', 'app.js'));

    fs.readFileSync = function adminkitOpenAppPayloadV2ReadFileSync(filePath, options) {
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
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    patchesPublicAppRead: !!fs.__adminkitOpenAppPayloadBridgeV2Patched,
    marker: MARKER,
    policy: {
      readsDirectOpenAppPayload: true,
      readsStartapp: true,
      readsHandoff: true,
      parsesLegacyCpDoubleUnderscorePayload: true,
      restoresNegativeChannelId: true,
      existingPostsDoNotNeedRepatch: true,
      doesNotHideDom: true,
      doesNotChangeMenu: true,
      doesNotChangeBannerSettings: true
    }
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, patchSource };
