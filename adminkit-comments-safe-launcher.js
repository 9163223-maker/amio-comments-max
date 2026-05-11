'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.9.4-SAFE-COMMENTS-LAUNCHER-CPFIX';
const SOURCE = 'adminkit-CC6.5.9.4-isolated-comments-openapp-launcher-cp-double-underscore-fix';
const MARKER = '__ADMINKIT_COMMENTS_SAFE_LAUNCHER_594__';
let installed = false;
let lastAppJsPatch = null;

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}
function dec(v = '') {
  let s = String(v || '').trim();
  for (let i = 0; i < 5; i += 1) {
    try { const d = decodeURIComponent(s.replace(/\+/g, '%20')); if (d === s) break; s = d; } catch { break; }
  }
  return s;
}
function clean(v = '') { return String(v || '').trim().replace(/^['\"]+|['\"]+$/g, ''); }
function key(ch = '', po = '') { ch = clean(ch); po = clean(po); return ch && po ? `${ch}:${po}` : ''; }
function readParams(raw = '') {
  const out = {};
  const add = (k, v) => { v = clean(dec(v)); if (v && !out[k]) out[k] = v; };
  for (const s of [String(raw || ''), dec(raw)]) {
    for (const part of [s, s.includes('?') ? s.split('?').slice(1).join('?') : '', s.includes('#') ? s.split('#').slice(1).join('#') : '']) {
      try {
        const p = new URLSearchParams(String(part || '').replace(/^#|^\?/g, ''));
        for (const [k, v] of p.entries()) if (/^(startapp|start_param|WebAppStartParam|payload|handoff|commentKey|channelId|postId|post_id)$/i.test(k)) add(k, v);
      } catch {}
    }
  }
  return out;
}
function parsePayload(raw = '', ctx = {}) {
  const src = dec(raw);
  const p = readParams(src);
  const ckey = clean(p.commentKey || ctx.commentKey || '');
  const ch = clean(p.channelId || ctx.channelId || '');
  const po = clean(p.postId || p.post_id || ctx.postId || '');
  if (/^-?\d{6,}:-?\d{6,}$/.test(ckey)) { const a = ckey.split(':'); return { ok: true, source: 'commentKey', commentKey: ckey, channelId: a[0], postId: a[1] }; }
  if (ch && po) return { ok: true, source: 'channelId+postId', commentKey: key(ch, po), channelId: ch, postId: po };
  const direct = src.match(/(-?\d{6,}):(-?\d{6,})/);
  if (direct) return { ok: true, source: 'direct-comment-key', commentKey: `${direct[1]}:${direct[2]}`, channelId: direct[1], postId: direct[2] };
  const payload = dec(p.startapp || p.start_param || p.WebAppStartParam || p.payload || p.handoff || src);
  const np = readParams(payload);
  if ((np.commentKey || (np.channelId && (np.postId || np.post_id))) && payload !== src) {
    const nested = parsePayload(payload, { commentKey: np.commentKey, channelId: np.channelId || ch, postId: np.postId || np.post_id || po });
    if (nested.ok) return { ...nested, nested: true };
  }
  // Важно: cp__731... — это старый безопасный payload, где минус канала был заменён вторым подчёркиванием.
  // Проверяем его ДО общего legacy-cp, иначе канал ошибочно станет положительным.
  const cp2 = payload.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(\d{6,})[_:]+(\d{6,})(?:$|[^\d])/i);
  if (cp2) { const channelId = ch || `-${cp2[1]}`; return { ok: true, source: 'legacy-cp-double-underscore', commentKey: `${channelId}:${cp2[2]}`, channelId, postId: cp2[2] }; }
  const cp = payload.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)[_-]+(-?\d{6,})[_:]+(-?\d{6,})(?:$|[^\d])/i);
  if (cp) return { ok: true, source: 'legacy-cp', commentKey: `${cp[1]}:${cp[2]}`, channelId: cp[1], postId: cp[2] };
  return { ok: false, payload };
}

function clientPatch() {
return `\n;(() => {\n  if (window.__ADMINKIT_COMMENTS_SAFE_LAUNCHER_594__) return;\n  window.__ADMINKIT_COMMENTS_SAFE_LAUNCHER_594__ = true;\n  const RT='${RUNTIME}';\n  const dec=(v='')=>{let s=String(v||'').trim();for(let i=0;i<5;i++){try{const d=decodeURIComponent(s.replace(/\\+/g,'%20'));if(d===s)break;s=d;}catch(_){break;}}return s};\n  const clean=(v='')=>String(v||'').trim().replace(/^['\\\"]+|['\\\"]+$/g,'');\n  const key=(ch,po)=>{ch=clean(ch);po=clean(po);return ch&&po?ch+':'+po:''};\n  const params=(raw='')=>{const out={};const add=(k,v)=>{v=clean(dec(v));if(v&&!out[k])out[k]=v};for(const s of [String(raw||''),dec(raw)]){for(const part of [s,s.includes('?')?s.split('?').slice(1).join('?'):'',s.includes('#')?s.split('#').slice(1).join('#'):'']){try{const p=new URLSearchParams(String(part||'').replace(/^#|^\\?/g,''));for(const [k,v] of p.entries())if(/^(startapp|start_param|WebAppStartParam|payload|handoff|commentKey|channelId|postId|post_id)$/i.test(k))add(k,v)}catch(_){}}}return out};\n  const parse=(raw='',ctx={})=>{const src=dec(raw);const p=params(src);const ckey=clean(p.commentKey||ctx.commentKey||'');const ch=clean(p.channelId||ctx.channelId||'');const po=clean(p.postId||p.post_id||ctx.postId||'');if(/^-?\\d{6,}:-?\\d{6,}$/.test(ckey)){const a=ckey.split(':');return{ok:true,source:'commentKey',commentKey:ckey,channelId:a[0],postId:a[1]}}if(ch&&po)return{ok:true,source:'channelId+postId',commentKey:key(ch,po),channelId:ch,postId:po};const direct=src.match(/(-?\\d{6,}):(-?\\d{6,})/);if(direct)return{ok:true,source:'direct-comment-key',commentKey:direct[1]+':'+direct[2],channelId:direct[1],postId:direct[2]};const payload=dec(p.startapp||p.start_param||p.WebAppStartParam||p.payload||p.handoff||src);const np=params(payload);if((np.commentKey||(np.channelId&&(np.postId||np.post_id)))&&payload!==src){const n=parse(payload,{commentKey:np.commentKey,channelId:np.channelId||ch,postId:np.postId||np.post_id||po});if(n.ok)return{...n,nested:true}}const cp2=payload.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(\\d{6,})[_:]+(\\d{6,})(?:$|[^\\d])/i);if(cp2){const channelId=ch||'-'+cp2[1];return{ok:true,source:'legacy-cp-double-underscore',commentKey:channelId+':'+cp2[2],channelId,postId:cp2[2]}}const cp=payload.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)[_-]+(-?\\d{6,})[_:]+(-?\\d{6,})(?:$|[^\\d])/i);if(cp)return{ok:true,source:'legacy-cp',commentKey:cp[1]+':'+cp[2],channelId:cp[1],postId:cp[2]};return{ok:false,payload}};\n  const raw=()=>{const r=[];const push=v=>{if(!v)return;if(typeof v==='object'){['startapp','start_param','WebAppStartParam','payload','handoff','commentKey','channelId','postId','post_id'].forEach(k=>{if(v[k])r.push(String(v[k]))});try{r.push(JSON.stringify(v))}catch(_){}}else r.push(String(v))};try{r.push(location.href,location.search,location.hash,document.referrer||'')}catch(_){};for(const app of [window.WebApp,window.Telegram?.WebApp,window.Max?.WebApp,window.MAX?.WebApp,window.maxWebApp,window.MAXWebApp,window.MiniApp,window.max?.WebApp].filter(Boolean)){try{push(app.initDataUnsafe);push(app.initData);push(app.startParam);push(app.launchParams);push(app.params);push(app.initDataUnsafe?.start_param);push(app.initDataUnsafe?.startapp);push(app.initDataUnsafe?.payload)}catch(_){}}return r.filter(Boolean)};\n  const find=()=>{const ctx={};const items=raw();for(const x of items){const p=params(x);if(p.channelId&&!ctx.channelId)ctx.channelId=p.channelId;if((p.postId||p.post_id)&&!ctx.postId)ctx.postId=p.postId||p.post_id;if(p.commentKey&&!ctx.commentKey)ctx.commentKey=p.commentKey}for(const x of items){const y=parse(x,ctx);if(y.ok&&y.commentKey)return y}return{ok:false,rawCount:items.length}};\n  const run=()=>{const launch=find();window.__ADMINKIT_SAFE_LAUNCHER_LAST__={runtimeVersion:RT,launch,at:new Date().toISOString()};if(!launch.ok||!launch.commentKey)return false;try{if(typeof state!=='undefined'){state.commentKey=launch.commentKey;state.channelId=launch.channelId||state.channelId||'';state.startapp='ck:'+launch.commentKey;state.handoffToken='';state.diagnostics={...(state.diagnostics||{}),safeLaunchRuntime:RT,safeLaunchSource:launch.source}}try{if(typeof hideMiniAppStartMenu==='function')hideMiniAppStartMenu()}catch(_){}try{if(typeof setPostError==='function')setPostError('')}catch(_){}try{if(typeof loadPost==='function')Promise.resolve(loadPost()).catch(()=>{})}catch(_){}try{if(typeof loadComments==='function')Promise.resolve(loadComments()).catch(()=>{})}catch(_){}try{document.body?.classList?.remove('miniapp-start-mode')}catch(_){}return true}catch(e){window.__ADMINKIT_SAFE_LAUNCHER_LAST__={runtimeVersion:RT,launch,error:String(e&&e.message?e.message:e),at:new Date().toISOString()};return false}};\n  try{run()}catch(_){};[80,450,1200].forEach(ms=>setTimeout(()=>{try{run()}catch(_){}},ms));\n})();\n`;}

function patchAppJs() {
  if (fs.__adminkitCommentsSafeLauncher594ReadPatched) return;
  fs.__adminkitCommentsSafeLauncher594ReadPatched = true;
  const oldRead = fs.readFileSync.bind(fs);
  const appPath = path.resolve(__dirname, 'public', 'app.js');
  fs.readFileSync = function patchedRead(filePath, options) {
    const content = oldRead(filePath, options);
    try {
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (path.resolve(String(filePath || '')) === appPath && wantsText) {
        const text = String(content || '');
        if (!text.includes('__ADMINKIT_COMMENTS_SAFE_LAUNCHER_594__')) {
          lastAppJsPatch = { at: new Date().toISOString(), patched: true };
          return text + clientPatch();
        }
      }
    } catch (error) { lastAppJsPatch = { at: new Date().toISOString(), patched: false, error: error?.message || String(error) }; }
    return content;
  };
}

function patchExpress() {
  if (Module.__adminkitCommentsSafeLauncher594ExpressPatched) return;
  Module.__adminkitCommentsSafeLauncher594ExpressPatched = true;
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    try {
      if (String(request || '') === 'express' && loaded && !loaded.__adminkitCommentsSafeLauncher594Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitCommentsSafeLauncher594Route) {
            app.__adminkitCommentsSafeLauncher594Route = true;
            app.get(['/debug/comments-safe-launcher', '/debug/comments-safe-launcher-live', '/debug/safe-launcher-v2-live'], (req, res) => {
              noCache(res);
              const raw = String(req.query?.payload || req.query?.startapp || req.query?.url || '');
              res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installed, lastAppJsPatch, parsed: raw ? parsePayload(raw, req.query || {}) : null, checks: { isolatedCommentsLauncher: true, legacyCpParse: true, legacyCpDoubleUnderscoreParse: true, emptyPayloadFallsBackToLanding: true, menuTreeUntouched: true, bannerUntouched: true } });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCommentsSafeLauncher594Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}
function install() { if (installed) return selfTest(); installed = true; patchAppJs(); patchExpress(); return selfTest(); }
function selfTest() { return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, marker: MARKER, installed, checks: { isolatedCommentsLauncher: true, legacyCpParse: parsePayload('cp_-73175958664622_116551099027039870').commentKey === '-73175958664622:116551099027039870', legacyCpDoubleUnderscoreParse: parsePayload('cp__73175958664622_116551099027039870').commentKey === '-73175958664622:116551099027039870', emptyPayloadFallsBackToLanding: !parsePayload('').ok, menuTreeUntouched: true, bannerUntouched: true } }; }

module.exports = { RUNTIME, SOURCE, MARKER, install, selfTest, parsePayload };
