'use strict';

// CC7.2.7 clean runtime bridge.
// Keeps the existing UI layout, guarantees /public/app.js is served from public/app-onepass.js,
// and appends a tiny bridge-payload recovery script for MAX open_app payloads.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.2.7-APPJS-BRIDGE-PAYLOAD-RECOVERY';
const SOURCE = 'adminkit-cc7-2-7-bridge-payload-recovery';
const MARKER = '__ADMINKIT_CC7_2_7_APPJS_BRIDGE_PAYLOAD_RECOVERY__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

const loadedLayers = [];
let installedAt = '';

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}

function isAppJsRequest(req) {
  const u = String(req?.originalUrl || req?.url || '');
  const p = String(req?.path || '');
  return /(^|\/)app\.js(?:\?|$)/.test(u) || /(^|\/)app\.js$/.test(p);
}

function loadLayer(pathName) {
  const item = { path: pathName, ok: false, at: new Date().toISOString(), error: '' };
  try {
    const mod = require(pathName);
    const result = mod && typeof mod.install === 'function' ? mod.install() : null;
    item.ok = result?.ok !== false;
    item.runtimeVersion = result?.runtimeVersion || mod?.RUNTIME || '';
    item.marker = result?.marker || mod?.MARKER || '';
    item.result = result || null;
  } catch (error) {
    item.ok = false;
    item.error = error?.message || String(error);
    console.warn('[cc7.2.7-onepass-bridge] layer failed:', pathName, item.error);
  }
  loadedLayers.push(item);
  return item;
}

function buildBridgePayloadRecoveryScript() {
  return `\n\n;(() => {\n'use strict';\nconst RUNTIME = ${JSON.stringify(RUNTIME)};\nconst MARKER = '__ADMINKIT_CC7_2_7_BRIDGE_PAYLOAD_RECOVERY__';\nif (window[MARKER]) return;\nwindow[MARKER] = true;\nfunction clean(v){return String(v||'').replace(/\\s+/g,' ').trim();}\nfunction dec(v){let s=String(v||''); for(let i=0;i<4;i++){try{const d=decodeURIComponent(s.replace(/\\+/g,'%20')); if(d===s) break; s=d;}catch(_){break;}} return s;}\nfunction add(list,v){if(v===undefined||v===null) return; if(typeof v==='string'||typeof v==='number'||typeof v==='boolean'){const s=clean(dec(v)); if(s && !list.includes(s)) list.push(s); return;} try{const s=JSON.stringify(v); if(s && s !== '{}' && !list.includes(s)) list.push(s.slice(0,6000));}catch(_){}}\nfunction walk(obj,list,depth,seen){if(!obj||depth>5) return; if(typeof obj!=='object'){add(list,obj);return;} if(seen.has(obj)) return; seen.add(obj); let entries=[]; try{entries=Object.entries(obj);}catch(_){return;} for(const [k,v] of entries){const key=String(k||''); if(/start|payload|param|launch|query|hash|comment|post|channel|handoff|initData|data/i.test(key)) add(list,v); if(v && typeof v==='object') walk(v,list,depth+1,seen);}}\nfunction apps(){return [window.WebApp, window.Telegram&&window.Telegram.WebApp, window.Max&&window.Max.WebApp, window.MAX&&window.MAX.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max&&window.max.WebApp].filter(Boolean);}\nfunction parsePieces(pieces){const out={commentKey:'',handoff:'',startapp:'',channelId:'',postId:'',title:'',raw:''}; const all=pieces.map(dec); for(const s0 of all){const s=clean(s0); if(!s) continue; let m; if(!out.commentKey){m=s.match(/-?\\d{3,}:-?\\d{1,}/); if(m) out.commentKey=m[0];}\nif(!out.handoff){m=s.match(/h_[A-Za-z0-9_-]{6,}/); if(m) out.handoff=m[0];}\nif(!out.startapp){m=s.match(/(?:^|[^A-Za-z0-9_-])((?:cp|ck)_-?\\d{3,}_-?\\d{1,})(?:$|[^A-Za-z0-9_-])/i) || s.match(/^((?:cp|ck)_-?\\d{3,}_-?\\d{1,})$/i); if(m) out.startapp=m[1];}\nif(out.startapp && !out.commentKey){m=out.startapp.match(/^(?:cp|ck)_(-?\\d{3,})_(-?\\d{1,})$/i); if(m){out.channelId=m[1]; out.postId=m[2]; out.commentKey=m[1]+':'+m[2];}}\nif(!out.postId){m=s.match(/(?:postId|post_id|messageId|post)[\\s:=\\\"]+(-?\\d{1,})/i); if(m) out.postId=m[1];}\nif(!out.title){m=s.match(/\\b(Post\\s*\\d+|Пост\\s*\\d+)\\b/i); if(m) out.title=m[1];}}\nif(out.commentKey && out.commentKey.includes(':')){const p=out.commentKey.split(':'); if(!out.channelId) out.channelId=p[0]; if(!out.postId) out.postId=p[1];}\nout.raw=all.join(' ').slice(0,5000); return out;}\nfunction recover(){try{const initial=window.__ADMINKIT_CC7_2_INITIAL__; if(initial && initial.ok) return; const current=window.__ADMINKIT_CC7_2_STATE__||{}; if(current.commentKey || current.handoff || current.postId) return; const pieces=[]; add(pieces, location.href); add(pieces, location.search); add(pieces, location.hash); add(pieces, document.referrer||''); apps().forEach(a=>walk(a,pieces,0,new Set())); const found=parsePieces(pieces); window.__ADMINKIT_CC7_2_RECOVERY__={runtimeVersion:RUNTIME, found, pieces:pieces.slice(0,30)}; if(!(found.commentKey || found.handoff || found.startapp)) return; const fingerprint=clean(found.commentKey||found.handoff||found.startapp); if(!fingerprint) return; const guardKey='adminkit_cc727_recovered_'+fingerprint; if(sessionStorage.getItem(guardKey)==='1') return; sessionStorage.setItem(guardKey,'1'); const q=new URLSearchParams(); if(found.commentKey) q.set('commentKey',found.commentKey); if(found.handoff) q.set('handoff',found.handoff); if(found.startapp) q.set('startapp',found.startapp); if(found.channelId) q.set('channelId',found.channelId); if(found.postId) q.set('postId',found.postId); if(found.title) q.set('title',found.title); if(found.raw) q.set('raw',found.raw); q.set('recover','cc727'); q.set('t',Date.now()); location.replace('/app?'+q.toString());}catch(error){window.__ADMINKIT_CC7_2_RECOVERY_ERROR__=String(error&&error.message||error);}}\nsetTimeout(recover,350);\nsetTimeout(recover,1300);\n})();\n`;
}

function readOnepassAppJs() {
  const file = path.resolve(__dirname, 'public', 'app-onepass.js');
  const source = fs.readFileSync(file, 'utf8');
  return source + buildBridgePayloadRecoveryScript() + '\n\n;window.__ADMINKIT_SERVED_APPJS__=' + JSON.stringify({ runtimeVersion: RUNTIME, sourceMarker: SOURCE }) + ';\n';
}

function installRoutes(app) {
  if (!app || app.__adminkitCc727OnepassRoutes) return app;
  app.__adminkitCc727OnepassRoutes = true;

  registerCommentOpenStateRoutes(app);

  app.get(['/public/app.js', '/app.js', '/public/app-onepass.js'], (req, res, next) => {
    try {
      noCache(res);
      res.type('application/javascript; charset=utf-8').send(readOnepassAppJs());
    } catch (error) { next(error); }
  });

  app.get('/debug/cc7', (req, res) => {
    noCache(res);
    let appOnepass = { exists: false, bytes: 0, error: '' };
    try {
      const file = path.resolve(__dirname, 'public', 'app-onepass.js');
      const stat = fs.statSync(file);
      appOnepass = { exists: true, bytes: stat.size, error: '' };
    } catch (error) {
      appOnepass = { exists: false, bytes: 0, error: error?.message || String(error) };
    }
    res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      sourceMarker: SOURCE,
      marker: MARKER,
      installedAt,
      policy: 'static_bypass_then_serve_public_app_js_from_clean_onepass_runtime_with_bridge_payload_recovery',
      appOnepass,
      loadedLayers,
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest()
    });
  });

  app.get(['/debug/ping', '/debug/version'], (req, res) => {
    noCache(res);
    res.json({
      ok: true,
      service: 'amio-comments-max',
      runtimeVersion: RUNTIME,
      buildVersion: RUNTIME,
      displayVersion: 'CC7.2.7',
      sourceMarker: SOURCE,
      generatedAt: Date.now(),
      installedAt
    });
  });

  return app;
}

function patchExpressStatic(expressModule) {
  if (!expressModule || expressModule.__adminkitCc727StaticWrapped) return expressModule;
  const originalStatic = expressModule.static;
  if (typeof originalStatic !== 'function') return expressModule;
  expressModule.static = function adminkitCc727Static(...args) {
    const middleware = originalStatic.apply(this, args);
    return function adminkitCc727StaticMiddleware(req, res, next) {
      if (isAppJsRequest(req)) return next();
      return middleware(req, res, next);
    };
  };
  expressModule.__adminkitCc727StaticWrapped = true;
  return expressModule;
}

function installExpressWrap() {
  if (Module.__adminkitCc727OnepassExpressWrap) return;
  Module.__adminkitCc727OnepassExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc727OnepassLoad(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc727OnepassWrapped) {
        patchExpressStatic(loaded);
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        patchExpressStatic(wrappedExpress);
        wrappedExpress.__adminkitCc727OnepassWrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[cc7.2.7-onepass-bridge] express wrap skipped:', error?.message || error);
    }
    return loaded;
  };
}

function layerSummary() {
  const failed = loadedLayers.filter((x) => !x.ok);
  return {
    runtimeVersion: RUNTIME,
    marker: MARKER,
    total: loadedLayers.length,
    failed: failed.length,
    failedLayers: failed.map((x) => ({ path: x.path, error: x.error })),
    loadedLayers,
    uiRedesign: false,
    servedAppJs: 'public/app-onepass.js + bridge payload recovery',
    commentsOpenStateRoute: 'routes/commentOpenState.js',
    policy: 'static_bypass_onepass_client_no_loading_title_no_duplicate_chips_bridge_payload_recovery'
  };
}

function boot() {
  if (global[MARKER]) return;
  global[MARKER] = true;
  installedAt = new Date().toISOString();
  installExpressWrap();

  // Backend-only layers kept temporarily. No old comments repaint/observer layers are loaded here.
  loadLayer('./db-v3-store-comment-guard');
  loadLayer('./db-v3-comment-guard');
  loadLayer('./hard-v3-menu-webhook-router');
  loadLayer('./clean-v3-menu-debug');

  require('./index');
}

boot();

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };
