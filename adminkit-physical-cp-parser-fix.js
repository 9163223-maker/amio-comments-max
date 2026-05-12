'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.6.6-PHYSICAL-CP-PARSER-FIX';
const MARKER = '__ADMINKIT_PHYSICAL_CP_PARSER_FIX_666__';
let status = { installed: false, patched: false, error: '' };

function install() {
  try {
    const file = path.join(__dirname, 'public', 'app.js');
    let s = fs.readFileSync(file, 'utf8');
    const before = s;
    if (!s.includes(MARKER)) {
      const helper = `\n// ${MARKER}\nfunction adminkitLegacyCommentKeyFromPayload(value) {\n  const src = safeDecode(String(value || ''));\n  let m = src.match(/(?:cp|ck)_{2,}(-?\\d{6,})[_:]+(-?\\d{6,})/i);\n  if (!m) m = src.match(/(?:cp|ck)[_-]+(-?\\d{6,})[_:]+(-?\\d{6,})/i);\n  if (!m) return '';\n  let ch = String(m[1] || '');\n  const po = String(m[2] || '');\n  if (ch && !ch.startsWith('-')) ch = '-' + ch;\n  return ch && po ? ch + ':' + po : '';\n}\n`;
      s = s.replace('function normalizeStartappValue(value) {', helper + '\nfunction normalizeStartappValue(value) {');
      s = s.replace(
        '  const decoded = safeDecode(raw);\n  const handoff = extractHandoffToken(decoded);',
        '  const decoded = safeDecode(raw);\n  const akKey = adminkitLegacyCommentKeyFromPayload(decoded);\n  if (akKey) return `ck:${akKey}`;\n  const handoff = extractHandoffToken(decoded);'
      );
      s = s.replace(
        '  const decoded = safeDecode(raw);\n  const handoff = extractHandoffToken(decoded);\n  if (handoff) return handoff;\n  const directKey = decoded.match(/-?\\d+:-?\\d+/);\n  if (directKey) return directKey[0];',
        '  const decoded = safeDecode(raw);\n  const akKey = adminkitLegacyCommentKeyFromPayload(decoded);\n  if (akKey) return akKey;\n  const handoff = extractHandoffToken(decoded);\n  if (handoff) return handoff;\n  const directKey = decoded.match(/-?\\d+:-?\\d+/);\n  if (directKey) return directKey[0];'
      );
      s = s.replace(
        'function showMiniAppStartMenu() {\n',
        'function showMiniAppStartMenu() {\n  try { if (state && (state.commentKey || state.handoffToken || /^ck:/.test(String(state.startapp || "")))) { hideMiniAppStartMenu(); return; } } catch (_) {}\n'
      );
      s = s.replace('diagnostics: { runtimeVersion: "SP36" }', 'diagnostics: { runtimeVersion: "SP36", physicalCpParserFix: "CC6.6.6" }');
      fs.writeFileSync(file, s, 'utf8');
    }
    status = { installed: true, patched: s !== before, error: '', markerPresent: s.includes(MARKER), bytesBefore: before.length, bytesAfter: s.length };
  } catch (e) {
    status = { installed: false, patched: false, error: e.message || String(e) };
  }
  return { ok: status.installed, runtimeVersion: RUNTIME, marker: MARKER, status };
}

module.exports = { install, RUNTIME, MARKER };
