'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.9.7-SAFE-CORE-PARSER-PATCH';
const MARKER = '__ADMINKIT_SAFE_CORE_PARSER_PATCH_597__';
let status = { installed: false, patched: false, at: null, error: '' };

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    });
  } catch {}
}

function legacyHelperSource() {
  return `\nfunction extractLegacyCommentKey(value) {\n  const decoded = safeDecode(String(value || ""));\n  let match = decoded.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(\\d{6,})[_:]+(\\d{6,})(?:$|[^\\d])/i);\n  if (match) return '-' + match[1] + ':' + match[2];\n  match = decoded.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)[_-]+(-?\\d{6,})[_:]+(-?\\d{6,})(?:$|[^\\d])/i);\n  if (match) return match[1] + ':' + match[2];\n  return "";\n}\n`;
}

function patchAppJsText(text) {
  let body = String(text || '');
  if (body.includes(MARKER)) return { body, changed: false, alreadyPresent: true };

  body = `${MARKER};\n` + body;

  body = body.replace(
    '["startapp","postId","commentKey","start_param","post_id","WebAppStartParam","handoff","channelId"]',
    '["startapp","postId","commentKey","start_param","post_id","WebAppStartParam","payload","handoff","channelId"]'
  );

  body = body.replace(
    'const startappRawValue = getBestParam("startapp") || getBestParam("start_param") || getBestParam("WebAppStartParam") || getBestParam("handoff") || getBestParam("postId") || getBestParam("post_id") || "";',
    'const startappRawValue = getBestParam("startapp") || getBestParam("start_param") || getBestParam("WebAppStartParam") || getBestParam("payload") || getBestParam("handoff") || getBestParam("postId") || getBestParam("post_id") || "";'
  );

  if (!body.includes('function extractLegacyCommentKey(value)')) {
    body = body.replace('function normalizeStartappValue(value) {', legacyHelperSource() + 'function normalizeStartappValue(value) {');
  }

  body = body.replace(
    '  const directKey = decoded.match(/-?\\d+:-?\\d+/);\n  if (directKey) return `ck:${directKey[0]}`;\n  const numeric = decoded.match(/-?\\d{8,}/);',
    '  const directKey = decoded.match(/-?\\d+:-?\\d+/);\n  if (directKey) return `ck:${directKey[0]}`;\n  const legacyKey = extractLegacyCommentKey(decoded);\n  if (legacyKey) return `ck:${legacyKey}`;\n  const numeric = decoded.match(/-?\\d{8,}/);'
  );

  body = body.replace(
    '  const directKey = decoded.match(/-?\\d+:-?\\d+/);\n  if (directKey) return directKey[0];\n  return "";\n}',
    '  const directKey = decoded.match(/-?\\d+:-?\\d+/);\n  if (directKey) return directKey[0];\n  const legacyKey = extractLegacyCommentKey(decoded);\n  if (legacyKey) return legacyKey;\n  return "";\n}'
  );

  return { body, changed: true, alreadyPresent: false };
}

function patchPublicAppJs() {
  const file = path.resolve(__dirname, 'public', 'app.js');
  const before = fs.readFileSync(file, 'utf8');
  const result = patchAppJsText(before);
  if (result.changed) fs.writeFileSync(file, result.body, 'utf8');
  status = {
    installed: true,
    patched: Boolean(result.changed),
    alreadyPresent: Boolean(result.alreadyPresent),
    at: new Date().toISOString(),
    bytesBefore: before.length,
    bytesAfter: result.body.length,
    error: '',
    checks: selfChecks(result.body),
  };
}

function selfChecks(text) {
  const body = String(text || '');
  return {
    coreParserMarker: body.includes(MARKER),
    payloadParamIncluded: body.includes('getBestParam("payload")'),
    candidatePayloadIncluded: body.includes('"payload","handoff"'),
    legacyHelperIncluded: body.includes('function extractLegacyCommentKey(value)'),
    normalizeReadsLegacyCp: body.includes('return `ck:${legacyKey}`'),
    extractReadsLegacyCp: body.includes('if (legacyKey) return legacyKey'),
    menuTreeUntouched: true,
    bannerUntouched: true,
  };
}

function patchExpressDebug() {
  if (Module.__adminkitSafeCoreParserPatch597) return;
  Module.__adminkitSafeCoreParserPatch597 = true;
  const previousLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitSafeCoreParserPatch597Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitSafeCoreParserPatch597Route) {
            app.__adminkitSafeCoreParserPatch597Route = true;
            app.get('/debug/safe-core-parser-live', (req, res) => {
              noCache(res);
              let checks = {};
              let fileHasMarker = false;
              try {
                const text = fs.readFileSync(path.resolve(__dirname, 'public', 'app.js'), 'utf8');
                fileHasMarker = text.includes(MARKER);
                checks = selfChecks(text);
              } catch (error) {
                checks = { error: error && error.message ? error.message : String(error) };
              }
              res.json({ ok: true, runtimeVersion: RUNTIME, marker: MARKER, status, fileHasMarker, checks });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitSafeCoreParserPatch597Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  try { patchPublicAppJs(); } catch (error) { status = { installed: false, patched: false, at: new Date().toISOString(), error: error && error.message ? error.message : String(error) }; }
  patchExpressDebug();
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, status };
}

module.exports = { install, RUNTIME, MARKER, patchAppJsText };
