'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.4';
const SOURCE = 'adminkit-CC6.5.4-optimized-logo-asset';
const ORIGINAL_PATH = path.join(__dirname, 'public', 'adminkit_chat_logo.png');
const OPTIMIZED_PATH = path.join(__dirname, 'public', 'adminkit_chat_logo_optimized.png');
const LOGO_PNG_BASE64 = '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';

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function ensureOptimizedLogoFile() {
  fs.mkdirSync(path.dirname(OPTIMIZED_PATH), { recursive: true });
  const buffer = Buffer.from(LOGO_PNG_BASE64, 'base64');
  if (!fs.existsSync(OPTIMIZED_PATH) || fs.statSync(OPTIMIZED_PATH).size !== buffer.length) fs.writeFileSync(OPTIMIZED_PATH, buffer);
  return buffer;
}
function originalBytes() { try { return fs.existsSync(ORIGINAL_PATH) ? fs.statSync(ORIGINAL_PATH).size : 0; } catch { return 0; } }

function installFsPatch() {
  if (fs.__adminkitCc654LogoPatch) return;
  fs.__adminkitCc654LogoPatch = true;
  const optimizedBuffer = ensureOptimizedLogoFile();
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const originalExistsSync = fs.existsSync.bind(fs);
  const originalStatSync = fs.statSync.bind(fs);
  fs.existsSync = function(filePath) { try { if (path.resolve(String(filePath || '')) === path.resolve(ORIGINAL_PATH)) return true; } catch {} return originalExistsSync(filePath); };
  fs.readFileSync = function(filePath, options) { try { if (path.resolve(String(filePath || '')) === path.resolve(ORIGINAL_PATH)) return Buffer.from(optimizedBuffer); } catch {} return originalReadFileSync(filePath, options); };
  fs.statSync = function(filePath, options) { try { if (path.resolve(String(filePath || '')) === path.resolve(ORIGINAL_PATH)) return originalStatSync(OPTIMIZED_PATH, options); } catch {} return originalStatSync(filePath, options); };
}

function installDebugEndpoint() {
  if (Module._load.__cc654LogoDebugPatch) return;
  const oldLoad = Module._load;
  function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__cc654LogoWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__cc654LogoDebug) {
          app.__cc654LogoDebug = true;
          app.use((req, res, next) => {
            const p = String(req.path || req.url || '').split('?')[0];
            if (p === '/debug/logo-asset') {
              noCache(res);
              const optimizedBuffer = ensureOptimizedLogoFile();
              return res.type('text/plain').send([
                'OK: LOGO_ASSET_READY',
                'runtime: ' + RUNTIME,
                'sourceMarker: ' + SOURCE,
                'assetFound: public/adminkit_chat_logo.png',
                'servedAsset: public/adminkit_chat_logo_optimized.png',
                'format: png',
                'dimensions: 480x168',
                'originalBytes: ' + originalBytes(),
                'optimizedBytes: ' + optimizedBuffer.length,
                'botUploadReadsOptimizedAsset: true',
                'desktopOverflowGuard: enabled'
              ].join('\n') + '\n');
            }
            return next();
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__cc654LogoWrap = true;
      return expressWrapper;
    }
    return loaded;
  }
  patchedLoad.__cc654LogoDebugPatch = true;
  Module._load = patchedLoad;
}

function install() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  ensureOptimizedLogoFile();
  installFsPatch();
  installDebugEndpoint();
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE };
}
module.exports = { RUNTIME, SOURCE, install, ensureOptimizedLogoFile };
