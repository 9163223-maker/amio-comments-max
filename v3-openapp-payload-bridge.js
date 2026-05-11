'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.5.6.4-OPENAPP-PAYLOAD-BRIDGE';
const SOURCE = 'adminkit-CC6.5.6.4-read-open-app-payload';
const MARKER = '__ADMINKIT_OPENAPP_PAYLOAD_BRIDGE__';

function patchSource(input) {
  let source = String(input || '');
  if (source.includes(MARKER)) return source;

  source = source.replace(
    '    raw.push(app?.initDataUnsafe?.query_id);',
    [
      '    raw.push(app?.initDataUnsafe?.query_id);',
      '    raw.push(app?.initDataUnsafe?.payload);',
      '    raw.push(app?.payload);',
      '    raw.push(app?.openAppPayload);',
      '    raw.push(app?.initDataUnsafe?.open_app_payload);'
    ].join('\n')
  );

  source = source.replace(
    '["startapp","postId","commentKey","start_param","post_id","WebAppStartParam","handoff","channelId"]',
    '["startapp","payload","open_app_payload","postId","commentKey","start_param","post_id","WebAppStartParam","handoff","channelId"]'
  );

  source = source.replace(
    'const startappRawValue = getBestParam("startapp") || getBestParam("start_param") || getBestParam("WebAppStartParam") || getBestParam("handoff") || getBestParam("postId") || getBestParam("post_id") || "";',
    'const startappRawValue = getBestParam("startapp") || getBestParam("payload") || getBestParam("open_app_payload") || getBestParam("start_param") || getBestParam("WebAppStartParam") || getBestParam("handoff") || getBestParam("postId") || getBestParam("post_id") || "";'
  );

  return source + '\n;window.' + MARKER + ' = { runtimeVersion: ' + JSON.stringify(RUNTIME) + ', sourceMarker: ' + JSON.stringify(SOURCE) + ', enabled: true };\n';
}

function install() {
  if (fs.__adminkitOpenAppPayloadBridgePatched) return selfTest();
  fs.__adminkitOpenAppPayloadBridgePatched = true;

  const originalReadFileSync = fs.readFileSync.bind(fs);
  const publicAppPath = path.resolve(path.join(__dirname, 'public', 'app.js'));

  fs.readFileSync = function adminkitOpenAppPayloadReadFileSync(filePath, options) {
    const content = originalReadFileSync(filePath, options);
    try {
      const resolved = path.resolve(String(filePath || ''));
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (resolved === publicAppPath && wantsText) return patchSource(content);
    } catch {}
    return content;
  };

  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    patchesPublicAppRead: !!fs.__adminkitOpenAppPayloadBridgePatched,
    policy: {
      readsOpenAppPayload: true,
      readsStartapp: true,
      readsHandoff: true,
      doesNotHideDom: true,
      doesNotChangeUi: true
    }
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest, patchSource };
